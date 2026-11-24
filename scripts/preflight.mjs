import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
for (const file of ["package.json", "vite.config.ts", "vercel.json", ".env.example"]) {
  if (!existsSync(join(root, file))) failures.push(`missing ${file}`);
}
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const script of ["dev", "build", "start", "test", "typecheck", "lint"]) {
  if (!pkg.scripts?.[script]) failures.push(`missing npm script: ${script}`);
}
if (!readFileSync(join(root, "vite.config.ts"), "utf8").includes('from "nitro/vite"')) {
  failures.push("Vite config does not register the Nitro deployment plugin");
}
if (!readFileSync(join(root, "vercel.json"), "utf8").includes('"NITRO_PRESET": "vercel"')) {
  failures.push("Vercel Nitro preset is not configured");
}
if (existsSync(join(root, ".env")))
  failures.push("local .env must not be included in source package");
if (failures.length) {
  console.error("PREFLIGHT_FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("PREFLIGHT_PASS");
