import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
} from 'discord.js';
import { getState, getUser, publicUser, save, upsertDiscordUser } from './store.js';
import { claimDaily, createBattle, findCase, joinBattle, startBattle } from './game.js';
import { runSkinovaSetup, setupConfirmRow, setupPreviewEmbed, setupResultEmbed } from './setup.js';

function discordProfile(user) {
  return {
    id: user.id,
    username: user.username,
    global_name: user.globalName,
    avatarUrl: user.displayAvatarURL({ size: 128 }),
  };
}

function battleEmbed(battle) {
  const c = findCase(battle.caseId);
  const names = battle.players.map((p, index) => `${index + 1}. ${p.username}${p.bot ? ' 🤖' : ''}`).join('\n');
  return new EmbedBuilder()
    .setColor(c?.accent || '#ff3d8d')
    .setTitle(`⚔️ Battle · ${c?.name || battle.caseId}`)
    .setDescription(`${battle.rounds} manche(s) · ${battle.players.length}/${battle.slots} joueurs\n\n${names}`)
    .setFooter({ text: battle.status === 'waiting' ? 'En attente de joueurs' : 'Battle terminée' });
}

function battleButtons(battle, publicUrl) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`df_join:${battle.id}`).setLabel('Rejoindre').setStyle(ButtonStyle.Success).setDisabled(battle.status !== 'waiting' || battle.players.length >= battle.slots),
    new ButtonBuilder().setCustomId(`df_start:${battle.id}`).setLabel('Lancer').setStyle(ButtonStyle.Danger).setDisabled(battle.status !== 'waiting'),
  );
  if (publicUrl) row.addComponents(new ButtonBuilder().setLabel('Ouvrir l’Activity').setStyle(ButtonStyle.Link).setURL(publicUrl));
  return [row];
}

export async function startDiscordBot({ token, publicUrl, io }) {
  if (!token) return null;
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (ready) => {
    console.log(`[Discord] Bot connecté : ${ready.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const user = upsertDiscordUser(discordProfile(interaction.user));
        if (interaction.commandName === 'setup-skinova') {
          if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            throw new Error('Permission Administrateur requise.');
          }
          await interaction.reply({
            embeds: [setupPreviewEmbed(interaction.guild)],
            components: [setupConfirmRow(interaction.user.id)],
            ephemeral: true,
          });
          return;
        }
        if (interaction.commandName === 'skinova') {
          const embed = new EmbedBuilder()
            .setColor('#ff3d8d')
            .setTitle('SKINOVA — Discord Activity')
            .setDescription('Ouvre les caisses, monte de niveau, réalise des Trade Ups et participe aux battles avec des crédits entièrement fictifs.')
            .addFields(
              { name: 'Solde', value: `${user.balance.toFixed(2)} CR`, inline: true },
              { name: 'Inventaire', value: `${user.inventory.length} objet(s)`, inline: true },
              { name: 'Niveau', value: `${publicUser(user).level} · ${publicUser(user).rank}`, inline: true },
            );
          const components = publicUrl ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Lancer Skinova').setStyle(ButtonStyle.Link).setURL(publicUrl))] : [];
          await interaction.reply({ embeds: [embed], components, ephemeral: true });
          return;
        }
        if (interaction.commandName === 'daily') {
          const result = claimDaily(user.id);
          await interaction.reply({ content: `🎁 +${result.amount} CR fictifs et +${result.xp?.gained || 0} XP. Niveau **${result.progression?.level || publicUser(user).level}**.`, ephemeral: true });
          return;
        }
        if (interaction.commandName === 'profile') {
          const p = publicUser(user);
          const profileEmbed = new EmbedBuilder().setColor('#8d55ff').setTitle(`Profil · ${p.username}`).addFields(
            { name: 'Solde', value: `${p.balance.toFixed(2)} CR`, inline: true },
            { name: 'Inventaire', value: `${p.inventoryCount}`, inline: true },
            { name: 'Battles gagnées', value: `${p.stats.battleWins || 0}/${p.stats.battles || 0}`, inline: true },
            { name: 'Niveau', value: `${p.level} · ${p.rank}`, inline: true },
            { name: 'XP', value: `${p.xp}`, inline: true },
            { name: 'Trade Ups', value: `${p.stats.tradeUps || 0}`, inline: true },
          );
          if (p.avatar) profileEmbed.setThumbnail(p.avatar);
          await interaction.reply({ embeds: [profileEmbed], ephemeral: true });
          return;
        }
        if (interaction.commandName === 'tradeup') {
          const url = publicUrl ? `${publicUrl.replace(/\/$/, '')}/?screen=tradeup` : '';
          const components = url ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ouvrir le Trade Up').setStyle(ButtonStyle.Link).setURL(url))] : [];
          await interaction.reply({ content: '⇧ Sélectionne 10 objets de même rareté dans le Trade Up Skinova.', components, ephemeral: true });
          return;
        }
        if (interaction.commandName === 'cases') {
          const lines = getState().cases.filter((c) => c.active !== false).map((c) => `• **${c.name}** — ${c.price.toFixed(2)} CR`).join('\n');
          await interaction.reply({ embeds: [new EmbedBuilder().setColor('#35e7ff').setTitle('Caisses disponibles').setDescription(lines)], ephemeral: true });
          return;
        }
        if (interaction.commandName === 'leaderboard') {
          const users = [...getState().users].filter((u) => !u.banned).sort((a, b) => (Number(b.xp)||0) - (Number(a.xp)||0) || b.balance - a.balance).slice(0, 10);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor('#ffc447').setTitle('🏆 Classement Skinova').setDescription(users.map((u, i) => `**${i + 1}. ${u.username}** — Niv. ${publicUser(u).level} · ${publicUser(u).xp} XP`).join('\n'))] });
          return;
        }
        if (interaction.commandName === 'battle') {
          const battle = createBattle(user.id, interaction.options.getString('caisse'), interaction.options.getInteger('manches'), interaction.options.getInteger('joueurs'));
          await interaction.reply({ embeds: [battleEmbed(battle)], components: battleButtons(battle, publicUrl) });
          io?.emit('battle:update', battle);
          return;
        }
        if (interaction.commandName === 'admin-credit') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) throw new Error('Permission administrateur requise');
          const targetDiscord = interaction.options.getUser('membre');
          const amount = interaction.options.getInteger('montant');
          const target = upsertDiscordUser(discordProfile(targetDiscord));
          target.balance = Math.max(0, target.balance + amount);
          save();
          await interaction.reply({ content: `Solde de **${target.username}** : ${target.balance.toFixed(2)} CR`, ephemeral: true });
        }
      }

      if (interaction.isButton() && interaction.customId.startsWith('sn_setup_')) {
        const [, ownerId] = interaction.customId.split(':');
        if (interaction.user.id !== ownerId) {
          await interaction.reply({ content: 'Seul l’administrateur ayant lancé la commande peut confirmer.', ephemeral: true });
          return;
        }
        if (interaction.customId.startsWith('sn_setup_cancel')) {
          await interaction.update({ content: 'Installation annulée.', embeds: [], components: [] });
          return;
        }
        await interaction.update({ content: '⏳ Installation de la structure Skinova…', embeds: [], components: [] });
        const setupMember = await interaction.guild.members.fetch(interaction.user.id);
        const summary = await runSkinovaSetup({
          guild: interaction.guild,
          member: setupMember,
          publicUrl,
        });
        await interaction.editReply({ content: '', embeds: [setupResultEmbed(summary)], components: [] });
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith('df_')) {
        const user = upsertDiscordUser(discordProfile(interaction.user));
        const [action, battleId] = interaction.customId.split(':');
        let battle;
        if (action === 'df_join') battle = joinBattle(user.id, battleId);
        if (action === 'df_start') battle = startBattle(user.id, battleId, true);
        await interaction.update({ embeds: [battleEmbed(battle)], components: battleButtons(battle, publicUrl) });
        io?.emit('battle:update', battle);
      }
    } catch (error) {
      const payload = { content: `⚠️ ${error.message || 'Erreur'}`, ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    }
  });

  await client.login(token);
  return client;
}
