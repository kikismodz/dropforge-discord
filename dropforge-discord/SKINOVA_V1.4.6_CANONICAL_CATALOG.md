# Skinova V1.4.6 — Catalogue canonique

Cette version remplace le mapping approximatif par un catalogue par ID de drop.

Au démarrage :

1. `scripts/sync-drop-catalog.mjs` récupère `skins.json` depuis CSGO-API.
2. Les correspondances exactes utilisent `weapon.name` et `pattern.name`.
3. Une combinaison inexistante est remplacée de façon déterministe par un vrai skin du même modèle d'arme, avec une rareté aussi proche que possible.
4. `server/drop-catalog.json` est écrit avant le lancement du serveur.
5. Les caisses, inventaires, historiques et battles existants sont migrés par ID de drop.
6. Si l'API est indisponible, le dernier catalogue local reste utilisé et le serveur démarre quand même.

Logs attendus :

```text
[Skinova catalogue] 360/360 drops valides · X exacts · Y remplacés · 0 non résolus.
[Skinova images] 360/360 images canoniques associées.
```

Le rapport détaillé est écrit dans `Skinova-catalog-sync-report.txt`.
