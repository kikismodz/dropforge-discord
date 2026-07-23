# Checklist Discord Developer Portal

## Application

- Créer l'application et noter son **Application ID**.
- Créer le bot et noter son token.
- Définir une politique de confidentialité et des conditions d'utilisation avant une distribution publique.

## OAuth2

Scopes utilisés par l'Activity :

```text
identify
applications.commands
```

Le serveur échange le code reçu contre un access token puis appelle `/users/@me`.

## Activity

- Activer l'Embedded App / Activity.
- Définir l'URL publique HTTPS de l'Activity.
- Configurer les URL Mappings pour l'API et Socket.IO.
- Utiliser un domaine avec certificat TLS valide.
- Tester desktop, web Discord, Android et iOS.

## Bot

Permissions minimales recommandées :

- Use Application Commands
- Send Messages
- Embed Links
- Read Message History

La commande `/admin-credit` demande la permission Administrateur.

## Déploiement conseillé

```text
Discord Activity
      ↓ HTTPS / WebSocket
API Node.js
      ↓
PostgreSQL
      ↓
Bot Discord
```

Place l'API derrière un reverse proxy tel que Nginx, Caddy ou un service cloud prenant en charge les WebSockets.

## Sécurité avant publication

- remplacer le stockage JSON ;
- utiliser des transactions de base de données ;
- vérifier les rôles administrateurs côté serveur ;
- limiter le débit des ouvertures et commandes ;
- journaliser chaque modification de solde ;
- ne jamais exposer `DISCORD_CLIENT_SECRET` ni `DISCORD_TOKEN` au frontend ;
- utiliser un gestionnaire de secrets ;
- sauvegarder régulièrement la base ;
- conserver uniquement des crédits fictifs non convertibles.
