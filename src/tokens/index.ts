// Design tokens — single source of truth for the ERP module repos
// (spark-resellers, supplychain). Values were unified from
// supplychain/src/lib/ds.ts and spark-resellers globals.css, which
// already agreed byte-for-byte at extraction time (2026-08-15).

export const PALETTE = {
  dark: {
    bg: "#0f1117",
    sidebar: "#161b27",
    card: "#1c2333",
    border: "#2a3348",
    accent: "#4f8ef7",
    accentBg: "rgba(79,142,247,0.1)",
    text: "#e2e8f0",
    muted: "#8892a4",
    dim: "#3d4a5c",
    success: "#22c55e",
    successBg: "rgba(34,197,94,0.1)",
    warning: "#f59e0b",
    warningBg: "rgba(245,158,11,0.1)",
    danger: "#ef4444",
    dangerBg: "rgba(239,68,68,0.1)",
    purple: "#a855f7",
    purpleBg: "rgba(168,85,247,0.12)",
  },
  light: {
    bg: "#f8fafc",
    sidebar: "#f1f5f9",
    card: "#ffffff",
    border: "#e2e8f0",
    accent: "#3b82f6",
    accentBg: "rgba(59,130,246,0.1)",
    text: "#0f172a",
    muted: "#64748b",
    dim: "#94a3b8",
    success: "#16a34a",
    successBg: "rgba(22,163,74,0.1)",
    warning: "#d97706",
    warningBg: "rgba(217,119,6,0.1)",
    danger: "#dc2626",
    dangerBg: "rgba(220,38,38,0.1)",
    purple: "#7c3aed",
    purpleBg: "rgba(124,58,237,0.12)",
  },
} as const;

export type ThemeName = keyof typeof PALETTE;
export type PaletteKey = keyof (typeof PALETTE)["dark"];

const PALETTE_KEYS = Object.keys(PALETTE.dark) as PaletteKey[];

// "accentBg" -> "--c-accent-bg"
export function cssVarName(key: PaletteKey): string {
  return "--c-" + key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

// Theme -> { "--c-bg": "#0f1117", ... }. Consumers (supplychain applyTheme,
// the CSS generator) build their var blocks from this one mapping.
export function toCssVars(theme: ThemeName): Record<string, string> {
  return Object.fromEntries(PALETTE_KEYS.map((k) => [cssVarName(k), PALETTE[theme][k]]));
}

// CSS variable REFERENCES (not values) — drop-in compatible with the
// existing `C` object in supplychain/src/lib/ds.ts.
export const C = Object.fromEntries(
  PALETTE_KEYS.map((k) => [k, `var(${cssVarName(k)})`]),
) as Record<PaletteKey, string>;

export const Z = {
  filterBar: 10,
  fab: 20,
  pagination: 25,
  dropdown: 90,
  detailPanel: 100,
  overlay: 1000,
  modal: 1001,
  modalTop: 1100,
} as const;

// v0.2: Inter replaced DM Sans, which has no Cyrillic — every Mongolian word
// fell back to another font mid-line. The fallbacks all carry Cyrillic too.
export const FONT_STACK = "'Inter', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

// A CSS variable REFERENCE, like `C`: inline styles follow theme.css (R93).
export const FONT = "var(--erp-font-sans)";

export const RADIUS = { card: 11, input: 8, button: 7 } as const;

export interface FontFace {
  subset: string;
  file: string;
  unicodeRange: string;
}

// Inter's variable weight axis, self-hosted from @fontsource-variable/inter:
// no request leaves for Google's servers. Ranges are Fontsource's own.
// Mongolian Ө/Ү live in cyrillic-ext, and the tugrik sign ₮ in latin-ext.
const face = (subset: string, unicodeRange: string): FontFace => ({
  subset,
  file: `inter-${subset}-wght-normal.woff2`,
  unicodeRange,
});

export const FONT_FACES: readonly FontFace[] = [
  face("cyrillic-ext", "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F"),
  face("cyrillic", "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"),
  face(
    "latin-ext",
    "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
  ),
  face(
    "latin",
    "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  ),
];

// Theme-independent variables: the same on light and dark.
export function toLayoutVars(): Record<string, string> {
  return {
    "--erp-font-sans": FONT_STACK,
    "--erp-radius-card": `${RADIUS.card}px`,
    "--erp-radius-input": `${RADIUS.input}px`,
    "--erp-radius-button": `${RADIUS.button}px`,
  };
}
