# API-Übersicht

Polymux stellt eine REST- + WebSocket-API für den programmatischen Zugriff auf Arbeitsbereiche, Workflows und Sitzungen bereit. Alles, was Sie im Dashboard tun können, können Sie auch über die API tun – Sitzungen erstellen, Workflows ausführen, Nachrichten lesen, Plugins installieren.

Diese Seite ist das Inhaltsverzeichnis. Authentifizierung, einzelne Endpoint-Formate und Rate-Limits befinden sich auf eigenen Seiten, die unten verlinkt sind.

## Basis-URL

```
https://api.polymux.co
```

Die Web-App unter `polymux.com` ist ein separater Origin. Sie ruft im Hintergrund dieselbe API auf; Sie können verwenden, was sich für Sie natürlicher anfühlt.

## Authentifizierung

Jeder authentifizierte Endpoint akzeptiert ein Bearer-Token im `Authorization`-Header:

```
Authorization: Bearer <token>
```

Tokens werden unter **Settings → API → Tokens** im Dashboard ausgestellt. Sie sind auf einen Arbeitsbereich beschränkt und haben eine von drei Rollen:

| Scope | Fähigkeiten |
| --- | --- |
| `read` | Nur List- und Read-Endpoints. |
| `write` | Lesen + Erstellen/Aktualisieren/Löschen von Arbeitsbereich-Ressourcen. |
| `admin` | Schreiben + Mitgliederverwaltung + Abrechnung. |

Tokens laufen nicht von selbst ab, aber Sie können sie auf derselben Seite widerrufen. Behandeln Sie sie wie Passwörter – jeder mit dem Token kann als der ausstellende Benutzer agieren.

Siehe [Authentifizierung](/documentation/authentication) für das vollständige Token-Modell, einschließlich sitzungsbeschränkter Tokens und des OAuth-Client-Flows für installierbare Apps.

## Ressourcen-Form

Jede API-Ressource ist unter einem Arbeitsbereich nameworked. URLs sehen so aus:

```
/workspaces/{workspace_id}/workflows
/workspaces/{workspace_id}/workflows/{workflow_id}/runs
/sessions/{session_id}/messages
```

Es gibt zwei Top-Level-Abkürzungen:

- `/sessions/{id}` – Sitzungen sind arbeitsbereichsbezogen, aber Sie können sie global adressieren, weil die ID den Arbeitsbereich einbettet. Polymux sucht den Arbeitsbereich für Sie heraus.
- `/me` – der Benutzerdatensatz des Aufrufers über alle Arbeitsbereiche hinweg.

## Routen nach Bereich

| Bereich | Seite |
| --- | --- |
| Sitzungen | [Sessions](/documentation/api-sessions) |
| Workflows | [Workflows](/documentation/api-workflows) |
| Arbeitsbereiche und Mitglieder | [Workspaces](/documentation/api-workspaces) |
| Tresor | [Vault](/documentation/api-vault) |
| Dateien und Uploads | [Files](/documentation/api-files) |
| Plugins und Marktplatz | [Marketplace](/documentation/api-marketplace) |

Jede Seite listet jeden Endpoint in ihrem Bereich mit der Methode, dem Pfad, dem erforderlichen Scope sowie dem Request-/Response-Schema auf.

## WebSockets

Live-Sitzungsausgabe wird über einen WebSocket gestreamt unter:

```
wss://api.polymux.co/session/{session_id}/
```

Der erste Frame, den der Server nach dem Handshake sendet, ist ein `session_state`-Snapshot. Nachfolgende Frames sind typisierte Ereignisse – `message`, `viewport`, `tool_call`, `tool_result`. Das vollständige Wire-Format ist im [WebSocket-Protokoll](/documentation/api-websocket) dokumentiert.

## Paginierung

List-Endpoints paginieren mit Cursors:

```http
GET /workspaces/{id}/workflows?limit=50&cursor=eyJpZCI6...
```

Antworten enthalten `next_cursor` (null, wenn es keine weiteren Seiten gibt). Cursors sind opak – versuchen Sie nicht, sie zu parsen. Sie betten den Arbeitsbereich, die Abfrage und die zuletzt gesehene Zeile ein, sodass das Paging unter gleichzeitigen Schreibvorgängen konsistent bleibt.

## Rate-Limits

Standardwerte pro Token:

- 60 Anfragen / Minute auf Read-Endpoints.
- 30 Anfragen / Minute auf Write-Endpoints.
- 10 gleichzeitig aktive Sitzungen.

429-Antworten enthalten `X-RateLimit-Reset` (Epoch-Sekunden) und `X-RateLimit-Remaining`. Die API-Seite des Dashboards zeigt Ihre aktuelle Nutzung in Echtzeit.

Wenn Sie höhere Limits für eine Integration benötigen, erwähnen Sie das im Zweck-Feld Ihres Tokens, und wir erhöhen sie. Es gibt keine automatische Erhöhung.

## SDKs

Offizielle Client-Bibliotheken:

- **TypeScript / JavaScript** – `@polymux/sdk` auf npm.
- **Python** – `polymux` auf PyPI.

Beide umhüllen die REST- + WebSocket-API und übernehmen Paginierung, Wiederholungen und den Bearer-Token-Erneuerungstanz. Sie sind dünn genug, dass direkte HTTP-Aufrufe gut funktionieren, wenn Sie lieber keine Abhängigkeit einbinden möchten.

## Nächste Schritte

- Neu in der API? Holen Sie sich ein Token: [Authentifizierung](/documentation/authentication).
- Auf Live-Updates lauschen: [WebSocket-Protokoll](/documentation/api-websocket).
- Suchen Sie einen bestimmten Endpoint? Jeder Bereich hat seine eigene Seite (siehe _Routen nach Bereich_ oben).
