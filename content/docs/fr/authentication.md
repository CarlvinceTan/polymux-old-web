# Authentification

Chaque requête authentifiée vers l'API Polymux transporte un jeton bearer dans l'en-tête `Authorization`. Cette page couvre les trois types de jetons que Polymux émet, comment les générer et comment les rafraîchir.

Si vous cherchez la forme de l'URL et l'hôte de base, commencez par la [Vue d'ensemble de l'API](/documentation/api-overview).

## Types de jetons

| Type | Durée de vie | Quand l'utiliser |
| --- | --- | --- |
| Jeton d'accès personnel (PAT) | Indéfinie, révocable | Scripts, outils CLI, partout où vous contrôlez le secret. |
| Jeton client OAuth | 1 heure, le jeton de rafraîchissement effectue une rotation | Applications installables qui agissent au nom d'un utilisateur Polymux. |
| Jeton limité à une session | Durée de vie de la session | Intégrations de courte durée qui n'ont besoin que de l'accès d'une session. |

Polymux n'émet _pas_ de clés d'API sans forme de jeton — il n'existe pas de clé qui n'expire pas et ne peut pas être révoquée.

## Jetons d'accès personnels

Ouvrez **Paramètres → API → Jetons** dans le tableau de bord et appuyez sur **+ Nouveau jeton**. Vous verrez :

- **Nom.** Forme libre ; utilisé pour identifier le jeton dans l'UI de révocation.
- **Scope.** L'un de `read`, `write`, `admin`. Voir [Vue d'ensemble de l'API](/documentation/api-overview#authentication).
- **Espace de travail.** L'espace de travail contre lequel le jeton est autorisé. Choisissez `*` pour un jeton à l'échelle du compte ; c'est requis pour `/me` et quelques autres endpoints inter-espaces de travail.

Le jeton est affiché **une seule fois**. Copiez-le immédiatement et stockez-le dans un endroit sûr — Polymux ne conserve pas le texte en clair.

Révoquez un jeton en supprimant sa ligne depuis la même page. La révocation est immédiate et inconditionnelle ; les requêtes en cours utilisant le jeton échouent avec `401 token_revoked`.

## Flux client OAuth

Si vous construisez une application que d'autres utilisateurs Polymux installent (un tableau de bord tiers, un bot Slack, une extension IDE), utilisez le flux de code d'autorisation OAuth2 plutôt que de demander un PAT aux utilisateurs.

Enregistrez un client OAuth depuis **Paramètres → API → Clients OAuth** :

- **Nom** et **URL de page d'accueil** sont affichés sur l'écran de consentement.
- **URI de redirection** sont les URL vers lesquelles Polymux est autorisé à renvoyer l'utilisateur. Listez chaque URL que vous utiliserez — correspondance exacte.
- **Scopes** sont les scopes que votre application demandera. Les utilisateurs les voient sur l'écran de consentement.

Le flux est OAuth2 standard :

```
1. Redirect the user to:
   https://polymux.com/oauth/authorize
     ?client_id=...&redirect_uri=...&scope=...&state=...&response_type=code

2. The user approves; Polymux redirects to your redirect_uri with ?code=...

3. Exchange the code for tokens:
   POST https://api.polymux.co/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&code=...&client_id=...&client_secret=...&redirect_uri=...

4. Response:
   {
     "access_token": "...",
     "refresh_token": "...",
     "expires_in": 3600,
     "scope": "read write"
   }
```

Rafraîchissez avant que le jeton d'accès n'expire :

```
POST /oauth/token
grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
```

Les jetons de rafraîchissement effectuent une rotation à chaque utilisation. Remplacez toujours le jeton de rafraîchissement stocké par celui de la réponse.

## Jetons limités à une session

Un jeton limité à une session autorise les actions sur exactement une session. Polymux en émet un quand vous créez une session via :

```
POST /sessions
```

La réponse inclut un champ `session_token`. Utilisez-le sur chaque appel WebSocket et HTTP contre l'ID de cette session. Il expire quand la session se termine ; pas de rafraîchissement, pas de renouvellement.

Les jetons limités à une session sont la voie recommandée pour permettre à un client non fiable (un frontend web, un widget orienté client) de se rattacher à une session Polymux sans détenir un jeton à plus longue durée de vie. Générez la session côté serveur, remettez le jeton de session au client, et le client ne voit jamais votre PAT.

## Forme du jeton

Tous les jetons Polymux sont des JWT signés avec notre clé racine de signature. La charge utile est opaque aux clients — ne la parsez pas — mais l'inspecter pendant le débogage est acceptable. Claims standard :

- `iss` — `polymux.co`.
- `sub` — ID utilisateur ou ID du client OAuth.
- `aud` — ID de l'espace de travail, ou `*` pour les jetons inter-espaces de travail.
- `scope` — scopes séparés par des espaces.
- `exp` — expiration pour les jetons OAuth et de session ; absent pour les PAT.

Si vous stockez des jetons dans une base de données, hachez-les avant de les stocker. Le serveur utilise la signature JWT pour vérifier, pas une recherche en base de données, donc un jeton volé est valide tant qu'il n'a pas été révoqué.

## Erreurs

| Code | Signification |
| --- | --- |
| `401 token_missing` | Pas d'en-tête `Authorization`. |
| `401 token_invalid` | JWT malformé ou non signé. |
| `401 token_revoked` | PAT révoqué ou autorisation OAuth révoquée. |
| `401 token_expired` | Jeton d'accès expiré ; rafraîchissez et réessayez. |
| `403 scope_insufficient` | Le jeton est valide mais manque du scope requis. |
| `403 workspace_mismatch` | Le jeton est limité à un autre espace de travail. |

Chaque réponse d'erreur inclut un en-tête `request_id` que vous pouvez citer au support.

## Étapes suivantes

- Parcourez les pages d'endpoints depuis la [Vue d'ensemble de l'API](/documentation/api-overview).
- Pour les mises à jour en direct, vous avez aussi besoin du [Protocole WebSocket](/documentation/api-websocket).
- Vous construisez une application installable ? Associez ceci à la [Vue d'ensemble des plugins](/documentation/plugin-overview).
