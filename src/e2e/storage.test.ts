import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startFakeStack, type FakeStack, type FakeRequest } from "./fake-stack.fixture.js";
import { SIGN_IN_PATH } from "./session.js";
import {
  ensureCoreSession,
  readStorageState,
  toStorageCookie,
  writeStorageState,
  type StorageState,
} from "./storage.js";

let dir = "";
let stack: FakeStack | null = null;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shared-e2e-storage-"));
});
afterEach(async () => {
  await stack?.close();
  stack = null;
  rmSync(dir, { recursive: true, force: true });
});

const signIns = (s: FakeStack): FakeRequest[] => s.requests.filter((r) => r.url === SIGN_IN_PATH);

/** A stack whose / is 200 for cookie "erp.session_token=live" and 307 → /login otherwise. */
async function stackWithSession(): Promise<FakeStack> {
  return startFakeStack((req, res) => {
    if (req.url === SIGN_IN_PATH) {
      res.setHeader("set-cookie", "erp.session_token=fresh; Path=/; HttpOnly");
      res.end();
      return;
    }
    const live = (req.headers.cookie ?? "").includes("erp.session_token=live");
    res.statusCode = live ? 200 : 307;
    if (!live) res.setHeader("location", "/login?next=%2F");
    res.end();
  });
}

function stored(baseURL: string, value: string): StorageState {
  return {
    cookies: [
      toStorageCookie(baseURL, { name: "erp.session_token", value }),
      toStorageCookie(baseURL, { name: "scm_jwt", value: "jwt" }, "/scm"),
    ],
    origins: [],
  };
}

describe("toStorageCookie", () => {
  it("scopes the cookie to the stack's host", () => {
    expect(toStorageCookie("http://erp.localhost", { name: "a", value: "1" })).toEqual({
      name: "a",
      value: "1",
      domain: "erp.localhost",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    });
  });

  // Review Focus 3.
  it("marks the cookie secure on https", () => {
    expect(toStorageCookie("https://erp.example.mn", { name: "a", value: "1" }, "/scm")).toMatchObject({
      domain: "erp.example.mn",
      path: "/scm",
      secure: true,
    });
  });
});

describe("readStorageState / writeStorageState", () => {
  it("round-trips and creates the folder", () => {
    const path = join(dir, ".auth", "admin.json");
    const state = stored("http://erp.localhost", "v");
    writeStorageState(path, state);
    expect(readStorageState(path)).toEqual(state);
  });

  it("answers null for a missing file", () => {
    expect(readStorageState(join(dir, "nope.json"))).toBeNull();
  });

  // Review Focus 4.
  it("answers null for a file that is not storage state", () => {
    const path = join(dir, "bad.json");
    writeFileSync(path, "{ half-written");
    expect(readStorageState(path)).toBeNull();
    writeFileSync(path, JSON.stringify({ hello: "world" }));
    expect(readStorageState(path)).toBeNull();
  });
});

describe("ensureCoreSession", () => {
  const creds = { email: "admin@spark.mn", password: "pw" };

  it("signs in once and writes the file when there is none", async () => {
    stack = await stackWithSession();
    const statePath = join(dir, ".auth", "admin.json");
    let asked = 0;

    const result = await ensureCoreSession({
      baseURL: stack.baseURL,
      statePath,
      credentials: () => {
        asked += 1;
        return creds;
      },
    });

    expect(result).toEqual({ cookies: [{ name: "erp.session_token", value: "fresh" }], reused: false });
    expect(asked).toBe(1);
    expect(signIns(stack)).toHaveLength(1);
    expect(readStorageState(statePath)?.cookies).toEqual([
      toStorageCookie(stack.baseURL, { name: "erp.session_token", value: "fresh" }),
    ]);
  });

  it("reuses a live cookie: no sign-in, no password asked, file untouched", async () => {
    stack = await stackWithSession();
    const statePath = join(dir, "a.json");
    writeStorageState(statePath, stored(stack.baseURL, "live"));
    const before = readFileSync(statePath, "utf8");

    const result = await ensureCoreSession({
      baseURL: stack.baseURL,
      statePath,
      credentials: () => {
        throw new Error("credentials must not be asked for");
      },
    });

    expect(result.reused).toBe(true);
    expect(result.cookies).toEqual([
      { name: "erp.session_token", value: "live" },
      { name: "scm_jwt", value: "jwt" },
    ]);
    expect(signIns(stack)).toHaveLength(0);
    expect(readFileSync(statePath, "utf8")).toBe(before);
  });

  it("signs in again when the saved cookie is dead", async () => {
    stack = await stackWithSession();
    const statePath = join(dir, "a.json");
    writeStorageState(statePath, stored(stack.baseURL, "dead"));

    const result = await ensureCoreSession({ baseURL: stack.baseURL, statePath, credentials: () => creds });

    expect(result.reused).toBe(false);
    expect(signIns(stack)).toHaveLength(1);
    expect(readStorageState(statePath)?.cookies.map((c) => c.value)).toEqual(["fresh"]);
  });

  it("signs in when the saved file is not storage state", async () => {
    stack = await stackWithSession();
    const statePath = join(dir, "a.json");
    writeFileSync(statePath, "{ half-written");

    const result = await ensureCoreSession({ baseURL: stack.baseURL, statePath, credentials: () => creds });

    expect(result.reused).toBe(false);
    expect(signIns(stack)).toHaveLength(1);
  });

  // Review Focus 1.
  it("throws without signing in when the stack answers 502", async () => {
    stack = await startFakeStack((_req, res) => {
      res.statusCode = 502;
      res.end();
    });
    const statePath = join(dir, "a.json");
    writeStorageState(statePath, stored(stack.baseURL, "live"));

    await expect(
      ensureCoreSession({ baseURL: stack.baseURL, statePath, credentials: () => creds }),
    ).rejects.toThrow(/Stack not reachable/);
    expect(signIns(stack)).toHaveLength(0);
  });
});
