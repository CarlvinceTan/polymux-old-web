import { stripPosthogWorkerSourceMap } from "./vite/strip-posthog-worker-sourcemap";

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
    // Connections — the integrations browse surface is now the top-level
    // /connections page. Keep the old nested + sibling entry points redirecting.
    "/workspace": { redirect: "/connections" },
    "/integrations": { redirect: "/connections" },
    "/integrations/browse": { redirect: "/connections" },
    "/dashboard/integrations": { redirect: "/connections" },
    "/dashboard/marketplace": { redirect: "/connections" },
    // Files / Credentials / Wallet — the former Vault section, flattened to
    // top-level paths. Files keeps its settings + custom sub-pages.
    "/vault": { redirect: "/files" },
    "/vault/files": { redirect: "/files" },
    "/vault/settings": { redirect: "/files/settings" },
    "/vault/custom/**": { redirect: "/files/custom/**" },
    "/vault/credentials": { redirect: "/credentials" },
    "/vault/accounts": { redirect: "/credentials" },
    "/vault/wallet": { redirect: "/wallet" },
    // Storage merged into Files — keep old links working.
    "/storage": { redirect: "/files" },
    "/storage/files": { redirect: "/files" },
    "/storage/settings": { redirect: "/files/settings" },
    // Schedule — promoted out of the dashboard to a top-level path.
    "/dashboard/schedule": { redirect: "/schedule" },
    "/documentation": { redirect: "/documentation/introduction" },
  },
  app: {
    head: {
      // Canonical, og:url, and the titleTemplate function live in app.vue
      // (nuxt.config head must be JSON-serializable — no functions allowed).
      // This default title is the SSR fallback when a page doesn't set one.
      title: "Polymux — Automated End-to-End Flow Testing",
      htmlAttrs: { lang: "en" },
      meta: [
        {
          name: "description",
          content:
            "Polymux captures user journeys as reusable Flows, runs them through platform runners, and verifies expected behaviour with Checks, Artifacts, and replayable evidence.",
        },
        {
          name: "keywords",
          content:
            "end-to-end testing, automated testing, user flows, AI testing, flow checks, test artifacts, Polymux",
        },
        { name: "robots", content: "index,follow" },
        { name: "theme-color", content: "#000000" },
        {
          property: "og:title",
          content: "Polymux — Automated End-to-End Flow Testing",
        },
        {
          property: "og:description",
          content:
            "Capture user journeys as reusable Flows, run them through platform runners, and verify behaviour with Checks, Artifacts, and replayable evidence.",
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
          content: "Polymux — Automated End-to-End Flow Testing",
        },
        {
          name: "twitter:description",
          content:
            "Capture user journeys as reusable Flows, run them through platform runners, and verify behaviour with Checks, Artifacts, and replayable evidence.",
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
              "Polymux captures user journeys as reusable Flows, runs them through platform runners, and verifies expected behaviour with Checks, Artifacts, and replayable evidence.",
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
      "/documentation/connections-port",
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
      // Share the auth session across subdomains (product polymux.com + admin.polymux.com)
      // on PRODUCTION ONLY. Gated on VERCEL_ENV so the domain is applied solely on the
      // production deployment — never on *.vercel.app previews or localhost, where a
      // `.polymux.com` cookie can't be set and would silently break login. This makes it
      // SAFE to set COOKIE_DOMAIN on every Vercel environment (preview/dev ignore it via
      // this gate), and it defaults to `.polymux.com` on prod even if the var is unset.
      //
      // NB: changing this scope leaves a host-scoped (no-Domain) cookie behind in existing
      // browsers; `plugins/supabase-cookie-scope-migrate.client.ts` clears that leftover
      // once a fresh session has been written in the new scope (so no session is lost).
      domain: process.env.VERCEL_ENV === "production"
        ? (process.env.COOKIE_DOMAIN || ".polymux.com")
        : undefined,
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
    plugins: [stripPosthogWorkerSourceMap()],
    optimizeDeps: {
      include: [
        "@internationalized/date",
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
      serverUrl: (process.env.SERVER_URL || "http://localhost:8081").replace(/\/+$/, ''),
      appUrl: (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, ''),
      posthogPublicKey: process.env.POSTHOG_PUBLIC_KEY || "",
      posthogHost: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      extensionId: process.env.EXTENSION_ID || "",
      // Chrome Web Store listing URL for the extension. Empty until the
      // extension is published — the install page shows "Coming soon" while
      // unset, then renders an "Install for Chrome" button once configured.
      extensionStoreUrl: process.env.EXTENSION_STORE_URL || "",
      // Publishable key for in-app (embedded) Stripe Checkout. Safe to expose.
      // Must belong to the SAME account as STRIPE_SECRET_KEY.
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    },
  },
  css: ["~/assets/css/main.css"],
});
