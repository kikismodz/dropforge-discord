# Skinova V1.4.3 — visuels sans risque pour le build

- Le build reste `vite build`.
- Le catalogue d'images est récupéré au démarrage du serveur.
- Aucun téléchargement d'image ne peut faire échouer le build Railway.
- En cas de panne externe, Skinova démarre avec les visuels génériques ou le manifest déjà présent.
- Les images personnalisées ajoutées dans Skinova Control sont conservées.

Dans les logs Railway, rechercher :

```
[Skinova images] ... visuels associés au démarrage.
```
