import { Request, Response } from 'express';
import { getDb } from '../utils/db';
import { verifyInitData } from '../utils/tg';
import {
  CROP_KEYS,
  WITHDRAWAL_HISTORY_LIMIT,
  DAILY_REWARDS,
  DAILY_SEEDS,
  fieldParts,
  isFieldPart,
  isReady,
  dailyStatus,
  dayKey,
  CROP_RULES,
  MIN_WITHDRAW_CENTS,
  MIN_SEED_BUY,
  MAX_SEED_BUY,
  AD_COOLDOWN_MS,
  seedPriceCents,
  referralRewardCents,
  tonNanoForUsd,
  type CropKey,
  type PlayerView,
} from '../utils/rules';
import { getTonUsd, MERCHANT_ADDRESS, findPayment, normalizeAddress } from '../utils/ton';
import { kickPayouts } from '../utils/payout';

type PlayerDoc = {
  _id: number;
  firstName: string;
  username: string | null;
  photoUrl: string | null;
  balanceCents: number;
  seeds?: Partial<Record<CropKey, number>>;
  crops: Record<CropKey, number>;
  fields: Record<CropKey, unknown>;
  daily?: { streak: number; lastDay: number | null };
  referredBy: number | null;
  referralCount: number;
  referralEarnedCents: number;
  lastAdAt?: Date;
  createdAt: Date;
};

const isCrop = (k: unknown): k is CropKey => typeof k === 'string' && (CROP_KEYS as string[]).includes(k);

async function ctx(initData: string) {
  const tg = await verifyInitData(initData);
  const db = await getDb();
  return { tg, db, players: db.collection<PlayerDoc>('players') };
}

const parts = (p: PlayerDoc, k: CropKey) => fieldParts(k, p.fields?.[k] as never);

async function view(db: Awaited<ReturnType<typeof ctx>>['db'], p: PlayerDoc): Promise<PlayerView> {
  const w = await db
    .collection<{ _id: string; telegramId: number; cents: number; address: string; status: string; createdAt: Date }>('withdrawals')
    .find({ telegramId: p._id })
    .sort({ createdAt: -1 })
    .limit(WITHDRAWAL_HISTORY_LIMIT)
    .toArray();
  const now = Date.now();
  return {
    balanceCents: p.balanceCents,
    seeds: Object.fromEntries(CROP_KEYS.map((k) => [k, p.seeds?.[k] ?? 0])) as Record<CropKey, number>,
    crops: p.crops,
    fields: Object.fromEntries(CROP_KEYS.map((k) => [k, parts(p, k)])) as Record<CropKey, any>,
    daily: dailyStatus(p.daily, now),
    referralCount: p.referralCount,
    referralEarnedCents: p.referralEarnedCents,
    nextAdAt: p.lastAdAt ? p.lastAdAt.getTime() + AD_COOLDOWN_MS : null,
    serverNow: now,
    withdrawals: w.map((x) => ({ id: String(x._id), cents: x.cents, address: x.address, status: x.status, date: x.createdAt.toISOString() })),
  };
}

export const loadPlayer = async (req: Request, res: Response) => {
  try {
    const { initData } = req.body;
    if (typeof initData !== 'string' || initData.length > 4096) throw new Error('Invalid input');

    const { tg, db, players } = await ctx(initData);
    const existing = await players.findOneAndUpdate(
      { _id: tg.id },
      { $set: { firstName: tg.first_name, username: tg.username ?? null, photoUrl: tg.photo_url ?? null } },
      { returnDocument: 'after' },
    );
    if (existing) return res.json(await view(db, existing));

    const m = tg.start_param?.match(/^ref_(\d+)$/);
    let refId = m && Number(m[1]) !== tg.id ? Number(m[1]) : null;
    if (!refId) {
      const saved = await db.collection<{ _id: number; ref: number }>('start_refs').findOne({ _id: tg.id });
      if (saved && saved.ref !== tg.id) refId = saved.ref;
    }
    let referredBy: number | null = null;
    if (refId) {
      const r = await players.updateOne({ _id: refId }, { $inc: { referralCount: 1 } });
      if (r.matchedCount) referredBy = refId;
    }

    const doc: PlayerDoc = {
      _id: tg.id,
      firstName: tg.first_name,
      username: tg.username ?? null,
      photoUrl: tg.photo_url ?? null,
      balanceCents: 0,
      seeds: Object.fromEntries(CROP_KEYS.map((k) => [k, 0])) as Partial<Record<CropKey, number>>,
      crops: Object.fromEntries(CROP_KEYS.map((k) => [k, 0])) as Record<CropKey, number>,
      fields: Object.fromEntries(CROP_KEYS.map((k) => [k, fieldParts(k)])) as Record<CropKey, unknown>,
      daily: { streak: 0, lastDay: null },
      referredBy,
      referralCount: 0,
      referralEarnedCents: 0,
      createdAt: new Date(),
    };
    try {
      await players.insertOne(doc);
    } catch {
      /* concurrent first load */
    }
    return res.json(await view(db, (await players.findOne({ _id: tg.id }))!));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
  }
};

export const tapField = async (req: Request, res: Response) => {
  try {
    const { initData, crop, part } = req.body;
    if (typeof initData !== 'string' || initData.length > 4096) throw new Error('Invalid input');
    if (!isCrop(crop)) throw new Error('Invalid field');
    if (!isFieldPart(crop, part)) throw new Error('Invalid field part');

    const { tg, db, players } = await ctx(initData);
    const k = crop;
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = await players.findOne({ _id: tg.id });
      if (!p) throw new Error('Player not found');
      const list = parts(p, k);
      const f = list[part]!;
      const now = Date.now();
      const filter = { _id: tg.id, [`fields.${k}`]: p.fields?.[k] ?? { $exists: false } } as never;
      if (!f.planted) {
        if ((p.seeds?.[k] ?? 0) < 1) return res.json({ ok: false, message: `No ${k} seeds — claim daily or buy seeds`, player: await view(db, p) });
        list[part] = { planted: true, plantedAt: now, ads: 0 };
        const resUpdate = await players.findOneAndUpdate({ ...(filter as object), [`seeds.${k}`]: { $gte: 1 } } as never, { $set: { [`fields.${k}`]: list }, $inc: { [`seeds.${k}`]: -1 } }, { returnDocument: 'after' });
        if (resUpdate) return res.json({ ok: true, message: 'planted', player: await view(db, resUpdate) });
        continue;
      }
      if (!isReady(k, f, now)) return res.json({ ok: false, message: 'growing', player: await view(db, p) });
      list[part] = { planted: false, plantedAt: 0, ads: 0 };
      const resUpdate = await players.findOneAndUpdate(filter, { $set: { [`fields.${k}`]: list }, $inc: { [`crops.${k}`]: 1 } }, { returnDocument: 'after' });
      if (resUpdate) return res.json({ ok: true, message: 'harvested', player: await view(db, resUpdate) });
    }
    throw new Error('Busy, try again');
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
  }
};

export const claimFieldAd = async (req: Request, res: Response) => {
  try {
    const { initData, crop, part } = req.body;
    if (typeof initData !== 'string' || initData.length > 4096) throw new Error('Invalid input');
    if (!isCrop(crop)) throw new Error('Invalid field');
    if (!isFieldPart(crop, part)) throw new Error('Invalid field part');

    const { tg, db, players } = await ctx(initData);
    const k = crop;
    for (let attempt = 0; attempt < 3; attempt++) {
      const p = await players.findOne({ _id: tg.id });
      if (!p) throw new Error('Player not found');
      const now = Date.now();
      if (p.lastAdAt && p.lastAdAt.getTime() + AD_COOLDOWN_MS > now) throw new Error('Please wait for the timer to finish');
      const list = parts(p, k);
      const f = list[part]!;
      if (!f.planted) throw new Error('Plant a seed first');
      if (isReady(k, f, now)) throw new Error('Already fully grown — tap to harvest');
      list[part] = { ...f, ads: Math.min(CROP_RULES[k].adsNeed, f.ads + 1) };
      const resUpdate = await players.findOneAndUpdate(
        { _id: tg.id, [`fields.${k}`]: p.fields?.[k] ?? { $exists: false }, lastAdAt: p.lastAdAt ?? { $exists: false } } as never,
        { $set: { [`fields.${k}`]: list, lastAdAt: new Date(now) } },
        { returnDocument: 'after' },
      );
      if (resUpdate) return res.json(await view(db, resUpdate));
    }
    throw new Error('Busy, try again');
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
  }
};

export const claimDaily = async (req: Request, res: Response) => {
  try {
    const { initData } = req.body;
    if (typeof initData !== 'string' || initData.length > 4096) throw new Error('Invalid input');

    const { tg, db, players } = await ctx(initData);
    const p = await players.findOne({ _id: tg.id });
    if (!p) throw new Error('Player not found');
    const now = Date.now();
    const st = dailyStatus(p.daily, now);
    if (!st.canClaim) throw new Error('Already claimed today — come back tomorrow');
    const day = st.done + 1;
    const crop = DAILY_REWARDS[day - 1]!;
    const resUpdate = await players.findOneAndUpdate(
      { _id: tg.id },
      { $set: { daily: { streak: day, lastDay: dayKey(now) } }, $inc: { [`seeds.${crop}`]: DAILY_SEEDS } },
      { returnDocument: 'after' },
    );
    if (!resUpdate) throw new Error('Already claimed today');
    return res.json({ day, crop, player: await view(db, resUpdate) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
  }
};

export const sellCrops = async (req: Request, res: Response) => {
  try {
    const { initData, crop, qty } = req.body;
    if (typeof initData !== 'string' || initData.length > 4096) throw new Error('Invalid input');
    if (!isCrop(crop)) throw new Error('Invalid crop');
    if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) throw new Error('Invalid amount');

    const { tg, db, players } = await ctx(initData);
    const earn = CROP_RULES[crop].sellCents * qty;
    const resUpdate = await players.findOneAndUpdate(
      { _id: tg.id, [`crops.${crop}`]: { $gte: qty } },
      { $inc: { [`crops.${crop}`]: -qty, balanceCents: earn } },
      { returnDocument: 'after' },
    );
    if (!resUpdate) throw new Error('Not enough crops');
    return res.json({ earnedCents: earn, player: await view(db, resUpdate) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
  }
};

export const withdraw = async (req: Request, res: Response) => {
  try {
    const { initData, cents, address } = req.body;
    if (typeof initData !== 'string' || initData.length > 4096) throw new Error('Invalid input');
    if (!Number.isInteger(cents) || cents < MIN_WITHDRAW_CENTS || cents > 10_000_000) throw new Error('Minimum withdraw is $0.10');
    if (typeof address !== 'string' || address.length > 100) throw new Error('Connect your Tonkeeper wallet');

    const { tg, db, players } = await ctx(initData);
    let normalizedAddress: string;
    try {
      normalizedAddress = normalizeAddress(address);
    } catch {
      throw new Error('Invalid wallet address');
    }
    const price = await getTonUsd();
    const nano = tonNanoForUsd(cents, price);
    const resUpdate = await players.findOneAndUpdate({ _id: tg.id, balanceCents: { $gte: cents } }, { $inc: { balanceCents: -cents } });
    if (!resUpdate) throw new Error('Not enough balance');

    await db.collection('withdrawals').insertOne({
      _id: crypto.randomUUID() as never,
      telegramId: tg.id,
      cents,
      nano: nano.toString(),
      address: normalizedAddress,
      status: 'pending',
      createdAt: new Date(),
    });
    kickPayouts();
    return res.json({ player: await view(db, (await players.findOne({ _id: tg.id }))!) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
  }
};

export const getGramQuote = async (req: Request, res: Response) => {
  try {
    const price = await getTonUsd();
    return res.json({ tonUsd: price, nanoPerDollar: tonNanoForUsd(100, price).toString() });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
  }
};

export const createSeedOrder = async (req: Request, res: Response) => {
  try {
    const { initData, crop, qty } = req.body;
    if (typeof initData !== 'string' || initData.length > 4096) throw new Error('Invalid input');
    if (!isCrop(crop)) throw new Error('Invalid seed');
    if (!Number.isInteger(qty) || qty < MIN_SEED_BUY || qty > MAX_SEED_BUY) throw new Error(`Buy at least ${MIN_SEED_BUY} seeds`);

    const { tg, db } = await ctx(initData);
    const price = await getTonUsd();
    const nano = tonNanoForUsd(seedPriceCents(crop, qty), price).toString();
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const comment = `FC-${id}`;
    await db.collection('orders').insertOne({ _id: id as never, telegramId: tg.id, crop, qty, nano, comment, status: 'pending', createdAt: new Date() });
    return res.json({ orderId: id, address: MERCHANT_ADDRESS, nano, comment });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
  }
};

export const confirmSeedOrder = async (req: Request, res: Response) => {
  try {
    const { initData, orderId } = req.body;
    if (typeof initData !== 'string' || initData.length > 4096) throw new Error('Invalid input');
    if (typeof orderId !== 'string' || !/^[a-f0-9]{16}$/.test(orderId)) throw new Error('Invalid order');

    const { tg, db, players } = await ctx(initData);
    const orders = db.collection<{ _id: string; telegramId: number; crop?: CropKey; qty?: number; nano: string; comment: string; status: string; txHash?: string }>('orders');
    const order = await orders.findOne({ _id: orderId, telegramId: tg.id });
    if (!order) throw new Error('Order not found');
    if (order.status === 'paid') return res.json({ paid: true, player: await view(db, (await players.findOne({ _id: tg.id }))!) });
    if (!order.crop || !order.qty) throw new Error('Old order type');
    const hash = await findPayment(order.comment, BigInt(order.nano));
    if (!hash) return res.json({ paid: false, player: null });
    const used = await orders.findOne({ txHash: hash });
    if (used) throw new Error('Payment already used');
    const claim = await orders.updateOne({ _id: order._id, status: 'pending' }, { $set: { status: 'paid', txHash: hash, paidAt: new Date() } });
    if (claim.modifiedCount) {
      const me = await players.findOneAndUpdate({ _id: tg.id }, { $inc: { [`seeds.${order.crop}`]: order.qty } }, { returnDocument: 'after' });
      const reward = referralRewardCents(seedPriceCents(order.crop, order.qty));
      if (me?.referredBy && reward > 0) await players.updateOne({ _id: me.referredBy }, { $inc: { balanceCents: reward, referralEarnedCents: reward } });
    }
    return res.json({ paid: true, player: await view(db, (await players.findOne({ _id: tg.id }))!) });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
  }
};
