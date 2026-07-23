import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getState, getUser, load, publicUser, reset, save, snapshot } from './server/store.js';
import { claimDaily, createBattle, joinBattle, openCases, runUpgrade, previewTradeUp, runTradeUp, sellAll, sellItem, startBattle } from './server/game.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 3000;
load();

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('='); return [decodeURIComponent(v.slice(0,i)), decodeURIComponent(v.slice(i+1))];
  }));
}
function currentUser(req) {
  const id = parseCookies(req).df_demo_user || 'demo-nova';
  return getUser(id) || getUser('demo-nova');
}
function json(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw=''; req.on('data', chunk => { raw += chunk; if (raw.length > 2_000_000) reject(new Error('Payload trop lourd')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON invalide')); } });
  });
}
function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'})[ext] || 'application/octet-stream';
}
function serveStatic(req,res) {
  let rel = decodeURIComponent(new URL(req.url,'http://local').pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(dist, rel));
  if (!file.startsWith(dist)) return false;
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const data = fs.readFileSync(file); res.writeHead(200, {'Content-Type':mime(file),'Content-Length':data.length,'Cache-Control':'no-cache'});res.end(data);return true;
  }
  const index = path.join(dist,'index.html');
  if (fs.existsSync(index)) { const data=fs.readFileSync(index);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':data.length});res.end(data);return true; }
  return false;
}
function casePayload(body, existing = {}) {
  return {
    ...existing,
    id: existing.id || `case-${Date.now().toString(36)}`,
    name: String(body.name || existing.name || 'NOUVELLE CAISSE').toUpperCase(),
    price: Math.max(1, Number(body.price ?? existing.price) || 10),
    active: body.active ?? existing.active ?? true,
    accent: String(body.accent || existing.accent || '#ff3d8d'),
    image: String(body.image || existing.image || '/assets/cases/budget-frenzy.webp'),
    tag: String(body.tag || existing.tag || 'CUSTOM'),
    items: body.items || existing.items || getState().cases[3].items,
  };
}
async function api(req,res,url) {
  const method=req.method, pathname=url.pathname, user=currentUser(req);
  try {
    if(method==='GET'&&pathname==='/api/config')return json(res,200,{clientId:'',publicUrl:`http://localhost:${port}`,demoMode:true,activityProxyPrefix:'/.proxy'});
    if(method==='POST'&&pathname==='/api/token')return json(res,200,{access_token:'demo-token'});
    if(method==='POST'&&pathname==='/api/session/discord')return json(res,200,{user:publicUser(user)});
    if(method==='GET'&&pathname==='/api/me')return json(res,200,{user:publicUser(user),inventory:user.inventory,history:user.history});
    if(method==='GET'&&pathname==='/api/fair')return json(res,200,{clientSeed:user.fair?.clientSeed||'',nonce:Number(user.fair?.nonce)||0,serverHash:user.fair?.serverHash||'',history:Array.isArray(user.fair?.history)?user.fair.history.slice(0,30):[]});
    if(method==='PATCH'&&pathname==='/api/fair/client-seed'){const body=await readBody(req),seed=String(body.clientSeed||'').trim().slice(0,64);if(seed.length<3)throw new Error('Client seed trop court');user.fair.clientSeed=seed;save();return json(res,200,{clientSeed:seed,nonce:user.fair.nonce,serverHash:user.fair.serverHash});}
    if(method==='GET'&&pathname==='/api/demo/users')return json(res,200,{users:getState().users.map(publicUser)});
    if(method==='POST'&&pathname==='/api/demo/switch'){
      const body=await readBody(req), target=getUser(body.userId); if(!target)throw new Error('Profil introuvable');
      return json(res,200,{user:publicUser(target)},{'Set-Cookie':`df_demo_user=${encodeURIComponent(target.id)}; Path=/; SameSite=Lax; Max-Age=2592000`});
    }
    if(method==='GET'&&pathname==='/api/cases')return json(res,200,{cases:getState().cases.filter(c=>c.active!==false)});
    if(method==='GET'&&pathname==='/api/leaderboard')return json(res,200,{users:[...getState().users].filter(u=>!u.banned).sort((a,b)=>(Number(b.xp)||0)-(Number(a.xp)||0)||b.balance-a.balance).map(publicUser)});
    if(method==='GET'&&pathname==='/api/battles')return json(res,200,{battles:getState().battles.slice(0,30)});
    if(method==='POST'&&pathname==='/api/daily')return json(res,200,claimDaily(user.id));
    let m=pathname.match(/^\/api\/cases\/([^/]+)\/open$/);if(method==='POST'&&m){const body=await readBody(req);return json(res,200,openCases(user.id,m[1],body.quantity));}
    m=pathname.match(/^\/api\/inventory\/([^/]+)\/sell$/);if(method==='POST'&&m)return json(res,200,sellItem(user.id,m[1]));
    if(method==='POST'&&pathname==='/api/inventory/sell-all')return json(res,200,sellAll(user.id));
    if(method==='POST'&&pathname==='/api/trade-up/preview'){const body=await readBody(req);return json(res,200,previewTradeUp(user.id,body.uids));}
    if(method==='POST'&&pathname==='/api/trade-up'){const body=await readBody(req);return json(res,200,runTradeUp(user.id,body.uids));}
    if(method==='POST'&&pathname==='/api/upgrade'){const body=await readBody(req);return json(res,200,runUpgrade(user.id,body.uid,body.multiplier));}
    if(method==='POST'&&pathname==='/api/battles'){const body=await readBody(req);return json(res,200,createBattle(user.id,body.caseId,body.rounds,body.slots));}
    m=pathname.match(/^\/api\/battles\/([^/]+)\/join$/);if(method==='POST'&&m)return json(res,200,joinBattle(user.id,m[1]));
    m=pathname.match(/^\/api\/battles\/([^/]+)\/start$/);if(method==='POST'&&m)return json(res,200,startBattle(user.id,m[1],true));
    if(pathname.startsWith('/api/admin')&&!user.admin)return json(res,403,{error:'Accès administrateur requis'});
    if(method==='GET'&&pathname==='/api/admin/overview'){
      const s=snapshot();return json(res,200,{settings:s.settings,cases:s.cases,users:s.users.map(publicUser),battles:s.battles.slice(0,30),audit:s.audit.slice(0,100),metrics:{users:s.users.length,activeCases:s.cases.filter(c=>c.active!==false).length,inventoryItems:s.users.reduce((n,u)=>n+u.inventory.length,0),battles:s.battles.length,credits:s.users.reduce((n,u)=>n+u.balance,0)}});
    }
    if(method==='POST'&&pathname==='/api/admin/cases'){const body=await readBody(req),entry=casePayload(body);getState().cases.push(entry);save();return json(res,200,entry);}
    m=pathname.match(/^\/api\/admin\/cases\/([^/]+)$/);if(method==='PUT'&&m){const body=await readBody(req),idx=getState().cases.findIndex(c=>c.id===m[1]);if(idx<0)throw new Error('Caisse introuvable');getState().cases[idx]=casePayload(body,getState().cases[idx]);save();return json(res,200,getState().cases[idx]);}
    m=pathname.match(/^\/api\/admin\/users\/([^/]+)$/);if(method==='PATCH'&&m){const body=await readBody(req),target=getUser(m[1]);if(!target)throw new Error('Utilisateur introuvable');if(Number.isFinite(Number(body.balance)))target.balance=Math.max(0,Number(body.balance));if(Number.isFinite(Number(body.xp)))target.xp=Math.max(0,Number(body.xp));if(typeof body.banned==='boolean')target.banned=body.banned;if(typeof body.admin==='boolean')target.admin=body.admin;save();return json(res,200,publicUser(target));}
    if(method==='PATCH'&&pathname==='/api/admin/settings'){const body=await readBody(req);Object.assign(getState().settings,{dailyGift:Math.max(0,Number(body.dailyGift)||0),openingDurationMs:Math.max(1500,Number(body.openingDurationMs)||5200),upgradeDurationMs:Math.max(3000,Number(body.upgradeDurationMs)||9800),battleRoundDurationMs:Math.max(2500,Number(body.battleRoundDurationMs)||5600),xpOpen:Math.max(0,Number(body.xpOpen)||0),xpBattle:Math.max(0,Number(body.xpBattle)||0),xpBattleWinBonus:Math.max(0,Number(body.xpBattleWinBonus)||0),xpUpgrade:Math.max(0,Number(body.xpUpgrade)||0),xpTradeUp:Math.max(0,Number(body.xpTradeUp)||0),xpDaily:Math.max(0,Number(body.xpDaily)||0)});save();return json(res,200,getState().settings);}
    if(method==='POST'&&pathname==='/api/admin/reset'){reset();return json(res,200,{ok:true});}
    return json(res,404,{error:'Route API introuvable'});
  } catch(error){return json(res,400,{error:error.message||'Erreur'});}
}

const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://local');if(url.pathname.startsWith('/api/'))return api(req,res,url);if(!serveStatic(req,res)){res.writeHead(404);res.end('Not found');}});
server.listen(port,'0.0.0.0',()=>console.log(`Skinova Discord Demo : http://localhost:${port}`));
