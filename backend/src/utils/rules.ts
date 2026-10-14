// Shared game rules (client + server). Money is stored in whole cents.
export type CropKey = "wheat" | "corn" | "carrot" | "tomato" | "pumpkin";
export const CROP_KEYS: CropKey[] = ["wheat", "corn", "carrot", "tomato", "pumpkin"];

/** adsNeed: ads that fully grow one plant. seedPrice10: price in cents for 10 seeds. */
export const CROP_RULES: Record<CropKey, { adsNeed: number; sellCents: number; seedPrice10: number }> = {
  wheat: { adsNeed: 10, sellCents: 1, seedPrice10: 1 },
  corn: { adsNeed: 20, sellCents: 2, seedPrice10: 2 },
  carrot: { adsNeed: 28, sellCents: 3, seedPrice10: 2.8 },
  tomato: { adsNeed: 36, sellCents: 4, seedPrice10: 3.6 },
  pumpkin: { adsNeed: 45, sellCents: 5, seedPrice10: 4.5 },
};

export const MIN_WITHDRAW_CENTS = 10;
export const REFERRAL_PERCENT = 10;
export const MIN_SEED_BUY = 10;
export const MAX_SEED_BUY = 1_000_000;
export const AD_COOLDOWN_MS = 3 * 60 * 1000;
export const GROW_MS = 72 * 60 * 60 * 1000;
export const GROW_STAGES = 10;

/** Weekly daily-reward row: day 1..7 -> seed given (1 each). */
export const DAILY_REWARDS: CropKey[] = ["wheat", "wheat", "corn", "corn", "carrot", "tomato", "pumpkin"];
export const DAILY_SEEDS = 1;

export const seedPriceCents = (k: CropKey, qty: number) => (qty * CROP_RULES[k].seedPrice10) / 10;
export const sellValueCents = (k: CropKey, qty: number) => CROP_RULES[k].sellCents * qty;
export const referralRewardCents = (paidCents: number) => Math.floor((paidCents * REFERRAL_PERCENT) / 100);
export const tonNanoForUsd = (cents: number, tonUsd: number) => BigInt(Math.ceil(((cents / 100) / tonUsd) * 1e9));

export type Field = { planted: boolean; plantedAt: number; ads: number };
export const FIELD_PART_COUNTS: Record<CropKey, number> = { wheat: 2, corn: 2, carrot: 2, tomato: 2, pumpkin: 4 };
export const WITHDRAWAL_HISTORY_LIMIT = 5;
const EMPTY: Field = { planted: false, plantedAt: 0, ads: 0 };

type Saved = { planted?: boolean; plantedAt?: number; ads?: number; watered?: boolean };
export function fieldParts(k: CropKey, saved?: Saved | Saved[]): Field[] {
  const parts = Array.isArray(saved) ? saved : saved ? [saved] : [];
  return Array.from({ length: FIELD_PART_COUNTS[k] }, (_, i) => {
    const p = parts[i];
    if (!p?.planted) return { ...EMPTY };
    // Legacy plants (from the water version) have no plantedAt: treat them as fully grown.
    return { planted: true, plantedAt: typeof p.plantedAt === "number" ? p.plantedAt : 0, ads: p.ads ?? 0 };
  });
}
export function isFieldPart(k: CropKey, part: unknown): part is number {
  return typeof part === "number" && Number.isInteger(part) && part >= 0 && part < FIELD_PART_COUNTS[k];
}
export function latestWithdrawals<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, WITHDRAWAL_HISTORY_LIMIT);
}

/** Growth 0..1: waiting time and watched ads both add progress. */
export function growth(k: CropKey, f: Field, now: number): number {
  if (!f.planted) return 0;
  return Math.min(1, Math.max(0, (now - f.plantedAt) / GROW_MS) + f.ads / CROP_RULES[k].adsNeed);
}
export const growStage = (k: CropKey, f: Field, now: number) => Math.floor(growth(k, f, now) * GROW_STAGES + 1e-9);
export const isReady = (k: CropKey, f: Field, now: number) => f.planted && growth(k, f, now) >= 1;
export const msLeft = (k: CropKey, f: Field, now: number) => Math.ceil((1 - growth(k, f, now)) * GROW_MS);

/** UTC day key "YYYY-MM-DD". */
export const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
export type Daily = { streak: number; lastDay: string | null };
/** Days already ticked in the current week (0..7) and whether today's claim is open. */
export function dailyStatus(d: Daily | undefined, now: number): { done: number; canClaim: boolean } {
  const today = dayKey(now);
  const yesterday = dayKey(now - 86_400_000);
  if (!d?.lastDay) return { done: 0, canClaim: true };
  if (d.lastDay === today) return { done: d.streak, canClaim: false };
  if (d.lastDay === yesterday && d.streak < 7) return { done: d.streak, canClaim: true };
  return { done: 0, canClaim: true }; // missed a day or finished the week -> restart
}

export type PlayerView = {
  balanceCents: number;
  seeds: Record<CropKey, number>;
  crops: Record<CropKey, number>;
  fields: Record<CropKey, Field[]>;
  daily: { done: number; canClaim: boolean };
  referralCount: number;
  referralEarnedCents: number;
  nextAdAt: number | null;
  serverNow: number;
  withdrawals: { id: string; cents: number; address: string; status: string; date: string }[];
};
