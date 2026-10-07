import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// admin.foundation (PAD-531): the staff console. Port 8090 locally; `/admin/api` is proxied to
// the backend WITHOUT changeOrigin, so the Host the blueprint sees is `localhost`, which the dev
// env templates list in ADMIN_HOSTS (rule 11). In production the host nginx routes it.
export default defineConfig({
  server: {
    host: "::",
    port: 8090,
    proxy: {
      "/admin/api": {
        target: `http://127.0.0.1:${process.env.VITE_BACKEND_PORT ?? "5000"}`,
        changeOrigin: false,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
