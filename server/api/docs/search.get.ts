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

interface DocHit {
  slug: string;
  title: string;
  snippet: string;
  /** 0–N — higher means stronger match. */
  score: number;
}

function pickLocale(value: string | undefined): string {
  if (!value) return DEFAULT_LOCALE;
  return SUPPORTED_LOCALES.has(value) ? value : DEFAULT_LOCALE;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m?.[1]?.trim() ?? "";
}

function firstIndexCI(haystack: string, needle: string): number {
  if (!needle) return -1;
  return haystack.toLowerCase().indexOf(needle.toLowerCase());
}

function buildSnippet(text: string, query: string): string {
  const idx = firstIndexCI(text, query);
  if (idx === -1) return text.slice(0, 140).trim() + (text.length > 140 ? "…" : "");
  const radius = 60;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).trim() + suffix;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let i = 0;
  while ((i = h.indexOf(n, i)) !== -1) {
    count++;
    i += n.length;
  }
  return count;
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const q = String(query.q ?? "").trim();
  if (!q || q.length < 2) return { hits: [] satisfies DocHit[] };

  const localeParam = typeof query.locale === "string" ? query.locale : undefined;
  const cookie = getCookie(event, "i18n_locale");
  const locale = pickLocale(localeParam ?? cookie);

  const storage = useStorage("assets:docs");

  // getKeys returns keys like "en:introduction.md" — filter to the requested locale.
  let keys = (await storage.getKeys(locale)).filter((k) => k.endsWith(".md"));
  let sourceLocale = locale;

  if (!keys.length && locale !== DEFAULT_LOCALE) {
    keys = (await storage.getKeys(DEFAULT_LOCALE)).filter((k) => k.endsWith(".md"));
    sourceLocale = DEFAULT_LOCALE;
  }

  if (!keys.length) return { hits: [] satisfies DocHit[] };

  const hits: DocHit[] = [];

  await Promise.all(
    keys.map(async (key) => {
      // Key format: "<locale>:<slug>.md" — extract just the slug part.
      const slug = key
        .slice(sourceLocale.length + 1)   // strip "locale:"
        .replace(/\.md$/, "")
        .replace(/:/g, "/");              // restore path separators

      let raw = await storage.getItem<string>(key);
      if (!raw && sourceLocale !== DEFAULT_LOCALE) {
        raw = await storage.getItem<string>(`${DEFAULT_LOCALE}/${slug}.md`);
      }
      if (!raw) return;

      const title = extractTitle(raw) || slug;
      const body = stripMarkdown(raw);

      const titleHits = countOccurrences(title, q);
      const bodyHits = countOccurrences(body, q);
      if (titleHits === 0 && bodyHits === 0) return;

      const score = titleHits * 100 + Math.min(bodyHits, 20) * 5;

      hits.push({ slug, title, snippet: buildSnippet(body, q), score });
    }),
  );

  hits.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return { hits: hits.slice(0, 10) };
});
