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
        if (
          typeof msg === "string" &&
          msg.includes("@vueuse/core") &&
          msg.includes("contains an annotation that Rollup cannot interpret")
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
    "/documentation": { redirect: "/documentation/introduction" },
  },
  app: {
    head: {
      // Canonical, og:url, and the titleTemplate function live in app.vue
      // (nuxt.config head must be JSON-serializable — no functions allowed).
      // This default title is the SSR fallback when a page doesn't set one.
      title: "Polymux — AI Agents for Browser Automation",
      htmlAttrs: { lang: "en" },
      meta: [
        {
          name: "description",
          content:
            "Polymux orchestrates AI agents for browser automation. Run multi-agent workflows with live browser sessions, secure vaults, and replayable runs.",
        },
        {
          name: "keywords",
          content:
            "AI agents, browser automation, multi-agent orchestration, AI workflow, live browser sessions, web automation, Polymux",
        },
        { name: "robots", content: "index,follow" },
        { name: "theme-color", content: "#000000" },
        {
          property: "og:title",
          content: "Polymux — AI Agents for Browser Automation",
        },
        {
          property: "og:description",
          content:
            "Orchestrate AI agents for browser automation. Multi-agent workflows with live browser sessions, secure vaults, and replayable runs.",
        },
        { property: "og:image", content: "https://polymux.com/og-image.png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:site_name", content: "Polymux" },
        { property: "og:type", content: "website" },
        { property: "og:locale", content: "en_US" },
        { name: "twitter:card", content: "summary_large_image" },
        {
          name: "twitter:title",
          content: "Polymux — AI Agents for Browser Automation",
        },
        {
          name: "twitter:description",
          content:
            "Orchestrate AI agents for browser automation. Multi-agent workflows with live browser sessions, secure vaults, and replayable runs.",
        },
        { name: "twitter:image", content: "https://polymux.com/og-image.png" },
      ],
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/manifest.webmanifest" },
      ],
      script: [
        {
          type: "application/ld+json",
          innerHTML: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "Polymux",
            url: "https://polymux.com",
            logo: "https://polymux.com/og-image.png",
            description:
              "Polymux orchestrates AI agents for browser automation, with multi-agent workflows, live browser sessions, secure vaults, and replayable runs.",
            // TODO: add social URLs once handles are claimed (X, LinkedIn, GitHub, YouTube, etc.)
            sameAs: [],
          }),
        },
        {
          type: "application/ld+json",
          innerHTML: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Polymux",
            url: "https://polymux.com",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            description:
              "Deploy, manage, and scale AI agents that automate browser workflows. Multi-agent orchestration with live browser sessions and a secure vault.",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "USD",
            },
          }),
        },
        {
          type: "application/ld+json",
          innerHTML: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Polymux",
            url: "https://polymux.com",
          }),
        },
      ],
    },
  },
  nitro: {
    // Paths resolve from srcDir (`app/`), not project root — use `../content/*`.
    serverAssets: [
      { baseName: "docs", dir: "../content/docs" },
      { baseName: "legal", dir: "../content/legal" },
    ],
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
    "@nuxtjs/sitemap",
    "@nuxtjs/robots",
    "@vercel/analytics",
    "@vercel/speed-insights",
  ],
  site: {
    url: "https://polymux.com",
    name: "Polymux",
  },
  sitemap: {
    exclude: [
      "/dashboard/**",
      "/workflow/**",
      "/vault/**",
      "/storage/**",
      "/integrations/**",
      "/session/**",
      "/settings/**",
      "/sign-in",
      "/sign-up",
      "/reset-password",
      "/forgot-password",
      "/verify-email",
      "/verification-successful",
      "/confirm",
      "/unsubscribed",
      "/invitations/**",
      "/account-suspended",
    ],
    urls: [
      "/",
      "/pricing",
      "/contact",
      "/about-us",
      "/community",
      "/blog",
      "/documentation/introduction",
      "/documentation/quickstart",
      "/documentation/installation",
      "/documentation/workspaces",
      "/documentation/vault",
      "/documentation/faq",
      "/documentation/plugin-overview",
      "/documentation/plugin-build",
      "/documentation/plugin-manifest",
      "/documentation/publishing",
      "/documentation/connections-overview",
      "/documentation/connections-build",
      "/documentation/api-overview",
      "/documentation/authentication",
      "/forum",
      "/api-reference",
      "/install-apps",
      "/privacy-policy",
      "/terms-of-service",
      "/cookie-policy",
    ],
  },
  robots: {
    groups: [
      {
        userAgent: ["*"],
        disallow: [
          "/dashboard/",
          "/workflow/",
          "/vault/",
          "/storage/",
          "/integrations/",
          "/session/",
          "/settings/",
        ],
        allow: ["/"],
      },
    ],
    sitemap: ["https://polymux.com/sitemap.xml"],
  },
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
    presets: [
      {
        from: '@tanstack/vue-query',
        imports: ['useQuery', 'useQueryClient', 'useMutation'],
      },
    ],
    dirs: [
      "composables/account",
      "composables/artifacts",
      "composables/auth",
      "composables/chat",
      "composables/device",
      "composables/integrations",
      "composables/misc",
      "composables/nav-tabs",
      "composables/storage",
      "composables/ui",
      "composables/vault",
      "composables/viewport",
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
        "@internationalized/date",
        "@vue/devtools-core",
        "@vue/devtools-kit",
        "@vueuse/core",
        "dompurify",
        "marked",
        "posthog-js",
        "@tanstack/vue-query",
        "vue-draggable-plus",
      ],
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        onwarn(warning, warn) {
          if (
            warning.code === "INVALID_ANNOTATION" &&
            warning.id?.includes("@vueuse/core")
          ) {
            return;
          }
          warn(warning);
        },
      },
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
      serverUrl: (process.env.SERVER_URL || "http://localhost:8080").replace(/\/+$/, ''),
      appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, ''),
      posthogPublicKey: process.env.POSTHOG_PUBLIC_KEY || "",
      posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      extensionId: process.env.EXTENSION_ID || "",
    },
  },
  css: ["~/assets/css/main.css"],
});
