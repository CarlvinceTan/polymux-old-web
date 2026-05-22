# Construire une connexion

Une _connexion_ dans Polymux est un pont réutilisable entre un workflow et un fournisseur tiers. Les plugins consomment les connexions par leur nom ; construire une connexion rend un nouveau fournisseur disponible pour tous les plugins de la marketplace.

Les connexions constituent une voie d'authoring plus avancée que les plugins. La plupart des auteurs de plugins ne consommeront jamais que des connexions qui existent déjà dans la marketplace. Construisez une connexion personnalisée lorsque :

- Le fournisseur dont vous avez besoin n'est pas encore publié dans la [marketplace](/integrations/marketplace).
- Un connecteur existant expose la mauvaise forme — par exemple, votre plugin a besoin d'un scope OAuth fin qu'aucun connecteur existant ne demande.
- Vous travaillez avec un fournisseur interne à code fermé.

## Types de connexion, rappel

| Type | Quand en construire un | Surface d'authoring |
| --- | --- | --- |
| Vault | Le fournisseur s'authentifie avec une clé ou un jeton statique. | Manifeste uniquement — pas de code. |
| OAuth | Le fournisseur utilise OAuth2 ou OIDC. | Manifeste plus un petit gestionnaire. |
| Intégration | Le fournisseur nécessite une authentification personnalisée, plusieurs secrets ou des flux non-OAuth. | Manifeste plus un gestionnaire complet. |

Les connexions vault sont une pure déclaration. Les connexions OAuth et Intégration nécessitent un gestionnaire qui s'exécute sur le serveur de Polymux pour échanger les secrets, rafraîchir les jetons et router les appels d'outils.

## Connexions vault (sans code)

Une connexion vault-only est déclarée entièrement dans le manifeste du plugin. Ajoutez-la au tableau `connections` de votre plugin :

```json
{
  "kind": "vault",
  "key": "stripe_restricted_key",
  "label": "Stripe restricted key",
  "help": "Use a restricted key with `write:checkout-sessions`.",
  "required": true,
  "shape": {
    "kind": "single",
    "field": "value",
    "secret": true
  }
}
```

`shape` décrit ce que l'installateur colle. `single` est un champ unique. Autres formes :

- `pair` — nom d'utilisateur + mot de passe.
- `tuple` — N champs étiquetés, utile pour les triplets du style `{ access_key, secret_key, region }`.

Le coffre stocke la valeur telle quelle. Votre workflow appelle une action d'outil qui extrait le secret du coffre et l'injecte dans l'en-tête HTTP ou le drapeau CLI pertinent — voir [Bases du coffre](/documentation/vault#how-agents-access-the-vault).

Vous n'écrivez pas de code de gestionnaire pour les connexions vault.

## Connexions OAuth

Les connexions OAuth ont besoin d'un gestionnaire pour que Polymux sache comment :

- Construire l'URL d'autorisation.
- Échanger le code de rappel contre des jetons.
- Rafraîchir les jetons avant qu'ils n'expirent.
- Faire remonter une erreur conviviale si l'autorisation se casse.

Un gestionnaire est un module TypeScript qui implémente l'interface `ConnectorHandler` et vit dans `web/server/connectors/`. La surface minimale est :

```ts
import type { ConnectorHandler } from './types'

export const myProviderConnector: ConnectorHandler = {
  id: 'my-provider',
  label: 'My Provider',
  scopes: ['read:user', 'write:posts'],

  buildAuthorizeUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: useRuntimeConfig().myProviderClientId,
      redirect_uri: redirectUri,
      state,
      scope: 'read:user write:posts',
      response_type: 'code',
    })
    return `https://provider.example.com/oauth/authorize?${params.toString()}`
  },

  async exchangeCode({ code, redirectUri }) {
    const res = await $fetch<TokenResponse>('https://provider.example.com/oauth/token', {
      method: 'POST',
      body: { code, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    })
    return {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      expires_at: Date.now() + res.expires_in * 1000,
    }
  },

  async refresh({ refresh_token }) {
    // ... same shape as exchangeCode
  },

  async dispatchTool({ tool, args, credentials }) {
    // Translate workflow tool calls into HTTP requests
  },
}
```

Enregistrez le gestionnaire dans `web/server/connectors/registry.ts`. À partir de ce moment, il apparaît dans la marketplace comme une connexion que les plugins peuvent déclarer.

La méthode `dispatchTool` est là où vous câblez l'API du fournisseur dans le modèle d'outils de Polymux. Chaque outil qu'un workflow peut invoquer est acheminé par ici. Voir `web/server/connectors/google-drive.ts` pour l'implémentation de référence intégrée.

## Connexions d'intégration

Les connexions d'intégration sont les plus flexibles — et les plus laborieuses à créer. Utilisez-les lorsqu'OAuth ne convient pas :

- Plusieurs secrets sans rapport (clé d'API Stripe + secret de webhook + clé publiable).
- Transports non-HTTP (gRPC, TCP brut, MQTT).
- Flux de bootstrap spécifiques au fournisseur (création d'un compte de service, attribution d'un rôle IAM).

L'interface est la même forme `ConnectorHandler` mais vous implémentez aussi une UI de configuration personnalisée. Les UI de configuration vivent dans `web/app/components/integration/<provider>/` et suivent les mêmes conventions que le reste du tableau de bord.

C'est généralement un projet de niveau ingénierie Polymux. Si vous avez un fournisseur qui nécessite un connecteur d'intégration, démarrez un fil dans le [forum](/forum) — nous avons aidé des auteurs de la communauté à les intégrer en interne.

## Tester une connexion localement

Lancez l'application web localement (`npm run dev` depuis `web/`), ouvrez `localhost:3000/integrations/marketplace`, et votre gestionnaire apparaîtra avec les autres. Le flux OAuth complet utilise l'`APP_URL` de votre configuration runtime comme base de redirection, alors assurez-vous qu'elle correspond à ce qui est enregistré auprès du fournisseur.

Pour les gestionnaires OAuth, vous pouvez simuler l'échange de jetons avec `npm run script -- test-connector my-provider --code <code>` depuis `web/`. Le script alimente une fausse redirection dans votre gestionnaire et imprime les jetons. Utile pour attraper les incompatibilités de schéma avant d'impliquer un véritable aller-retour OAuth.

## Publier une connexion

Les connexions sont publiées via le même onglet Publier que les plugins, mais vous choisissez **Connexion** au lieu de **Plugin** dans le formulaire du listing. Les examens sont plus stricts — un connecteur cassé casse chaque plugin qui en dépend — et nous pouvons demander une revue de code du gestionnaire avant d'approuver.

Les connexions approuvées apparaissent dans la marketplace sous l'onglet **Connexions**. Les auteurs de plugins peuvent immédiatement les déclarer dans leurs manifestes.

## Étapes suivantes

- Associez ceci à la [Référence du manifeste de plugin](/documentation/plugin-manifest) pour le schéma dans lequel votre connexion apparaît.
- Voir la [Vue d'ensemble de l'API](/documentation/api-overview) si vous appelez Polymux directement au lieu de créer dans la plateforme.
- Prêt à livrer ? Lisez la [Checklist de publication](/documentation/publishing).
