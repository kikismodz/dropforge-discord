import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

const BRAND_COLOR = '#ff6a00';
const DARK_COLOR = '#121212';
const SETUP_FOOTER = 'Skinova Setup v1';

const ROLE_DEFINITIONS = [
  {
    key: 'founder',
    name: '👑 Fondateur',
    color: '#ff7a00',
    hoist: true,
    permissions: [PermissionFlagsBits.Administrator],
  },
  {
    key: 'developer',
    name: '🛠️ Développeur',
    color: '#ff9a3d',
    hoist: true,
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
    ],
  },
  {
    key: 'admin',
    name: '🛡️ Administrateur',
    color: '#e8590c',
    hoist: true,
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
    ],
  },
  {
    key: 'moderator',
    name: '🔨 Modérateur',
    color: '#ff922b',
    hoist: true,
    permissions: [
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.ViewAuditLog,
    ],
  },
  {
    key: 'support',
    name: '🎧 Support',
    color: '#ffd43b',
    hoist: true,
    permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads],
  },
  { key: 'tester', name: '🧪 Bêta-testeur', color: '#4dabf7', hoist: true, permissions: [] },
  { key: 'vip', name: '💎 VIP', color: '#b197fc', hoist: true, permissions: [] },
  { key: 'partner', name: '🤝 Partenaire', color: '#63e6be', hoist: true, permissions: [] },
  { key: 'player', name: '🎮 Joueur', color: '#868e96', hoist: false, permissions: [] },
  { key: 'bots', name: '🤖 Bots', color: '#495057', hoist: false, permissions: [] },
];

const CATEGORY_DEFINITIONS = [
  { key: 'info', name: '📌 INFORMATIONS', position: 0 },
  { key: 'skinova', name: '🎮 SKINOVA', position: 1 },
  { key: 'support', name: '🛠️ ASSISTANCE', position: 2 },
  { key: 'community', name: '💬 COMMUNAUTÉ', position: 3 },
  { key: 'voice', name: '🔊 VOCAUX', position: 4 },
  { key: 'staff', name: '🔒 ÉQUIPE', position: 5, staffOnly: true },
];

const CHANNEL_DEFINITIONS = [
  { category: 'info', name: 'bienvenue', type: ChannelType.GuildText, mode: 'readonly', topic: 'Bienvenue sur Skinova · [skinova:welcome]' },
  { category: 'info', name: 'règlement', type: ChannelType.GuildText, mode: 'readonly', topic: 'Règlement officiel du serveur · [skinova:rules]' },
  { category: 'info', name: 'annonces', type: ChannelType.GuildText, mode: 'readonly', topic: 'Annonces officielles de Skinova · [skinova:announcements]' },
  { category: 'info', name: 'changelog', type: ChannelType.GuildText, mode: 'readonly', topic: 'Historique des mises à jour Skinova · [skinova:changelog]' },
  { category: 'info', name: 'faq-skinova', type: ChannelType.GuildText, mode: 'readonly', topic: 'Questions fréquentes sur Skinova · [skinova:faq]' },
  { category: 'info', name: 'statut-du-projet', type: ChannelType.GuildText, mode: 'readonly', topic: 'État du service et développement · [skinova:status]' },

  { category: 'skinova', name: 'lancer-skinova', type: ChannelType.GuildText, mode: 'readonly', topic: 'Lancer l’Activity Skinova · [skinova:launch]' },
  { category: 'skinova', name: 'derniers-drops', type: ChannelType.GuildText, mode: 'readonly', topic: 'Flux des derniers drops · [skinova:drops]' },
  { category: 'skinova', name: 'battles', type: ChannelType.GuildText, mode: 'public', topic: 'Création et suivi des battles Skinova' },
  { category: 'skinova', name: 'classement', type: ChannelType.GuildText, mode: 'readonly', topic: 'Classements Skinova · [skinova:leaderboard]' },
  { category: 'skinova', name: 'trade-up', type: ChannelType.GuildText, mode: 'public', topic: 'Trade Ups, résultats et conseils' },
  { category: 'skinova', name: 'commandes-bot', type: ChannelType.GuildText, mode: 'public', topic: 'Toutes les commandes du bot Skinova · [skinova:commands]' },

  {
    category: 'support', name: 'support', type: ChannelType.GuildForum, mode: 'forum', topic: 'Ouvre un sujet pour obtenir de l’aide.',
    tags: ['Compte', 'Inventaire', 'Battle', 'Trade Up', 'Résolu'],
  },
  {
    category: 'support', name: 'signalement-de-bug', type: ChannelType.GuildForum, mode: 'forum', topic: 'Signale un bug avec une capture et les étapes pour le reproduire.',
    tags: ['Interface', 'Activity', 'Battle', 'Upgrade', 'Bloquant', 'Résolu'],
  },
  {
    category: 'support', name: 'suggestions', type: ChannelType.GuildForum, mode: 'forum', topic: 'Propose une amélioration pour Skinova.',
    tags: ['Gameplay', 'Design', 'Caisses', 'Discord', 'Acceptée', 'Refusée'],
  },

  { category: 'community', name: 'général', type: ChannelType.GuildText, mode: 'public', topic: 'Discussion générale de la communauté Skinova' },
  { category: 'community', name: 'captures-de-gains', type: ChannelType.GuildText, mode: 'public', topic: 'Partage tes meilleurs drops et Trade Ups' },
  { category: 'community', name: 'discussions-cs2', type: ChannelType.GuildText, mode: 'public', topic: 'Skins, compétitif et actualité Counter-Strike 2' },
  { category: 'community', name: 'hors-sujet', type: ChannelType.GuildText, mode: 'public', topic: 'Discussions en dehors de Skinova et CS2' },

  { category: 'voice', name: 'Général', type: ChannelType.GuildVoice, mode: 'voice' },
  { category: 'voice', name: 'Battles', type: ChannelType.GuildVoice, mode: 'voice' },
  { category: 'voice', name: 'Chill', type: ChannelType.GuildVoice, mode: 'voice' },

  { category: 'staff', name: 'staff', type: ChannelType.GuildText, mode: 'staff', topic: 'Discussion interne de l’équipe Skinova' },
  { category: 'staff', name: 'logs', type: ChannelType.GuildText, mode: 'staff', topic: 'Logs du bot, de la modération et de Skinova' },
  { category: 'staff', name: 'sanctions', type: ChannelType.GuildText, mode: 'staff', topic: 'Suivi des sanctions et recours' },
  { category: 'staff', name: 'développement', type: ChannelType.GuildText, mode: 'staff', topic: 'Développement, déploiements et incidents' },
  { category: 'staff', name: 'idées-en-cours', type: ChannelType.GuildText, mode: 'staff', topic: 'Fonctionnalités et idées en préparation' },
];

function staffRoleIds(roles) {
  return ['founder', 'developer', 'admin', 'moderator', 'support']
    .map((key) => roles[key]?.id)
    .filter(Boolean);
}

function permissionOverwrites(guild, roles, mode) {
  const everyone = guild.roles.everyone.id;
  const staff = staffRoleIds(roles);
  const overwrites = [];

  if (mode === 'staff') {
    overwrites.push({ id: everyone, deny: [PermissionFlagsBits.ViewChannel] });
    for (const id of staff) {
      overwrites.push({
        id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.SendMessagesInThreads,
        ],
      });
    }
    return overwrites;
  }

  if (mode === 'readonly') {
    overwrites.push({
      id: everyone,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
      deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads],
    });
    for (const id of staff) {
      overwrites.push({
        id,
        allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles],
      });
    }
    return overwrites;
  }

  if (mode === 'forum') {
    overwrites.push({
      id: everyone,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.SendMessagesInThreads,
        PermissionFlagsBits.CreatePublicThreads,
      ],
    });
    for (const id of staff) {
      overwrites.push({ id, allow: [PermissionFlagsBits.ManageThreads, PermissionFlagsBits.ManageMessages] });
    }
    return overwrites;
  }

  if (mode === 'voice') {
    return [{
      id: everyone,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    }];
  }

  overwrites.push({
    id: everyone,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.UseApplicationCommands,
    ],
  });
  return overwrites;
}

async function ensureRole(guild, definition, summary) {
  let role = guild.roles.cache.find((candidate) => candidate.name === definition.name);
  if (!role) {
    role = await guild.roles.create({
      name: definition.name,
      color: definition.color,
      hoist: definition.hoist,
      mentionable: false,
      permissions: definition.permissions,
      reason: 'Installation automatique Skinova',
    });
    summary.rolesCreated += 1;
  } else {
    summary.rolesExisting += 1;
    if (role.editable) {
      await role.edit({
        color: definition.color,
        hoist: definition.hoist,
        permissions: definition.permissions,
        reason: 'Synchronisation Skinova',
      }).catch(() => null);
    }
  }
  return role;
}

async function ensureCategory(guild, definition, roles, summary) {
  let category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === definition.name);
  if (!category) {
    category = await guild.channels.create({
      name: definition.name,
      type: ChannelType.GuildCategory,
      position: definition.position,
      permissionOverwrites: definition.staffOnly ? permissionOverwrites(guild, roles, 'staff') : undefined,
      reason: 'Installation automatique Skinova',
    });
    summary.categoriesCreated += 1;
  } else {
    summary.categoriesExisting += 1;
  }
  return category;
}

async function createForumOrFallback(guild, definition, category, overwrites, summary) {
  try {
    return await guild.channels.create({
      name: definition.name,
      type: ChannelType.GuildForum,
      parent: category.id,
      topic: definition.topic,
      availableTags: (definition.tags || []).slice(0, 20).map((name) => ({ name, moderated: false })),
      defaultAutoArchiveDuration: 1440,
      permissionOverwrites: overwrites,
      reason: 'Installation automatique Skinova',
    });
  } catch (error) {
    summary.warnings.push(`Le forum #${definition.name} a été créé comme salon texte (${error.message}).`);
    return guild.channels.create({
      name: definition.name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `${definition.topic} · Active le mode Communauté pour utiliser un vrai forum.`,
      permissionOverwrites: permissionOverwrites(guild, rolesForFallback(overwrites), 'public'),
      reason: 'Fallback Skinova : forum indisponible',
    });
  }
}

// The fallback already receives resolved overwrite objects; returning a role-like map is unnecessary.
function rolesForFallback() {
  return {};
}

async function ensureChannel(guild, definition, category, roles, summary) {
  const sameParent = (channel) => channel.parentId === category.id;
  let channel = guild.channels.cache.find((candidate) => candidate.name === definition.name && sameParent(candidate));
  if (!channel) {
    const overwrites = permissionOverwrites(guild, roles, definition.mode);
    if (definition.type === ChannelType.GuildForum) {
      try {
        channel = await guild.channels.create({
          name: definition.name,
          type: ChannelType.GuildForum,
          parent: category.id,
          topic: definition.topic,
          availableTags: (definition.tags || []).map((name) => ({ name, moderated: false })),
          defaultAutoArchiveDuration: 1440,
          permissionOverwrites: overwrites,
          reason: 'Installation automatique Skinova',
        });
      } catch (error) {
        summary.warnings.push(`Forum #${definition.name} indisponible : création en salon texte.`);
        channel = await guild.channels.create({
          name: definition.name,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: `${definition.topic} · Forum indisponible tant que le mode Communauté n’est pas activé.`,
          permissionOverwrites: permissionOverwrites(guild, roles, 'public'),
          reason: 'Fallback Skinova : forum indisponible',
        });
      }
    } else {
      channel = await guild.channels.create({
        name: definition.name,
        type: definition.type,
        parent: category.id,
        topic: definition.type === ChannelType.GuildText ? definition.topic : undefined,
        permissionOverwrites: overwrites,
        reason: 'Installation automatique Skinova',
      });
    }
    summary.channelsCreated += 1;
  } else {
    summary.channelsExisting += 1;
    if (channel.manageable) {
      await channel.edit({
        parent: category.id,
        topic: 'topic' in channel && definition.topic ? definition.topic : undefined,
        permissionOverwrites: permissionOverwrites(guild, roles, definition.mode),
        reason: 'Synchronisation Skinova',
      }).catch(() => null);
    }
  }
  return channel;
}

function publicUrlButton(publicUrl) {
  if (!publicUrl || !/^https:\/\//i.test(publicUrl)) return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(publicUrl).setLabel('Lancer Skinova').setEmoji('🎮'),
  )];
}

async function hasSeedMessage(channel, marker) {
  if (!channel?.isTextBased?.() || channel.type === ChannelType.GuildForum) return false;
  const messages = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (!messages) return false;
  return messages.some((message) => message.author.bot && message.embeds.some((embed) => embed.footer?.text === `${SETUP_FOOTER} · ${marker}`));
}

async function sendSeedMessage(channel, marker, payload, summary) {
  if (!channel?.isTextBased?.() || channel.type === ChannelType.GuildForum) return;
  if (await hasSeedMessage(channel, marker)) return;
  const embeds = payload.embeds || [];
  for (const embed of embeds) embed.setFooter({ text: `${SETUP_FOOTER} · ${marker}` });
  await channel.send(payload);
  summary.messagesCreated += 1;
}

async function seedChannels(channels, publicUrl, summary) {
  await sendSeedMessage(channels.bienvenue, 'welcome', {
    embeds: [new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle('Bienvenue sur Skinova')
      .setDescription('Ouvre des caisses, améliore tes skins, réalise des Trade Ups, participe aux battles et progresse dans les niveaux.')
      .addFields(
        { name: 'Crédits fictifs', value: 'Aucun dépôt, retrait ou échange contre de l’argent réel.', inline: false },
        { name: 'Pour commencer', value: 'Lis le règlement, récupère ton `/daily`, puis lance Skinova.', inline: false },
      )],
    components: publicUrlButton(publicUrl),
  }, summary);

  await sendSeedMessage(channels.règlement, 'rules', {
    embeds: [new EmbedBuilder()
      .setColor('#f59f00')
      .setTitle('Règlement Skinova')
      .setDescription([
        '1. Respecte les membres et le staff.',
        '2. Aucun spam, harcèlement, contenu illégal ou tentative d’arnaque.',
        '3. Les invitations externes et la publicité nécessitent l’accord du staff.',
        '4. N’exploite pas volontairement un bug : signale-le dans le forum prévu.',
        '5. Skinova utilise uniquement des crédits et objets fictifs.',
        '6. Le staff peut intervenir pour protéger la communauté.',
      ].join('\n\n'))],
  }, summary);

  await sendSeedMessage(channels['faq-skinova'], 'faq', {
    embeds: [new EmbedBuilder()
      .setColor('#ffa94d')
      .setTitle('FAQ Skinova')
      .addFields(
        { name: 'Comment lancer Skinova ?', value: 'Utilise `/skinova` ou le bouton dans le salon #lancer-skinova.' },
        { name: 'Comment gagner des crédits ?', value: 'Avec le bonus `/daily`, les niveaux et les récompenses fictives.' },
        { name: 'Les skins sont-ils retirable ?', value: 'Non. Les crédits et objets sont entièrement fictifs.' },
        { name: 'Comment signaler un problème ?', value: 'Crée un sujet dans #signalement-de-bug avec une capture et les étapes.' },
      )],
  }, summary);

  await sendSeedMessage(channels['lancer-skinova'], 'launch', {
    embeds: [new EmbedBuilder()
      .setColor(BRAND_COLOR)
      .setTitle('Lancer Skinova')
      .setDescription('Ouvre l’Activity pour accéder aux caisses, battles, upgrades, Trade Ups, inventaire et niveaux.')],
    components: publicUrlButton(publicUrl),
  }, summary);

  await sendSeedMessage(channels['commandes-bot'], 'commands', {
    embeds: [new EmbedBuilder()
      .setColor(DARK_COLOR)
      .setTitle('Commandes Skinova')
      .setDescription([
        '`/skinova` — ouvrir l’Activity',
        '`/daily` — récupérer le bonus quotidien',
        '`/profile` — afficher ton profil',
        '`/cases` — voir les caisses actives',
        '`/battle` — créer une battle',
        '`/tradeup` — ouvrir les Trade Ups',
        '`/leaderboard` — voir le classement',
        '`/setup-skinova` — installer/réparer le serveur (administrateurs)',
      ].join('\n'))],
  }, summary);

  await sendSeedMessage(channels.changelog, 'changelog', {
    embeds: [new EmbedBuilder()
      .setColor('#ff6a00')
      .setTitle('Skinova · Changelog')
      .setDescription('Les futures mises à jour seront publiées dans ce salon.')],
  }, summary);

  await sendSeedMessage(channels['statut-du-projet'], 'status', {
    embeds: [new EmbedBuilder()
      .setColor('#51cf66')
      .setTitle('Statut Skinova')
      .setDescription('🟢 Activity : en ligne\n🟢 Bot : en ligne\n🟡 Projet : développement actif')],
  }, summary);

  await sendSeedMessage(channels.classement, 'leaderboard', {
    embeds: [new EmbedBuilder()
      .setColor('#ffd43b')
      .setTitle('Classement Skinova')
      .setDescription('Utilise `/leaderboard` pour afficher le classement XP actuel.')],
  }, summary);
}

export function setupPreviewEmbed(guild) {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTitle('Installer Skinova sur ce serveur ?')
    .setDescription(`La commande va créer ou réparer la structure professionnelle de **${guild.name}**.`)
    .addFields(
      { name: 'Rôles', value: `${ROLE_DEFINITIONS.length} rôles configurés`, inline: true },
      { name: 'Catégories', value: `${CATEGORY_DEFINITIONS.length} catégories`, inline: true },
      { name: 'Salons', value: `${CHANNEL_DEFINITIONS.length} salons et forums`, inline: true },
      { name: 'Sécurité', value: 'La commande est idempotente : la relancer ne duplique pas les éléments existants.', inline: false },
    )
    .setFooter({ text: 'Le bot doit avoir Administrateur ou Manage Roles + Manage Channels.' });
}

export function setupConfirmRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sn_setup_confirm:${userId}`).setLabel('Installer / réparer').setStyle(ButtonStyle.Success).setEmoji('🛠️'),
    new ButtonBuilder().setCustomId(`sn_setup_cancel:${userId}`).setLabel('Annuler').setStyle(ButtonStyle.Secondary),
  );
}

export async function runSkinovaSetup({ guild, member, publicUrl }) {
  if (!guild) throw new Error('Cette commande doit être utilisée dans un serveur Discord.');

  const botMember = await guild.members.fetchMe();
  const required = [
    [PermissionFlagsBits.ManageRoles, 'Gérer les rôles'],
    [PermissionFlagsBits.ManageChannels, 'Gérer les salons'],
    [PermissionFlagsBits.SendMessages, 'Envoyer des messages'],
    [PermissionFlagsBits.EmbedLinks, 'Intégrer des liens'],
    [PermissionFlagsBits.ManageThreads, 'Gérer les fils'],
  ];
  const missing = required.filter(([permission]) => !botMember.permissions.has(permission)).map(([, label]) => label);
  if (missing.length) throw new Error(`Permissions manquantes pour le bot : ${missing.join(', ')}.`);

  const summary = {
    rolesCreated: 0,
    rolesExisting: 0,
    categoriesCreated: 0,
    categoriesExisting: 0,
    channelsCreated: 0,
    channelsExisting: 0,
    messagesCreated: 0,
    warnings: [],
  };

  await guild.roles.fetch();
  await guild.channels.fetch();

  const roles = {};
  for (const definition of ROLE_DEFINITIONS) {
    roles[definition.key] = await ensureRole(guild, definition, summary);
  }

  if (member?.roles && roles.founder?.editable) {
    await member.roles.add(roles.founder, 'Administrateur ayant installé Skinova').catch(() => {
      summary.warnings.push('Impossible d’attribuer le rôle Fondateur : place le rôle du bot plus haut.');
    });
  }
  if (roles.bots?.editable) {
    await botMember.roles.add(roles.bots, 'Rôle Bots Skinova').catch(() => null);
  }

  const categories = {};
  for (const definition of CATEGORY_DEFINITIONS) {
    categories[definition.key] = await ensureCategory(guild, definition, roles, summary);
  }

  const channels = {};
  for (const definition of CHANNEL_DEFINITIONS) {
    channels[definition.name] = await ensureChannel(guild, definition, categories[definition.category], roles, summary);
  }

  await seedChannels(channels, publicUrl, summary);

  const logChannel = channels.logs;
  if (logChannel?.isTextBased?.()) {
    await logChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setTitle('Installation Skinova terminée')
        .setDescription(`Lancée par ${member || 'un administrateur'}.`)
        .addFields(
          { name: 'Rôles créés', value: String(summary.rolesCreated), inline: true },
          { name: 'Salons créés', value: String(summary.channelsCreated + summary.categoriesCreated), inline: true },
          { name: 'Messages publiés', value: String(summary.messagesCreated), inline: true },
        )
        .setTimestamp()],
    }).catch(() => null);
  }

  return summary;
}

export function setupResultEmbed(summary) {
  const embed = new EmbedBuilder()
    .setColor('#51cf66')
    .setTitle('✅ Serveur Skinova configuré')
    .setDescription('La structure a été créée ou réparée avec succès.')
    .addFields(
      { name: 'Rôles', value: `${summary.rolesCreated} créé(s) · ${summary.rolesExisting} existant(s)`, inline: true },
      { name: 'Catégories', value: `${summary.categoriesCreated} créée(s) · ${summary.categoriesExisting} existante(s)`, inline: true },
      { name: 'Salons', value: `${summary.channelsCreated} créé(s) · ${summary.channelsExisting} existant(s)`, inline: true },
      { name: 'Messages', value: `${summary.messagesCreated} message(s) publié(s)`, inline: true },
      { name: 'À faire manuellement', value: 'Active **Communauté**, configure **Onboarding** et règle **AutoMod** dans les paramètres du serveur.', inline: false },
    );
  if (summary.warnings.length) embed.addFields({ name: 'Avertissements', value: summary.warnings.slice(0, 6).join('\n'), inline: false });
  return embed;
}
