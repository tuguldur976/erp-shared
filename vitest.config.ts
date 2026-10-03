import { configDefaults, defineConfig } from "vitest/config";

// `npm test` stays Docker-free: the Garage test runs only via `npm run test:integration`.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "**/*.integration.test.ts"] },
});
