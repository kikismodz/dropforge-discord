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

const WEAPON_ALIASES = new Map(Object.entries({
  mac10: 'mac 10',
  'mac 10': 'mac 10',
  ump45: 'ump 45',
  'ump 45': 'ump 45',
  galil: 'galil ar',
  'galil ar': 'galil ar',
  m4a1s: 'm4a1 s',
  'm4a1 s': 'm4a1 s',
  'cz75 auto': 'cz75 auto',
  cz75: 'cz75 auto',
  'five seven': 'five seven',
  fiveseven: 'five seven',
  'dual berettas': 'dual berettas',
  deagle: 'desert eagle',
  'desert eagle': 'desert eagle',
  'r8 revolver': 'r8 revolver',
  revolver: 'r8 revolver',
}));

const PATTERN_ALIASES = new Map(Object.entries({
  'doppler ruby': 'doppler',
  ruby: 'doppler',
  'doppler sapphire': 'doppler',
  sapphire: 'doppler',
  'doppler black pearl': 'doppler',
  'black pearl': 'doppler',
  'doppler phase 1': 'doppler',
  'doppler phase 2': 'doppler',
  'doppler phase 3': 'doppler',
  'doppler phase 4': 'doppler',
  'gamma doppler emerald': 'gamma doppler',
  emerald: 'gamma doppler',
  'gamma doppler phase 1': 'gamma doppler',
  'gamma doppler phase 2': 'gamma doppler',
  'gamma doppler phase 3': 'gamma doppler',
  'gamma doppler phase 4': 'gamma doppler',
  'marble fade fire ice': 'marble fade',
  'crimson kimono': 'crimson kimono',
}));

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[★™®]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\([^)]*factory new[^)]*\)/gi, ' ')
    .replace(/\([^)]*minimal wear[^)]*\)/gi, ' ')
    .replace(/\([^)]*field tested[^)]*\)/gi, ' ')
    .replace(/\([^)]*well worn[^)]*\)/gi, ' ')
    .replace(/\([^)]*battle scarred[^)]*\)/gi, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonicalWeapon(value) {
  const norm = normalize(value);
  return WEAPON_ALIASES.get(norm) || norm;
}

function canonicalPattern(value) {
  const norm = normalize(value)
    .replace(/\bphase\s*[1-4]\b/g, ' ')
    .replace(/\b(factory new|minimal wear|field tested|well worn|battle scarred)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return PATTERN_ALIASES.get(norm) || norm;
}

function localKey(weapon, skin) {
  return `${String(weapon || '').trim()}|${String(skin || '').trim()}`;
}

function isKnifeName(value) {
  const n = canonicalWeapon(value);
  return /knife|bayonet|karambit|daggers|shadow daggers|talon|navaja|stiletto|ursus|paracord|survival|nomad|skeleton|kukri/.test(n);
}

function isGloveName(value) {
  const n = canonicalWeapon(value);
  return /glove|hand wraps/.test(n);
}

function tokens(value) {
  return new Set(normalize(value).split(' ').filter(Boolean));
}

function jaccard(a, b) {
  const aa = tokens(a); const bb = tokens(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const token of aa) if (bb.has(token)) common += 1;
  return common / (aa.size + bb.size - common);
}

function levenshtein(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function similarity(a, b) {
  const na = normalize(a); const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.82;
  const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length, 1);
  return Math.max(jaccard(na, nb), lev * 0.9);
}

function stableIndex(value, length) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % Math.max(1, length);
}

async function fetchJson(url, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'Skinova/1.4.4 image-mapper' },
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

function makeRecord(entry) {
  const weapon = entry?.weapon?.name || '';
  const pattern = entry?.pattern?.name || '';
  return {
    entry,
    image: entry?.image || '',
    weapon,
    pattern,
    weaponNorm: canonicalWeapon(weapon),
    patternNorm: canonicalPattern(pattern),
    fullNorm: normalize(entry?.name || `${weapon} | ${pattern}`),
    rarityNorm: normalize(entry?.rarity?.name || ''),
  };
}

function matchDrop(drop, records, byExact, byWeapon, knives, gloves) {
  const weaponNorm = canonicalWeapon(drop.weapon);
  const patternNorm = canonicalPattern(drop.name);
  const exact = byExact.get(`${weaponNorm}|${patternNorm}`);
  if (exact) return { record: exact, method: 'exact' };

  const fullNorm = normalize(`${drop.weapon} | ${drop.name}`);
  const full = records.find((record) => record.fullNorm === fullNorm);
  if (full) return { record: full, method: 'full-name' };

  let candidates = byWeapon.get(weaponNorm) || [];
  if (!candidates.length && isKnifeName(drop.weapon)) candidates = knives;
  if (!candidates.length && isGloveName(drop.weapon)) candidates = gloves;
  if (!candidates.length) return { record: null, method: 'missing-weapon' };

  let best = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    let score = similarity(patternNorm, candidate.patternNorm);
    const localRarity = normalize(drop.rarity || '');
    if (localRarity && candidate.rarityNorm.includes(localRarity)) score += 0.04;
    if (score > bestScore) { bestScore = score; best = candidate; }
  }
  if (best && bestScore >= 0.32) return { record: best, method: 'fuzzy', score: bestScore };

  // Dernier recours : une image réelle du même modèle d'arme.
  // Le choix est stable pour éviter que l'image change à chaque redémarrage.
  return {
    record: candidates[stableIndex(localKey(drop.weapon, drop.name), candidates.length)],
    method: 'weapon-fallback',
    score: bestScore,
  };
}

async function main() {
  const existing = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => ({}));
  const loaded = await loadCatalog();

  if (!loaded.data) {
    const report = [
      'SKINOVA — MAPPING DES IMAGES V1.4.4',
      'Le catalogue est momentanément indisponible.',
      `Manifest existant conservé : ${Object.keys(existing).length} image(s).`,
      '',
      ...loaded.errors,
    ].join('\n');
    await fs.writeFile(reportPath, `${report}\n`).catch(() => {});
    console.warn(`[Skinova images] catalogue indisponible, ${Object.keys(existing).length} association(s) conservée(s).`);
    return;
  }

  const records = loaded.data.map(makeRecord).filter((record) => record.image && record.weaponNorm && record.patternNorm);
  const byExact = new Map();
  const byWeapon = new Map();
  const knives = [];
  const gloves = [];
  for (const record of records) {
    const exactKey = `${record.weaponNorm}|${record.patternNorm}`;
    if (!byExact.has(exactKey)) byExact.set(exactKey, record);
    if (!byWeapon.has(record.weaponNorm)) byWeapon.set(record.weaponNorm, []);
    byWeapon.get(record.weaponNorm).push(record);
    if (isKnifeName(record.weapon)) knives.push(record);
    if (isGloveName(record.weapon)) gloves.push(record);
  }

  const requested = new Map();
  for (const caseDef of initialState.cases || []) {
    for (const drop of caseDef.items || []) requested.set(localKey(drop.weapon, drop.name), drop);
  }

  const manifest = {};
  const methods = { exact: 0, 'full-name': 0, fuzzy: 0, 'weapon-fallback': 0, 'missing-weapon': 0 };
  const missing = [];
  const fallbackDetails = [];
  for (const [key, drop] of requested) {
    const match = matchDrop(drop, records, byExact, byWeapon, knives, gloves);
    methods[match.method] = (methods[match.method] || 0) + 1;
    if (!match.record?.image) {
      missing.push(key);
      continue;
    }
    manifest[key] = match.record.image;
    if (match.method !== 'exact' && match.method !== 'full-name') {
      fallbackDetails.push(`${key} -> ${match.record.weapon} | ${match.record.pattern} [${match.method}]`);
    }
  }

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const mapped = Object.keys(manifest).length;
  const report = [
    'SKINOVA — MAPPING DES IMAGES V1.4.4',
    `Source : ${loaded.url}`,
    `Skins demandés : ${requested.size}`,
    `Visuels associés : ${mapped}`,
    `Exact : ${methods.exact}`,
    `Nom complet : ${methods['full-name']}`,
    `Correspondance approchée : ${methods.fuzzy}`,
    `Secours même arme : ${methods['weapon-fallback']}`,
    `Introuvables : ${missing.length}`,
    '',
    'CORRESPONDANCES DE SECOURS',
    ...(fallbackDetails.length ? fallbackDetails : ['Aucune']),
    '',
    'INTRouvables'.toUpperCase(),
    ...(missing.length ? missing : ['Aucun']),
  ].join('\n');
  await fs.writeFile(reportPath, `${report}\n`);
  console.log(`[Skinova images] ${mapped}/${requested.size} visuels associés (${methods.exact + methods['full-name']} exacts, ${methods.fuzzy} approchés, ${methods['weapon-fallback']} secours même arme).`);
}

await main().catch((error) => {
  console.warn(`[Skinova images] synchronisation ignorée : ${error?.message || error}`);
});
