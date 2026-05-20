# Verbindungen-Übersicht

Eine _Verbindung_ ist die Art und Weise, wie ein Workflow die Außenwelt erreicht: ein OAuth-autorisiertes Konto, ein im Tresor gespeicherter API-Schlüssel, eine Erstanbieter-Integration. Plugins deklarieren in ihrem Manifest die Verbindungen, die sie benötigen; Installierende autorisieren diese Verbindungen zur Installationszeit.

Diese Seite ist aus der Sicht des Installierenden geschrieben. Wenn Sie ein Plugin erstellen, lesen Sie auch [Verbindung erstellen](/documentation/connections-build).

## Welche Arten von Verbindungen es gibt

Polymux unterstützt drei Arten von Verbindungen:

### Tresor-Verbindungen

Eine Tresor-Verbindung ist ein typisiertes Geheimnis, das Sie in Polymux einfügen. Der Installationsdialog sagt Ihnen, welchen Schlüssel das Plugin benötigt, welche Form erwartet wird (API-Schlüssel, Bearer-Token, Basic-Auth-Paar) und verlinkt zu der Stelle, wo Sie ihn bekommen.

Tresor-Verbindungen verlassen nie Ihren Arbeitsbereich. Der Plugin-Autor kann sie nicht lesen; Polymux-Ingenieure können sie nicht lesen. Das Einzige, was den Rohwert berührt, ist die Agenten-Aktion, die ihn verwendet.

### OAuth-Verbindungen

OAuth-Verbindungen delegieren die Autorisierung an einen Dritten. Klicken Sie im Installationsdialog auf die Schaltfläche **Authorise**, Sie werden zur Zustimmungs-Seite des Anbieters weitergeleitet, und nach der Rückkehr wird das Token im Tresor Ihres Arbeitsbereichs unter einem anbieter-spezifischen Schlüssel gespeichert.

Tokens werden automatisch erneuert. Schlägt eine Erneuerung fehl (Sie haben die Berechtigung widerrufen, der Anbieter hat rotiert, Ihr Konto wurde deaktiviert), wird die Verbindung als _broken_ markiert, und jedes Plugin, das davon abhängt, pausiert, bis Sie erneut autorisieren.

### Integrations-Verbindungen

Integrationen decken alles ab, was kein eingebauter OAuth-Anbieter ist. Die meisten leben auf dem Marktplatz als von der Community veröffentlichte Konnektoren, die eine Drittanbieter-API umhüllen; Polymux' Manifest beschreibt die Geheimnisse, die der Konnektor benötigt, und die Werkzeuge, die er bereitstellt, und Sie installieren ihn auf die gleiche Weise wie ein Plugin.

Jede Integration hat ihren eigenen Einrichtungsablauf mit anbieter-spezifischen Feldern. Einmal konfiguriert, erscheint eine Integration als Werkzeug, das der Workflow aufrufen kann. Mehrere Plugins können dieselbe Integration nutzen, ohne sich erneut zu autorisieren.

## Unterstützte Anbieter

OAuth-Anbieter, die direkt unterstützt werden:

- Google Drive – treibt das Rückgrat des Arbeitsbereich-Speichers an.

Jeder andere Anbieter lebt auf dem Marktplatz als installierbare **Integration**. Durchsuchen Sie [Marketplace → Integrations](/integrations/marketplace), um zu sehen, was derzeit veröffentlicht ist, oder erstellen Sie Ihre eigene ([Verbindung erstellen](/documentation/connections-build)).

Wenn ein Plugin, das Sie installieren möchten, von einer Integration abhängt, die noch nicht auf dem Marktplatz ist, zeigt die Installation die fehlende Abhängigkeit namentlich an, damit Sie sie holen (oder veröffentlichen) können, bevor Sie es erneut versuchen.

## Ein Plugin mit Verbindungen installieren

Wenn Sie in einem Marktplatz-Listing auf **Install** klicken, öffnet Polymux einen Installationsdialog, der Sie der Reihe nach durch jede erforderliche Verbindung führt:

1. **Beschreibung lesen.** Jede Verbindung hat ein Label, einen Hilfetext und eine erforderlich/optional-Markierung.
2. **Autorisieren.** OAuth-Verbindungen zeigen eine _Authorise_-Schaltfläche. Tresor-Verbindungen zeigen ein Einfügefeld. Integrations-Verbindungen zeigen das jeweilige Anbieter-Formular.
3. **Bestätigen.** Ein Übersichtsbildschirm listet alles auf, worauf das Plugin Zugriff haben wird. Drücken Sie _Install_, um zu bestätigen.

Das Plugin erscheint in der Plugin-Liste Ihres Arbeitsbereichs. Sein erster Lauf erfolgt manuell, es sei denn, das Plugin hat seinen eigenen Zeitplan – in diesem Fall führt Polymux es nach Zeitplan aus.

## Eine kaputte Verbindung wiederherstellen

Klicken Sie in den Einstellungen des Plugins auf **Reconnect** neben einer kaputten Verbindung. Der Dialog führt Sie durch den gleichen Ablauf: Autorisieren / Einfügen / Bestätigen.

Bei OAuth-Anbietern ist die häufigste Ursache für eine kaputte Verbindung, dass das zugrundeliegende Konto gelöscht oder die OAuth-Berechtigung auf Anbieterseite widerrufen wurde. Reconnect übernimmt die neue Berechtigung sauber.

## Eine Verbindung entfernen

Eine Verbindung zu entfernen, während ein Plugin sie noch referenziert, versetzt das Plugin in einen reduzierten Zustand. Optionale Verbindungen werden stillschweigend verworfen; erforderliche Verbindungen führen dazu, dass das Plugin bei seinem nächsten Lauf fehlschlägt.

Sie können eine Verbindung unter **Vault → Connections** entfernen. Die Berechtigung des Anbieters auf seiner Seite wird nicht automatisch widerrufen – um dies zu tun, gehen Sie in die Kontoeinstellungen des Anbieters und widerrufen Sie dort.

## Nächste Schritte

- Erstellen Sie Ihren eigenen Konnektor: [Verbindung erstellen](/documentation/connections-build).
- Sehen Sie sich das Verbindungs-Schema an, wie es im Plugin-Manifest erscheint: [Plugin-Manifest-Referenz](/documentation/plugin-manifest#connections).
- Während der Installation auf einen Berechtigungsfehler gestoßen? Siehe [FAQ](/documentation/faq#permissions-errors).
