# @erp/shared

Shared design tokens (`/tokens`) and E2E helpers (`/e2e`, since v0.3.0) for the
modular ERP repos: erp-core, scm, and
[spark-resellers](https://github.com/tuguldur976/spark-resellers) (Sales / Order-to-Cash).
Later: `/types`, `/utils`.

## Install (git dependency, pinned to a tag)

```jsonc
// pnpm consumer (spark-resellers) and npm consumer (supplychain) — same line:
"dependencies": { "@erp/shared": "git+https://github.com/tuguldur976/erp-shared.git#v0.1.0" }
```

Use the explicit git+https form — the github: shorthand can resolve to git+ssh, which fails in containers/CI without GitHub SSH keys.

pnpm 10 blocks dependency build scripts by default; the consumer's root
package.json needs:

```jsonc
"pnpm": { "onlyBuiltDependencies": ["@erp/shared"] }
```

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
saved cookie is always tried first. `checkStackFreshness` warns when the running
container is older than the module's last product commit.

## Release flow

1. Change tokens → `npm test` → commit.
2. Bump `version` in package.json, `git tag vX.Y.Z`, push with `--tags`.
3. In each consumer: bump the `#vX.Y.Z` pin → `pnpm install` / `npm install` → commit.

Consumers update on their own schedule; tag pins never break the laggard.
