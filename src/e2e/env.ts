// Env for the E2E suites of every module (spec S5, S7). Each module passes its
// own .env.e2e path: scm keeps it at the repo root, erp-core in e2e/.

type Env = Record<string, string | undefined>;

export const DEFAULT_BASE_URL = "http://erp.localhost";

/**
 * Reads a dotenv file into process.env when it exists (Node's own reader —
 * no dotenv). A missing file is not an error: every value can come from the
 * shell instead. Existing process.env values win over the file.
 */
export function loadEnvFile(path: string): boolean {
  try {
    process.loadEnvFile(path);
    return true;
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return false;
    throw error;
  }
}

/** The stack under test. Pointing a run elsewhere is one variable, not a code change. */
export function baseUrl(env: Env = process.env): string {
  const value = env.E2E_BASE_URL;
  return value === undefined || value === "" ? DEFAULT_BASE_URL : value;
}

/** The Core admin account. The message names the variables and the file, never a value. */
export function adminCredentials(envFile: string, env: Env = process.env): { email: string; password: string } {
  const email = env.E2E_ADMIN_EMAIL ?? "";
  const password = env.E2E_ADMIN_PASSWORD ?? "";
  if (email === "" || password === "") {
    throw new Error(
      `Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in ${envFile}. ` +
        "They are a Core admin account on the stack under test.",
    );
  }
  return { email, password };
}
