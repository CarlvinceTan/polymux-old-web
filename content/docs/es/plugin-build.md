# Construye tu primer plugin

Este recorrido toma un workflow existente y lo empaqueta en un plugin instalable. Da por hecho que has leído la [Visión general de plugins](/documentation/plugin-overview) y que tienes un workflow en tu espacio de trabajo que se ejecuta limpiamente de principio a fin.

## 1. Elige un workflow candidato

Abre el workflow que quieres publicar. Antes de hacer nada más, pasa una revisión de cordura:

- **¿Se ejecuta desde un arranque en frío?** Activa una ejecución nueva con el chat vacío. Cualquier cosa que dependa de contexto previo — archivos subidos antes, entradas de bóveda creadas a mitad de sesión — fallará para un instalador que empieza de cero.
- **¿Están todos los secretos en la bóveda?** Si un secreto está pegado literalmente en un prompt, cualquiera que instale el plugin lo obtiene también. Muévelo a la bóveda y referénciedolo por clave.
- **¿Las URL y los ID son configurables?** Reemplaza los nombres de organización codificados, los ID de hojas o los nombres de host por entradas del workflow que el instalador pueda rellenar.

Un workflow que pasa esta lista de comprobación está en buena forma para empaquetar.

## 2. Abre la pestaña Publicar

En la página del workflow, cambia a la pestaña **Publicar**. Si no la ves, tu rol en el espacio de trabajo no incluye derechos de publicación — pide a un administrador que te promueva a **Miembro** o superior.

La pestaña Publicar tiene cuatro subpaneles: **Ficha**, **Conexiones**, **Precios** y **Revisar**. Los rellenaremos en orden.

## 3. Ficha

La ficha es lo que ven los compradores en la tarjeta del marketplace y en la página de detalle.

- **Nombre.** 1–40 caracteres. Evita los números de versión al final — las versiones se rastrean por separado.
- **Descripción breve.** Una frase, menos de 120 caracteres. Esto aparece en la tarjeta.
- **Descripción larga.** Markdown admitido. Explica qué hace el workflow, qué necesita y qué produce. Las capturas de pantalla ayudan.
- **Icono.** PNG cuadrado, 256×256 como mínimo. Se acepta SVG.
- **Categoría.** Elige la coincidencia más cercana. Las categorías impulsan el filtrado del marketplace.
- **Etiquetas.** Hasta cinco etiquetas en formato libre. Se usan para la búsqueda.

## 4. Conexiones

Polymux escanea el grafo del workflow y presenta cada dependencia externa que encuentra: claves de bóveda, proveedores OAuth, ID de integración. Para cada una, declara:

- **Si es obligatoria u opcional.** Las conexiones opcionales permiten que el workflow se ejecute en un modo degradado si no se proporciona.
- **Etiqueta visible.** Lo que el instalador ve en el diálogo de instalación. _"Clave API de OpenAI"_ es mejor que el nombre crudo de la clave de bóveda.
- **Texto de ayuda.** Una pista breve que explica de dónde debe obtener el valor el instalador. Enlaza a la documentación del proveedor si es pertinente.

Si la conexión es el proveedor OAuth integrado de Google Drive, el instalador lo autoriza con un solo clic durante la instalación. Para cualquier otro proveedor, el workflow depende de una integración del marketplace (o de una clave de bóveda que el instalador pega); ambas se gestionan a través del mismo diálogo de instalación.

Consulta [Referencia del manifiesto del plugin](/documentation/plugin-manifest) para ver el esquema completo de lo que se captura aquí.

## 5. Precios

Tres opciones:

- **Gratis.** Sin pago, sin configuración de Stripe necesaria.
- **Pago único.** El instalador paga una vez, posee el plugin en su espacio de trabajo indefinidamente.
- **Suscripción.** Recurrente mensual. El instalador puede cancelar en cualquier momento, el plugin se desinstala al final del período.

Para los plugins de pago, debes conectar una cuenta de Stripe desde **Configuración → Pagos**. Polymux retiene la comisión de plataforma del 15% y paga el resto mensualmente. Hay un umbral mínimo de pago de 50 USD.

## 6. Revisar y enviar

El subpanel **Revisar** previsualiza la ficha tal como la verán los instaladores. Mira las capturas de pantalla, haz clic por los mensajes de conexión y lee la descripción larga buscando erratas.

Pulsa **Enviar a revisión**. El plugin entra en la cola y recibirás un correo electrónico en un plazo de dos días laborables con el resultado. Los motivos de rechazo más comunes son:

- La descripción de la ficha omite lo que el plugin realmente hace o qué datos toca.
- Las conexiones obligatorias no están etiquetadas con suficiente claridad para que un desconocido las entienda.
- El workflow incluye secretos que deberían estar en la bóveda.

Puedes editar la ficha y reenviar tantas veces como quieras.

## 7. Publicar actualizaciones

Una vez que un plugin esté en vivo, cualquier cambio en el workflow subyacente se convierte en una _nueva versión_. Las versiones no se publican automáticamente; desde la pestaña Publicar elige **Promocionar a público** para que una versión esté disponible para los instaladores existentes. Pueden elegir actualizar o quedarse en la versión antigua.

Los cambios disruptivos — por ejemplo, requerir una nueva conexión — deben incrementar la versión mayor. Polymux advierte a los instaladores de que se les pedirá nuevos permisos antes de aplicar la actualización.

## Próximos pasos

- Consulta el esquema campo por campo: [Referencia del manifiesto del plugin](/documentation/plugin-manifest).
- Añade una integración respaldada por OAuth a tu plugin: [Visión general de conexiones](/documentation/connections-overview).
- Publica tu primer plugin de pago: [Lista de comprobación de publicación](/documentation/publishing).
