# Erstellen Sie Ihr erstes Plugin

Diese Anleitung nimmt einen bestehenden Workflow und paketiert ihn zu einem installierbaren Plugin. Es wird vorausgesetzt, dass Sie die [Plugin-Übersicht](/documentation/plugin-overview) gelesen haben und einen Workflow in Ihrem Arbeitsbereich besitzen, der von Anfang bis Ende sauber läuft.

## 1. Kandidaten-Workflow auswählen

Öffnen Sie den Workflow, den Sie veröffentlichen möchten. Bevor Sie irgendetwas anderes tun, machen Sie einen Plausibilitäts-Check:

- **Läuft er aus einem Kaltstart?** Lösen Sie einen frischen Lauf mit leerem Chat aus. Alles, was auf vorherigem Kontext beruht – frühere hochgeladene Dateien, mitten in der Sitzung erstellte Tresoreinträge – schlägt für einen Installierenden fehl, der bei Null startet.
- **Sind alle Geheimnisse im Tresor?** Wenn ein Geheimnis wortwörtlich in einen Prompt eingefügt ist, erhält jeder, der das Plugin installiert, es ebenfalls. Verschieben Sie es in den Tresor und referenzieren Sie es per Schlüssel.
- **Sind URLs und IDs konfigurierbar?** Ersetzen Sie fest codierte Organisationsnamen, Sheet-IDs oder Hostnamen durch Workflow-Eingaben, die der Installierende ausfüllen kann.

Ein Workflow, der diese Checkliste besteht, ist gut paketierbereit.

## 2. Öffnen Sie den Publish-Tab

Wechseln Sie auf der Workflow-Seite zum Tab **Publish**. Wenn Sie ihn nicht sehen, beinhaltet Ihre Arbeitsbereichsrolle keine Veröffentlichungsrechte – bitten Sie einen Admin, Sie auf **Member** oder höher hochzustufen.

Der Publish-Tab hat vier Unter-Panels: **Listing**, **Connections**, **Pricing** und **Review**. Wir füllen diese in dieser Reihenfolge aus.

## 3. Listing

Das Listing ist das, was Käufer auf der Marktplatz-Karte und der Detailseite sehen.

- **Name.** 1–40 Zeichen. Vermeiden Sie nachgestellte Versionsnummern – Versionen werden separat verwaltet.
- **Kurzbeschreibung.** Ein Satz, unter 120 Zeichen. Dies erscheint auf der Karte.
- **Lange Beschreibung.** Markdown wird unterstützt. Erklären Sie, was der Workflow tut, was er benötigt und was er produziert. Screenshots helfen.
- **Symbol.** Quadratisches PNG, mindestens 256×256. SVG wird akzeptiert.
- **Kategorie.** Wählen Sie die nächstpassende Option. Kategorien steuern die Marktplatz-Filterung.
- **Tags.** Bis zu fünf frei formulierte Tags. Werden für die Suche verwendet.

## 4. Verbindungen

Polymux scannt den Workflow-Graphen und präsentiert jede externe Abhängigkeit, die er findet: Tresorschlüssel, OAuth-Anbieter, Integrations-IDs. Deklarieren Sie für jede:

- **Ob sie erforderlich oder optional ist.** Optionale Verbindungen erlauben es dem Workflow, in einem reduzierten Modus zu laufen, wenn sie nicht bereitgestellt werden.
- **Anzeigelabel.** Was der Installierende im Installationsdialog sieht. _"OpenAI API key"_ ist besser als der reine Tresor-Schlüsselname.
- **Hilfetext.** Ein kurzer Hinweis, woher der Installierende den Wert beziehen sollte. Verlinken Sie zur Anbieter-Dokumentation, falls relevant.

Wenn die Verbindung der integrierte Google Drive-OAuth-Anbieter ist, autorisiert der Installierende sie während der Installation mit einem Klick. Für jeden anderen Anbieter hängt der Workflow von einer Marktplatz-Integration ab (oder von einem Tresorschlüssel, den der Installierende einfügt); beide werden über denselben Installationsdialog gehandhabt.

Siehe [Plugin-Manifest-Referenz](/documentation/plugin-manifest) für das vollständige Schema dessen, was hier erfasst wird.

## 5. Preisgestaltung

Drei Optionen:

- **Free.** Keine Zahlung, kein Stripe-Setup erforderlich.
- **One-time.** Der Installierende zahlt einmal und besitzt das Plugin in seinem Arbeitsbereich auf unbestimmte Zeit.
- **Subscription.** Monatlich wiederkehrend. Der Installierende kann jederzeit kündigen, das Plugin wird am Ende des Zeitraums deinstalliert.

Für kostenpflichtige Plugins müssen Sie ein Stripe-Konto unter **Settings → Payouts** verbinden. Polymux behält die 15 % Plattformgebühr und zahlt den Rest monatlich aus. Es gibt eine Mindestauszahlungsgrenze von 50 USD.

## 6. Prüfen und einreichen

Das Unter-Panel **Review** zeigt eine Vorschau des Listings, wie es Installierende sehen werden. Sehen Sie sich die Screenshots an, klicken Sie durch die Verbindungs-Prompts und lesen Sie die lange Beschreibung auf Tippfehler durch.

Drücken Sie **Submit for review**. Das Plugin landet in der Warteschlange, und Sie erhalten innerhalb von zwei Werktagen eine E-Mail mit dem Ergebnis. Häufige Ablehnungsgründe sind:

- Die Listing-Beschreibung lässt aus, was das Plugin tatsächlich tut oder welche Daten es berührt.
- Erforderliche Verbindungen sind für einen Außenstehenden nicht klar genug beschriftet.
- Der Workflow enthält Geheimnisse, die in den Tresor gehören.

Sie können das Listing beliebig oft bearbeiten und erneut einreichen.

## 7. Updates veröffentlichen

Sobald ein Plugin live ist, wird jede Änderung am zugrundeliegenden Workflow zu einer _neuen Version_. Versionen werden nicht automatisch veröffentlicht; wählen Sie im Publish-Tab **Promote to public**, um eine Version für bestehende Installierende verfügbar zu machen. Diese können wählen, ob sie aktualisieren oder auf der alten Version bleiben möchten.

Breaking Changes – zum Beispiel die Anforderung einer neuen Verbindung – müssen die Major-Version erhöhen. Polymux warnt die Installierenden, dass sie vor der Anwendung des Updates nach neuen Berechtigungen gefragt werden.

## Nächste Schritte

- Sehen Sie sich das feldweise Schema an: [Plugin-Manifest-Referenz](/documentation/plugin-manifest).
- Fügen Sie Ihrem Plugin eine OAuth-gestützte Integration hinzu: [Verbindungen-Übersicht](/documentation/connections-overview).
- Veröffentlichen Sie Ihr erstes kostenpflichtiges Plugin: [Veröffentlichungs-Checkliste](/documentation/publishing).
