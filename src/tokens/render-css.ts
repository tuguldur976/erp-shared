import { FONT_FACES, toCssVars, toLayoutVars } from "./index";

const HEADER = "/* AUTO-GENERATED from @erp/shared tokens — DO NOT EDIT */\n";

// url() is relative to theme.css: the files sit in dist/tokens/fonts/, and the
// consumer's bundler rebases the path when it inlines this file.
function fontFaces(): string {
  return FONT_FACES.map(
    (f) => `@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('./fonts/${f.file}') format('woff2-variations');
  unicode-range: ${f.unicodeRange};
}`,
  ).join("\n\n");
}

function block(selector: string, vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

// Unified ERP convention (user decision 2026-08-16): light is the default
// theme in every system; dark is opted into via the `.dark` class.
export function renderThemeCss(): string {
  return [
    HEADER,
    fontFaces(),
    "",
    block(":root", { ...toLayoutVars(), ...toCssVars("light") }),
    block(".dark", toCssVars("dark")),
    "",
  ].join("\n");
}
