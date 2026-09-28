// Warn, never fail: a run against an image older than the code proves old
// code, but a docs-only commit also looks "newer", so a hard stop would block
// valid runs. Each module passes its container, product paths and rebuild line.
import { execFileSync } from "node:child_process";

export interface Freshness {
  state: "fresh" | "stale" | "unknown";
  message: string;
}

export function staleStackWarning(o: {
  service: string;
  imageCreated: string;
  lastCommit: string;
  rebuildHint: string;
}): string | null {
  const image = Date.parse(o.imageCreated);
  const commit = Date.parse(o.lastCommit);
  if (Number.isNaN(image) || Number.isNaN(commit) || commit <= image) return null;
  return (
    `⚠ STALE STACK — ${o.service} image built ${o.imageCreated}, last product commit ${o.lastCommit}.\n` +
    "  The run still executes, but it cannot prove it exercised your latest change.\n" +
    `  ${o.rebuildHint}`
  );
}

/** Compares the running container with the last commit under `paths`. Never throws; printing is the module's job. */
export function checkStackFreshness(o: {
  container: string;
  repoRoot: string;
  paths: string[];
  service: string;
  rebuildHint: string;
}): Freshness {
  const run = (command: string, args: string[]): string =>
    execFileSync(command, args, { encoding: "utf8", cwd: o.repoRoot, stdio: ["ignore", "pipe", "ignore"] }).trim();
  let created: string;
  let lastCommit: string;
  try {
    created = run("docker", ["inspect", "--format", "{{.Created}}", o.container]);
    lastCommit = run("git", ["log", "-1", "--format=%cI", "--", ...o.paths]);
  } catch (error) {
    const why = error instanceof Error ? error.message.split("\n")[0] : String(error);
    return { state: "unknown", message: `stale-stack check skipped: ${o.container} or git history not readable (${why})` };
  }
  const warning = staleStackWarning({ service: o.service, imageCreated: created, lastCommit, rebuildHint: o.rebuildHint });
  if (warning !== null) return { state: "stale", message: warning };
  return {
    state: "fresh",
    message: `stack: fresh — ${o.service} image built ${created}; last product commit ${lastCommit === "" ? "none" : lastCommit}`,
  };
}
