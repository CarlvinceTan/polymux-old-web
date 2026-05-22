# FAQ

Häufige Fragen, gruppiert nach Themen. Wenn Ihre Frage nicht hier ist, ist das [Forum](/forum) der schnellste Ort zum Nachfragen.

## Konto und Abrechnung

### Wie ändere ich meine E-Mail-Adresse?

Öffnen Sie im Dashboard **Settings → Account → Email**. Sie müssen die Änderung sowohl von der alten als auch von der neuen Adresse aus bestätigen, bevor der Wechsel wirksam wird.

### Kann ich Workflows zwischen Arbeitsbereichen verschieben?

Nicht direkt. Der empfohlene Weg ist, den Workflow als [paketierten Workflow](/documentation/plugin-overview) zu veröffentlichen und in den Ziel-Arbeitsbereich zu installieren. Dies übernimmt den Prompt, die Werkzeuge und die Tresor-Referenzen, setzt aber den Lauf-Verlauf zurück.

### Was passiert mit meinen Daten, wenn ich kündige?

Daten des kostenlosen Tarifs werden unbegrenzt aufbewahrt. Bezahlte Tarife werden bei Kündigung auf den kostenlosen Tarif herabgestuft, was zur Folge haben kann, dass die Nutzung über das kostenlose Kontingent hinausgeht. Polymux benachrichtigt Sie 30 Tage lang in der App, bevor etwas gelöscht wird, um Sie wieder unter das Kontingent zu bringen.

## Sitzungen und Workflows

### Warum wurde meine Sitzung getrennt?

Sitzungen werden auf dem Server am Leben gehalten. Wenn Ihr lokaler Browser-Tab geschlossen wird oder das Netzwerk verliert, läuft die Sitzung weiter, und Sie können sie über die Seitenleiste wieder aufnehmen. Wenn die Sitzung selbst endet, sehen Sie einen Statuscode oben im Chat – `idle_timeout`, `budget_exceeded` oder `error` sind die häufigsten.

### Wie lange kann eine Sitzung laufen?

Es gibt keine harte zeitliche Obergrenze, aber jede Sitzung hat ein Token-Budget, das auf ihrem Workflow festgelegt ist. Wenn das Budget aufgebraucht ist, pausiert die Sitzung und fragt nach Genehmigung, bevor sie fortfährt. Das Standardbudget ist großzügig genug, um die meisten mehrstündigen Browser-Aufgaben zu bewältigen.

### Warum ist der Live-Viewport schwarz?

Drei übliche Ursachen:

- **WebRTC ist blockiert** in Ihrem Netzwerk – der Viewport fällt nach ein paar Sekunden auf einen langsameren Polling-Stream zurück. Prüfen Sie das Verbindungssymbol in der Ecke des Viewports; wenn es einen gelben Punkt zeigt, befinden Sie sich im Fallback.
- **Der Agent hat noch nicht navigiert.** Der Viewport bleibt leer, bis der Browser seine erste Seite lädt.
- **Sie führen `?mode=extension` aus**, aber die Erweiterung ist nicht gekoppelt. Öffnen Sie das Erweiterungs-Popup und prüfen Sie das Status-Abzeichen.

### Berechtigungsfehler

Wenn ein Workflow sich mit einem Berechtigungsfehler weigert zu laufen, ist die häufigste Ursache, dass Ihre Arbeitsbereichsrolle das Ausführen von Workflows nicht erlaubt – Viewer können keine Läufe starten. Bitten Sie einen Admin, Sie auf **Member** hochzustufen.

## Tresor und Geheimnisse

### Kann ein Modell meine Passwörter sehen?

Nein. Tresor-Werte werden direkt in Seitenaktionen oder Werkzeugaufrufe eingefügt. Dem Modell wird mitgeteilt, dass ein Geheimnis verwendet wurde, aber es sieht niemals die tatsächlichen Zeichen. Siehe [Tresor-Grundlagen](/documentation/vault#how-agents-access-the-vault) für das vollständige Bild.

### Welche Verschlüsselung verwenden Sie?

Tresoreinträge werden im Ruhezustand mit AES-256-GCM mit einem Schlüssel pro Arbeitsbereich verschlüsselt. Der Arbeitsbereich-Schlüssel selbst ist mit einem Root-Schlüssel umhüllt, der in unserem verwalteten KMS aufbewahrt wird. Wir protokollieren oder speichern niemals entschlüsselte Werte.

### Kann ich Tresoreinträge exportieren?

Es gibt heute keinen Massen-Export. Jeder Eintrag kann auf der Tresor-Seite einzeln angezeigt und kopiert werden. Export-Tools sind auf der Roadmap; das Tracking-Issue befindet sich im [Forum](/forum).

## Plugins und Entwicklerfragen

### Was ist ein Plugin?

Ein _Plugin_ ist ein paketierter Workflow zusammen mit seinen Verbindungen – alles, was eine andere Person braucht, um ihn mit einem einzigen Klick in den eigenen Arbeitsbereich zu installieren. Siehe [Plugin-Übersicht](/documentation/plugin-overview).

### Wie veröffentliche ich ein Plugin?

Öffnen Sie den Workflow, den Sie veröffentlichen möchten, gehen Sie zum Tab **Publish**, füllen Sie die Listing-Felder aus und reichen Sie ihn zur Prüfung ein. Prüfungen werden in der Regel innerhalb von zwei Werktagen abgeschlossen. Siehe [Plugin veröffentlichen](/documentation/publishing) für die vollständige Anleitung.

### Können Plugins die Daten der anderen lesen?

Nein. Jedes Plugin läuft in seiner eigenen Sitzung mit eigenem, eingeschränktem Tresorzugriff. Zwei Plugins, die in denselben Arbeitsbereich installiert sind, können nicht die Tresor-Zugriffe, Dateien oder den Sitzungsverlauf des jeweils anderen sehen.

## Downloads verifizieren

Desktop-Installer und Erweiterungs-`.zip`-Archive sind signiert. Der SHA-256 jedes Releases ist auf der [Installationsseite](/install-apps) neben dem Download aufgeführt. Um beispielsweise eine macOS-`.dmg` zu verifizieren:

```sh
shasum -a 256 Polymux-1.0.0-universal.dmg
```

Vergleichen Sie die Ausgabe mit dem Wert auf der Installationsseite. Wenn sie nicht übereinstimmen, führen Sie den Installer nicht aus – nehmen Sie über [contact](/contact) Kontakt auf.

## Immer noch festgefahren?

Wenn nichts von oben Ihre Frage beantwortet:

1. Durchsuchen Sie das [Forum](/forum) – häufige Probleme werden dort meist diskutiert.
2. Überfliegen Sie die [API-Übersicht](/documentation/api-overview), wenn Sie programmatisch integrieren.
3. Senden Sie eine E-Mail an den Support über die [Kontaktseite](/contact). Geben Sie Ihre Arbeitsbereichs-ID und Sitzungs-ID an (in der URL sichtbar), damit wir Ihren Lauf in unseren Logs finden können.
