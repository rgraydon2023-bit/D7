/**
 * Next.js build tracing on Windows exFAT/non-C drives throws EISDIR from readlink.
 * Treat it as "not a symlink" so local `next build` can succeed. Vercel (Linux) is unaffected.
 */
const fs = require("node:fs");
const path = require("node:path");

const targets = [
  path.join(__dirname, "..", "node_modules", "next", "dist", "build", "webpack", "plugins", "next-trace-entrypoints-plugin.js"),
  path.join(__dirname, "..", "node_modules", "next", "dist", "build", "collect-build-traces.js"),
];

const needle = "e.code === 'EINVAL' || e.code === 'ENOENT' || e.code === 'UNKNOWN'";
const replacement = "e.code === 'EINVAL' || e.code === 'ENOENT' || e.code === 'UNKNOWN' || e.code === 'EISDIR'";

let changed = 0;
for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.warn(`[patch-next-eisdir] missing ${path.basename(target)}; skip`);
    continue;
  }
  const source = fs.readFileSync(target, "utf8");
  if (source.includes("e.code === 'UNKNOWN' || e.code === 'EISDIR'")) {
    console.log(`[patch-next-eisdir] ${path.basename(target)} already patched`);
    continue;
  }
  if (!source.includes(needle)) {
    console.warn(`[patch-next-eisdir] pattern missing in ${path.basename(target)}; skip`);
    continue;
  }
  fs.writeFileSync(target, source.replaceAll(needle, replacement));
  changed += 1;
  console.log(`[patch-next-eisdir] patched ${path.basename(target)}`);
}

if (!changed) console.log("[patch-next-eisdir] no changes needed");
