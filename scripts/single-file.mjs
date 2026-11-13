// Builds dist/ERA-Lab-offline.html: the whole app in one file, to copy to a phone and open with no connection.
// Run after `vite build` (npm run build does both).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const dist = new URL("../dist/", import.meta.url);
const read = (p) => readFileSync(new URL(p, dist), "utf8");
const hash = (text) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;
let html = read("index.html");

const js = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"[^>]*><\/script>/);
const css = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/);
if (!js || !css) throw new Error("dist/index.html does not have the one script and one stylesheet this script expects");

const code = read(js[1]).replace(/<\/script/gi, "<\/script"); // the HTML parser must not see a closing tag inside the code
const style = read(css[1]);
html = html
  .replace(css[0], () => `<style>${style}</style>`)
  .replace(js[0], () => `<script type="module">${code}</script>`)
  .replace(/<link rel="(manifest|modulepreload)"[^>]*>\s*/g, "")
  // The page still refuses any script or style except exactly these two.
  .replace(/script-src (?:'|&#39;)self(?:'|&#39;)/, () => `script-src ${hash(code)}`) // Vite writes the quotes as &#39;
  .replace(/style-src (?:'|&#39;)self(?:'|&#39;)/, () => `style-src ${hash(style)}`)
  .replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\s*/g, "");

if (!html.includes(hash(code)) || !html.includes(hash(style))) throw new Error("the security policy was not updated, so the file would refuse its own script");
if (/(src|href)="\.\/assets\//.test(html)) throw new Error("something in dist/index.html still points at a separate file");
writeFileSync(new URL("ERA-Lab-offline.html", dist), html);
console.log(`dist/ERA-Lab-offline.html  ${(html.length / 1024).toFixed(0)} kB`);
