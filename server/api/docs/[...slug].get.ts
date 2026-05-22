const SUPPORTED_LOCALES = new Set([
  "en",
  "es",
  "fr",
  "de",
  "ja",
  "zh",
  "pt",
  "ko",
]);
const DEFAULT_LOCALE = "en";

function isSafeSlug(slug: string): boolean {
  if (slug.includes("\0")) return false;
  if (slug.startsWith("/") || slug.includes("..")) return false;
  return /^[a-z0-9][a-z0-9\-/]*$/.test(slug);
}

function pickLocale(value: string | undefined): string {
  if (!value) return DEFAULT_LOCALE;
  return SUPPORTED_LOCALES.has(value) ? value : DEFAULT_LOCALE;
}

export default defineEventHandler(async (event) => {
  const raw = getRouterParam(event, "slug") ?? "";
  const slug = Array.isArray(raw) ? raw.join("/") : raw;

  if (!slug || !isSafeSlug(slug)) {
    throw createError({ statusCode: 404, statusMessage: "Not found." });
  }

  const query = getQuery(event);
  const cookie = getCookie(event, "i18n_locale");
  const locale = pickLocale(
    (typeof query.locale === "string" ? query.locale : undefined) ?? cookie,
  );

  const storage = useStorage("assets:docs");
  const key = `${locale}/${slug}.md`;
  const fallbackKey = `${DEFAULT_LOCALE}/${slug}.md`;

  setResponseHeader(event, "content-type", "text/markdown; charset=utf-8");

  const content = await storage.getItem<string>(key);
  if (content) return content;

  if (locale === DEFAULT_LOCALE) {
    throw createError({ statusCode: 404, statusMessage: "Document not found." });
  }

  const fallback = await storage.getItem<string>(fallbackKey);
  if (fallback) return fallback;

  throw createError({ statusCode: 404, statusMessage: "Document not found." });
});
