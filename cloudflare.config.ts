import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "aasprite-site",
    compatibilityDate: "2026-09-17",
    domains: ["aasprite.com", "www.aasprite.com"],
    assets: {
      htmlHandling: "auto-trailing-slash",
      notFoundHandling: "404-page",
    },
  },
});
