import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState } from './data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(here, '../data/db.json');
let state;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureUser(user) {
  user.balance = Number(user.balance) || 0;
  user.inventory ||= [];
  user.history ||= [];
  user.stats ||= { opens: 0, battles: 0, battleWins: 0, upgrades: 0, upgradeWins: 0, profit: 0 };
  user.banned = Boolean(user.banned);
  user.admin = Boolean(user.admin);
  user.lastDaily ||= 0;
  return user;
}

function normalize(input) {
  const base = clone(initialState);
  const result = input && typeof input === 'object' ? input : base;
  result.settings = { ...base.settings, ...(result.settings || {}) };
  result.cases = Array.isArray(result.cases) && result.cases.length ? result.cases : base.cases;
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
    save();
  }
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
      stats: { opens: 0, battles: 0, battleWins: 0, upgrades: 0, upgradeWins: 0, profit: 0 },
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
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    balance: Number(user.balance) || 0,
    admin: Boolean(user.admin),
    banned: Boolean(user.banned),
    stats: clone(user.stats || {}),
    inventoryCount: (user.inventory || []).length,
  };
}

export function snapshot() {
  return clone(getState());
}
