# Skinova V1.4.4 — mapping images + installateur Discord

## Mapping des images

Le script `scripts/sync-skin-manifest.mjs` utilise plusieurs niveaux :

1. correspondance exacte arme + finition ;
2. alias pour MAC-10, UMP-45, Galil AR, couteaux, gants et Doppler ;
3. correspondance approchée sur la même arme ;
4. image de secours stable provenant du même modèle d'arme.

L'application démarre même si le catalogue distant est indisponible.

## Bot Discord

Après le déploiement, exécuter une fois :

```bash
npm run register
```

Puis dans Discord :

```text
/setup-skinova
```

La commande crée ou répare les rôles, catégories, salons, forums, messages et permissions.
Le bot essaie aussi d'utiliser le surnom `Skinova` sur le serveur et affiche `Skinova · /skinova` comme activité.

## Railway

```text
Build Command : npm run build
Start Command : npm start
```
