import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState } from '../server/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dbPath = path.join(root, 'data', 'db.json');
const catalogPath = path.join(root, 'server', 'drop-catalog.json');
const legacyImageManifestPath = path.join(root, 'server', 'skin-images.json');
const reportPath = path.join(root, 'Skinova-catalog-sync-report.txt');

const API_CANDIDATES = [
  process.env.SKINOVA_SKINS_API,
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json',
  'https://bymykel.github.io/CSGO-API/api/en/skins.json',
].filter(Boolean);

const localRarityRank = new Map([
  ['consumer', 0], ['industrial', 1], ['mil-spec', 2], ['restricted', 3],
  ['classified', 4], ['covert', 5], ['gold', 6],
]);

const apiRarityRank = new Map([
  ['consumer grade', 0], ['industrial grade', 1], ['mil spec grade', 2],
  ['restricted', 3], ['classified', 4], ['covert', 5],
  ['contraband', 6], ['extraordinary', 6],
]);

const weaponAliases = new Map(Object.entries({
  mac10: 'mac 10', 'mac 10': 'mac 10',
  ump45: 'ump 45', 'ump 45': 'ump 45',
  galil: 'galil ar', 'galil ar': 'galil ar',
  m4a1s: 'm4a1 s', 'm4a1 s': 'm4a1 s',
  deagle: 'desert eagle', 'desert eagle': 'desert eagle',
  fiveseven: 'five seven', 'five seven': 'five seven',
  cz75: 'cz75 auto', 'cz75 auto': 'cz75 auto',
}));

const skinAliases = new Map(Object.entries({
  'doppler phase': 'doppler',
  'doppler phase 1': 'doppler',
  'doppler phase 2': 'doppler',
  'doppler phase 3': 'doppler',
  'doppler phase 4': 'doppler',
  'gamma doppler phase': 'gamma doppler',
  'gamma doppler phase 1': 'gamma doppler',
  'gamma doppler phase 2': 'gamma doppler',
  'gamma doppler phase 3': 'gamma doppler',
  'gamma doppler phase 4': 'gamma doppler',
  'marble fade fire ice': 'marble fade',
}));

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[★™®]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function canonicalWeapon(value) {
  const normalized = normalize(value);
  return weaponAliases.get(normalized) || normalized;
}

function canonicalSkin(value) {
  const normalized = normalize(value)
    .replace(/\b(factory new|minimal wear|field tested|well worn|battle scarred)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return skinAliases.get(normalized) || normalized;
}

function exactKey(weapon, skin) {
  return `${canonicalWeapon(weapon)}|${canonicalSkin(skin)}`;
}

function stableNumber(value) {
  return Number.parseInt(crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12), 16);
}

function apiRank(entry) {
  return apiRarityRank.get(normalize(entry?.rarity?.name)) ?? 3;
}

function isKnifeWeapon(value) {
  const normalized = canonicalWeapon(value);
  return normalized.includes('knife') || normalized.includes('bayonet') || normalized.includes('daggers');
}

function isGloveWeapon(value) {
  const normalized = canonicalWeapon(value);
  return normalized.includes('gloves') || normalized.includes('hand wraps');
}

function parseCatalogEntry(entry) {
  const fullName = String(entry?.name || '').replace(/^\s*★\s*/, '').trim();
  const separator = fullName.indexOf('|');
  const splitWeapon = separator >= 0 ? fullName.slice(0, separator).trim() : '';
  const splitSkin = separator >= 0 ? fullName.slice(separator + 1).trim() : '';
  const weapon = String(entry?.weapon?.name || splitWeapon).replace(/^\s*★\s*/, '').trim();
  const name = String(entry?.pattern?.name || splitSkin).trim();
  if (!weapon || !name || !entry?.image) return null;
  return {
    catalogId: String(entry.id || ''),
    weapon,
    name,
    image: String(entry.image),
    catalogRarity: String(entry?.rarity?.name || ''),
    rank: apiRank(entry),
    paintIndex: entry?.paint_index ?? null,
    minFloat: entry?.min_float ?? null,
    maxFloat: entry?.max_float ?? null,
    stattrakAvailable: Boolean(entry?.stattrak),
    wears: Array.isArray(entry?.wears) ? entry.wears.map((wear) => wear?.name).filter(Boolean) : [],
    key: exactKey(weapon, name),
  };
}

async function fetchJson(url, timeoutMs = Math.max(5000, Number(process.env.SKINOVA_CATALOG_TIMEOUT_MS) || 20000)) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Skinova/1.4.6 canonical-catalog-sync' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadApiCatalog() {
  const errors = [];
  if (process.env.SKINOVA_SKINS_FILE) {
    try {
      const localRaw = JSON.parse(await fs.readFile(path.resolve(process.env.SKINOVA_SKINS_FILE), 'utf8'));
      const entries = localRaw.map(parseCatalogEntry).filter(Boolean);
      if (entries.length < 1) throw new Error('catalogue local vide');
      return { entries, url: `file://${path.resolve(process.env.SKINOVA_SKINS_FILE)}`, errors };
    } catch (error) {
      errors.push(`fichier local — ${error?.message || error}`);
    }
  }
  for (const url of API_CANDIDATES) {
    try {
      const raw = await fetchJson(url);
      if (!Array.isArray(raw) || raw.length < 500) throw new Error('catalogue incomplet');
      const entries = raw.map(parseCatalogEntry).filter(Boolean);
      if (entries.length < 500) throw new Error('catalogue structuré incomplet');
      return { entries, url, errors };
    } catch (error) {
      errors.push(`${url} — ${error?.message || error}`);
    }
  }
  return { entries: null, url: null, errors };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function collectRequestedDrops(database) {
  const definitionsById = new Map();
  for (const caseDef of initialState.cases || []) {
    for (const drop of caseDef.items || []) definitionsById.set(String(drop.id), { ...drop, caseId: caseDef.id });
  }
  // Prefer deployed/persisted names when present, while retaining the canonical IDs and economy fields.
  for (const caseDef of database?.cases || []) {
    for (const drop of caseDef.items || []) {
      const id = String(drop?.id || '');
      if (!id || !definitionsById.has(id)) continue;
      definitionsById.set(id, { ...definitionsById.get(id), ...drop, caseId: caseDef.id });
    }
  }
  return [...definitionsById.values()];
}

function buildIndexes(entries) {
  const exact = new Map();
  const byWeapon = new Map();
  for (const entry of entries) {
    if (!exact.has(entry.key)) exact.set(entry.key, entry);
    const weaponKey = canonicalWeapon(entry.weapon);
    if (!byWeapon.has(weaponKey)) byWeapon.set(weaponKey, []);
    byWeapon.get(weaponKey).push(entry);
  }
  for (const pool of byWeapon.values()) {
    pool.sort((a, b) => a.rank - b.rank || a.weapon.localeCompare(b.weapon) || a.name.localeCompare(b.name));
  }
  return { exact, byWeapon };
}

function compatiblePool(drop, byWeapon, allEntries) {
  const weaponKey = canonicalWeapon(drop.weapon);
  if (byWeapon.has(weaponKey)) return byWeapon.get(weaponKey);
  if (weaponKey === 'knife' || isKnifeWeapon(weaponKey)) return allEntries.filter((entry) => isKnifeWeapon(entry.weapon));
  if (weaponKey === 'gloves' || isGloveWeapon(weaponKey)) return allEntries.filter((entry) => isGloveWeapon(entry.weapon));
  return [];
}

function selectReplacement(drop, pool, usage) {
  if (!pool.length) return null;
  const targetRank = localRarityRank.get(String(drop.rarity || '').toLowerCase()) ?? 3;
  const scored = pool.map((entry) => {
    const useCount = usage.get(entry.key) || 0;
    const rarityDistance = Math.abs(entry.rank - targetRank);
    const stattrakPenalty = Number(drop.stattrak) > 0 && !entry.stattrakAvailable && !isKnifeWeapon(entry.weapon) ? 8 : 0;
    const tie = stableNumber(`${drop.id}|${entry.key}`) % 100000 / 100000;
    return { entry, score: rarityDistance * 100 + useCount * 12 + stattrakPenalty + tie };
  });
  scored.sort((a, b) => a.score - b.score || a.entry.key.localeCompare(b.entry.key));
  return scored[0].entry;
}

function outputRecord(drop, entry, match) {
  return {
    id: String(drop.id),
    weapon: entry.weapon,
    name: entry.name,
    image: entry.image,
    localRarity: drop.rarity,
    catalogRarity: entry.catalogRarity,
    catalogId: entry.catalogId,
    paintIndex: entry.paintIndex,
    minFloat: entry.minFloat,
    maxFloat: entry.maxFloat,
    stattrakAvailable: entry.stattrakAvailable,
    wears: entry.wears,
    match,
    previous: { weapon: drop.weapon, name: drop.name },
  };
}

async function main() {
  if (String(process.env.SKINOVA_SKIP_CATALOG_SYNC || '') === '1') {
    console.log('[Skinova catalogue] synchronisation ignorée par SKINOVA_SKIP_CATALOG_SYNC=1.');
    return;
  }
  const previousCatalog = await readJson(catalogPath, {});
  const database = await readJson(dbPath, null);
  const requested = collectRequestedDrops(database);
  const loaded = await loadApiCatalog();

  if (!loaded.entries) {
    await fs.writeFile(reportPath, [
      'SKINOVA V1.4.6 — CATALOGUE CANONIQUE',
      'Le catalogue distant est indisponible. Le dernier catalogue local est conservé.',
      `Drops locaux conservés : ${Object.keys(previousCatalog).length}`,
      '',
      ...loaded.errors,
    ].join('\n') + '\n').catch(() => {});
    console.warn(`[Skinova catalogue] API indisponible : ${Object.keys(previousCatalog).length} entrée(s) locales conservées.`);
    return;
  }

  const { exact, byWeapon } = buildIndexes(loaded.entries);
  const usage = new Map();
  const output = {};
  const exactMatches = [];
  const replacements = [];
  const unresolved = [];

  for (const drop of requested) {
    const foundExact = exact.get(exactKey(drop.weapon, drop.name));
    const selected = foundExact || selectReplacement(drop, compatiblePool(drop, byWeapon, loaded.entries), usage);
    if (!selected) {
      unresolved.push(`${drop.id} · ${drop.weapon} | ${drop.name}`);
      if (previousCatalog[drop.id]) output[drop.id] = previousCatalog[drop.id];
      continue;
    }
    usage.set(selected.key, (usage.get(selected.key) || 0) + 1);
    const match = foundExact ? 'exact' : 'replacement';
    output[drop.id] = outputRecord(drop, selected, match);
    const line = `${drop.id} · ${drop.weapon} | ${drop.name} -> ${selected.weapon} | ${selected.name}`;
    if (foundExact) exactMatches.push(line);
    else replacements.push(line);
  }

  // Legacy manifest retained for any old UI/server code that still uses weapon|skin keys.
  const imageManifest = {};
  for (const record of Object.values(output)) imageManifest[`${record.weapon}|${record.name}`] = record.image;

  await fs.writeFile(catalogPath, JSON.stringify(output, null, 2) + '\n');
  await fs.writeFile(legacyImageManifestPath, JSON.stringify(imageManifest, null, 2) + '\n');
  await fs.writeFile(reportPath, [
    'SKINOVA V1.4.6 — CATALOGUE CANONIQUE',
    `Source : ${loaded.url}`,
    `Drops analysés : ${requested.length}`,
    `Drops valides : ${Object.keys(output).length}`,
    `Correspondances exactes : ${exactMatches.length}`,
    `Remplacements par un skin réel de la même arme : ${replacements.length}`,
    `Non résolus : ${unresolved.length}`,
    '',
    'REMPLACEMENTS',
    ...(replacements.length ? replacements : ['Aucun']),
    '',
    'CORRESPONDANCES EXACTES',
    ...(exactMatches.length ? exactMatches : ['Aucune']),
    '',
    'NON RÉSOLUS',
    ...(unresolved.length ? unresolved : ['Aucun']),
  ].join('\n') + '\n');

  const valid = Object.keys(output).length;
  console.log(`[Skinova catalogue] ${valid}/${requested.length} drops valides · ${exactMatches.length} exacts · ${replacements.length} remplacés · ${unresolved.length} non résolus.`);
  console.log(`[Skinova images] ${valid}/${requested.length} images canoniques associées.`);
}

await main().catch((error) => {
  console.warn(`[Skinova catalogue] synchronisation ignorée : ${error?.stack || error?.message || error}`);
});
