// Core sign-in for every module's E2E suite (spec S1): through core-web's
// public auth proxy — the same door the /login form uses — so no browser and
// no dev port (core-api's 127.0.0.1:14000) are needed.

export interface Cookie {
  name: string;
  value: string;
}

// Restated from core-web lib/session-cookie.ts on purpose (core-api owns the
// name). Better Auth adds __Secure- itself once the origin is https.
export const SESSION_COOKIE_NAMES = ["erp.session_token", "__Secure-erp.session_token"] as const;

export const SIGN_IN_PATH = "/api/core/auth/sign-in/email";

export function cookieHeader(cookies: readonly Cookie[]): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

export function hasSessionCookie(cookies: readonly Cookie[]): boolean {
  return cookies.some((c) => (SESSION_COOKIE_NAMES as readonly string[]).includes(c.name));
}

function parseSetCookie(header: string): Cookie | null {
  const pair = header.split(";")[0] ?? "";
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const value = pair.slice(eq + 1).trim();
  // An empty value is a deletion (Max-Age=0), not a cookie to keep.
  return value === "" ? null : { name: pair.slice(0, eq).trim(), value };
}

function unreachable(baseURL: string, why: string): Error {
  return new Error(`Stack not reachable at ${baseURL} (${why}). Is it running?`);
}

// undici's own message is just "fetch failed"; the useful part is the cause.
function reason(error: unknown): string {
  if (error instanceof Error) {
    const code = (error.cause as { code?: unknown } | undefined)?.code;
    return typeof code === "string" ? code : error.message;
  }
  return String(error);
}

async function send(baseURL: string, path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(new URL(path, baseURL), { ...init, redirect: "manual" });
  } catch (error) {
    throw unreachable(baseURL, reason(error));
  }
}

/** Signs in and returns every cookie the answer set. Never logs a value. */
export async function signInCore(baseURL: string, email: string, password: string): Promise<Cookie[]> {
  const res = await send(baseURL, SIGN_IN_PATH, {
    method: "POST",
    // core-api trusts CORE_WEB_ORIGIN (the stack's own origin); without it sign-in 403s.
    headers: { "content-type": "application/json", origin: new URL(baseURL).origin },
    body: JSON.stringify({ email, password }),
  });
  await res.body?.cancel();
  if (res.status === 401) throw new Error(`Core refused sign-in for ${email} (401): wrong email or password.`);
  if (res.status === 429) throw new Error("Core sign-in limit hit (3 per 10 s). Wait 10 s and run again.");
  if (!res.ok) throw new Error(`Core sign-in at ${baseURL} answered ${res.status}.`);
  const cookies = res.headers
    .getSetCookie()
    .map(parseSetCookie)
    .filter((c): c is Cookie => c !== null);
  if (!hasSessionCookie(cookies)) {
    throw new Error(`Core sign-in for ${email} set no session cookie (${SESSION_COOKIE_NAMES.join(" or ")}).`);
  }
  return cookies;
}

/**
 * Whether core-web still takes these cookies: / answers 2xx for any live
 * session, and redirects to /login for a dead one. Anything else throws — a
 * down stack read as "dead cookie" would sign in again, burn Core's 3-per-10-s
 * limit and hide the real cause (spec §3.2).
 */
export async function coreSessionAlive(baseURL: string, cookies: readonly Cookie[]): Promise<boolean> {
  const res = await send(baseURL, "/", { headers: { cookie: cookieHeader(cookies) } });
  await res.body?.cancel();
  if (res.status >= 200 && res.status < 300) return true;
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location !== null) {
    if (new URL(location, baseURL).pathname.startsWith("/login")) return false;
  }
  // The Location is a URL, not a secret, and names the cause (an http→https
  // redirect, a proxy in the way) better than the bare status.
  throw unreachable(baseURL, location === null ? String(res.status) : `${res.status} → ${location}`);
}
