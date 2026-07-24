import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initialState } from '../server/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outputDir = path.join(root, 'client', 'public', 'assets', 'skins');
const serverManifestPath = path.join(root, 'server', 'skin-images.json');
const publicManifestPath = path.join(outputDir, 'manifest.json');
const missingPath = path.join(root, 'Skinova-images-manquantes.txt');
const API_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json';

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[★™®]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function apiKey(weapon, pattern) {
  return `${normalize(weapon)}|${normalize(pattern)}`;
}

function localKey(weapon, name) {
  return `${String(weapon || '').trim()}|${String(name || '').trim()}`;
}

function slug(value) {
  const clean = normalize(value).replace(/\s+/g, '-').slice(0, 90) || 'skin';
  const hash = crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 8);
  return `${clean}-${hash}.png`;
}

async function fetchWithRetry(url, options = {}, retries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }
  throw lastError;
}

async function downloadOne(entry, destination) {
  try {
    await fs.access(destination);
    return 'cached';
  } catch {}
  const response = await fetchWithRetry(entry.image, {}, 3);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 500) throw new Error('image vide ou trop petite');
  await fs.writeFile(destination, buffer);
  return 'downloaded';
}

async function runPool(tasks, concurrency = 8) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length || 1) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      await tasks[index]();
    }
  });
  await Promise.all(workers);
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  let api;
  try {
    const response = await fetchWithRetry(API_URL, {}, 4);
    api = await response.json();
  } catch (error) {
    console.warn(`[Skinova images] API indisponible: ${error.message}. Les visuels existants sont conservés.`);
    return;
  }

  const byExact = new Map();
  const byFullName = new Map();
  for (const entry of api) {
    if (!entry?.image || !entry?.weapon?.name || !entry?.pattern?.name) continue;
    const key = apiKey(entry.weapon.name, entry.pattern.name);
    if (!byExact.has(key)) byExact.set(key, entry);
    if (entry.name) byFullName.set(normalize(entry.name), entry);
  }

  const requested = new Map();
  for (const caseDef of initialState.cases || []) {
    for (const drop of caseDef.items || []) requested.set(localKey(drop.weapon, drop.name), drop);
  }

  const manifest = {};
  const missing = [];
  const failures = [];
  let downloaded = 0;
  let cached = 0;
  const tasks = [];

  for (const [key, drop] of requested) {
    const exact = byExact.get(apiKey(drop.weapon, drop.name));
    const full = byFullName.get(normalize(`${drop.weapon} | ${drop.name}`));
    const entry = exact || full;
    if (!entry) {
      missing.push(`${drop.weapon} | ${drop.name}`);
      continue;
    }
    const filename = slug(key);
    const relative = `/assets/skins/${filename}`;
    const destination = path.join(outputDir, filename);
    manifest[key] = relative;
    tasks.push(async () => {
      try {
        const status = await downloadOne(entry, destination);
        if (status === 'cached') cached += 1;
        else downloaded += 1;
      } catch (error) {
        delete manifest[key];
        failures.push(`${drop.weapon} | ${drop.name} — ${error.message}`);
      }
    });
  }

  await runPool(tasks, 8);
  await fs.writeFile(serverManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(publicManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const report = [
    'SKINOVA — SYNCHRONISATION DES IMAGES',
    `Demandées : ${requested.size}`,
    `Associées : ${Object.keys(manifest).length}`,
    `Téléchargées : ${downloaded}`,
    `Déjà en cache : ${cached}`,
    `Introuvables dans le catalogue : ${missing.length}`,
    `Échecs de téléchargement : ${failures.length}`,
    '',
    'INTRouvables:',
    ...(missing.length ? missing : ['Aucune']),
    '',
    'ÉCHECS:',
    ...(failures.length ? failures : ['Aucun']),
  ].join('\n');
  await fs.writeFile(missingPath, `${report}\n`);
  console.log(`[Skinova images] ${Object.keys(manifest).length}/${requested.size} visuels prêts (${downloaded} téléchargés, ${cached} en cache).`);
  if (missing.length || failures.length) console.warn(`[Skinova images] Consulte Skinova-images-manquantes.txt (${missing.length + failures.length} entrée(s)).`);
}

await main();
