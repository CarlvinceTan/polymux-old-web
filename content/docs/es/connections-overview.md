# Visión general de conexiones

Una _conexión_ es la forma en que un workflow llega al mundo exterior: una cuenta autorizada por OAuth, una clave API almacenada en la bóveda, una integración de primera parte. Los plugins declaran las conexiones que necesitan en su manifiesto; los instaladores autorizan esas conexiones en el momento de la instalación.

Esta página se presenta desde el punto de vista del instalador. Si estás construyendo un plugin, lee también [Construir una conexión](/documentation/connections-build).

## Qué tipos de conexiones existen

Polymux admite tres tipos de conexión:

### Conexiones de bóveda

Una conexión de bóveda es un secreto tipado que pegas en Polymux. El diálogo del instalador te dice qué clave necesita el plugin, qué forma espera (clave API, token bearer, par de autenticación básica) y te enlaza a dónde obtenerla.

Las conexiones de bóveda nunca salen de tu espacio de trabajo. El autor del plugin no puede leerlas; los ingenieros de Polymux no pueden leerlas. Lo único que toca el valor crudo es la acción del agente que lo usa.

### Conexiones OAuth

Las conexiones OAuth delegan la autorización a un tercero. Haz clic en el botón **Autorizar** del diálogo de instalación, eres redirigido a la pantalla de consentimiento del proveedor y al volver el token se almacena en la bóveda de tu espacio de trabajo bajo una clave limitada al proveedor.

Los tokens se renuevan automáticamente. Si una renovación falla (revocaste la concesión, el proveedor rotó, tu cuenta fue desactivada), la conexión se marca como _rota_ y cualquier plugin que dependa de ella se pausa hasta que vuelvas a autorizar.

### Conexiones de integración

Las integraciones cubren todo lo que no es un proveedor OAuth integrado. La mayoría vive en el marketplace como conectores publicados por la comunidad que envuelven una API de terceros; el manifiesto de Polymux describe los secretos que el conector necesita y las herramientas que expone, y lo instalas de la misma manera que instalas un plugin.

Cada integración tiene su propio flujo de configuración con campos específicos del proveedor. Una vez configurada, una integración aparece como una herramienta que el workflow puede llamar. Varios plugins pueden compartir la misma integración sin volver a autorizar.

## Proveedores admitidos

Proveedor OAuth admitido de forma nativa:

- Google Drive — alimenta la columna vertebral del almacenamiento del espacio de trabajo.

Cualquier otro proveedor vive en el marketplace como una **integración** instalable. Explora [Marketplace → Integraciones](/integrations/marketplace) para ver qué hay publicado actualmente, o crea la tuya propia ([Construir una conexión](/documentation/connections-build)).

Si un plugin que quieres instalar depende de una integración que aún no está en el marketplace, la instalación mostrará la dependencia faltante por su nombre para que puedas obtenerla (o publicarla) antes de reintentar.

## Instalar un plugin con conexiones

Cuando haces clic en **Instalar** en una ficha del marketplace, Polymux abre un diálogo de instalación que te guía a través de cada conexión requerida en orden:

1. **Lee la descripción.** Cada conexión tiene una etiqueta, un texto de ayuda y una marca de obligatoria/opcional.
2. **Autoriza.** Las conexiones OAuth muestran un botón _Autorizar_. Las conexiones de bóveda muestran un campo para pegar. Las conexiones de integración muestran el formulario correspondiente del proveedor.
3. **Confirma.** Una pantalla resumen enumera todo a lo que el plugin tendrá acceso. Pulsa _Instalar_ para confirmar.

El plugin aparece en la lista de plugins de tu espacio de trabajo. Su primera ejecución es manual a menos que el plugin tenga su propia programación, en cuyo caso Polymux lo ejecuta según la programación.

## Reconectar una conexión rota

Desde la configuración del plugin, haz clic en **Reconectar** junto a cualquier conexión rota. El diálogo te guía por el mismo flujo de autorizar / pegar / confirmar.

Para los proveedores OAuth, la causa más común de una conexión rota es que la cuenta subyacente sea eliminada o que la concesión OAuth haya sido revocada desde el lado del proveedor. Reconectar capta la nueva concesión limpiamente.

## Eliminar una conexión

Eliminar una conexión mientras un plugin sigue referenciándola pone al plugin en un estado degradado. Las conexiones opcionales se descartan silenciosamente; las conexiones obligatorias hacen que el plugin falle en su próxima ejecución.

Puedes eliminar una conexión desde **Bóveda → Conexiones**. La concesión del lado del proveedor no se revoca automáticamente — para hacerlo, ve a la configuración de la cuenta del proveedor y revoca desde allí.

## Próximos pasos

- Crea tu propio conector: [Construir una conexión](/documentation/connections-build).
- Consulta el esquema de la conexión tal como aparece en el manifiesto del plugin: [Referencia del manifiesto del plugin](/documentation/plugin-manifest#connections).
- ¿Te has encontrado con un error de permisos a mitad de la instalación? Consulta las [preguntas frecuentes](/documentation/faq#permissions-errors).
