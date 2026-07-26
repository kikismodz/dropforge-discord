# Installation Skinova V1.4.6

## Railway

Conserver :

```text
Build Command : npm run build
Start Command : npm start
```

`npm start` exécute désormais :

```text
node scripts/sync-drop-catalog.mjs && node server/index.js
```

Le synchroniseur :

- lit les champs structurés `weapon.name` et `pattern.name` du catalogue CSGO-API ;
- conserve les correspondances exactes ;
- remplace toute combinaison invalide par un vrai skin du même modèle d'arme ;
- écrit un catalogue local par ID de drop ;
- associe l'image exacte du skin sélectionné ;
- conserve le dernier catalogue local si l'API est indisponible ;
- migre les caisses, inventaires, historiques et battles grâce aux IDs de drops.

## Logs attendus

```text
[Skinova catalogue] 360/360 drops valides · ... · 0 non résolus.
[Skinova images] 360/360 images canoniques associées.
Skinova Discord disponible sur http://localhost:3000
```

Le nombre de correspondances exactes dépend des anciens noms présents dans la base. Les autres sont remplacés par des combinaisons réelles et stables.

## Rapport

Le détail est écrit dans :

```text
Skinova-catalog-sync-report.txt
```

## Données utilisateur

Le patch ne doit pas contenir `data/db.json`. Les données existantes sont migrées au démarrage.
