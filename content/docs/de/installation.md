# Installation

Sie können Polymux vollständig im Browser nutzen – keine Installation erforderlich. Native Apps und eine Browser-Erweiterung fügen zusätzliche Funktionen hinzu, etwa die Steuerung Ihres eigenen lokalen Browsers anstelle eines gehosteten.

## Web-App

Die Web-App unter [polymux.com](https://polymux.com) ist immer die aktuellste Version. Jede moderne Version von Chromium, Firefox oder Safari funktioniert. Es muss nichts installiert werden; melden Sie sich an und Ihr Arbeitsbereich, Ihre Sitzungen und Workflows sind sofort verfügbar.

## Browser-Erweiterung

Mit der Erweiterung kann eine Polymux-Sitzung einen Tab in **Ihrem lokalen Browser** steuern, anstatt das gehostete Chromium des Servers zu verwenden. Sie ist nützlich, wenn Sie Folgendes benötigen:

- Eine Website, die Ihre bestehenden Login-Cookies verwendet.
- Zugriff auf ein privates Netzwerk, das der gehostete Browser nicht erreichen kann.
- Ein bestimmtes Browser-Profil, eine bestimmte Erweiterungsliste oder einen bestimmten Geräte-Fingerabdruck.

Um sie zu installieren, öffnen Sie die [Installationsseite](/install-apps) und wählen Sie Ihren Browser aus. Wenn die Erweiterung zur Kopplung auffordert, melden Sie sich in einem beliebigen Tab bei Polymux an – die Kopplung erfolgt automatisch und das Popup zeigt _Connected_ an.

Die Erweiterung ist vollständig passiv, solange sie verbunden ist: Sie wird nur aktiv, wenn eine Polymux-Sitzung im Modus `?mode=extension` läuft. Sie können sie jederzeit über das Popup widerrufen.

## Desktop-Apps

Native Apps für macOS, Windows und Linux bieten das volle Polymux-Erlebnis ohne Browser-Tab. Sie befinden sich derzeit in der privaten Beta. Registrieren Sie sich auf der [Installationsseite](/install-apps), um benachrichtigt zu werden, sobald Builds für Ihre Plattform verfügbar sind.

Die Desktop-Apps sind nicht erforderlich – jede Funktion in dieser Dokumentation funktioniert auch in der Web-App.

## Mobile Apps

iOS- und Android-Apps sind auf der Roadmap. Vorerst ist die Web-App responsiv und funktioniert in mobilen Browsern, aber Live-Viewports werden am besten auf dem Desktop gestreamt.

## Systemanforderungen

| Oberfläche | Anforderung |
| --- | --- |
| Web-App | Jeder Browser, der in den letzten 24 Monaten veröffentlicht wurde |
| Erweiterung | Chrome, Edge, Brave oder jedes Chromium 119+ |
| Desktop | macOS 13+, Windows 10+ oder eine beliebige Linux-Distribution aus den letzten 3 Jahren |
| Netzwerk | WebRTC- und WebSocket-Egress auf den Ports 443 / 8080 |

Wenn Ihr Netzwerk WebRTC blockiert, fällt der Live-Viewport auf einen langsameren Polling-Stream zurück. Alles andere funktioniert weiterhin.

## Nächste Schritte

- Neu bei Polymux? Fahren Sie mit [Schnellstart](/documentation/quickstart) fort.
- Sie richten ein Team ein? Lesen Sie [Arbeitsbereiche und Mitglieder](/documentation/workspaces).
- Müssen Sie einen Download überprüfen? Siehe [Updates und Überprüfung](/documentation/faq#verifying-downloads) in der FAQ.
