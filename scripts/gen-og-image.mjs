#!/usr/bin/env node
// Generate public/og-image.png (1200x630) from the brand SVG mark.
// Run: npm run og:gen
// Re-run whenever the brand mark or tagline changes.

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const out = resolve(projectRoot, "public/og-image.png");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <g transform="translate(120, 215)">
    <rect width="200" height="200" rx="40" ry="40" fill="#ffffff"/>
    <path fill="#0a0a0a" transform="translate(-10 0)" d="M 40 40 L 120 40 A 60 60 0 0 1 120 160 L 40 160 L 70 120 L 110 120 A 20 20 0 0 0 110 80 L 70 80 Z"/>
  </g>
  <text x="380" y="305" font-family="sans-serif" font-size="92" font-weight="700" fill="#ffffff">Polymux</text>
  <text x="380" y="375" font-family="sans-serif" font-size="38" font-weight="400" fill="#a3a3a3">AI Agents for Browser Automation</text>
  <text x="380" y="445" font-family="sans-serif" font-size="26" font-weight="400" fill="#737373">Multi-agent workflows · Live browser sessions · Secure vault</text>
</svg>`;

await sharp(Buffer.from(svg))
  .png({ quality: 92, compressionLevel: 9 })
  .toFile(out);

console.log(`Wrote ${out}`);
