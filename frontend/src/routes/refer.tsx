import { Copy, Send } from 'lucide-react';
import { toast } from 'sonner';
import { GameShell, SectionTitle } from '@/components/GameShell';
import { money, useGame } from '@/lib/game';
import { REFERRAL_PERCENT } from '@/lib/rules';

// Replace with your real bot username.
const BOT_USERNAME = 'FarmerCityBot';

export default function Refer() {
  const { user, state } = useGame();
  const link = `https://t.me/${BOT_USERNAME}?startapp=ref_${user.id ?? 'guest'}`;
  const share = () => {
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join me on Farm City 🌾 — grow crops and earn!')}`;
    window.open(url, '_blank');
  };
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    toast.success('Link copied');
  };

  return (
    <GameShell>
      <SectionTitle kicker="GROW TOGETHER" title="Invite friends" />
      <section className="card-farm mb-4 overflow-hidden">
        <div className="bg-gold-gradient p-5 text-center text-gold-foreground">
          <p className="text-5xl">🤝</p>
          <p className="mt-2 font-display text-2xl font-bold">Earn {REFERRAL_PERCENT}%</p>
          <p className="text-sm font-semibold">of every seed purchase your friends make</p>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2 rounded-xl bg-muted p-3">
            <span className="flex-1 truncate text-sm font-semibold">{link}</span>
            <button onClick={copy} aria-label="Copy link" className="text-primary">
              <Copy className="h-5 w-5" />
            </button>
          </div>
          <button onClick={share} className="btn-game w-full">
            <Send className="h-4 w-4" /> Share on Telegram
          </button>
        </div>
      </section>
      <section className="card-farm p-4">
        <h3 className="mb-2 text-lg font-semibold">How it works</h3>
        <ol className="space-y-2 text-sm">
          <li>1. Share your link with friends</li>
          <li>2. They open the bot and start playing</li>
          <li>3. When they buy seeds, you get {REFERRAL_PERCENT}% in your balance</li>
        </ol>
        <div className="mt-4 rounded-xl bg-secondary p-3 text-center">
          <p className="text-xs font-bold text-muted-foreground">FRIENDS INVITED</p>
          <p className="font-display text-3xl font-bold">{state?.referralCount ?? 0}</p>
          <p className="mt-1 text-xs font-bold text-muted-foreground">EARNED {money(state?.referralEarnedCents ?? 0)}</p>
        </div>
      </section>
    </GameShell>
  );
}
