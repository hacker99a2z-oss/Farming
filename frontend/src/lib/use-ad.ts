import { useEffect, useState, useRef } from 'react';
import { ADSGRAM_BLOCK_ID } from './ads';
import { useGame } from './game';
import { api } from './api';
import type { CropKey } from './rules';

type AdController = {
  show: () => Promise<{ done: boolean; description: string; state: string; error: boolean }>;
};

/** Shared rewarded-ad logic: 3-minute cooldown timer + Adsgram playback with server-side verification. */
export function useRewardedAd() {
  const game = useGame();
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const nextAdAt = game.state?.nextAdAt ?? null;
  const left = nextAdAt ? Math.max(0, nextAdAt - now) : 0;
  const AdControllerRef = useRef<AdController | undefined>(undefined);

  // Initialize AdsGram controller once
  useEffect(() => {
    const sdk = (window as unknown as { Adsgram?: { init: (o: { blockId: string }) => AdController } }).Adsgram;
    if (sdk) {
      AdControllerRef.current = sdk.init({ blockId: ADSGRAM_BLOCK_ID });
    }
  }, []);

  useEffect(() => {
    if (!left) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [left]);

  const secs = Math.ceil(left / 1000);
  const timer = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  /** Plays an ad; after successful watch, calls reward endpoint for verification. */
  const play = async (crop: CropKey, part: number, onDone: () => Promise<void>) => {
    if (loading || left) return;
    if (!game.initData) throw new Error('Open the game inside Telegram');
    if (!game.user.id) throw new Error('User ID not available');

    if (!AdControllerRef.current) throw new Error('Ads are not available right now');
    setLoading(true);
    try {
      // Show the ad
      const result = await AdControllerRef.current.show();
      if (!result.done) throw new Error('Watch the ad till the end to speed up growth');

      // Call backend API for ad reward
      await api.post('/api/player/claim-ad', { initData: game.initData, crop, part });

      await onDone();
      setNow(Date.now());
    } catch (result) {
      // Error during ad playback - user didn't watch till end or ad failed
      throw new Error(result instanceof Error ? result.message : 'Ad playback failed');
    } finally {
      setLoading(false);
    }
  };

  return { loading, left, timer, play };
}
