import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true,
      },
    },
    globals: true,
    include: ["src/**/*.{test,spec}.{js,jsx}"],
    setupFiles: "./src/test/setupTests.js",
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
