# `@erp/shared/e2e` — Core-той холбоотой E2E туслахууд

> Статус: **батлагдсан дизайн (2026-09-28, хэрэглэгчтэй brainstorm)**. Шийдвэрүүд **S1–S9**.
> Эх үүсвэр: `~/Projects/sparkerp/docs/prompts/33-shared-e2e-core-helpers.md`.
> Хаах зүйл: scm spec `2026-09-27-scm-playwright-e2e-design.md` «Follow-up (decided 2026-09-27)»,
> erp-core spec `2026-09-27-core-web-e2e-design.md` §8a «Хойшилсон» (E10).

## 1. Яагаад

scm (`scm/e2e/support/`) ба erp-core (`erp-core/e2e/support/`) хоёулаа Core-д нэвтэрч, `.env.e2e`
уншиж, cookie-г `storageState` JSON-д хадгалж, STALE STACK анхааруулга гаргадаг — **хоёр өөр
хуулбараар, хоёр өөр аргаар**:

| | scm | erp-core |
|---|---|---|
| Нэвтрэх | core-api руу шууд `POST /auth/sign-in/email` (`127.0.0.1:14000`, dev порт) | `/login` формоор, браузераар |
| Cookie дахин ашиглах | `/scm/session/refresh` | `/` нээгээд `/login` руу шилжих эсэх |
| STALE | `stackFreshness()` (`global-setup.ts`) | `staleStackWarning()` (`support/stale.ts`) |

scm spec «хоёр дахь модуль Playwright-д орох үед `@erp/shared/e2e` руу» гэж шийдсэн; erp-core хоёр
дахь нь болсон (R107). Энэ баримт тэр шилжүүлгийг тогтооно.

## 2. Шийдвэрүүд

**S1 — Нэвтрэх нэг арга: core-web-ийн нийтийн auth proxy.**
`POST {baseURL}/api/core/auth/sign-in/email` (`erp-core/apps/core-web/app/api/core/auth/[...path]/route.ts`).
Нэвтрэх форм яг энэ рүү илгээдэг; proxy нь core-api-ийн Set-Cookie-г байтаар нь буцааж, body-г
буцаадаггүй.
*Яагаад:* браузергүй (хурдан), dev порт шаардахгүй (B-ийн сул тал), core-web-ийн UI текстээс
хамаарахгүй (A-ийн сул тал — `mn.json` scm-д байхгүй). Playwright-ийн өөрийн зөвлөмж (нэвтрэх
хуудсыг нэг тест шалгана, бусад нь API-аар нэвтэрч `storageState`-ийг дахин ашиглана)-тай нийцнэ.
*Үр дагавар:* erp-core нэвтрэх хуудсыг далд шалгахаа болих тул `login.spec.ts` нэмнэ (S6).

**S2 — Байршил: одоогийн `@erp/shared` багцын шинэ subpath `./e2e`.**
Шинэ repo (8 дахь) биш, umbrella `file:` холбоос (tag-гүй) биш.
*Яагаад:* Turborepo/Nx санаа тус бүрийг тусдаа дотоод package болгодог (`@repo/ui`,
`@repo/eslint-config`); тусдаа repo-той polyrepo-д хамгийн ойр, хямд хувилбар нь subpath export
(`./tokens`, `./e2e`). `tokens`-ийн хэрэглэгч `dist/e2e/`-г ачаалахгүй. README аль хэдийн «Later:
`/types`, `/utils`» гэж олон зорилготой байхаар төлөвлөсөн. Modal spec U21-ийн анхааруулга нь UI
компонентын тухай — Node туслахад хамаарахгүй. Хэт томорвол тусдаа багц руу салгахад зөвхөн
import зам өөрчлөгдөнө.

**S3 — `@playwright/test`-ээс хамаарахгүй.** Хуваалцах код нь цэвэр Node (`fetch`, `fs`,
`child_process`). `StorageState` төрлийг өөрсдөө тодорхойлно; peer dependency байхгүй. Playwright-ийн
API ашигладаг хэсэг (setup project, teardown, spec) модульд үлдэнэ.

**S4 — Хувилбар: github tag хэвээр, `v0.3.0`.** Minor — шинэ subpath. Хэрэглэгчид
`git+https://github.com/tuguldur976/erp-shared.git#v0.3.0`. `tokens`-д өөрчлөлт байхгүй. TS 5.6 /
vitest 3 хэвээр (`.d.ts` нь TS 7-той хэрэглэгчдэд ажиллана). core-web-ийн `github:` товчлолыг
`git+https:` болгох нь энэ ажлын хүрээнд биш.

**S5 — Юу шилжих, юу үлдэх.** Дүрэм: хоёр модуль хоёулаа хэрэглэдэг, модулийн UI-аас хамаардаггүй
зүйл л shared руу; ганц хэрэглэгчтэй зүйл модульд үлдэнэ.

| Хэсэг | Хаана |
|---|---|
| `.env.e2e` унших, `E2E_BASE_URL`, `E2E_ADMIN_*` | **shared** |
| Core-д нэвтрэх, session амьд эсэх, «дахин ашигла эсвэл нэвтэр» + JSON | **shared** |
| STALE STACK шалгалт | **shared** (контейнер, замыг модуль өгнө) |
| `scm_jwt`, seed (`E2E_USERS`, компани, дүр), `coreApi`, `upsertEnvLine` | scm |
| `t()`, `e2eCode`, teardown, `routes`, `list` | erp-core |

**S6 — erp-core-д `login.spec.ts`.** Цэвэр context-оор `/login` формыг бөглөж нүүр хуудас нээгдэхийг
шалгана. «Буруу нууц үг» тохиолдлыг **нэмэхгүй**: нэг ажиллуулалт аль хэдийн ≤2 нэвтрэлт хийнэ
(`ensureCoreSession` 0–1 + `login.spec` 1), хязгаар 3 / 10 сек.

**S7 — `.env.e2e`-ийн байршил хэвээр.** scm — repo root, erp-core — `e2e/`. Замыг модуль дамжуулна;
нууц файл зөөгдөхгүй.

**S8 — store-ops одоо нэгдэхгүй.** Түүний Playwright өөрийн нэвтрэх хуудсаар нэвтэрдэг (SSO-оос
өмнөх, `apps/web/tests/e2e/auth-helper.ts`). Core session-д шилжих үед (`store-ops/e2e/`, erp-core
spec E10-ийн TODO) энэ багцыг хэрэглэнэ — TODO мөр.

**S9 — Ажлын дараалал: нэг удаад нэг repo.** shared → tag `v0.3.0` + push → erp-core → scm → stack
дээр `pnpm e2e` (merge-ийн дараа, хэрэглэгчийн зөвшөөрлөөр). Хэрэглэгчид tag-ийг GitHub-аас татдаг
тул push-ээс өмнө тэднийг туршихгүй.

## 3. API

Файлууд: `src/e2e/{env,session,storage,stale,index}.ts`; `package.json` `exports`-д
`"./e2e": { "types": "./dist/e2e/index.d.ts", "import": "./dist/e2e/index.js" }`.
`dist/` нь Node-оор шууд ажиллах тул relative import бүр `.js` өргөтгөлтэй (`from './session.js'`).

### 3.1 env

```ts
loadEnvFile(path: string): boolean
```
Файл байвал `process.loadEnvFile(path)`, `true`; байхгүй бол `false` (алдаа биш — утгуудыг shell-ээс
өгч болно).

```ts
baseUrl(env?: Record<string, string | undefined>): string
```
`E2E_BASE_URL`, хоосон/байхгүй бол `http://erp.localhost`. Default `env` = `process.env`.

```ts
adminCredentials(envFile: string, env?: Record<string, string | undefined>): { email: string; password: string }
```
`E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`. Аль нэг нь хоосон бол:
`Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in <envFile>. They are a Core admin account on the stack under test.`
Утгыг хэзээ ч мессежид, log-д бичихгүй.

### 3.2 session

```ts
interface Cookie { name: string; value: string }
SESSION_COOKIE_NAMES = ['erp.session_token', '__Secure-erp.session_token']
```
(core-web `lib/session-cookie.ts`-ийн хуулбар — core-api-ийн нэрийг хүн гараар тааруулдаг; https
дээр Better Auth `__Secure-` угтвар нэмдэг.)

```ts
signInCore(baseURL: string, email: string, password: string): Promise<Cookie[]>
```
`POST {baseURL}/api/core/auth/sign-in/email`, headers `content-type: application/json`,
`origin: baseURL` (core-api `CORE_WEB_ORIGIN`-д итгэдэг). 2xx бол Set-Cookie-ийн **бүх** хос;
session cookie байхгүй бол алдаа. Алдааны мессеж:

| Хариу | Мессеж |
|---|---|
| 401 | `Core refused sign-in for <email> (401): wrong email or password.` — хувьсагчийн нэрийг бичихгүй: email нь admin ч, scm-ийн E2E хэрэглэгч (`E2E_USER_A_PASSWORD`) ч байж болно; аль хувьсагч гэдгийг email-ээс хүн шууд таньна |
| 429 | `Core sign-in limit hit (3 per 10 s). Wait 10 s and run again.` |
| бусад статус (403, 404, 500 …) | `Core sign-in at <baseURL> answered <status>.` — «not reachable» биш: 403 (Origin таарахгүй) эсвэл 404 (proxy-ийн allowlist) үед stack ажиллаж байгаа |
| сүлжээний алдаа | `Stack not reachable at <baseURL> (<ECONNREFUSED …>). Is it running?` |

Туслах: `cookieHeader(cookies): string` (`a=1; b=2` — scm seed-ийн `coreApi`-д),
`hasSessionCookie(cookies): boolean`.

```ts
coreSessionAlive(baseURL: string, cookies: Cookie[]): Promise<boolean>
```
`GET {baseURL}/`, `redirect: 'manual'`, `cookie` header. 2xx → `true`; 3xx бөгөөд `location`-ийн
pathname `/login`-оор эхэлбэл → `false`; бусад → алдаа (`Stack not reachable …`).
*Яагаад бусад нь алдаа:* stack унтарсныг «cookie үхсэн» гэж андуурч дахин нэвтэрвэл хязгаарыг
дэмий шатааж, жинхэнэ шалтгааныг нууна.

### 3.3 storage

```ts
interface StorageCookie { name; value; domain; path; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Lax' | 'Strict' | 'None' }
interface StorageState { cookies: StorageCookie[]; origins: unknown[] }
readStorageState(path: string): StorageState | null   // байхгүй / эвдэрсэн JSON → null
writeStorageState(path: string, state: StorageState): void   // хавтсыг үүсгэнэ
toStorageCookie(baseURL: string, cookie: Cookie, path?: string): StorageCookie
```
`toStorageCookie`: `domain` = baseURL-ийн hostname, `path` default `/`, `expires: -1`,
`httpOnly: true`, `secure` = https эсэх, `sameSite: 'Lax'`.

```ts
ensureCoreSession(opts: {
  baseURL: string
  statePath: string
  credentials: () => { email: string; password: string }
}): Promise<{ cookies: Cookie[]; reused: boolean }>
```
1. `readStorageState` → session cookie байвал `coreSessionAlive` → `true` бол `{ reused: true }`
   (файлыг хөндөхгүй; бусад cookie, жишээ нь `scm_jwt`, хэвээр).
2. Үгүй бол `credentials()` (зөвхөн энд дуудагдана — дахин ашиглах үед нууц үг асуухгүй) →
   `signInCore` → зөвхөн Core cookie-гоор `writeStorageState` → `{ reused: false }`.

### 3.4 stale

```ts
staleStackWarning(o: { service: string; imageCreated: string; lastCommit: string; rebuildHint: string }): string | null
checkStackFreshness(o: {
  container: string; repoRoot: string; paths: string[]; service: string; rebuildHint: string
}): { state: 'fresh' | 'stale' | 'unknown'; message: string }
```
`staleStackWarning` цэвэр: огноо уншигдахгүй эсвэл commit ≤ image бол `null`; эс бөгөөс
`⚠ STALE STACK — <service> image built …, last product commit ….` + «ажиллана, гэхдээ сүүлийн
өөрчлөлтийг баталж чадахгүй» + `rebuildHint`. `checkStackFreshness` нь `docker inspect` ба
`git log -1 --format=%cI -- <paths>`-ийг `execFileSync`-ээр (`cwd: repoRoot`) ажиллуулна; хэзээ ч
throw хийхгүй (`unknown` + шалтгаан). Хэвлэх нь модулийн ажил.

## 4. Хэрэглэгчдийн өөрчлөлт

### erp-core (worktree `../erp-core-shared-e2e`, branch `feat/shared-e2e`)

| Файл | Өөрчлөлт |
|---|---|
| `e2e/package.json` | devDependency `@erp/shared` `#v0.3.0` (root-д `onlyBuiltDependencies` бий) |
| `e2e/support/env.ts` | `ENV_FILE`, `loadEnvFile(ENV_FILE)`, `BASE_URL = baseUrl()`, `AUTH_STATE` л үлдэнэ |
| `e2e/auth.setup.ts` | `ensureCoreSession({ baseURL, statePath: AUTH_STATE, credentials: () => adminCredentials(ENV_FILE) })` — браузергүй |
| `e2e/login.spec.ts` | Шинэ (S6) — `storageState` хоосон context |
| `e2e/global-setup.ts` | `checkStackFreshness({ container, repoRoot, paths: ['apps/core-web', ':(exclude)apps/core-web/tests'], service: 'core-web', rebuildHint })` |
| `e2e/support/stale.ts`, `stale.test.ts`, `env.test.ts` | Устгана (тест нь shared-д) |
| `e2e/README.md` | Core нэвтрэлт `@erp/shared/e2e`-ээс |

### scm (worktree `../scm-shared-e2e`, branch `feat/shared-e2e`)

| Файл | Өөрчлөлт |
|---|---|
| `package.json` | `#v0.2.0` → `#v0.3.0` |
| `e2e/support/env.ts` | Нийтлэг хэсгийг shared-ээс; `E2E_USERS`, A/B нууц үг, `E2E_CORE_API_URL` үлдэнэ |
| `e2e/support/core.ts` | `signIn` устгана; `coreApi` үлдэнэ (cookie header-ийг `Cookie[]`-ээс) |
| `e2e/global-setup.ts` | `ensureCoreSession` → `/scm/session/refresh`-ээр `scm_jwt` → `writeStorageState` (Core cookie + `scm_jwt`, path `/scm`); `stackFreshness` → `checkStackFreshness` |
| `e2e/seed/seed.ts` | Admin-ийг `signInCore`-оор; `/api/v1/core` дуудлага `:14000`-оор хэвээр |
| `e2e/README.md` | Тест нэвтрэлтэд `:14000` хэрэггүй болсон; зөвхөн `pnpm e2e:seed` |

## 5. Тест

- shared `src/e2e/*.test.ts` (vitest, `pnpm test`/`npm test`): цэвэр функцууд env объектоор;
  `signInCore`/`coreSessionAlive`/`ensureCoreSession` — тест дотор `node:http` сервер (санамсаргүй
  порт) 2xx+Set-Cookie, 401, 429, 502, `/login` redirect өгнө; mock-гүй. `ensureCoreSession`-ийн
  гурван тохиолдол (файлгүй / амьд / үхсэн) — `mkdtemp` + сервер хэдэн удаа sign-in хүлээн авсныг
  тоолно (0/1). `checkStackFreshness` — docker/git байхгүй `repoRoot`/контейнер дээр `unknown`.
- erp-core, scm: `pnpm test`, `pnpm typecheck` ногоон.
- Stack: хоёр repo-д `pnpm e2e` ногоон — зөвхөн `main`-д merge хийсний дараа, хэрэглэгчийн
  зөвшөөрлөөр.

## 6. Хийхгүй

- Модулийн spec, page object-ыг shared руу зөөх.
- CI-д E2E (R107: stack шаарддаг).
- store-ops (S8); core-web-ийн `github:` → `git+https:` (S4).
- Push, stack rebuild, merge — хэрэглэгчээс асуулгүйгээр.

## 7. Эрсдэл

| Эрсдэл | Хариу |
|---|---|
| core-api cookie нэрийг солих | `SESSION_COOKIE_NAMES` гурав дахь хуулбар болно; `signInCore` «session cookie байхгүй» гэж шууд унана — чимээгүй биш |
| auth proxy-ийн allowlist-аас `sign-in/email` хасагдах | `signInCore` → `Core sign-in at … answered 404.` — мессежид статус орно |
| prompt 32 erp-core `e2e/`-г зэрэг засах | Merge-ийн өмнө `main` дээр rebase, тэдний мөрийг хадгална |
| scm-д өөр session идэвхтэй | Тусдаа worktree; үндсэн checkout-ийн branch-ийг солихгүй |
