export default defineNuxtConfig({
  hooks: {
    "pages:extend"(pages) {
      const i = pages.findIndex((p) =>
        Boolean(p.file?.replace(/\\/g, "/").endsWith("/pages/landing.vue")),
      );
      if (i >= 0) pages.splice(i, 1);
    },
  },
  routeRules: {
    "/dashboard": { redirect: "/dashboard/home" },
    "/config": { redirect: "/settings" },
    "/config/settings": { redirect: "/settings" },
    "/workspace": { redirect: "/integrations/installed" },
    "/integrations": { redirect: "/integrations/installed" },
    "/dashboard/integrations": { redirect: "/integrations/installed" },
    "/dashboard/marketplace": { redirect: "/integrations/marketplace" },
    "/storage": { redirect: "/storage/workspace" },
    "/storage/personal": { redirect: "/storage/workspace" },
    "/vault": { redirect: "/vault/passwords" },
  },
  app: {
    head: {
      title: "Polymux",
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ],
    },
  },
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@nuxt/ui", "@nuxtjs/supabase", "@nuxtjs/i18n"],
  supabase: {
    redirect: false,
  },
  i18n: {
    defaultLocale: "en",
    // Resolved relative to project `i18n/` dir → `i18n/locales/*.json`
    langDir: "locales",
    strategy: "no_prefix",
    locales: [
      { code: "en", name: "English", language: "en-US", file: "en.json" },
      { code: "es", name: "Español", language: "es-ES", file: "es.json" },
      { code: "fr", name: "Français", language: "fr-FR", file: "fr.json" },
      { code: "de", name: "Deutsch", language: "de-DE", file: "de.json" },
      { code: "ja", name: "日本語", language: "ja-JP", file: "ja.json" },
      { code: "zh", name: "中文", language: "zh-CN", file: "zh.json" },
      { code: "pt", name: "Português", language: "pt-BR", file: "pt.json" },
      { code: "ko", name: "한국어", language: "ko-KR", file: "ko.json" },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: "i18n_locale",
      redirectOn: "root",
    },
  },
  dir: {
    app: "app",
  },
  vite: {
    optimizeDeps: {
      include: [
        "@vue/devtools-core",
        "@vue/devtools-kit",
        "marked",
        "vue-draggable-plus",
      ],
    },
  },
  runtimeConfig: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    public: {
      serverUrl: process.env.SERVER_URL || "http://localhost:8080",
      appUrl: process.env.APP_URL || "http://localhost:3000",
    },
  },
  css: ["~/assets/css/main.css"],
});
