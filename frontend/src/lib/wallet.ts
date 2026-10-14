// Browser-only Tonkeeper (TON Connect) helper. Loaded lazily so server rendering never touches it.
import { useEffect, useState } from "react";
import type { TonConnectUI } from "@tonconnect/ui";

let instance: Promise<TonConnectUI> | null = null;

export function getWallet(): Promise<TonConnectUI> {
  if (!instance) {
    instance = import("@tonconnect/ui").then(
      ({ TonConnectUI }) => new TonConnectUI({ manifestUrl: `${window.location.origin}/tonconnect-manifest.json` }),
    );
  }
  return instance;
}

export function useWalletAddress() {
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    let off: (() => void) | undefined;
    getWallet().then((ui) => {
      setAddress(ui.account?.address ?? null);
      off = ui.onStatusChange((w) => setAddress(w?.account.address ?? null));
    });
    return () => off?.();
  }, []);
  return address;
}

export async function commentPayload(text: string) {
  const { beginCell } = await import("@ton/core");
  return beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString("base64");
}

export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
