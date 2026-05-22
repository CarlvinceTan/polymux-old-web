# Lista de comprobación de publicación

Has construido un plugin, rellenado la ficha y el panel _Revisar_ de la pestaña Publicar tiene buen aspecto. Antes de pulsar **Enviar a revisión**, repasa esta lista. La mayoría de los rechazos se deben a algo de esta página.

## El workflow

- [ ] **Se ejecuta desde un arranque en frío.** Activa una ejecución nueva con el chat vacío. El workflow debe alcanzar un estado terminal en el primer turno sin que intervengas.
- [ ] **Sin secretos codificados.** Busca en el prompt cualquier cosa que parezca una clave, token, contraseña o correo electrónico. Mueve cada coincidencia a la bóveda y referénciala por clave.
- [ ] **Sin datos específicos del espacio de trabajo.** Nombres de host internos, correos electrónicos de miembros, ID de hojas, canales de Slack — todo lo que un instalador pueda querer cambiar debe ser una entrada del workflow.
- [ ] **Todas las herramientas son de primera parte o están publicadas en el marketplace.** Un plugin que importa una herramienta desde tu propio espacio de trabajo privado se instalará pero nunca se ejecutará para nadie más.
- [ ] **Se detiene limpiamente bajo un fallo.** Activa una ruta de fallo conocida (entrada de bóveda incorrecta, proveedor sin conexión) y confirma que el workflow muestra un error útil en lugar de quedarse girando para siempre.

## La ficha

- [ ] **Nombre** entre 1 y 40 caracteres, sin número de versión.
- [ ] **Descripción breve** es una frase, menos de 120 caracteres, y dice qué _hace_ el plugin — no con qué _está construido_.
- [ ] **Descripción larga** explica qué necesita el plugin como entrada, qué produce y qué datos toca. Los revisores leen esto con atención.
- [ ] **Icono** es cuadrado y se renderiza limpiamente a 64×64.
- [ ] **Capturas de pantalla** muestran el plugin en uso, no el sitio de marketing. De dos a cuatro es el punto óptimo.
- [ ] **Categoría** es la coincidencia más cercana. _Otro_ está reservado para plugins que genuinamente no encajan.
- [ ] **Etiquetas** son precisas. No las llenes con términos no relacionados — la búsqueda penaliza el relleno de etiquetas.

## Las conexiones

- [ ] **Cada conexión obligatoria tiene una `label` que un desconocido pueda entender.** _"Clave API de OpenAI"_ es bueno; _"oai_k"_ no.
- [ ] **Cada conexión obligatoria tiene un texto `help`** a menos que la etiqueta sea totalmente autoexplicativa (los proveedores OAuth normalmente lo son).
- [ ] **Las conexiones opcionales se degradan correctamente.** Activa una ejecución con cada conexión opcional ausente y confirma que el workflow o bien omite ese paso o devuelve un error sensato.
- [ ] **Los alcances son mínimos.** Solicita el alcance OAuth más estrecho que permita al workflow funcionar. Los revisores rechazarán las concesiones amplias.

## Precios (solo plugins de pago)

- [ ] **Stripe Connect está configurado.** `Configuración → Pagos` debe mostrar una cuenta verificada.
- [ ] **Moneda y cantidad son correctas.** Las fichas no pueden tener la moneda cambiada después de publicarse sin contactar con soporte.
- [ ] **La política de reembolsos** se menciona en la descripción larga. No hay política a nivel de plataforma; tú la estableces.

## Después de enviar

- Las revisiones se resuelven en dos días laborables. Recibirás un correo electrónico con el resultado.
- Si es rechazado, el correo electrónico enumera los campos específicos que necesitan cambios. Arregla y reenvía — sin penalización por múltiples envíos.
- Si es aprobado, la ficha entra en vivo inmediatamente. La pestaña _Nuevos_ del marketplace la destaca durante los primeros 7 días.

## Versionado tras el lanzamiento

Incrementa las versiones por cada cambio que envíes al workflow:

- **Parche** (`1.0.0 → 1.0.1`) — corrección de errores, sin cambio de comportamiento, sin nuevas conexiones.
- **Menor** (`1.0.0 → 1.1.0`) — nuevo comportamiento opcional, conexiones opcionales, entradas adicionales con valores por defecto.
- **Mayor** (`1.0.0 → 2.0.0`) — nueva conexión obligatoria, entrada eliminada, comportamiento materialmente diferente.

Los instaladores pueden fijarse a un rango de versión. Los incrementos mayores les piden reautorizar antes de actualizar.

## Despublicar

Puedes retirar un plugin del marketplace en cualquier momento desde la pestaña Publicar. Los instaladores existentes mantienen el plugin en ejecución hasta que lo desinstalan; los nuevos instaladores no pueden encontrarlo.

Si necesitas **eliminar de emergencia** un plugin — por ejemplo, descubres que filtra datos — contacta con soporte. Podemos desactivar el plugin del lado del servidor para todos los instaladores a la vez.

## Próximos pasos

- Flujo de actualización del plugin: [Construye tu primer plugin](/documentation/plugin-build#7-publishing-updates).
- Crea un conector personalizado: [Construir una conexión](/documentation/connections-build).
- Publicación programática: [Visión general de la API](/documentation/api-overview).
