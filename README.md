# @erp/shared

Shared design tokens (`/tokens`), E2E helpers (`/e2e`, since v0.3.0) and the object storage adapter (`/storage`, since v0.4.0) for the
modular ERP repos: erp-core, scm, and
[spark-resellers](https://github.com/tuguldur976/spark-resellers) (Sales / Order-to-Cash).
Later: `/types`, `/utils`.

## Install (git dependency, pinned to a tag)

```jsonc
// pnpm consumer (spark-resellers) and npm consumer (supplychain) — same line:
"dependencies": { "@erp/shared": "git+https://github.com/tuguldur976/erp-shared.git#v0.4.0" }
```

Use the explicit git+https form — the github: shorthand can resolve to git+ssh, which fails in containers/CI without GitHub SSH keys.

pnpm 10 blocks dependency build scripts by default; the consumer's root
package.json needs:

```jsonc
"pnpm": { "onlyBuiltDependencies": ["@erp/shared"] }
```

Since v0.4.0 the package has one runtime dependency, `aws4fetch` (MIT, no
install script). A consumer's lockfile gains it on the bump; tokens- or
e2e-only consumers download it but never load it. `onlyBuiltDependencies`
stays `["@erp/shared"]` — aws4fetch has nothing to build.

## Usage

```ts
import { C, FONT, PALETTE, RADIUS, Z, toCssVars } from "@erp/shared/tokens";
```

```css
/* All ERP apps — light is the default theme, `.dark` class opts into dark: */
@import "@erp/shared/tokens/theme.css";
```

`theme.css` carries everything R93 assigns to it: the `--c-*` colours, the
`--erp-radius-*` radii, `--erp-font-sans`, and the `@font-face` rules for
**Inter** (since v0.2.0). The font files ship inside this package, next to
`theme.css`, so an app loads no web font of its own — no Google Fonts link.
A Tailwind v4 app maps the font once:

```css
@theme inline {
  --font-sans: var(--erp-font-sans);
}
```

`FONT` in `/tokens` is `var(--erp-font-sans)`, a reference like `C`, so inline
styles follow the same variable.

v0.1.0 used DM Sans, which has no Cyrillic: Mongolian text fell back to
another font mid-line. Inter covers Cyrillic including Ө and Ү, and the ₮ sign.

## E2E helpers (`@erp/shared/e2e`, since v0.3.0)

Core sign-in, env and storageState for every module's Playwright suite
(design: `docs/superpowers/specs/2026-09-28-shared-e2e-design.md`). Plain Node —
no Playwright import. Specs and page objects stay in each module.

```ts
import { adminCredentials, baseUrl, ensureCoreSession, loadEnvFile } from "@erp/shared/e2e";

loadEnvFile(ENV_FILE);                       // the module's own .env.e2e; missing = values from the shell
await ensureCoreSession({                    // reuses the saved cookie while it is alive
  baseURL: baseUrl(),                        // E2E_BASE_URL, default http://erp.localhost
  statePath: AUTH_STATE,                     // Playwright storageState file
  credentials: () => adminCredentials(ENV_FILE),
});
```

Sign-in goes through core-web's public proxy `POST /api/core/auth/sign-in/email`,
so no dev port is needed. Core allows 3 sign-ins per 10 s — that is why a live
saved cookie is always tried first. Every suite now signs in through that one
door, so they share one budget: scm's seed plus its two users is already 3.
Leave 10 s of quiet before the next suite or a re-run; the window restarts
only after 10 s without a sign-in. `checkStackFreshness` warns when the running
container is older than the module's last product commit.

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
const testStorage = new MemoryStorage();
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

## Release flow

1. Change code → `npm test` (and `npm run test:integration` when `src/storage` changed) → commit.
2. Bump `version` in package.json, `git tag vX.Y.Z`, push with `--tags`.
3. In each consumer: bump the `#vX.Y.Z` pin → `pnpm install` / `npm install` → commit.

Consumers update on their own schedule; tag pins never break the laggard.
