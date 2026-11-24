import { defineConfig, loadEnv, type PluginOption } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { resolvePublicDb1Config } from "./scripts/public-supabase-config";

/** Nitro only packages the production server; dev uses TanStack Start's own SSR runner. */
function buildOnly(plugin: PluginOption): PluginOption {
  const list = (Array.isArray(plugin) ? (plugin as unknown[]).flat(4) : [plugin]) as PluginOption[];
  return list.map((p) =>
    p && typeof p === "object" && "name" in p ? { ...p, apply: "build" as const } : p,
  );
}

/** Standard, editor-independent Vite + TanStack Start + Nitro configuration. */
export default defineConfig(({ mode }) => {
  // Vite client variables are statically replaced during the build. Some hosts only
  // configure DB1_URL/DB1_ANON_KEY today, so safely map those PUBLIC values to the
  // browser aliases unless explicit VITE_* values were configured.
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const { url: publicDb1Url, key: publicDb1Key } = resolvePublicDb1Config(process.env, fileEnv);

  return {
    define: {
      "import.meta.env.VITE_DB1_URL": JSON.stringify(publicDb1Url),
      "import.meta.env.VITE_DB1_ANON_KEY": JSON.stringify(publicDb1Key),
    },
    plugins: [
      tsconfigPaths(),
      tanstackStart({ server: { entry: "server" } }),
      react(),
      tailwindcss(),
      buildOnly(
        nitro(
          process.env["NITRO_PRESET"] || process.env["VERCEL"]
            ? { preset: process.env["NITRO_PRESET"] || "vercel" }
            : // Lovable hosting deploys a Worker bundle from dist/.
              {
                preset: "cloudflare-module",
                output: { dir: "dist", serverDir: "dist/server", publicDir: "dist/client" },
              },
        ),
      ),
    ],
    resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
    server: { host: "0.0.0.0" },
  };
});
