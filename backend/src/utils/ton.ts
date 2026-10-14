import { Address } from "@ton/core";

export const MERCHANT_ADDRESS = "UQBGUz_gEQHLm2NRt9D8Y6ZWh9b-20-EgNZxDNdrzQryX_AX";
const TONAPI = "https://tonapi.io/v2";

const apiHeaders = (): Record<string, string> => {
  const key = process.env["TONCENTER_API_KEY"];
  return key ? { "Authorization": `Bearer ${key}` } : {};
};

/** Live price of 1 Gram (TON) in USD. */
export async function getTonUsd(): Promise<number> {
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd");
  if (r.ok) {
    const j = (await r.json()) as { "the-open-network"?: { usd?: number } };
    const p = j["the-open-network"]?.usd;
    if (p && p > 0) return p;
  }
  const r2 = await fetch("https://tonapi.io/v2/rates?tokens=ton&currencies=usd");
  const j2 = (await r2.json()) as { rates?: { TON?: { prices?: { USD?: number } } } };
  const p2 = j2.rates?.TON?.prices?.USD;
  if (!p2) throw new Error("Price unavailable, try again");
  return p2;
}

type Tx = { hash: string; in_msg?: { value: string; message?: string; source?: string } };

/** Finds an incoming payment to the merchant wallet with this comment and at least `minNano`. */
export async function findPayment(comment: string, minNano: bigint): Promise<string | null> {
  const r = await fetch(`${TONAPI}/blockchain/accounts/${MERCHANT_ADDRESS}/transactions?limit=100`, { headers: apiHeaders() });
  if (!r.ok) return null;
  const j = (await r.json()) as { transactions?: Tx[] };
  // allow 2% slippage tolerance for wallet rounding
  const min = (minNano * 98n) / 100n;
  const tx = j.transactions?.find((t) => t.in_msg?.message === comment && BigInt(t.in_msg.value || "0") >= min);
  return tx ? tx.hash : null;
}

export function normalizeAddress(raw: string): string {
  return Address.parse(raw).toString({ bounceable: false });
}

