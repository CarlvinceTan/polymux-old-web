# Authentifizierung

Jede authentifizierte Anfrage an die Polymux-API trägt ein Bearer-Token im `Authorization`-Header. Diese Seite behandelt die drei Arten von Tokens, die Polymux ausstellt, wie Sie sie erzeugen und wie Sie sie erneuern.

Wenn Sie nach der URL-Form und dem Basis-Host suchen, beginnen Sie mit der [API-Übersicht](/documentation/api-overview).

## Token-Arten

| Art | Lebensdauer | Wann verwenden |
| --- | --- | --- |
| Personal Access Token (PAT) | Unbegrenzt, widerrufbar | Skripte, CLI-Tools, überall dort, wo Sie das Geheimnis kontrollieren. |
| OAuth-Client-Token | 1 Stunde, Refresh-Token rotiert | Installierbare Apps, die im Namen eines Polymux-Benutzers handeln. |
| Sitzungsbeschränktes Token | Lebensdauer der Sitzung | Kurzlebige Integrationen, die nur Zugriff für eine Sitzung benötigen. |

Polymux stellt _keine_ API-Schlüssel ohne Token-Form aus – es gibt keinen Schlüssel, der nicht abläuft und nicht widerrufen werden kann.

## Personal Access Tokens

Öffnen Sie im Dashboard **Settings → API → Tokens** und drücken Sie **+ New token**. Sie sehen:

- **Name.** Frei formuliert; wird verwendet, um das Token in der Widerrufs-UI zu identifizieren.
- **Scope.** Einer von `read`, `write`, `admin`. Siehe [API-Übersicht](/documentation/api-overview#authentication).
- **Workspace.** Der Arbeitsbereich, gegen den das Token autorisiert. Wählen Sie `*` für ein kontoweites Token; dies ist erforderlich für `/me` und einige andere Cross-Workspace-Endpoints.

Das Token wird **nur einmal** angezeigt. Kopieren Sie es sofort und bewahren Sie es an einem sicheren Ort auf – Polymux speichert keinen Klartext.

Widerrufen Sie ein Token, indem Sie seine Zeile auf derselben Seite löschen. Der Widerruf ist sofort und bedingungslos; laufende Anfragen, die das Token verwenden, scheitern mit `401 token_revoked`.

## OAuth-Client-Flow

Wenn Sie eine App entwickeln, die andere Polymux-Benutzer installieren (ein Drittanbieter-Dashboard, einen Slack-Bot, eine IDE-Erweiterung), verwenden Sie den OAuth2-Authorization-Code-Flow, anstatt Benutzer nach einem PAT zu fragen.

Registrieren Sie einen OAuth-Client unter **Settings → API → OAuth clients**:

- **Name** und **Homepage-URL** werden auf der Zustimmungs-Seite angezeigt.
- **Redirect URIs** sind die URLs, an die Polymux den Benutzer zurückleiten darf. Listen Sie jede URL auf, die Sie jemals verwenden werden – exakte Übereinstimmung.
- **Scopes** sind die Scopes, die Ihre App anfordern wird. Benutzer sehen dies auf der Zustimmungs-Seite.

Der Ablauf ist Standard-OAuth2:

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

Erneuern Sie vor dem Ablauf des Access-Tokens:

```
POST /oauth/token
grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
```

Refresh-Tokens rotieren bei jeder Verwendung. Ersetzen Sie das gespeicherte Refresh-Token immer durch das in der Antwort.

## Sitzungsbeschränkte Tokens

Ein sitzungsbeschränktes Token autorisiert Aktionen auf genau einer Sitzung. Polymux stellt eines aus, wenn Sie eine Sitzung erstellen über:

```
POST /sessions
```

Die Antwort enthält ein Feld `session_token`. Verwenden Sie es bei jedem WebSocket- und HTTP-Aufruf gegen die ID dieser Sitzung. Es läuft ab, wenn die Sitzung endet; keine Erneuerung, keine Verlängerung.

Sitzungsbeschränkte Tokens sind der empfohlene Weg, um einem nicht vertrauenswürdigen Client (einem Web-Frontend, einem kundenorientierten Widget) zu erlauben, sich mit einer Polymux-Sitzung zu verbinden, ohne ein länger lebendes Token zu halten. Erzeugen Sie die Sitzung serverseitig, übergeben Sie das Session-Token an den Client, und der Client sieht nie Ihr PAT.

## Token-Form

Alle Polymux-Tokens sind JWTs, die mit unserem Root-Signaturschlüssel signiert sind. Die Payload ist für Clients opak – parsen Sie sie nicht – aber während des Debuggings hineinzuschauen ist in Ordnung. Standard-Claims:

- `iss` – `polymux.co`.
- `sub` – Benutzer-ID oder OAuth-Client-ID.
- `aud` – Arbeitsbereich-ID, oder `*` für Cross-Workspace-Tokens.
- `scope` – durch Leerzeichen getrennte Scopes.
- `exp` – Ablauf für OAuth- und Session-Tokens; bei PATs nicht vorhanden.

Wenn Sie Tokens in einer Datenbank speichern, hashen Sie sie vor der Speicherung. Der Server verwendet zur Verifizierung die JWT-Signatur, nicht einen Datenbank-Lookup, sodass ein gestohlenes Token gültig ist, solange es nicht widerrufen wurde.

## Fehler

| Code | Bedeutung |
| --- | --- |
| `401 token_missing` | Kein `Authorization`-Header. |
| `401 token_invalid` | Fehlerhaftes oder unsigniertes JWT. |
| `401 token_revoked` | PAT widerrufen oder OAuth-Berechtigung widerrufen. |
| `401 token_expired` | Access-Token abgelaufen; erneuern und erneut versuchen. |
| `403 scope_insufficient` | Token ist gültig, aber es fehlt der erforderliche Scope. |
| `403 workspace_mismatch` | Token ist auf einen anderen Arbeitsbereich beschränkt. |

Jede Fehlerantwort enthält einen `request_id`-Header, den Sie dem Support gegenüber zitieren können.

## Nächste Schritte

- Durchstöbern Sie die Endpoint-Seiten ausgehend von der [API-Übersicht](/documentation/api-overview).
- Für Live-Updates benötigen Sie auch das [WebSocket-Protokoll](/documentation/api-websocket).
- Bauen Sie eine installierbare App? Kombinieren Sie dies mit der [Plugin-Übersicht](/documentation/plugin-overview).
