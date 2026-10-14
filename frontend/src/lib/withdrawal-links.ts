/** Only public HTTPS destinations may be sent to the browser. */
export function publicWithdrawalUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Public configuration only; never return the environment object. */
export function getWithdrawalLinks() {
  return {
    paymentsProof: publicWithdrawalUrl(import.meta.env.VITE_PAYMENTS_PROOF_URL),
    contactSupport: publicWithdrawalUrl(import.meta.env.VITE_CONTACT_SUPPORT_URL),
  };
}
