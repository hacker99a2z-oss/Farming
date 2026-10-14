import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import wheatImg from '@/assets/wheat-seed.svg';
import cornImg from '@/assets/corn-seed.svg';
import carrotImg from '@/assets/carrot-seed.svg';
import tomatoImg from '@/assets/tomato-seed.svg';
import pumpkinImg from '@/assets/pumpkin-seed.svg';
import { CROP_KEYS, CROP_RULES, type CropKey, type PlayerView } from './rules';
import { api } from './api';

export { CROP_KEYS, type CropKey };

export const CROPS: Record<CropKey, { name: string; emoji: string; image: string; adsNeed: number; sellCents: number; seedPrice10: number }> = {
  wheat: { name: 'Wheat', emoji: '🌾', image: wheatImg, ...pick('wheat') },
  corn: { name: 'Corn', emoji: '🌽', image: cornImg, ...pick('corn') },
  carrot: { name: 'Carrot', emoji: '🥕', image: carrotImg, ...pick('carrot') },
  tomato: { name: 'Tomato', emoji: '🍅', image: tomatoImg, ...pick('tomato') },
  pumpkin: { name: 'Pumpkin', emoji: '🎃', image: pumpkinImg, ...pick('pumpkin') },
};
function pick(k: CropKey) {
  return CROP_RULES[k];
}

export type TgUser = { id: number | null; name: string; username?: string | undefined; photoUrl?: string | undefined };
type Result = { ok: boolean; message: string };

type GameCtx = {
  state: PlayerView | null;
  user: TgUser;
  initData: string;
  error: string | null;
  setState: (p: PlayerView) => void;
  refresh: () => Promise<PlayerView>;
  tap: (k: CropKey, part: number) => Promise<Result>;
  sell: (k: CropKey, qty: number) => Promise<Result>;
  withdraw: (cents: number, address: string) => Promise<Result>;
};

const Ctx = createContext<GameCtx | null>(null);

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  initData?: string;
  initDataUnsafe?: { user?: { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string } };
  HapticFeedback?: { impactOccurred: (s: string) => void };
};
const getTg = (): TelegramWebApp | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;

export const haptic = () => getTg()?.HapticFeedback?.impactOccurred('light');
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerView | null>(null);
  const [user, setUser] = useState<TgUser>({ id: null, name: 'Farmer' });
  const [initData, setInitData] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tg = getTg();
    tg?.ready();
    tg?.expand();
    const u = tg?.initDataUnsafe?.user;
    if (u) setUser({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' '), username: u.username, photoUrl: u.photo_url });
    const d = tg?.initData ?? '';
    setInitData(d);
    if (!d) {
      setError('Open the game inside Telegram to play');
      return;
    }
    api.post('/api/player/load', { initData }).then(setState, (e) => setError(errMsg(e)));
  }, []);

  const tap = useCallback(
    async (k: CropKey, part: number): Promise<Result> => {
      if (!initData) return { ok: false, message: 'Open the game inside Telegram' };
      try {
        const r = await api.post('/api/player/tap', { initData, crop: k, part });
        setState(r.player);
        const name = CROPS[k].name;
        const msg = r.ok ? (r.message === 'planted' ? `${name} planted! 🌱` : `Harvested 1 ${name}!`) : r.message;
        return { ok: r.ok, message: msg };
      } catch (e) {
        return { ok: false, message: errMsg(e) };
      }
    },
    [initData],
  );

  const value = useMemo<GameCtx>(
    () => ({
      state,
      user,
      initData,
      error,
      setState,
      refresh: async () => {
        if (!initData) throw new Error('Open the game inside Telegram');
        const r = await api.post('/api/player/load', { initData });
        setState(r);
        return r;
      },
      tap,
      sell: async (k, qty) => {
        if (!initData) return { ok: false, message: 'Open the game inside Telegram' };
        try {
          const r = await api.post('/api/player/sell', { initData, crop: k, qty });
          setState(r.player);
          return { ok: true, message: `Sold for ${money(r.earnedCents)}` };
        } catch (e) {
          return { ok: false, message: errMsg(e) };
        }
      },
      withdraw: async (cents, address) => {
        if (!initData) return { ok: false, message: 'Open the game inside Telegram' };
        try {
          const r = await api.post('/api/player/withdraw', { initData, cents, address });
          setState(r.player);
          return { ok: true, message: 'Withdraw queued — arrives in about 1 minute' };
        } catch (e) {
          return { ok: false, message: errMsg(e) };
        }
      },
    }),
    [state, user, initData, error, tap],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useGame must be inside GameProvider');
  return c;
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
