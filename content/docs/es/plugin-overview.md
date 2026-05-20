# Visión general de plugins

Un plugin de Polymux es un workflow empaquetado que otra persona puede instalar en su espacio de trabajo con un solo clic. Los plugins agrupan el grafo del workflow, las conexiones que necesita (claves de bóveda, proveedores OAuth, integraciones) y un pequeño manifiesto que describe la ficha.

Esta página es el punto de partida de la guía del desarrollador. Si aún no has construido un workflow, sigue primero el [Inicio rápido](/documentation/quickstart).

## Cuándo empaquetar un workflow como plugin

Empaqueta un workflow cuando:

- Quieras que **compañeros de otros espacios de trabajo** lo usen sin reescribirlo.
- El workflow esté **lo suficientemente estable como para no editarlo** entre cada ejecución.
- Use **conexiones portátiles** — proveedores OAuth, APIs públicas o claves de bóveda que un instalador pueda proporcionar.

_No_ empaquetes un workflow cuando incorpore datos específicos del espacio de trabajo (correos electrónicos de miembros codificados en los prompts, nombres de host internos, secretos de un solo inquilino). Cualquiera que instale el plugin obtendrá una copia de esos datos.

## Anatomía de un plugin

Cada plugin se compone de cuatro piezas:

1. **El grafo del workflow.** Los nodos, aristas, prompts y selecciones de herramientas que creaste en el editor de workflows. Versionado según el propio historial de versiones del workflow.
2. **Un manifiesto.** Nombre, descripción, icono, categoría, capturas de pantalla y precios. Metadatos de superficie usados por el marketplace y el diálogo de instalación.
3. **Un esquema de conexiones.** Las claves de bóveda, proveedores OAuth e ID de integración que el workflow necesita para ejecutarse. Polymux usa esto para pedir al instalador los secretos correctos en el momento de la instalación.
4. **Un changelog.** Notas de versión en formato libre por versión publicada. Se muestran en la página de la ficha.

Las siguientes páginas recorren cada una de estas piezas por turno.

## Dos variantes de trabajo empaquetado

Polymux admite dos artefactos relacionados en el marketplace:

- **Plugins** — workflows empaquetados. Importados a un espacio de trabajo, ejecutados por el instalador.
- **Conexiones** — integraciones empaquetadas. Importadas una vez por espacio de trabajo, luego disponibles para cualquier workflow como herramienta.

Esta guía se centra en los plugins porque es por donde empieza la mayoría de autores. Las conexiones se documentan en [Construir una conexión](/documentation/connections-build).

## Distribución

Los plugins se pueden publicar de tres formas:

- **Marketplace público** — listado en [polymux.com/integrations/marketplace](/integrations/marketplace). Cualquier persona con una cuenta de Polymux puede instalarlo. Gratis o de pago.
- **Solo para el espacio de trabajo** — visible solo para los miembros de un único espacio de trabajo. Útil para herramientas internas que no quieres hacer públicas.
- **Enlace no listado** — accesible mediante URL directa pero no indexado. Útil para una beta cerrada o distribución de pago fuera de Polymux.

Eliges la distribución al enviar; puedes cambiarla más tarde sin volver a enviarlo a revisión.

## Precios y participación en los ingresos

Puedes cobrar una tarifa única o mensual por un plugin. Polymux procesa los pagos a través de Stripe y se queda con una comisión de plataforma del 15%. El resto se paga a tu cuenta de Stripe Connect mensualmente.

Los plugins gratuitos no tienen tarifa de ficha ni integración de pagos que configurar. Recomendamos empezar con una versión gratuita y añadir precios más tarde, una vez que tengas cifras de instalación.

## Próximos pasos

- Manos a la obra: [Construye tu primer plugin](/documentation/plugin-build).
- Consulta el formato del manifiesto: [Referencia del manifiesto del plugin](/documentation/plugin-manifest).
- Aprende cómo los instaladores autorizan el acceso a la bóveda y a OAuth: [Conexiones](/documentation/connections-overview).
