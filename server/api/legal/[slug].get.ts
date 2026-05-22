const SLUG_TO_FILE: Record<string, string> = {
  "about-us": "about-us.md",
  "api-reference": "api-reference.md",
  "install-apps": "install-apps.md",
  "privacy-policy": "privacy-policy.md",
  "terms-of-service": "terms-of-service.md",
  "cookie-policy": "cookie-policy.md",
};

const SUPPORTED_LOCALES = new Set(["en", "es", "fr", "de", "ja", "zh", "pt", "ko"]);
const DEFAULT_LOCALE = "en";

function pickLocale(value: string | undefined): string {
  if (!value) return DEFAULT_LOCALE;
  return SUPPORTED_LOCALES.has(value) ? value : DEFAULT_LOCALE;
}

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");
  if (!slug || !SLUG_TO_FILE[slug]) {
    throw createError({ statusCode: 404, statusMessage: "Not found." });
  }

  const query = getQuery(event);
  const cookie = getCookie(event, "i18n_locale");
  const locale = pickLocale(
    (typeof query.locale === "string" ? query.locale : undefined) ?? cookie,
  );

  const file = SLUG_TO_FILE[slug];
  const storage = useStorage("assets:legal");

  setResponseHeader(event, "content-type", "text/markdown; charset=utf-8");

  const content = await storage.getItem<string>(`${locale}/${file}`);
  if (content) return content;

  if (locale === DEFAULT_LOCALE) {
    throw createError({ statusCode: 500, statusMessage: "Document unavailable." });
  }

  const fallback = await storage.getItem<string>(`${DEFAULT_LOCALE}/${file}`);
  if (fallback) return fallback;

  throw createError({ statusCode: 500, statusMessage: "Document unavailable." });
});
