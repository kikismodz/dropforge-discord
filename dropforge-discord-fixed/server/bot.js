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
        if (interaction.commandName === 'dropforge') {
          const embed = new EmbedBuilder()
            .setColor('#ff3d8d')
            .setTitle('DROP⟡FORGE — Discord Activity')
            .setDescription('Ouvre les caisses, participe aux battles et retrouve ton inventaire avec des crédits entièrement fictifs.')
            .addFields(
              { name: 'Solde', value: `${user.balance.toFixed(2)} CR`, inline: true },
              { name: 'Inventaire', value: `${user.inventory.length} objet(s)`, inline: true },
            );
          const components = publicUrl ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Lancer DropForge').setStyle(ButtonStyle.Link).setURL(publicUrl))] : [];
          await interaction.reply({ embeds: [embed], components, ephemeral: true });
          return;
        }
        if (interaction.commandName === 'daily') {
          const result = claimDaily(user.id);
          await interaction.reply({ content: `🎁 +${result.amount} CR fictifs. Nouveau solde : **${result.balance.toFixed(2)} CR**`, ephemeral: true });
          return;
        }
        if (interaction.commandName === 'profile') {
          const p = publicUser(user);
          const profileEmbed = new EmbedBuilder().setColor('#8d55ff').setTitle(`Profil · ${p.username}`).addFields(
            { name: 'Solde', value: `${p.balance.toFixed(2)} CR`, inline: true },
            { name: 'Inventaire', value: `${p.inventoryCount}`, inline: true },
            { name: 'Battles gagnées', value: `${p.stats.battleWins || 0}/${p.stats.battles || 0}`, inline: true },
          );
          if (p.avatar) profileEmbed.setThumbnail(p.avatar);
          await interaction.reply({ embeds: [profileEmbed], ephemeral: true });
          return;
        }
        if (interaction.commandName === 'cases') {
          const lines = getState().cases.filter((c) => c.active !== false).map((c) => `• **${c.name}** — ${c.price.toFixed(2)} CR`).join('\n');
          await interaction.reply({ embeds: [new EmbedBuilder().setColor('#35e7ff').setTitle('Caisses disponibles').setDescription(lines)], ephemeral: true });
          return;
        }
        if (interaction.commandName === 'leaderboard') {
          const users = [...getState().users].filter((u) => !u.banned).sort((a, b) => b.balance - a.balance).slice(0, 10);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor('#ffc447').setTitle('🏆 Classement DropForge').setDescription(users.map((u, i) => `**${i + 1}. ${u.username}** — ${u.balance.toFixed(2)} CR`).join('\n'))] });
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
