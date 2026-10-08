import { realpathSync } from "node:fs";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

// node_modules may be a symlink (e.g. CI caches); allow its real path so dev SSR can load nitro's entry.
const modulesDir = (() => {
  try {
    return realpathSync("node_modules");
  } catch {
    return "node_modules";
  }
})();

export default defineConfig({
  server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), modulesDir] } },
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    nitro(),
    tailwindcss(),
    tsconfigPaths(),
    viteReact(),
  ],
});
