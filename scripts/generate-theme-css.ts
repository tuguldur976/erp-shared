import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { FONT_FACES } from "../src/tokens/index";
import { renderThemeCss } from "../src/tokens/render-css";

mkdirSync("dist/tokens/fonts", { recursive: true });
writeFileSync("dist/tokens/theme.css", renderThemeCss());

// The woff2 files ship inside this package, beside theme.css, so a consumer
// needs no font dependency of its own. OFL-1.1 requires the licence to travel
// with the font files.
const inter = dirname(createRequire(import.meta.url).resolve("@fontsource-variable/inter/package.json"));
for (const f of FONT_FACES) copyFileSync(join(inter, "files", f.file), join("dist/tokens/fonts", f.file));
copyFileSync(join(inter, "LICENSE"), "dist/tokens/fonts/LICENSE-Inter.txt");
console.log(`Generated dist/tokens/theme.css and ${FONT_FACES.length} Inter font files`);
