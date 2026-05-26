import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const indexPath = join(root, "out", "index.html");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(existsSync(indexPath), "out/index.html does not exist. Run pnpm build first.");

const html = readFileSync(indexPath, "utf8");
assert(html.includes("我的世界"), "static export is missing the initial worlds page content.");
assert(html.includes("新建世界"), "static export is missing the create-world entry point.");
assert(html.includes("./_next/static/"), "static export does not use file-loadable relative Next assets.");
assert(!html.includes('href="/_next/'), "static export contains root-relative stylesheet assets.");
assert(!html.includes('src="/_next/'), "static export contains root-relative script assets.");

const assetRefs = [...html.matchAll(/(?:href|src)="(\.\/_next\/static\/[^"]+)"/g)].map((match) => match[1]);
assert(assetRefs.length > 0, "static export did not reference any Next static assets.");

for (const ref of assetRefs) {
  const assetPath = join(root, "out", ref.replace("./", ""));
  assert(existsSync(assetPath), `missing exported asset: ${ref}`);
}

const cssRefs = assetRefs.filter((ref) => ref.endsWith(".css"));
assert(cssRefs.length > 0, "static export did not include a CSS bundle.");

const css = cssRefs.map((ref) => readFileSync(join(root, "out", ref.replace("./", "")), "utf8")).join("\n");
assert(css.includes("@media (max-width:720px)"), "exported CSS is missing the mobile responsive rules.");
assert(css.includes("grid-template-columns:44px minmax(0,1fr)"), "exported CSS is missing the compact mobile rail layout.");

console.log(`Static export verified: ${assetRefs.length} assets, ${cssRefs.length} CSS bundle.`);
