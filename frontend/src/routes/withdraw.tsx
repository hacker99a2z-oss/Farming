import { useState } from 'react';
import { toast } from 'sonner';
import { GameShell, SectionTitle } from '@/components/GameShell';
import { Button } from '@/components/ui/button';
import { latestWithdrawals } from '@/lib/rules';
import { money, useGame } from '@/lib/game';
import { MIN_WITHDRAW_CENTS } from '@/lib/rules';
import { getWallet, shortAddr, useWalletAddress } from '@/lib/wallet';

// These should come from environment variables
const PAYMENTS_PROOF_URL = import.meta.env.VITE_PAYMENTS_PROOF_URL || '';
const CONTACT_SUPPORT_URL = import.meta.env.VITE_CONTACT_SUPPORT_URL || '';

export default function Withdraw() {
  const game = useGame();
  const history = latestWithdrawals(game.state?.withdrawals ?? []);
  const address = useWalletAddress();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const balance = game.state?.balanceCents ?? 0;
  const pct = Math.min(100, (balance / MIN_WITHDRAW_CENTS) * 100);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) { toast.error('Connect your Tonkeeper wallet first'); return; }
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents < MIN_WITHDRAW_CENTS) { toast.error(`Minimum withdraw is ${money(MIN_WITHDRAW_CENTS)}`); return; }
    if (cents > balance) { toast.error('Not enough balance'); return; }
    setBusy(true);
    const r = await game.withdraw(cents, address);
    setBusy(false);
    if (r.ok) {
      toast.success(r.message);
      setAmount('');
    } else toast.error(r.message);
  };

  return (
    <GameShell>
      <SectionTitle kicker="CASH OUT" title="Withdraw" />
      <section className="card-farm mb-4 p-4">
        <p className="text-xs font-bold text-muted-foreground">PROGRESS TO MINIMUM</p>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-gold-gradient" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-sm font-semibold">
          {money(balance)} / {money(MIN_WITHDRAW_CENTS)}
        </p>
      </section>

      <form onSubmit={submit} className="card-farm mb-4 space-y-3 p-4">
        <div className="flex items-center gap-2 rounded-xl bg-secondary p-3">
          <span className="flex-1 text-sm font-semibold">{address ? `Tonkeeper: ${shortAddr(address)}` : 'Tonkeeper not connected'}</span>
          <button
            type="button"
            className="btn-game px-3 py-1.5 text-sm"
            onClick={async () => {
              const ui = await getWallet();
              if (ui.connected) await ui.disconnect();
              else await ui.openModal();
            }}
          >
            {address ? 'Disconnect' : 'Connect'}
          </button>
        </div>
        <input
          className="w-full rounded-xl border-2 border-input bg-background px-3 py-2.5 font-semibold outline-none focus:border-ring"
          placeholder={`Amount in $ (min ${money(MIN_WITHDRAW_CENTS)})`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
        />
        <button className="btn-game btn-gold w-full" disabled={busy || balance < MIN_WITHDRAW_CENTS || !address}>
          {busy ? 'Sending…' : 'Withdraw'}
        </button>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {PAYMENTS_PROOF_URL ? <Button asChild className="btn-game h-auto whitespace-normal px-2 text-sm"><a href={PAYMENTS_PROOF_URL} target="_blank" rel="noopener noreferrer">Payments' proof</a></Button>
          : <Button disabled className="btn-game h-auto whitespace-normal px-2 text-sm">Payments' proof</Button>}
        {CONTACT_SUPPORT_URL ? <Button asChild className="btn-game h-auto whitespace-normal px-2 text-sm"><a href={CONTACT_SUPPORT_URL} target="_blank" rel="noopener noreferrer">Contact support</a></Button>
          : <Button disabled className="btn-game h-auto whitespace-normal px-2 text-sm">Contact support</Button>}
      </div>
      <h3 className="mb-2 text-lg font-semibold">History</h3>
      {!history.length ? (
        <p className="card-farm p-4 text-center text-sm text-muted-foreground">No withdrawals yet</p>
      ) : (
        <div className="space-y-2">
          {history.map((w) => (
            <div key={w.id} className="card-farm flex items-center justify-between p-3">
              <div>
                <p className="font-display font-semibold">{money(w.cents)}</p>
                <p className="text-xs text-muted-foreground">Tonkeeper · {shortAddr(w.address)}</p>
              </div>
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold capitalize text-accent-foreground">{w.status}</span>
            </div>
          ))}
        </div>
      )}
    </GameShell>
  );
}
