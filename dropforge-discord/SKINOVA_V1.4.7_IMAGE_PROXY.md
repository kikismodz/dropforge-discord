# Skinova V1.4.7 — Proxy images local

Les images CS2 sont maintenant chargées via `/api/skin-image/:dropId`.
Le serveur Railway télécharge l’image distante une seule fois et la met en cache dans `/tmp/skinova-skin-cache`.
Discord ne contacte donc plus directement les hébergeurs externes. En cas d’échec, un visuel générique local est renvoyé sans icône cassée.
