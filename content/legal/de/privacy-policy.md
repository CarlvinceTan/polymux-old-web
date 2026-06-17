_Last updated: June 14, 2026_

Diese Datenschutzrichtlinie beschreibt, wie **Polymux** („wir", „uns" oder „unser") Informationen erfasst, verwendet und weitergibt, wenn Sie unsere Websites, Anwendungen und zugehörigen Dienste (zusammenfassend als **Dienste** bezeichnet) nutzen. Durch die Nutzung der Dienste stimmen Sie dieser Richtlinie zu.

Die Nutzung und Übermittlung von Informationen, die Polymux über Google APIs erhält, an andere Anwendungen erfolgt gemäß der [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), einschließlich der Anforderungen zur eingeschränkten Nutzung.

## Von uns erfasste Informationen

### Von Ihnen bereitgestellte Informationen

Wir erfassen Informationen, die Sie direkt übermitteln – beispielsweise wenn Sie ein Konto erstellen, den Support kontaktieren, Updates abonnieren oder Formulare ausfüllen. Dazu können Ihr Name, Ihre E-Mail-Adresse, Ihre Organisation und der Inhalt Ihrer Nachrichten gehören.

### Automatisch erfasste Informationen

Bei der Nutzung der Dienste können wir automatisch bestimmte technische Daten und Nutzungsdaten erfassen, wie IP-Adresse, Gerätetyp, Browsertyp, Betriebssystem, aufgerufene Seiten, verweisende URLs und ungefähren Standort, der aus der IP abgeleitet wird. Wir können Cookies und ähnliche Technologien verwenden, wie in unserer Cookie-Richtlinie beschrieben.

### Informationen aus Integrationen

Wenn Sie Drittanbieter-Konten verbinden oder Integrationen aktivieren, können wir Informationen gemäß Ihren Einstellungen und den von Ihnen erteilten Berechtigungen von diesen Anbietern erhalten. Weitere spezifische Offenlegungen zu Google APIs finden Sie im Abschnitt **Google-Nutzerdaten** weiter unten.

## Google-Nutzerdaten

Dieser Abschnitt beschreibt, wie Polymux über Google APIs erhaltene Daten aufruft, verwendet, speichert, weitergibt und aufbewahrt. Er gilt immer dann, wenn Sie ein Google-Konto mit Polymux verbinden (z. B. die Gmail- oder Google Drive-Integration).

### Aufgerufene Daten

Wenn Sie ein Google-Konto verbinden, fordert Polymux nur die OAuth-Scopes an, die für den Betrieb der von Ihnen aktivierten Integration erforderlich sind:

- **Grundlegendes Profil** — `userinfo.email` und `userinfo.profile`. Wir erhalten Ihre Google-Konto-E-Mail-Adresse, Ihren Namen und Ihr Profilbild, damit wir das verbundene Konto anzeigen und es mit Ihrem Polymux-Arbeitsbereich verknüpfen können.
- **Gmail** (`https://www.googleapis.com/auth/gmail.modify`) — wenn Sie Gmail verbinden, können wir Ihre Nachrichten und Metadaten lesen, Nachrichten in Ihrem Namen senden, Entwürfe erstellen sowie Labels hinzufügen oder entfernen. Wir fordern **nicht** `gmail.full` an und greifen nicht auf Kontoverwaltungs- oder Einstellungs-APIs zu.
- **Google Drive** (`https://www.googleapis.com/auth/drive.file`) — wenn Sie Google Drive verbinden, können wir nur auf Dateien und Ordner zugreifen, die Polymux selbst erstellt hat oder die Sie explizit über Polymux geöffnet oder hochgeladen haben. Wir **können keine** anderen Dateien in Ihrem Drive lesen, auflisten oder ändern.

Wir fordern keinen Zugriff auf andere Google-Dienste an (z. B. Calendar, Contacts, Photos oder Workspace-Admin-APIs), und Google gewährt ihn uns auch nicht, es sei denn, wir ergänzen und offenbaren diese in einer zukünftigen Aktualisierung dieser Richtlinie.

### Verwendung von Google-Nutzerdaten

Polymux verwendet Google-Nutzerdaten **ausschließlich**, um die von Ihnen ausdrücklich angeforderten nutzerseitigen Funktionen bereitzustellen und zu verbessern. Konkret:

- **Gmail-Daten** werden verwendet, um Ihre Nachrichten innerhalb von Polymux anzuzeigen, Nachrichten in Ihrem Namen zusammenzufassen, zu klassifizieren, zu entwerfen, zu senden oder zu beschriften, wenn Sie diese Aktionen auslösen, sowie um Workflows und Agenten zu betreiben, die Sie konfigurieren.
- **Google Drive-Daten** werden verwendet, um die von Polymux in Ihrem Namen verwalteten Dateien aufzulisten, zu öffnen, zu erstellen, zu aktualisieren und zu organisieren sowie um diese Dateien im Polymux-Dateibrowser, in Workflows und Artefakten anzuzeigen.
- **Profildaten** werden verwendet, um das verbundene Konto in der Benutzeroberfläche und in Prüfprotokollen zu identifizieren.

Wir verwenden Google-Nutzerdaten **nicht** für Werbezwecke, zum Aufbau von Werbeprofilen oder für Zwecke, die nichts mit den nutzerseitigen Funktionen von Polymux zu tun haben.

### Verwendung von KI / LLMs und menschliche Überprüfung

Einige Polymux-Funktionen verarbeiten Google-Nutzerdaten mithilfe von großen Sprachmodellen (LLMs) und anderen automatisierten Systemen, um auf Ihre Anfrage hin Zusammenfassungen, Entwürfe, Antworten, Klassifikationen und ähnliche Ausgaben zu generieren. Wir gestatten LLM-Drittanbietern nicht, Ihre Google-Nutzerdaten für das Training oder die Verbesserung ihrer allgemeinen Modelle zu verwenden. Polymux-Mitarbeiter lesen Ihre Google-Nutzerdaten nicht, außer (a) mit Ihrer ausdrücklichen Genehmigung, (b) aus Sicherheitsgründen (z. B. zur Untersuchung von Missbrauch), (c) zur Einhaltung geltenden Rechts oder (d) wenn die Daten aggregiert und anonymisiert wurden, sodass sie nicht mit Ihnen oder Ihrem Google-Konto in Verbindung gebracht werden können.

### Datenweitergabe

Wir verkaufen, vermieten oder übertragen Google-Nutzerdaten **nicht** an Datenmakler, Werbenetzwerke oder andere Parteien für Werbe- oder unabhängige kommerzielle Zwecke. Wir geben Google-Nutzerdaten nur in den nachstehend beschriebenen begrenzten Fällen und nur soweit erforderlich weiter:

- **An Infrastruktur-Unterauftragsverarbeiter**, die die Dienste in unserem Auftrag hosten oder betreiben (z. B. unsere Cloud-Hosting-, Datenbank- und Objektspeicheranbieter), im Rahmen von Verträgen, die deren Nutzung der Daten auf die Erbringung von Diensten für Polymux beschränken.
- **An KI / LLM-Anbieter**, die wir zur Generierung von Zusammenfassungen, Entwürfen und anderen Ausgaben auf Ihre Anfrage hin einsetzen, unter Bedingungen, die die Verwendung Ihrer Daten zum Training ihrer allgemeinen Modelle untersagen. Wir minimieren das Übermittelte und senden nur die Daten, die zur Erstellung der angeforderten Ausgabe benötigt werden.
- **An andere Google-Dienste**, wenn Sie uns dazu auffordern (z. B. E-Mail über Gmail senden oder eine Datei auf Drive speichern).
- **Aus rechtlichen Gründen**, wenn wir in gutem Glauben davon ausgehen, dass eine Offenlegung durch geltendes Recht, Vorschriften, Gerichtsverfahren oder eine vollstreckbare behördliche Anforderung verlangt wird.
- **Im Rahmen einer Geschäftstransaktion**, wie einer Fusion, Übernahme oder einem Vermögensverkauf, bei der Informationen übertragen werden können, sofern die empfangende Partei diese Richtlinie einhält.
- **Auf Ihre Anweisung oder mit Ihrer Einwilligung**.

### Datenspeicherung und Schutz

Google-Nutzerdaten werden auf Infrastruktur unserer Hosting- und Datenbankdienstleister in den Vereinigten Staaten und/oder der Europäischen Union gespeichert. Wir schützen diese Daten durch:

- **Verschlüsselung während der Übertragung** (TLS 1.2+) für die gesamte Kommunikation zwischen Polymux, Google und Ihrem Browser.
- **Verschlüsselung im Ruhezustand** für unsere Datenbanken und den Objektspeicher.
- **Verschlüsselung auf Anwendungsebene** von OAuth-Zugangs- und Aktualisierungs-Tokens, bevor sie in unsere Datenbank geschrieben werden, unter Verwendung von Schlüsseln, die in unserem Secrets-Manager gespeichert und regelmäßig rotiert werden.
- **Zugriffskontrollen**, die den Zugriff auf Produktionsdaten auf eine kleine Anzahl autorisierter Techniker beschränken, die Single Sign-On, Multi-Faktor-Authentifizierung und Prüfprotokollierung verwenden.
- **Mandantentrennung**, sodass ein Arbeitsbereich nicht auf Google-Nutzerdaten eines anderen Arbeitsbereichs zugreifen kann.
- **Sicherheitsüberprüfungen und -überwachung**, einschließlich Abhängigkeitsscanning, Schwachstellenmanagement und Protokollierung des Zugriffs auf sensible Systeme.

### Datenaufbewahrung und Löschung

Wir bewahren Google-Nutzerdaten nur so lange auf, wie Sie die entsprechende Google-Integration verbunden und Ihr Polymux-Konto aktiv halten, zuzüglich eines kurzen Zeitraums, der für den Betrieb der Dienste erforderlich ist (z. B. Backups und Prüfprotokolle).

Sie können Google-Nutzerdaten jederzeit aus Polymux entfernen:

- **Trennen Sie die Integration** über die Polymux-Seite **Integrationen → Installiert**. Dadurch werden unsere gespeicherten OAuth-Tokens widerrufen und die Löschung zwischengespeicherter Gmail-Nachrichten, Drive-Datei-Metadaten und anderer über diese Integration abgerufener Inhalte ausgelöst, in der Regel innerhalb von 30 Tagen.
- **Widerrufen Sie den Zugriff über Google** unter [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Nach dem Widerruf kann Polymux nicht mehr im Auftrag Ihres Kontos auf Google zugreifen, und wir löschen die zwischengespeicherten Daten wie oben beschrieben.
- **Löschen Sie Ihr Polymux-Konto**, indem Sie uns über die Kontaktseite kontaktieren oder dem produktinternen Konto-Löschvorgang folgen. Wir löschen alle zugehörigen Google-Nutzerdaten, außer wenn wir verpflichtet sind, bestimmte Aufzeichnungen aufzubewahren, um rechtlichen Verpflichtungen nachzukommen oder Streitigkeiten beizulegen.
- **Fordern Sie die Löschung bestimmter Daten an**, indem Sie uns über die Kontaktseite kontaktieren. Wir antworten innerhalb einer angemessenen Frist und bestätigen, sobald die Löschung abgeschlossen ist.

Verbleibende Kopien in verschlüsselten Backups werden gemäß unserem Standard-Backup-Rotationsplan gelöscht (nicht länger als 90 Tage).

## Browser-Erweiterung

Dieser Abschnitt beschreibt die Datenpraktiken der **Polymux-Browser-Erweiterung** — einer optionalen Chrome-Erweiterung, mit der Polymux Browser-Aufgaben in Ihrem eigenen Browser statt in einem serverseitig gehosteten ausführen kann. Er gilt nur, wenn Sie die Erweiterung installieren und mit Ihrem Polymux-Server verbinden.

### Worauf die Erweiterung zugreift

Wenn Sie eine Browser-Aufgabe mit aktivierter Erweiterung starten, öffnet die Erweiterung einen dedizierten Tab und führt **nur in diesem Tab** die vom Aufgabenschritt erforderlichen Schritte aus — Navigation, Lesen der Seite, Klicken, Tippen und Aufnehmen von Screenshots. Dazu verarbeitet sie:

- **Seiteninhalte des für die Aufgabe gesteuerten Tabs** — Text der Seite, Barrierefreiheitsstruktur, Screenshots sowie URL und Titel des Tabs.
- **Ein Kopplungs-Token**, lokal in Ihrem Browser gespeichert, das zum erneuten Verbinden der Erweiterung mit Ihrem Polymux-Server ohne erneute Kopplung verwendet wird.

Die Erweiterung agiert **nur auf Tabs, die sie für eine Polymux-Aufgabe öffnet**. Sie liest nicht Ihren Browserverlauf, Ihre anderen Tabs, Ihre Lesezeichen oder Seiten, für die Sie keine Polymux-Aufgabe gestartet haben.

### Wie die Erweiterung diese Daten verwendet und weitergibt

Seiteninhalte und Aufgabenergebnisse werden über eine verschlüsselte Verbindung an **den Polymux-Server übertragen, mit dem Sie gekoppelt sind** — Ihr eigenes Backend — damit die Aufgabe ausgeführt werden kann und der Fortschritt in Ihrer Polymux-Sitzung angezeigt wird. Diese Daten werden nur an diesen gekoppelten Server gesendet; die Erweiterung sendet sie **nicht** an Dritte und **verkauft oder übermittelt** sie **nicht** für Werbung oder Zwecke, die nichts mit der Ausführung der von Ihnen angeforderten Aufgaben zu tun haben.

Das Kopplungs-Token wird nur im lokalen Erweiterungsspeicher Ihres Browsers gespeichert und ausschließlich zur Authentifizierung der Verbindung mit Ihrem Server verwendet. Sie können die Verbindung jederzeit im Popup der Erweiterung trennen — wobei das gespeicherte Token gelöscht wird — oder die Erweiterung entfernen.

## Verwendung von Informationen

Wir verwenden die von uns erfassten Informationen, um:

- Die Dienste bereitzustellen, zu betreiben und zu verbessern
- Mit Ihnen über Ihr Konto, Support-Anfragen und Produktaktualisierungen zu kommunizieren
- Nutzung, Leistung und Sicherheit zu überwachen und zu analysieren
- Rechtlichen Verpflichtungen nachzukommen und unsere Nutzungsbedingungen durchzusetzen
- Die zum Zeitpunkt der Erfassung oder mit Ihrer Einwilligung beschriebenen Zwecke anderweitig zu erfüllen

## Weitergabe von Informationen

Wir können Informationen weitergeben:

- **An Dienstleister**, die uns unterstützen (z. B. Hosting, Analyse, E-Mail-Zustellung), vorbehaltlich angemessener Schutzmaßnahmen
- **Aus rechtlichen Gründen**, wenn wir glauben, dass eine Offenlegung durch Gesetz, Vorschriften, Gerichtsverfahren oder behördliche Anfragen erforderlich ist
- **Im Zusammenhang mit einer Geschäftstransaktion** wie einer Fusion, Übernahme oder einem Vermögensverkauf, bei der Informationen als Teil dieser Transaktion übertragen werden können
- **Auf Ihre Anweisung oder mit Ihrer Einwilligung**

Wir verkaufen Ihre personenbezogenen Daten nicht im allgemein verstandenen Sinne dieses Begriffs.

## Datenaufbewahrung und Löschung

Wir bewahren Informationen so lange auf, wie es zur Bereitstellung der Dienste, zur Erfüllung rechtlicher Verpflichtungen, zur Beilegung von Streitigkeiten und zur Durchsetzung unserer Vereinbarungen erforderlich ist. Die Aufbewahrungsfristen können je nach Art der Daten und deren Verwendung variieren.

Sie können jederzeit die Löschung Ihrer personenbezogenen Daten beantragen, indem Sie die entsprechende Integration trennen, Ihr Konto über die produktinternen Einstellungen löschen oder uns über die Kontaktseite kontaktieren. Weitere spezifische Offenlegungen zu Google-Nutzerdaten – einschließlich der Möglichkeit, den Zugriff zu widerrufen und die Löschung auszulösen – finden Sie im obigen Abschnitt **Google-Nutzerdaten**.

## Sicherheit

Wir schützen personenbezogene Daten mit branchenüblichen technischen und organisatorischen Maßnahmen, darunter Verschlüsselung während der Übertragung (TLS) und im Ruhezustand, Verschlüsselung auf Anwendungsebene für sensible Zugangsdaten wie OAuth-Tokens, rollenbasierte Zugriffskontrollen mit Multi-Faktor-Authentifizierung für Produktionssysteme, Prüfprotokollierung, Mandantentrennung und routinemäßiges Schwachstellenmanagement. Keine Übertragungs- oder Speichermethode ist vollständig sicher; wir können absolute Sicherheit nicht garantieren.

## Internationale Übermittlungen

Wenn Sie von außerhalb des Landes, in dem wir tätig sind, auf die Dienste zugreifen, können Ihre Daten in Ländern verarbeitet werden, die möglicherweise andere Datenschutzgesetze als Ihre Rechtsordnung haben.

## Ihre Rechte und Wahlmöglichkeiten

Je nach Ihrem Wohnort haben Sie möglicherweise das Recht, auf Ihre personenbezogenen Daten zuzugreifen, diese zu berichtigen, zu löschen oder deren Verarbeitung einzuschränken oder bestimmten Verarbeitungen zu widersprechen. Sie haben möglicherweise auch das Recht auf Datenübertragbarkeit oder auf Einreichung einer Beschwerde bei einer Aufsichtsbehörde. Um diese Rechte gegebenenfalls auszuüben, kontaktieren Sie uns über die auf unserer Kontaktseite angegebenen Details.

Sie können Cookies über Ihre Browser-Einstellungen steuern, wie in unserer Cookie-Richtlinie beschrieben.

## Datenschutz für Kinder

Die Dienste richten sich nicht an Kinder unter 16 Jahren (oder das in Ihrer Rechtsordnung geltende Mindestalter), und wir erfassen wissentlich keine personenbezogenen Daten von Kindern.

## Änderungen dieser Richtlinie

Wir können diese Datenschutzrichtlinie von Zeit zu Zeit aktualisieren. Wir werden die überarbeitete Richtlinie auf dieser Seite veröffentlichen und das Datum „Last updated" aktualisieren. Die weitere Nutzung der Dienste nach Inkrafttreten von Änderungen gilt als Zustimmung zur überarbeiteten Richtlinie, soweit gesetzlich zulässig.

## Kontaktieren Sie uns

Fragen zu dieser Datenschutzrichtlinie können über die Kontaktseite auf unserer Website gesendet werden.
