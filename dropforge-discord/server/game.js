import crypto from 'node:crypto';
import { getState, save, audit, getUser } from './store.js';

const wearKeys = ['FN', 'MW', 'FT', 'WW', 'BS'];
const MAX_52 = 0xFFFFFFFFFFFFF;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function unitFromDigest(digest, offset = 0) {
  const part = String(digest).slice(offset, offset + 13).padEnd(13, '0');
  return parseInt(part, 16) / MAX_52;
}

function ensureFair(user) {
  user.fair ||= {};
  user.fair.clientSeed = String(user.fair.clientSeed || `skinova-${String(user.id).slice(0, 24)}`).slice(0, 64);
  user.fair.nonce = Math.max(0, Number(user.fair.nonce) || 0);
  if (!user.fair.serverSeed) user.fair.serverSeed = crypto.randomBytes(32).toString('hex');
  user.fair.serverHash = sha256Hex(user.fair.serverSeed);
  user.fair.history = Array.isArray(user.fair.history) ? user.fair.history : [];
  return user.fair;
}

function fairRoll(user, context) {
  const fair = ensureFair(user);
  const serverSeed = fair.serverSeed;
  const serverHash = fair.serverHash;
  const nonce = fair.nonce;
  const clientSeed = fair.clientSeed;
  const message = `${clientSeed}:${nonce}:${context}`;
  const digest = crypto.createHmac('sha256', serverSeed).update(message).digest('hex');
  const nextServerSeed = crypto.randomBytes(32).toString('hex');
  const nextServerHash = sha256Hex(nextServerSeed);
  const proof = {
    algorithm: 'HMAC-SHA256',
    serverSeed,
    serverHash,
    clientSeed,
    nonce,
    context,
    message,
    digest,
    roll: unitFromDigest(digest, 0),
    wearRoll: unitFromDigest(digest, 13),
    stattrakRoll: unitFromDigest(digest, 26),
    visualRoll: unitFromDigest(digest, 39),
    nextServerHash,
  };
  fair.nonce += 1;
  fair.serverSeed = nextServerSeed;
  fair.serverHash = nextServerHash;
  proof.at = Date.now();
  fair.history.unshift(proof);
  if (fair.history.length > 100) fair.history.length = 100;
  return proof;
}

function pickWeighted(entries, roll, weightKey = 'weight') {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry[weightKey]) || 0), 0);
  if (!total) return entries[0];
  let point = Math.max(0, Math.min(0.9999999999999999, Number(roll) || 0)) * total;
  for (const entry of entries) {
    point -= Math.max(0, Number(entry[weightKey]) || 0);
    if (point <= 0) return entry;
  }
  return entries.at(-1);
}

function chooseWear(item, roll) {
  const rates = wearKeys.map((key) => ({ key, weight: Math.max(0, Number(item.wear?.[key]) || 0) }));
  return pickWeighted(rates, roll).key;
}

function materialize(item, wearRoll = 0, stattrakRoll = 1) {
  const state = getState();
  const condition = chooseWear(item, wearRoll);
  const stattrak = Number(item.stattrak) > 0 && Number(stattrakRoll) < Number(item.stattrak) / 100;
  const mult = state.settings.valueMultipliers || {};
  const value = Number(item.value) * (Number(mult[condition]) || 1) * (stattrak ? Number(mult.ST) || 1 : 1);
  return {
    uid: crypto.randomUUID(),
    itemId: item.id,
    weapon: item.weapon,
    name: item.name,
    rarity: item.rarity,
    image: item.image,
    condition,
    stattrak,
    baseValue: Number(item.value),
    value: Math.round(value * 100) / 100,
    obtainedAt: Date.now(),
  };
}

export function findCase(caseId) {
  return getState().cases.find((entry) => entry.id === caseId && entry.active !== false) || null;
}

export function rollCase(caseId, fairUser, context = `case:${caseId}`) {
  const caseDef = findCase(caseId);
  if (!caseDef) throw new Error('Caisse introuvable');
  if (!fairUser) throw new Error('Utilisateur Provably Fair introuvable');
  const proof = fairRoll(fairUser, context);
  const definition = pickWeighted(caseDef.items, proof.roll);
  const item = materialize(definition, proof.wearRoll, proof.stattrakRoll);
  proof.itemId = definition.id;
  proof.condition = item.condition;
  proof.stattrak = item.stattrak;
  return { item, proof };
}

function pushHistory(user, entry) {
  user.history.unshift({ id: crypto.randomUUID(), at: Date.now(), ...entry });
  if (user.history.length > 250) user.history.length = 250;
}

export function openCases(userId, caseId, quantity) {
  const user = getUser(userId);
  const caseDef = findCase(caseId);
  const qty = [1, 3, 5, 10].includes(Number(quantity)) ? Number(quantity) : 1;
  if (!user || !caseDef) throw new Error('Utilisateur ou caisse introuvable');
  if (user.banned) throw new Error('Compte suspendu');
  const cost = caseDef.price * qty;
  if (user.balance < cost) throw new Error('Solde insuffisant');
  user.balance -= cost;
  const rolls = Array.from({ length: qty }, (_, index) => rollCase(caseId, user, `open:${caseId}:${index}`));
  const items = rolls.map((entry) => entry.item);
  const proofs = rolls.map((entry) => entry.proof);
  const total = items.reduce((sum, it) => sum + it.value, 0);
  user.inventory.unshift(...items);
  user.stats.opens += qty;
  user.stats.profit += total - cost;
  pushHistory(user, {
    type: 'open', outcome: total >= cost ? 'win' : 'lose',
    title: `Ouverture x${qty} · ${caseDef.name}`,
    detail: `${items.length} gains · ${total.toFixed(2)} CR`,
    cost, payout: total, profit: total - cost, items, proofs,
  });
  audit('open', `${user.username} ouvre ${caseDef.name} x${qty}`, user.id);
  save();
  return { case: caseDef, items, proofs, cost, total, profit: total - cost, balance: user.balance, nextServerHash: user.fair.serverHash };
}

export function sellItem(userId, uid) {
  const user = getUser(userId);
  if (!user) throw new Error('Utilisateur introuvable');
  const index = user.inventory.findIndex((it) => it.uid === uid);
  if (index < 0) throw new Error('Objet introuvable');
  const [item] = user.inventory.splice(index, 1);
  user.balance += item.value;
  pushHistory(user, { type: 'sell', outcome: 'neutral', title: 'Revente sans frais', detail: `${item.weapon} · ${item.name}`, payout: item.value, profit: 0, items: [item] });
  save();
  return { item, balance: user.balance };
}

export function sellAll(userId) {
  const user = getUser(userId);
  if (!user) throw new Error('Utilisateur introuvable');
  const total = user.inventory.reduce((sum, it) => sum + Number(it.value), 0);
  const count = user.inventory.length;
  user.inventory = [];
  user.balance += total;
  pushHistory(user, { type: 'sell', outcome: 'neutral', title: 'Inventaire revendu', detail: `${count} objets · 0 % de frais`, payout: total, profit: 0, items: [] });
  save();
  return { total, count, balance: user.balance };
}

export function runUpgrade(userId, uid, multiplier) {
  const user = getUser(userId);
  if (!user) throw new Error('Utilisateur introuvable');
  const index = user.inventory.findIndex((it) => it.uid === uid);
  if (index < 0) throw new Error('Objet introuvable');
  const source = user.inventory[index];
  const mult = Math.min(10, Math.max(1.2, Number(multiplier) || 2));
  const chance = Math.min(0.9, 0.95 / mult);
  const proof = fairRoll(user, `upgrade:${uid}:${mult.toFixed(4)}`);
  const success = proof.roll < chance;
  proof.chance = chance;
  proof.success = success;
  user.inventory.splice(index, 1);
  let result = null;
  if (success) {
    const allItems = getState().cases.flatMap((c) => c.items).filter((it) => Number(it.value) >= source.value * mult * 0.75);
    const target = allItems.length ? allItems.sort((a, b) => Math.abs(a.value - source.value * mult) - Math.abs(b.value - source.value * mult))[0] : getState().cases.at(-1).items.at(-1);
    result = materialize(target, proof.wearRoll, proof.stattrakRoll);
    proof.itemId = target.id;
    proof.condition = result.condition;
    proof.stattrak = result.stattrak;
    user.inventory.unshift(result);
  }
  user.stats.upgrades += 1;
  if (success) user.stats.upgradeWins += 1;
  user.stats.profit += (result?.value || 0) - source.value;
  pushHistory(user, {
    type: 'upgrade', outcome: success ? 'win' : 'lose', title: success ? 'Upgrade réussi' : 'Upgrade perdu',
    detail: `${source.weapon} · ${source.name} → x${mult.toFixed(1)}`,
    cost: source.value, payout: result?.value || 0, profit: (result?.value || 0) - source.value,
    items: result ? [result] : [source], chance: chance * 100, proofs: [proof],
  });
  save();
  return { success, chance: chance * 100, source, result, proof, balance: user.balance, nextServerHash: user.fair.serverHash };
}

function botPlayer(index) {
  const names = ['RAVEN', 'KIRA', 'VOLT', 'ONYX', 'SPECTRE', 'ZERO'];
  return { id: `bot-${index}-${crypto.randomUUID().slice(0, 5)}`, username: names[index % names.length], avatar: '', bot: true };
}

export function createBattle(ownerId, caseId, rounds, slots) {
  const owner = getUser(ownerId);
  const caseDef = findCase(caseId);
  if (!owner || !caseDef) throw new Error('Caisse ou propriétaire introuvable');
  const battle = {
    id: crypto.randomUUID(), ownerId, caseId,
    rounds: [1, 3, 5].includes(Number(rounds)) ? Number(rounds) : 3,
    slots: Math.min(4, Math.max(2, Number(slots) || 2)),
    status: 'waiting', createdAt: Date.now(), players: [{ id: owner.id, username: owner.username, avatar: owner.avatar, bot: false }], result: null,
  };
  getState().battles.unshift(battle);
  audit('battle', `${owner.username} crée une battle ${caseDef.name}`, owner.id);
  save();
  return battle;
}

export function joinBattle(userId, battleId) {
  const user = getUser(userId);
  const battle = getState().battles.find((b) => b.id === battleId);
  if (!user || !battle) throw new Error('Battle introuvable');
  if (battle.status !== 'waiting') throw new Error('Battle déjà lancée');
  if (battle.players.some((p) => p.id === user.id)) return battle;
  if (battle.players.length >= battle.slots) throw new Error('Battle complète');
  battle.players.push({ id: user.id, username: user.username, avatar: user.avatar, bot: false });
  save();
  return battle;
}

export function startBattle(userId, battleId, fillBots = true) {
  const battle = getState().battles.find((b) => b.id === battleId);
  if (!battle) throw new Error('Battle introuvable');
  if (battle.ownerId !== userId && !getUser(userId)?.admin) throw new Error('Seul le créateur peut lancer');
  if (battle.status !== 'waiting') return battle;
  if (fillBots) while (battle.players.length < battle.slots) battle.players.push(botPlayer(battle.players.length));
  if (battle.players.length < 2) throw new Error('Il faut au moins deux joueurs');
  const caseDef = findCase(battle.caseId);
  const entryCost = caseDef.price * battle.rounds;
  for (const player of battle.players) {
    if (player.bot) continue;
    const user = getUser(player.id);
    if (!user || user.balance < entryCost) throw new Error(`${player.username} n’a pas assez de crédits`);
  }
  for (const player of battle.players) if (!player.bot) getUser(player.id).balance -= entryCost;
  const rounds = [];
  const totals = Object.fromEntries(battle.players.map((p) => [p.id, 0]));
  const fairUser = getUser(battle.ownerId) || getUser(userId);
  for (let round = 0; round < battle.rounds; round += 1) {
    const drops = battle.players.map((player) => {
      const rolled = rollCase(battle.caseId, fairUser, `battle:${battle.id}:${round + 1}:${player.id}`);
      totals[player.id] += rolled.item.value;
      return { playerId: player.id, item: rolled.item, proof: rolled.proof };
    });
    rounds.push({ round: round + 1, drops });
  }
  const max = Math.max(...Object.values(totals));
  const winnerIds = Object.entries(totals).filter(([, value]) => value === max).map(([id]) => id);
  const pot = entryCost * battle.players.length;
  const prize = pot / winnerIds.length;
  for (const player of battle.players) {
    if (player.bot) continue;
    const user = getUser(player.id);
    const won = winnerIds.includes(player.id);
    if (won) user.balance += prize;
    user.stats.battles += 1;
    if (won) user.stats.battleWins += 1;
    user.stats.profit += (won ? prize : 0) - entryCost;
    const playerItems = rounds.map((r) => r.drops.find((d) => d.playerId === player.id).item);
    pushHistory(user, {
      type: 'battle', outcome: won ? 'win' : 'lose', title: `${won ? 'Battle gagnée' : 'Battle perdue'} · ${caseDef.name}`,
      detail: `${battle.players.length} joueurs · ${battle.rounds} manches`, cost: entryCost,
      payout: won ? prize : 0, profit: (won ? prize : 0) - entryCost, items: playerItems,
      battleId: battle.id, totals, winnerIds, proofs: rounds.map((r) => r.drops.find((d) => d.playerId === player.id).proof),
    });
  }
  battle.status = 'finished';
  battle.startedAt = Date.now();
  battle.result = { rounds, totals, winnerIds, pot, prize, roundDurationMs: Math.max(2500, Number(getState().settings.battleRoundDurationMs) || 5600) };
  audit('battle', `Battle terminée : ${caseDef.name} · ${winnerIds.length} gagnant(s)`, userId);
  save();
  return battle;
}

export function claimDaily(userId) {
  const user = getUser(userId);
  if (!user) throw new Error('Utilisateur introuvable');
  const day = 24 * 60 * 60 * 1000;
  const remaining = day - (Date.now() - Number(user.lastDaily || 0));
  if (remaining > 0) throw new Error(`Reviens dans ${Math.ceil(remaining / 3_600_000)} h`);
  const amount = Number(getState().settings.dailyGift) || 100;
  user.balance += amount;
  user.lastDaily = Date.now();
  pushHistory(user, { type: 'daily', outcome: 'win', title: 'Bonus quotidien', detail: `${amount} crédits fictifs`, payout: amount, profit: amount, items: [] });
  save();
  return { amount, balance: user.balance };
}
