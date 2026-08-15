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

export const FONT = "'DM Sans','Helvetica Neue',sans-serif";

export const RADIUS = { card: 11, input: 8, button: 7 } as const;
