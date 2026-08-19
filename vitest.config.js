import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom", // شبیه‌سازی DOM مرورگر
    globals: true, // استفاده از describe, it, expect بدون import
    include: ["tests/**/*.test.js"],
  },
});
