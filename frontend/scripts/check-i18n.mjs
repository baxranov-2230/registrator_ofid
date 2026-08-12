#!/usr/bin/env node
/**
 * Fail the build when translation bundles drift apart.
 *
 * ru.json had 6 keys against uz.json's 268, so most of the Russian UI silently
 * fell back to Uzbek with nothing to signal it (F-04). This keeps them level.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const i18nDir = join(here, "..", "src", "shared", "i18n");

const BASE = "uz";
const LOCALES = ["uz", "ru"];

function leafKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? leafKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

const bundles = Object.fromEntries(
  LOCALES.map((code) => [code, JSON.parse(readFileSync(join(i18nDir, `${code}.json`), "utf8"))]),
);

const baseKeys = new Set(leafKeys(bundles[BASE]));
let failed = false;

for (const code of LOCALES.filter((c) => c !== BASE)) {
  const keys = new Set(leafKeys(bundles[code]));
  const missing = [...baseKeys].filter((k) => !keys.has(k)).sort();
  const extra = [...keys].filter((k) => !baseKeys.has(k)).sort();

  if (missing.length) {
    console.error(`\n${code}.json is missing ${missing.length} key(s):`);
    for (const k of missing) console.error(`  - ${k}`);
    failed = true;
  }
  if (extra.length) {
    console.error(`\n${code}.json has ${extra.length} key(s) not in ${BASE}.json:`);
    for (const k of extra) console.error(`  + ${k}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`i18n bundles in sync — ${baseKeys.size} keys across ${LOCALES.join(", ")}`);
