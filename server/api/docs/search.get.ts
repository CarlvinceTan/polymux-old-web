import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

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
  // Strip enough markdown that snippets read like prose. We don't need a full
  // parser — the goal is a clean excerpt, not perfect rendering.
  return md
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → label
    .replace(/^#{1,6}\s+/gm, "") // heading hashes
    .replace(/[*_>|]/g, " ") // common emphasis markers + table pipes
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(md: string): string {
  const m = md.match(/^#\s+(.+?)\s*$/m);
  return m?.[1]?.trim() ?? "";
}

/** First case-insensitive occurrence; returns -1 when no match. */
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

  const dir = join(process.cwd(), DOCS_ROOT, locale);
  const fallbackDir = join(process.cwd(), DOCS_ROOT, DEFAULT_LOCALE);

  let filenames: string[] = [];
  try {
    filenames = (await readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    // Locale dir is missing — fall back to English so search still works.
    try {
      filenames = (await readdir(fallbackDir)).filter((f) => f.endsWith(".md"));
    } catch {
      return { hits: [] satisfies DocHit[] };
    }
  }

  const sourceDir = filenames.length ? dir : fallbackDir;

  const hits: DocHit[] = [];

  await Promise.all(
    filenames.map(async (name) => {
      const slug = name.replace(/\.md$/, "");
      let raw: string;
      try {
        raw = await readFile(join(sourceDir, name), "utf-8");
      } catch {
        try {
          raw = await readFile(join(fallbackDir, name), "utf-8");
        } catch {
          return;
        }
      }

      const title = extractTitle(raw) || slug;
      const body = stripMarkdown(raw);

      const titleHits = countOccurrences(title, q);
      const bodyHits = countOccurrences(body, q);
      if (titleHits === 0 && bodyHits === 0) return;

      // Title hits weigh much more than body hits — a slug whose name matches
      // should dominate slugs that merely mention the term.
      const score = titleHits * 100 + Math.min(bodyHits, 20) * 5;

      hits.push({
        slug,
        title,
        snippet: buildSnippet(body, q),
        score,
      });
    }),
  );

  hits.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return { hits: hits.slice(0, 10) };
});
