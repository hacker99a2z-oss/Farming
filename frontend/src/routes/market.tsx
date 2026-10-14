import { toast } from 'sonner';
import { GameShell, SectionTitle } from '@/components/GameShell';
import { CROPS, CROP_KEYS, haptic, money, useGame } from '@/lib/game';

export default function Market() {
  const game = useGame();
  const report = async (p: Promise<{ ok: boolean; message: string }>) => {
    haptic();
    const r = await p;
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  };

  return (
    <GameShell>
      <SectionTitle kicker="TRADE" title="Sell crops" />
      <div className="space-y-3">
        {CROP_KEYS.map((k) => {
          const c = CROPS[k];
          const have = game.state?.crops[k] ?? 0;
          return (
            <div key={k} className="card-farm flex items-center gap-3 p-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary text-3xl">{c.emoji}</div>
              <div className="flex-1">
                <p className="font-display text-lg font-semibold">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  You have {have} · {money(c.sellCents)} each
                </p>
              </div>
              <div className="flex gap-1.5">
                <button className="btn-game btn-gold px-3 text-sm" disabled={have < 1} onClick={() => report(game.sell(k, 1))}>
                  Sell 1
                </button>
                <button className="btn-game px-3 text-sm" disabled={have < 1} onClick={() => report(game.sell(k, have))}>
                  All
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </GameShell>
  );
}
