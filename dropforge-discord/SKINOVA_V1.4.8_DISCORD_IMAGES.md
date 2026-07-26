# Skinova V1.4.8 — Discord image path fix

Le catalogue et le proxy d'images V1.4.7 fonctionnaient côté serveur, mais les balises `<img>` utilisaient `/api/skin-image/...` dans l'Activity. Discord exige `/.proxy/api/skin-image/...` pour ces requêtes.

La V1.4.8 installe un observateur client qui corrige automatiquement toutes les images présentes et futures (caisses, roulette, inventaire, battles, upgrade, Trade Up et historique). Aucune donnée utilisateur n'est modifiée.
