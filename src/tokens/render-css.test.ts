import { describe, expect, it } from "vitest";
import { renderThemeCss } from "./render-css";

describe("renderThemeCss (light default everywhere, .dark overrides)", () => {
  const css = renderThemeCss();
  it("puts light values on :root and dark values under .dark", () => {
    expect(css).toContain(":root {");
    expect(css).toContain(".dark {");
    expect(css.indexOf(":root")).toBeLessThan(css.indexOf(".dark"));
    expect(css).toMatch(/:root \{[^}]*--c-bg: #f8fafc;/);
    expect(css).toMatch(/\.dark \{[^}]*--c-bg: #0f1117;/);
  });
  it("emits every palette variable in both blocks", () => {
    const occurrences = css.match(/--c-accent-bg:/g);
    expect(occurrences).toHaveLength(2);
  });
  it("carries the generated-file warning header", () => {
    expect(css.startsWith("/* AUTO-GENERATED")).toBe(true);
  });
});
