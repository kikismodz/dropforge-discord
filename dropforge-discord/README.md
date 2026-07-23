# DropForge Discord — correctif clics v1.0.1

Cette version corrige les boutons bloqués dans les fenêtres : ouverture de caisse, création de battle, changement de profil et formulaires administrateur.

# DropForge Discord Activity — démo complète

Cette archive transforme la base DropForge en une expérience Discord :

- **Discord Activity** visuelle utilisable dans un salon ;
- bot avec commandes slash ;
- comptes liés aux utilisateurs Discord ;
- caisses, ouvertures x1/x3/x5/x10 et roulettes superposées ;
- inventaire et revente à 100 % ;
- upgrade animé ;
- battles à 2, 3 ou 4 joueurs ;
- historique, statistiques et classement du serveur ;
- panel administrateur pour gérer les caisses, utilisateurs, soldes et réglages ;
- crédits entièrement fictifs, sans dépôt ni retrait.

## Aperçu local immédiat — sans compte Discord

Prérequis : **Node.js 20 ou plus récent**.

```bash
node demo-server.mjs
```

Ouvre ensuite :

```text
http://localhost:3000
```

Le profil **NOVA** est utilisé par défaut. Clique sur le profil en haut à droite pour passer sur **ForgeMaster**, le compte administrateur de démonstration.

Le serveur local ne dépend d'aucun paquet npm : il utilise uniquement les modules intégrés de Node.js et le dossier `dist/` déjà compilé.

## Structure

```text
client/                   Frontend de l'Activity, prévu pour Vite
client/src/main.js        Interface et intégration Discord Embedded App SDK
client/src/style.css      Design responsive desktop/mobile
server/index.js           API, OAuth Discord, sessions et Socket.IO
server/bot.js             Bot et gestion des interactions Discord
server/game.js            Ouvertures, variantes, upgrade et battles
server/store.js           Stockage JSON de démonstration
scripts/register-commands.js
                          Enregistrement des commandes slash
demo-server.mjs           Aperçu local sans dépendances
 dist/                    Version locale directement exécutable
data/db.json              Données persistantes de démonstration
```

## Connexion à une vraie application Discord

### 1. Créer l'application

Dans le Discord Developer Portal :

1. crée une application ;
2. ajoute un bot ;
3. active la partie **Activities / Embedded App** ;
4. configure une URL HTTPS publique ;
5. ajoute les URL Mappings demandés par Discord ;
6. copie l'identifiant de l'application, le secret OAuth et le token du bot.

### 2. Configurer le projet

```bash
cp .env.example .env
```

Renseigne au minimum :

```env
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_TOKEN=...
DISCORD_GUILD_ID=...
PUBLIC_URL=https://ton-domaine.example
ACTIVITY_URL=https://ton-domaine.example
SESSION_SECRET=une-cle-longue-et-aleatoire
```

Pour l'administration :

```env
ADMIN_USER_IDS=123456789012345678,987654321098765432
ADMIN_ROLE_ID=123456789012345678
```

`ADMIN_USER_IDS` accepte plusieurs identifiants séparés par des virgules. `ADMIN_ROLE_ID` permet aussi de contrôler l'accès grâce à un rôle du serveur, à condition que le bot soit présent dans le serveur.

### 3. Installer et compiler

```bash
npm install
npm run build
npm run register
npm start
```

Commandes utiles :

```bash
npm run dev       # frontend Vite + backend en développement
npm run build     # compile l'Activity
npm run register  # enregistre les commandes slash
npm start         # lance API + bot + Activity compilée
```

## Commandes Discord incluses

```text
/dropforge
/daily
/profile
/cases
/leaderboard
/battle caisse:<...> manches:<1|3|5> joueurs:<2|3|4>
/admin-credit membre:<...> montant:<...>
```

Les boutons des messages permettent de rejoindre et de lancer une battle. Le lien vers l'Activity utilise `ACTIVITY_URL`.

## Fonctionnement de l'authentification

Dans Discord, le frontend utilise le **Discord Embedded App SDK** pour :

1. attendre l'initialisation de l'Activity ;
2. demander l'autorisation `identify` et `applications.commands` ;
3. transmettre le code OAuth au serveur ;
4. authentifier l'utilisateur ;
5. créer ou retrouver son compte DropForge grâce à son identifiant Discord.

L'avatar et le pseudo Discord sont mis à jour à chaque reconnexion. Les soldes, inventaires, historiques et statistiques sont stockés côté serveur.

## Panel administrateur

Le panel permet actuellement de :

- consulter les métriques générales ;
- créer et modifier des caisses ;
- afficher ou masquer une caisse ;
- gérer les prix, images et listes de gains ;
- modifier les soldes utilisateurs ;
- bannir et réactiver un compte ;
- modifier le bonus quotidien et la durée des animations ;
- consulter le journal d'audit ;
- réinitialiser les données de démonstration.

Le stockage fourni est un fichier JSON pratique pour tester. Pour un déploiement public, remplace `server/store.js` par PostgreSQL ou une autre base centralisée, puis ajoute des transactions atomiques pour les soldes et inventaires.

## URL Mappings de l'Activity

Discord exécute une Activity dans un environnement proxy. Dans le Developer Portal, mappe ton domaine public vers les chemins utilisés par l'application. Les appels du frontend utilisent automatiquement :

```text
/.proxy/api
/.proxy/socket.io
```

quand l'Activity détecte les paramètres Discord (`frame_id` ou `instance_id`).

## Limites de cette démonstration

- aucune transaction financière ;
- aucun retrait ou échange de skin ;
- illustrations originales et non fichiers officiels de CS2 ;
- stockage JSON adapté à une démo, pas à une forte charge ;
- le bot réel nécessite tes identifiants Discord et un hébergement HTTPS public ;
- le lancement dans Discord doit être finalisé dans ton Developer Portal.

## Réinitialiser l'aperçu local

Depuis le panel admin, utilise **Réinitialiser la démo**, ou supprime :

```text
data/db.json
```

puis redémarre `demo-server.mjs`.
