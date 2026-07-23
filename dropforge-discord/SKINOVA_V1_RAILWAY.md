# Mettre Skinova V1 sur Railway

1. Décompresse `skinova-v1-ultra-patch.zip`.
2. Envoie son contenu à la racine du dépôt GitHub actuel.
3. Accepte le remplacement des fichiers et commit.
4. Attends le statut **Active** dans Railway.
5. Garde :
   - Build Command : `npm run build`
   - Start Command : `npm start`
6. Ferme puis relance l’Activity Discord.

Le patch ne contient pas `data/db.json` : les comptes, soldes, caisses et historiques du serveur ne sont pas écrasés.

La commande principale devient `/skinova`. Après le déploiement, exécute une fois `npm run register` si Discord affiche encore `/dropforge`.
