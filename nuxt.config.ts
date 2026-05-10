export default defineNuxtConfig({
  hooks: {
    "pages:extend"(pages) {
      const i = pages.findIndex((p) =>
        Boolean(p.file?.replace(/\\/g, "/").endsWith("/pages/landing.vue")),
      );
      if (i >= 0) pages.splice(i, 1);
    },
    "vite:configResolved"(config) {
      const logger = config.customLogger;
      if (!logger) return;
      const originalWarn = logger.warn.bind(logger);
      logger.warn = (msg, options) => {
        if (
          typeof msg === "string" &&
          msg.includes("Sourcemap is likely to be incorrect") &&
          (msg.includes("@tailwindcss/vite:generate:build") ||
            msg.includes("nuxt:module-preload-polyfill"))
        ) {
          return;
        }
        originalWarn(msg, options);
      };
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
      // The page title, brand-aware titleTemplate, og:site_name, canonical
      // URL, and JSON-LD WebSite schema are all set in app.vue so they pick
      // the right brand ("Polymux" vs "Polymux Development Platform") based
      // on the request hostname. Setting a static title here would feed
      // "Polymux" into the template on pages without a per-page useHead and
      // render as "Polymux Polymux" in the browser tab.
      meta: [{ name: "twitter:card", content: "summary_large_image" }],
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      ],
    },
  },
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  vue: {
    compilerOptions: {
      // HTML comments inside <Teleport to="body"> render as real comment
      // nodes in <body> on SSR, which derails the teleport hydration walker
      // when multiple sibling components teleport to the same root (e.g.
      // ManageMembersModal + NotificationsToast). Stripping comments from
      // compiled templates keeps SSR and CSR teleport markers aligned.
      comments: false,
    },
  },
  modules: [
    "@nuxt/ui",
    "@nuxtjs/supabase",
    "@nuxtjs/i18n",
    "@vercel/analytics",
    "@vercel/speed-insights",
  ],
  // Bundle every icon string found in source (i-heroicons-*, i-ph-*,
  // i-simple-icons-*) into the client JS at build time. Without this,
  // @nuxt/icon fetches each icon over HTTP on first render, which is what
  // causes icons on tabs like /workflow/[id]/schedule to flash in after a
  // delay the first time the page is opened.
  icon: {
    clientBundle: {
      scan: true,
      sizeLimitKb: 512,
    },
  },
  components: [{ path: "~/components", pathPrefix: false }],
  imports: {
    dirs: [
      "composables/auth",
      "composables/chat",
      "composables/storage",
      "composables/wallet",
      "composables/workflows",
    ],
  },
  supabase: {
    redirect: false,
    key: process.env.SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.SUPABASE_SECRET_KEY,
    // In dev, allow the auth cookie over plain HTTP so LAN-IP access works (browsers drop Secure cookies on non-secure origins, which breaks the auth flow when hitting the dev server from another device).
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
    },
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
        "posthog-js",
        "dompurify",
        "@vueuse/core",
      ],
    },
    build: {
      chunkSizeWarningLimit: 1500,
    },
  },
  runtimeConfig: {
    resendApiKey: process.env.RESEND_API_KEY || "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    integrationEncryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY || "",
    polymuxSecret: process.env.POLYMUX_SECRET || "",
    oauthStateSecret: process.env.OAUTH_STATE_SECRET || "",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    public: {
      serverUrl: process.env.SERVER_URL || "http://localhost:8080",
      appUrl: process.env.APP_URL || "http://localhost:3000",
      posthogPublicKey: process.env.POSTHOG_PUBLIC_KEY || "",
      posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      extensionId: process.env.EXTENSION_ID || "",
    },
  },
  css: ["~/assets/css/main.css"],
});
