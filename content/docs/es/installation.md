# Instalación

Puedes usar Polymux completamente en el navegador — sin necesidad de instalar nada. Las aplicaciones nativas y una extensión del navegador añaden capacidades extra, como manejar tu propio navegador local en lugar de uno alojado.

## Aplicación web

La aplicación web en [polymux.com](https://polymux.com) siempre es la última versión. Funciona en cualquier versión moderna de Chromium, Firefox o Safari. No hay nada que instalar; inicia sesión y tu espacio de trabajo, sesiones y workflows estarán disponibles inmediatamente.

## Extensión del navegador

La extensión permite que una sesión de Polymux maneje una pestaña en **tu navegador local** en lugar del Chromium alojado del servidor. Es útil cuando necesitas:

- Un sitio que usa tus cookies de inicio de sesión existentes.
- Acceso a una red privada a la que el navegador alojado no puede llegar.
- Un perfil de navegador específico, una lista de extensiones o una huella digital del dispositivo.

Para instalarla, abre la [página de instalación](/install-apps) y elige tu navegador. Cuando la extensión solicite emparejarse, inicia sesión en Polymux en cualquier pestaña — el emparejamiento ocurre automáticamente y el popup muestra _Conectado_.

La extensión es completamente pasiva mientras está conectada: solo actúa cuando una sesión de Polymux está en `?mode=extension`. Puedes revocarla desde el popup en cualquier momento.

## Aplicaciones de escritorio

Las aplicaciones nativas para macOS, Windows y Linux ofrecen la experiencia completa de Polymux sin una pestaña del navegador. Actualmente están en beta privada. Regístrate en la [página de instalación](/install-apps) para recibir una notificación cuando haya compilaciones disponibles para tu plataforma.

Las aplicaciones de escritorio no son obligatorias — cada función de esta documentación funciona en la aplicación web.

## Aplicaciones móviles

Las aplicaciones para iOS y Android están en la hoja de ruta. Por ahora, la aplicación web es responsive y funciona en navegadores móviles, pero los viewports en vivo se transmiten mejor en escritorio.

## Requisitos del sistema

| Superficie | Requisito |
| --- | --- |
| Aplicación web | Cualquier navegador publicado en los últimos 24 meses |
| Extensión | Chrome, Edge, Brave o cualquier Chromium 119+ |
| Escritorio | macOS 13+, Windows 10+ o cualquier distribución Linux de los últimos 3 años |
| Red | Salida WebRTC y WebSocket en los puertos 443 / 8080 |

Si tu red bloquea WebRTC, el viewport en vivo recurrirá a una transmisión por sondeo más lenta. Todo lo demás seguirá funcionando.

## Próximos pasos

- ¿Nuevo en Polymux? Continúa con [Inicio rápido](/documentation/quickstart).
- ¿Configurando un equipo? Lee [Espacios de trabajo y miembros](/documentation/workspaces).
- ¿Necesitas verificar una descarga? Consulta [Actualizaciones y verificación](/documentation/faq#verifying-downloads) en las preguntas frecuentes.
