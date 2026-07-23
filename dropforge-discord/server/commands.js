import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const commandData = [
  new SlashCommandBuilder().setName('dropforge').setDescription('Ouvrir DropForge Activity'),
  new SlashCommandBuilder().setName('daily').setDescription('Récupérer les crédits fictifs quotidiens'),
  new SlashCommandBuilder().setName('profile').setDescription('Afficher ton profil DropForge'),
  new SlashCommandBuilder().setName('cases').setDescription('Afficher les caisses actives'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Afficher le classement DropForge'),
  new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Créer une battle de caisses')
    .addStringOption((o) => o.setName('caisse').setDescription('Identifiant de la caisse').setRequired(true)
      .addChoices(
        { name: 'Confirmed Vault', value: 'confirmed-vault' },
        { name: 'AK Legends', value: 'ak-legends' },
        { name: 'Sniper Ritual', value: 'sniper-ritual' },
        { name: 'Budget Frenzy', value: 'budget-frenzy' },
        { name: 'Knife Protocol', value: 'knife-protocol' },
        { name: 'Royal Overdrive', value: 'royal-overdrive' },
      ))
    .addIntegerOption((o) => o.setName('manches').setDescription('Nombre de manches').setRequired(true)
      .addChoices({ name: '1', value: 1 }, { name: '3', value: 3 }, { name: '5', value: 5 }))
    .addIntegerOption((o) => o.setName('joueurs').setDescription('Nombre de joueurs').setRequired(true)
      .addChoices({ name: '2', value: 2 }, { name: '3', value: 3 }, { name: '4', value: 4 })),
  new SlashCommandBuilder()
    .setName('admin-credit')
    .setDescription('Modifier le solde fictif d’un membre')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName('membre').setDescription('Membre Discord').setRequired(true))
    .addIntegerOption((o) => o.setName('montant').setDescription('Crédits à ajouter ou retirer').setRequired(true)),
].map((command) => command.toJSON());
