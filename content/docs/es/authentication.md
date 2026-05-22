# Autenticación

Cada petición autenticada a la API de Polymux lleva un token bearer en la cabecera `Authorization`. Esta página cubre los tres tipos de tokens que emite Polymux, cómo emitirlos y cómo refrescarlos.

Si estás buscando la forma de la URL y el host base, empieza por la [Visión general de la API](/documentation/api-overview).

## Tipos de token

| Tipo | Duración | Cuándo usarlo |
| --- | --- | --- |
| Token de acceso personal (PAT) | Indefinida, revocable | Scripts, herramientas CLI, en cualquier lugar donde controles el secreto. |
| Token de cliente OAuth | 1 hora, el token de refresco rota | Aplicaciones instalables que actúan en nombre de un usuario de Polymux. |
| Token limitado por sesión | Duración de la sesión | Integraciones de corta duración que solo necesitan acceso a una sesión. |

Polymux _no_ emite claves API sin una forma de token — no hay clave que no caduque y que no pueda revocarse.

## Tokens de acceso personal

Abre **Configuración → API → Tokens** en el panel y pulsa **+ Nuevo token**. Verás:

- **Nombre.** Formato libre; se usa para identificar el token en la interfaz de revocación.
- **Alcance.** Uno de `read`, `write`, `admin`. Consulta [Visión general de la API](/documentation/api-overview#authentication).
- **Espacio de trabajo.** El espacio de trabajo contra el que el token autoriza. Elige `*` para un token de toda la cuenta; esto es necesario para `/me` y algunos otros puntos finales entre espacios de trabajo.

El token se muestra **una sola vez**. Cópialo inmediatamente y guárdalo en un lugar seguro — Polymux no retiene el texto plano.

Revoca un token eliminando su fila desde la misma página. La revocación es inmediata e incondicional; las peticiones en vuelo que usan el token fallan con `401 token_revoked`.

## Flujo de cliente OAuth

Si estás construyendo una aplicación que otros usuarios de Polymux instalan (un panel de terceros, un bot de Slack, una extensión de IDE), usa el flujo de código de autorización OAuth2 en lugar de pedir un PAT a los usuarios.

Registra un cliente OAuth desde **Configuración → API → Clientes OAuth**:

- **Nombre** y **URL de la página de inicio** se muestran en la pantalla de consentimiento.
- **URI de redirección** son las URLs a las que se permite a Polymux devolver al usuario. Enumera cada URL que vayas a usar — coincidencia exacta.
- **Alcances** son los alcances que tu aplicación solicitará. Los usuarios ven esto en la pantalla de consentimiento.

El flujo es OAuth2 estándar:

```
1. Redirect the user to:
   https://polymux.com/oauth/authorize
     ?client_id=...&redirect_uri=...&scope=...&state=...&response_type=code

2. The user approves; Polymux redirects to your redirect_uri with ?code=...

3. Exchange the code for tokens:
   POST https://api.polymux.co/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&code=...&client_id=...&client_secret=...&redirect_uri=...

4. Response:
   {
     "access_token": "...",
     "refresh_token": "...",
     "expires_in": 3600,
     "scope": "read write"
   }
```

Refresca antes de que el token de acceso caduque:

```
POST /oauth/token
grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
```

Los tokens de refresco rotan en cada uso. Reemplaza siempre el token de refresco almacenado por el de la respuesta.

## Tokens limitados por sesión

Un token limitado por sesión autoriza acciones en exactamente una sesión. Polymux emite uno cuando creas una sesión a través de:

```
POST /sessions
```

La respuesta incluye un campo `session_token`. Úsalo en cada llamada WebSocket y HTTP contra el ID de esa sesión. Caduca cuando termina la sesión; sin refresco, sin renovación.

Los tokens limitados por sesión son la vía recomendada para permitir que un cliente no confiable (un frontend web, un widget de cara al cliente) se conecte a una sesión de Polymux sin tener un token de mayor duración. Emite la sesión del lado del servidor, entrega el token de sesión al cliente, y el cliente nunca ve tu PAT.

## Forma del token

Todos los tokens de Polymux son JWTs firmados con nuestra clave de firma raíz. El payload es opaco para los clientes — no lo analices — pero inspeccionarlo durante la depuración está bien. Reclamaciones estándar:

- `iss` — `polymux.co`.
- `sub` — ID de usuario o ID de cliente OAuth.
- `aud` — ID del espacio de trabajo, o `*` para tokens entre espacios de trabajo.
- `scope` — alcances separados por espacios.
- `exp` — caducidad para tokens OAuth y de sesión; ausente para PATs.

Si almacenas tokens en una base de datos, hashea-los antes de almacenarlos. El servidor usa la firma JWT para verificar, no una búsqueda en la base de datos, así que un token robado es válido mientras no haya sido revocado.

## Errores

| Código | Significado |
| --- | --- |
| `401 token_missing` | Sin cabecera `Authorization`. |
| `401 token_invalid` | JWT malformado o sin firmar. |
| `401 token_revoked` | PAT revocado o concesión OAuth revocada. |
| `401 token_expired` | Token de acceso caducado; refresca y reintenta. |
| `403 scope_insufficient` | El token es válido pero le falta el alcance requerido. |
| `403 workspace_mismatch` | El token está limitado a un espacio de trabajo diferente. |

Cada respuesta de error incluye una cabecera `request_id` que puedes citar a soporte.

## Próximos pasos

- Explora las páginas de puntos finales desde la [Visión general de la API](/documentation/api-overview).
- Para actualizaciones en vivo, también necesitas el [Protocolo WebSocket](/documentation/api-websocket).
- ¿Construyes una aplicación instalable? Empareja esto con [Visión general de plugins](/documentation/plugin-overview).
