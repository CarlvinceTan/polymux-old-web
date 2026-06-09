#!/usr/bin/env node
/**
 * Fill missing i18n keys from en.json, then apply locale-specific translation patches.
 * Run from web/: node scripts/i18n-sync-from-en.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localesDir = path.join(__dirname, '../i18n/locales')
const patchesDir = path.join(__dirname, '../i18n/patches')

function deepMerge(target, source, onlyMissing = false) {
  for (const key of Object.keys(source)) {
    const sv = source[key]
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {}
      }
      deepMerge(target[key], sv, onlyMissing)
    }
    else if (!onlyMissing || !(key in target)) {
      target[key] = sv
    }
  }
  return target
}

const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'))
const locales = ['de', 'es', 'fr', 'ja', 'ko', 'pt', 'zh']

for (const loc of locales) {
  const file = path.join(localesDir, `${loc}.json`)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  deepMerge(data, en, true)
  const patchFile = path.join(patchesDir, `${loc}.json`)
  if (fs.existsSync(patchFile)) {
    const patch = JSON.parse(fs.readFileSync(patchFile, 'utf8'))
    deepMerge(data, patch, false)
  }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  console.log(`Updated ${loc}.json`)
}
