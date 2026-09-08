import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");
const outputRoot = join(root, "out");
const failures = [];
const sourceFiles = walk(sourceRoot).filter((path) => [".ts", ".tsx", ".js", ".jsx", ".md"].includes(extname(path)));
const sourceMarkup = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");
const forbidden = [
  { pattern: /\bSAMPLE_[A-Z0-9_]+\b/g, label: "sample runtime data" },
  { pattern: /lorem ipsum/gi, label: "lorem ipsum" },
  { pattern: /coming soon/gi, label: "coming-soon placeholder" },
  { pattern: /href\s*=\s*["']#["']/g, label: "empty link target" },
  { pattern: /\b(?:TODO|FIXME)\b/g, label: "unfinished code marker" },
];

for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(content)) failures.push(`${relative(root, file)} contains ${rule.label}`);
    rule.pattern.lastIndex = 0;
  }
}

if (!existsSync(outputRoot)) {
  failures.push("out/ is missing; run npm run build before the quality audit");
} else {
  for (const file of walk(outputRoot).filter((path) => extname(path) === ".html")) {
    const html = readFileSync(file, "utf8");
    for (const match of html.matchAll(/href=["']([^"']+)["']/g)) {
      const href = match[1];
      if (!href.startsWith("/") || href.startsWith("//")) continue;
      const url = new URL(href, "https://yardly.invalid");
      const target = resolveRoute(url.pathname);
      if (!target) {
        failures.push(`${relative(root, file)} links to missing route ${url.pathname}`);
        continue;
      }
      if (url.hash) {
        const id = decodeURIComponent(url.hash.slice(1));
        const targetHtml = readFileSync(target, "utf8");
        const idPattern = new RegExp(`id=["']${escapeRegExp(id)}["']`);
        if (!idPattern.test(targetHtml) && !idPattern.test(sourceMarkup)) {
          failures.push(`${relative(root, file)} links to missing section ${url.pathname}${url.hash}`);
        }
      }
    }
  }
}

if (failures.length) {
  console.error(`Quality audit failed (${failures.length}):\n- ${[...new Set(failures)].join("\n- ")}`);
  process.exit(1);
}

console.log("Quality audit passed: no placeholder markers or broken internal links found.");

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : path;
  });
}

function resolveRoute(pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\/+|\/+$/g, "");
  const direct = clean ? join(outputRoot, clean) : null;
  if (direct && existsSync(direct) && !statSync(direct).isDirectory()) return direct;
  const candidates = clean
    ? [join(outputRoot, clean, "index.html"), join(outputRoot, `${clean}.html`)]
    : [join(outputRoot, "index.html")];
  return candidates.find(existsSync);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
