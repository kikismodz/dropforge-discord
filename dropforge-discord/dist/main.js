
const qs = new URLSearchParams(location.search);
const insideDiscord = qs.has('frame_id') || qs.has('instance_id');
const apiBase = insideDiscord ? '/.proxy/api' : '/api';
const socketPath = insideDiscord ? '/.proxy/socket.io' : '/socket.io';
const rarityColor = { consumer:'#9aa3b8', industrial:'#58a6ff', 'mil-spec':'#536dff', restricted:'#a95cff', classified:'#ff4fb2', covert:'#ff4b55', gold:'#ffc447' };
const rarityOrder = ['consumer','industrial','mil-spec','restricted','classified','covert','gold'];
const rarityLabel = { consumer:'Consumer', industrial:'Industrial', 'mil-spec':'Mil-Spec', restricted:'Restricted', classified:'Classified', covert:'Covert', gold:'Gold' };

const state = {
  config: null,
  user: null,
  inventory: [],
  history: [],
  cases: [],
  battles: [],
  leaderboard: [],
  presence: [],
  active: qs.get('screen') || 'home',
  selectedCase: null,
  quantity: 1,
  admin: null,
  socket: null,
  discord: null,
  fair: null,
  fairData: null,
  lastProofs: [],
  loading: true,
  tradeSelection: [],
};

function money(value) {
  return Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function progression(user = state.user) {
  return {
    level: Math.max(1, Number(user?.level) || 1),
    rank: String(user?.rank || 'Recrue'),
    xp: Math.max(0, Number(user?.xp) || 0),
    xpIntoLevel: Math.max(0, Number(user?.xpIntoLevel) || 0),
    xpForNext: Math.max(0, Number(user?.xpForNext) || 0),
    progress: Math.max(0, Math.min(100, Number(user?.progress) || 0)),
  };
}
function nextRarity(rarity) {
  const index = rarityOrder.indexOf(rarity);
  return index >= 0 && index < rarityOrder.length - 1 ? rarityOrder[index + 1] : null;
}
function tradeSelectedItems() {
  const ids = new Set(state.tradeSelection || []);
  return state.inventory.filter((item) => ids.has(item.uid));
}
function tradeCompatible(item, selected = tradeSelectedItems()) {
  if (!item || item.rarity === 'gold') return false;
  if (!selected.length) return true;
  return item.rarity === selected[0].rarity && Boolean(item.stattrak) === Boolean(selected[0].stattrak);
}
function upgradeChancePercent(multiplier) {
  const mult = Math.max(1.01, Number(multiplier) || 2);
  return Math.max(1, Math.min(90, (0.95 / mult) * 100));
}
function dialBackground(chance) {
  const angle = Math.max(0, Math.min(360, Number(chance) * 3.6));
  return `conic-gradient(from 0deg, #ff9a1f 0deg ${angle}deg, #303844 ${angle}deg 360deg)`;
}
function updateUpgradeDial(multiplier) {
  const chance = upgradeChancePercent(multiplier);
  const value = document.getElementById('chanceValue');
  if (value) value.textContent = `${chance.toFixed(1)}%`;
  const bar = document.querySelector('.chance-preview i');
  if (bar) bar.style.width = `${chance}%`;
  const dial = document.querySelector('.upgrade-dial-preview');
  if (dial) {
    // Direct assignment forces Discord WebView to repaint the conic gradient.
    dial.style.background = dialBackground(chance);
    dial.dataset.chance = String(chance);
  }
  const winLabel = document.querySelector('.upgrade-dial-preview .dial-zone-label.win');
  if (winLabel) winLabel.textContent = `WIN ${chance.toFixed(1)}%`;
  const loseLabel = document.querySelector('.upgrade-dial-preview .dial-zone-label.lose');
  if (loseLabel) loseLabel.textContent = `LOSE ${(100 - chance).toFixed(1)}%`;
  return chance;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}
function initials(name) {
  return String(name || 'SV').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}
function avatar(user, size = '') {
  if (user?.avatar) return `<span class="avatar ${size}"><img src="${esc(user.avatar)}" alt="${esc(user.username)}"></span>`;
  return `<span class="avatar ${size}">${esc(initials(user?.username))}</span>`;
}
function api(path, options = {}) {
  return fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
    return payload;
  });
}
function unitFromDigest(digest, offset = 0) {
  const part = String(digest || '').slice(offset, offset + 13).padEnd(13, '0');
  return parseInt(part, 16) / 0xFFFFFFFFFFFFF;
}
function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function sha256Text(value) {
  const bytes = new TextEncoder().encode(String(value));
  return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
}
async function hmacText(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(secret)), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(String(message))));
}
function weightedItemFromRoll(caseDef, roll) {
  const total = caseDef.items.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
  let point = Math.max(0, Math.min(0.9999999999999999, Number(roll) || 0)) * total;
  for (const item of caseDef.items) {
    point -= Math.max(0, Number(item.weight) || 0);
    if (point <= 0) return item;
  }
  return caseDef.items.at(-1);
}
async function verifyProof(proof) {
  if (!proof) return { valid:false, checks:[], error:'Preuve absente' };
  const commitment = await sha256Text(proof.serverSeed);
  const digest = await hmacText(proof.serverSeed, proof.message || `${proof.clientSeed}:${proof.nonce}:${proof.context}`);
  const roll = unitFromDigest(digest, 0);
  const wearRoll = unitFromDigest(digest, 13);
  const stattrakRoll = unitFromDigest(digest, 26);
  const visualRoll = unitFromDigest(digest, 39);
  const checks = [
    ['Engagement SHA-256', commitment === proof.serverHash],
    ['HMAC-SHA256', digest === proof.digest],
    ['Roll principal', Math.abs(roll - Number(proof.roll)) < 1e-12],
    ['Roll état', Math.abs(wearRoll - Number(proof.wearRoll)) < 1e-12],
    ['Roll StatTrak', Math.abs(stattrakRoll - Number(proof.stattrakRoll)) < 1e-12],
    ['Position visuelle', Math.abs(visualRoll - Number(proof.visualRoll)) < 1e-12],
  ];
  if (proof.context?.startsWith('upgrade:') && Number.isFinite(Number(proof.chance))) {
    checks.push(['Résultat WIN/LOSE', (roll < Number(proof.chance)) === Boolean(proof.success)]);
  }
  const caseId = proof.context?.startsWith('open:') ? proof.context.split(':')[1] : proof.context?.startsWith('battle:') ? state.cases.find((c)=>c.items.some((it)=>it.id===proof.itemId))?.id : null;
  const caseDef = caseId ? state.cases.find((c)=>c.id===caseId) : state.cases.find((c)=>c.items.some((it)=>it.id===proof.itemId));
  if (caseDef && proof.itemId) checks.push(['Objet tiré', weightedItemFromRoll(caseDef, roll)?.id === proof.itemId]);
  return { valid:checks.every(([,ok])=>ok), checks, commitment, digest, roll, wearRoll, stattrakRoll, visualRoll };
}
function shortHash(value) { const text=String(value || ''); return text ? `${text.slice(0,12)}…${text.slice(-10)}` : '—'; }

function toast(message, tone = '') {
  const root = document.getElementById('toastRoot');
  const node = document.createElement('div');
  node.className = `toast ${tone}`;
  node.textContent = message;
  root.appendChild(node);
  setTimeout(() => node.classList.add('show'), 20);
  setTimeout(() => { node.classList.remove('show'); setTimeout(() => node.remove(), 250); }, 3300);
}
function modal(html, cls = '') {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal-card ${cls}">${html}</div></div>`;
  const backdrop = root.querySelector('.modal-backdrop');

  // ClickFix V3: every interactive control receives its own listener.
  // This avoids WebView/browser issues with delegated clicks inside modal layers.
  root.querySelectorAll('button, [data-qty], [data-action], [data-demo-user], [data-close-modal]').forEach((control) => {
    control.style.pointerEvents = 'auto';
    control.style.touchAction = 'manipulation';
    control.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handleClick(event);
    });
  });

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeModal();
  });
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; if (state.user && ['inventory','upgrade','tradeup'].includes(state.active)) renderMain(); }

async function initDiscord() { state.config = await api('/config'); }

async function reloadUser() {
  const payload = await api('/me');
  state.user = payload.user;
  state.inventory = payload.inventory || [];
  state.history = payload.history || [];
  state.fair = payload.user?.fair || null;
}
async function loadPublic() {
  const [cases, battles, leaderboard] = await Promise.all([
    api('/cases'), api('/battles'), api('/leaderboard'),
  ]);
  state.cases = cases.cases || [];
  state.battles = battles.battles || [];
  state.leaderboard = leaderboard.users || [];
}
async function init() {
  renderLoading();
  try {
    await initDiscord();
    await Promise.all([reloadUser(), loadPublic()]);
    connectSocket();
    state.loading = false;
    render();
    if (state.active === 'admin' && state.user.admin) loadAdmin();
  } catch (error) {
    document.getElementById('app').innerHTML = `<div class="fatal"><div class="logo-mark">SV</div><h1>Connexion impossible</h1><p>${esc(error.message)}</p><button onclick="location.reload()">Réessayer</button></div>`;
  }
}
function connectSocket() {
  state.presence=[state.user,...state.leaderboard.filter((u)=>u.id!==state.user.id).slice(0,4)];
  setInterval(async()=>{try{const p=await api('/battles');state.battles=p.battles||[];if(state.active==='battles')renderMain();}catch{}},5000);
}
function renderLoading() {
  document.getElementById('app').innerHTML = `<div class="loading-screen"><div class="logo-mark pulse">SV</div><strong>SKINOVA</strong><small>Chargement de Skinova V1.3…</small></div>`;
}
function navButton(id, icon, label) {
  const adminLocked = id === 'admin' && !state.user?.admin;
  return `<button class="nav-item ${state.active === id ? 'active' : ''} ${adminLocked ? 'locked' : ''}" data-nav="${id}" ${adminLocked ? 'disabled' : ''}><span>${icon}</span><b>${label}</b></button>`;
}
function render() {
  document.getElementById('app').innerHTML = `
    <div class="skinova-app skinova-v1">
      <aside class="skinova-sidebar">
        <div class="skinova-brand" data-nav="home">
          <span class="skinova-emblem"><i></i></span>
          <div><strong>SKINOVA</strong><small>DISCORD ACTIVITY · V1.3</small></div>
        </div>
        <div class="skinova-user-mini">
          ${avatar(state.user,'small')}
          <div><strong>${esc(state.user.username)}</strong><small>${esc(progression().rank)} · Niveau ${progression().level}</small><span class="user-xp-mini"><i style="width:${progression().progress}%"></i></span></div>
          <i class="online-dot"></i>
        </div>
        <nav class="skinova-nav">
          <div class="nav-group-label">NAVIGATION</div>
          ${navButton('home','⌂','Accueil')}
          ${navButton('cases','▣','Caisses')}
          ${navButton('inventory','▦','Inventaire')}
          ${navButton('tradeup','⇧','Trade Up')}
          ${navButton('battles','⚔','Battles')}
          ${navButton('upgrade','↗','Améliorateur')}
          <div class="nav-group-label">COMMUNAUTÉ</div>
          ${navButton('history','◷','Historique')}
          ${navButton('leaderboard','♛','Classement')}
          ${navButton('admin','⌘','Skinova Control')}
        </nav>
        <button class="skinova-event-card" data-nav="cases">
          <span>ÉVÉNEMENT</span><strong>DROP HEAT</strong><b>CAISSES EN FEU</b><small>Découvrir la collection</small><i>→</i>
        </button>
        <button class="sidebar-fair" data-action="fair-center"><i>✓</i><div><strong>PROVABLY FAIR</strong><small>${esc(shortHash(state.fair?.serverHash))}</small></div></button>
        <div class="sidebar-status"><span><i></i> PLATEFORME OPÉRATIONNELLE</span><small>${state.presence.length || 1} joueur(s) actif(s)</small></div>
      </aside>
      <section class="skinova-workspace">
        <header class="skinova-topbar">
          <div class="skinova-breadcrumb"><span>◆</span><div><small>SKINOVA</small><strong id="screenTitle">${state.active==='home'?'Accueil':state.active}</strong></div></div>
          <div class="skinova-top-actions">
            <button class="top-fair" data-action="fair-center">✓ ÉQUITABLE & VÉRIFIÉ</button>
            <button class="daily-button" data-action="daily">BONUS DAILY</button>
            <div class="skinova-balance"><span>◆</span><b id="topBalance">${money(state.user.balance)}</b><small>CR</small></div>
            <button class="profile-button" data-action="profile-menu">${avatar(state.user,'small')}<span>${esc(state.user.username)}</span><i>⌄</i></button>
          </div>
        </header>
        <main class="skinova-main" id="mainStage"></main>
        <footer class="skinova-statusbar"><span><i></i> ${state.presence.length || 1} MEMBRE(S) EN LIGNE</span><b>ÉVÉNEMENT · DROP HEAT ACTIF</b><span>SKINOVA V1.3 · CRÉDITS FICTIFS</span></footer>
      </section>
      <nav class="skinova-mobile-nav">
        ${navButton('home','⌂','Accueil')}${navButton('cases','▣','Caisses')}${navButton('inventory','▦','Inventaire')}${navButton('tradeup','⇧','Trade Up')}${navButton('battles','⚔','Battles')}${navButton('upgrade','↗','Upgrade')}
      </nav>
    </div>
    <div id="modalRoot"></div><div id="toastRoot"></div>`;
  renderMain();
  renderPresence();
}
function renderPresence() {
  const title = document.getElementById('screenTitle');
  if (title) {
    const labels={home:'Accueil',cases:'Caisses',inventory:'Inventaire',tradeup:'Trade Up',battles:'Case Battles',upgrade:'Améliorateur',history:'Historique',leaderboard:'Classement',admin:'Skinova Control'};
    title.textContent=labels[state.active]||'Skinova';
  }
}
function renderMain() {
  const root = document.getElementById('mainStage');
  if (!root) return;
  const views = { home: renderHome, cases: renderCases, inventory: renderInventory, tradeup: renderTradeUp, battles: renderBattles, upgrade: renderUpgrade, history: renderHistory, leaderboard: renderLeaderboard, admin: renderAdmin };
  root.innerHTML = (views[state.active] || renderHome)();
  root.scrollTop = 0;
  renderPresence();
}
function renderHome() {
  const featured = state.cases.find((c) => c.id === 'ak-legends') || state.cases[0];
  const reel = featured?.items?.slice().sort((a,b)=>Number(b.value)-Number(a.value)).slice(0,5) || [];
  const recent = state.history.flatMap((entry)=>entry.items || []).slice(0,4);
  const fallbackRecent = state.cases.flatMap((c)=>c.items).slice(0,4);
  const latest = recent.length ? recent : fallbackRecent;
  const best = state.cases.flatMap((c)=>c.items).slice().sort((a,b)=>Number(b.value)-Number(a.value)).slice(0,3);
  const openingCount = state.user.stats.opens || 0;
  return `<section class="skinova-home">
    <div class="skinova-hero">
      <div class="hero-embers"></div>
      <div class="hero-content">
        <span class="hero-label">PLATEFORME DE CASE OPENING SUR DISCORD</span>
        <h1>SKI<span>NOVA</span></h1>
        <h2>OUVRE. GAGNE. <em>DOMINE.</em></h2>
        <p>Caisses exclusives, skins rares, battles multijoueurs et tirages vérifiables — réunis dans une seule Activity.</p>
        <div class="hero-features"><span><i>▣</i><b>CAISSES EXCLUSIVES</b></span><span><i>☆</i><b>SKINS RARES</b></span><span><i>♟</i><b>COMMUNAUTÉ ACTIVE</b></span></div>
        <div class="hero-actions"><button class="skinova-primary" data-open-case="${featured?.id || ''}">OUVRIR LA CAISSE VEDETTE</button><button class="skinova-secondary" data-nav="battles">VOIR LES BATTLES</button></div>
      </div>
      <div class="hero-case"><div class="hero-ring"></div><img src="${featured?.image || ''}" alt="${esc(featured?.name || '')}"><span>DROP VEDETTE</span><b>${money(featured?.price || 0)} CR</b></div>
    </div>
    <div class="skinova-dashboard">
      <article class="featured-case-panel">
        <header><div><span>🔥 CAISSE EXCLUSIVE</span><h3>${esc(featured?.name || '')}</h3></div><small>${featured?.items?.length || 0} GAINS</small></header>
        <div class="featured-case-art"><img src="${featured?.image || ''}" alt=""><div class="case-aura"></div></div>
        <div class="featured-price"><span>PRIX</span><b>◆ ${money(featured?.price || 0)} CR</b></div>
        <button class="skinova-primary wide" data-open-case="${featured?.id || ''}">OUVRIR LA CAISSE <i>→</i></button>
        <button class="probability-link" data-open-case="${featured?.id || ''}">✓ Voir les probabilités et les gains</button>
      </article>
      <article class="opening-showcase">
        <header><span></span><h3>OUVERTURE EN COURS</h3><span></span></header>
        <div class="showcase-reel"><i class="showcase-pointer top"></i>${reel.map((it,index)=>`<div class="showcase-item ${index===2?'focus':''}" style="--rarity:${rarityColor[it.rarity]||'#ff5a18'}"><img src="${it.image}" alt=""><small>${esc(it.name)}</small></div>`).join('')}<i class="showcase-pointer bottom"></i></div>
        <div class="showcase-steps"><span class="done"><b>1</b><small>LANCEMENT</small></span><i></i><span class="active"><b>2</b><small>ROULEMENT</small></span><i></i><span><b>3</b><small>RÉSULTAT</small></span></div>
        <div class="showcase-stats"><span><small>TES OUVERTURES</small><b>${openingCount}</b></span><span><small>WIN BATTLES</small><b>${state.user.stats.battleWins || 0}</b></span><span><small>OBJETS</small><b>${state.inventory.length}</b></span></div>
      </article>
      <aside class="home-right-rail">
        <section><header><span>🔥</span><h3>DERNIERS DROPS</h3></header>${latest.map((it,index)=>`<div class="feed-item"><img src="${it.image}" alt=""><div><strong>${esc(it.weapon || '')} | ${esc(it.name || '')}</strong><small>${index===0?'à l’instant':`il y a ${index+2} min`}</small></div><b>◆ ${money(it.value)}</b></div>`).join('')}</section>
        <section><header><span>🏆</span><h3>MEILLEURS GAINS</h3></header>${best.map((it,index)=>`<div class="top-gain"><i>${index+1}</i><img src="${it.image}" alt=""><div><strong>${esc(it.weapon)} | ${esc(it.name)}</strong><small>${esc(it.rarity.toUpperCase())}</small></div><b>◆ ${money(it.value)}</b></div>`).join('')}</section>
      </aside>
    </div>
    <div class="skinova-trustbar"><span><i>✓</i><div><strong>PAIEMENTS FICTIFS</strong><small>Aucune monnaie réelle</small></div></span><span><i>⚡</i><div><strong>ANIMATIONS LIVE</strong><small>Ouvertures et battles</small></div></span><span><i>◇</i><div><strong>ÉQUITABLE & VÉRIFIÉ</strong><small>Système provably fair</small></div></span><span><i>♛</i><div><strong>NIVEAU ${progression().level} · ${esc(progression().rank)}</strong><small>${progression().xpForNext ? `${progression().xpIntoLevel}/${progression().xpForNext} XP` : 'Niveau maximum'}</small></div></span></div>
  </section>`;
}
function renderCases() {
  return `<section class="skinova-page cases-page">
    <div class="skinova-page-head"><div><span>COLLECTION SKINOVA</span><h1>Choisis ta caisse</h1><p>Chaque caisse possède son propre univers, ses probabilités et son jackpot.</p></div><div class="page-head-actions"><button class="skinova-secondary active">TOUTES</button><button class="skinova-secondary">ARMES</button><button class="skinova-secondary">PREMIUM</button></div></div>
    <div class="case-grid skinova-case-grid">${state.cases.map(caseCard).join('')}</div>
  </section>`;
}

function caseCard(c) {
  const jackpot = Math.max(...c.items.map((i) => Number(i.value)));
  const roiHint = c.price >= 250 ? 'PREMIUM' : c.price >= 100 ? 'POPULAIRE' : 'STARTER';
  return `<article class="case-card skinova-case-card" style="--accent:${c.accent}">
    <div class="case-flames"></div><div class="case-art"><img src="${c.image}" alt="${esc(c.name)}"><span class="case-live"><i></i>${c.active ? 'ACTIF' : 'MASQUÉ'}</span><span class="case-tier">${roiHint}</span></div>
    <div class="case-info"><small>${esc(c.tag)}</small><h3>${esc(c.name)}</h3><div class="case-meta"><span>${c.items.length} GAINS</span><span>JACKPOT ◆ ${money(jackpot)}</span></div><div class="case-price"><span>PRIX</span><b>◆ ${money(c.price)} CR</b></div><button data-open-case="${c.id}">OUVRIR LA CAISSE <i>→</i></button></div>
  </article>`;
}

function renderInventory() {
  const total = state.inventory.reduce((sum, item) => sum + Number(item.value), 0);
  return `<section class="view inventory-view-v11"><div class="page-head"><div><span class="eyebrow">LOCKER</span><h1>Ton inventaire</h1><p>Clique sur une arme pour la vendre, l’améliorer ou l’ajouter à un Trade Up.</p><button class="skinova-secondary inventory-tradeup-shortcut" data-nav="tradeup">⇧ Ouvrir le Trade Up</button></div><div class="summary-card"><small>VALEUR TOTALE</small><strong>${money(total)} CR</strong><button data-action="sell-all" ${state.inventory.length ? '' : 'disabled'}>Tout revendre à 100 %</button></div></div>
    ${state.inventory.length ? `<div class="inventory-grid-v11">${state.inventory.map(inventoryTile).join('')}</div>` : empty('▦','Inventaire vide','Ouvre une caisse ou gagne une battle pour récupérer des objets.')}
  </section>`;
}
function inventoryTile(item) {
  const title = `${item.stattrak ? 'StatTrak™ ' : ''}${item.weapon} · ${item.name}`;
  return `<button class="inventory-tile-v11" data-item-menu="${esc(item.uid)}" style="--rarity:${rarityColor[item.rarity] || '#999'}"><span class="inventory-rarity-v11">${esc(item.rarity.toUpperCase())}</span><span class="inventory-art-v11"><img src="${item.image}" alt="${esc(title)}"></span><strong>${esc(title)}</strong><small>${esc(item.condition || '')}${item.stattrak ? ' · ST™' : ''} · ${money(item.value)} CR</small></button>`;
}
function itemCard(item, compact = false) {
  const title = `${item.stattrak ? 'StatTrak™ ' : ''}${item.weapon} · ${item.name}`;
  return `<article class="item-card ${compact ? 'compact' : ''}" style="--rarity:${rarityColor[item.rarity] || '#999'}"><div class="item-image"><img src="${item.image}" alt="${esc(title)}"><i></i></div><small>${esc(item.rarity.toUpperCase())}</small><strong>${esc(title)}</strong><div class="badges"><span>${esc(item.condition)}</span>${item.stattrak ? '<span class="st">ST™</span>' : ''}</div><footer><b>${money(item.value)} CR</b>${compact ? '' : `<button data-sell="${item.uid}">Vendre</button>`}</footer></article>`;
}
function inventoryItemModal(item) {
  if (!item) return;
  const title = `${item.stattrak ? 'StatTrak™ ' : ''}${item.weapon} · ${item.name}`;
  modal(`<div class="inventory-item-modal-v11" style="--rarity:${rarityColor[item.rarity] || '#999'}"><button class="modal-close" data-close-modal>×</button><span class="eyebrow">${esc(item.rarity.toUpperCase())}</span><div class="inventory-modal-art-v11"><img src="${item.image}" alt="${esc(title)}"></div><h2>${esc(title)}</h2><div class="inventory-modal-meta-v11"><span>${esc(item.condition || '')}</span>${item.stattrak ? '<span>StatTrak™</span>' : ''}<b>${money(item.value)} CR</b></div><div class="inventory-modal-actions-v11">${item.rarity!=='gold'?`<button class="ghost" data-action="inventory-tradeup" data-item-uid="${esc(item.uid)}">Trade Up</button>`:'<button class="ghost" disabled>Trade Up indisponible</button>'}<button class="ghost" data-action="inventory-upgrade" data-item-uid="${esc(item.uid)}">Améliorer</button><button class="cta" data-action="inventory-sell" data-item-uid="${esc(item.uid)}">Vendre à 100 %</button></div></div>`, 'inventory-item-wrap-v11');
}
function renderTradeUp() {
  state.tradeSelection = (state.tradeSelection || []).filter((uid) => state.inventory.some((item) => item.uid === uid));
  const selected = tradeSelectedItems();
  const anchor = selected[0] || null;
  const targetRarity = anchor ? nextRarity(anchor.rarity) : null;
  const totalValue = selected.reduce((sum,item)=>sum+Number(item.value||0),0);
  const candidates = targetRarity ? [...new Map(state.cases.flatMap((c)=>c.items || []).filter((item)=>item.rarity===targetRarity && (!anchor?.stattrak || Number(item.stattrak)>0) && !(anchor?.stattrak && String(item.weapon).toLowerCase().includes('glove'))).map((item)=>[item.id,item])).values()] : [];
  const chance = candidates.length ? 100/candidates.length : 0;
  const eligible = state.inventory.filter((item)=>item.rarity!=='gold');
  return `<section class="view tradeup-view"><div class="page-head"><div><span class="eyebrow">CONTRAT SKINOVA</span><h1>Trade Up</h1><p>Sacrifie exactement 10 objets de même rareté et même statut StatTrak pour obtenir un objet de la rareté supérieure.</p></div><button class="v7-status-pill" data-action="fair-center"><i></i> TIRAGE VÉRIFIABLE</button></div>
    <div class="tradeup-layout">
      <section class="tradeup-builder"><div class="tradeup-builder-head"><div><small>SÉLECTION</small><h2>${selected.length} / 10 objets</h2></div><button class="skinova-secondary" data-action="tradeup-clear" ${selected.length?'':'disabled'}>Vider</button></div>
        <div class="tradeup-contract-slots">${Array.from({length:10},(_,index)=>{const item=selected[index];return item?`<button class="tradeup-slot filled" data-trade-select="${item.uid}" style="--rarity:${rarityColor[item.rarity]}"><img src="${item.image}" alt=""><span>${esc(item.name)}</span><i>×</i></button>`:`<span class="tradeup-slot empty"><b>${index+1}</b><small>OBJET</small></span>`;}).join('')}</div>
        <div class="tradeup-summary"><span><small>RARETÉ SOURCE</small><b>${anchor?esc(rarityLabel[anchor.rarity]):'—'}</b></span><i>→</i><span><small>GAIN POSSIBLE</small><b>${targetRarity?esc(rarityLabel[targetRarity]):'—'}</b></span><span><small>VALEUR SACRIFIÉE</small><b>${money(totalValue)} CR</b></span><span><small>TYPE</small><b>${anchor?.stattrak?'StatTrak™':'Standard'}</b></span></div>
        <button class="skinova-primary wide tradeup-submit" data-action="tradeup-submit" ${selected.length===10?'':'disabled'}>SIGNER LE CONTRAT · 10 / 10</button>
      </section>
      <aside class="tradeup-outcomes"><div class="panel-head"><div><small>RÉSULTATS POSSIBLES</small><h2>${candidates.length || 0} skins</h2></div><b>${chance?chance.toFixed(2):'0.00'} % chacun</b></div><div class="tradeup-outcome-grid">${candidates.slice(0,18).map((item)=>`<article style="--rarity:${rarityColor[item.rarity]}"><img src="${item.image}" alt=""><div><strong>${esc(item.weapon)} · ${esc(item.name)}</strong><small>${money(item.value)} CR · ${chance.toFixed(2)}%</small></div></article>`).join('') || '<p class="muted">Sélectionne un premier objet pour voir les résultats possibles.</p>'}</div></aside>
    </div>
    <div class="section-heading"><div><span class="eyebrow">TON INVENTAIRE</span><h2>Objets compatibles</h2></div><small class="tradeup-rule">Les objets Gold ne peuvent pas être améliorés.</small></div>
    ${eligible.length?`<div class="tradeup-inventory">${eligible.map((item)=>{const active=state.tradeSelection.includes(item.uid),compatible=tradeCompatible(item,selected);return `<button class="tradeup-inventory-item ${active?'selected':''} ${compatible?'':'incompatible'}" data-trade-select="${item.uid}" ${compatible||active?'':'disabled'} style="--rarity:${rarityColor[item.rarity]}"><span><img src="${item.image}" alt=""></span><strong>${esc(item.weapon)} · ${esc(item.name)}</strong><small>${esc(item.condition)}${item.stattrak?' · ST™':''}</small><b>${money(item.value)} CR</b></button>`;}).join('')}</div>`:empty('⇧','Aucun objet compatible','Ouvre des caisses pour obtenir des objets utilisables dans un Trade Up.')}
  </section>`;
}
function showTradeUpResult(result) {
  state.lastProofs = result.proof ? [result.proof] : [];
  const item=result.result;
  modal(`<div class="tradeup-result-modal" style="--rarity:${rarityColor[item.rarity]||'#ff9a1f'}"><button class="modal-close" data-close-modal>×</button><span class="eyebrow">CONTRAT TERMINÉ</span><h2>${result.profit>=0?'TRADE UP POSITIF':'NOUVEAU SKIN OBTENU'}</h2><div class="tradeup-result-art"><i></i><img src="${item.image}" alt=""></div><strong>${esc(item.stattrak?'StatTrak™ ':'')}${esc(item.weapon)} · ${esc(item.name)}</strong><div class="badges"><span>${esc(item.condition)}</span><span>${esc(rarityLabel[item.rarity]||item.rarity)}</span></div><div class="tradeup-result-values"><span><small>SACRIFIÉ</small><b>${money(result.sourceValue)} CR</b></span><span><small>GAIN</small><b>${money(item.value)} CR</b></span><span><small>RÉSULTAT</small><b class="${result.profit>=0?'good':'bad'}">${result.profit>=0?'+':''}${money(result.profit)} CR</b></span></div><p>+${result.xp?.gained||0} XP · Niveau ${result.progression?.level||state.user.level}</p><div class="reveal-actions"><button class="ghost" data-action="verify-last-proof" data-proof-index="0">Vérifier le tirage</button><button class="cta" data-close-modal>Continuer</button></div></div>`, 'tradeup-result-wrap');
}
function renderBattles() {
  const open = state.battles.filter((b) => b.status === 'waiting');
  const recent = state.battles.filter((b) => b.status === 'finished').slice(0, 8);
  return `<section class="view"><div class="page-head"><div><span class="eyebrow">MULTIPLAYER ARENA</span><h1>Case Battles</h1><p>Jusqu’à quatre membres du serveur, avec les gains visibles manche par manche.</p></div><button class="cta" data-action="new-battle">+ Créer une battle</button></div>
    <div class="battle-banner"><div><span>⚔</span><strong>Battles synchronisées</strong><small>Les autres membres voient les joueurs rejoindre la room en direct.</small></div><div class="live-wave"><i></i><i></i><i></i><i></i><i></i></div></div>
    <div class="section-heading"><div><span class="eyebrow">LOBBIES</span><h2>Battles ouvertes</h2></div></div>
    <div class="battle-list">${open.length ? open.map(battleRow).join('') : empty('⚔','Aucune battle ouverte','Crée la première battle du salon.')}</div>
    <div class="section-heading small-gap"><div><span class="eyebrow">REPLAYS</span><h2>Derniers combats</h2></div></div>
    <div class="replay-grid">${recent.length ? recent.map(replayCard).join('') : '<p class="muted">Aucun replay pour le moment.</p>'}</div>
  </section>`;
}
function battleRow(b) {
  const c = state.cases.find((entry) => entry.id === b.caseId);
  return `<article class="battle-row"><img src="${c?.image || ''}" alt=""><div class="battle-summary"><small>${b.rounds} MANCHES · ${b.slots} JOUEURS</small><strong>${esc(c?.name || b.caseId)}</strong><span>${money((c?.price || 0) * b.rounds)} CR / joueur</span></div><div class="battle-players">${Array.from({length:b.slots},(_,i)=> b.players[i] ? avatar(b.players[i],'tiny') : '<span class="avatar tiny empty">+</span>').join('')}</div><div class="battle-actions">${b.players.some((p)=>p.id===state.user.id) ? '<span class="joined">REJOINT</span>' : `<button data-join-battle="${b.id}">Rejoindre</button>`}<button class="danger" data-start-battle="${b.id}" ${b.ownerId===state.user.id || state.user.admin ? '' : 'disabled'}>Lancer</button></div></article>`;
}
function replayCard(b) {
  const c = state.cases.find((entry) => entry.id === b.caseId);
  const winners = b.result?.winnerIds || [];
  return `<article class="replay-card"><div class="replay-top"><img src="${c?.image || ''}" alt=""><div><small>${b.rounds} MANCHES</small><strong>${esc(c?.name || b.caseId)}</strong></div></div><div class="replay-users">${b.players.map((p)=>`<span class="${winners.includes(p.id)?'winner':''}">${avatar(p,'tiny')}<b>${esc(p.username)}</b><em>${money(b.result?.totals?.[p.id] || 0)}</em></span>`).join('')}</div><button data-watch-battle="${b.id}">Voir le résultat</button></article>`;
}
function renderUpgrade() {
  const options = state.inventory.map((item) => `<option value="${item.uid}">${esc(item.weapon)} · ${esc(item.name)} (${item.condition}) — ${money(item.value)} CR</option>`).join('');
  return `<section class="view upgrade-view-v7"><div class="page-head"><div><span class="eyebrow">UPGRADE LAB</span><h1>Upgrade</h1><p>La zone reste fixe. Seul le cran accélère, ralentit et décide du résultat.</p></div><button class="v7-status-pill" data-action="fair-center"><i></i> PROVABLY FAIR VÉRIFIABLE</button></div>
    <div class="upgrade-layout v7-upgrade-layout">
      <div class="upgrade-control v7-upgrade-control">
        <div class="control-head"><span>01</span><div><strong>Configure ton risque</strong><small>Plus le multiplicateur monte, plus la zone WIN diminue.</small></div></div>
        <label>Objet sacrifié<select id="upgradeItem">${options || '<option>Aucun objet disponible</option>'}</select></label>
        <label>Multiplicateur<select id="upgradeMultiplier"><option value="1.5">x1.5</option><option value="2" selected>x2</option><option value="3">x3</option><option value="5">x5</option><option value="10">x10</option></select></label>
        <div class="chance-preview"><div><span>CHANCE ESTIMÉE</span><strong id="chanceValue">47.5%</strong></div><div class="chance-track"><i style="width:47.5%"></i></div><small>La zone orange représente le résultat gagnant.</small></div>
        <button class="cta wide" data-action="start-upgrade" ${state.inventory.length ? '' : 'disabled'}>Lancer l’upgrade</button>
      </div>
      <div class="upgrade-wheel-shell v7-dial-shell">
        <div class="dial-head"><span>02</span><div><strong>Lecture du résultat</strong><small>Le cadran ne bouge jamais. Le cran blanc est le seul élément animé.</small></div></div>
        <div class="upgrade-dial-preview" style="background:conic-gradient(from 0deg,#ff9a1f 0deg 171deg,#303844 171deg 360deg)">
          <div class="dial-scale"></div><div class="dial-zone-label win">WIN 47.5%</div><div class="dial-zone-label lose">LOSE 52.5%</div>
          <div class="dial-needle preview"><i></i></div><div class="dial-hub"><span>SV</span><small>V1</small></div>
        </div>
        <div class="dial-legend"><span><i class="win-dot"></i> Zone gagnante</span><span><i class="lose-dot"></i> Zone perdante</span></div>
      </div>
    </div>
  </section>`;
}
function renderHistory() {
  const wins = state.history.filter((e) => e.outcome === 'win').length;
  const losses = state.history.filter((e) => e.outcome === 'lose').length;
  const profit = state.history.reduce((sum,e)=>sum+Number(e.profit || 0),0);
  return `<section class="view"><div class="page-head"><div><span class="eyebrow">ACTIVITY LOG</span><h1>Historique & statistiques</h1><p>Toutes tes ouvertures, battles, reventes, upgrades et Trade Ups.</p></div></div><div class="metrics-grid"><div><small>RÉSULTAT NET</small><strong class="${profit>=0?'good':'bad'}">${profit>=0?'+':''}${money(profit)} CR</strong></div><div><small>WIN / LOSE</small><strong>${wins} / ${losses}</strong></div><div><small>BATTLES</small><strong>${state.user.stats.battleWins || 0}/${state.user.stats.battles || 0}</strong></div><div><small>UPGRADES</small><strong>${state.user.stats.upgradeWins || 0}/${state.user.stats.upgrades || 0}</strong></div></div>
    <div class="timeline">${state.history.length ? state.history.map(historyRow).join('') : empty('◷','Aucun historique','Tes prochaines actions apparaîtront ici.')}</div></section>`;
}
function historyRow(e) {
  const items = (e.items || []).slice(0, 10);
  return `<article class="history-row ${e.outcome || ''}"><div class="history-icon">${e.type==='battle'?'⚔':e.type==='upgrade'?'↗':e.type==='tradeup'?'⇧':e.type==='sell'?'↙':e.type==='level'?'★':'◇'}</div><div class="history-body"><div><strong>${esc(e.title)}</strong><small>${new Date(e.at).toLocaleString('fr-FR')}</small></div><p>${esc(e.detail || '')}</p>${items.length ? `<div class="history-items">${items.map((it)=>`<span style="--r:${rarityColor[it.rarity] || '#999'}"><img src="${it.image}" alt=""><b>${esc(it.name)}</b><small>${esc(it.condition || '')} · ${money(it.value)}</small></span>`).join('')}</div>` : ''}</div><div class="history-profit ${Number(e.profit)>=0?'good':'bad'}">${Number(e.profit)>=0?'+':''}${money(e.profit || 0)} CR</div></article>`;
}
function renderLeaderboard() {
  return `<section class="view"><div class="page-head"><div><span class="eyebrow">SERVER RANKING</span><h1>Classement</h1><p>Classement par XP, niveau et progression globale.</p></div></div><div class="podium">${state.leaderboard.slice(0,3).map((u,i)=>`<div class="podium-user place-${i+1}"><span class="rank">${i+1}</span>${avatar(u,'large')}<strong>${esc(u.username)}</strong><b>Niv. ${u.level} · ${esc(u.rank)}</b><small>${u.xp} XP</small></div>`).join('')}</div><div class="leader-list">${state.leaderboard.map((u,i)=>`<div class="leader-row"><span>${i+1}</span>${avatar(u,'tiny')}<strong>${esc(u.username)}</strong><em>${u.stats.battleWins || 0} battles gagnées</em><b>Niv. ${u.level} · ${esc(u.rank)}</b><small>${u.xp} XP</small></div>`).join('')}</div></section>`;
}
function renderAdmin() {
  if (!state.user.admin) return empty('⌘','Accès administrateur requis','Ajoute ton identifiant Discord dans ADMIN_USER_IDS puis relance l’Activity.');
  if (!state.admin) return `<section class="skinova-page"><div class="skinova-page-head"><div><span>SKINOVA CONTROL</span><h1>Panel administrateur</h1><p>Chargement des données centralisées…</p></div></div><div class="admin-loader"></div></section>`;
  const m = state.admin.metrics;
  return `<section class="skinova-admin">
    <header class="admin-hero"><div><span>SKINOVA CONTROL</span><h1>Panel administrateur</h1><p>Gestion complète des caisses, drops, joueurs, probabilités et réglages.</p></div><div class="admin-head-actions"><button class="skinova-secondary" data-action="fair-center">PROVABLY FAIR</button><button class="danger-button" data-action="admin-reset">RÉINITIALISER LA DÉMO</button></div></header>
    <div class="admin-kpis"><article><i>♟</i><div><small>JOUEURS</small><strong>${m.users}</strong></div></article><article><i>★</i><div><small>NIVEAU MOYEN</small><strong>${(state.admin.users.reduce((sum,u)=>sum+Number(u.level||1),0)/Math.max(1,state.admin.users.length)).toFixed(1)}</strong></div></article><article><i>▣</i><div><small>CAISSES ACTIVES</small><strong>${m.activeCases}</strong></div></article><article><i>◇</i><div><small>OBJETS</small><strong>${m.inventoryItems}</strong></div></article><article><i>⚔</i><div><small>BATTLES</small><strong>${m.battles}</strong></div></article><article><i>◆</i><div><small>CRÉDITS EN CIRCULATION</small><strong>${money(m.credits)}</strong></div></article></div>
    <div class="admin-main-grid">
      <section class="admin-panel cases-control"><div class="panel-head"><div><small>GESTION DES CAISSES</small><h2>Catalogue</h2></div><button class="skinova-primary" data-action="admin-new-case">+ NOUVELLE CAISSE</button></div><div class="admin-table-head"><span>APERÇU</span><span>NOM</span><span>PRIX</span><span>STATUT</span><span>DROPS</span><span>ACTIONS</span></div><div class="admin-case-list">${state.admin.cases.map(adminCaseRow).join('')}</div></section>
      <section class="admin-panel fair-admin-card"><div class="panel-head"><div><small>PROVABLY FAIR</small><h2>Engagement actuel</h2></div></div><div class="fair-admin-body"><label>SERVER SEED HASH<code>${esc(state.fair?.serverHash || '—')}</code></label><label>CLIENT SEED<code>${esc(state.fair?.clientSeed || '—')}</code></label><label>NONCE ACTUEL<code>${Number(state.fair?.nonce || 0)}</code></label><button class="skinova-primary wide" data-action="fair-center">VÉRIFIER LES TIRAGES</button></div></section>
    </div>
    <div class="admin-main-grid lower-admin">
      <section class="admin-panel users-control"><div class="panel-head"><div><small>GESTION DES UTILISATEURS</small><h2>Comptes Discord</h2></div></div><div class="admin-users">${state.admin.users.map(adminUserRow).join('')}</div></section>
      <section class="admin-panel settings-control"><div class="panel-head"><div><small>RÉGLAGES GLOBAUX</small><h2>Animations & bonus</h2></div></div><div class="settings-form"><label>Bonus daily<input id="adminDaily" type="number" value="${state.admin.settings.dailyGift}"></label><label>Ouverture (ms)<input id="adminOpening" type="number" value="${state.admin.settings.openingDurationMs}"></label><label>Upgrade (ms)<input id="adminUpgrade" type="number" value="${state.admin.settings.upgradeDurationMs}"></label><label>Battle / manche (ms)<input id="adminBattle" type="number" value="${state.admin.settings.battleRoundDurationMs || 5600}"></label><label>XP / caisse<input id="adminXpOpen" type="number" value="${state.admin.settings.xpOpen || 8}"></label><label>XP / battle<input id="adminXpBattle" type="number" value="${state.admin.settings.xpBattle || 70}"></label><label>Bonus XP victoire<input id="adminXpBattleWin" type="number" value="${state.admin.settings.xpBattleWinBonus || 35}"></label><label>XP / upgrade<input id="adminXpUpgrade" type="number" value="${state.admin.settings.xpUpgrade || 35}"></label><label>XP / Trade Up<input id="adminXpTradeUp" type="number" value="${state.admin.settings.xpTradeUp || 150}"></label><label>XP / daily<input id="adminXpDaily" type="number" value="${state.admin.settings.xpDaily || 25}"></label><button class="skinova-primary wide" data-action="admin-save-settings">ENREGISTRER</button></div></section>
    </div>
    <section class="admin-panel audit-control"><div class="panel-head"><div><small>JOURNAL D’AUDIT</small><h2>Dernières actions</h2></div></div><div class="audit-list">${state.admin.audit.slice(0,15).map((a)=>`<div><span>${esc(a.type)}</span><strong>${esc(a.detail)}</strong><small>${new Date(a.at).toLocaleString('fr-FR')}</small></div>`).join('')}</div></section>
  </section>`;
}
function adminCaseRow(c) {
  return `<div class="admin-case-row"><img src="${c.image}" alt=""><div class="admin-case-name"><strong>${esc(c.name)}</strong><small>${esc(c.tag || 'SKINOVA CASE')}</small></div><b>◆ ${money(c.price)}</b><span class="status-pill ${c.active?'active':'inactive'}">${c.active?'ACTIF':'INACTIF'}</span><span>${c.items.length} drops</span><div class="admin-row-actions"><button data-admin-toggle-case="${c.id}">${c.active ? 'Masquer' : 'Activer'}</button><button data-admin-edit-case="${c.id}">Gérer</button><button class="danger-mini" data-admin-delete-case="${c.id}">×</button></div></div>`;
}

function adminUserRow(u) {
  return `<div class="admin-user-row">${avatar(u,'tiny')}<div class="admin-user-name"><input value="${esc(u.username)}" data-admin-username="${u.id}"><small>${u.inventoryCount} objets · ${u.banned?'BANNI':u.admin?'ADMIN':'JOUEUR'}</small></div><label><small>SOLDE</small><input type="number" value="${u.balance}" data-admin-balance="${u.id}"></label><label><small>XP · NIV. ${u.level}</small><input type="number" value="${u.xp}" data-admin-xp="${u.id}"></label><label class="admin-role-check"><input type="checkbox" data-admin-role="${u.id}" ${u.admin?'checked':''}> Admin</label><button data-admin-save-user="${u.id}">Sauver</button><button class="${u.banned?'good-button':'danger-button'}" data-admin-ban="${u.id}">${u.banned?'Réactiver':'Bannir'}</button></div>`;
}
function empty(icon,title,text) { return `<div class="empty-state"><span>${icon}</span><h3>${title}</h3><p>${text}</p></div>`; }

function profileMenu() {
  const demoSwitch = state.config.demoMode ? `<div class="profile-menu-section"><small>PROFILS DE DÉMONSTRATION</small><button data-demo-user="demo-nova">NOVA · Joueur</button><button data-demo-user="demo-admin">AdminNova · Admin</button></div>` : '';
  modal(`<div class="profile-sheet"><button class="modal-close" data-close-modal>×</button>${avatar(state.user,'large')}<h2>${esc(state.user.username)}</h2><p>${money(state.user.balance)} crédits fictifs</p><div class="profile-level-card"><span><b>NIVEAU ${progression().level}</b><small>${esc(progression().rank)}</small></span><strong>${progression().xpForNext?`${progression().xpIntoLevel} / ${progression().xpForNext} XP`:'MAX'}</strong><i><b style="width:${progression().progress}%"></b></i></div><div class="profile-stats"><span><b>${state.user.stats.opens || 0}</b> ouvertures</span><span><b>${state.user.stats.battleWins || 0}</b> battles gagnées</span><span><b>${state.inventory.length}</b> objets</span><span><b>${state.user.stats.tradeUps || 0}</b> Trade Ups</span></div>${demoSwitch}<button class="ghost wide" data-close-modal>Fermer</button></div>`, 'profile-modal');
}
function caseModal(caseDef) {
  state.selectedCase = caseDef;
  state.quantity = 1;
  modal(`<div class="case-modal v7-case-modal" style="--accent:${caseDef.accent}"><button class="modal-close" data-close-modal>×</button><div class="case-modal-head"><img src="${caseDef.image}" alt=""><div><span>${esc(caseDef.tag)}</span><h2>${esc(caseDef.name)}</h2><p>${caseDef.items.length} gains · jackpot ${money(Math.max(...caseDef.items.map(i=>i.value)))} CR</p></div></div><div class="modal-section-label"><span>QUANTITÉ</span><small>Une roulette indépendante par caisse</small></div><div class="qty-buttons">${[1,3,5,10].map(q=>`<button class="${q===1?'active':''}" data-qty="${q}">x${q}</button>`).join('')}</div><div class="modal-section-label"><span>CONTENU DE LA CAISSE</span><small>Valeurs de base avant état et StatTrak</small></div><div class="case-contents">${caseDef.items.slice().sort((a,b)=>b.value-a.value).map((it)=>`<div style="--r:${rarityColor[it.rarity]}"><img src="${it.image}" alt=""><span>${esc(it.weapon)} · ${esc(it.name)}</span><b>${money(it.value)} CR</b></div>`).join('')}</div><button class="cta wide open-case-button" data-action="confirm-open">Ouvrir x1 · ${money(caseDef.price)} CR</button></div>`, 'case-modal-wrap');
}
function openingModal(caseDef, result) {
  state.lastProofs = result.proofs || [];
  const winnerIndex = 22;
  const rows = result.items.map((winner,index) => {
    const reel = Array.from({length:27},(_,i)=>i===winnerIndex?winner:caseDef.items[Math.floor(Math.random()*caseDef.items.length)]);
    return `<div class="reel-line" data-reel-line="${index}"><span class="reel-label">CAISSE ${index+1}</span><div class="reel-window"><div class="reel-pointer"></div><div class="reel-track">${reel.map((it)=>`<div class="reel-item" style="--r:${rarityColor[it.rarity] || '#999'}"><img src="${it.image}" alt=""><strong>${esc(it.name)}</strong><small>${money(it.value)} CR</small></div>`).join('')}</div></div><div class="line-result"></div></div>`;
  }).join('');
  modal(`<div class="opening-modal v7-opening-modal" style="--accent:${caseDef.accent}"><div class="opening-title"><span>DROP SESSION · x${result.items.length}</span><h2>${esc(caseDef.name)}</h2><p>Le pointeur peut s’arrêter n’importe où dans la carte gagnante.</p></div><div class="multi-reels">${rows}</div><div class="opening-summary hidden" id="openingSummary"><div><small>COÛT</small><b>${money(result.cost)} CR</b></div><div><small>VALEUR</small><b>${money(result.total)} CR</b></div><div><small>RÉSULTAT</small><b class="${result.profit>=0?'good':'bad'}">${result.profit>=0?'+':''}${money(result.profit)} CR</b></div><button class="ghost" data-action="verify-last-proof" data-proof-index="0">Vérifier</button><button class="cta" data-close-modal>Continuer</button></div></div>`, 'opening-wrap');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const lines = [...document.querySelectorAll('[data-reel-line]')];
    const duration = 5400;
    lines.forEach((line,index) => {
      const track = line.querySelector('.reel-track');
      const windowEl = line.querySelector('.reel-window');
      const card = track.children[winnerIndex];
      const visualRoll = Number(result.proofs?.[index]?.visualRoll ?? Math.random());
      const landingRatio = 0.02 + Math.max(0, Math.min(1, visualRoll)) * 0.96;
      const targetPoint = card.offsetLeft + card.offsetWidth * landingRatio;
      const distance = windowEl.clientWidth / 2 - targetPoint;
      track.style.transition = `transform ${duration + index*90}ms cubic-bezier(.055,.79,.055,1)`;
      track.style.transform = `translateX(${distance}px)`;
      setTimeout(() => {
        const item = result.items[index];
        const positive = item.value > caseDef.price;
        line.classList.add('revealed', positive ? 'positive' : 'negative');
        line.querySelector('.line-result').innerHTML = `<span>${positive?'WIN':'LOSE'}</span><strong>${esc(item.stattrak?'StatTrak™ ':'')}${esc(item.weapon)} · ${esc(item.name)} (${esc(item.condition)})</strong><b>${money(item.value)} CR</b><button data-action="verify-last-proof" data-proof-index="${index}" title="Vérifier la preuve">✓</button>`;
        line.querySelectorAll('button').forEach((button)=>button.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();handleClick(event);}));
      }, duration + index*90 + 80);
    });
    setTimeout(() => document.getElementById('openingSummary')?.classList.remove('hidden'), duration + lines.length*90 + 360);
  }));
}

function newBattleModal() {
  modal(`<div class="form-modal"><button class="modal-close" data-close-modal>×</button><span class="eyebrow">NEW LOBBY</span><h2>Créer une battle</h2><label>Caisse<select id="newBattleCase">${state.cases.map(c=>`<option value="${c.id}">${esc(c.name)} · ${money(c.price)} CR</option>`).join('')}</select></label><label>Manches<select id="newBattleRounds"><option value="1">1 manche</option><option value="3" selected>3 manches</option><option value="5">5 manches</option></select></label><label>Joueurs<select id="newBattleSlots"><option value="2">2 joueurs</option><option value="3">3 joueurs</option><option value="4" selected>4 joueurs</option></select></label><button class="cta wide" data-action="create-battle">Créer le lobby</button></div>`);
}
function battleResultModal(battle) {
  if (!battle.result) return;
  const c = state.cases.find(x=>x.id===battle.caseId);
  state.lastProofs = battle.result.rounds.flatMap((round)=>round.drops.map((drop)=>drop.proof).filter(Boolean));
  const players = battle.players.map((p)=>`<div class="battle-column" data-player="${p.id}"><div class="battle-user">${avatar(p,'small')}<strong>${esc(p.username)}</strong><b>0.00 CR</b></div><div class="battle-spin-window"><div class="battle-spin-track"></div><div class="battle-spin-pointer"></div></div><div class="battle-drops"></div></div>`).join('');
  modal(`<div class="battle-modal v71-battle-modal"><div class="battle-modal-head"><span>LIVE CASE BATTLE</span><h2>${esc(c?.name || battle.caseId)}</h2><p id="battleRoundLabel">Préparation · ${battle.rounds} manches · pot ${money(battle.result.pot)} CR</p></div><div class="battle-columns">${players}</div><div class="battle-final hidden" id="battleFinal"><strong>Battle terminée</strong><button class="ghost" data-action="verify-last-proof" data-proof-index="0">Vérifier un tirage</button><button class="cta" data-close-modal>Continuer</button></div></div>`, 'battle-modal-wrap');
  const totals = Object.fromEntries(battle.players.map(p=>[p.id,0]));
  const roundDuration = Math.max(3200, Number(battle.result.roundDurationMs) || 5600);
  const winnerIndex = 16;
  function runRound(roundIndex) {
    if (roundIndex >= battle.result.rounds.length) {
      battle.players.forEach((player)=>{
        const col=document.querySelector(`[data-player="${CSS.escape(player.id)}"]`);
        if(col && battle.result.winnerIds.includes(player.id)) col.classList.add('winner');
      });
      const label=document.getElementById('battleRoundLabel');
      if(label) label.textContent=`Terminé · pot ${money(battle.result.pot)} CR`;
      document.getElementById('battleFinal')?.classList.remove('hidden');
      return;
    }
    const round = battle.result.rounds[roundIndex];
    const label=document.getElementById('battleRoundLabel');
    if(label) label.textContent=`MANCHE ${roundIndex+1}/${battle.result.rounds.length} · ouverture en cours`;
    round.drops.forEach(({playerId,item,proof})=>{
      const col=document.querySelector(`[data-player="${CSS.escape(playerId)}"]`);
      if(!col)return;
      const track=col.querySelector('.battle-spin-track');
      const windowEl=col.querySelector('.battle-spin-window');
      const reel=Array.from({length:20},(_,i)=>i===winnerIndex?item:c.items[Math.floor(Math.random()*c.items.length)]);
      track.style.transition='none';
      track.style.transform='translateX(0)';
      track.innerHTML=reel.map((it)=>`<div class="battle-spin-item" style="--r:${rarityColor[it.rarity] || '#999'}"><img src="${it.image}" alt=""><small>${esc(it.name)}</small></div>`).join('');
      void track.offsetWidth;
      const card=track.children[winnerIndex];
      const landingRatio=.03+Math.max(0,Math.min(1,Number(proof?.visualRoll ?? Math.random())))*.94;
      const distance=windowEl.clientWidth/2-(card.offsetLeft+card.offsetWidth*landingRatio);
      track.style.transition=`transform ${roundDuration}ms cubic-bezier(.055,.8,.055,1)`;
      track.style.transform=`translateX(${distance}px)`;
    });
    setTimeout(()=>{
      round.drops.forEach(({playerId,item,proof})=>{
        totals[playerId]+=item.value;
        const col=document.querySelector(`[data-player="${CSS.escape(playerId)}"]`);
        if(!col)return;
        col.classList.add('round-reveal');
        col.querySelector('.battle-drops').insertAdjacentHTML('beforeend',`<div class="battle-drop" style="--r:${rarityColor[item.rarity]}"><img src="${item.image}" alt=""><div><strong>${esc(item.name)}</strong><small>${esc(item.condition)}${item.stattrak?' · ST™':''}</small></div><b>${money(item.value)}</b></div>`);
        col.querySelector('.battle-user b').textContent=`${money(totals[playerId])} CR`;
        setTimeout(()=>col.classList.remove('round-reveal'),500);
      });
      if(label) label.textContent=`MANCHE ${roundIndex+1}/${battle.result.rounds.length} · gains révélés`;
      setTimeout(()=>runRound(roundIndex+1),1100);
    },roundDuration+100);
  }
  setTimeout(()=>runRound(0),700);
}

function adminCaseModal(c = null) {
  const base = c || { name:'NOUVELLE CAISSE', price:50, accent:'#ff5a18', image:'/assets/cases/budget-frenzy.webp', tag:'SKINOVA ORIGINAL', active:true, items:[] };
  const drops = (base.items || []).map((item)=>`<div class="case-drop-editor-row" style="--r:${rarityColor[item.rarity]||'#999'}"><img src="${item.image}" alt=""><div><strong>${esc(item.weapon)} | ${esc(item.name)}</strong><small>${esc(item.rarity)} · ◆ ${money(item.value)} · poids ${item.weight}</small></div><button data-admin-drop-edit="${base.id || ''}" data-drop-id="${item.id}">Éditer</button><button class="danger-mini" data-admin-drop-delete="${base.id || ''}" data-drop-id="${item.id}">×</button></div>`).join('');
  modal(`<div class="form-modal admin-case-modal skinova-form-modal"><button class="modal-close" data-close-modal>×</button><span class="eyebrow">SKINOVA CASE BUILDER</span><h2>${c?'Modifier':'Créer'} une caisse</h2><div class="case-editor-layout"><div class="case-editor-fields"><label>Nom<input id="caseName" value="${esc(base.name)}"></label><div class="form-row"><label>Prix<input id="casePrice" type="number" value="${base.price}"></label><label>Couleur<input id="caseAccent" type="color" value="${esc(base.accent)}"></label></div><label>Tag<input id="caseTag" value="${esc(base.tag)}"></label><label>URL de l’image<input id="caseImage" value="${esc(base.image)}"></label><label class="check"><input id="caseActive" type="checkbox" ${base.active?'checked':''}> Caisse visible</label><button class="skinova-primary wide" data-admin-submit-case="${c?.id || ''}">ENREGISTRER LA CAISSE</button></div><div class="case-editor-preview"><img src="${base.image}" alt=""><strong>${esc(base.name)}</strong><b>◆ ${money(base.price)} CR</b></div></div>${c?`<div class="case-drops-editor"><div class="panel-head"><div><small>CONTENU DE LA CAISSE</small><h3>${base.items.length} drops configurés</h3></div><button class="skinova-secondary" data-admin-drop-add="${base.id}">+ AJOUTER UN DROP</button></div>${drops || '<p class="muted">Aucun drop.</p>'}</div>`:'<div class="drop-json-note">Enregistre d’abord la caisse, puis ouvre-la à nouveau pour gérer ses drops.</div>'}</div>`,'admin-case-wrap');
}
function adminDropModal(caseId, drop = null) {
  const base=drop || {id:'',weapon:'AK-47',name:'Nouveau skin',value:50,weight:10,rarity:'restricted',image:'/assets/weapons/ak.webp',wear:{FN:8,MW:18,FT:42,WW:20,BS:12},stattrak:10};
  modal(`<div class="form-modal skinova-form-modal drop-editor-modal"><button class="modal-close" data-close-modal>×</button><span class="eyebrow">DROP EDITOR</span><h2>${drop?'Modifier':'Ajouter'} un gain</h2><div class="drop-editor-grid"><label>Arme<input id="dropWeapon" value="${esc(base.weapon)}"></label><label>Nom du skin<input id="dropName" value="${esc(base.name)}"></label><label>Valeur<input id="dropValue" type="number" step="0.01" value="${base.value}"></label><label>Poids de drop<input id="dropWeight" type="number" step="0.001" value="${base.weight}"></label><label>Rareté<select id="dropRarity">${['consumer','industrial','mil-spec','restricted','classified','covert','gold'].map((r)=>`<option value="${r}" ${base.rarity===r?'selected':''}>${r}</option>`).join('')}</select></label><label>Image<input id="dropImage" value="${esc(base.image)}"></label></div><div class="wear-editor"><strong>TAUX D’USURE (%)</strong>${['FN','MW','FT','WW','BS'].map((w)=>`<label>${w}<input id="dropWear${w}" type="number" step="0.1" value="${Number(base.wear?.[w] || 0)}"></label>`).join('')}<label>StatTrak<input id="dropStatTrak" type="number" step="0.1" value="${Number(base.stattrak || 0)}"></label></div><button class="skinova-primary wide" data-admin-submit-drop="${caseId}" data-drop-id="${base.id || ''}">ENREGISTRER LE DROP</button></div>`,'drop-editor-wrap');
}


async function loadAdmin() {
  try { state.admin = await api('/admin/overview'); renderMain(); }
  catch (error) { toast(error.message,'bad'); }
}
async function refreshAll() {
  await Promise.all([reloadUser(), loadPublic()]);
  document.getElementById('topBalance').textContent = `${money(state.user.balance)} CR`;
  renderMain();
}

async function handleClick(event) {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    state.active = nav.dataset.nav;
    document.querySelectorAll('[data-nav]').forEach((el)=>el.classList.toggle('active',el.dataset.nav===state.active));
    renderMain();
    if (state.active === 'admin' && state.user.admin) loadAdmin();
    return;
  }
  if (event.target.matches('[data-close-modal]')) { closeModal(); return; }
  const open = event.target.closest('[data-open-case]');
  if (open) { const c=state.cases.find(x=>x.id===open.dataset.openCase); if(c) caseModal(c); return; }
  const qty = event.target.closest('[data-qty]');
  if (qty) {
    state.quantity=Number(qty.dataset.qty);
    document.querySelectorAll('[data-qty]').forEach((b)=>b.classList.toggle('active',b===qty));
    const button=document.querySelector('.open-case-button');
    button.textContent=`Ouvrir x${state.quantity} · ${money(state.selectedCase.price*state.quantity)} CR`;
    return;
  }
  const inventoryItem = event.target.closest('[data-item-menu]');
  if (inventoryItem) {
    const item = state.inventory.find((entry) => entry.uid === inventoryItem.dataset.itemMenu);
    inventoryItemModal(item);
    return;
  }
  const tradeSelect = event.target.closest('[data-trade-select]');
  if (tradeSelect) {
    const uid=tradeSelect.dataset.tradeSelect;
    const item=state.inventory.find((entry)=>entry.uid===uid);
    if(!item)return;
    const index=state.tradeSelection.indexOf(uid);
    if(index>=0)state.tradeSelection.splice(index,1);
    else {
      const selected=tradeSelectedItems();
      if(!tradeCompatible(item,selected)){toast('Même rareté et même type StatTrak requis','bad');return;}
      if(state.tradeSelection.length>=10){toast('Le contrat contient déjà 10 objets','bad');return;}
      state.tradeSelection.push(uid);
    }
    renderMain(); return;
  }
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'profile-menu') { profileMenu(); return; }
  if (action === 'fair-center') { await fairCenterModal(); return; }
  if (action === 'save-client-seed') {
    try { const value=document.getElementById('fairClientSeed')?.value || ''; await api('/fair/client-seed',{method:'PATCH',body:{clientSeed:value}}); toast('Client seed enregistré','good'); await reloadUser(); await fairCenterModal(); } catch(error){ toast(error.message,'bad'); }
    return;
  }
  if (action === 'verify-last-proof') { const index=Number(event.target.closest('[data-proof-index]')?.dataset.proofIndex || 0); await proofModal(state.lastProofs[index]); return; }
  if (action === 'verify-fair-history') { const index=Number(event.target.closest('[data-proof-index]')?.dataset.proofIndex || 0); await proofModal(state.fairData?.history?.[index]); return; }
  if (action === 'daily') {
    try { const r=await api('/daily',{method:'POST'}); toast(`+${r.amount} CR · +${r.xp?.gained||0} XP`,'good'); await refreshAll(); } catch(e){toast(e.message,'bad');} return;
  }
  if (action === 'confirm-open') {
    try { const c=state.selectedCase; const r=await api(`/cases/${c.id}/open`,{method:'POST',body:{quantity:state.quantity}}); openingModal(c,r); await reloadUser(); document.getElementById('topBalance').textContent=`${money(state.user.balance)} CR`; renderMain(); } catch(e){toast(e.message,'bad');} return;
  }
  if (action === 'sell-all') { try{await api('/inventory/sell-all',{method:'POST'});toast('Inventaire revendu sans frais','good');await refreshAll();}catch(e){toast(e.message,'bad');}return; }
  if (action === 'inventory-sell') {
    const uid = event.target.closest('[data-item-uid]')?.dataset.itemUid;
    if (!uid) return;
    try { await api(`/inventory/${uid}/sell`,{method:'POST'}); closeModal(); toast('Objet revendu à 100 %','good'); await refreshAll(); } catch(e) { toast(e.message,'bad'); }
    return;
  }

  if (action === 'inventory-tradeup') {
    const uid = event.target.closest('[data-item-uid]')?.dataset.itemUid;
    const item = state.inventory.find((entry)=>entry.uid===uid);
    if (!item || item.rarity === 'gold') { toast('Cet objet ne peut pas être utilisé en Trade Up','bad'); return; }
    state.tradeSelection = uid ? [uid] : [];
    closeModal(); state.active='tradeup';
    document.querySelectorAll('[data-nav]').forEach((el)=>el.classList.toggle('active',el.dataset.nav===state.active));
    renderMain(); return;
  }
  if (action === 'tradeup-clear') { state.tradeSelection=[]; renderMain(); return; }
  if (action === 'tradeup-submit') {
    if ((state.tradeSelection||[]).length !== 10) return;
    try { const result=await api('/trade-up',{method:'POST',body:{uids:state.tradeSelection}}); state.tradeSelection=[]; await reloadUser(); renderMain(); showTradeUpResult(result); toast(`Trade Up réussi · +${result.xp?.gained||0} XP`,'good'); } catch(error){ toast(error.message,'bad'); }
    return;
  }

  if (action === 'inventory-upgrade') {
    const uid = event.target.closest('[data-item-uid]')?.dataset.itemUid;
    closeModal();
    state.active = 'upgrade';
    document.querySelectorAll('[data-nav]').forEach((el)=>el.classList.toggle('active',el.dataset.nav===state.active));
    renderMain();
    const select = document.getElementById('upgradeItem');
    if (select && uid) select.value = uid;
    updateUpgradeDial(Number(document.getElementById('upgradeMultiplier')?.value || 2));
    return;
  }
  if (action === 'new-battle') { newBattleModal(); return; }
  if (action === 'create-battle') {
    try{const b=await api('/battles',{method:'POST',body:{caseId:document.getElementById('newBattleCase').value,rounds:Number(document.getElementById('newBattleRounds').value),slots:Number(document.getElementById('newBattleSlots').value)}});closeModal();toast('Battle créée','good');state.battles.unshift(b);renderMain();}catch(e){toast(e.message,'bad');}return;
  }
  if (action === 'start-upgrade') {
    const uid=document.getElementById('upgradeItem')?.value,multiplier=Number(document.getElementById('upgradeMultiplier')?.value||2);
    if(!uid)return;
    try{const r=await api('/upgrade',{method:'POST',body:{uid,multiplier}});showUpgradeResult(r,multiplier);await reloadUser();document.getElementById('topBalance').textContent=`${money(state.user.balance)} CR`;renderMain();}catch(e){toast(e.message,'bad');}return;
  }
  if (action === 'admin-new-case') { adminCaseModal(); return; }
  if (action === 'admin-save-settings') {
    try{await api('/admin/settings',{method:'PATCH',body:{dailyGift:Number(document.getElementById('adminDaily').value),openingDurationMs:Number(document.getElementById('adminOpening').value),upgradeDurationMs:Number(document.getElementById('adminUpgrade').value),battleRoundDurationMs:Number(document.getElementById('adminBattle').value),xpOpen:Number(document.getElementById('adminXpOpen').value),xpBattle:Number(document.getElementById('adminXpBattle').value),xpBattleWinBonus:Number(document.getElementById('adminXpBattleWin').value),xpUpgrade:Number(document.getElementById('adminXpUpgrade').value),xpTradeUp:Number(document.getElementById('adminXpTradeUp').value),xpDaily:Number(document.getElementById('adminXpDaily').value)}});toast('Réglages enregistrés','good');await loadAdmin();}catch(e){toast(e.message,'bad');}return;
  }
  if (action === 'admin-reset') {
    if(!confirm('Réinitialiser toutes les données de démonstration ?'))return;
    try{await api('/admin/reset',{method:'POST'});toast('Démo réinitialisée','good');await refreshAll();await loadAdmin();}catch(e){toast(e.message,'bad');}return;
  }
  const sell = event.target.closest('[data-sell]');
  if(sell){try{await api(`/inventory/${sell.dataset.sell}/sell`,{method:'POST'});toast('Objet revendu à 100 %','good');await refreshAll();}catch(e){toast(e.message,'bad');}return;}
  const join=event.target.closest('[data-join-battle]');
  if(join){try{await api(`/battles/${join.dataset.joinBattle}/join`,{method:'POST'});toast('Battle rejointe','good');await loadPublic();renderMain();}catch(e){toast(e.message,'bad');}return;}
  const start=event.target.closest('[data-start-battle]');
  if(start){try{const b=await api(`/battles/${start.dataset.startBattle}/start`,{method:'POST',body:{fillBots:true}});battleResultModal(b);await refreshAll();}catch(e){toast(e.message,'bad');}return;}
  const watch=event.target.closest('[data-watch-battle]');
  if(watch){const b=state.battles.find(x=>x.id===watch.dataset.watchBattle);if(b)battleResultModal(b);return;}
  const demo=event.target.closest('[data-demo-user]');
  if(demo){try{await api('/demo/switch',{method:'POST',body:{userId:demo.dataset.demoUser}});closeModal();await refreshAll();render();}catch(e){toast(e.message,'bad');}return;}
  const toggleCase=event.target.closest('[data-admin-toggle-case]');
  if(toggleCase){const c=state.admin.cases.find(x=>x.id===toggleCase.dataset.adminToggleCase);try{await api(`/admin/cases/${c.id}`,{method:'PUT',body:{...c,active:!c.active}});toast('Caisse mise à jour','good');await loadAdmin();await loadPublic();}catch(e){toast(e.message,'bad');}return;}
  const editCase=event.target.closest('[data-admin-edit-case]');
  if(editCase){adminCaseModal(state.admin.cases.find(x=>x.id===editCase.dataset.adminEditCase));return;}
  const submitCase=event.target.closest('[data-admin-submit-case]');
  if(submitCase){
    const id=submitCase.dataset.adminSubmitCase;
    const existing=id?state.admin.cases.find(x=>x.id===id):null;
    const body={...(existing||{}),name:document.getElementById('caseName').value,price:Number(document.getElementById('casePrice').value),accent:document.getElementById('caseAccent').value,tag:document.getElementById('caseTag').value,image:document.getElementById('caseImage').value,active:document.getElementById('caseActive').checked};
    if(!existing)body.items=state.cases[3]?.items || [];
    try{await api(id?`/admin/cases/${id}`:'/admin/cases',{method:id?'PUT':'POST',body});closeModal();toast('Caisse enregistrée','good');await loadAdmin();await loadPublic();renderMain();}catch(e){toast(e.message,'bad');}return;
  }
  const deleteCase=event.target.closest('[data-admin-delete-case]');
  if(deleteCase){const id=deleteCase.dataset.adminDeleteCase;if(!confirm('Supprimer définitivement cette caisse ?'))return;try{await api(`/admin/cases/${id}`,{method:'DELETE'});toast('Caisse supprimée','good');await loadAdmin();await loadPublic();renderMain();}catch(e){toast(e.message,'bad');}return;}
  const addDrop=event.target.closest('[data-admin-drop-add]');
  if(addDrop){adminDropModal(addDrop.dataset.adminDropAdd);return;}
  const editDrop=event.target.closest('[data-admin-drop-edit]');
  if(editDrop){const c=state.admin.cases.find(x=>x.id===editDrop.dataset.adminDropEdit);const drop=c?.items.find(x=>x.id===editDrop.dataset.dropId);if(c&&drop)adminDropModal(c.id,drop);return;}
  const deleteDrop=event.target.closest('[data-admin-drop-delete]');
  if(deleteDrop){const c=state.admin.cases.find(x=>x.id===deleteDrop.dataset.adminDropDelete);if(!c)return;if(!confirm('Supprimer ce drop de la caisse ?'))return;const body={...c,items:c.items.filter(x=>x.id!==deleteDrop.dataset.dropId)};try{await api(`/admin/cases/${c.id}`,{method:'PUT',body});toast('Drop supprimé','good');closeModal();await loadAdmin();await loadPublic();renderMain();}catch(e){toast(e.message,'bad');}return;}
  const submitDrop=event.target.closest('[data-admin-submit-drop]');
  if(submitDrop){const caseId=submitDrop.dataset.adminSubmitDrop;const c=state.admin.cases.find(x=>x.id===caseId);if(!c)return;const id=submitDrop.dataset.dropId || `drop-${Date.now().toString(36)}`;const item={id,weapon:document.getElementById('dropWeapon').value,name:document.getElementById('dropName').value,value:Number(document.getElementById('dropValue').value),weight:Number(document.getElementById('dropWeight').value),rarity:document.getElementById('dropRarity').value,image:document.getElementById('dropImage').value,wear:{FN:Number(document.getElementById('dropWearFN').value),MW:Number(document.getElementById('dropWearMW').value),FT:Number(document.getElementById('dropWearFT').value),WW:Number(document.getElementById('dropWearWW').value),BS:Number(document.getElementById('dropWearBS').value)},stattrak:Number(document.getElementById('dropStatTrak').value)};const items=c.items.some(x=>x.id===id)?c.items.map(x=>x.id===id?item:x):[...c.items,item];try{await api(`/admin/cases/${c.id}`,{method:'PUT',body:{...c,items}});toast('Drop enregistré','good');closeModal();await loadAdmin();await loadPublic();renderMain();}catch(e){toast(e.message,'bad');}return;}
  const saveUser=event.target.closest('[data-admin-save-user]');
  if(saveUser){const id=saveUser.dataset.adminSaveUser;const input=document.querySelector(`[data-admin-balance="${CSS.escape(id)}"]`);const username=document.querySelector(`[data-admin-username="${CSS.escape(id)}"]`);const xp=document.querySelector(`[data-admin-xp="${CSS.escape(id)}"]`);const role=document.querySelector(`[data-admin-role="${CSS.escape(id)}"]`);try{await api(`/admin/users/${id}`,{method:'PATCH',body:{balance:Number(input.value),xp:Number(xp?.value||0),username:username?.value||'',admin:!!role?.checked}});toast('Solde enregistré','good');await loadAdmin();}catch(e){toast(e.message,'bad');}return;}
  const ban=event.target.closest('[data-admin-ban]');
  if(ban){const u=state.admin.users.find(x=>x.id===ban.dataset.adminBan);try{await api(`/admin/users/${u.id}`,{method:'PATCH',body:{banned:!u.banned}});toast('Compte mis à jour','good');await loadAdmin();}catch(e){toast(e.message,'bad');}return;}
}
function showUpgradeResult(result,multiplier){
  const chance=Math.max(1,Math.min(90,Number(result.chance)||0));
  const chanceDeg=chance*3.6;
  const duration=10800;
  const landing=Math.max(0,Math.min(359.999999,Number(result.proof?.roll ?? (result.success?chance/200:(chance/100+(1-chance/100)/2)))*360));
  const finalRotation=15*360+landing;
  state.lastProofs = result.proof ? [result.proof] : [];
  modal(`<div class="upgrade-result-modal v7-upgrade-result" style="--duration:${duration}ms"><div class="result-topline"><span>UPGRADE x${multiplier}</span><b>${chance.toFixed(1)}% DE CHANCE</b></div><h2 id="upgradeStatus">Le cran est lancé</h2><p>Orange = WIN. Gris = LOSE. La position finale vient du tirage vérifiable.</p><div class="result-dial" style="background:${dialBackground(chance)}"><div class="dial-scale"></div><div class="dial-zone-label win">WIN ${chance.toFixed(1)}%</div><div class="dial-zone-label lose">LOSE ${(100-chance).toFixed(1)}%</div><div class="result-needle" id="resultNeedle"><i></i></div><div class="dial-hub"><span>SV</span><small>FAIR</small></div><div class="dial-scan"></div></div><div class="result-progress"><i></i></div><div class="upgrade-proof-mini">ROLL <b>${Number(result.proof?.roll || 0).toFixed(8)}</b> · ARRÊT <b>${landing.toFixed(2)}°</b></div><div class="upgrade-reveal hidden" id="upgradeReveal"></div></div>`,'upgrade-result-wrap');
  const needle=document.getElementById('resultNeedle');
  const status=document.getElementById('upgradeStatus');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    needle.style.transform=`rotate(${finalRotation}deg)`;
    document.querySelector('.v7-upgrade-result')?.classList.add('running');
  }));
  setTimeout(()=>{if(status)status.textContent='Dernier ralentissement…';},duration-2300);
  setTimeout(()=>{
    const root=document.getElementById('upgradeReveal');
    const modalRoot=document.querySelector('.v7-upgrade-result');
    if(!root)return;
    modalRoot?.classList.add(result.success?'is-win':'is-lose');
    if(status)status.textContent=result.success?'WIN · Le cran est dans l’orange':'LOSE · Le cran est dans le gris';
    root.classList.remove('hidden');
    root.classList.add(result.success?'good':'bad');
    root.innerHTML=result.success?`<strong>GAIN CONFIRMÉ</strong>${itemCard(result.result,true)}<div class="reveal-actions"><button class="ghost" data-action="verify-last-proof" data-proof-index="0">Vérifier le tirage</button><button class="cta" data-close-modal>Continuer</button></div>`:`<strong>UPGRADE MANQUÉ</strong><p>${esc(result.source.weapon)} · ${esc(result.source.name)}</p><div class="reveal-actions"><button class="ghost" data-action="verify-last-proof" data-proof-index="0">Vérifier le tirage</button><button class="cta" data-close-modal>Continuer</button></div>`;
    root.querySelectorAll('button').forEach((button)=>button.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();handleClick(event);}));
  },duration+180);
}


async function fairCenterModal(){
  try {
    state.fairData = await api('/fair');
    const rows=(state.fairData.history||[]).slice(0,12).map((proof,index)=>`<div class="fair-proof-row"><span>${proof.context?.startsWith('upgrade:')?'UPGRADE':proof.context?.startsWith('battle:')?'BATTLE':'OPEN'}</span><div><strong>#${proof.nonce} · ${esc(proof.context)}</strong><small>${shortHash(proof.digest)}</small></div><button data-action="verify-fair-history" data-proof-index="${index}">Vérifier</button></div>`).join('');
    modal(`<div class="form-modal fair-center-modal"><button class="modal-close" data-close-modal>×</button><span class="eyebrow">PROVABLY FAIR</span><h2>Centre de vérification</h2><p>Le hash du serveur est publié avant le prochain tirage. Le seed est révélé après le résultat et vérifiable localement en HMAC-SHA256.</p><div class="fair-commitment"><small>PROCHAIN SERVER HASH</small><code>${esc(state.fairData.serverHash)}</code><small>NONCE ${state.fairData.nonce}</small></div><label>Client seed<input id="fairClientSeed" value="${esc(state.fairData.clientSeed)}" maxlength="64"></label><button class="ghost wide" data-action="save-client-seed">Enregistrer le client seed</button><div class="fair-proof-list">${rows || '<small>Aucun tirage révélé pour le moment.</small>'}</div></div>`,'fair-center-wrap');
  } catch(error){toast(error.message,'bad');}
}
async function proofModal(proof){
  if(!proof){toast('Preuve introuvable','bad');return;}
  modal(`<div class="form-modal proof-modal"><button class="modal-close" data-close-modal>×</button><span class="eyebrow">VÉRIFICATION LOCALE</span><h2>Analyse de la preuve</h2><div class="proof-loading">Calcul HMAC-SHA256 en cours…</div></div>`,'proof-wrap');
  try{
    const verified=await verifyProof(proof);
    const root=document.querySelector('.proof-modal');
    if(!root)return;
    root.innerHTML=`<button class="modal-close" data-close-modal>×</button><span class="eyebrow">VÉRIFICATION LOCALE</span><h2 class="${verified.valid?'good':'bad'}">${verified.valid?'PREUVE VALIDE':'PREUVE INVALIDE'}</h2><div class="proof-checks">${verified.checks.map(([label,ok])=>`<div class="${ok?'ok':'fail'}"><span>${ok?'✓':'×'}</span><strong>${label}</strong></div>`).join('')}</div><div class="proof-fields"><label>Server seed révélé<code>${esc(proof.serverSeed)}</code></label><label>Hash engagé avant le tirage<code>${esc(proof.serverHash)}</code></label><label>Client seed / nonce<code>${esc(proof.clientSeed)} · ${proof.nonce}</code></label><label>Message HMAC<code>${esc(proof.message)}</code></label><label>Digest<code>${esc(proof.digest)}</code></label><label>Roll principal<code>${Number(verified.roll).toFixed(12)}</code></label><label>Prochain engagement<code>${esc(proof.nextServerHash || '')}</code></label></div><button class="cta wide" data-close-modal>Fermer</button>`;
    root.querySelectorAll('button').forEach((button)=>button.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();handleClick(event);}));
  }catch(error){toast(`Vérification impossible : ${error.message}`,'bad');}
}


document.addEventListener('click', handleClick);
document.addEventListener('change',(event)=>{
  if(event.target.id==='upgradeMultiplier') updateUpgradeDial(Number(event.target.value));
});
init();
