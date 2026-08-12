import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendTarget = env.VITE_BACKEND_TARGET || "http://localhost:8001";
  return {
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "src") },
    },
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
      hmr: env.VITE_HMR_CLIENT_PORT
        ? { clientPort: parseInt(env.VITE_HMR_CLIENT_PORT), protocol: "ws" }
        : true,
      proxy: {
        "/api": {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
        "/ws": {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
        },
        // Only the login endpoint, matching what nginx exposes in production.
        // Proxying the whole /hemis prefix turned the dev server into an open
        // proxy for the entire HEMIS API (B-09).
        "^/hemis/auth/login$": {
          target: "https://student.ndki.uz",
          changeOrigin: true,
          secure: true,
          rewrite: () => "/rest/v1/auth/login",
        },
      },
    },
  };
});
