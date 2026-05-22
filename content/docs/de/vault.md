# Tresor-Grundlagen

Der Tresor ist der Ort, an dem Sie Zugangsdaten, API-Schlüssel und andere Geheimnisse speichern, die Agenten benötigen, um in Ihrem Namen zu handeln. Alles, was ein Agent aus dem Tresor liest, wird protokolliert, auf die Sitzung beschränkt und niemals wortgetreu an das Modell zurückgegeben – es wird direkt in die Seite oder den Werkzeugaufruf eingefügt.

## Was in den Tresor gehört

Es gibt zwei Arten von Tresoreinträgen:

- **Passwords** – Benutzername-/Passwort-Paare, die einer Domain zugeordnet sind. Der Agent füllt sie in Login-Formulare ein, wenn er auf einer passenden URL landet.
- **Wallet entries** – API-Schlüssel, Bearer-Token, OAuth-Client-Secrets und andere beliebige Geheimnisse. Diese werden in Werkzeugaufrufe (HTTP-Request-Header, CLI-Argumente) eingefügt, anstatt in ein Formular eingegeben zu werden.

Der Tresor speichert keine Dateien, Zertifikate oder SSH-Schlüssel. Verwenden Sie dafür den [Arbeitsbereich-Speicher](/documentation/installation).

## Einen Eintrag hinzufügen

Öffnen Sie in der Seitenleiste **Vault → Passwords** oder **Vault → Wallet** und drücken Sie **+ New**. Geben Sie dem Eintrag einen Namen, den Host (bei Passwörtern) oder eine Schlüsselform (bei Wallet-Einträgen) sowie den Wert. Der Wert wird im Ruhezustand mit dem Arbeitsbereich-Schlüssel verschlüsselt; niemand – auch nicht die Polymux-Ingenieure – kann ihn ohne Ihre Authentifizierung zurücklesen.

## Wie Agenten auf den Tresor zugreifen

Agenten sehen keine Geheimnisse. Wenn ein Workflow eines benötigt, sendet er eine typisierte Anfrage wie _"das Passwort für github.com"_ an den Tresor, und Polymux fügt den Wert in die nächste Aktion ein, ohne ihn jemals im Kontextfenster des Agenten zu platzieren. Das Modell weiß, dass das Geheimnis existiert und wofür es da ist; es kennt jedoch nicht die tatsächlichen Zeichen.

Wenn Sie beobachten, wie eine Sitzung an einem Login-Formular pausiert und fortgesetzt wird, ist diese Pause der Tresor, der Anmeldedaten einfügt.

## Geltungsbereich

Standardmäßig kann jedes Arbeitsbereichsmitglied mit der Rolle **Member** oder höher jeden Tresoreintrag in Workflows verwenden. Um einen Eintrag einzuschränken, bearbeiten Sie ihn und legen Sie seinen Geltungsbereich fest:

- **Workspace** – jeder mit einer Arbeitsbereichsrolle kann ihn nutzen. Standard.
- **Workflow** – nur Workflows in den aufgeführten IDs können ihn anfordern. Nützlich für besonders sensible Schlüssel.
- **Owner only** – nur der Ersteller des Eintrags kann ihn verwenden, auch in geplanten Läufen.

Es gibt noch keine UI für ein Audit-Log, aber jeder Tresorzugriff wird serverseitig erfasst. Wenn Sie das Log für einen bestimmten Eintrag benötigen, [wenden Sie sich an den Support](/contact).

## Ein Geheimnis rotieren

Öffnen Sie den Eintrag, klicken Sie auf **Rotate** und fügen Sie den neuen Wert ein. Der vorherige Wert wird gelöscht – es gibt keinen Versionsverlauf im Tresor. Workflows, die den alten Wert referenziert haben, funktionieren beim nächsten Lauf weiterhin; laufende Sitzungen behalten den alten Wert noch im Speicher, bis sie beendet sind.

## Was passiert, wenn ich einen Eintrag lösche

Das Löschen ist sofort und unwiderruflich. Jede Sitzung, die für den gelöschten Eintrag bei einem Tresorzugriff pausiert, schlägt mit `vault_missing` fehl und benötigt einen neuen Eintrag. Geplante Läufe schlagen genauso fehl. Sie sehen im Dashboard eine Benachrichtigung für alle fehlgeschlagenen Läufe.

## Nächste Schritte

- Müssen Sie einen OAuth-Anbieter wie Google Drive verwenden? Lesen Sie [Verbindungen](/documentation/connections-overview).
- Sie erstellen einen Workflow, der Tresoreinträge verwendet? Lesen Sie [Plugin-Übersicht](/documentation/plugin-overview) – paketierte Workflows deklarieren, welche Tresorschlüssel sie benötigen, damit Installierende wissen, was bereitzustellen ist.
