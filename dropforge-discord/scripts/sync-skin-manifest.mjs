import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState } from '../server/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifestPath = path.join(root, 'server', 'skin-images.json');
const reportPath = path.join(root, 'Skinova-images-runtime.txt');

const API_CANDIDATES = [
  process.env.SKINOVA_SKINS_API,
  'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json',
  'https://bymykel.github.io/CSGO-API/api/en/skins.json',
].filter(Boolean);

const WEAPON_ALIASES = new Map(Object.entries({
  mac10: 'mac 10', 'mac 10': 'mac 10',
  ump45: 'ump 45', 'ump 45': 'ump 45',
  galil: 'galil ar', 'galil ar': 'galil ar',
  m4a1s: 'm4a1 s', 'm4a1 s': 'm4a1 s',
  deagle: 'desert eagle', 'desert eagle': 'desert eagle',
  fiveseven: 'five seven', 'five seven': 'five seven',
  cz75: 'cz75 auto', 'cz75 auto': 'cz75 auto',
  'shadow daggers': 'shadow daggers',
  'm9 bayonet': 'm9 bayonet',
}));

const SKIN_ALIASES = new Map(Object.entries({
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
  const norm = normalize(value);
  return WEAPON_ALIASES.get(norm) || norm;
}

function canonicalSkin(value) {
  const norm = normalize(value)
    .replace(/\b(factory new|minimal wear|field tested|well worn|battle scarred)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return SKIN_ALIASES.get(norm) || norm;
}

function key(weapon, skin) {
  return `${canonicalWeapon(weapon)}|${canonicalSkin(skin)}`;
}

function storageKey(weapon, skin) {
  return `${String(weapon || '').trim()}|${String(skin || '').trim()}`;
}

function splitCatalogName(entry) {
  const full = String(entry?.name || '').replace(/^\s*★\s*/, '').trim();
  const separator = full.indexOf('|');
  if (separator < 0) return null;
  return {
    weapon: full.slice(0, separator).trim(),
    skin: full.slice(separator + 1).trim(),
  };
}

async function fetchJson(url, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Skinova/1.4.5 strict-image-mapper' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadCatalog() {
  const errors = [];
  for (const url of API_CANDIDATES) {
    try {
      const data = await fetchJson(url);
      if (!Array.isArray(data) || data.length < 100) throw new Error('catalogue incomplet');
      return { data, url, errors };
    } catch (error) {
      errors.push(`${url} — ${error?.message || error}`);
    }
  }
  return { data: null, url: null, errors };
}

function buildIndexes(entries) {
  const exact = new Map();
  const duplicateKeys = new Set();
  for (const entry of entries) {
    const parsed = splitCatalogName(entry);
    if (!parsed || !entry?.image) continue;
    const catalogKey = key(parsed.weapon, parsed.skin);
    if (!catalogKey || catalogKey === '|') continue;

    // Plusieurs entrées peuvent partager le même nom (ex. Souvenir/normal).
    // Leur image de finition est normalement identique : on conserve la première.
    if (exact.has(catalogKey)) duplicateKeys.add(catalogKey);
    else exact.set(catalogKey, {
      image: entry.image,
      catalogName: entry.name,
      weapon: parsed.weapon,
      skin: parsed.skin,
    });
  }
  return { exact, duplicateKeys };
}

async function main() {
  const oldManifest = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => ({}));
  const loaded = await loadCatalog();

  if (!loaded.data) {
    await fs.writeFile(reportPath, [
      'SKINOVA — MAPPING STRICT V1.4.5',
      'Catalogue indisponible : le manifest précédent est conservé.',
      `Associations conservées : ${Object.keys(oldManifest).length}`,
      '', ...loaded.errors,
    ].join('\n') + '\n').catch(() => {});
    console.warn(`[Skinova images] catalogue indisponible, ${Object.keys(oldManifest).length} association(s) conservée(s).`);
    return;
  }

  const { exact } = buildIndexes(loaded.data);
  const requested = new Map();
  for (const caseDef of initialState.cases || []) {
    for (const drop of caseDef.items || []) {
      requested.set(storageKey(drop.weapon, drop.name), drop);
    }
  }

  const manifest = {};
  const matched = [];
  const missing = [];
  for (const [localStorageKey, drop] of requested) {
    const wantedKey = key(drop.weapon, drop.name);
    const found = exact.get(wantedKey);
    if (!found?.image) {
      missing.push(`${localStorageKey} [clé: ${wantedKey}]`);
      continue;
    }
    manifest[localStorageKey] = found.image;
    matched.push(`${localStorageKey} -> ${found.catalogName}`);
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(reportPath, [
    'SKINOVA — MAPPING STRICT V1.4.5',
    `Source : ${loaded.url}`,
    `Skins demandés : ${requested.size}`,
    `Correspondances exactes : ${matched.length}`,
    `Non reconnus : ${missing.length}`,
    '',
    'CORRESPONDANCES EXACTES',
    ...(matched.length ? matched : ['Aucune']),
    '',
    'NON RECONNUS (visuel générique utilisé)',
    ...(missing.length ? missing : ['Aucun']),
  ].join('\n') + '\n');

  console.log(`[Skinova images] ${matched.length}/${requested.size} correspondances exactes. ${missing.length} visuel(s) générique(s). Aucun fallback trompeur.`);
}

await main().catch((error) => {
  console.warn(`[Skinova images] synchronisation ignorée : ${error?.message || error}`);
});
