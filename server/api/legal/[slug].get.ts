import { readFile } from "node:fs/promises";
import { join } from "node:path";

const SLUG_TO_FILE: Record<string, string> = {
  "about-us": "about-us.md",
  "api-reference": "api-reference.md",
  community: "community.md",
  documentation: "documentation.md",
  "install-app": "install-app.md",
  "privacy-policy": "privacy-policy.md",
  "terms-of-service": "terms-of-service.md",
  "cookie-policy": "cookie-policy.md",
};

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");
  if (!slug || !SLUG_TO_FILE[slug]) {
    throw createError({ statusCode: 404, statusMessage: "Not found." });
  }
  const filePath = join(process.cwd(), "content", SLUG_TO_FILE[slug]);
  try {
    const text = await readFile(filePath, "utf-8");
    setResponseHeader(event, "content-type", "text/markdown; charset=utf-8");
    return text;
  } catch {
    throw createError({ statusCode: 500, statusMessage: "Document unavailable." });
  }
});
