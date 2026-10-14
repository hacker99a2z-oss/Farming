import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { CROPS, useGame, type CropKey } from '@/lib/game';
import { MIN_SEED_BUY, MAX_SEED_BUY, seedPriceCents } from '@/lib/rules';
import { commentPayload, getWallet } from '@/lib/wallet';

export function BuySeeds({ crop, onOpenChange }: { crop: CropKey | null; onOpenChange: (o: boolean) => void }) {
  const game = useGame();
  const open = crop !== null;
  const [perDollar, setPerDollar] = useState<number | null>(null);
  const [amount, setAmount] = useState(String(MIN_SEED_BUY));
  const qty = Math.floor(Number(amount) || 0);
  const valid = qty >= MIN_SEED_BUY && qty <= MAX_SEED_BUY;
  const cents = crop && valid ? seedPriceCents(crop, qty) : 0;
  const gram = perDollar === null ? null : perDollar < 0 ? '—' : ((perDollar * cents) / 100).toFixed(4);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    setAmount(String(MIN_SEED_BUY));
    setPerDollar(null);
    void api.get('/api/player/quote').then((q) => setPerDollar(Number(q.nanoPerDollar) / 1e9), () => setPerDollar(-1));
  }, [open]);

  const buy = async () => {
    if (!crop) return;
    if (!game.initData) return void toast.error('Open the game inside Telegram');
    if (!valid) return void toast.error(`Buy at least ${MIN_SEED_BUY} seeds`);
    setBusy(true);
    try {
      const ui = await getWallet();
      if (!ui.connected) {
        await ui.openModal();
        toast.message('Connect Tonkeeper, then tap Buy again');
        return;
      }
      const order = await api.post('/api/player/create-order', { initData: game.initData, crop, qty });
      await ui.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: order.address, amount: order.nano, payload: await commentPayload(order.comment) }],
      });
      toast.message('Payment sent, confirming…');
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const r = await api.post('/api/player/confirm-order', { initData: game.initData, orderId: order.orderId });
        if (r.paid && r.player) {
          game.setState(r.player);
          toast.success(`+${qty.toLocaleString('en-US')} ${CROPS[crop].name} seeds added`);
          onOpenChange(false);
          return;
        }
      }
      toast.error('Payment not confirmed yet. Seeds will be added once it arrives — reopen this later.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment cancelled');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Buy {crop ? CROPS[crop].name : ''} seeds</DialogTitle>
          <DialogDescription>Pay with Gram from your Tonkeeper wallet.</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-secondary p-4 text-center">
          {crop && <img src={CROPS[crop].image} alt="" className="mx-auto h-12 w-12" />}
          <label className="mt-2 block text-xs font-bold text-muted-foreground">How many seeds? (min {MIN_SEED_BUY})</label>
          <input
            type="number" inputMode="numeric" min={MIN_SEED_BUY} step={10} value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-center font-display text-2xl font-bold"
          />
          <div className="mt-2 flex justify-center gap-2">
            {[10, 50, 100, 500].map((n) => (
              <button key={n} type="button" className="rounded-full bg-background px-3 py-1 text-xs font-bold" onClick={() => setAmount(String(n))}>
                {n}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">
            ${(cents / 100).toFixed(4)} ≈ {gram ?? '…'} Gram
          </p>
          {crop && <p className="text-[11px] text-muted-foreground">10 seeds = ${(CROPS[crop].seedPrice10 / 100).toFixed(3)}</p>}
          {!valid && <p className="text-xs font-semibold text-destructive">Minimum {MIN_SEED_BUY} seeds</p>}
        </div>
        <button className="btn-game btn-gold w-full" disabled={busy || !gram || !valid} onClick={buy}>
          {busy ? 'Processing…' : 'Buy'}
        </button>
      </DialogContent>
    </Dialog>
  );
}
