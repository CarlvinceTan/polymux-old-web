# Preguntas frecuentes

Preguntas comunes, agrupadas por tema. Si tu pregunta no aparece aquí, el [foro](/forum) es el lugar más rápido para preguntar.

## Cuenta y facturación

### ¿Cómo cambio mi dirección de correo electrónico?

Desde el panel, abre **Configuración → Cuenta → Correo electrónico**. Tendrás que confirmar el cambio tanto desde la dirección antigua como desde la nueva antes de que el cambio surta efecto.

### ¿Puedo mover workflows entre espacios de trabajo?

No directamente. La vía recomendada es publicar el workflow como un [workflow empaquetado](/documentation/plugin-overview) e instalarlo en el espacio de trabajo de destino. Esto traslada el prompt, las herramientas y las referencias de bóveda pero restablece el historial de ejecuciones.

### ¿Qué pasa con mis datos si cancelo?

Los datos del nivel gratuito se conservan indefinidamente. Los planes de pago se degradan al nivel gratuito al cancelarse, lo que puede hacer que el uso supere la cuota gratuita. Polymux te notificará en la aplicación durante 30 días antes de eliminar cualquier cosa para devolverte por debajo de la cuota.

## Sesiones y workflows

### ¿Por qué se desconectó mi sesión?

Las sesiones se mantienen activas en el servidor. Si la pestaña del navegador local se cierra o pierde la red, la sesión sigue ejecutándose y puedes volver a conectarte desde el panel lateral. Si la sesión en sí termina, verás un código de estado en la parte superior del chat — `idle_timeout`, `budget_exceeded` o `error` son los más comunes.

### ¿Cuánto tiempo puede ejecutarse una sesión?

No hay un límite estricto de tiempo real, pero cada sesión tiene un presupuesto de tokens establecido en su workflow. Cuando se agota el presupuesto, la sesión se pausa y solicita aprobación antes de continuar. El presupuesto por defecto es lo suficientemente generoso para manejar la mayoría de trabajos de navegador de varias horas.

### ¿Por qué el viewport en vivo está en negro?

Tres causas habituales:

- **WebRTC está bloqueado** en tu red — el viewport recurrirá a una transmisión por sondeo más lenta después de unos segundos. Comprueba el icono de conexión en la esquina del viewport; si muestra un punto amarillo, estás en el modo de respaldo.
- **El agente aún no ha navegado.** El viewport permanece en blanco hasta que el navegador carga su primera página.
- **Estás ejecutando en `?mode=extension`** pero la extensión no está emparejada. Abre el popup de la extensión y comprueba la insignia de estado.

### Errores de permisos

Si un workflow se niega a ejecutarse con un error de permisos, la causa más común es que tu rol en el espacio de trabajo no permite ejecutar workflows — los visualizadores no pueden iniciar ejecuciones. Pide a un administrador que te promueva a **Miembro**.

## Bóveda y secretos

### ¿Puede un modelo ver mis contraseñas?

No. Los valores de la bóveda se inyectan directamente en las acciones de la página o en las llamadas a herramientas. Al modelo se le informa de que se usó un secreto pero nunca ve los caracteres reales. Consulta [Conceptos básicos de la bóveda](/documentation/vault#how-agents-access-the-vault) para ver el panorama completo.

### ¿Qué cifrado usan?

Las entradas de la bóveda se cifran en reposo con AES-256-GCM usando una clave por espacio de trabajo. La clave del espacio de trabajo está a su vez envuelta con una clave raíz mantenida en nuestro KMS gestionado. Nunca registramos ni almacenamos valores descifrados.

### ¿Puedo exportar entradas de la bóveda?

Hoy no hay exportación masiva. Cada entrada puede revelarse y copiarse individualmente desde la página de la bóveda. Las herramientas de exportación están en la hoja de ruta; el ticket de seguimiento está en el [foro](/forum).

## Plugins y preguntas de desarrollador

### ¿Qué es un plugin?

Un _plugin_ es un workflow empaquetado más sus conexiones — todo lo que otra persona necesita para instalarlo en su propio espacio de trabajo con un solo clic. Consulta [Visión general de plugins](/documentation/plugin-overview).

### ¿Cómo publico un plugin?

Abre el workflow que quieres publicar, ve a la pestaña **Publicar**, rellena los campos de la ficha y envíalo para revisión. Las revisiones se resuelven normalmente en dos días laborables. Consulta [Publicar un plugin](/documentation/publishing) para ver el recorrido completo.

### ¿Pueden los plugins leer los datos de otros?

No. Cada plugin se ejecuta en su propia sesión con su propio acceso de bóveda limitado. Dos plugins instalados en el mismo espacio de trabajo no pueden ver las lecturas de bóveda, archivos ni el historial de sesiones del otro.

## Verificación de descargas

Los instaladores de escritorio y los archivos `.zip` de la extensión están firmados. El SHA-256 de cada versión se lista en la [página de instalación](/install-apps) junto a la descarga. Para verificar un `.dmg` de macOS, por ejemplo:

```sh
shasum -a 256 Polymux-1.0.0-universal.dmg
```

Compara la salida con el valor de la página de instalación. Si no coinciden, no ejecutes el instalador — ponte en contacto a través de [contacto](/contact).

## ¿Sigues atascado?

Si nada de lo anterior responde a tu pregunta:

1. Busca en el [foro](/forum) — los problemas comunes suelen discutirse allí.
2. Echa un vistazo a la [Visión general de la API](/documentation/api-overview) si estás integrando de forma programática.
3. Escribe a soporte desde la [página de contacto](/contact). Incluye tu ID de espacio de trabajo y el ID de sesión (visibles en la URL) para que podamos encontrar tu ejecución en nuestros registros.
