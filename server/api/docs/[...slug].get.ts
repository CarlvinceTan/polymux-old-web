import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

const DOCS_ROOT = "content/docs";
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

  const relPath = normalize(`${slug}.md`);
  if (relPath.startsWith("..") || relPath.includes("..")) {
    throw createError({ statusCode: 404, statusMessage: "Not found." });
  }

  // Active locale resolution: ?locale=… wins (so the client can request a
  // specific language), otherwise we use the i18n cookie the Nuxt module
  // writes, falling back to English. Translations that don't exist yet fall
  // back to the English version so a partial locale doesn't 404 the rail.
  const query = getQuery(event);
  const cookie = getCookie(event, "i18n_locale");
  const locale = pickLocale(
    (typeof query.locale === "string" ? query.locale : undefined) ?? cookie,
  );

  const primary = join(process.cwd(), DOCS_ROOT, locale, relPath);
  const fallback = join(process.cwd(), DOCS_ROOT, DEFAULT_LOCALE, relPath);

  setResponseHeader(event, "content-type", "text/markdown; charset=utf-8");

  try {
    return await readFile(primary, "utf-8");
  } catch {
    if (locale === DEFAULT_LOCALE) {
      throw createError({ statusCode: 404, statusMessage: "Document not found." });
    }
    try {
      return await readFile(fallback, "utf-8");
    } catch {
      throw createError({ statusCode: 404, statusMessage: "Document not found." });
    }
  }
});
