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
  'https://git.hubp.de/raw-githubusercontent-com/ByMykel/CSGO-API/main/public/api/en/skins.json',
].filter(Boolean);

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[★™®]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function key(weapon, skin) {
  return `${String(weapon || '').trim()}|${String(skin || '').trim()}`;
}

function apiKey(weapon, skin) {
  return `${normalize(weapon)}|${normalize(skin)}`;
}

async function fetchJson(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Skinova/1.4.3 image-manifest' },
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

async function main() {
  const existing = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => ({}));
  const loaded = await loadCatalog();

  if (!loaded.data) {
    const report = [
      'SKINOVA — IMAGES AU DÉMARRAGE',
      'Le catalogue est momentanément indisponible.',
      `Manifest existant conservé : ${Object.keys(existing).length} image(s).`,
      '',
      ...loaded.errors,
    ].join('\n');
    await fs.writeFile(reportPath, `${report}\n`).catch(() => {});
    console.warn(`[Skinova images] catalogue indisponible, ${Object.keys(existing).length} association(s) conservée(s).`);
    return;
  }

  const byExact = new Map();
  const byFullName = new Map();
  for (const entry of loaded.data) {
    if (!entry?.image || !entry?.weapon?.name || !entry?.pattern?.name) continue;
    const exact = apiKey(entry.weapon.name, entry.pattern.name);
    if (!byExact.has(exact)) byExact.set(exact, entry);
    if (entry.name) byFullName.set(normalize(entry.name), entry);
  }

  const requested = new Map();
  for (const caseDef of initialState.cases || []) {
    for (const drop of caseDef.items || []) requested.set(key(drop.weapon, drop.name), drop);
  }

  const manifest = { ...existing };
  const missing = [];
  let matched = 0;
  for (const [localKey, drop] of requested) {
    const entry = byExact.get(apiKey(drop.weapon, drop.name))
      || byFullName.get(normalize(`${drop.weapon} | ${drop.name}`));
    if (!entry?.image) {
      missing.push(localKey);
      continue;
    }
    manifest[localKey] = entry.image;
    matched += 1;
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const report = [
    'SKINOVA — IMAGES AU DÉMARRAGE',
    `Source : ${loaded.url}`,
    `Skins demandés : ${requested.size}`,
    `Skins associés pendant ce démarrage : ${matched}`,
    `Total dans le manifest : ${Object.keys(manifest).length}`,
    `Introuvables : ${missing.length}`,
    '',
    ...(missing.length ? missing : ['Aucun']),
  ].join('\n');
  await fs.writeFile(reportPath, `${report}\n`);
  console.log(`[Skinova images] ${matched}/${requested.size} visuels associés au démarrage.`);
}

await main().catch((error) => {
  // L'application doit toujours démarrer, même si le catalogue distant échoue.
  console.warn(`[Skinova images] synchronisation ignorée : ${error?.message || error}`);
});
