# Visión general de la API

Polymux expone una API REST + WebSocket para el acceso programático a espacios de trabajo, workflows y sesiones. Todo lo que puedes hacer desde el panel también puedes hacerlo a través de la API — crear sesiones, ejecutar workflows, leer mensajes, instalar plugins.

Esta página es el índice. La autenticación, las formas de los puntos finales individuales y los límites de tasa viven en páginas dedicadas enlazadas al final.

## URL base

```
https://api.polymux.co
```

La aplicación web en `polymux.com` es un origen separado. Llama a la misma API por debajo; puedes usar la que te resulte más natural.

## Autenticación

Cada punto final autenticado acepta un token bearer en la cabecera `Authorization`:

```
Authorization: Bearer <token>
```

Los tokens se emiten desde **Configuración → API → Tokens** en el panel. Están limitados a un espacio de trabajo y tienen uno de tres roles:

| Alcance | Capacidades |
| --- | --- |
| `read` | Solo puntos finales de listado + lectura. |
| `write` | Lectura + crear/actualizar/eliminar en recursos del espacio de trabajo. |
| `admin` | Escritura + gestión de miembros + facturación. |

Los tokens nunca caducan por sí mismos, pero puedes revocarlos desde la misma página. Trátalos como contraseñas — cualquiera con el token puede actuar como el usuario que lo emitió.

Consulta [Autenticación](/documentation/authentication) para ver el modelo completo de tokens, incluidos los tokens limitados por sesión y el flujo de cliente OAuth para aplicaciones instalables.

## Forma del recurso

Cada recurso de la API está bajo el espacio de nombres de un espacio de trabajo. Las URL tienen este aspecto:

```
/workspaces/{workspace_id}/workflows
/workspaces/{workspace_id}/workflows/{workflow_id}/runs
/sessions/{session_id}/messages
```

Hay dos atajos de nivel superior:

- `/sessions/{id}` — las sesiones están limitadas al espacio de trabajo pero puedes direccionarlas globalmente porque el ID incluye el espacio de trabajo. Polymux busca el espacio de trabajo por ti.
- `/me` — el registro de usuario del solicitante a través de los espacios de trabajo.

## Rutas por área

| Área | Página |
| --- | --- |
| Sesiones | [Sesiones](/documentation/api-sessions) |
| Workflows | [Workflows](/documentation/api-workflows) |
| Espacios de trabajo y miembros | [Espacios de trabajo](/documentation/api-workspaces) |
| Bóveda | [Bóveda](/documentation/api-vault) |
| Archivos y subidas | [Archivos](/documentation/api-files) |
| Plugins y marketplace | [Marketplace](/documentation/api-marketplace) |

Cada página enumera cada punto final de su área con el método, la ruta, el alcance requerido y el esquema de petición/respuesta.

## WebSockets

La salida de sesión en vivo se transmite por un WebSocket en:

```
wss://api.polymux.co/session/{session_id}/
```

El primer frame que el servidor envía tras el handshake es una instantánea `session_state`. Los frames posteriores son eventos tipados — `message`, `viewport`, `tool_call`, `tool_result`. El formato de cable completo está documentado en [Protocolo WebSocket](/documentation/api-websocket).

## Paginación

Los puntos finales de listado paginan con cursores:

```http
GET /workspaces/{id}/workflows?limit=50&cursor=eyJpZCI6...
```

Las respuestas incluyen `next_cursor` (null cuando no hay más páginas). Los cursores son opacos — no intentes analizarlos. Incluyen el espacio de trabajo, la consulta y la última fila vista para que la paginación siga siendo consistente bajo escrituras concurrentes.

## Límites de tasa

Predeterminados por token:

- 60 peticiones / minuto en puntos finales de lectura.
- 30 peticiones / minuto en puntos finales de escritura.
- 10 sesiones activas concurrentes.

Las respuestas 429 incluyen `X-RateLimit-Reset` (segundos epoch) y `X-RateLimit-Remaining`. La página de API del panel muestra tu uso actual en vivo.

Si necesitas límites más altos para una integración, menciónalo en el campo de propósito de tu token y los elevaremos. No hay aumento automático.

## SDKs

Bibliotecas cliente oficiales:

- **TypeScript / JavaScript** — `@polymux/sdk` en npm.
- **Python** — `polymux` en PyPI.

Ambas envuelven la API REST + WebSocket y manejan la paginación, los reintentos y el baile de refresco del token bearer. Son lo suficientemente finas como para que las llamadas HTTP directas funcionen bien si prefieres no añadir una dependencia.

## Próximos pasos

- ¿Nuevo en la API? Obtén un token: [Autenticación](/documentation/authentication).
- Escuchar actualizaciones en vivo: [Protocolo WebSocket](/documentation/api-websocket).
- ¿Buscas un punto final específico? Cada área tiene su propia página (consulta _Rutas por área_ más arriba).
