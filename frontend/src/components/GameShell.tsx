import { Link } from "@tanstack/react-router";
import { Home, Share2, Store, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useGame, money } from "@/lib/game";

const NAV = [
  { to: "/refer", label: "Refer", icon: Share2 },
  { to: "/", label: "Home", icon: Home },
  { to: "/market", label: "Market", icon: Store },
  { to: "/withdraw", label: "Withdraw", icon: Wallet },
] as const;

export function GameShell({ children }: { children: ReactNode }) {
  const { state, user, error } = useGame();
  const initial = user.name.charAt(0).toUpperCase();
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-28 pt-4">
      <header className="card-farm mb-4 flex items-center gap-3 p-3">
        {user.photoUrl ? (
          <img src={user.photoUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-water-gradient font-display text-xl font-bold text-water-foreground">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold leading-tight">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.id ? `ID: ${user.id}` : "Open in Telegram to link"}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold tracking-wider text-muted-foreground">BALANCE</p>
          <p className="font-display text-xl font-bold text-primary">{money(state?.balanceCents ?? 0)}</p>
        </div>
      </header>

      {error && <p className="card-farm mb-4 p-3 text-center text-sm font-semibold text-destructive">{error}</p>}

      <main className="flex-1">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-4">
        <div className="card-farm grid grid-cols-4 p-1.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-bold text-muted-foreground transition-colors"
              activeProps={{ className: "bg-primary text-primary-foreground" }}
              activeOptions={{ exact: true }}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function SectionTitle({ kicker, title, right }: { kicker: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <div>
        <p className="text-[10px] font-extrabold tracking-[0.2em] text-muted-foreground">{kicker}</p>
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      {right}
    </div>
  );
}
