# Vue d'ensemble de l'API

Polymux expose une API REST + WebSocket pour l'accès programmatique aux espaces de travail, aux workflows et aux sessions. Tout ce que vous pouvez faire dans le tableau de bord, vous pouvez aussi le faire via l'API — créer des sessions, exécuter des workflows, lire des messages, installer des plugins.

Cette page est l'index. L'authentification, les formes individuelles des endpoints et les limites de débit se trouvent sur des pages dédiées liées en bas.

## URL de base

```
https://api.polymux.co
```

L'application web sur `polymux.com` est une origine distincte. Elle appelle la même API en coulisses ; vous pouvez utiliser celle qui vous semble la plus naturelle.

## Authentification

Chaque endpoint authentifié accepte un jeton bearer dans l'en-tête `Authorization` :

```
Authorization: Bearer <token>
```

Les jetons sont émis depuis **Paramètres → API → Jetons** dans le tableau de bord. Ils sont limités à un espace de travail et ont l'un des trois rôles :

| Scope | Capacités |
| --- | --- |
| `read` | Uniquement les endpoints de listing et de lecture. |
| `write` | Lecture + création/mise à jour/suppression sur les ressources de l'espace de travail. |
| `admin` | Écriture + gestion des membres + facturation. |

Les jetons n'expirent pas d'eux-mêmes, mais vous pouvez les révoquer depuis la même page. Traitez-les comme des mots de passe — quiconque a le jeton peut agir en tant qu'utilisateur émetteur.

Voir [Authentification](/documentation/authentication) pour le modèle complet des jetons, y compris les jetons limités à une session et le flux client OAuth pour les applications installables.

## Forme des ressources

Chaque ressource de l'API est sous l'espace de noms d'un espace de travail. Les URL ressemblent à :

```
/workspaces/{workspace_id}/workflows
/workspaces/{workspace_id}/workflows/{workflow_id}/runs
/sessions/{session_id}/messages
```

Il y a deux raccourcis de premier niveau :

- `/sessions/{id}` — les sessions sont limitées à un espace de travail, mais vous pouvez les adresser globalement car l'ID embarque l'espace de travail. Polymux recherche l'espace de travail pour vous.
- `/me` — l'enregistrement utilisateur de l'appelant à travers les espaces de travail.

## Routes par domaine

| Domaine | Page |
| --- | --- |
| Sessions | [Sessions](/documentation/api-sessions) |
| Workflows | [Workflows](/documentation/api-workflows) |
| Espaces de travail et membres | [Espaces de travail](/documentation/api-workspaces) |
| Coffre | [Coffre](/documentation/api-vault) |
| Fichiers et uploads | [Fichiers](/documentation/api-files) |
| Plugins et marketplace | [Marketplace](/documentation/api-marketplace) |

Chaque page liste chaque endpoint dans son domaine avec la méthode, le chemin, le scope requis et le schéma requête/réponse.

## WebSockets

La sortie de session en direct est diffusée via un WebSocket à :

```
wss://api.polymux.co/session/{session_id}/
```

Le premier cadre que le serveur envoie après la poignée de main est un instantané `session_state`. Les cadres suivants sont des événements typés — `message`, `viewport`, `tool_call`, `tool_result`. Le format complet du fil est documenté dans [Protocole WebSocket](/documentation/api-websocket).

## Pagination

Les endpoints de listing paginent avec des curseurs :

```http
GET /workspaces/{id}/workflows?limit=50&cursor=eyJpZCI6...
```

Les réponses incluent `next_cursor` (null lorsqu'il n'y a plus de pages). Les curseurs sont opaques — n'essayez pas de les parser. Ils embarquent l'espace de travail, la requête et la dernière ligne vue afin que la pagination reste cohérente sous les écritures concurrentes.

## Limites de débit

Valeurs par défaut par jeton :

- 60 requêtes / minute sur les endpoints de lecture.
- 30 requêtes / minute sur les endpoints d'écriture.
- 10 sessions actives concurrentes.

Les réponses 429 incluent `X-RateLimit-Reset` (secondes epoch) et `X-RateLimit-Remaining`. La page API du tableau de bord affiche votre utilisation actuelle en direct.

Si vous avez besoin de limites plus élevées pour une intégration, mentionnez-le dans le champ d'objet de votre jeton et nous les relèverons. Il n'y a pas d'augmentation automatique.

## SDK

Bibliothèques client officielles :

- **TypeScript / JavaScript** — `@polymux/sdk` sur npm.
- **Python** — `polymux` sur PyPI.

Les deux enveloppent l'API REST + WebSocket et gèrent la pagination, les retentatives et la danse de rafraîchissement du jeton bearer. Elles sont assez minces pour que les appels HTTP directs fonctionnent bien si vous préférez ne pas tirer une dépendance.

## Étapes suivantes

- Nouveau sur l'API ? Obtenez un jeton : [Authentification](/documentation/authentication).
- Écoute des mises à jour en direct : [Protocole WebSocket](/documentation/api-websocket).
- Vous cherchez un endpoint spécifique ? Chaque domaine a sa propre page (voir _Routes par domaine_ ci-dessus).
