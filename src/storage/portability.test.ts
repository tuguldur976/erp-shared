import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// R75: the storage code must run on Cloudflare Workers too — fetch and
// crypto.subtle only. Tests may use Node; shipped files may not.
const DIR = join(import.meta.dirname, ".");
const shipped = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

describe("storage portability (R75)", () => {
  it("finds the shipped files", () => {
    expect(shipped).toEqual(expect.arrayContaining(["adapter.ts", "bytes.ts", "index.ts", "key.ts", "memory.ts", "s3.ts"]));
  });

  it.each(shipped)("%s uses no Node-only API", (file) => {
    const src = readFileSync(join(DIR, file), "utf8");
    expect(src).not.toMatch(/from\s+["']node:/);
    expect(src).not.toMatch(/\brequire\(/);
    expect(src).not.toMatch(/\bBuffer\b/);
    expect(src).not.toMatch(/\bprocess\./);
  });
});
