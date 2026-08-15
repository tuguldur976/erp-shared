import { mkdirSync, writeFileSync } from "node:fs";
import { renderThemeCss } from "../src/tokens/render-css";

mkdirSync("dist/tokens", { recursive: true });
writeFileSync("dist/tokens/theme.css", renderThemeCss());
console.log("Generated dist/tokens/theme.css");
