import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogPath = path.join(here, 'drop-catalog.json');
let catalog = {};
try {
  const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  catalog = parsed && typeof parsed === 'object' ? parsed : {};
} catch {
  catalog = {};
}

export function canonicalDrop(id, fallback = {}) {
  const found = catalog[String(id || '')];
  if (!found || typeof found !== 'object') return { ...fallback };
  return {
    ...fallback,
    weapon: found.weapon || fallback.weapon,
    name: found.name || fallback.name,
    image: found.image || fallback.image,
    sourceImage: found.sourceImage || fallback.sourceImage,
    rarity: found.localRarity || fallback.rarity,
    catalogId: found.catalogId || fallback.catalogId,
    paintIndex: found.paintIndex ?? fallback.paintIndex,
    catalogRarity: found.catalogRarity || fallback.catalogRarity,
    minFloat: found.minFloat ?? fallback.minFloat,
    maxFloat: found.maxFloat ?? fallback.maxFloat,
    catalogMatch: found.match || fallback.catalogMatch,
  };
}

export function dropCatalogSnapshot() {
  return JSON.parse(JSON.stringify(catalog));
}
