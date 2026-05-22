# Veröffentlichungs-Checkliste

Sie haben ein Plugin erstellt, das Listing ausgefüllt, und das _Review_-Panel des Publish-Tabs sieht korrekt aus. Bevor Sie **Submit for review** drücken, gehen Sie diese Checkliste durch. Die meisten Ablehnungen werden durch etwas auf dieser Seite verursacht.

## Der Workflow

- [ ] **Läuft aus einem Kaltstart.** Lösen Sie einen frischen Lauf mit leerem Chat aus. Der Workflow muss im ersten Durchgang einen Endzustand erreichen, ohne dass Sie eingreifen.
- [ ] **Keine fest codierten Geheimnisse.** Durchsuchen Sie den Prompt nach allem, was wie ein Schlüssel, Token, Passwort oder eine E-Mail aussieht. Verschieben Sie jeden Treffer in den Tresor und referenzieren Sie ihn per Schlüssel.
- [ ] **Keine arbeitsbereichsspezifischen Daten.** Interne Hostnamen, Mitglieder-E-Mails, Sheet-IDs, Slack-Kanäle – alles, was ein Installierender möglicherweise ändern möchte, muss eine Workflow-Eingabe sein.
- [ ] **Alle Werkzeuge sind Erstanbieter oder auf dem Marktplatz veröffentlicht.** Ein Plugin, das ein Werkzeug aus Ihrem eigenen privaten Arbeitsbereich importiert, wird zwar installiert, läuft aber für niemand anderen.
- [ ] **Stoppt sauber im Fehlerfall.** Lösen Sie einen bekannten Fehlerpfad aus (falscher Tresoreintrag, Anbieter offline) und bestätigen Sie, dass der Workflow einen nützlichen Fehler ausgibt, anstatt ewig zu laufen.

## Das Listing

- [ ] **Name** ist 1–40 Zeichen, keine Versionsnummer.
- [ ] **Kurzbeschreibung** ist ein Satz, unter 120 Zeichen, und beschreibt, was das Plugin _tut_ – nicht, _womit es gebaut wurde_.
- [ ] **Lange Beschreibung** erklärt, was das Plugin als Eingabe benötigt, was es produziert und welche Daten es berührt. Prüfer lesen dies sorgfältig.
- [ ] **Symbol** ist quadratisch und wird bei 64×64 sauber gerendert.
- [ ] **Screenshots** zeigen das Plugin in Aktion, nicht die Marketing-Website. Zwei bis vier sind ideal.
- [ ] **Kategorie** ist die nächstpassende. _Other_ ist Plugins vorbehalten, die wirklich nirgendwo hineinpassen.
- [ ] **Tags** sind akkurat. Polstern Sie nicht mit unverwandten Begriffen – die Suche stuft Tag-Spam herunter.

## Die Verbindungen

- [ ] **Jede erforderliche Verbindung hat ein `label`, das ein Außenstehender verstehen kann.** _"OpenAI API key"_ ist gut; _"oai_k"_ ist es nicht.
- [ ] **Jede erforderliche Verbindung hat einen `help`-Text**, es sei denn, das Label ist vollständig selbsterklärend (OAuth-Anbieter sind es in der Regel).
- [ ] **Optionale Verbindungen degradieren elegant.** Lösen Sie einen Lauf mit jeder fehlenden optionalen Verbindung aus und bestätigen Sie, dass der Workflow diesen Schritt entweder überspringt oder einen sinnvollen Fehler zurückgibt.
- [ ] **Scopes sind minimal.** Fordern Sie den engsten OAuth-Scope an, mit dem der Workflow funktioniert. Prüfer werden bei zu breiten Berechtigungen Einwände erheben.

## Preisgestaltung (nur kostenpflichtige Plugins)

- [ ] **Stripe Connect ist eingerichtet.** `Settings → Payouts` sollte ein verifiziertes Konto anzeigen.
- [ ] **Währung und Betrag sind korrekt.** Bei Listings kann die Währung nach der Veröffentlichung nicht ohne Kontakt zum Support geändert werden.
- [ ] **Erstattungsrichtlinie** wird in der langen Beschreibung erwähnt. Es gibt keine plattformweite Richtlinie; Sie legen sie fest.

## Nach dem Einreichen

- Prüfungen werden innerhalb von zwei Werktagen abgeschlossen. Sie erhalten eine E-Mail mit dem Ergebnis.
- Bei Ablehnung listet die E-Mail die spezifischen Felder auf, die geändert werden müssen. Korrigieren und erneut einreichen – keine Strafe für mehrere Einreichungen.
- Bei Genehmigung geht das Listing sofort live. Der _New_-Tab des Marktplatzes hebt es für die ersten 7 Tage hervor.

## Versionierung nach dem Launch

Erhöhen Sie die Versionen für jede Änderung, die Sie auf den Workflow pushen:

- **Patch** (`1.0.0 → 1.0.1`) – Bugfix, keine Verhaltensänderung, keine neuen Verbindungen.
- **Minor** (`1.0.0 → 1.1.0`) – neues optionales Verhalten, optionale Verbindungen, zusätzliche Eingaben mit Standardwerten.
- **Major** (`1.0.0 → 2.0.0`) – erforderliche neue Verbindung, entfernte Eingabe, materiell verändertes Verhalten.

Installierende können auf einen Versionsbereich pinnen. Major-Erhöhungen fordern sie auf, sich vor dem Update erneut zu autorisieren.

## Veröffentlichung zurückziehen

Sie können ein Plugin jederzeit über den Publish-Tab vom Marktplatz nehmen. Bestehende Installierende behalten das Plugin laufend, bis sie es deinstallieren; neue Installierende können es nicht finden.

Wenn Sie ein Plugin **im Notfall abschalten** müssen – zum Beispiel, weil Sie entdecken, dass es Daten preisgibt – kontaktieren Sie den Support. Wir können das Plugin serverseitig für alle Installierenden auf einmal deaktivieren.

## Nächste Schritte

- Plugin-Update-Ablauf: [Erstellen Sie Ihr erstes Plugin](/documentation/plugin-build#7-publishing-updates).
- Einen benutzerdefinierten Konnektor erstellen: [Verbindung erstellen](/documentation/connections-build).
- Programmatisches Veröffentlichen: [API-Übersicht](/documentation/api-overview).
