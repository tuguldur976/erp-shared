// The contract every module codes against (spec §2.2, R110). put/get/delete
// keep scm's signatures (scm/hono-api/src/storage/storage.ts) so its move is an
// import swap; head is new, for GC and sync.

export interface StoredObject {
  body: Uint8Array;
  contentType: string;
}

export interface ObjectInfo {
  size: number;
  contentType: string;
}

export interface StorageAdapter {
  put(key: string, data: ReadableStream | ArrayBuffer | Uint8Array, contentType: string): Promise<void>;
  /** A missing key is `null`, not an error. */
  get(key: string): Promise<StoredObject | null>;
  /** A missing key is `null`, not an error. */
  head(key: string): Promise<ObjectInfo | null>;
  /** A missing key is success: delete is idempotent (R72). */
  delete(key: string): Promise<void>;
}

/** The store answered with a non-2xx status. No retry happened — the caller decides (spec §2.2). */
export class StorageError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "StorageError";
    this.status = status;
    this.code = code;
  }
}

/** Thrown before any I/O: the key could name a different object than the caller meant. */
export class InvalidStorageKeyError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Invalid storage key: ${JSON.stringify(key)}`);
    this.name = "InvalidStorageKeyError";
    this.key = key;
  }
}
