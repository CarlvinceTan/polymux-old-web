# Verbindung erstellen

Eine _Verbindung_ in Polymux ist eine wiederverwendbare Brücke zwischen einem Workflow und einem Drittanbieter. Plugins nutzen Verbindungen über deren Namen; das Erstellen einer Verbindung macht einen neuen Anbieter für jedes Plugin auf dem Marktplatz verfügbar.

Verbindungen sind ein fortgeschrittenerer Erstellungsweg als Plugins. Die meisten Plugin-Autoren werden nur jemals Verbindungen nutzen, die bereits auf dem Marktplatz existieren. Erstellen Sie eine benutzerdefinierte Verbindung, wenn:

- Der von Ihnen benötigte Anbieter noch nicht im [Marktplatz](/integrations/marketplace) veröffentlicht ist.
- Ein bestehender Konnektor die falsche Form bereitstellt – zum Beispiel benötigt Ihr Plugin einen feingranularen OAuth-Scope, den kein bestehender Konnektor anfordert.
- Sie mit einem internen Closed-Source-Anbieter arbeiten.

## Arten von Verbindungen, zusammengefasst

| Art | Wann eine erstellen | Erstellungs-Oberfläche |
| --- | --- | --- |
| Vault | Der Anbieter authentifiziert sich mit einem statischen Schlüssel oder Token. | Nur Manifest – kein Code. |
| OAuth | Der Anbieter verwendet OAuth2 oder OIDC. | Manifest plus ein kleiner Handler. |
| Integration | Anbieter benötigt benutzerdefinierte Auth, mehrere Geheimnisse oder Nicht-OAuth-Abläufe. | Manifest plus vollständiger Handler. |

Tresor-Verbindungen sind reine Deklaration. OAuth- und Integrations-Verbindungen erfordern einen Handler, der auf dem Polymux-Server läuft, um Geheimnisse auszutauschen, Tokens zu erneuern und Werkzeugaufrufe zu routen.

## Tresor-Verbindungen (kein Code)

Eine reine Tresor-Verbindung wird vollständig im Plugin-Manifest deklariert. Fügen Sie sie dem `connections`-Array Ihres Plugins hinzu:

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

`shape` beschreibt, was der Installierende einfügt. `single` ist ein Feld. Andere Formen:

- `pair` – Benutzername + Passwort.
- `tuple` – N beschriftete Felder, nützlich für `{ access_key, secret_key, region }`-artige Tripel.

Der Tresor speichert den Wert wortwörtlich. Ihr Workflow ruft eine Werkzeug-Aktion auf, die das Geheimnis aus dem Tresor zieht und in den entsprechenden HTTP-Header oder CLI-Flag einfügt – siehe [Tresor-Grundlagen](/documentation/vault#how-agents-access-the-vault).

Für Tresor-Verbindungen schreiben Sie keinen Handler-Code.

## OAuth-Verbindungen

OAuth-Verbindungen benötigen einen Handler, damit Polymux weiß, wie:

- Die Autorisierungs-URL erstellt wird.
- Der Callback-Code gegen Tokens getauscht wird.
- Tokens erneuert werden, bevor sie ablaufen.
- Ein freundlicher Fehler angezeigt wird, wenn die Berechtigung bricht.

Ein Handler ist ein TypeScript-Modul, das die Schnittstelle `ConnectorHandler` implementiert und unter `web/server/connectors/` liegt. Die Mindestoberfläche ist:

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

Registrieren Sie den Handler in `web/server/connectors/registry.ts`. Ab diesem Zeitpunkt erscheint er im Marktplatz als Verbindung, die Plugins deklarieren können.

Die Methode `dispatchTool` ist der Ort, an dem Sie die API des Anbieters in das Werkzeugmodell von Polymux einbinden. Jedes Werkzeug, das ein Workflow aufrufen kann, wird hier durchgereicht. Siehe `web/server/connectors/google-drive.ts` für die direkt im Repo verfügbare Referenzimplementierung.

## Integrations-Verbindungen

Integrations-Verbindungen sind die flexibelsten – und am aufwendigsten zu erstellen. Verwenden Sie sie, wenn OAuth nicht passt:

- Mehrere unverbundene Geheimnisse (Stripe-API-Schlüssel + Webhook-Geheimnis + Publishable Key).
- Nicht-HTTP-Transporte (gRPC, raw TCP, MQTT).
- Anbieter-spezifische Bootstrap-Abläufe (Erstellen eines Servicekontos, Vergabe einer IAM-Rolle).

Die Schnittstelle hat dieselbe `ConnectorHandler`-Form, aber Sie implementieren zusätzlich eine eigene Setup-UI. Setup-UIs liegen in `web/app/components/integration/<provider>/` und folgen denselben Konventionen wie der Rest des Dashboards.

Das ist in der Regel ein Projekt auf Polymux-Engineering-Ebene. Wenn Sie einen Anbieter haben, der einen Integrations-Konnektor benötigt, starten Sie einen Thread im [Forum](/forum) – wir haben Community-Autoren dabei geholfen, sie ins Repo zu bringen.

## Eine Verbindung lokal testen

Führen Sie die Web-App lokal aus (`npm run dev` aus `web/`), öffnen Sie `localhost:3000/integrations/marketplace`, und Ihr Handler erscheint mit den anderen. Der vollständige OAuth-Ablauf verwendet `APP_URL` aus Ihrer Runtime-Konfiguration als Redirect-Basis, also stellen Sie sicher, dass diese mit dem übereinstimmt, was beim Anbieter registriert ist.

Bei OAuth-Handlern können Sie den Token-Austausch mit `npm run script -- test-connector my-provider --code <code>` aus `web/` simulieren. Das Skript füttert eine gefälschte Weiterleitung in Ihren Handler ein und gibt die Tokens aus. Nützlich, um Schema-Inkonsistenzen zu erkennen, bevor Sie ein echtes OAuth-Hin-und-Her involvieren.

## Eine Verbindung veröffentlichen

Verbindungen werden über denselben Publish-Tab wie Plugins veröffentlicht, aber Sie wählen im Listing-Formular **Connection** statt **Plugin**. Prüfungen sind strenger – ein kaputter Konnektor bricht jedes Plugin, das davon abhängt – und wir können vor der Genehmigung um eine Code-Review des Handlers bitten.

Genehmigte Verbindungen erscheinen auf dem Marktplatz unter dem Tab **Connections**. Plugin-Autoren können sie sofort in ihren Manifesten deklarieren.

## Nächste Schritte

- Kombinieren Sie dies mit der [Plugin-Manifest-Referenz](/documentation/plugin-manifest) für das Schema, in dem Ihre Verbindung erscheint.
- Sehen Sie sich die [API-Übersicht](/documentation/api-overview) an, wenn Sie Polymux direkt aufrufen, anstatt innerhalb der Plattform zu entwickeln.
- Bereit zum Ausliefern? Lesen Sie [Veröffentlichungs-Checkliste](/documentation/publishing).
