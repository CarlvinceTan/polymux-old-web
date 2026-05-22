# Référence du manifeste de plugin

Le manifeste est le document JSON que Polymux génère depuis l'onglet Publier et stocke aux côtés de chaque version de plugin publiée. Normalement, vous ne l'éditez pas à la main — le formulaire de l'onglet Publier est la voie d'authoring prise en charge — mais le schéma est documenté ici pour que vous sachiez exactement ce qui est sérialisé.

Un manifeste ressemble à ceci :

```json
{
  "schema_version": 1,
  "id": "wf_3jK9aXq",
  "version": "1.4.0",
  "name": "Daily HN digest",
  "short_description": "Summarise the top Hacker News stories into a Google Doc.",
  "description_md": "## What it does\n\nEvery morning at 9am, this plugin scrapes...",
  "icon": "icon.png",
  "screenshots": ["screen-01.png", "screen-02.png"],
  "category": "research",
  "tags": ["news", "google-drive", "summary"],
  "connections": [
    {
      "kind": "oauth",
      "provider": "google-drive",
      "label": "Google Drive",
      "scope": ["drive.file"],
      "required": true
    },
    {
      "kind": "vault",
      "key": "openai_api_key",
      "label": "OpenAI API key",
      "help": "Used for the summarisation step. Get one at platform.openai.com.",
      "required": true
    }
  ],
  "inputs": [
    {
      "key": "folder",
      "label": "Destination folder",
      "type": "string",
      "default": "Polymux Digests"
    }
  ],
  "pricing": {
    "kind": "free"
  },
  "changelog_md": "### 1.4.0\n\n- Adds optional comment thread support."
}
```

Le reste de cette page parcourt chaque champ.

## Champs de premier niveau

| Champ | Type | Notes |
| --- | --- | --- |
| `schema_version` | entier | Toujours `1` aujourd'hui. Polymux l'incrémente lorsque des changements de rupture sont livrés. |
| `id` | chaîne | ID stable du workflow. Polymux l'attribue ; ne le modifiez pas. |
| `version` | chaîne | Semver. Les bumps majeurs sont requis pour les changements de rupture (voir [Construire un plugin](/documentation/plugin-build#7-publishing-updates)). |
| `name` | chaîne | 1 à 40 caractères. |
| `short_description` | chaîne | Moins de 120 caractères. Sous-titre de la carte. |
| `description_md` | chaîne | Markdown. Corps du listing. |
| `icon` | chaîne | Chemin vers un fichier d'icône dans le bundle. PNG ou SVG. |
| `screenshots` | tableau de chaînes | Facultatif. Chaque entrée est un chemin dans le bundle. |
| `category` | chaîne | L'une des catégories de la marketplace. |
| `tags` | tableau de chaînes | Jusqu'à 5 tags en forme libre. |

## `connections`

Chaque connexion décrit un élément d'état externe dont le workflow a besoin. Polymux utilise cette liste pour rendre la boîte de dialogue d'installation.

### Connexions vault

```json
{
  "kind": "vault",
  "key": "openai_api_key",
  "label": "OpenAI API key",
  "help": "Used for the summarisation step.",
  "required": true
}
```

- `key` doit correspondre à une clé du coffre référencée par le workflow.
- `label` est ce que voit l'installateur.
- `help` est facultatif mais recommandé.
- `required: false` permet au workflow de s'exécuter sans la valeur, utile pour les fonctionnalités facultatives.

### Connexions OAuth

```json
{
  "kind": "oauth",
  "provider": "google-drive",
  "label": "Google Drive",
  "scope": ["drive.file"],
  "required": true
}
```

- `provider` doit être l'un des [fournisseurs OAuth pris en charge](/documentation/connections-overview#supported-providers) — aujourd'hui, c'est `google-drive`.
- `scope` est spécifique au fournisseur. Polymux le valide contre le catalogue du fournisseur au moment de l'installation et rejette les scopes inconnus.

### Connexions d'intégration

```json
{
  "kind": "integration",
  "integration_id": "stripe",
  "label": "Stripe account",
  "required": true
}
```

`integration_id` est l'ID d'une intégration de la marketplace dont dépend le workflow (Stripe, AWS, connecteurs internes, etc.). L'ID correspond au slug marketplace de l'intégration ; si l'installateur ne l'a pas déjà, Polymux l'invite à l'installer avant que le plugin ne puisse s'exécuter. Voir [Construire une connexion](/documentation/connections-build) pour savoir comment les intégrations sont créées.

## `inputs`

Les entrées sont des paramètres de workflow que l'installateur peut configurer au moment de l'installation et modifier ensuite depuis les paramètres du workflow. Chaque entrée a :

| Champ | Type | Notes |
| --- | --- | --- |
| `key` | chaîne | Identifiant snake_case utilisé dans le graphe du workflow. |
| `label` | chaîne | Affiché dans la boîte de dialogue d'installation et dans la page de paramètres. |
| `type` | chaîne | `string`, `number`, `boolean`, `select` ou `secret`. |
| `default` | varie | Valeur par défaut facultative. |
| `options` | tableau | Requis pour `type: "select"`. Chaque option est `{ value, label }`. |
| `help` | chaîne | Facultatif. Courte description affichée sous le champ. |

Une entrée `secret` est stockée dans le coffre en interne — utilisez-la pour les jetons fournis à l'exécution que vous ne voulez pas journaliser.

## `pricing`

Trois formes :

```json
{ "kind": "free" }
```

```json
{
  "kind": "one_time",
  "amount_cents": 4900,
  "currency": "USD"
}
```

```json
{
  "kind": "subscription",
  "amount_cents": 900,
  "currency": "USD",
  "interval": "month"
}
```

La devise est en ISO 4217 — Polymux prend en charge USD, EUR, GBP et JPY aujourd'hui. Les montants sont des entiers en centimes (ou unités mineures équivalentes).

## `changelog_md`

Un document markdown avec des notes de version par version. Polymux ne rend que la section pour la version consultée ; vous êtes responsable des en-têtes de section, mais une convention de `### <version>` est ce que la boîte de dialogue d'installation et la page de listing analysent.

## Validation

L'onglet Publier valide le manifeste à chaque enregistrement. Si vous importez un manifeste de workflow via l'API, le même validateur s'exécute. Erreurs courantes :

- `connections[i].key` ne correspond à aucune lecture du coffre dans le graphe du workflow.
- `inputs[i].type: "select"` n'a pas de `options`.
- `pricing.amount_cents` est sous le minimum de la plateforme (1 $ / 100 centimes).

## Étapes suivantes

- Voir comment les installateurs vivent le manifeste : [Vue d'ensemble des connexions](/documentation/connections-overview).
- Construisez une connexion personnalisée dont d'autres plugins peuvent dépendre : [Construire une connexion](/documentation/connections-build).
- Mettez le plugin en ligne : [Checklist de publication](/documentation/publishing).
