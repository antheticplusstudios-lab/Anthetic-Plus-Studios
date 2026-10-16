import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

/** Standard, editor-independent Vite + TanStack Start + Nitro configuration. */
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tanstackStart({ server: { entry: "server" } }),
    react(),
    tailwindcss(),
    nitro({ preset: process.env["NITRO_PRESET"] || "vercel" }),
  ],
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router"] },
  server: { host: "0.0.0.0" },
});
