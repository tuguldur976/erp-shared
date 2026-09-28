// Playwright's storageState file, written without Playwright (spec S3): a
// saved Core cookie is reused while it is alive, because Core allows only 3
// sign-ins per 10 s and scm once drew a 429 by signing in on every run.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { coreSessionAlive, hasSessionCookie, signInCore, type Cookie } from "./session.js";

export interface StorageCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Lax" | "Strict" | "None";
}

export interface StorageState {
  cookies: StorageCookie[];
  origins: unknown[];
}

/** null for a missing file or anything that is not storage state — "not signed in", never a crash. */
export function readStorageState(path: string): StorageState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { cookies, origins } = parsed as { cookies?: unknown; origins?: unknown };
  if (!Array.isArray(cookies)) return null;
  return { cookies: cookies as StorageCookie[], origins: Array.isArray(origins) ? origins : [] };
}

/** Owner-only: the file holds a live session cookie. */
export function writeStorageState(path: string, state: StorageState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function toStorageCookie(baseURL: string, cookie: Cookie, path = "/"): StorageCookie {
  const url = new URL(baseURL);
  return {
    name: cookie.name,
    value: cookie.value,
    domain: url.hostname,
    path,
    expires: -1,
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "Lax",
  };
}

/**
 * Reuses the saved session while core-web still takes it; otherwise signs in
 * and writes the file with Core's cookies only. credentials() is called only
 * when a sign-in is needed, so a reused cookie never asks for a password.
 * On reuse `cookies` is every stored cookie, module ones (scm_jwt) included.
 */
export async function ensureCoreSession(opts: {
  baseURL: string;
  statePath: string;
  credentials: () => { email: string; password: string };
}): Promise<{ cookies: Cookie[]; reused: boolean }> {
  const saved = readStorageState(opts.statePath);
  if (saved !== null) {
    const cookies = saved.cookies.map(({ name, value }) => ({ name, value }));
    if (hasSessionCookie(cookies) && (await coreSessionAlive(opts.baseURL, cookies))) {
      return { cookies, reused: true };
    }
  }
  const { email, password } = opts.credentials();
  const cookies = await signInCore(opts.baseURL, email, password);
  writeStorageState(opts.statePath, {
    cookies: cookies.map((c) => toStorageCookie(opts.baseURL, c)),
    origins: [],
  });
  return { cookies, reused: false };
}
