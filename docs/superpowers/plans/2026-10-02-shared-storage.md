# `@erp/shared/storage` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One file-storage adapter for every ERP module — `StorageAdapter`, `S3Storage` (Garage on-prem, R2 on Cloudflare) and `MemoryStorage` (tests) — shipped as the `./storage` subpath of `@erp/shared`, released as **v0.4.0**.

**Architecture:** Pure TypeScript under `shared/src/storage/`, exported as `./storage` next to `./tokens` and `./e2e`. `S3Storage` signs each request with `aws4fetch`'s `AwsClient.sign()` (SigV4, `service: "s3"`, explicit region) and sends it **once** through an injectable `fetch` — no `AwsClient.fetch()`, which retries 5xx up to 10 times. One key check (`assertValidKey`) runs in both adapters before any I/O. Only `fetch` + `crypto.subtle` (R75), so the same code runs on Node and Cloudflare Workers.

**Tech Stack:** TypeScript 5.9 (strict, `noUncheckedIndexedAccess`) + vitest 3 + npm in `shared/`; `aws4fetch` 1.0.20 (first runtime dependency); Garage `dxflrs/garage:v2.4.1` in Docker for the optional integration test.

**Spec:** `~/Projects/sparkerp/erp-core/docs/superpowers/specs/2026-10-01-object-storage-and-product-images-design.md` — this plan covers **only** §2.2 (`@erp/shared/storage`), the shared rows of §6, decisions S4/S5/S11 and R110 (§7). The spec is in Mongolian; read §1 S4–S6, S11, §2.2, §6, §7 and §9 before starting. Two sibling plans (umbrella stack, erp-core images) consume the names below — do not rename anything in **Global Constraints → Contract**.

## Global Constraints

- **Repo:** `~/Projects/sparkerp/shared` (github `tuguldur976/erp-shared`), its own git repo (umbrella `CLAUDE.md`). Other sessions share checkouts → work **only** in the sibling worktree `~/Projects/sparkerp/shared-storage` on branch `feat/storage`, created with `git -C ~/Projects/sparkerp/shared worktree add ../shared-storage -b feat/storage main`. Never switch the branch of `~/Projects/sparkerp/shared`. Run `git branch --show-current` right before every commit (expect `feat/storage`).
- **No push, no merge into `main`, no tag** without the user's explicit yes at that moment (Task 6 is the gate).
- **Contract (fixed — two other plans depend on these exact names):**
  - Subpath export `"./storage"` → `dist/storage/index.js` + `dist/storage/index.d.ts`. Version `0.4.0`, git tag `v0.4.0`.
  - `interface StorageAdapter { put(key: string, data: ReadableStream | ArrayBuffer | Uint8Array, contentType: string): Promise<void>; get(key: string): Promise<StoredObject | null>; head(key: string): Promise<ObjectInfo | null>; delete(key: string): Promise<void> }`
  - `interface StoredObject { body: Uint8Array; contentType: string }`, `interface ObjectInfo { size: number; contentType: string }`
  - `class S3Storage implements StorageAdapter` — `constructor(opts: S3StorageOptions)`; `interface S3StorageOptions { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; fetch?: typeof fetch }`
  - `class MemoryStorage implements StorageAdapter`
  - `class StorageError extends Error { status: number; code: string | undefined }` — constructor `(message: string, status: number, code?: string)`
  - `class InvalidStorageKeyError extends Error` — constructor `(key: string)`, also exposes `readonly key: string`
  - `function assertValidKey(key: string): void`
- **Behaviour:** path-style URL `${endpoint}/${bucket}/${encodedKey}` (each key segment `encodeURIComponent`, `/` kept; a trailing `/` on `endpoint` is dropped); `AwsClient` with `service: "s3"` and the given `region` (Garage `garage`, R2 `auto` — aws4fetch only guesses region for AWS/R2 hosts); `put` sends `Content-Type`; `get` returns `contentType` from the response header (fallback `application/octet-stream`); 404 → `null` for `get`/`head`, success for `delete` (idempotent, R72); other non-2xx → `StorageError` with HTTP status and the S3 XML `<Code>`; **no retries** in the adapter; key check identical in both adapters (empty, leading `/`, any `..` segment, any `\` → `InvalidStorageKeyError`; plus a `.` segment — see Review Focus 1).
- **Portability (R75):** shipped files under `src/storage/` import no `node:*` module and use no `Buffer`, `process`, `require` — only `fetch`, `Request`/`Response`, `URL`, `crypto.subtle` (via aws4fetch). Tests may use Node.
- **Code style (shared):** double quotes, semicolons, 2-space indent, named exports only, TS strict, no `any`. Relative imports end in `.js` (`from "./key.js"`) — `dist/` is loaded by Node ESM directly.
- **Messages never carry a secret:** an `S3Storage` option error names the option, never its value.
- **Commits:** Conventional Commits with the WHY in the body (erp-rules R11), each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. One commit per task.
- **Consumers pin** `git+https://github.com/tuguldur976/erp-shared.git#v0.4.0` (not the `github:` shorthand). Bumping the pin in erp-core/scm is **not** in this plan — the erp-core images plan does it after the tag exists.

## Review Focus

1. **A key with a `.` segment or reserved characters** (`products/./a.jpg`, space, `+`, `#`, `?`, Cyrillic) → the object lands under exactly the key the caller passed, in both adapters. The WHATWG URL parser silently drops a `.` (and `%2e`) segment, so `S3Storage` would write `products/a.jpg` while `MemoryStorage` kept `products/./a.jpg` → `assertValidKey` refuses a `.` segment (spec §2.2 lists only `..`; this is the one addition). Tests: Task 1 (unit), Task 4 (Garage round trip with Cyrillic and reserved characters).
2. **A wrong bucket name** (typo in `STORAGE_BUCKET`) → a `StorageError`, not «every image is missing». S3 answers 404 `NoSuchBucket`; reading every 404 as `null` would hide it → `get`/`delete` throw on `NoSuchBucket`. `head` cannot tell (a HEAD answer has no body) and stays `null` — documented in README. Tests: Task 3, Task 4.
3. **A `ReadableStream` body or a `Uint8Array` view** (a `subarray`, a pooled Node `Buffer`) → S3 needs a `Content-Length` on PUT, so a stream is read to the end first; a view stores only the bytes it covers. Tests: Task 2, Task 3, Task 4.
4. **The store answers 503 `SlowDown`** → exactly one request and a `StorageError` at once. `aws4fetch`'s `AwsClient.fetch()` would retry up to 10 times with backoff and stall the caller's request; retry policy is the caller's (spec §2.2). Test: Task 3.
5. **An error body that is not S3 XML** (a proxy's HTML 502, an empty HEAD 403) → `StorageError` with `code: undefined`, never a parse crash. Test: Task 3.

---

## File Structure

**shared** (worktree `~/Projects/sparkerp/shared-storage`, branch `feat/storage`)

| File | Responsibility |
|---|---|
| `src/storage/adapter.ts` | The contract: `StorageAdapter`, `StoredObject`, `ObjectInfo`, `StorageError`, `InvalidStorageKeyError` |
| `src/storage/key.ts` | `assertValidKey` (exported), `encodeKey` (internal — not re-exported) |
| `src/storage/bytes.ts` | `toBytes` — every put body as one `Uint8Array` (internal) |
| `src/storage/memory.ts` | `MemoryStorage` |
| `src/storage/s3.ts` | `S3Storage`, `S3StorageOptions` |
| `src/storage/index.ts` | re-exports (the public surface) |
| `src/storage/{key,memory,s3,portability}.test.ts` | vitest unit tests (default `npm test`) |
| `src/storage/s3.integration.test.ts` | Garage round trip — only via `npm run test:integration` |
| `scripts/garage-test.sh` | starts a throwaway Garage, configures bucket + key, runs the integration test, removes the container |
| `vitest.config.ts`, `vitest.integration.config.ts` | keep the integration test out of `npm test`; run only it in `test:integration` |
| `package.json`, `package-lock.json` | `aws4fetch` dependency, `./storage` export, `test:integration` script, `0.4.0`, description |
| `README.md` | storage section: Garage/R2 usage, behaviour table, R110 summary, AWS SDK v3 warning, consumer impact |

No file outside `shared/` changes in this plan.

---

### Task 1: Worktree; the contract and the key rule

**Files:**
- Create: `src/storage/adapter.ts`, `src/storage/key.ts`
- Test: `src/storage/key.test.ts`

**Interfaces:**
- Produces: `StoredObject`, `ObjectInfo`, `StorageAdapter` (exact shapes in Global Constraints); `class StorageError extends Error { readonly status: number; readonly code: string | undefined; constructor(message: string, status: number, code?: string) }`; `class InvalidStorageKeyError extends Error { readonly key: string; constructor(key: string) }` with message `Invalid storage key: "<key>"`; `assertValidKey(key: string): void`; `encodeKey(key: string): string` (internal, used by `S3Storage`).

- [ ] **Step 1: Worktree and install**

```bash
git -C ~/Projects/sparkerp/shared worktree add ../shared-storage -b feat/storage main
cd ~/Projects/sparkerp/shared-storage && git branch --show-current && npm ci && npm test
```

Expected: `feat/storage`; `npm ci` runs `prepare` (build) without error; existing tokens + e2e tests pass.

- [ ] **Step 2: Write the failing test** — `src/storage/key.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { InvalidStorageKeyError } from "./adapter.js";
import { assertValidKey, encodeKey } from "./key.js";

describe("assertValidKey", () => {
  it.each([
    "products/7f3a/a1b2.jpg",
    "products/7f3a/a1b2-256.jpg",
    "po-documents/c1/p1/d1.pdf",
    "a..b/c.jpg",
    "products/зураг 1.jpg",
  ])("accepts %j", (key) => {
    expect(() => assertValidKey(key)).not.toThrow();
  });

  it.each([
    ["empty", ""],
    ["leading slash", "/products/a.jpg"],
    ["parent segment", "products/../scm/a.jpg"],
    ["parent segment at the end", "products/.."],
    ["only a parent segment", ".."],
    ["backslash", "products\\a.jpg"],
    ["backslash parent", "products\\..\\a.jpg"],
    // Review Focus 1: the URL parser drops "." — S3 would write another key.
    ["dot segment", "products/./a.jpg"],
  ])("refuses %s", (_label, key) => {
    expect(() => assertValidKey(key)).toThrow(InvalidStorageKeyError);
  });

  it("names the key in the message", () => {
    expect(() => assertValidKey("/x")).toThrow('Invalid storage key: "/x"');
  });
});

describe("encodeKey", () => {
  it("encodes each segment and keeps the slashes", () => {
    expect(encodeKey("products/7f3a/a b+c#?%.jpg")).toBe("products/7f3a/a%20b%2Bc%23%3F%25.jpg");
  });

  it("encodes non-ASCII as UTF-8", () => {
    expect(encodeKey("p/ө.jpg")).toBe("p/%D3%A9.jpg");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd ~/Projects/sparkerp/shared-storage && npx vitest run src/storage/key.test.ts`
Expected: FAIL — `Failed to resolve import "./adapter.js"` (or `./key.js`).

- [ ] **Step 4: Write the contract** — `src/storage/adapter.ts`

```ts
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
```

- [ ] **Step 5: Write the key rule** — `src/storage/key.ts`

```ts
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
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `cd ~/Projects/sparkerp/shared-storage && npx vitest run src/storage/key.test.ts && npx tsc --noEmit`
Expected: 16 tests PASS; `tsc` prints nothing.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/sparkerp/shared-storage && git branch --show-current && git add src/storage/adapter.ts src/storage/key.ts src/storage/key.test.ts && git commit -m "feat(storage): the StorageAdapter contract and one key rule

put/get/delete keep scm's signatures so scm's move is an import swap;
head is new for GC and sync (spec 2.2). The key rule mirrors scm's
LocalFsStorage and also refuses a '.' segment: the URL parser drops it,
so S3 would store a different key than the in-memory adapter.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `MemoryStorage`

**Files:**
- Create: `src/storage/bytes.ts`, `src/storage/memory.ts`
- Test: `src/storage/memory.test.ts`

**Interfaces:**
- Consumes: `StorageAdapter`, `StoredObject`, `ObjectInfo`, `InvalidStorageKeyError` from `./adapter.js`; `assertValidKey` from `./key.js`.
- Produces: `class MemoryStorage implements StorageAdapter` (no constructor arguments); `toBytes(data: ReadableStream | ArrayBuffer | Uint8Array): Promise<Uint8Array>` (internal, reused by `S3Storage` in Task 3).

- [ ] **Step 1: Write the failing test** — `src/storage/memory.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { InvalidStorageKeyError } from "./adapter.js";
import { MemoryStorage } from "./memory.js";

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(values);

describe("MemoryStorage", () => {
  it("round-trips put → get → head → delete", async () => {
    const s = new MemoryStorage();
    await s.put("products/p1/a.jpg", bytes(0xff, 0xd8, 0xff), "image/jpeg");
    expect(await s.get("products/p1/a.jpg")).toEqual({ body: bytes(0xff, 0xd8, 0xff), contentType: "image/jpeg" });
    expect(await s.head("products/p1/a.jpg")).toEqual({ size: 3, contentType: "image/jpeg" });
    await s.delete("products/p1/a.jpg");
    expect(await s.get("products/p1/a.jpg")).toBeNull();
    expect(await s.head("products/p1/a.jpg")).toBeNull();
  });

  it("answers null for a key never written, and deleting it is fine", async () => {
    const s = new MemoryStorage();
    expect(await s.get("nope.jpg")).toBeNull();
    expect(await s.head("nope.jpg")).toBeNull();
    await expect(s.delete("nope.jpg")).resolves.toBeUndefined();
  });

  it("takes an ArrayBuffer and a ReadableStream", async () => {
    const s = new MemoryStorage();
    await s.put("a.bin", bytes(1, 2).buffer, "application/octet-stream");
    await s.put("b.bin", new Blob([bytes(3, 4, 5)]).stream(), "application/octet-stream");
    expect((await s.get("a.bin"))?.body).toEqual(bytes(1, 2));
    expect((await s.head("b.bin"))?.size).toBe(3);
  });

  // Review Focus 3: a view (subarray, a pooled Node Buffer) stores only its own bytes.
  it("stores only the bytes a view covers", async () => {
    const s = new MemoryStorage();
    await s.put("v.bin", bytes(9, 1, 2, 9).subarray(1, 3), "application/octet-stream");
    expect((await s.get("v.bin"))?.body).toEqual(bytes(1, 2));
  });

  it("is not changed by the caller mutating what it passed or got", async () => {
    const s = new MemoryStorage();
    const input = bytes(1, 2, 3);
    await s.put("m.bin", input, "application/octet-stream");
    input[0] = 7;
    const got = await s.get("m.bin");
    if (got) got.body[1] = 7;
    expect((await s.get("m.bin"))?.body).toEqual(bytes(1, 2, 3));
  });

  it("overwrites on a second put of the same key", async () => {
    const s = new MemoryStorage();
    await s.put("k.txt", bytes(1), "text/plain");
    await s.put("k.txt", bytes(2, 2), "application/pdf");
    expect(await s.head("k.txt")).toEqual({ size: 2, contentType: "application/pdf" });
  });

  it.each(["put", "get", "head", "delete"] as const)("checks the key on %s", async (method) => {
    const s = new MemoryStorage();
    const call =
      method === "put" ? s.put("../x", bytes(1), "text/plain") : s[method]("../x");
    await expect(call).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/Projects/sparkerp/shared-storage && npx vitest run src/storage/memory.test.ts`
Expected: FAIL — `Failed to resolve import "./memory.js"`.

- [ ] **Step 3: Write `toBytes`** — `src/storage/bytes.ts`

```ts
/**
 * Every put body as one byte array. A stream is read to the end first: S3
 * wants a Content-Length on PUT, and objects here are small (images ≤ 3 MB,
 * documents ≤ 10 MB — spec §2.2). A Uint8Array view keeps only its own bytes.
 */
export async function toBytes(data: ReadableStream | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(await new Response(data).arrayBuffer());
}
```

- [ ] **Step 4: Write the adapter** — `src/storage/memory.ts`

```ts
import type { ObjectInfo, StorageAdapter, StoredObject } from "./adapter.js";
import { toBytes } from "./bytes.js";
import { assertValidKey } from "./key.js";

/** In-memory adapter for tests. Same key rules as S3Storage; stores and returns copies. */
export class MemoryStorage implements StorageAdapter {
  readonly #objects = new Map<string, StoredObject>();

  async put(key: string, data: ReadableStream | ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
    assertValidKey(key);
    const body = (await toBytes(data)).slice();
    this.#objects.set(key, { body, contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    assertValidKey(key);
    const found = this.#objects.get(key);
    return found ? { body: found.body.slice(), contentType: found.contentType } : null;
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
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `cd ~/Projects/sparkerp/shared-storage && npx vitest run src/storage && npx tsc --noEmit`
Expected: key + memory tests PASS (26); `tsc` prints nothing. (If `tsc` reports `ArrayBufferLike` is not assignable in the test: the `bytes` helper's return type must be `Uint8Array<ArrayBuffer>`, as written.)

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/sparkerp/shared-storage && git branch --show-current && git add src/storage/bytes.ts src/storage/memory.ts src/storage/memory.test.ts && git commit -m "feat(storage): MemoryStorage for every module's unit tests

Services take a StorageAdapter by DI (R3); tests get this one instead of a
Garage. It runs the same key check as S3Storage and stores copies, so a
test cannot pass by mutating a buffer the adapter still holds.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `S3Storage` on `aws4fetch`

**Files:**
- Create: `src/storage/s3.ts`
- Modify: `package.json`, `package-lock.json` (dependency `aws4fetch`)
- Test: `src/storage/s3.test.ts`

**Interfaces:**
- Consumes: `StorageError`, `StorageAdapter`, `StoredObject`, `ObjectInfo` from `./adapter.js`; `toBytes` from `./bytes.js`; `assertValidKey`, `encodeKey` from `./key.js`; `AwsClient` from `aws4fetch` (`new AwsClient({ accessKeyId, secretAccessKey, service, region, retries })`, `sign(url, init): Promise<Request>`).
- Produces: `interface S3StorageOptions` and `class S3Storage implements StorageAdapter` (exact shapes in Global Constraints). Constructor throws `TypeError` naming the option for an empty option, and for an `endpoint` that is not an `http(s)` URL.

Why `sign()` and not `AwsClient.fetch()` (read `node_modules/aws4fetch/dist/aws4fetch.esm.mjs` if in doubt): `fetch()` defaults to `retries: 10` on 5xx/429 and always calls the global `fetch`. `sign()` returns a signed `Request` that we send once through the injectable `fetch`. For `service: "s3"` the signer adds `X-Amz-Content-Sha256: UNSIGNED-PAYLOAD` (no body hash, no checksum headers — which is why it works with Garage where AWS SDK v3 ≥3.729 does not).

- [ ] **Step 1: Add the dependency**

```bash
cd ~/Projects/sparkerp/shared-storage && npm install --save-exact aws4fetch@1.0.20 && node -e "console.log(require('./package.json').dependencies)"
```

Expected: `{ aws4fetch: '1.0.20' }` — the package's first `dependencies` entry (everything before was a devDependency). Exact pin: the library is quiet since 2024-08 and the spec keeps vendoring (~300 lines) as the fallback (§2.2).

- [ ] **Step 2: Write the failing test** — `src/storage/s3.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { InvalidStorageKeyError, StorageError } from "./adapter.js";
import { S3Storage, type S3StorageOptions } from "./s3.js";

interface Fake {
  requests: Request[];
  fetch: typeof fetch;
}

/** A fetch that records each request (cloned, body readable) and answers with `respond`. */
function fakeFetch(respond: (req: Request) => Response): Fake {
  const requests: Request[] = [];
  const impl: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    requests.push(req.clone());
    return respond(req);
  };
  return { requests, fetch: impl };
}

const GARAGE: S3StorageOptions = {
  endpoint: "http://object-storage:3900",
  region: "garage",
  bucket: "core",
  accessKeyId: "GK0123456789abcdef01234567",
  secretAccessKey: "s3cr3t-value-never-in-messages",
};

const storage = (fake: Fake, opts: Partial<S3StorageOptions> = {}): S3Storage =>
  new S3Storage({ ...GARAGE, ...opts, fetch: fake.fetch });

const xmlError = (status: number, code: string): Response =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>m</Message></Error>`, {
    status,
    headers: { "content-type": "application/xml" },
  });

const sent = (fake: Fake, index = 0): Request => {
  const req = fake.requests[index];
  if (!req) throw new Error(`request ${index} was not sent`);
  return req;
};

describe("S3Storage — requests", () => {
  it("uses a path-style URL with each key segment encoded", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    await storage(fake, { endpoint: "http://object-storage:3900/" }).put(
      "products/7f3a/a b+c#?.jpg",
      new Uint8Array([1]),
      "image/jpeg",
    );
    expect(sent(fake).url).toBe("http://object-storage:3900/core/products/7f3a/a%20b%2Bc%23%3F.jpg");
  });

  it("signs with SigV4 for service s3 and the given region", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    await storage(fake).get("products/p1/a.jpg");
    const auth = sent(fake).headers.get("authorization") ?? "";
    expect(auth).toMatch(/^AWS4-HMAC-SHA256 Credential=GK0123456789abcdef01234567\/\d{8}\/garage\/s3\/aws4_request, /);
    expect(auth).toMatch(/SignedHeaders=[^,]*host[^,]*x-amz-date/);
    expect(auth).toMatch(/Signature=[0-9a-f]{64}$/);
    expect(sent(fake).headers.get("x-amz-content-sha256")).toBe("UNSIGNED-PAYLOAD");
    expect(auth).not.toContain(GARAGE.secretAccessKey);
  });

  it("keeps an explicit region even for an R2 host", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    await storage(fake, { endpoint: "https://acc123.r2.cloudflarestorage.com", region: "auto" }).head("a.jpg");
    expect(sent(fake).url).toBe("https://acc123.r2.cloudflarestorage.com/core/a.jpg");
    expect(sent(fake).headers.get("authorization")).toContain("/auto/s3/aws4_request");
  });

  it("PUT sends the bytes and Content-Type", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    await storage(fake).put("products/p1/a.jpg", new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg");
    const req = sent(fake);
    expect(req.method).toBe("PUT");
    expect(req.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await req.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
  });

  // Review Focus 3: S3 needs a length, so a stream is read to the end first; a view keeps only its bytes.
  it("PUT reads a ReadableStream into bytes and sends only a view's bytes", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    const s = storage(fake);
    await s.put("s.bin", new Blob([new Uint8Array([4, 5, 6])]).stream(), "application/octet-stream");
    await s.put("v.bin", new Uint8Array([9, 1, 2, 9]).subarray(1, 3), "application/octet-stream");
    expect(new Uint8Array(await sent(fake, 0).arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]));
    expect(new Uint8Array(await sent(fake, 1).arrayBuffer())).toEqual(new Uint8Array([1, 2]));
  });

  it("refuses a bad key before any request", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 200 }));
    const s = storage(fake);
    await expect(s.put("/abs.jpg", new Uint8Array([1]), "image/jpeg")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(s.get("a/../b.jpg")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(s.head("")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(s.delete("a\\b.jpg")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    expect(fake.requests).toHaveLength(0);
  });
});

describe("S3Storage — answers", () => {
  it("get returns the body and the stored Content-Type", async () => {
    const fake = fakeFetch(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    expect(await storage(fake).get("a.jpg")).toEqual({ body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" });
    expect(sent(fake).method).toBe("GET");
  });

  it("get falls back to application/octet-stream without a Content-Type", async () => {
    const fake = fakeFetch(() => new Response(new Uint8Array([1]), { status: 200 }));
    expect((await storage(fake).get("a.bin"))?.contentType).toBe("application/octet-stream");
  });

  it("head returns size and Content-Type", async () => {
    const fake = fakeFetch(
      () => new Response(null, { status: 200, headers: { "content-length": "421337", "content-type": "image/jpeg" } }),
    );
    expect(await storage(fake).head("a.jpg")).toEqual({ size: 421337, contentType: "image/jpeg" });
    expect(sent(fake).method).toBe("HEAD");
  });

  it("404 NoSuchKey: get and head are null, delete succeeds", async () => {
    const fake = fakeFetch((req) => (req.method === "HEAD" ? new Response(null, { status: 404 }) : xmlError(404, "NoSuchKey")));
    const s = storage(fake);
    expect(await s.get("gone.jpg")).toBeNull();
    expect(await s.head("gone.jpg")).toBeNull();
    await expect(s.delete("gone.jpg")).resolves.toBeUndefined();
  });

  it("delete succeeds on 204", async () => {
    const fake = fakeFetch(() => new Response(null, { status: 204 }));
    await expect(storage(fake).delete("a.jpg")).resolves.toBeUndefined();
    expect(sent(fake).method).toBe("DELETE");
  });

  // Review Focus 2: a wrong bucket name must not read as "no image".
  it("404 NoSuchBucket is a StorageError for get and delete", async () => {
    const fake = fakeFetch(() => xmlError(404, "NoSuchBucket"));
    const s = storage(fake);
    await expect(s.get("a.jpg")).rejects.toMatchObject({ name: "StorageError", status: 404, code: "NoSuchBucket" });
    await expect(s.delete("a.jpg")).rejects.toBeInstanceOf(StorageError);
  });

  // Review Focus 4: aws4fetch's own fetch() retries 5xx ten times; the adapter sends once.
  it("5xx is a StorageError with status and S3 Code, after exactly one request", async () => {
    const fake = fakeFetch(() => xmlError(503, "SlowDown"));
    const err = await storage(fake).put("a.jpg", new Uint8Array([1]), "image/jpeg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect(err).toMatchObject({ status: 503, code: "SlowDown" });
    expect(fake.requests).toHaveLength(1);
  });

  // Review Focus 5: a proxy's HTML page or an empty HEAD answer is still a clean StorageError.
  it("a non-XML or empty error body gives code undefined", async () => {
    const html = fakeFetch(() => new Response("<html>Bad Gateway</html>", { status: 502 }));
    await expect(storage(html).get("a.jpg")).rejects.toMatchObject({ status: 502, code: undefined });
    const head = fakeFetch(() => new Response(null, { status: 403 }));
    await expect(storage(head).head("a.jpg")).rejects.toMatchObject({ status: 403, code: undefined });
  });

  it("403 AccessDenied on get is a StorageError (another module's bucket — R110)", async () => {
    const fake = fakeFetch(() => xmlError(403, "AccessDenied"));
    await expect(storage(fake).get("a.jpg")).rejects.toMatchObject({ status: 403, code: "AccessDenied" });
  });
});

describe("S3Storage — options", () => {
  it.each(["endpoint", "region", "bucket", "accessKeyId", "secretAccessKey"] as const)(
    "names a missing %s without printing any value",
    (name) => {
      let message = "";
      try {
        new S3Storage({ ...GARAGE, [name]: "" });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain(name);
      expect(message).not.toContain(GARAGE.secretAccessKey);
      expect(message).not.toContain(GARAGE.accessKeyId);
    },
  );

  it("refuses an endpoint that is not an http(s) URL", () => {
    expect(() => new S3Storage({ ...GARAGE, endpoint: "object-storage:3900" })).toThrow(/endpoint/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd ~/Projects/sparkerp/shared-storage && npx vitest run src/storage/s3.test.ts`
Expected: FAIL — `Failed to resolve import "./s3.js"`.

- [ ] **Step 4: Write the adapter** — `src/storage/s3.ts`

```ts
import { AwsClient } from "aws4fetch";
import { StorageError, type ObjectInfo, type StorageAdapter, type StoredObject } from "./adapter.js";
import { toBytes } from "./bytes.js";
import { assertValidKey, encodeKey } from "./key.js";

export interface S3StorageOptions {
  /** Origin of the S3 API, e.g. http://object-storage:3900 (Garage) or https://<account>.r2.cloudflarestorage.com. */
  endpoint: string;
  /** Always explicit: aws4fetch guesses only for AWS/R2 hostnames. Garage: "garage", R2: "auto". */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** For tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

const REQUIRED = ["endpoint", "region", "bucket", "accessKeyId", "secretAccessKey"] as const;
const FALLBACK_TYPE = "application/octet-stream";

/**
 * S3-compatible adapter (Garage on-prem, R2 on Cloudflare) on aws4fetch:
 * fetch + crypto.subtle only, so it runs on Node and Workers alike (R75).
 * Requests are signed with aws4fetch and sent once — aws4fetch's own
 * fetch() would retry 5xx up to 10 times, and retry policy is the caller's.
 */
export class S3Storage implements StorageAdapter {
  readonly #client: AwsClient;
  readonly #fetch: typeof fetch;
  readonly #base: string;

  constructor(opts: S3StorageOptions) {
    for (const name of REQUIRED) {
      // Names the option, never its value: two of them are secrets.
      if (typeof opts[name] !== "string" || opts[name] === "") {
        throw new TypeError(`S3Storage: option "${name}" is required`);
      }
    }
    if (!URL.canParse(opts.endpoint) || !/^https?:$/.test(new URL(opts.endpoint).protocol)) {
      throw new TypeError(`S3Storage: endpoint is not an http(s) URL: ${opts.endpoint}`);
    }
    this.#client = new AwsClient({
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      service: "s3",
      region: opts.region,
      retries: 0,
    });
    this.#fetch = opts.fetch ?? ((input, init) => fetch(input, init));
    this.#base = `${opts.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(opts.bucket)}`;
  }

  async put(key: string, data: ReadableStream | ArrayBuffer | Uint8Array, contentType: string): Promise<void> {
    assertValidKey(key);
    const body = await toBytes(data);
    const res = await this.#send("PUT", key, { headers: { "Content-Type": contentType }, body });
    if (!res.ok) throw await failure("PUT", key, res);
    await res.arrayBuffer();
  }

  async get(key: string): Promise<StoredObject | null> {
    assertValidKey(key);
    const res = await this.#send("GET", key);
    if (res.status === 404) return missing("GET", key, res);
    if (!res.ok) throw await failure("GET", key, res);
    return {
      body: new Uint8Array(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? FALLBACK_TYPE,
    };
  }

  async head(key: string): Promise<ObjectInfo | null> {
    assertValidKey(key);
    const res = await this.#send("HEAD", key);
    // A HEAD answer has no body, so a missing bucket also reads as null here.
    if (res.status === 404) return null;
    if (!res.ok) throw await failure("HEAD", key, res);
    return {
      size: Number(res.headers.get("content-length") ?? "0"),
      contentType: res.headers.get("content-type") ?? FALLBACK_TYPE,
    };
  }

  async delete(key: string): Promise<void> {
    assertValidKey(key);
    const res = await this.#send("DELETE", key);
    if (res.status === 404) {
      await missing("DELETE", key, res);
      return;
    }
    if (!res.ok) throw await failure("DELETE", key, res);
    await res.arrayBuffer();
  }

  async #send(method: string, key: string, init: { headers?: Record<string, string>; body?: Uint8Array } = {}): Promise<Response> {
    const signed = await this.#client.sign(`${this.#base}/${encodeKey(key)}`, { method, ...init });
    return this.#fetch(signed);
  }
}

/** The S3 error <Code>, or undefined when the body is empty or not S3 XML (a proxy's HTML page). */
async function s3Code(res: Response): Promise<string | undefined> {
  const text = await res.text().catch(() => "");
  return /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
}

async function failure(method: string, key: string, res: Response): Promise<StorageError> {
  const code = await s3Code(res);
  return new StorageError(`S3 ${method} ${key} failed: ${res.status}${code ? ` ${code}` : ""}`, res.status, code);
}

/** 404 on a missing object is null/success; on a missing bucket it is misconfiguration, never "no object". */
async function missing(method: string, key: string, res: Response): Promise<null> {
  const code = await s3Code(res);
  if (code === "NoSuchBucket") {
    throw new StorageError(`S3 ${method} ${key} failed: 404 NoSuchBucket`, 404, code);
  }
  return null;
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `cd ~/Projects/sparkerp/shared-storage && npx vitest run src/storage && npx tsc --noEmit`
Expected: key + memory + s3 tests PASS (47); `tsc` prints nothing.

- [ ] **Step 6: Prove a real `fetch` sends `Content-Length`** (Review Focus 3 — the fake in Step 2 sees a `Request`, not the wire). Run against a throwaway local HTTP server:

```bash
cd ~/Projects/sparkerp/shared-storage && npx tsx -e '
import { createServer } from "node:http";
import { S3Storage } from "./src/storage/s3.ts";
const srv = createServer((req, res) => {
  let n = 0;
  req.on("data", (c) => (n += c.length));
  req.on("end", () => { console.log(req.method, req.url, "content-length=" + req.headers["content-length"], "chunked=" + (req.headers["transfer-encoding"] ?? "no"), "received=" + n); res.end(); });
});
srv.listen(0, "127.0.0.1", async () => {
  const { port } = srv.address() as { port: number };
  const s = new S3Storage({ endpoint: `http://127.0.0.1:${port}`, region: "garage", bucket: "core", accessKeyId: "GKx", secretAccessKey: "y" });
  await s.put("p/a b.jpg", new Blob([new Uint8Array(5000)]).stream(), "image/jpeg");
  srv.close();
});'
```

Expected: `PUT /core/p/a%20b.jpg content-length=5000 chunked=no received=5000`.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/sparkerp/shared-storage && git branch --show-current && git add src/storage/s3.ts src/storage/s3.test.ts package.json package-lock.json && git commit -m "feat(storage): S3Storage for Garage and R2 on aws4fetch

aws4fetch needs only fetch and crypto.subtle, so the adapter runs on Node
and Workers (R75), and it adds no checksum headers - AWS SDK v3 >=3.729
does, and Garage rejects them (garage#1236). Requests are signed and sent
once: AwsClient.fetch would retry 5xx ten times, and retries are the
caller's call. A 404 NoSuchBucket throws so a bucket typo cannot read as
'no image'.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Optional integration test against a real Garage

**Files:**
- Create: `scripts/garage-test.sh`, `vitest.config.ts`, `vitest.integration.config.ts`, `src/storage/s3.integration.test.ts`
- Modify: `package.json` (`scripts.test:integration`)

**Interfaces:**
- Consumes: `S3Storage`, `StorageError` (Tasks 1, 3).
- Produces: `npm run test:integration` (needs Docker; **not** part of `npm test`, not run by `prepare`). Env it sets for the test: `GARAGE_TEST_ENDPOINT`, `GARAGE_TEST_BUCKET`, `GARAGE_TEST_KEY_ID`, `GARAGE_TEST_SECRET`.

🟡 **Verify during execution (spec §9.1, §9.4):** the Garage CLI below (`node id -q`, `layout assign/apply`, `key import --yes`, `bucket allow`), the key format (`GK` + 24 hex id, 64-hex secret) and `UNSIGNED-PAYLOAD` acceptance. A scratch run of exactly this script and test against `dxflrs/garage:v2.4.1` passed all 5 tests on 2026-10-02; if a command fails, read `docker exec erp-shared-garage-test /garage help` and the [Garage quick start](https://garagehq.deuxfleurs.fr/documentation/quick-start/) and fix the script, not the adapter. `db_engine = "sqlite"` is a test-only choice (no LMDB map-size tuning in a throwaway container); the stack's `garage.toml` is the umbrella plan's. shared has no CI (`.github/` absent), so this test is run by hand before the release.

- [ ] **Step 1: Keep it out of `npm test`** — `vitest.config.ts`

```ts
import { configDefaults, defineConfig } from "vitest/config";

// `npm test` stays Docker-free: the Garage test runs only via `npm run test:integration`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/*.integration.test.ts"] },
});
```

and `vitest.integration.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.integration.test.ts"] },
});
```

Run: `cd ~/Projects/sparkerp/shared-storage && npm test`
Expected: the same tests as before still run (tokens, e2e, storage) — the config only adds an exclude.

- [ ] **Step 2: Write the integration test** — `src/storage/s3.integration.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { StorageError } from "./adapter.js";
import { S3Storage } from "./s3.js";

// Run through `npm run test:integration` (scripts/garage-test.sh), which starts
// Garage and sets these. Spec §6 "shared integration".
function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set — run npm run test:integration`);
  return value;
}

const storage = new S3Storage({
  endpoint: env("GARAGE_TEST_ENDPOINT"),
  region: "garage",
  bucket: env("GARAGE_TEST_BUCKET"),
  accessKeyId: env("GARAGE_TEST_KEY_ID"),
  secretAccessKey: env("GARAGE_TEST_SECRET"),
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe("S3Storage against Garage", () => {
  it("put → head → get → delete → gone", async () => {
    const key = `products/${crypto.randomUUID()}/a.jpg`;
    await storage.put(key, jpeg, "image/jpeg");
    expect(await storage.head(key)).toEqual({ size: jpeg.byteLength, contentType: "image/jpeg" });
    expect(await storage.get(key)).toEqual({ body: jpeg, contentType: "image/jpeg" });
    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    expect(await storage.head(key)).toBeNull();
    await storage.delete(key);
  });

  // Review Focus 1: the signed path and Garage's canonical path must agree for any character.
  it("round-trips a key with spaces, +, Cyrillic and other reserved characters", async () => {
    const key = `products/${crypto.randomUUID()}/зураг 1+(2)!'*~;=,@$&.jpg`;
    await storage.put(key, jpeg, "image/jpeg");
    expect((await storage.get(key))?.body).toEqual(jpeg);
    await storage.delete(key);
  });

  it("takes a ReadableStream body", async () => {
    const key = `products/${crypto.randomUUID()}/s.bin`;
    await storage.put(key, new Blob([new Uint8Array(70_000).fill(7)]).stream(), "application/octet-stream");
    expect((await storage.head(key))?.size).toBe(70_000);
    await storage.delete(key);
  });

  it("a missing bucket is a StorageError, not null", async () => {
    const other = new S3Storage({
      endpoint: env("GARAGE_TEST_ENDPOINT"),
      region: "garage",
      bucket: "no-such-bucket",
      accessKeyId: env("GARAGE_TEST_KEY_ID"),
      secretAccessKey: env("GARAGE_TEST_SECRET"),
    });
    await expect(other.get("a.jpg")).rejects.toBeInstanceOf(StorageError);
  });

  it("a wrong secret is a StorageError with Garage's code", async () => {
    const bad = new S3Storage({
      endpoint: env("GARAGE_TEST_ENDPOINT"),
      region: "garage",
      bucket: env("GARAGE_TEST_BUCKET"),
      accessKeyId: env("GARAGE_TEST_KEY_ID"),
      secretAccessKey: "f".repeat(64),
    });
    const err = await bad.get("a.jpg").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).status).toBe(403);
  });
});
```

- [ ] **Step 3: Write the runner** — `scripts/garage-test.sh`

```sh
#!/bin/sh
# Integration test for @erp/shared/storage against a throwaway Garage.
set -eu

IMAGE="dxflrs/garage:v2.4.1"
NAME="erp-shared-garage-test"
PORT="${GARAGE_TEST_PORT:-13999}"
KEY_ID="GK0123456789abcdef01234567"
SECRET="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
BUCKET="storage-test"
CONF="$(mktemp -t garage-test.XXXXXX)"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -f "$CONF"; }
trap cleanup EXIT INT TERM
cleanup

cat > "$CONF" <<TOML
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "$(openssl rand -hex 32)"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
TOML

docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3900" -v "$CONF:/etc/garage.toml:ro" "$IMAGE" >/dev/null
g() { docker exec -e RUST_LOG=warn "$NAME" /garage "$@"; }

i=0
until g status >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 30 ] && { echo "Garage did not start"; docker logs "$NAME"; exit 1; }
  sleep 1
done

NODE="$(g node id -q | cut -d@ -f1)"
g layout assign -z dc1 -c 1G "$NODE" >/dev/null
g layout apply --version 1 >/dev/null
g bucket create "$BUCKET" >/dev/null
g key import --yes -n storage-test "$KEY_ID" "$SECRET" >/dev/null
g bucket allow --read --write "$BUCKET" --key storage-test >/dev/null

GARAGE_TEST_ENDPOINT="http://127.0.0.1:$PORT" \
GARAGE_TEST_BUCKET="$BUCKET" \
GARAGE_TEST_KEY_ID="$KEY_ID" \
GARAGE_TEST_SECRET="$SECRET" \
  npx vitest run --config vitest.integration.config.ts
```

```bash
cd ~/Projects/sparkerp/shared-storage && chmod +x scripts/garage-test.sh
```

- [ ] **Step 4: npm script** — in `package.json` `scripts`, after `"test"`:

```jsonc
    "test": "vitest run",
    "test:integration": "sh scripts/garage-test.sh"
```

- [ ] **Step 5: Run it** (Docker must be running; first run pulls the image)

Run: `cd ~/Projects/sparkerp/shared-storage && npm run test:integration && docker ps -a --filter name=erp-shared-garage-test --format '{{.Names}}'`
Expected: `s3.integration.test.ts (5 tests)` PASS; the `docker ps` line prints nothing (the trap removed the container). Then `npm test` again — the integration file must **not** appear in its list.

- [ ] **Step 6: Typecheck**

Run: `cd ~/Projects/sparkerp/shared-storage && npx tsc --noEmit`
Expected: nothing printed.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/sparkerp/shared-storage && git branch --show-current && git add scripts/garage-test.sh vitest.config.ts vitest.integration.config.ts src/storage/s3.integration.test.ts package.json && git commit -m "test(storage): optional round trip against a throwaway Garage

The unit tests prove the request shape; only a real Garage proves that
its canonical path and signature check agree with ours for Cyrillic and
reserved characters, and that NoSuchBucket and a wrong secret surface as
StorageError. Docker-only, so it stays out of npm test (spec 6, 9.4).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `./storage` export, portability guard, README, v0.4.0

**Files:**
- Create: `src/storage/index.ts`, `src/storage/portability.test.ts`
- Modify: `package.json` (`exports`, `description`, `version`), `package-lock.json` (version), `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: `import { assertValidKey, InvalidStorageKeyError, MemoryStorage, S3Storage, StorageError, type ObjectInfo, type S3StorageOptions, type StorageAdapter, type StoredObject } from "@erp/shared/storage"`. `encodeKey` and `toBytes` stay internal.

- [ ] **Step 1: Write the failing portability test** — `src/storage/portability.test.ts`

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// R75: the storage code must run on Cloudflare Workers too — fetch and
// crypto.subtle only. Tests may use Node; shipped files may not.
const DIR = join(import.meta.dirname, ".");
const shipped = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("storage portability (R75)", () => {
  it("finds the shipped files", () => {
    expect(shipped).toEqual(expect.arrayContaining(["adapter.ts", "index.ts", "key.ts", "memory.ts", "s3.ts"]));
  });

  it.each(shipped)("%s uses no Node-only API", (file) => {
    const src = readFileSync(join(DIR, file), "utf8");
    expect(src).not.toMatch(/from\s+["']node:/);
    expect(src).not.toMatch(/\brequire\(/);
    expect(src).not.toMatch(/\bBuffer\b/);
    expect(src).not.toMatch(/\bprocess\./);
  });
});
```

Run: `cd ~/Projects/sparkerp/shared-storage && npx vitest run src/storage/portability.test.ts`
Expected: FAIL — `finds the shipped files` misses `index.ts`.

- [ ] **Step 2: `src/storage/index.ts`**

```ts
export {
  InvalidStorageKeyError,
  StorageError,
  type ObjectInfo,
  type StorageAdapter,
  type StoredObject,
} from "./adapter.js";
export { assertValidKey } from "./key.js";
export { MemoryStorage } from "./memory.js";
export { S3Storage, type S3StorageOptions } from "./s3.js";
```

Run: `cd ~/Projects/sparkerp/shared-storage && npx vitest run src/storage/portability.test.ts`
Expected: PASS (one "finds" test + one per shipped file: adapter, bytes, index, key, memory, s3).

- [ ] **Step 3: `package.json`** — with `Edit`, not a rewrite. Add the export after `./e2e`, and widen the description:

```jsonc
  "description": "Shared ERP design tokens, E2E helpers and object storage adapter for the ERP module repos",
  "exports": {
    "./tokens": { ... unchanged ... },
    "./tokens/theme.css": "./dist/tokens/theme.css",
    "./e2e": { ... unchanged ... },
    "./storage": {
      "types": "./dist/storage/index.d.ts",
      "import": "./dist/storage/index.js"
    }
  },
```

Then the version in both files (no tag yet):

```bash
cd ~/Projects/sparkerp/shared-storage && npm version 0.4.0 --no-git-tag-version
```

- [ ] **Step 4: Build and prove Node loads `dist/storage` directly** (the `.js` extension rule; tests stay out of `dist`)

```bash
cd ~/Projects/sparkerp/shared-storage && rm -rf dist && npm run build && ls dist/storage && test ! -e dist/storage/s3.test.js && test ! -e dist/storage/s3.integration.test.js && node -e "import('@erp/shared/storage').then((m) => console.log(Object.keys(m).sort().join(' ')))"
```

Expected: `adapter.d.ts adapter.js bytes.d.ts bytes.js index.d.ts index.js key.d.ts key.js memory.d.ts memory.js s3.d.ts s3.js`, then `InvalidStorageKeyError MemoryStorage S3Storage StorageError assertValidKey`. (The self-reference `@erp/shared/storage` resolves through the package's own `exports` map — it proves the map, not just the file. `ERR_MODULE_NOT_FOUND` for `./key` means a relative import lacks `.js`; `ERR_PACKAGE_PATH_NOT_EXPORTED` means the `exports` entry is wrong.)

- [ ] **Step 5: Full test + typecheck**

Run: `cd ~/Projects/sparkerp/shared-storage && npm test && npx tsc --noEmit`
Expected: all tests PASS (tokens, e2e, storage — the integration file not among them); `tsc` prints nothing.

- [ ] **Step 6: README** — with `Edit`:

(a) First paragraph: `Shared design tokens (\`/tokens\`) and E2E helpers (\`/e2e\`, since v0.3.0) for the` → `Shared design tokens (\`/tokens\`), E2E helpers (\`/e2e\`, since v0.3.0) and the object storage adapter (\`/storage\`, since v0.4.0) for the`.

(b) Install block: `#v0.3.1` → `#v0.4.0`.

(c) After the pnpm `onlyBuiltDependencies` block (which stays as it is), add:

```markdown
Since v0.4.0 the package has one runtime dependency, `aws4fetch` (MIT, no
install script). A consumer's lockfile gains it on the bump; tokens- or
e2e-only consumers download it but never load it. `onlyBuiltDependencies`
stays `["@erp/shared"]` — aws4fetch has nothing to build.
```

(d) After the «E2E helpers» section, before «Release flow», add:

````markdown
## Object storage (`@erp/shared/storage`, since v0.4.0)

One adapter for every module's files — design: erp-core
`docs/superpowers/specs/2026-10-01-object-storage-and-product-images-design.md` §2.2.
Only `fetch` + `crypto.subtle` (R75): the same code runs on Node and Cloudflare Workers.

**R110, short:** files go through `StorageAdapter` only. The DB stores the
**object key**, never a URL. Keys are immutable — new content means a new key,
never an overwrite. Each module has its own bucket and its own access key and
never reads or writes another module's bucket; it asks that module's API.
An attachment belongs to the module that owns the document.

```ts
import { MemoryStorage, S3Storage, type StorageAdapter } from "@erp/shared/storage";

// Garage (internal stack; Mac dev: http://localhost:13900)
const storage: StorageAdapter = new S3Storage({
  endpoint: "http://object-storage:3900",
  region: "garage",                          // always explicit — see below
  bucket: "core",                            // the module's own bucket
  accessKeyId: config.storage.accessKeyId,   // from env via loadConfig() (R4, R66)
  secretAccessKey: config.storage.secretAccessKey,
});

// Cloudflare R2 — same class, other values
new S3Storage({
  endpoint: "https://<account_id>.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "core",
  accessKeyId, secretAccessKey,
});

// Unit tests
const storage = new MemoryStorage();
```

`region` is required: aws4fetch guesses it only from AWS and R2 host names,
and Garage signs with its own `s3_region` (`garage` in our stack).

| Call | Object missing | Other failure |
|---|---|---|
| `get(key)` | `null` | `StorageError` (`status`, S3 `code`) |
| `head(key)` | `null` | `StorageError` |
| `delete(key)` | success (idempotent) | `StorageError` |
| `put(key, data, type)` | — | `StorageError` |

- A missing **bucket** (404 `NoSuchBucket`) throws from `get`/`delete`, so a
  bucket typo never reads as «no file». `head` cannot tell (a HEAD answer has
  no body) and returns `null`.
- No retries inside the adapter — the caller decides. A network failure
  (store down, DNS) rejects with `fetch`'s own error (`TypeError`), not
  `StorageError`; map both when you turn them into a 503.
- A bad key — empty, leading `/`, a `.` or `..` segment, any `\` — throws
  `InvalidStorageKeyError` before any request. `assertValidKey` is exported
  for callers that build keys.
- A `ReadableStream` body is read into memory first (S3 needs a length);
  objects here are small (images ≤ 3 MB, documents ≤ 10 MB).

> **AWS SDK v3 against Garage:** from v3.729 the SDK adds checksum headers that
> Garage rejects ([garage#1236](https://git.deuxfleurs.fr/Deuxfleurs/garage/issues/1236),
> [aws-sdk-js-v3#6810](https://github.com/aws/aws-sdk-js-v3/issues/6810)). If a
> module ever uses the SDK instead of this adapter, set
> `requestChecksumCalculation: "WHEN_REQUIRED"` (and
> `responseChecksumValidation: "WHEN_REQUIRED"`) on the client. aws4fetch sends
> no checksum headers.

`npm run test:integration` runs the adapter against a throwaway Garage in
Docker (`scripts/garage-test.sh`); `npm test` does not need Docker.
````

(e) «Release flow» step 1: `Change tokens → \`npm test\` → commit.` → `Change code → \`npm test\` (and \`npm run test:integration\` when \`src/storage\` changed) → commit.`

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/sparkerp/shared-storage && git branch --show-current && git add src/storage/index.ts src/storage/portability.test.ts package.json package-lock.json README.md && git commit -m "feat(storage): export ./storage and release 0.4.0

A subpath of the existing package, like ./e2e: modules already pin
@erp/shared by tag, and tokens consumers never load dist/storage. Minor
bump because a door was added. The portability test keeps Node-only APIs
out of the shipped files so the adapter stays usable on Workers (R75).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Merge, tag `v0.4.0`, push — gated on the user

**Files:** none changed (git only).

**Interfaces:**
- Produces: tag `v0.4.0` on GitHub `tuguldur976/erp-shared`, so consumers can pin `git+https://github.com/tuguldur976/erp-shared.git#v0.4.0`.

- [ ] **Step 1: Final check on the branch**

```bash
cd ~/Projects/sparkerp/shared-storage && git branch --show-current && git status --short && git log --oneline main..feat/storage && npm test && npx tsc --noEmit && npm run test:integration
```

Expected: `feat/storage`; clean tree; 5 commits (Tasks 1–5); all tests pass. If Docker is unavailable, say so to the user — the integration run is optional but should not be silently skipped.

- [ ] **Step 2: STOP — ask the user** before merge, tag and push: «shared `feat/storage` → `main` merge, tag `v0.4.0`, `git push origin main v0.4.0` хийх үү?» Wait for an explicit yes.

- [ ] **Step 3: On yes — merge in the main checkout, tag, push** (the main checkout is on `main`; check first, and stop if it is not or if it has uncommitted changes)

```bash
cd ~/Projects/sparkerp/shared && git branch --show-current && git status --short && git pull --ff-only && git merge --no-ff feat/storage -m "merge: @erp/shared/storage — one S3 adapter for every module (v0.4.0)" && git tag v0.4.0 && git push origin main v0.4.0 && git ls-remote --tags origin v0.4.0
```

Expected: `main`, empty status, the merge, and `ls-remote` printing one line for `refs/tags/v0.4.0`. If push times out in the sandbox, try once more, then tell the user and stop (the other plans install the tag from GitHub).

- [ ] **Step 4: Remove the worktree and the merged branch**

```bash
git -C ~/Projects/sparkerp/shared worktree remove ../shared-storage && git -C ~/Projects/sparkerp/shared branch -d feat/storage && git -C ~/Projects/sparkerp/shared worktree list
```

- [ ] **Step 5: Tell the user** the tag is live and that the umbrella and erp-core plans can now pin `#v0.4.0`; offer the ACTIVITY-LOG line (global CLAUDE.md §1) with the merge hash.
