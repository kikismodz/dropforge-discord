const wear = { FN: 8, MW: 18, FT: 42, WW: 20, BS: 12 };
const multipliers = { FN: 1, MW: 0.88, FT: 0.68, WW: 0.52, BS: 0.4, ST: 1.35 };

function item(id, weapon, name, value, weight, rarity, image, stattrak = 10) {
  return { id, weapon, name, value, weight, rarity, image, wear: { ...wear }, stattrak };
}


const generatedMultipliers = [0.08, 0.14, 0.22, 0.32, 0.44, 0.58, 0.72, 1.15, 1.55, 2.2, 4.2, 9];
const generatedWeights = [18, 16, 14, 12, 10, 6, 4, 10, 5, 3, 1.5, 0.5];
const generatedRarities = ['consumer','industrial','mil-spec','restricted','restricted','classified','classified','covert','covert','covert','gold','gold'];
const generatedSuffixes = ['Nightline','Circuit','Reactor','Afterburn','Vortex','Overdrive','Revenant','Eclipse','Sovereign','Apex','Relic','Ascendant'];
const weaponImages = {
  'AK-47': '/assets/weapons/ak.webp', AWP: '/assets/weapons/awp.webp', Knife: '/assets/weapons/knife.webp', Gloves: '/assets/weapons/gloves.webp',
  'USP-S': '/assets/weapons/pistol.webp', 'Glock-18': '/assets/weapons/pistol.webp', 'Desert Eagle': '/assets/weapons/pistol.webp', P250: '/assets/weapons/pistol.webp',
  MP9: '/assets/weapons/smg.webp', MAC10: '/assets/weapons/smg.webp', MP7: '/assets/weapons/smg.webp', UMP45: '/assets/weapons/smg.webp',
  'M4A1-S': '/assets/weapons/rifle.webp', M4A4: '/assets/weapons/rifle.webp', FAMAS: '/assets/weapons/rifle.webp', AUG: '/assets/weapons/rifle.webp', Galil: '/assets/weapons/rifle.webp',
};

function generatedCase(config) {
  const weapons = config.weapons;
  return {
    id: config.id,
    name: config.name,
    price: config.price,
    active: true,
    accent: config.accent,
    image: config.image,
    tag: config.tag,
    items: generatedMultipliers.map((multiplier, index) => {
      const weapon = weapons[index % weapons.length];
      const noStatTrak = weapon === 'Knife' || weapon === 'Gloves';
      return item(
        `${config.id}-${index + 1}`,
        weapon,
        `${config.theme} ${generatedSuffixes[index]}`,
        Math.max(1, Math.round(config.price * multiplier * 100) / 100),
        generatedWeights[index],
        generatedRarities[index],
        weaponImages[weapon] || '/assets/weapons/rifle.webp',
        noStatTrak ? 0 : 10,
      );
    }),
  };
}

const additionalCases = [
  { id:'pistol-pulse', name:'PISTOL PULSE', price:20, accent:'#ff7a2f', image:'/assets/cases/confirmed-vault.webp', tag:'PISTOL STARTER', theme:'Pulse', weapons:['USP-S','Glock-18','P250','Desert Eagle'] },
  { id:'smg-rush', name:'SMG RUSH', price:35, accent:'#20d8c8', image:'/assets/cases/budget-frenzy.webp', tag:'CLOSE RANGE', theme:'Rush', weapons:['MP9','MAC10','MP7','UMP45'] },
  { id:'rifle-circuit', name:'RIFLE CIRCUIT', price:55, accent:'#5ca8ff', image:'/assets/cases/ak-legends.webp', tag:'RIFLE MIX', theme:'Circuit', weapons:['AK-47','M4A1-S','M4A4','FAMAS','Galil'] },
  { id:'desert-crown', name:'DESERT CROWN', price:70, accent:'#e5b14b', image:'/assets/cases/confirmed-vault.webp', tag:'HEAVY PISTOLS', theme:'Crown', weapons:['Desert Eagle','USP-S','Glock-18','P250'] },
  { id:'m4-dominion', name:'M4 DOMINION', price:90, accent:'#6f91ff', image:'/assets/cases/ak-legends.webp', tag:'M4 COLLECTION', theme:'Dominion', weapons:['M4A1-S','M4A4','FAMAS','AUG'] },
  { id:'neon-arsenal', name:'NEON ARSENAL', price:105, accent:'#ff4ca3', image:'/assets/cases/royal-overdrive.webp', tag:'NEON MIX', theme:'Neon', weapons:['AK-47','M4A1-S','AWP','USP-S','MP9'] },
  { id:'tactical-storm', name:'TACTICAL STORM', price:125, accent:'#68c4ff', image:'/assets/cases/sniper-ritual.webp', tag:'TACTICAL LOADOUT', theme:'Storm', weapons:['M4A1-S','AK-47','AWP','USP-S','MP7'] },
  { id:'crimson-protocol', name:'CRIMSON PROTOCOL', price:150, accent:'#ff465f', image:'/assets/cases/knife-protocol.webp', tag:'CRIMSON SERIES', theme:'Crimson', weapons:['AK-47','M4A4','AWP','Knife','USP-S'] },
  { id:'glacier-strike', name:'GLACIER STRIKE', price:175, accent:'#7be6ff', image:'/assets/cases/sniper-ritual.webp', tag:'FROZEN COLLECTION', theme:'Glacier', weapons:['AWP','M4A1-S','AK-47','USP-S','Knife'] },
  { id:'toxic-chamber', name:'TOXIC CHAMBER', price:200, accent:'#8ee93a', image:'/assets/cases/budget-frenzy.webp', tag:'TOXIC SERIES', theme:'Toxic', weapons:['AK-47','M4A4','AWP','MP9','Knife'] },
  { id:'shadow-market', name:'SHADOW MARKET', price:230, accent:'#8975c8', image:'/assets/cases/confirmed-vault.webp', tag:'DARK COLLECTION', theme:'Shadow', weapons:['USP-S','AK-47','M4A1-S','AWP','Gloves'] },
  { id:'cyber-rebellion', name:'CYBER REBELLION', price:275, accent:'#f04cff', image:'/assets/cases/royal-overdrive.webp', tag:'CYBER SERIES', theme:'Cyber', weapons:['AK-47','M4A1-S','AWP','Knife','Gloves'] },
  { id:'fade-district', name:'FADE DISTRICT', price:320, accent:'#ffb34d', image:'/assets/cases/knife-protocol.webp', tag:'FADE COLLECTION', theme:'Fade', weapons:['Knife','AK-47','M4A1-S','AWP','USP-S'] },
  { id:'doppler-core', name:'DOPPLER CORE', price:380, accent:'#915cff', image:'/assets/cases/knife-protocol.webp', tag:'DOPPLER SERIES', theme:'Doppler', weapons:['Knife','AWP','AK-47','M4A1-S','Gloves'] },
  { id:'glove-syndicate', name:'GLOVE SYNDICATE', price:450, accent:'#ff8a48', image:'/assets/cases/royal-overdrive.webp', tag:'GLOVE VAULT', theme:'Syndicate', weapons:['Gloves','Knife','AK-47','AWP'] },
  { id:'elite-loadout', name:'ELITE LOADOUT', price:520, accent:'#ffc857', image:'/assets/cases/royal-overdrive.webp', tag:'ELITE MIX', theme:'Elite', weapons:['AK-47','M4A1-S','AWP','Knife','Gloves'] },
  { id:'crimson-dynasty', name:'CRIMSON DYNASTY', price:650, accent:'#ff304d', image:'/assets/cases/royal-overdrive.webp', tag:'PREMIUM CRIMSON', theme:'Dynasty', weapons:['Knife','Gloves','AK-47','AWP','M4A1-S'] },
  { id:'emerald-vault', name:'EMERALD VAULT', price:800, accent:'#29d98d', image:'/assets/cases/knife-protocol.webp', tag:'EMERALD PREMIUM', theme:'Emerald', weapons:['Knife','Gloves','AWP','AK-47'] },
  { id:'sapphire-temple', name:'SAPPHIRE TEMPLE', price:950, accent:'#438cff', image:'/assets/cases/sniper-ritual.webp', tag:'SAPPHIRE PREMIUM', theme:'Sapphire', weapons:['Knife','AWP','Gloves','M4A1-S'] },
  { id:'ruby-dominion', name:'RUBY DOMINION', price:1200, accent:'#ff365e', image:'/assets/cases/royal-overdrive.webp', tag:'RUBY PREMIUM', theme:'Ruby', weapons:['Knife','Gloves','AK-47','AWP'] },
  { id:'mythic-arsenal', name:'MYTHIC ARSENAL', price:1500, accent:'#d98bff', image:'/assets/cases/royal-overdrive.webp', tag:'MYTHIC TIER', theme:'Mythic', weapons:['Knife','Gloves','AWP','AK-47','M4A1-S'] },
  { id:'dragon-chamber', name:'DRAGON CHAMBER', price:2000, accent:'#ff7a24', image:'/assets/cases/sniper-ritual.webp', tag:'DRAGON TIER', theme:'Dragon', weapons:['AWP','AK-47','Knife','Gloves'] },
  { id:'collectors-crown', name:"COLLECTOR'S CROWN", price:3000, accent:'#ffd45a', image:'/assets/cases/royal-overdrive.webp', tag:'COLLECTOR TIER', theme:'Collector', weapons:['Knife','Gloves','AWP','AK-47','M4A1-S'] },
  { id:'nova-jackpot', name:'NOVA JACKPOT', price:5000, accent:'#ff9b2f', image:'/assets/cases/royal-overdrive.webp', tag:'ULTIMATE JACKPOT', theme:'Nova', weapons:['Knife','Gloves','AWP','AK-47'] },
].map(generatedCase);

export const initialCases = [
  {
    id: 'confirmed-vault', name: 'CONFIRMED VAULT', price: 75, active: true,
    accent: '#ff3d8d', image: '/assets/cases/confirmed-vault.webp', tag: 'USP-S COLLECTION',
    items: [
      item('cv1','USP-S','Night Ops',8,19,'consumer','/assets/weapons/pistol.webp'),
      item('cv2','USP-S','Blueprint',13,17,'industrial','/assets/weapons/pistol.webp'),
      item('cv3','USP-S','Ticket to Hell',21,14,'mil-spec','/assets/weapons/pistol.webp'),
      item('cv4','USP-S','Cortex',31,11,'restricted','/assets/weapons/pistol.webp'),
      item('cv5','USP-S','Cyrex',43,8,'restricted','/assets/weapons/pistol.webp'),
      item('cv6','USP-S','The Traitor',58,6,'classified','/assets/weapons/pistol.webp'),
      item('cv7','USP-S','Printstream',72,5,'classified','/assets/weapons/pistol.webp'),
      item('cv8','USP-S','Kill Confirmed',98,8,'covert','/assets/weapons/pistol.webp'),
      item('cv9','USP-S','Orion',140,5,'covert','/assets/weapons/pistol.webp'),
      item('cv10','USP-S','Neo-Noir',210,3.5,'covert','/assets/weapons/pistol.webp'),
      item('cv11','USP-S','Whiteout',430,2.5,'gold','/assets/weapons/pistol.webp'),
      item('cv12','USP-S','Crimson Legacy',980,1,'gold','/assets/weapons/pistol.webp'),
    ],
  },
  {
    id: 'ak-legends', name: 'AK LEGENDS', price: 115, active: true,
    accent: '#ff6747', image: '/assets/cases/ak-legends.webp', tag: 'AK-47 ONLY',
    items: [
      item('ak1','AK-47','Uncharted',11,19,'consumer','/assets/weapons/ak.webp'),
      item('ak2','AK-47','Slate',19,17,'industrial','/assets/weapons/ak.webp'),
      item('ak3','AK-47','Elite Build',31,14,'mil-spec','/assets/weapons/ak.webp'),
      item('ak4','AK-47','Redline',48,11,'restricted','/assets/weapons/ak.webp'),
      item('ak5','AK-47','Ice Coaled',66,8,'restricted','/assets/weapons/ak.webp'),
      item('ak6','AK-47','Neon Revolution',88,6,'classified','/assets/weapons/ak.webp'),
      item('ak7','AK-47','Bloodsport',109,5,'classified','/assets/weapons/ak.webp'),
      item('ak8','AK-47','Neon Rider',148,8,'covert','/assets/weapons/ak.webp'),
      item('ak9','AK-47','Vulcan',230,5,'covert','/assets/weapons/ak.webp'),
      item('ak10','AK-47','Fuel Injector',390,3.5,'covert','/assets/weapons/ak.webp'),
      item('ak11','AK-47','Fire Serpent',1050,2.5,'gold','/assets/weapons/ak.webp'),
      item('ak12','AK-47','Wild Lotus',4200,1,'gold','/assets/weapons/ak.webp'),
    ],
  },
  {
    id: 'sniper-ritual', name: 'SNIPER RITUAL', price: 145, active: true,
    accent: '#9d67ff', image: '/assets/cases/sniper-ritual.webp', tag: 'SNIPER COLLECTION',
    items: [
      item('aw1','AWP','Acheron',14,19,'consumer','/assets/weapons/awp.webp'),
      item('aw2','AWP','Mortis',25,17,'industrial','/assets/weapons/awp.webp'),
      item('aw3','AWP','Exoskeleton',39,14,'mil-spec','/assets/weapons/awp.webp'),
      item('aw4','AWP','Duality',58,11,'restricted','/assets/weapons/awp.webp'),
      item('aw5','AWP','Chromatic Aberration',82,8,'restricted','/assets/weapons/awp.webp'),
      item('aw6','AWP','Neo-Noir',108,6,'classified','/assets/weapons/awp.webp'),
      item('aw7','AWP','Hyper Beast',138,5,'classified','/assets/weapons/awp.webp'),
      item('aw8','AWP','Asiimov',195,8,'covert','/assets/weapons/awp.webp'),
      item('aw9','AWP','Containment Breach',310,5,'covert','/assets/weapons/awp.webp'),
      item('aw10','AWP','Lightning Strike',590,3.5,'covert','/assets/weapons/awp.webp'),
      item('aw11','AWP','Medusa',1800,2.5,'gold','/assets/weapons/awp.webp'),
      item('aw12','AWP','Dragon Lore',7200,1,'gold','/assets/weapons/awp.webp'),
    ],
  },
  {
    id: 'budget-frenzy', name: 'BUDGET FRENZY', price: 30, active: true,
    accent: '#35e7ff', image: '/assets/cases/budget-frenzy.webp', tag: 'STARTER MIX',
    items: [
      item('bf1','Glock-18','Moonrise',3,20,'consumer','/assets/weapons/pistol.webp'),
      item('bf2','MP9','Food Chain',5,18,'industrial','/assets/weapons/smg.webp'),
      item('bf3','P250','See Ya Later',8,14,'mil-spec','/assets/weapons/pistol.webp'),
      item('bf4','FAMAS','Mecha Industries',12,11,'restricted','/assets/weapons/rifle.webp'),
      item('bf5','M4A4','Tooth Fairy',17,8,'restricted','/assets/weapons/rifle.webp'),
      item('bf6','USP-S','Cortex',22,5,'classified','/assets/weapons/pistol.webp'),
      item('bf7','AK-47','Slate',29,4,'classified','/assets/weapons/ak.webp'),
      item('bf8','Desert Eagle','Printstream',42,8,'classified','/assets/weapons/pistol.webp'),
      item('bf9','M4A1-S','Nightmare',65,5,'covert','/assets/weapons/rifle.webp'),
      item('bf10','AK-47','Redline',96,3.5,'covert','/assets/weapons/ak.webp'),
      item('bf11','AWP','Asiimov',220,2.5,'gold','/assets/weapons/awp.webp'),
      item('bf12','Knife','Doppler Fang',760,1,'gold','/assets/weapons/knife.webp',0),
    ],
  },
  {
    id: 'knife-protocol', name: 'KNIFE PROTOCOL', price: 260, active: true,
    accent: '#ffc447', image: '/assets/cases/knife-protocol.webp', tag: 'KNIFE VAULT',
    items: [
      item('kp1','Knife','Safari Mesh',26,19,'consumer','/assets/weapons/knife.webp',0),
      item('kp2','Knife','Scorched',45,17,'industrial','/assets/weapons/knife.webp',0),
      item('kp3','Knife','Blue Steel',70,14,'mil-spec','/assets/weapons/knife.webp',0),
      item('kp4','Knife','Crimson Web',105,11,'restricted','/assets/weapons/knife.webp',0),
      item('kp5','Knife','Damascus Steel',150,8,'restricted','/assets/weapons/knife.webp',0),
      item('kp6','Knife','Ultraviolet',205,6,'classified','/assets/weapons/knife.webp',0),
      item('kp7','Knife','Tiger Tooth',255,5,'classified','/assets/weapons/knife.webp',0),
      item('kp8','Knife','Doppler Phase',345,8,'covert','/assets/weapons/knife.webp',0),
      item('kp9','Knife','Marble Fade',540,5,'covert','/assets/weapons/knife.webp',0),
      item('kp10','Knife','Gamma Doppler',880,3.5,'covert','/assets/weapons/knife.webp',0),
      item('kp11','Knife','Ruby',2100,2.5,'gold','/assets/weapons/knife.webp',0),
      item('kp12','Knife','Emerald Crown',4800,1,'gold','/assets/weapons/knife.webp',0),
    ],
  },
  {
    id: 'royal-overdrive', name: 'ROYAL OVERDRIVE', price: 420, active: true,
    accent: '#ff3d8d', image: '/assets/cases/royal-overdrive.webp', tag: 'HIGH ROLLER',
    items: [
      item('ro1','M4A1-S','Player Two',42,19,'consumer','/assets/weapons/rifle.webp'),
      item('ro2','AK-47','Bloodsport',72,17,'industrial','/assets/weapons/ak.webp'),
      item('ro3','AWP','Hyper Beast',112,14,'mil-spec','/assets/weapons/awp.webp'),
      item('ro4','Gloves','Overtake',170,11,'restricted','/assets/weapons/gloves.webp',0),
      item('ro5','Knife','Ultraviolet',240,8,'restricted','/assets/weapons/knife.webp',0),
      item('ro6','AK-47','Neon Rider',330,6,'classified','/assets/weapons/ak.webp'),
      item('ro7','AWP','Asiimov',410,5,'classified','/assets/weapons/awp.webp'),
      item('ro8','Gloves','Crimson Kimono',580,8,'covert','/assets/weapons/gloves.webp',0),
      item('ro9','Knife','Gamma Doppler',920,5,'covert','/assets/weapons/knife.webp',0),
      item('ro10','AWP','Medusa',1800,3.5,'gold','/assets/weapons/awp.webp'),
      item('ro11','AK-47','Wild Lotus',4200,2.5,'gold','/assets/weapons/ak.webp'),
      item('ro12','AWP','Dragon Lore',8500,1,'gold','/assets/weapons/awp.webp'),
    ],
  },
  ...additionalCases,
];

export const initialState = {
  settings: {
    dailyGift: 100,
    openingDurationMs: 5200,
    upgradeDurationMs: 9800,
    battleRoundDurationMs: 5600,
    sellRate: 1,
    xpOpen: 8,
    xpBattle: 70,
    xpBattleWinBonus: 35,
    xpUpgrade: 35,
    xpTradeUp: 150,
    xpDaily: 25,
    valueMultipliers: multipliers,
  },
  cases: initialCases,
  users: [
    { id: 'demo-admin', username: 'ForgeMaster', avatar: '', balance: 2500, admin: true, banned: false, inventory: [], history: [], stats: { opens: 0, battles: 0, battleWins: 0, upgrades: 0, upgradeWins: 0, tradeUps: 0, profit: 0 }, xp: 0, lastDaily: 0 },
    { id: 'demo-nova', username: 'NOVA', avatar: '', balance: 980, admin: false, banned: false, inventory: [], history: [], stats: { opens: 12, battles: 6, battleWins: 3, upgrades: 4, upgradeWins: 1, tradeUps: 0, profit: 124 }, xp: 1840, lastDaily: 0 },
    { id: 'demo-raven', username: 'RAVEN', avatar: '', balance: 740, admin: false, banned: false, inventory: [], history: [], stats: { opens: 9, battles: 4, battleWins: 2, upgrades: 2, upgradeWins: 1, tradeUps: 0, profit: 62 }, xp: 1120, lastDaily: 0 },
    { id: 'demo-kira', username: 'KIRA', avatar: '', balance: 530, admin: false, banned: false, inventory: [], history: [], stats: { opens: 7, battles: 3, battleWins: 1, upgrades: 1, upgradeWins: 0, tradeUps: 0, profit: -33 }, xp: 720, lastDaily: 0 },
  ],
  battles: [],
  audit: [],
};
