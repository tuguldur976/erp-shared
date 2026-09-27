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
  // R93: colour, radius and font come ONLY from theme.css. v0.1 shipped the
  // colours alone, so core-web (pure CSS) never got a font at all.
  it("declares Inter from files beside theme.css, before any rule uses it", () => {
    expect(css.match(/@font-face \{/g)).toHaveLength(4);
    expect(css).toContain("font-family: 'Inter';");
    expect(css).toContain("src: url('./fonts/inter-cyrillic-ext-wght-normal.woff2') format('woff2-variations');");
    expect(css.indexOf("@font-face")).toBeLessThan(css.indexOf(":root"));
  });
  it("puts the font and radius variables on :root only — they do not change with the theme", () => {
    expect(css).toMatch(/:root \{[^}]*--erp-font-sans: 'Inter',/);
    expect(css).toMatch(/:root \{[^}]*--erp-radius-card: 11px;/);
    expect(css.match(/--erp-font-sans:/g)).toHaveLength(1);
  });
});
