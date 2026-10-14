export type TgVerified = { id: number; first_name: string; username?: string | undefined; photo_url?: string | undefined; start_param?: string | undefined };

// Verifies Telegram Mini App initData with the bot token (HMAC-SHA256, per Telegram docs).
export async function verifyInitData(initData: string): Promise<TgVerified> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("Bot token missing");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Open the game inside Telegram");
  params.delete("hash");
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const enc = new TextEncoder();
  const k1 = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const secret = await crypto.subtle.sign("HMAC", k1, enc.encode(token));
  const k2 = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k2, enc.encode(check)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== hash) throw new Error("Invalid login");
  const authDate = Number(params.get("auth_date") ?? 0);
  if (Date.now() / 1000 - authDate > 7 * 86400) throw new Error("Login expired, reopen the game");
  const user = JSON.parse(params.get("user") ?? "{}");
  if (typeof user.id !== "number") throw new Error("Invalid login");
  return { id: user.id, first_name: user.first_name ?? "Farmer", username: user.username, photo_url: user.photo_url, start_param: params.get("start_param") ?? undefined };
}
