// Auto payout queue (free-tier friendly).
// - Withdraw requests are saved as "pending" instantly (no waiting for the blockchain).
// - One worker at a time (Mongo lock) sends MANY payouts in ONE wallet transaction (batching),
//   so 1000 users = ~10-20 transactions instead of 1000, and no seqno collisions.
// - Each batch is confirmed by watching the wallet seqno; nothing is double-paid or lost on restarts.
import { Address, internal, toNano, beginCell, SendMode } from "@ton/core";
import { TonClient, WalletContractV4, WalletContractV5R1 } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { getDb } from "./db.server";

type Wd = {
  _id: string;
  telegramId: number;
  cents: number;
  nano: string;
  address: string;
  status: "pending" | "sending" | "sent" | "failed";
  batchId?: string;
  createdAt: Date;
  sentAt?: Date;
  error?: string;
};
type Batch = { _id: string; seqno: number; ids: string[]; sentAt: Date; status: "sending" | "done" };

const LOCK_MS = 120_000;
const RETRY_AFTER_MS = 90_000; // external message expires after 60s, so resending after 90s is safe

let walletPromise: Promise<{ contract: ReturnType<TonClient["open"]> & { getSeqno(): Promise<number>; getBalance(): Promise<bigint>; sendTransfer(a: unknown): Promise<void> }; secretKey: Buffer; max: number }> | null = null;

async function getWallet() {
  if (!walletPromise) {
    walletPromise = (async () => {
      const words = process.env["TON_WALLET_MNEMONIC"];
      if (!words) throw new Error("TON_WALLET_MNEMONIC missing");
      const key = await mnemonicToPrivateKey(words.trim().replace(/^"|"$/g, "").split(/\s+/));
      const v4 = (process.env["TON_WALLET_VERSION"] ?? "v5r1").toLowerCase() === "v4";
      const wallet = v4
        ? WalletContractV4.create({ workchain: 0, publicKey: key.publicKey })
        : WalletContractV5R1.create({ publicKey: key.publicKey });
      const apiKey = process.env["TONCENTER_API_KEY"];
      const client = new TonClient({ endpoint: "https://toncenter.com/api/v2/jsonRPC", ...(apiKey ? { apiKey } : {}) });
      // v4 allows max 4 messages per tx, v5r1 allows 255 (we use 100 to stay safe)
      return { contract: client.open(wallet) as never, secretKey: key.secretKey, max: v4 ? 4 : 100 };
    })().catch((e) => {
      walletPromise = null;
      throw e;
    });
  }
  return walletPromise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await sleep(1500 * (i + 1)); // toncenter free = 1 req/s without key
    }
  }
  throw last;
}

async function acquireLock(): Promise<boolean> {
  const db = await getDb();
  const now = new Date();
  try {
    const r = await db.collection<{ _id: string; until: Date }>("locks").findOneAndUpdate(
      { _id: "payout", until: { $lt: now } },
      { $set: { until: new Date(now.getTime() + LOCK_MS) } },
      { upsert: true, returnDocument: "after" },
    );
    return !!r;
  } catch {
    return false; // duplicate key = someone else holds the lock
  }
}
async function releaseLock() {
  const db = await getDb();
  await db.collection<{ _id: string; until: Date }>("locks").updateOne({ _id: "payout" }, { $set: { until: new Date(0) } });
}

let running = false;

/** Processes the payout queue once. Safe to call from anywhere, any number of times. */
export async function runPayouts(): Promise<{ sent: number; pending: number; note?: string }> {
  if (running) return { sent: 0, pending: -1, note: "already running" };
  running = true;
  let sent = 0;
  try {
    if (!process.env["TON_WALLET_MNEMONIC"] || !process.env["MONGODB_URI"]) return { sent: 0, pending: -1, note: "not configured" };
    if (!(await acquireLock())) return { sent: 0, pending: -1, note: "locked" };
    try {
      const db = await getDb();
      const wds = db.collection<Wd>("withdrawals");
      const batches = db.collection<Batch>("payout_batches");
      const { contract, secretKey, max } = await getWallet();

      // 1) Resolve batches that were in flight (e.g. after a restart).
      const open = await batches.find({ status: "sending" }).toArray();
      if (open.length) {
        const seqno = await withRetry(() => contract.getSeqno());
        for (const b of open) {
          if (seqno > b.seqno) {
            await wds.updateMany({ _id: { $in: b.ids }, status: "sending" }, { $set: { status: "sent", sentAt: new Date() } });
            await batches.updateOne({ _id: b._id }, { $set: { status: "done" } });
          } else if (Date.now() - b.sentAt.getTime() > RETRY_AFTER_MS) {
            // never landed and already expired -> put back in queue
            await wds.updateMany({ _id: { $in: b.ids }, status: "sending" }, { $set: { status: "pending" }, $unset: { batchId: "" } });
            await batches.updateOne({ _id: b._id }, { $set: { status: "done" } });
          } else {
            return { sent, pending: -1, note: "waiting for previous batch" };
          }
        }
      }

      // 2) Send new batches.
      for (let round = 0; round < 10; round++) {
        const list = await wds.find({ status: "pending" }).sort({ createdAt: 1 }).limit(max).toArray();
        if (!list.length) break;

        const balance = await withRetry(() => contract.getBalance());
        const reserve = toNano("0.05");
        const take: Wd[] = [];
        let total = 0n;
        for (const w of list) {
          const n = BigInt(w.nano);
          if (balance < total + n + reserve + toNano("0.01") * BigInt(take.length + 1)) break;
          take.push(w);
          total += n;
        }
        if (!take.length) return { sent, pending: list.length, note: "payout wallet low on funds" };

        const seqno = await withRetry(() => contract.getSeqno());
        const batchId = crypto.randomUUID();
        const ids = take.map((w) => w._id);
        await batches.insertOne({ _id: batchId, seqno, ids, sentAt: new Date(), status: "sending" });
        await wds.updateMany({ _id: { $in: ids }, status: "pending" }, { $set: { status: "sending", batchId } });

        await withRetry(() =>
          contract.sendTransfer({
            seqno,
            secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
            messages: take.map((w) =>
              internal({
                to: Address.parse(w.address),
                value: BigInt(w.nano),
                bounce: false,
                body: beginCell().storeUint(0, 32).storeStringTail("Farm City withdraw").endCell(),
              }),
            ),
          }),
        );

        // wait for confirmation (max ~60s)
        let ok = false;
        for (let i = 0; i < 20; i++) {
          await sleep(3000);
          const s = await withRetry(() => contract.getSeqno()).catch(() => seqno);
          if (s > seqno) {
            ok = true;
            break;
          }
        }
        if (!ok) return { sent, pending: -1, note: "batch not confirmed yet, will check next run" };
        await wds.updateMany({ _id: { $in: ids }, status: "sending" }, { $set: { status: "sent", sentAt: new Date() } });
        await batches.updateOne({ _id: batchId }, { $set: { status: "done" } });
        sent += take.length;
      }
      const pending = await wds.countDocuments({ status: "pending" });
      return { sent, pending };
    } finally {
      await releaseLock().catch(() => {});
    }
  } catch (e) {
    console.error("payout run failed", e);
    return { sent, pending: -1, note: e instanceof Error ? e.message : "error" };
  } finally {
    running = false;
  }
}

/** Fire-and-forget trigger (used right after a withdraw request). */
export function kickPayouts() {
  void runPayouts();
}

// Background loop while the server is awake (Render free sleeps after 15 min idle;
// an external free cron pinging /api/public/payout keeps it running).
const g = globalThis as { __payoutTimer?: ReturnType<typeof setInterval> };
if (!g.__payoutTimer && typeof setInterval !== "undefined") {
  g.__payoutTimer = setInterval(() => void runPayouts(), 60_000);
}
