# Plugin-Manifest-Referenz

Das Manifest ist das JSON-Dokument, das Polymux aus dem Publish-Tab generiert und neben jeder veröffentlichten Plugin-Version speichert. Normalerweise bearbeiten Sie es nicht von Hand – das Formular im Publish-Tab ist der unterstützte Erstellungsweg –, aber das Schema ist hier dokumentiert, damit Sie genau wissen, was serialisiert wird.

Ein Manifest sieht so aus:

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

Der Rest dieser Seite geht jedes Feld durch.

## Felder auf oberster Ebene

| Feld | Typ | Hinweise |
| --- | --- | --- |
| `schema_version` | integer | Heute immer `1`. Polymux erhöht dies bei Breaking Changes. |
| `id` | string | Stabile Workflow-ID. Polymux weist sie zu; nicht ändern. |
| `version` | string | Semver. Major-Erhöhungen sind für Breaking Changes erforderlich (siehe [Plugin erstellen](/documentation/plugin-build#7-publishing-updates)). |
| `name` | string | 1–40 Zeichen. |
| `short_description` | string | Unter 120 Zeichen. Karten-Untertitel. |
| `description_md` | string | Markdown. Listing-Inhalt. |
| `icon` | string | Pfad zu einer Symboldatei im Bundle. PNG oder SVG. |
| `screenshots` | array of string | Optional. Jeder Eintrag ist ein Pfad innerhalb des Bundles. |
| `category` | string | Eine der Marktplatz-Kategorien. |
| `tags` | array of string | Bis zu 5 frei formulierte Tags. |

## `connections`

Jede Verbindung beschreibt einen externen Zustand, den der Workflow benötigt. Polymux verwendet diese Liste, um den Installationsdialog zu rendern.

### Tresor-Verbindungen

```json
{
  "kind": "vault",
  "key": "openai_api_key",
  "label": "OpenAI API key",
  "help": "Used for the summarisation step.",
  "required": true
}
```

- `key` muss einem vom Workflow referenzierten Tresorschlüssel entsprechen.
- `label` ist das, was der Installierende sieht.
- `help` ist optional, wird aber empfohlen.
- `required: false` erlaubt dem Workflow, ohne den Wert zu laufen, nützlich für optionale Funktionen.

### OAuth-Verbindungen

```json
{
  "kind": "oauth",
  "provider": "google-drive",
  "label": "Google Drive",
  "scope": ["drive.file"],
  "required": true
}
```

- `provider` muss einer der [unterstützten OAuth-Anbieter](/documentation/connections-overview#supported-providers) sein – heute ist das `google-drive`.
- `scope` ist anbieterspezifisch. Polymux validiert ihn zur Installationszeit gegen den Katalog des Anbieters und lehnt unbekannte Scopes ab.

### Integrations-Verbindungen

```json
{
  "kind": "integration",
  "integration_id": "stripe",
  "label": "Stripe account",
  "required": true
}
```

`integration_id` ist die ID einer Marktplatz-Integration, von der der Workflow abhängt (Stripe, AWS, interne Konnektoren usw.). Die ID entspricht dem Marktplatz-Slug der Integration; wenn der Installierende sie noch nicht hat, fordert Polymux ihn auf, sie zu installieren, bevor das Plugin laufen kann. Siehe [Verbindung erstellen](/documentation/connections-build), um zu erfahren, wie Integrationen erstellt werden.

## `inputs`

Eingaben sind Workflow-Parameter, die der Installierende zur Installationszeit konfigurieren und danach über die Workflow-Einstellungen bearbeiten kann. Jede Eingabe ist:

| Feld | Typ | Hinweise |
| --- | --- | --- |
| `key` | string | Snake_case-Bezeichner, der im Workflow-Graphen verwendet wird. |
| `label` | string | Angezeigt im Installationsdialog und auf der Einstellungsseite. |
| `type` | string | `string`, `number`, `boolean`, `select` oder `secret`. |
| `default` | variiert | Optionaler Standardwert. |
| `options` | array | Erforderlich für `type: "select"`. Jede Option ist `{ value, label }`. |
| `help` | string | Optional. Kurze Beschreibung unter dem Feld. |

Eine `secret`-Eingabe wird im Hintergrund im Tresor gespeichert – verwenden Sie sie für zur Laufzeit gelieferte Token, die nicht protokolliert werden sollen.

## `pricing`

Drei Formen:

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

Die Währung ist ISO 4217 – Polymux unterstützt heute USD, EUR, GBP und JPY. Beträge sind ganzzahlige Cent (oder entsprechende Untereinheiten).

## `changelog_md`

Ein Markdown-Dokument mit Release-Notes pro Version. Polymux rendert nur den Abschnitt für die aktuell betrachtete Version; Sie sind für die Abschnittsüberschriften verantwortlich, aber die Konvention `### <version>` ist das, was der Installationsdialog und die Listing-Seite parsen.

## Validierung

Der Publish-Tab validiert das Manifest bei jedem Speichern. Wenn Sie ein Workflow-Manifest über die API importieren, läuft derselbe Validator. Häufige Fehler:

- `connections[i].key` entspricht keinem Tresor-Lesezugriff im Workflow-Graphen.
- `inputs[i].type: "select"` fehlen `options`.
- `pricing.amount_cents` liegt unter dem Plattform-Minimum (1 USD / 100 Cent).

## Nächste Schritte

- Sehen Sie, wie Installierende das Manifest erleben: [Verbindungen-Übersicht](/documentation/connections-overview).
- Erstellen Sie eine benutzerdefinierte Verbindung, von der andere Plugins abhängen können: [Verbindung erstellen](/documentation/connections-build).
- Bringen Sie das Plugin live: [Veröffentlichungs-Checkliste](/documentation/publishing).
