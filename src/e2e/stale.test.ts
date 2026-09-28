import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkStackFreshness, staleStackWarning } from "./stale.js";

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
