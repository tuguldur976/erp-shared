import { InvalidStorageKeyError } from "./adapter.js";

/**
 * The one key check both adapters run (spec §2.2), mirroring scm's
 * LocalFsStorage.resolvePath: empty, a leading "/", a "\" (a separator on
 * Windows) and a ".." segment are refused. A "." segment is refused too:
 * the WHATWG URL parser drops it, so S3Storage would write "a/b" for "a/./b"
 * while MemoryStorage kept "a/./b".
 */
export function assertValidKey(key: string): void {
  if (key === "" || key.startsWith("/") || key.includes("\\")) {
    throw new InvalidStorageKeyError(key);
  }
  if (key.split("/").some((segment) => segment === ".." || segment === ".")) {
    throw new InvalidStorageKeyError(key);
  }
}

/** Path-style URL path for a key: each segment percent-encoded, "/" kept. */
export function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
