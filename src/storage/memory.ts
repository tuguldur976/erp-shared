import type { ObjectInfo, StorageAdapter, StoredObject } from "./adapter.js";
import { toBytes } from "./bytes.js";
import { assertValidKey } from "./key.js";

/** In-memory adapter for tests. Same key rules as S3Storage; stores and returns copies. */
export class MemoryStorage implements StorageAdapter {
  readonly #objects = new Map<string, StoredObject>();

  async put(key: string, data: ReadableStream | ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
    assertValidKey(key);
    // new Uint8Array copies; a Node subclass's slice() would return a view.
    const body = new Uint8Array(await toBytes(data));
    this.#objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    assertValidKey(key);
    const found = this.#objects.get(key);
    // new Uint8Array copies; a Node subclass's slice() would return a view.
    return found ? { body: new Uint8Array(found.body), contentType: found.contentType } : null;
  }

  async head(key: string): Promise<ObjectInfo | null> {
    assertValidKey(key);
    const found = this.#objects.get(key);
    return found ? { size: found.body.byteLength, contentType: found.contentType } : null;
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    this.#objects.delete(key);
  }
}
