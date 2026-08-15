import { describe, expect, it } from "vitest";
import { C, FONT, PALETTE, RADIUS, Z, cssVarName, toCssVars } from "./index";

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
    expect(FONT).toBe("'DM Sans','Helvetica Neue',sans-serif");
    expect(RADIUS).toEqual({ card: 11, input: 8, button: 7 });
  });
});
