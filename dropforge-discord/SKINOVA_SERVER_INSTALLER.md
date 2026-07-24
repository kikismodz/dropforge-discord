# Skinova Server Installer

## Commande

Après déploiement et réenregistrement des commandes :

```text
/setup-skinova
```

La commande demande confirmation puis crée/répare :

- 10 rôles ;
- 6 catégories ;
- 27 salons, forums et vocaux ;
- les permissions publiques, lecture seule et staff ;
- les messages Bienvenue, Règlement, FAQ, Lancement, Commandes et Statut.

## Permissions du bot

Le plus simple est de donner temporairement **Administrateur** au bot pendant l’installation.
Sinon, il lui faut au minimum :

- Gérer les rôles ;
- Gérer les salons ;
- Envoyer des messages ;
- Intégrer des liens ;
- Gérer les fils.

Place le rôle du bot au-dessus des rôles Skinova pour qu’il puisse les gérer.

## Après installation

Dans Discord, active manuellement :

1. Communauté ;
2. Onboarding / Guide du serveur ;
3. AutoMod ;
4. les règles de vérification souhaitées.

La commande est idempotente : tu peux la relancer pour réparer les éléments manquants sans dupliquer la structure.
