import './style.css';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { io } from 'socket.io-client';

const qs = new URLSearchParams(location.search);
const insideDiscord = qs.has('frame_id') || qs.has('instance_id');
const apiBase = insideDiscord ? '/.proxy/api' : '/api';
const socketPath = insideDiscord ? '/.proxy/socket.io' : '/socket.io';
const rarityColor = { consumer:'#9aa3b8', industrial:'#58a6ff', 'mil-spec':'#536dff', restricted:'#a95cff', classified:'#ff4fb2', covert:'#ff4b55', gold:'#ffc447' };

const state = {
  config: null,
  user: null,
  inventory: [],
  history: [],
  cases: [],
  battles: [],
  leaderboard: [],
  presence: [],
  active: qs.get('screen') || 'cases',
  selectedCase: null,
  quantity: 1,
  admin: null,
  socket: null,
  discord: null,
  loading: true,
};

function money(value) {
  return Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
}
function initials(name) {
  return String(name || 'DF').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
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
  root.innerHTML = `<div class="modal-backdrop" data-close-modal><div class="modal-card ${cls}">${html}</div></div>`;
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

async function initDiscord() {
  state.config = await api('/config');
  if (insideDiscord && state.config.clientId) {
    try {
      const sdk = new DiscordSDK(state.config.clientId);
      state.discord = sdk;
      await sdk.ready();
      const { code } = await sdk.commands.authorize({
        client_id: state.config.clientId,
        response_type: 'code',
        state: '',
        prompt: 'none',
        scope: ['identify', 'applications.commands'],
      });
      const token = await api('/token', { method: 'POST', body: { code } });
      await sdk.commands.authenticate({ access_token: token.access_token });
      await api('/session/discord', { method: 'POST', body: { access_token: token.access_token } });
    } catch (error) {
      console.warn('Discord SDK fallback:', error);
    }
  }
}

async function reloadUser() {
  const payload = await api('/me');
  state.user = payload.user;
  state.inventory = payload.inventory || [];
  state.history = payload.history || [];
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
    document.getElementById('app').innerHTML = `<div class="fatal"><div class="logo-mark">DF</div><h1>Connexion impossible</h1><p>${esc(error.message)}</p><button onclick="location.reload()">Réessayer</button></div>`;
  }
}
function connectSocket() {
  state.socket = io({ path: socketPath, transports: ['websocket', 'polling'] });
  const roomId = qs.get('instance_id') || qs.get('channel_id') || 'local-showroom';
  state.socket.on('connect', () => state.socket.emit('activity:join', { roomId, user: state.user }));
  state.socket.on('activity:presence', (members) => { state.presence = members || []; renderPresence(); });
  state.socket.on('battle:update', async () => { const p = await api('/battles'); state.battles = p.battles; if (state.active === 'battles') renderMain(); });
  state.socket.on('cases:update', async () => { const p = await api('/cases'); state.cases = p.cases; renderMain(); });
}
function renderLoading() {
  document.getElementById('app').innerHTML = `<div class="loading-screen"><div class="logo-mark pulse">DF</div><strong>DROP<span>FORGE</span></strong><small>Connexion à Discord Activity…</small></div>`;
}

function navButton(id, icon, label) {
  const adminLocked = id === 'admin' && !state.user?.admin;
  return `<button class="nav-item ${state.active === id ? 'active' : ''} ${adminLocked ? 'locked' : ''}" data-nav="${id}" ${adminLocked ? 'disabled' : ''}><span>${icon}</span><b>${label}</b></button>`;
}
function render() {
  document.getElementById('app').innerHTML = `
    <div class="discord-shell">
      <aside class="server-rail">
        <div class="discord-dot">◖◗</div>
        <div class="server-icon active">DF</div>
        <div class="server-icon">+</div>
      </aside>
      <div class="activity-shell">
        <header class="topbar">
          <div class="brand"><span class="logo-mark small">DF</span><strong>DROP<span>FORGE</span></strong><em>ACTIVITY</em></div>
          <div class="channel-pill"><i></i><span># dropforge-arena</span><small>${insideDiscord ? 'Dans Discord' : 'Mode aperçu local'}</small></div>
          <div class="top-actions">
            <button class="daily-button" data-action="daily">🎁 Daily</button>
            <div class="balance"><small>SOLDE</small><b id="topBalance">${money(state.user.balance)} CR</b></div>
            <button class="profile-button" data-action="profile-menu">${avatar(state.user, 'small')}<span>${esc(state.user.username)}</span></button>
          </div>
        </header>
        <div class="activity-body">
          <nav class="side-nav">
            <div class="nav-group-label">JOUER</div>
            ${navButton('cases','◇','Caisses')}
            ${navButton('inventory','▦','Inventaire')}
            ${navButton('battles','⚔','Battles')}
            ${navButton('upgrade','↗','Upgrade')}
            <div class="nav-group-label">COMMUNAUTÉ</div>
            ${navButton('history','◷','Historique')}
            ${navButton('leaderboard','♛','Classement')}
            ${navButton('admin','⌘','Admin')}
            <div class="fair-card"><span>PROVABLY FAIR</span><strong>Simulation locale</strong><small>Crédits fictifs uniquement</small></div>
          </nav>
          <main class="main-stage" id="mainStage"></main>
          <aside class="members-panel">
            <div class="members-head"><strong>JOUEURS</strong><span id="onlineCount">${state.presence.length || 1} EN LIGNE</span></div>
            <div id="presenceList"></div>
            <div class="bot-box"><span>🤖</span><div><strong>Bots de battle</strong><small>Complètent les parties de démonstration</small></div></div>
          </aside>
        </div>
        <nav class="mobile-nav">
          ${navButton('cases','◇','Caisses')}${navButton('inventory','▦','Inv.')}${navButton('battles','⚔','Battles')}${navButton('upgrade','↗','Upgrade')}${navButton('history','◷','Histo.')}
        </nav>
      </div>
    </div>
    <div id="modalRoot"></div><div id="toastRoot"></div>`;
  renderMain();
  renderPresence();
}
function renderPresence() {
  const root = document.getElementById('presenceList');
  if (!root) return;
  const members = state.presence.length ? state.presence : [state.user, ...state.leaderboard.slice(1, 5)];
  document.getElementById('onlineCount').textContent = `${members.length} EN LIGNE`;
  root.innerHTML = members.slice(0, 8).map((u) => `<div class="member-row">${avatar(u,'tiny')}<div><strong>${esc(u.username)}</strong><small>${u.id === state.user.id ? 'Dans cette Activity' : 'En ligne'}</small></div><i></i></div>`).join('');
}
function renderMain() {
  const root = document.getElementById('mainStage');
  if (!root) return;
  const views = { cases: renderCases, inventory: renderInventory, battles: renderBattles, upgrade: renderUpgrade, history: renderHistory, leaderboard: renderLeaderboard, admin: renderAdmin };
  root.innerHTML = (views[state.active] || renderCases)();
  root.scrollTop = 0;
}

function renderCases() {
  const featured = state.cases.find((c) => c.id === 'royal-overdrive') || state.cases[0];
  return `<section class="view cases-view">
    <div class="hero-card" style="--accent:${featured.accent}">
      <div class="hero-copy"><span class="eyebrow">DISCORD EXCLUSIVE EVENT</span><h1>Ouvre. Battle.<br><em>Domine le serveur.</em></h1><p>Une expérience multijoueur intégrée à Discord, avec caisses, inventaire et battles en temps réel.</p><div class="hero-actions"><button class="cta" data-open-case="${featured.id}">Ouvrir ${esc(featured.name)}</button><button class="ghost" data-nav="battles">Créer une battle</button></div><div class="hero-stats"><span><b>${state.cases.length}</b> caisses</span><span><b>${state.battles.filter((b)=>b.status==='waiting').length}</b> battles ouvertes</span><span><b>${state.presence.length || 1}</b> en ligne</span></div></div>
      <div class="hero-visual"><img src="${featured.image}" alt="${esc(featured.name)}"><div class="hero-glow"></div><div class="live-chip">● LIVE DROP</div></div>
    </div>
    <div class="section-heading"><div><span class="eyebrow">CASE ROOM</span><h2>Choisis ta caisse</h2></div><div class="filter-pills"><button class="active">Toutes</button><button>Weapon</button><button>Premium</button></div></div>
    <div class="case-grid">${state.cases.map(caseCard).join('')}</div>
  </section>`;
}
function caseCard(c) {
  const jackpot = Math.max(...c.items.map((i) => Number(i.value)));
  return `<article class="case-card" style="--accent:${c.accent}">
    <div class="case-art"><img src="${c.image}" alt="${esc(c.name)}"><span class="case-live">● ${c.active ? 'ACTIVE' : 'OFF'}</span></div>
    <div class="case-info"><small>${esc(c.tag)}</small><h3>${esc(c.name)}</h3><div class="case-meta"><span>${c.items.length} gains</span><span>Jackpot ${money(jackpot)} CR</span></div><button data-open-case="${c.id}"><span>Ouvrir</span><b>${money(c.price)} CR</b></button></div>
  </article>`;
}
function renderInventory() {
  const total = state.inventory.reduce((sum, item) => sum + Number(item.value), 0);
  return `<section class="view"><div class="page-head"><div><span class="eyebrow">LOCKER</span><h1>Ton inventaire</h1><p>Les objets sont liés à ton compte Discord.</p></div><div class="summary-card"><small>VALEUR TOTALE</small><strong>${money(total)} CR</strong><button data-action="sell-all" ${state.inventory.length ? '' : 'disabled'}>Tout revendre à 100 %</button></div></div>
    ${state.inventory.length ? `<div class="item-grid">${state.inventory.map(itemCard).join('')}</div>` : empty('▦','Inventaire vide','Ouvre une caisse ou gagne une battle pour récupérer des objets.')}
  </section>`;
}
function itemCard(item, compact = false) {
  const title = `${item.stattrak ? 'StatTrak™ ' : ''}${item.weapon} · ${item.name}`;
  return `<article class="item-card ${compact ? 'compact' : ''}" style="--rarity:${rarityColor[item.rarity] || '#999'}"><div class="item-image"><img src="${item.image}" alt="${esc(title)}"><i></i></div><small>${esc(item.rarity.toUpperCase())}</small><strong>${esc(title)}</strong><div class="badges"><span>${esc(item.condition)}</span>${item.stattrak ? '<span class="st">ST™</span>' : ''}</div><footer><b>${money(item.value)} CR</b>${compact ? '' : `<button data-sell="${item.uid}">Vendre</button>`}</footer></article>`;
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
  return `<section class="view"><div class="page-head"><div><span class="eyebrow">RISK ENGINE</span><h1>Upgrade</h1><p>Choisis un objet, un multiplicateur et regarde la roue accélérer.</p></div></div>
    <div class="upgrade-layout"><div class="upgrade-control"><label>Objet sacrifié<select id="upgradeItem">${options || '<option>Aucun objet disponible</option>'}</select></label><label>Multiplicateur<select id="upgradeMultiplier"><option value="1.5">x1.5</option><option value="2" selected>x2</option><option value="3">x3</option><option value="5">x5</option><option value="10">x10</option></select></label><div class="chance-preview"><span>CHANCE ESTIMÉE</span><strong id="chanceValue">47.5%</strong><div><i style="width:47.5%"></i></div></div><button class="cta wide" data-action="start-upgrade" ${state.inventory.length ? '' : 'disabled'}>Lancer l’upgrade</button></div>
    <div class="upgrade-wheel-shell"><div class="upgrade-wheel"><div class="wheel-win">WIN</div><div class="wheel-lose">LOSE</div><div class="wheel-center"><span>DF</span></div><div class="wheel-pointer"></div></div><div class="wheel-caption"><strong>Zone verte = gain</strong><small>La flèche fixe indique le résultat final.</small></div></div></div>
  </section>`;
}
function renderHistory() {
  const wins = state.history.filter((e) => e.outcome === 'win').length;
  const losses = state.history.filter((e) => e.outcome === 'lose').length;
  const profit = state.history.reduce((sum,e)=>sum+Number(e.profit || 0),0);
  return `<section class="view"><div class="page-head"><div><span class="eyebrow">ACTIVITY LOG</span><h1>Historique & statistiques</h1><p>Toutes tes ouvertures, battles, reventes et upgrades.</p></div></div><div class="metrics-grid"><div><small>RÉSULTAT NET</small><strong class="${profit>=0?'good':'bad'}">${profit>=0?'+':''}${money(profit)} CR</strong></div><div><small>WIN / LOSE</small><strong>${wins} / ${losses}</strong></div><div><small>BATTLES</small><strong>${state.user.stats.battleWins || 0}/${state.user.stats.battles || 0}</strong></div><div><small>UPGRADES</small><strong>${state.user.stats.upgradeWins || 0}/${state.user.stats.upgrades || 0}</strong></div></div>
    <div class="timeline">${state.history.length ? state.history.map(historyRow).join('') : empty('◷','Aucun historique','Tes prochaines actions apparaîtront ici.')}</div></section>`;
}
function historyRow(e) {
  const items = (e.items || []).slice(0, 10);
  return `<article class="history-row ${e.outcome || ''}"><div class="history-icon">${e.type==='battle'?'⚔':e.type==='upgrade'?'↗':e.type==='sell'?'↙':'◇'}</div><div class="history-body"><div><strong>${esc(e.title)}</strong><small>${new Date(e.at).toLocaleString('fr-FR')}</small></div><p>${esc(e.detail || '')}</p>${items.length ? `<div class="history-items">${items.map((it)=>`<span style="--r:${rarityColor[it.rarity] || '#999'}"><img src="${it.image}" alt=""><b>${esc(it.name)}</b><small>${esc(it.condition || '')} · ${money(it.value)}</small></span>`).join('')}</div>` : ''}</div><div class="history-profit ${Number(e.profit)>=0?'good':'bad'}">${Number(e.profit)>=0?'+':''}${money(e.profit || 0)} CR</div></article>`;
}
function renderLeaderboard() {
  return `<section class="view"><div class="page-head"><div><span class="eyebrow">SERVER RANKING</span><h1>Classement</h1><p>Les meilleurs soldes fictifs du serveur.</p></div></div><div class="podium">${state.leaderboard.slice(0,3).map((u,i)=>`<div class="podium-user place-${i+1}"><span class="rank">${i+1}</span>${avatar(u,'large')}<strong>${esc(u.username)}</strong><b>${money(u.balance)} CR</b></div>`).join('')}</div><div class="leader-list">${state.leaderboard.map((u,i)=>`<div class="leader-row"><span>${i+1}</span>${avatar(u,'tiny')}<strong>${esc(u.username)}</strong><em>${u.stats.battleWins || 0} battles gagnées</em><b>${money(u.balance)} CR</b></div>`).join('')}</div></section>`;
}
function renderAdmin() {
  if (!state.user.admin) return empty('⌘','Accès administrateur requis','Le panel est lié aux administrateurs configurés pour l’application Discord.');
  if (!state.admin) return `<section class="view"><div class="page-head"><div><span class="eyebrow">DROPForge CONTROL</span><h1>Panel administrateur</h1><p>Chargement des données centralisées…</p></div></div><div class="admin-loader"></div></section>`;
  const m = state.admin.metrics;
  return `<section class="view"><div class="page-head"><div><span class="eyebrow">DROPForge CONTROL</span><h1>Panel administrateur</h1><p>Gestion des caisses, joueurs, soldes, battles et journaux.</p></div><button class="danger-button" data-action="admin-reset">Réinitialiser la démo</button></div>
    <div class="metrics-grid admin-metrics"><div><small>UTILISATEURS</small><strong>${m.users}</strong></div><div><small>CAISSES ACTIVES</small><strong>${m.activeCases}</strong></div><div><small>OBJETS</small><strong>${m.inventoryItems}</strong></div><div><small>BATTLES</small><strong>${m.battles}</strong></div><div><small>CRÉDITS EN CIRCULATION</small><strong>${money(m.credits)}</strong></div></div>
    <div class="admin-grid"><div class="admin-panel"><div class="panel-head"><div><small>CASE BUILDER</small><h2>Caisses</h2></div><button data-action="admin-new-case">+ Nouvelle</button></div><div class="admin-case-list">${state.admin.cases.map(adminCaseRow).join('')}</div></div>
    <div class="admin-panel"><div class="panel-head"><div><small>ACCOUNT CONTROL</small><h2>Joueurs</h2></div></div><div class="admin-users">${state.admin.users.map(adminUserRow).join('')}</div></div></div>
    <div class="admin-grid lower"><div class="admin-panel"><div class="panel-head"><div><small>GAME SETTINGS</small><h2>Réglages</h2></div></div><div class="settings-form"><label>Bonus daily<input id="adminDaily" type="number" value="${state.admin.settings.dailyGift}"></label><label>Ouverture (ms)<input id="adminOpening" type="number" value="${state.admin.settings.openingDurationMs}"></label><label>Upgrade (ms)<input id="adminUpgrade" type="number" value="${state.admin.settings.upgradeDurationMs}"></label><button data-action="admin-save-settings">Enregistrer</button></div></div>
    <div class="admin-panel"><div class="panel-head"><div><small>AUDIT LOG</small><h2>Dernières actions</h2></div></div><div class="audit-list">${state.admin.audit.slice(0,15).map((a)=>`<div><span>${esc(a.type)}</span><strong>${esc(a.detail)}</strong><small>${new Date(a.at).toLocaleString('fr-FR')}</small></div>`).join('')}</div></div></div>
  </section>`;
}
function adminCaseRow(c) {
  return `<div class="admin-case-row"><img src="${c.image}" alt=""><div><strong>${esc(c.name)}</strong><small>${money(c.price)} CR · ${c.items.length} gains</small></div><button data-admin-toggle-case="${c.id}">${c.active ? 'Masquer' : 'Activer'}</button><button data-admin-edit-case="${c.id}">Gérer</button></div>`;
}
function adminUserRow(u) {
  return `<div class="admin-user-row">${avatar(u,'tiny')}<div><strong>${esc(u.username)}</strong><small>${u.inventoryCount} objets · ${u.admin?'ADMIN':'JOUEUR'}${u.banned?' · BANNI':''}</small></div><input type="number" value="${u.balance}" data-admin-balance="${u.id}"><button data-admin-save-user="${u.id}">Sauver</button><button class="${u.banned?'good-button':'danger-button'}" data-admin-ban="${u.id}">${u.banned?'Réactiver':'Bannir'}</button></div>`;
}
function empty(icon,title,text) { return `<div class="empty-state"><span>${icon}</span><h3>${title}</h3><p>${text}</p></div>`; }

function profileMenu() {
  const demoSwitch = state.config.demoMode ? `<div class="profile-menu-section"><small>PROFILS DE DÉMONSTRATION</small><button data-demo-user="demo-nova">NOVA · Joueur</button><button data-demo-user="demo-admin">ForgeMaster · Admin</button></div>` : '';
  modal(`<div class="profile-sheet"><button class="modal-close" data-close-modal>×</button>${avatar(state.user,'large')}<h2>${esc(state.user.username)}</h2><p>${money(state.user.balance)} crédits fictifs</p><div class="profile-stats"><span><b>${state.user.stats.opens || 0}</b> ouvertures</span><span><b>${state.user.stats.battleWins || 0}</b> battles gagnées</span><span><b>${state.inventory.length}</b> objets</span></div>${demoSwitch}<button class="ghost wide" data-close-modal>Fermer</button></div>`, 'profile-modal');
}
function caseModal(caseDef) {
  state.selectedCase = caseDef;
  state.quantity = 1;
  modal(`<div class="case-modal" style="--accent:${caseDef.accent}"><button class="modal-close" data-close-modal>×</button><div class="case-modal-head"><img src="${caseDef.image}" alt=""><div><span>${esc(caseDef.tag)}</span><h2>${esc(caseDef.name)}</h2><p>${caseDef.items.length} gains · jackpot ${money(Math.max(...caseDef.items.map(i=>i.value)))} CR</p></div></div><div class="qty-buttons">${[1,3,5,10].map(q=>`<button class="${q===1?'active':''}" data-qty="${q}">x${q}</button>`).join('')}</div><div class="case-contents">${caseDef.items.slice().sort((a,b)=>b.value-a.value).map((it)=>`<div style="--r:${rarityColor[it.rarity]}"><img src="${it.image}" alt=""><span>${esc(it.weapon)} · ${esc(it.name)}</span><b>${money(it.value)} CR</b></div>`).join('')}</div><button class="cta wide open-case-button" data-action="confirm-open">Ouvrir x1 · ${money(caseDef.price)} CR</button></div>`, 'case-modal-wrap');
}
function openingModal(caseDef, result) {
  const rows = result.items.map((winner,index) => {
    const reel = Array.from({length:26},(_,i)=>i===22?winner:caseDef.items[Math.floor(Math.random()*caseDef.items.length)]);
    return `<div class="reel-line" data-reel-line="${index}"><span class="reel-label">CAISSE ${index+1}</span><div class="reel-window"><div class="reel-pointer"></div><div class="reel-track">${reel.map((it)=>`<div class="reel-item" style="--r:${rarityColor[it.rarity] || '#999'}"><img src="${it.image}" alt=""><strong>${esc(it.name)}</strong><small>${money(it.value)} CR</small></div>`).join('')}</div></div><div class="line-result"></div></div>`;
  }).join('');
  modal(`<div class="opening-modal" style="--accent:${caseDef.accent}"><div class="opening-title"><span>OPENING x${result.items.length}</span><h2>${esc(caseDef.name)}</h2><p>Chaque ligne correspond à une caisse indépendante.</p></div><div class="multi-reels">${rows}</div><div class="opening-summary hidden" id="openingSummary"><div><small>COÛT</small><b>${money(result.cost)} CR</b></div><div><small>VALEUR</small><b>${money(result.total)} CR</b></div><div><small>RÉSULTAT</small><b class="${result.profit>=0?'good':'bad'}">${result.profit>=0?'+':''}${money(result.profit)} CR</b></div><button class="cta" data-close-modal>Continuer</button></div></div>`, 'opening-wrap');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const lines = [...document.querySelectorAll('[data-reel-line]')];
    lines.forEach((line,index) => {
      const track = line.querySelector('.reel-track');
      const distance = -(22 * 142 - Math.max(260,line.querySelector('.reel-window').clientWidth)/2 + 64);
      track.style.transition = `transform ${4.4 + index*0.08}s cubic-bezier(.08,.76,.08,1)`;
      track.style.transform = `translateX(${distance}px)`;
      setTimeout(() => {
        const item = result.items[index];
        const positive = item.value > caseDef.price;
        line.classList.add('revealed', positive ? 'positive' : 'negative');
        line.querySelector('.line-result').innerHTML = `<span>${positive?'WIN':'LOSE'}</span><strong>${esc(item.stattrak?'StatTrak™ ':'')}${esc(item.weapon)} · ${esc(item.name)} (${esc(item.condition)})</strong><b>${money(item.value)} CR</b>`;
      }, 4500 + index*80);
    });
    setTimeout(() => document.getElementById('openingSummary')?.classList.remove('hidden'), 4750 + lines.length*80);
  }));
}
function newBattleModal() {
  modal(`<div class="form-modal"><button class="modal-close" data-close-modal>×</button><span class="eyebrow">NEW LOBBY</span><h2>Créer une battle</h2><label>Caisse<select id="newBattleCase">${state.cases.map(c=>`<option value="${c.id}">${esc(c.name)} · ${money(c.price)} CR</option>`).join('')}</select></label><label>Manches<select id="newBattleRounds"><option value="1">1 manche</option><option value="3" selected>3 manches</option><option value="5">5 manches</option></select></label><label>Joueurs<select id="newBattleSlots"><option value="2">2 joueurs</option><option value="3">3 joueurs</option><option value="4" selected>4 joueurs</option></select></label><button class="cta wide" data-action="create-battle">Créer le lobby</button></div>`);
}
function battleResultModal(battle) {
  if (!battle.result) return;
  const c = state.cases.find(x=>x.id===battle.caseId);
  const players = battle.players.map((p)=>`<div class="battle-column ${battle.result.winnerIds.includes(p.id)?'winner':''}" data-player="${p.id}"><div class="battle-user">${avatar(p,'small')}<strong>${esc(p.username)}</strong><b>0.00 CR</b></div><div class="battle-drops"></div></div>`).join('');
  modal(`<div class="battle-modal"><div class="battle-modal-head"><span>LIVE BATTLE REPLAY</span><h2>${esc(c?.name || battle.caseId)}</h2><p>${battle.rounds} manches · pot ${money(battle.result.pot)} CR</p></div><div class="battle-columns">${players}</div><div class="battle-final hidden" id="battleFinal"><strong>Battle terminée</strong><button class="cta" data-close-modal>Continuer</button></div></div>`, 'battle-modal-wrap');
  const totals = Object.fromEntries(battle.players.map(p=>[p.id,0]));
  battle.result.rounds.forEach((round,rIndex)=>setTimeout(()=>{
    round.drops.forEach(({playerId,item})=>{
      totals[playerId]+=item.value;
      const col=document.querySelector(`[data-player="${CSS.escape(playerId)}"]`);
      if(!col)return;
      col.querySelector('.battle-drops').insertAdjacentHTML('beforeend',`<div class="battle-drop" style="--r:${rarityColor[item.rarity]}"><img src="${item.image}" alt=""><div><strong>${esc(item.name)}</strong><small>${esc(item.condition)}${item.stattrak?' · ST™':''}</small></div><b>${money(item.value)}</b></div>`);
      col.querySelector('.battle-user b').textContent=`${money(totals[playerId])} CR`;
    });
  },700+rIndex*1000));
  setTimeout(()=>document.getElementById('battleFinal')?.classList.remove('hidden'),900+battle.result.rounds.length*1000);
}
function adminCaseModal(c = null) {
  const base = c || { name:'NOUVELLE CAISSE', price:50, accent:'#ff3d8d', image:'/assets/cases/budget-frenzy.webp', tag:'CUSTOM', active:true, items:[] };
  modal(`<div class="form-modal admin-case-modal"><button class="modal-close" data-close-modal>×</button><span class="eyebrow">CASE BUILDER</span><h2>${c?'Modifier':'Créer'} une caisse</h2><label>Nom<input id="caseName" value="${esc(base.name)}"></label><div class="form-row"><label>Prix<input id="casePrice" type="number" value="${base.price}"></label><label>Couleur<input id="caseAccent" type="color" value="${esc(base.accent)}"></label></div><label>Tag<input id="caseTag" value="${esc(base.tag)}"></label><label>URL de l’image<input id="caseImage" value="${esc(base.image)}"></label><label class="check"><input id="caseActive" type="checkbox" ${base.active?'checked':''}> Caisse visible</label><div class="drop-json-note">Les drops existants sont conservés lors d’une modification. Une nouvelle caisse reçoit un pack de gains de démonstration.</div><button class="cta wide" data-admin-submit-case="${c?.id || ''}">Enregistrer</button></div>`);
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
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'profile-menu') { profileMenu(); return; }
  if (action === 'daily') {
    try { const r=await api('/daily',{method:'POST'}); toast(`+${r.amount} CR reçus`,'good'); await refreshAll(); } catch(e){toast(e.message,'bad');} return;
  }
  if (action === 'confirm-open') {
    try { const c=state.selectedCase; const r=await api(`/cases/${c.id}/open`,{method:'POST',body:{quantity:state.quantity}}); openingModal(c,r); await reloadUser(); document.getElementById('topBalance').textContent=`${money(state.user.balance)} CR`; } catch(e){toast(e.message,'bad');} return;
  }
  if (action === 'sell-all') { try{await api('/inventory/sell-all',{method:'POST'});toast('Inventaire revendu sans frais','good');await refreshAll();}catch(e){toast(e.message,'bad');}return; }
  if (action === 'new-battle') { newBattleModal(); return; }
  if (action === 'create-battle') {
    try{const b=await api('/battles',{method:'POST',body:{caseId:document.getElementById('newBattleCase').value,rounds:Number(document.getElementById('newBattleRounds').value),slots:Number(document.getElementById('newBattleSlots').value)}});closeModal();toast('Battle créée','good');state.battles.unshift(b);renderMain();}catch(e){toast(e.message,'bad');}return;
  }
  if (action === 'start-upgrade') {
    const uid=document.getElementById('upgradeItem')?.value,multiplier=Number(document.getElementById('upgradeMultiplier')?.value||2);
    if(!uid)return;
    try{const r=await api('/upgrade',{method:'POST',body:{uid,multiplier}});showUpgradeResult(r,multiplier);await reloadUser();document.getElementById('topBalance').textContent=`${money(state.user.balance)} CR`;}catch(e){toast(e.message,'bad');}return;
  }
  if (action === 'admin-new-case') { adminCaseModal(); return; }
  if (action === 'admin-save-settings') {
    try{await api('/admin/settings',{method:'PATCH',body:{dailyGift:Number(document.getElementById('adminDaily').value),openingDurationMs:Number(document.getElementById('adminOpening').value),upgradeDurationMs:Number(document.getElementById('adminUpgrade').value)}});toast('Réglages enregistrés','good');await loadAdmin();}catch(e){toast(e.message,'bad');}return;
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
  const saveUser=event.target.closest('[data-admin-save-user]');
  if(saveUser){const id=saveUser.dataset.adminSaveUser;const input=document.querySelector(`[data-admin-balance="${CSS.escape(id)}"]`);try{await api(`/admin/users/${id}`,{method:'PATCH',body:{balance:Number(input.value)}});toast('Solde enregistré','good');await loadAdmin();}catch(e){toast(e.message,'bad');}return;}
  const ban=event.target.closest('[data-admin-ban]');
  if(ban){const u=state.admin.users.find(x=>x.id===ban.dataset.adminBan);try{await api(`/admin/users/${u.id}`,{method:'PATCH',body:{banned:!u.banned}});toast('Compte mis à jour','good');await loadAdmin();}catch(e){toast(e.message,'bad');}return;}
}
function showUpgradeResult(result,multiplier){
  const chance=result.chance;
  modal(`<div class="upgrade-result-modal"><span class="eyebrow">UPGRADE x${multiplier}</span><h2>La roue tourne…</h2><div class="result-wheel" style="--chance:${chance*3.6}deg"><div class="result-win-zone"></div><div class="result-pointer"></div><div class="result-center">DF</div></div><div class="upgrade-reveal hidden" id="upgradeReveal"></div></div>`,'upgrade-result-wrap');
  const wheel=document.querySelector('.result-wheel');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{wheel.style.transform=`rotate(${1440 + (result.success?chance*1.7:chance*3.6+80)}deg)`;}));
  setTimeout(()=>{const root=document.getElementById('upgradeReveal');if(!root)return;root.classList.remove('hidden');root.classList.add(result.success?'good':'bad');root.innerHTML=result.success?`<strong>WIN · UPGRADE RÉUSSI</strong>${itemCard(result.result,true)}<button class="cta" data-close-modal>Continuer</button>`:`<strong>LOSE · OBJET PERDU</strong><p>${esc(result.source.weapon)} · ${esc(result.source.name)}</p><button class="ghost" data-close-modal>Continuer</button>`;},6500);
}

document.addEventListener('click', handleClick);
document.addEventListener('change',(event)=>{
  if(event.target.id==='upgradeMultiplier'){
    const mult=Number(event.target.value);const chance=Math.min(90,95/mult);const el=document.getElementById('chanceValue');if(el)el.textContent=`${chance.toFixed(1)}%`;
    const bar=document.querySelector('.chance-preview i');if(bar)bar.style.width=`${chance}%`;
  }
});
init();
