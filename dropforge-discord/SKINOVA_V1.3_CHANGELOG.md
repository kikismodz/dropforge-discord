# Skinova V1.3 — Trade Up & progression

## Trade Up

- Nouvel écran Trade Up dans la navigation.
- Sélection de 10 objets de même rareté.
- Les objets doivent tous être StatTrak ou tous être standards.
- Résultat de la rareté immédiatement supérieure.
- État du résultat dérivé de l'usure moyenne des 10 objets, avec variation Provably Fair.
- Tirage HMAC-SHA256 vérifiable dans le centre Provably Fair.
- Historique complet du contrat, des objets sacrifiés et du résultat.
- Accès direct depuis chaque objet de l'inventaire.
- Commande Discord `/tradeup`.

## Niveaux, XP et rangs

- XP persistante par joueur.
- Niveaux 1 à 100.
- Rangs : Recrue, Opérateur, Élite, Maître, Légende, Mythique et Nova.
- XP gagnée sur les ouvertures, battles, upgrades, Trade Ups et bonus quotidien.
- Récompense fictive en crédits à chaque montée de niveau.
- Barre de progression dans la sidebar et le profil.
- Classement désormais ordonné par XP.
- Niveau et XP visibles dans le bot Discord.

## Administration

- Modification de l'XP d'un joueur depuis Skinova Control.
- Réglages distincts pour l'XP de chaque activité.
- Niveau moyen affiché dans les KPI administrateur.

## Compatibilité

- Migration automatique des comptes V1.2.
- Les 30 caisses et leurs 360 drops sont conservés.
- Le patch Railway n'inclut pas `data/db.json`.
