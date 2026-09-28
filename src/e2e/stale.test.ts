import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkStackFreshness, freshnessFrom, staleStackWarning } from "./stale.js";

const base = { service: "core-web", rebuildHint: "Rebuild: pnpm stack:x" };

describe("staleStackWarning", () => {
  it("is silent when the image is newer than the last commit", () => {
    expect(
      staleStackWarning({ ...base, imageCreated: "2026-09-27T10:50:00.123456789Z", lastCommit: "2026-09-27T18:40:00+08:00" }),
    ).toBeNull();
  });

  // Docker reports UTC with nanoseconds, git local time with an offset;
  // 18:40+08 is 10:40Z, after the 10:30Z image.
  it("warns, naming the service and the rebuild, when the last commit is newer", () => {
    const warning = staleStackWarning({ ...base, imageCreated: "2026-09-27T10:30:00.5Z", lastCommit: "2026-09-27T18:40:00+08:00" });
    expect(warning).toMatch(/^⚠ STALE STACK — core-web image built 2026-09-27T10:30:00\.5Z/);
    expect(warning).toContain("Rebuild: pnpm stack:x");
  });

  it("stays silent when either time cannot be read", () => {
    expect(staleStackWarning({ ...base, imageCreated: "", lastCommit: "2026-09-27T18:40:00+08:00" })).toBeNull();
    expect(staleStackWarning({ ...base, imageCreated: "2026-09-27T10:30:00Z", lastCommit: "" })).toBeNull();
  });
});

// v0.3.0 minor: scm's old line named the image and the repo HEAD; keep both.
describe("freshnessFrom", () => {
  const facts = { ...base, imageId: "sha256:67c5f2a04c43aa", head: "de79b9d" };

  it("names the image and HEAD on a fresh stack", () => {
    const result = freshnessFrom({ ...facts, imageCreated: "2026-09-28T10:00:00Z", lastCommit: "2026-09-28T17:00:00+08:00" });
    expect(result.state).toBe("fresh");
    expect(result.message).toBe(
      "stack: fresh — core-web image 67c5f2a04c43 built 2026-09-28T10:00:00Z; last product commit 2026-09-28T17:00:00+08:00; repo HEAD de79b9d",
    );
  });

  it("names the image and HEAD on a stale stack", () => {
    const result = freshnessFrom({ ...facts, imageCreated: "2026-09-28T08:00:00Z", lastCommit: "2026-09-28T17:00:00+08:00" });
    expect(result.state).toBe("stale");
    expect(result.message).toMatch(/^⚠ STALE STACK — core-web image built 2026-09-28T08:00:00Z/);
    expect(result.message).toContain("image 67c5f2a04c43, repo HEAD de79b9d");
  });

  it("says none when no commit touched the product paths", () => {
    const result = freshnessFrom({ ...facts, imageCreated: "2026-09-28T08:00:00Z", lastCommit: "" });
    expect(result.message).toContain("last product commit none");
  });
});

describe("checkStackFreshness", () => {
  it("answers unknown instead of throwing when the container or repo cannot be read", () => {
    const dir = mkdtempSync(join(tmpdir(), "shared-e2e-stale-"));
    try {
      const result = checkStackFreshness({
        ...base,
        container: "shared-e2e-no-such-container",
        repoRoot: dir,
        paths: ["src"],
      });
      expect(result.state).toBe("unknown");
      expect(result.message).toMatch(/^stale-stack check skipped/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
