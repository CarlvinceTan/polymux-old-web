# Arbeitsbereiche und Mitglieder

Ein Arbeitsbereich ist der gemeinsame Container für alles, was ein Team in Polymux erstellt: Workflows, Tresoreinträge, Dateien, Abrechnung und Mitglieder. Sie gehören mindestens einem Arbeitsbereich an – einem persönlichen – und können Mitglied in beliebig vielen gemeinsam genutzten Arbeitsbereichen sein.

## Einen Arbeitsbereich erstellen

Öffnen Sie in der Seitenleiste den Arbeitsbereich-Wechsler und wählen Sie **+ New workspace**. Geben Sie ihm einen Namen und ein optionales Avatarbild. Der neue Arbeitsbereich ist leer: keine Workflows, keine Tresoreinträge, keine geteilten Dateien. Der Benutzer, der einen Arbeitsbereich erstellt, ist sein erster **Owner**.

## Rollen

Polymux hat vier Rollen, in aufsteigender Reihenfolge der Fähigkeiten:

| Rolle | Kann Workflows ausführen | Kann Workflows bearbeiten | Kann Mitglieder verwalten | Kann Abrechnung verwalten |
| --- | --- | --- | --- | --- |
| Viewer | ja | nein | nein | nein |
| Member | ja | ja | nein | nein |
| Admin | ja | ja | ja | nein |
| Owner | ja | ja | ja | ja |

Sie können die Rolle eines Mitglieds jederzeit in den Arbeitsbereich-Einstellungen ändern. Es muss immer mindestens einen Owner geben; die Rollenauswahl verweigert das Herabstufen des letzten Owners.

## Personen einladen

Fügen Sie in den Arbeitsbereich-Einstellungen eine Liste von E-Mail-Adressen in das Einladungsfeld ein, wählen Sie eine Rolle und drücken Sie **Send invitations**. Jeder Eingeladene erhält eine E-Mail mit einem Link, der nach sieben Tagen abläuft. Ausstehende Einladungen werden auf derselben Einstellungsseite angezeigt; Sie können jede davon erneut senden oder widerrufen.

Wenn der Eingeladene bereits ein Polymux-Konto mit derselben E-Mail-Adresse besitzt, wird er durch die Annahme der Einladung sofort dem Arbeitsbereich hinzugefügt. Hat er noch kein Konto, führt ihn der Einladungslink zunächst durch die Registrierung.

## Arbeitsbereiche wechseln

Der Arbeitsbereich-Wechsler in der Seitenleiste zeigt jeden Arbeitsbereich, dem Sie angehören. Beim Wechseln ändert sich der gesamte Kontext: Die Seitenleiste lädt die Workflows dieses Arbeitsbereichs neu, die Tresor- und Speicher-Tabs werden auf ihn beschränkt, und jeder neue Workflow, den Sie erstellen, gehört ihm. Nichts wird zwischen Arbeitsbereichen geteilt.

## Teilen innerhalb eines Arbeitsbereichs

Standardmäßig sieht jedes Mitglied jeden Workflow, Tresoreintrag und jede Datei im Arbeitsbereich. Es gibt keine ACL pro Ressource – wenn Sie einen kleineren Wirkungsradius brauchen, verwenden Sie einen kleineren Arbeitsbereich.

Es gibt eine Ausnahme: Dateien im **Personal storage** sind privat für den Hochladenden. Um eine Datei oder einen Ordner mit einem Teammitglied zu teilen, öffnen Sie sie im Speicher und wählen Sie **Share with**. Freigaben sind widerrufbar und erscheinen im Tab _Shared with me_ des Empfängers.

## Mitglieder entfernen

Admins und Owner können Mitglieder über die Arbeitsbereich-Einstellungen entfernen. Entfernte Mitglieder verlieren sofort den Zugriff; alle Sitzungen, die sie ausgeführt haben, werden nicht unterbrochen, aber sie können sich nicht mehr verbinden.

Wenn ein entferntes Mitglied die einzige Person ist, die die [Browser-Erweiterung](/documentation/installation#browser-extension) für einen Workflow gekoppelt hat, läuft der Workflow weiter auf gehosteten Browsern – Erweiterungs-Kopplungen sind pro Benutzer, nicht pro Arbeitsbereich.

## Nächste Schritte

- Logins oder API-Schlüssel speichern, die der Arbeitsbereich nutzen soll? Siehe [Tresor-Grundlagen](/documentation/vault).
- Möchten Sie einen Workflow, den Ihr gesamter Arbeitsbereich nutzen kann, ohne ihn neu zu erstellen? Siehe [Plugin-Übersicht](/documentation/plugin-overview) zur Paketierung.
- Auf einen Berechtigungsfehler gestoßen? Sehen Sie sich die [FAQ](/documentation/faq#permissions-errors) an.
