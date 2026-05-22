# Conceptos básicos de la bóveda

La bóveda es donde guardas las credenciales, claves API y otros secretos que los agentes necesitan para actuar en tu nombre. Todo lo que un agente lee de la bóveda queda registrado, está limitado a la sesión y nunca se devuelve al modelo literalmente — se inyecta directamente en la página o en la llamada a la herramienta.

## Qué va en la bóveda

Hay dos tipos de entradas de bóveda:

- **Contraseñas** — pares de usuario / contraseña limitados a un dominio. El agente las rellena en formularios de inicio de sesión cuando aterriza en una URL coincidente.
- **Entradas de cartera** — claves API, tokens bearer, secretos de cliente OAuth y otros secretos arbitrarios. Estos se inyectan en llamadas a herramientas (cabeceras de petición HTTP, argumentos de CLI) en lugar de escribirse en un formulario.

La bóveda no almacena archivos, certificados ni claves SSH. Usa el [almacenamiento del espacio de trabajo](/documentation/installation) para eso.

## Añadir una entrada

Desde el panel lateral, abre **Bóveda → Contraseñas** o **Bóveda → Cartera** y pulsa **+ Nuevo**. Asigna un nombre a la entrada, el host (para contraseñas) o una forma de clave (para entradas de cartera), y el valor. El valor se cifra en reposo con la clave del espacio de trabajo; nadie — incluidos los ingenieros de Polymux — puede leerlo sin tu autenticación.

## Cómo los agentes acceden a la bóveda

Los agentes no ven los secretos. Cuando un workflow necesita uno, emite una solicitud tipada como _"la contraseña de github.com"_ a la bóveda y Polymux inyecta el valor en la siguiente acción sin nunca colocarlo en la ventana de contexto del agente. El modelo sabe que el secreto existe y para qué sirve; no conoce los caracteres reales.

Si observas que una sesión se pausa y reanuda alrededor de un formulario de inicio de sesión, esa pausa es la bóveda rellenando las credenciales.

## Limitación de alcance

Por defecto, cualquier miembro del espacio de trabajo con el rol **Miembro** o superior puede usar cualquier entrada de bóveda en workflows. Para restringir una entrada, edítala y establece su alcance:

- **Espacio de trabajo** — cualquiera con el rol del espacio de trabajo puede usarla. Por defecto.
- **Workflow** — solo los workflows con los ID listados pueden solicitarla. Útil para claves de alto impacto.
- **Solo propietario** — solo el creador de la entrada puede usarla, incluso en ejecuciones programadas.

Todavía no hay una interfaz de registro de auditoría, pero cada lectura de bóveda se captura en el servidor. Si necesitas obtener el registro de una entrada específica, [contacta con soporte](/contact).

## Rotar un secreto

Abre la entrada, haz clic en **Rotar** y pega el nuevo valor. El valor anterior se elimina — no hay historial de versiones en la bóveda. Los workflows que referenciaban el valor antiguo seguirán funcionando en su próxima ejecución; las sesiones en vuelo siguen manteniendo el valor antiguo en memoria hasta que terminan.

## Qué sucede si elimino una entrada

La eliminación es inmediata e irrecuperable. Cualquier sesión que se pause en una lectura de bóveda para la entrada eliminada fallará con `vault_missing` y requerirá una nueva entrada. Las ejecuciones programadas fallarán de la misma manera. Verás una notificación en el panel para cualquier ejecución fallida.

## Próximos pasos

- ¿Necesitas usar un proveedor OAuth como Google Drive? Lee [Conexiones](/documentation/connections-overview).
- ¿Construyes un workflow que usa entradas de bóveda? Lee [Visión general de plugins](/documentation/plugin-overview) — los workflows empaquetados declaran qué claves de bóveda necesitan para que los instaladores sepan qué proporcionar.
