import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "package.json",
  "package-lock.json",
  "vite.config.ts",
  "vercel.json",
  ".env.example",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);
const scanRoots = ["src", "backend", "README.md", "package.json", "vercel.json"];
const vendorWords = [
  ["love", "able"].join(""),
  ["aut", "umic"].join(""),
  ["ai", "_sales_agent"].join(""),
  ["web", "_chatbot"].join(""),
];
const bad = new RegExp(vendorWords.join("|"), "i");
function walk(path) {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (st.isDirectory()) {
    for (const name of readdirSync(path)) {
      if (["node_modules", ".git", ".output", "dist", "__pycache__"].includes(name)) continue;
      walk(join(path, name));
    }
    return;
  }
  const text = readFileSync(path, "utf8");
  if (bad.test(text)) failures.push(`legacy/vendor reference in ${relative(root, path)}`);
}
for (const entry of scanRoots) walk(join(root, entry));

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.packageManager !== "npm@10.9.2") failures.push("packageManager must be npm@10.9.2");
if (pkg.scripts?.start !== "node .output/server/index.mjs")
  failures.push("production start command is not Nitro Node output");

if (failures.length) {
  console.error("PREFLIGHT_FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("PREFLIGHT_PASS");
