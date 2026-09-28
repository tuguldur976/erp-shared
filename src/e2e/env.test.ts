import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adminCredentials, baseUrl, DEFAULT_BASE_URL, loadEnvFile } from "./env.js";

describe("baseUrl", () => {
  it("defaults to the internal stack", () => {
    expect(baseUrl({})).toBe(DEFAULT_BASE_URL);
    expect(DEFAULT_BASE_URL).toBe("http://erp.localhost");
  });

  it("takes E2E_BASE_URL", () => {
    expect(baseUrl({ E2E_BASE_URL: "http://probe.test" })).toBe("http://probe.test");
  });

  it("treats an empty value as unset", () => {
    expect(baseUrl({ E2E_BASE_URL: "" })).toBe(DEFAULT_BASE_URL);
  });
});

describe("adminCredentials", () => {
  it("returns both values when they are set", () => {
    expect(
      adminCredentials("/x/.env.e2e", { E2E_ADMIN_EMAIL: "admin@spark.mn", E2E_ADMIN_PASSWORD: "pw" }),
    ).toEqual({ email: "admin@spark.mn", password: "pw" });
  });

  it("names the file and both variables when one is missing", () => {
    expect(() => adminCredentials("/x/.env.e2e", { E2E_ADMIN_EMAIL: "admin@spark.mn" })).toThrow(
      /E2E_ADMIN_EMAIL.*E2E_ADMIN_PASSWORD.*\/x\/\.env\.e2e/s,
    );
  });

  it("treats an empty value as missing", () => {
    expect(() =>
      adminCredentials("/x/.env.e2e", { E2E_ADMIN_EMAIL: "", E2E_ADMIN_PASSWORD: "pw" }),
    ).toThrow(/E2E_ADMIN_EMAIL/);
  });

  // Review Focus 2: a value must never reach a message.
  it("never puts a value in the message", () => {
    let message = "";
    try {
      adminCredentials("/x/.env.e2e", { E2E_ADMIN_PASSWORD: "hunter2-secret" });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("hunter2-secret");
  });
});

describe("loadEnvFile", () => {
  let dir = "";
  afterEach(() => {
    delete process.env.E2E_SHARED_PROBE;
    if (dir !== "") rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  it("answers false for a missing file instead of throwing", () => {
    expect(loadEnvFile("/definitely/not/here/.env.e2e")).toBe(false);
  });

  it("loads an existing file into process.env", () => {
    dir = mkdtempSync(join(tmpdir(), "shared-e2e-env-"));
    const file = join(dir, "probe.env");
    writeFileSync(file, "E2E_SHARED_PROBE=loaded\n");
    expect(loadEnvFile(file)).toBe(true);
    expect(process.env.E2E_SHARED_PROBE).toBe("loaded");
  });
});
