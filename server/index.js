import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { startDiscordBot } from './bot.js';
import {
  audit,
  getState,
  getUser,
  load,
  publicUser,
  reset,
  save,
  snapshot,
  upsertDiscordUser,
} from './store.js';
import {
  claimDaily,
  createBattle,
  joinBattle,
  openCases,
  runUpgrade, previewTradeUp, runTradeUp,
  sellAll,
  sellItem,
  startBattle,
} from './game.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 3000;
const demoMode = !(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
const sessions = new Map();
const bearerSessions = new Map();
const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: true, credentials: true } });
let botClient = null;

load();
app.use((_req, res, next) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate'); res.set('Pragma', 'no-cache'); res.set('Expires', '0'); next(); });
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

function newSession(userId) {
  const sid = crypto.randomBytes(24).toString('hex');
  sessions.set(sid, { userId, createdAt: Date.now() });
  return sid;
}

function sessionUser(req) {
  const sid = req.cookies?.df_session || req.cookies?.skinova_session;
  const session = sid ? sessions.get(sid) : null;
  return session ? getUser(session.userId) : null;
}

async function bearerUser(req) {
  const header = String(req.get('authorization') || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const accessToken = match[1].trim();
  if (!accessToken) return null;

  const cached = bearerSessions.get(accessToken);
  if (cached && cached.expiresAt > Date.now()) return getUser(cached.userId);

  try {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const profile = await response.json();
    if (!response.ok || !profile?.id) return null;
    const avatarUrl = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128` : '';
    const user = upsertDiscordUser({ ...profile, avatarUrl });
    user.admin = await hasAdminAccess(user);
    bearerSessions.set(accessToken, { userId: user.id, expiresAt: Date.now() + 55 * 60 * 1000 });
    save();
    return user;
  } catch {
    return null;
  }
}

function ensureDemoSession(req, res) {
  if (!demoMode || sessionUser(req)) return;
  const sid = newSession('demo-nova');
  res.cookie('skinova_session', sid, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

async function requireUser(req, res, next) {
  ensureDemoSession(req, res);
  const user = sessionUser(req) || await bearerUser(req) || (demoMode ? getUser('demo-nova') : null);
  if (!user) return res.status(401).json({ error: 'Authentification Discord requise' });
  if (user.banned) return res.status(403).json({ error: 'Compte suspendu' });
  req.user = user;
  next();
}

async function hasAdminAccess(user) {
  if (!user) return false;
  if (user.admin) return true;
  const explicitIds = String(process.env.ADMIN_USER_IDS || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (explicitIds.includes(user.id)) return true;
  const roleId = process.env.ADMIN_ROLE_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (roleId && guildId && botClient) {
    try {
      const guild = await botClient.guilds.fetch(guildId);
      const member = await guild.members.fetch(user.id);
      return member.roles.cache.has(roleId);
    } catch {
      return false;
    }
  }
  return false;
}

async function requireAdmin(req, res, next) {
  await requireUser(req, res, async () => {
    if (!(await hasAdminAccess(req.user))) return res.status(403).json({ error: 'Accès administrateur requis' });
    next();
  });
}

function sanitizeCase(entry) {
  return {
    id: String(entry.id || crypto.randomUUID()),
    name: String(entry.name || 'NOUVELLE CAISSE').toUpperCase().slice(0, 40),
    price: Math.max(1, Number(entry.price) || 10),
    active: entry.active !== false,
    accent: String(entry.accent || '#ff3d8d').slice(0, 16),
    image: String(entry.image || '/assets/cases/budget-frenzy.webp').slice(0, 500),
    tag: String(entry.tag || 'CUSTOM').slice(0, 40),
    items: Array.isArray(entry.items) ? entry.items.map((it) => ({
      id: String(it.id || crypto.randomUUID()), weapon: String(it.weapon || 'Rifle').slice(0, 40),
      name: String(it.name || 'Custom Finish').slice(0, 60), value: Math.max(0.01, Number(it.value) || 1),
      weight: Math.max(0.01, Number(it.weight) || 1), rarity: String(it.rarity || 'restricted'),
      image: String(it.image || '/assets/weapons/rifle.webp').slice(0, 500),
      wear: it.wear || { FN: 8, MW: 18, FT: 42, WW: 20, BS: 12 },
      stattrak: Math.max(0, Math.min(100, Number(it.stattrak) || 0)),
    })) : [],
  };
}

app.get('/api/config', (_req, res) => {
  res.json({
    clientId: process.env.DISCORD_CLIENT_ID || '',
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${port}`,
    demoMode,
    activityProxyPrefix: '/.proxy',
  });
});

app.post('/api/token', async (req, res) => {
  if (demoMode) return res.json({ access_token: 'demo-token' });
  const code = String(req.body?.code || '');
  if (!code) return res.status(400).json({ error: 'Code OAuth manquant' });
  try {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
    });
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    });
    const payload = await response.json();
    if (!response.ok) return res.status(response.status).json(payload);
    res.json(payload);
  } catch (error) {
    res.status(502).json({ error: `Échange OAuth impossible : ${error.message}` });
  }
});

app.post('/api/session/discord', async (req, res) => {
  const accessToken = String(req.body?.access_token || '');
  if (demoMode && accessToken === 'demo-token') {
    const sid = newSession('demo-nova');
    res.cookie('df_session', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
    return res.json({ user: publicUser(getUser('demo-nova')) });
  }
  try {
    const response = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${accessToken}` } });
    const profile = await response.json();
    if (!response.ok) return res.status(response.status).json(profile);
    const avatarUrl = profile.avatar ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=128` : '';
    const user = upsertDiscordUser({ ...profile, avatarUrl });
    user.admin = await hasAdminAccess(user);
    save();
    const sid = newSession(user.id);
    bearerSessions.set(accessToken, { userId: user.id, expiresAt: Date.now() + 55 * 60 * 1000 });
    const cookieOptions = { httpOnly: true, sameSite: 'none', secure: true, maxAge: 30 * 24 * 60 * 60 * 1000, partitioned: true, priority: 'high' };
    res.cookie('skinova_session', sid, cookieOptions);
    res.cookie('df_session', sid, cookieOptions);
    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(502).json({ error: `Session Discord impossible : ${error.message}` });
  }
});

app.post('/api/logout', (req, res) => {
  const sid = req.cookies?.df_session;
  if (sid) sessions.delete(sid);
  res.clearCookie('df_session');
  res.clearCookie('skinova_session');
  res.json({ ok: true });
});

app.get('/api/me', requireUser, async (req, res) => {
  req.user.admin = await hasAdminAccess(req.user);
  save();
  res.json({ user: publicUser(req.user), inventory: req.user.inventory, history: req.user.history });
});

app.get('/api/fair', requireUser, (req, res) => {
  const fair = req.user.fair || {};
  res.json({
    clientSeed: fair.clientSeed || '',
    nonce: Number(fair.nonce) || 0,
    serverHash: fair.serverHash || '',
    history: Array.isArray(fair.history) ? fair.history.slice(0, 30) : [],
  });
});

app.patch('/api/fair/client-seed', requireUser, (req, res) => {
  const seed = String(req.body?.clientSeed || '').trim().slice(0, 64);
  if (seed.length < 3) return res.status(400).json({ error: 'Client seed trop court' });
  req.user.fair ||= {};
  req.user.fair.clientSeed = seed;
  req.user.fair.nonce = Math.max(0, Number(req.user.fair.nonce) || 0);
  audit('fair', `Client seed modifié par ${req.user.username}`, req.user.id);
  save();
  res.json({ clientSeed: seed, nonce: req.user.fair.nonce, serverHash: req.user.fair.serverHash });
});

app.post('/api/demo/switch', (req, res) => {
  if (!demoMode) return res.status(404).end();
  const user = getUser(String(req.body?.userId || ''));
  if (!user) return res.status(404).json({ error: 'Profil de démonstration introuvable' });
  const sid = newSession(user.id);
  res.cookie('df_session', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.json({ user: publicUser(user) });
});

app.get('/api/demo/users', (_req, res) => {
  if (!demoMode) return res.status(404).end();
  res.json({ users: getState().users.filter((u) => !u.banned).map(publicUser) });
});

app.get('/api/cases', (_req, res) => res.json({ cases: getState().cases.filter((c) => c.active !== false) }));
app.get('/api/leaderboard', (_req, res) => {
  const users = [...getState().users].filter((u) => !u.banned).sort((a, b) => (Number(b.xp)||0) - (Number(a.xp)||0) || b.balance - a.balance).slice(0, 20).map(publicUser);
  res.json({ users });
});
app.get('/api/battles', (_req, res) => res.json({ battles: getState().battles.slice(0, 30) }));

app.post('/api/cases/:caseId/open', requireUser, (req, res) => {
  try {
    const result = openCases(req.user.id, req.params.caseId, req.body?.quantity);
    io.emit('user:update', { userId: req.user.id });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/inventory/:uid/sell', requireUser, (req, res) => {
  try { res.json(sellItem(req.user.id, req.params.uid)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/api/inventory/sell-all', requireUser, (req, res) => {
  try { res.json(sellAll(req.user.id)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/trade-up/preview', requireUser, (req, res) => {
  try { res.json(previewTradeUp(req.user.id, req.body?.uids)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/api/trade-up', requireUser, (req, res) => {
  try {
    const result = runTradeUp(req.user.id, req.body?.uids);
    io.emit('user:update', { userId: req.user.id });
    res.json(result);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/upgrade', requireUser, (req, res) => {
  try { res.json(runUpgrade(req.user.id, req.body?.uid, req.body?.multiplier)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/api/daily', requireUser, (req, res) => {
  try { res.json(claimDaily(req.user.id)); }
  catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/battles', requireUser, (req, res) => {
  try {
    const battle = createBattle(req.user.id, req.body?.caseId, req.body?.rounds, req.body?.slots);
    io.emit('battle:update', battle);
    res.json(battle);
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/api/battles/:battleId/join', requireUser, (req, res) => {
  try {
    const battle = joinBattle(req.user.id, req.params.battleId);
    io.emit('battle:update', battle);
    res.json(battle);
  } catch (error) { res.status(400).json({ error: error.message }); }
});
app.post('/api/battles/:battleId/start', requireUser, (req, res) => {
  try {
    const battle = startBattle(req.user.id, req.params.battleId, req.body?.fillBots !== false);
    io.emit('battle:update', battle);
    res.json(battle);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const s = snapshot();
  res.json({
    settings: s.settings,
    cases: s.cases,
    users: s.users.map(publicUser),
    battles: s.battles.slice(0, 30),
    audit: s.audit.slice(0, 100),
    metrics: {
      users: s.users.length,
      activeCases: s.cases.filter((c) => c.active !== false).length,
      inventoryItems: s.users.reduce((sum, u) => sum + u.inventory.length, 0),
      battles: s.battles.length,
      credits: s.users.reduce((sum, u) => sum + Number(u.balance), 0),
    },
  });
});
app.post('/api/admin/cases', requireAdmin, (req, res) => {
  const entry = sanitizeCase(req.body || {});
  getState().cases.push(entry);
  audit('admin', `Caisse créée : ${entry.name}`, req.user.id);
  save();
  res.json(entry);
});
app.put('/api/admin/cases/:id', requireAdmin, (req, res) => {
  const index = getState().cases.findIndex((c) => c.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Caisse introuvable' });
  const entry = sanitizeCase({ ...getState().cases[index], ...req.body, id: req.params.id });
  getState().cases[index] = entry;
  audit('admin', `Caisse modifiée : ${entry.name}`, req.user.id);
  save();
  io.emit('cases:update');
  res.json(entry);
});
app.delete('/api/admin/cases/:id', requireAdmin, (req, res) => {
  const index = getState().cases.findIndex((c) => c.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Caisse introuvable' });
  const [entry] = getState().cases.splice(index, 1);
  audit('admin', `Caisse supprimée : ${entry.name}`, req.user.id);
  save();
  io.emit('cases:update');
  res.json({ ok: true });
});
app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const user = getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (typeof req.body?.username === 'string') user.username = req.body.username.slice(0, 40);
  if (Number.isFinite(Number(req.body?.balance))) user.balance = Math.max(0, Number(req.body.balance));
  if (Number.isFinite(Number(req.body?.xp))) user.xp = Math.max(0, Number(req.body.xp));
  if (typeof req.body?.banned === 'boolean') user.banned = req.body.banned;
  if (typeof req.body?.admin === 'boolean') user.admin = req.body.admin;
  audit('admin', `Compte modifié : ${user.username}`, req.user.id);
  save();
  res.json(publicUser(user));
});
app.patch('/api/admin/settings', requireAdmin, (req, res) => {
  const settings = getState().settings;
  if (Number.isFinite(Number(req.body?.dailyGift))) settings.dailyGift = Math.max(0, Number(req.body.dailyGift));
  if (Number.isFinite(Number(req.body?.openingDurationMs))) settings.openingDurationMs = Math.max(1500, Number(req.body.openingDurationMs));
  if (Number.isFinite(Number(req.body?.upgradeDurationMs))) settings.upgradeDurationMs = Math.max(3000, Number(req.body.upgradeDurationMs));
  if (Number.isFinite(Number(req.body?.battleRoundDurationMs))) settings.battleRoundDurationMs = Math.max(2500, Number(req.body.battleRoundDurationMs));
  for (const key of ['xpOpen','xpBattle','xpBattleWinBonus','xpUpgrade','xpTradeUp','xpDaily']) {
    if (Number.isFinite(Number(req.body?.[key]))) settings[key] = Math.max(0, Number(req.body[key]));
  }
  save();
  res.json(settings);
});
app.post('/api/admin/reset', requireAdmin, (req, res) => {
  reset();
  audit('admin', 'Données de démonstration réinitialisées', req.user.id);
  save();
  res.json({ ok: true });
});

io.on('connection', (socket) => {
  socket.on('activity:join', ({ roomId, user }) => {
    const room = String(roomId || 'skinova-lobby');
    socket.join(room);
    socket.data.room = room;
    socket.data.user = user || { id: socket.id, username: 'Joueur' };
    const members = [...(io.sockets.adapter.rooms.get(room) || [])].map((id) => io.sockets.sockets.get(id)?.data.user).filter(Boolean);
    io.to(room).emit('activity:presence', members);
  });
  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (!room) return;
    const members = [...(io.sockets.adapter.rooms.get(room) || [])].map((id) => io.sockets.sockets.get(id)?.data.user).filter(Boolean);
    io.to(room).emit('activity:presence', members);
  });
});

if (fs.existsSync(dist)) app.use(express.static(dist));
app.use((_req, res) => {
  const index = path.join(dist, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(503).send('Client non compilé. Exécute npm run build.');
});

httpServer.listen(port, '0.0.0.0', async () => {
  console.log(`Skinova Discord disponible sur http://localhost:${port}`);
  if (demoMode) console.log('[Mode démo] Aucun identifiant Discord requis.');
  try {
    botClient = await startDiscordBot({ token: process.env.DISCORD_TOKEN, publicUrl: process.env.ACTIVITY_URL || process.env.PUBLIC_URL, io });
  } catch (error) {
    console.error(`[Discord] Bot non démarré : ${error.message}`);
  }
});
