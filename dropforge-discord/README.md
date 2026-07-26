# Skinova Discord V1.4.6

Version Skinova avec 30 caisses, Trade Up Provably Fair, niveaux, XP, rangs et récompenses fictives.

## Catalogue canonique V1.4.6

Les drops sont synchronisés par ID avec le catalogue structuré CSGO-API. Toute combinaison arme/finition invalide est remplacée par un skin réel du même modèle, puis les anciennes données sont migrées automatiquement. Voir `SKINOVA_V1.4.6_INSTALL.md`.

## Catalogue réel V1.4

Les noms générés ont été remplacés par des combinaisons arme/finition existantes dans Counter-Strike 2. Les valeurs, probabilités, états, StatTrak, niveaux et Trade Ups restent inchangés.

## Nouveautés V1.3

- Trade Up de 10 objets de même rareté et type StatTrak.
- Résultat de rareté supérieure avec état calculé depuis l’usure moyenne.
- Niveaux 1 à 100 et sept rangs visuels.
- XP pour les ouvertures, battles, upgrades, Trade Ups et daily.
- Classement par progression et gestion XP dans le panel admin.
- Commande Discord `/tradeup`.

# Skinova Discord V1

Refonte complète noire/orange de l’Activity Discord, basée sur les mécaniques stables de la V7.1. Les crédits sont entièrement fictifs.

## Fonctionnalités

- accueil Skinova avec caisse vedette, derniers drops et meilleurs gains ;
- caisses x1, x3, x5 et x10 ;
- inventaire et revente à 100 % ;
- battles jusqu’à 4 joueurs ;
- upgrade avec zone WIN proportionnelle ;
- Provably Fair vérifiable ;
- historique et classement ;
- Skinova Control : caisses, drops, usures, StatTrak, joueurs, soldes, rôles, réglages et audit.

## Railway

Build Command : `npm run build`

Start Command : `npm start`

Le patch de mise à jour ne contient pas `data/db.json`, afin de conserver les comptes et soldes existants.
