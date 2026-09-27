import { describe, expect, it } from "vitest";
import { C, FONT, FONT_FACES, FONT_STACK, PALETTE, RADIUS, Z, cssVarName, toCssVars, toLayoutVars } from "./index";

describe("PALETTE", () => {
  it("dark and light define exactly the same keys", () => {
    expect(Object.keys(PALETTE.dark).sort()).toEqual(Object.keys(PALETTE.light).sort());
  });
  it("pins the canonical brand values", () => {
    expect(PALETTE.dark.bg).toBe("#0f1117");
    expect(PALETTE.dark.accent).toBe("#4f8ef7");
    expect(PALETTE.dark.text).toBe("#e2e8f0");
    expect(PALETTE.light.bg).toBe("#f8fafc");
    expect(PALETTE.light.accent).toBe("#3b82f6");
    expect(PALETTE.light.card).toBe("#ffffff");
  });
});

describe("cssVarName", () => {
  it("kebab-cases camelCase keys with the --c- prefix", () => {
    expect(cssVarName("bg")).toBe("--c-bg");
    expect(cssVarName("accentBg")).toBe("--c-accent-bg");
    expect(cssVarName("successBg")).toBe("--c-success-bg");
  });
});

describe("toCssVars", () => {
  it("maps every palette key to a --c- variable", () => {
    const vars = toCssVars("dark");
    expect(vars["--c-bg"]).toBe("#0f1117");
    expect(vars["--c-accent-bg"]).toBe("rgba(79,142,247,0.1)");
    expect(Object.keys(vars)).toHaveLength(Object.keys(PALETTE.dark).length);
  });
});

describe("C", () => {
  it("references exactly the var names toCssVars emits", () => {
    expect(C.bg).toBe("var(--c-bg)");
    expect(C.accentBg).toBe("var(--c-accent-bg)");
    expect(Object.keys(C).sort()).toEqual(Object.keys(PALETTE.dark).sort());
  });
});

describe("Z", () => {
  it("keeps the stacking order strictly increasing", () => {
    const order = [Z.filterBar, Z.fab, Z.pagination, Z.dropdown, Z.detailPanel, Z.overlay, Z.modal, Z.modalTop];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe("FONT / RADIUS", () => {
  it("pins font stack and radii", () => {
    expect(FONT).toBe("var(--erp-font-sans)");
    expect(FONT_STACK.startsWith("'Inter',")).toBe(true);
    expect(RADIUS).toEqual({ card: 11, input: 8, button: 7 });
  });
});

// The UI is Mongolian Cyrillic. DM Sans (v0.1) had no Cyrillic at all, so
// every Mongolian word silently fell back to another font mid-line.
describe("FONT_FACES", () => {
  const covers = (cp: number): boolean =>
    FONT_FACES.some((f) =>
      f.unicodeRange.split(",").some((r) => {
        const [lo, hi] = r.replace("U+", "").split("-").map((h) => parseInt(h, 16));
        return cp >= lo && cp <= (hi ?? lo);
      }),
    );

  it("covers Mongolian Cyrillic, including Ө and Ү", () => {
    for (const ch of "АяЁёӨөҮү") expect(covers(ch.codePointAt(0)!)).toBe(true);
  });

  it("covers the tugrik sign and plain Latin digits", () => {
    expect(covers(0x20ae)).toBe(true);
    expect(covers("7".codePointAt(0)!)).toBe(true);
  });

  it("names one woff2 file per subset", () => {
    expect(FONT_FACES.map((f) => f.file)).toEqual(
      FONT_FACES.map((f) => `inter-${f.subset}-wght-normal.woff2`),
    );
  });
});

describe("toLayoutVars", () => {
  it("emits the font stack and every radius in px", () => {
    expect(toLayoutVars()).toEqual({
      "--erp-font-sans": FONT_STACK,
      "--erp-radius-card": "11px",
      "--erp-radius-input": "8px",
      "--erp-radius-button": "7px",
    });
  });
});
