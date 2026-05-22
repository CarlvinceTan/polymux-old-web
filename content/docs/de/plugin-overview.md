# Plugin-Übersicht

Ein Polymux-Plugin ist ein paketierter Workflow, den jemand anderes mit einem Klick in seinen Arbeitsbereich installieren kann. Plugins bündeln den Workflow-Graphen, die Verbindungen, die er benötigt (Tresorschlüssel, OAuth-Anbieter, Integrationen), und ein kleines Manifest, das das Listing beschreibt.

Diese Seite ist der Ausgangspunkt für das Entwicklerhandbuch. Wenn Sie noch keinen Workflow erstellt haben, folgen Sie zuerst dem [Schnellstart](/documentation/quickstart).

## Wann ein Workflow als Plugin paketiert werden sollte

Paketieren Sie einen Workflow, wenn:

- Sie möchten, dass **Teammitglieder in anderen Arbeitsbereichen** ihn nutzen, ohne ihn neu zu erstellen.
- Der Workflow **stabil genug ist, dass Sie ihn nicht zwischen jedem Lauf bearbeiten würden**.
- Er **portable Verbindungen** verwendet – OAuth-Anbieter, öffentliche APIs oder Tresorschlüssel, die ein Installierender bereitstellen kann.

Paketieren Sie einen Workflow _nicht_, wenn er arbeitsbereichsspezifische Daten enthält (in Prompts fest codierte Mitglieder-E-Mails, interne Hostnamen, Single-Tenant-Geheimnisse). Jeder, der das Plugin installiert, erhält eine Kopie dieser Daten.

## Anatomie eines Plugins

Jedes Plugin besteht aus vier Teilen:

1. **Der Workflow-Graph.** Die Knoten, Kanten, Prompts und Werkzeugauswahlen, die Sie im Workflow-Editor erstellt haben. Versioniert gemäß dem eigenen Versionsverlauf des Workflows.
2. **Ein Manifest.** Name, Beschreibung, Symbol, Kategorie, Screenshots und Preisgestaltung. Oberflächen-Metadaten, die vom Marktplatz und vom Installationsdialog verwendet werden.
3. **Ein Verbindungsschema.** Die Tresorschlüssel, OAuth-Anbieter und Integrations-IDs, die der Workflow benötigt, um zu laufen. Polymux verwendet dieses, um den Installierenden zur Installationszeit nach den richtigen Geheimnissen zu fragen.
4. **Ein Changelog.** Frei formulierte Release-Notes pro veröffentlichter Version. Wird auf der Listing-Seite angezeigt.

Die nächsten Seiten gehen jeden dieser Punkte der Reihe nach durch.

## Zwei Arten von paketierter Arbeit

Polymux unterstützt zwei verwandte Artefakte auf dem Marktplatz:

- **Plugins** – paketierte Workflows. In einen Arbeitsbereich importiert, vom Installierenden ausgeführt.
- **Verbindungen** – paketierte Integrationen. Einmal pro Arbeitsbereich importiert, danach jedem Workflow als Werkzeug zur Verfügung stehend.

Dieses Handbuch konzentriert sich auf Plugins, da die meisten Autoren damit beginnen. Verbindungen sind in [Verbindung erstellen](/documentation/connections-build) dokumentiert.

## Distribution

Plugins können auf drei Wegen veröffentlicht werden:

- **Öffentlicher Marktplatz** – gelistet unter [polymux.com/integrations/marketplace](/integrations/marketplace). Jeder mit einem Polymux-Konto kann es installieren. Kostenlos oder kostenpflichtig.
- **Nur Arbeitsbereich** – nur für Mitglieder eines einzelnen Arbeitsbereichs sichtbar. Nützlich für interne Werkzeuge, die Sie nicht öffentlich machen möchten.
- **Nicht gelisteter Link** – über eine direkte URL zugänglich, aber nicht indiziert. Nützlich für geschlossene Beta-Phasen oder bezahlte Distribution außerhalb von Polymux.

Sie wählen die Distribution beim Einreichen; Sie können sie später ohne erneute Prüfung ändern.

## Preisgestaltung und Umsatzbeteiligung

Sie können eine einmalige oder monatliche Gebühr für ein Plugin verlangen. Polymux verarbeitet Zahlungen über Stripe und nimmt eine Plattformgebühr von 15 %. Der Rest wird monatlich an Ihr Stripe Connect-Konto ausgezahlt.

Kostenlose Plugins haben keine Listing-Gebühr und keine Zahlungsintegration einzurichten. Wir empfehlen, mit einer kostenlosen Veröffentlichung zu beginnen und später Preise hinzuzufügen, sobald Sie Installationszahlen haben.

## Nächste Schritte

- Praktisch loslegen: [Erstellen Sie Ihr erstes Plugin](/documentation/plugin-build).
- Das Manifest-Format ansehen: [Plugin-Manifest-Referenz](/documentation/plugin-manifest).
- Erfahren Sie, wie Installierende Tresor- und OAuth-Zugriff autorisieren: [Verbindungen](/documentation/connections-overview).
