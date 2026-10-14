import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, PlayCircle } from 'lucide-react';
import { GameShell, SectionTitle } from '@/components/GameShell';
import { BuySeeds } from '@/components/BuySeeds';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { DAILY_REWARDS, FIELD_PART_COUNTS, GROW_STAGES, growStage, isReady, msLeft } from '@/lib/rules';
import { api } from '@/lib/api';
import { useRewardedAd } from '@/lib/use-ad';
import { CROPS, CROP_KEYS, haptic, useGame, type CropKey } from '@/lib/game';

/** Ticking clock aligned to the server's time. */
function useNow() {
  const game = useGame();
  const offset = game.state ? game.state.serverNow - Date.now() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now + offset;
}

export default function Index() {
  const game = useGame();
  const [buy, setBuy] = useState<CropKey | null>(null);
  return (
    <GameShell>
      <DailyRow />
      <section className="card-farm mb-5 p-4">
        <SectionTitle kicker="YOUR BAG" title="Seeds" />
        <div className="grid grid-cols-5 gap-2">
          {CROP_KEYS.map((k) => (
            <div key={k} className="relative flex flex-col items-center rounded-xl bg-secondary p-2">
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] font-extrabold text-primary-foreground">
                {game.state?.seeds[k] ?? 0}
              </span>
              <img src={CROPS[k].image} alt="" className="h-10 w-10" />
              <span className="text-[11px] font-bold">{CROPS[k].name}</span>
              <button type="button" className="btn-game btn-gold mt-1 w-full px-1 py-0.5 text-[10px]" onClick={() => setBuy(k)}>
                Buy
              </button>
            </div>
          ))}
        </div>
      </section>
      <BuySeeds crop={buy} onOpenChange={(o) => !o && setBuy(null)} />

      <SectionTitle kicker="YOUR LAND" title="Fields" />
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">
        Tap a field to plant, then wait or watch ads to speed up growth, then tap again to harvest.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {CROP_KEYS.map((k) => (
          <FieldCard key={k} k={k} />
        ))}
      </div>
    </GameShell>
  );
}

function DailyRow() {
  const game = useGame();
  const [busy, setBusy] = useState(false);
  const done = game.state?.daily.done ?? 0;
  const canClaim = game.state?.daily.canClaim ?? false;

  const onClaim = async () => {
    if (!game.initData) return void toast.error('Open the game inside Telegram');
    setBusy(true);
    try {
      const r = await api.post('/api/player/claim-daily', { initData: game.initData });
      game.setState(r.player);
      toast.success(`Day ${r.day}: +1 ${CROPS[r.crop].name} seed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not claim');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-farm mb-4 flex items-center gap-1 p-2">
      <div className="grid flex-1 grid-cols-7 gap-1">
        {DAILY_REWARDS.map((k, i) => (
          <div key={i} className="relative flex flex-col items-center rounded-lg bg-secondary py-1">
            <img src={CROPS[k].image} alt={CROPS[k].name} className={`h-6 w-6 ${i < done ? 'opacity-50' : ''}`} />
            {i < done && (
              <span className="absolute inset-x-0 top-0.5 flex justify-center">
                <Check className="h-5 w-5 rounded-full bg-primary p-0.5 text-primary-foreground" />
              </span>
            )}
            <span className="text-[9px] font-bold">{i + 1} Day</span>
          </div>
        ))}
      </div>
      <Button className="btn-game px-2 py-1.5 text-xs" disabled={busy || !canClaim} onClick={onClaim}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : canClaim ? 'Claim' : 'Claimed'}
      </Button>
    </div>
  );
}

function FieldCard({ k }: { k: CropKey }) {
  return (
    <div className={`card-farm p-2 ${k === 'pumpkin' ? 'col-span-2' : ''}`}>
      <div className="mb-1.5 px-1"><span className="font-display text-sm font-semibold">{CROPS[k].name} Field</span></div>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: FIELD_PART_COUNTS[k] }, (_, part) => <FieldPart key={part} k={k} part={part} />)}
      </div>
    </div>
  );
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function FieldPart({ k, part }: { k: CropKey; part: number }) {
  const game = useGame();
  const now = useNow();
  const crop = CROPS[k];
  const field = game.state?.fields[k]?.[part] ?? { planted: false, plantedAt: 0, ads: 0 };
  const ready = isReady(k, field, now);
  const stage = growStage(k, field, now);
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const onTap = async () => {
    if (busy) return;
    haptic();
    if (field.planted && !ready) return setOpen(true);
    setBusy(true);
    const res = await game.tap(k, part);
    setBusy(false);
    if (!res.ok) {
      setShake(true);
      setTimeout(() => setShake(false), 300);
      toast.error(res.message);
      return;
    }
    toast.success(res.message);
  };

  const scale = 0.45 + (0.55 * stage) / GROW_STAGES;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Button
          type="button" variant="ghost" disabled={busy}
          aria-label={`${crop.name} field part ${part + 1}: ${ready ? 'harvest' : field.planted ? 'growing' : 'plant'}`}
          onClick={onTap}
          className={`relative flex h-auto min-h-24 w-full flex-col gap-0.5 overflow-hidden rounded-lg bg-soil-gradient px-1 py-2 text-3xl shadow-inner hover:bg-soil ${shake ? 'animate-shake' : ''}`}
        >
          {field.planted && !ready && (
            <span className="rounded-full bg-background/80 px-1.5 text-[10px] font-bold tabular-nums text-foreground">
              ⏳ {fmt(msLeft(k, field, now))}
            </span>
          )}
          <span className="flex min-h-10 items-end">
            {field.planted && (
              <span key={stage} className="inline-block animate-pop-in transition-transform duration-700" style={{ transform: `scale(${scale})` }}>
                <span className={`inline-block ${ready ? 'animate-sway' : ''}`}>{stage >= GROW_STAGES ? crop.emoji : '🌱'}</span>
              </span>
            )}
          </span>
          {ready ? (
            <span className="rounded-full bg-gold-gradient px-1 py-0.5 text-[9px] font-extrabold text-gold-foreground">HARVEST</span>
          ) : !field.planted ? (
            <span className="text-[10px] font-bold text-primary-foreground">Empty</span>
          ) : null}
        </Button>
      </PopoverAnchor>
      <PopoverContent side="top" className="w-72 p-3">
        <AdPanel k={k} part={part} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function AdPanel({ k, part, onDone }: { k: CropKey; part: number; onDone: () => void }) {
  const game = useGame();
  const ad = useRewardedAd();
  const crop = CROPS[k];
  const field = game.state?.fields[k]?.[part];
  const ads = field?.ads ?? 0;
  const pct = Math.min(100, (ads / crop.adsNeed) * 100);

  const watch = async () => {
    try {
      await ad.play(k, part, async () => {
        game.setState(await game.refresh());
        toast.success(`${crop.name} grew a little 🌱`);
        onDone();
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ad could not be played');
    }
  };

  return (
    <div className="flex items-center gap-3">
      <img src={crop.image} alt={crop.name} className="h-12 w-12 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold">Watch ads to speed up growth</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] font-bold tabular-nums">{ads}/{crop.adsNeed}</span>
        </div>
        <Button className="btn-game mt-2 w-full gap-1 px-2 py-1 text-xs" disabled={ad.loading || ad.left > 0} onClick={watch}>
          {ad.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          {ad.left > 0 ? ad.timer : 'Watch Ad'}
        </Button>
      </div>
    </div>
  );
}
