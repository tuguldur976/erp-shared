# @erp/shared

Shared design tokens (v0.1) for the modular ERP repos:
[spark-resellers](https://github.com/tuguldur976/spark-resellers) (Sales / Order-to-Cash)
and supplychain (SCM). Later: `/types`, `/utils`.

## Install (git dependency, pinned to a tag)

```jsonc
// pnpm consumer (spark-resellers) and npm consumer (supplychain) — same line:
"dependencies": { "@erp/shared": "github:tuguldur976/erp-shared#v0.1.0" }
```

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

## Release flow

1. Change tokens → `npm test` → commit.
2. Bump `version` in package.json, `git tag vX.Y.Z`, push with `--tags`.
3. In each consumer: bump the `#vX.Y.Z` pin → `pnpm install` / `npm install` → commit.

Consumers update on their own schedule; tag pins never break the laggard.
