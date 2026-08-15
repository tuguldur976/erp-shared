import { toCssVars } from "./index";

const HEADER = "/* AUTO-GENERATED from @erp/shared PALETTE — DO NOT EDIT */\n";

function block(selector: string, vars: Record<string, string>): string {
  const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`);
  return `${selector} {\n${lines.join("\n")}\n}`;
}

// Unified ERP convention (user decision 2026-08-16): light is the default
// theme in every system; dark is opted into via the `.dark` class.
export function renderThemeCss(): string {
  return [HEADER, block(":root", toCssVars("light")), block(".dark", toCssVars("dark")), ""].join("\n");
}
