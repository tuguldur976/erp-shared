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
  if (value === undefined || value === "") return DEFAULT_BASE_URL;
  // Checked here, once: without a scheme every later new URL() threw a bare
  // "Invalid URL" that named no variable. The value is a URL, not a secret.
  if (!URL.canParse(value) || !/^https?:$/.test(new URL(value).protocol)) {
    throw new Error(`E2E_BASE_URL is not an http(s) URL: ${value}`);
  }
  return value;
}

/**
 * The Core admin account. The message names the variables and the file, never
 * a value; `example` is the module's template to copy, when it has one.
 */
export function adminCredentials(
  envFile: string,
  env: Env = process.env,
  hint: { example?: string } = {},
): { email: string; password: string } {
  const email = env.E2E_ADMIN_EMAIL ?? "";
  const password = env.E2E_ADMIN_PASSWORD ?? "";
  if (email === "" || password === "") {
    throw new Error(
      `Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD in ${envFile}. ` +
        "They are a Core admin account on the stack under test." +
        (hint.example === undefined ? "" : ` Copy ${hint.example} to start.`),
    );
  }
  return { email, password };
}
