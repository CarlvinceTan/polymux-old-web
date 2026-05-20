# Installation

Vous pouvez utiliser Polymux entièrement dans le navigateur — aucune installation requise. Les applications natives et une extension de navigateur ajoutent des capacités supplémentaires, comme piloter votre propre navigateur local plutôt qu'un navigateur hébergé.

## Application web

L'application web sur [polymux.com](https://polymux.com) est toujours la dernière version. Toute version récente de Chromium, Firefox ou Safari fonctionne. Rien à installer ; connectez-vous et votre espace de travail, vos sessions et vos workflows sont immédiatement disponibles.

## Extension de navigateur

L'extension permet à une session Polymux de piloter un onglet de **votre navigateur local** au lieu du Chromium hébergé sur le serveur. Elle est utile lorsque vous avez besoin :

- D'un site qui utilise vos cookies de connexion existants.
- D'un accès à un réseau privé que le navigateur hébergé ne peut atteindre.
- D'un profil de navigateur, d'une liste d'extensions ou d'une empreinte d'appareil spécifique.

Pour l'installer, ouvrez la [page d'installation](/install-apps) et choisissez votre navigateur. Quand l'extension demande à s'appairer, connectez-vous à Polymux dans n'importe quel onglet — l'appairage se fait automatiquement et la fenêtre contextuelle affiche _Connecté_.

L'extension est entièrement passive tant qu'elle est connectée : elle n'agit que lorsqu'une session Polymux est en `?mode=extension`. Vous pouvez la révoquer à tout moment depuis la fenêtre contextuelle.

## Applications de bureau

Les applications natives pour macOS, Windows et Linux offrent l'expérience Polymux complète sans onglet de navigateur. Elles sont actuellement en bêta privée. Inscrivez-vous sur la [page d'installation](/install-apps) pour être notifié quand des builds seront disponibles pour votre plateforme.

Les applications de bureau ne sont pas requises — toutes les fonctionnalités présentées dans cette documentation fonctionnent dans l'application web.

## Applications mobiles

Les applications iOS et Android sont sur la feuille de route. Pour l'instant, l'application web est responsive et fonctionne sur les navigateurs mobiles, mais les vues en direct s'affichent au mieux sur ordinateur.

## Configuration système requise

| Surface | Exigence |
| --- | --- |
| Application web | Tout navigateur sorti au cours des 24 derniers mois |
| Extension | Chrome, Edge, Brave ou tout Chromium 119+ |
| Bureau | macOS 13+, Windows 10+ ou toute distribution Linux des 3 dernières années |
| Réseau | Sortie WebRTC et WebSocket sur les ports 443 / 8080 |

Si votre réseau bloque WebRTC, la vue en direct bascule vers un flux de polling plus lent. Tout le reste continue de fonctionner.

## Étapes suivantes

- Nouveau sur Polymux ? Continuez avec le [Démarrage rapide](/documentation/quickstart).
- Vous configurez une équipe ? Lisez [Espaces de travail et membres](/documentation/workspaces).
- Besoin de vérifier un téléchargement ? Voir [Mises à jour et vérification](/documentation/faq#verifying-downloads) dans la FAQ.
