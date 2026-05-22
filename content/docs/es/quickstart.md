# Inicio rápido

Esta guía te explica cómo crear una cuenta de Polymux, abrir tu primera sesión y ejecutar un agente en un sitio web real en unos cinco minutos.

## 1. Crea una cuenta

Regístrate en [polymux.com](/sign-up) usando una dirección de correo electrónico o Google. Caerás en un espacio de trabajo gratuito llamado _Personal_ — puedes invitar a compañeros más tarde, pero por ahora todo vive aquí.

El plan gratuito incluye tres agentes, dos sesiones de navegador concurrentes y 100 MB de almacenamiento del espacio de trabajo. Eso es suficiente para seguir esta guía y bastante más.

## 2. Inicia tu primer workflow

Desde el panel, pulsa **+ Nuevo workflow** en el panel lateral izquierdo. Se abre un borrador de workflow con un cuadro de chat y un viewport de navegador en vivo acoplado al lado.

Escribe una solicitud como:

> Abre Hacker News y léeme los títulos de las tres historias principales.

Pulsa **Enviar**. El agente abrirá una pestaña del navegador, navegará y transmitirá la página al viewport. Todo lo que lea se muestra en el chat junto con las acciones que realizó.

## 3. Observa al agente trabajar

El viewport de la derecha muestra exactamente lo que ve el agente. Puedes:

- **Pasar el cursor** para resaltar los elementos con los que el agente está a punto de interactuar.
- **Tomar el control** haciendo clic en _Pausar_ — el agente se detiene, tú conduces manualmente y al pulsar _Reanudar_ devuelves el control.
- **Cambiar vistas** entre el navegador en vivo, el grafo del workflow y la galería de artefactos (capturas de pantalla, archivos, descargas) desde el conmutador encima del viewport.

Las sesiones permanecen activas hasta que las cierres o terminen. Cerrar la pestaña no termina la sesión — sigue ejecutándose en el servidor y puedes volver a conectarte desde el panel lateral.

## 4. Guárdalo como workflow

Un chat libre es una sesión. Para hacerlo reutilizable, pulsa **Guardar como workflow** en la parte superior del chat. Polymux captura el prompt del agente, las herramientas utilizadas y las entradas de bóveda que ha referenciado, y lo almacena como un workflow versionado que tu equipo puede volver a ejecutar.

Los workflows también se pueden programar. Desde la página del workflow, cambia a la pestaña **Programar** para ejecutarlos según una expresión cron — diariamente, semanalmente o en un intervalo personalizado.

## 5. Dónde ir después

Ya tienes lo básico. Elige una opción:

- **¿Quieres compartir un workflow con tu equipo?** Lee [Espacios de trabajo y miembros](/documentation/workspaces).
- **¿Almacenas inicios de sesión o claves API?** Lee [Conceptos básicos de la bóveda](/documentation/vault).
- **¿Te has atascado?** Las [preguntas frecuentes](/documentation/faq) cubren los obstáculos más comunes.
- **¿Construyes algo encima de Polymux?** Salta directamente a [Visión general de plugins](/documentation/plugin-overview).
