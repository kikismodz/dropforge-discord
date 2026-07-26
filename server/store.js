import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState } from './data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(here, '../data/db.json');
let state;

const rankTable = [
  [100, 'Nova'], [75, 'Mythique'], [50, 'Légende'], [35, 'Maître'],
  [20, 'Élite'], [10, 'Opérateur'], [1, 'Recrue'],
];

export function xpForLevel(level) {
  const safe = Math.max(1, Number(level) || 1);
  return Math.round(300 + (safe - 1) * 115 + Math.pow(safe - 1, 1.32) * 22);
}

export function progressionFromXp(totalXp = 0) {
  let level = 1;
  let remaining = Math.max(0, Number(totalXp) || 0);
  while (level < 100) {
    const needed = xpForLevel(level);
    if (remaining < needed) break;
    remaining -= needed;
    level += 1;
  }
  const next = level >= 100 ? 0 : xpForLevel(level);
  const rank = (rankTable.find(([minimum]) => level >= minimum) || rankTable.at(-1))[1];
  return {
    xp: Math.max(0, Number(totalXp) || 0), level, rank,
    xpIntoLevel: level >= 100 ? 0 : remaining,
    xpForNext: next,
    progress: level >= 100 ? 100 : Math.max(0, Math.min(100, next ? remaining / next * 100 : 0)),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeFairState(userId = 'player') {
  const serverSeed = crypto.randomBytes(32).toString('hex');
  return {
    clientSeed: `skinova-${String(userId).slice(0, 24)}`,
    nonce: 0,
    serverSeed,
    serverHash: crypto.createHash('sha256').update(serverSeed).digest('hex'),
    history: [],
  };
}

function ensureUser(user) {
  user.balance = Number(user.balance) || 0;
  user.inventory ||= [];
  user.history ||= [];
  user.stats ||= { opens: 0, battles: 0, battleWins: 0, upgrades: 0, upgradeWins: 0, tradeUps: 0, profit: 0 };
  user.stats.tradeUps = Math.max(0, Number(user.stats.tradeUps) || 0);
  user.xp = Math.max(0, Number(user.xp) || 0);
  user.banned = Boolean(user.banned);
  user.admin = Boolean(user.admin);
  user.lastDaily ||= 0;
  user.fair ||= makeFairState(user.id);
  user.fair.clientSeed = String(user.fair.clientSeed || `skinova-${String(user.id).slice(0, 24)}`).slice(0, 64);
  user.fair.nonce = Math.max(0, Number(user.fair.nonce) || 0);
  if (!user.fair.serverSeed) user.fair.serverSeed = crypto.randomBytes(32).toString('hex');
  user.fair.serverHash = crypto.createHash('sha256').update(user.fair.serverSeed).digest('hex');
  user.fair.history = Array.isArray(user.fair.history) ? user.fair.history.slice(0, 100) : [];
  return user;
}

function normalize(input) {
  const base = clone(initialState);
  const result = input && typeof input === 'object' ? input : base;
  result.settings = { ...base.settings, ...(result.settings || {}) };
  result.meta = { catalogVersion: 0, ...(result.meta || {}) };
  result.cases = Array.isArray(result.cases) && result.cases.length ? result.cases : base.cases;
  if (Number(result.meta.catalogVersion || 0) < 2) {
    const existingIds = new Set(result.cases.map((entry) => entry.id));
    for (const entry of base.cases) {
      if (!existingIds.has(entry.id)) result.cases.push(clone(entry));
    }
    result.meta.catalogVersion = 2;
  }
  if (Number(result.meta.catalogVersion || 0) < 4) {
    const definitions = new Map();
    for (const caseDef of base.cases) {
      for (const drop of caseDef.items || []) definitions.set(drop.id, drop);
      const current = result.cases.find((entry) => entry.id === caseDef.id);
      if (!current) continue;
      for (const drop of current.items || []) {
        const canonical = definitions.get(drop.id);
        if (!canonical) continue;
        drop.weapon = canonical.weapon;
        drop.name = canonical.name;
        drop.stattrak = canonical.stattrak;
        if (!drop.image || String(drop.image).startsWith('/assets/weapons/')) drop.image = canonical.image;
      }
    }
    const migrateItem = (owned) => {
      const canonical = definitions.get(owned?.itemId);
      if (!canonical) return owned;
      owned.weapon = canonical.weapon;
      owned.name = canonical.name;
      if (!owned.image || String(owned.image).startsWith('/assets/weapons/')) owned.image = canonical.image;
      return owned;
    };
    const migrateHistory = (entry) => {
      for (const key of ['items', 'sourceItems']) {
        if (Array.isArray(entry?.[key])) entry[key].forEach(migrateItem);
      }
    };
    for (const user of result.users || []) {
      (user.inventory || []).forEach(migrateItem);
      (user.history || []).forEach(migrateHistory);
    }
    result.meta.catalogVersion = 4;
  }
  if (Number(result.meta.catalogVersion || 0) < 5) {
    const definitions = new Map();
    for (const caseDef of base.cases) {
      for (const drop of caseDef.items || []) definitions.set(drop.id, drop);
      const current = result.cases.find((entry) => entry.id === caseDef.id);
      if (!current) continue;
      for (const drop of current.items || []) {
        const canonical = definitions.get(drop.id);
        if (!canonical) continue;
        const currentImage = String(drop.image || '');
        if (!currentImage || currentImage.startsWith('/assets/weapons/') || currentImage.includes('raw.githubusercontent.com/ByMykel/')) {
          drop.image = canonical.image;
        }
      }
    }
    const migrateImage = (owned) => {
      const canonical = definitions.get(owned?.itemId);
      if (!canonical) return owned;
      const currentImage = String(owned.image || '');
      if (!currentImage || currentImage.startsWith('/assets/weapons/') || currentImage.includes('raw.githubusercontent.com/ByMykel/')) {
        owned.image = canonical.image;
      }
      return owned;
    };
    for (const user of result.users || []) {
      (user.inventory || []).forEach(migrateImage);
      for (const entry of user.history || []) {
        for (const key of ['items', 'sourceItems']) {
          if (Array.isArray(entry?.[key])) entry[key].forEach(migrateImage);
        }
      }
    }
    result.meta.catalogVersion = 5;
  }

  // V1.4.5 : applique uniquement le mapping strict du catalogue.
  // Toute ancienne URL automatique incorrecte est remplacée par l'image canonique
  // exacte, ou par le visuel générique si aucune correspondance exacte n'existe.
  // Les images personnalisées importées par un administrateur sont conservées.
  {
    const definitions = new Map();
    for (const caseDef of base.cases) {
      for (const drop of caseDef.items || []) definitions.set(drop.id, drop);
    }
    const isManagedImage = (value) => {
      const image = String(value || '');
      return !image
        || image.startsWith('/assets/weapons/')
        || image.includes('raw.githubusercontent.com/ByMykel/')
        || image.includes('counter-strike-image-tracker')
        || image.includes('bymykel.github.io/CSGO-API/')
        || image.includes('git.hubp.de/raw-githubusercontent-com/ByMykel/');
    };
    const applyCanonical = (target) => {
      const canonical = definitions.get(target?.itemId || target?.id);
      if (!canonical || !isManagedImage(target.image)) return;
      target.image = canonical.image;
    };
    for (const caseDef of result.cases || []) {
      for (const drop of caseDef.items || []) applyCanonical(drop);
    }
    for (const user of result.users || []) {
      (user.inventory || []).forEach(applyCanonical);
      for (const entry of user.history || []) {
        for (const key of ['items', 'sourceItems']) {
          if (Array.isArray(entry?.[key])) entry[key].forEach(applyCanonical);
        }
      }
    }
    result.meta.catalogVersion = Math.max(7, Number(result.meta.catalogVersion || 0));
  }

  result.users = Array.isArray(result.users) && result.users.length ? result.users : base.users;
  result.users.forEach(ensureUser);
  result.battles ||= [];
  result.audit ||= [];
  return result;
}

export function load() {
  try {
    state = normalize(JSON.parse(fs.readFileSync(dbPath, 'utf8')));
  } catch {
    state = normalize(clone(initialState));
  }
  save();
  return state;
}

export function getState() {
  if (!state) load();
  return state;
}

export function save() {
  if (!state) return;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(state, null, 2));
}

export function reset() {
  state = normalize(clone(initialState));
  save();
  return state;
}

export function getUser(id) {
  return getState().users.find((u) => u.id === id) || null;
}

export function upsertDiscordUser(profile) {
  const s = getState();
  let user = s.users.find((u) => u.id === profile.id);
  if (!user) {
    user = ensureUser({
      id: profile.id,
      username: profile.global_name || profile.username || 'Joueur Discord',
      avatar: profile.avatarUrl || '',
      balance: 500,
      admin: false,
      banned: false,
      inventory: [],
      history: [],
      stats: { opens: 0, battles: 0, battleWins: 0, upgrades: 0, upgradeWins: 0, tradeUps: 0, profit: 0 },
      xp: 0,
      lastDaily: 0,
    });
    s.users.push(user);
    audit('user', `Compte Discord créé : ${user.username}`, profile.id);
  } else {
    user.username = profile.global_name || profile.username || user.username;
    user.avatar = profile.avatarUrl || user.avatar;
  }
  save();
  return user;
}

export function audit(type, detail, actor = 'system') {
  const s = getState();
  s.audit.unshift({ id: crypto.randomUUID(), type, detail, actor, at: Date.now() });
  if (s.audit.length > 300) s.audit.length = 300;
}

export function publicUser(user) {
  if (!user) return null;
  const progression = progressionFromXp(user.xp);
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    balance: Number(user.balance) || 0,
    admin: Boolean(user.admin),
    banned: Boolean(user.banned),
    stats: clone(user.stats || {}),
    ...progression,
    inventoryCount: (user.inventory || []).length,
    fair: user.fair ? {
      clientSeed: user.fair.clientSeed,
      nonce: Number(user.fair.nonce) || 0,
      serverHash: user.fair.serverHash,
    } : null,
  };
}

export function snapshot() {
  return clone(getState());
}
