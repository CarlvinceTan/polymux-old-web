_Last updated: June 14, 2026_

Esta Política de Privacidad describe cómo **Polymux** ("nosotros", "nos" o "nuestro") recopila, usa y comparte información cuando utilizas nuestros sitios web, aplicaciones y servicios relacionados (colectivamente, los **Servicios**). Al usar los Servicios, aceptas esta política.

El uso por parte de Polymux de la información recibida de las API de Google y su transferencia a cualquier otra aplicación se ajustará a la [Política de Datos de Usuario de los Servicios de API de Google](https://developers.google.com/terms/api-services-user-data-policy), incluidos los requisitos de Uso Limitado.

## Información que recopilamos

### Información que tú proporcionas

Recopilamos la información que envías directamente—por ejemplo, cuando creas una cuenta, contactas con soporte, te suscribes a actualizaciones o completas formularios. Esto puede incluir tu nombre, dirección de correo electrónico, organización y el contenido de tus mensajes.

### Información recopilada automáticamente

Cuando utilizas los Servicios, podemos recopilar automáticamente ciertos datos técnicos y de uso, como dirección IP, tipo de dispositivo, tipo de navegador, sistema operativo, páginas vistas, URLs de referencia y ubicación aproximada derivada de la IP. Podemos usar cookies y tecnologías similares tal como se describe en nuestra Política de Cookies.

### Información de integraciones

Si conectas cuentas de terceros o habilitas integraciones, podemos recibir información de acuerdo con tu configuración y los permisos que otorgues a esos proveedores. Consulta la sección **Datos de usuario de Google** a continuación para conocer las divulgaciones adicionales específicas de las API de Google.

## Datos de usuario de Google

Esta sección describe cómo Polymux accede, usa, almacena, comparte y conserva los datos obtenidos a través de las API de Google. Se aplica siempre que conectes una Cuenta de Google a Polymux (por ejemplo, la integración de Gmail o Google Drive).

### Datos a los que se accede

Cuando conectas una Cuenta de Google, Polymux solicita únicamente los ámbitos OAuth necesarios para operar la integración que habilitas:

- **Perfil básico** — `userinfo.email` y `userinfo.profile`. Recibimos la dirección de correo electrónico, el nombre y la foto de perfil de tu cuenta de Google para poder mostrar la cuenta conectada y asociarla con tu espacio de trabajo de Polymux.
- **Gmail** (`https://www.googleapis.com/auth/gmail.modify`) — cuando conectas Gmail, podemos leer tus mensajes y metadatos, enviar mensajes en tu nombre, crear borradores y añadir o eliminar etiquetas. **No** solicitamos `gmail.full` y no accedemos a API de administración de cuentas o configuraciones.
- **Google Drive** (`https://www.googleapis.com/auth/drive.file`) — cuando conectas Google Drive, solo podemos acceder a los archivos y carpetas que el propio Polymux crea o que tú abres o subes explícitamente a través de Polymux. **No podemos** leer, listar ni modificar ningún otro archivo de tu Drive.

No solicitamos, y Google no concede, acceso a otros servicios de Google (por ejemplo, Calendar, Contacts, Photos o API de administración de Workspace) a menos que los añadamos y divulguemos en una actualización futura de esta política.

### Cómo usamos los datos de usuario de Google

Polymux usa los datos de usuario de Google **únicamente** para proporcionar y mejorar las funciones orientadas al usuario que has solicitado explícitamente. En concreto:

- Los **datos de Gmail** se usan para mostrar tus mensajes dentro de Polymux, para resumir, clasificar, redactar, enviar o etiquetar mensajes en tu nombre cuando activas esas acciones, y para potenciar los flujos de trabajo y agentes que configuras.
- Los **datos de Google Drive** se usan para listar, abrir, crear, actualizar y organizar los archivos que Polymux gestiona en tu nombre, y para mostrar esos archivos en el explorador de archivos, flujos de trabajo y artefactos de Polymux.
- Los **datos de perfil** se usan para identificar la cuenta conectada en la interfaz y en los registros de auditoría.

**No** usamos los datos de usuario de Google para servir publicidad, para crear perfiles publicitarios ni para ningún propósito no relacionado con las funciones orientadas al usuario de Polymux.

### Uso de IA / LLM y revisión humana

Algunas funciones de Polymux procesan datos de usuario de Google usando modelos de lenguaje de gran escala (LLM) y otros sistemas automatizados para generar resúmenes, borradores, respuestas, clasificaciones y resultados similares a tu solicitud. No permitimos que los proveedores de LLM de terceros usen tus datos de usuario de Google para entrenar o mejorar sus modelos generalizados. El personal de Polymux no lee tus datos de usuario de Google salvo (a) con tu permiso explícito, (b) por razones de seguridad (por ejemplo, para investigar abusos), (c) para cumplir con la legislación aplicable, o (d) cuando los datos han sido agregados y anonimizados de manera que no puedan vincularse a ti ni a tu cuenta de Google.

### Compartición de datos

**No** vendemos, alquilamos ni transferimos datos de usuario de Google a intermediarios de datos, redes publicitarias ni a ninguna parte con fines publicitarios o comerciales independientes. Compartimos datos de usuario de Google únicamente en los casos limitados que se indican a continuación, y solo en la medida necesaria:

- **Con subprocesadores de infraestructura** que alojan u operan los Servicios en nuestro nombre (por ejemplo, nuestros proveedores de alojamiento en la nube, base de datos y almacenamiento de objetos), bajo contratos que restringen su uso de los datos a la prestación de servicios a Polymux.
- **Con proveedores de IA / LLM** que usamos para generar resúmenes, borradores y otros resultados a tu solicitud, bajo condiciones que prohíben usar tus datos para entrenar sus modelos generalizados. Minimizamos lo que se envía y solo transmitimos los datos necesarios para producir el resultado solicitado.
- **Con otros servicios de Google** cuando nos lo indicas (por ejemplo, enviar un correo electrónico a través de Gmail o guardar un archivo en Drive).
- **Por razones legales**, cuando tenemos una creencia de buena fe de que la divulgación es requerida por la legislación aplicable, reglamentación, proceso legal o solicitud gubernamental ejecutable.
- **En una transacción comercial**, como una fusión, adquisición o venta de activos, donde la información puede transferirse con sujeción a que la parte receptora respete esta política.
- **Con tu indicación o consentimiento**.

### Almacenamiento y protección de datos

Los datos de usuario de Google se almacenan en la infraestructura operada por nuestros proveedores de alojamiento y base de datos en los Estados Unidos y/o la Unión Europea. Protegemos estos datos mediante:

- **Cifrado en tránsito** (TLS 1.2+) para toda comunicación entre Polymux, Google y tu navegador.
- **Cifrado en reposo** para nuestras bases de datos y almacenamiento de objetos.
- **Cifrado a nivel de aplicación** de los tokens de acceso y actualización OAuth antes de escribirlos en nuestra base de datos, usando claves almacenadas en nuestro gestor de secretos y rotadas periódicamente.
- **Controles de acceso** que limitan el acceso a datos de producción a un pequeño número de ingenieros autorizados mediante inicio de sesión único, autenticación multifactor y registros de auditoría.
- **Aislamiento de inquilinos** para que un espacio de trabajo no pueda acceder a los datos de usuario de Google de otro espacio de trabajo.
- **Revisiones de seguridad y monitorización**, incluido el escaneo de dependencias, la gestión de vulnerabilidades y el registro de acceso a sistemas sensibles.

### Retención y eliminación de datos

Conservamos los datos de usuario de Google solo durante el tiempo que mantengas la integración de Google correspondiente conectada y tu cuenta de Polymux activa, más un breve período necesario para operar los Servicios (por ejemplo, copias de seguridad y registros de auditoría).

Puedes eliminar los datos de usuario de Google de Polymux en cualquier momento:

- **Desconecta la integración** desde la página **Integraciones → Instaladas** de Polymux. Esto revoca nuestros tokens OAuth almacenados y activa la eliminación de los mensajes de Gmail en caché, los metadatos de archivos de Drive y otro contenido obtenido a través de esa integración, generalmente en un plazo de 30 días.
- **Revoca el acceso desde Google** en [myaccount.google.com/permissions](https://myaccount.google.com/permissions). Una vez revocado, Polymux ya no podrá llamar a Google en tu nombre, y eliminaremos los datos en caché tal como se indica anteriormente.
- **Elimina tu cuenta de Polymux** contactándonos a través de la página de Contacto o siguiendo el flujo de eliminación de cuenta dentro del producto. Eliminaremos todos los datos de usuario de Google asociados, excepto cuando estemos obligados a conservar registros específicos para cumplir con obligaciones legales o resolver disputas.
- **Solicita la eliminación de datos específicos** contactándonos a través de la página de Contacto. Responderemos en un plazo razonable y confirmaremos cuando la eliminación esté completa.

Las copias residuales en copias de seguridad cifradas se eliminan según nuestro calendario estándar de rotación de copias de seguridad (no más de 90 días).

## Extensión de navegador

Esta sección describe las prácticas de datos de la **extensión de navegador de Polymux** — una extensión opcional de Chrome que permite a Polymux ejecutar tareas de navegador en tu propio navegador en lugar de uno alojado en un servidor. Solo se aplica si instalas la extensión y la vinculas con tu servidor de Polymux.

### A qué accede la extensión

Cuando inicias una tarea de navegador con la extensión habilitada, la extensión abre una pestaña dedicada y, **solo en esa pestaña**, realiza los pasos que la tarea requiere — navegar, leer la página, hacer clic, escribir y capturar capturas de pantalla. Para ello procesa:

- **El contenido de la página de la pestaña que controla para la tarea** — el texto de la página, la estructura de accesibilidad, las capturas de pantalla, y la URL y el título de la pestaña.
- **Un token de emparejamiento**, almacenado localmente en tu navegador, usado para reconectar la extensión con tu servidor de Polymux sin volver a emparejar.

La extensión actúa **solo en las pestañas que abre para una tarea de Polymux**. No lee tu historial de navegación, tus otras pestañas, tus marcadores ni ninguna página en la que no hayas dirigido una tarea de Polymux.

### Cómo la extensión usa y comparte estos datos

El contenido de la página y los resultados de la tarea se transmiten a través de una conexión cifrada al **servidor de Polymux con el que has emparejado** — tu propio backend — para que la tarea pueda ejecutarse y su progreso pueda mostrarse en tu sesión de Polymux. Estos datos solo se envían a ese servidor emparejado; la extensión **no** los envía a terceros y **no** los vende ni transfiere con fines publicitarios ni para ningún propósito ajeno a la ejecución de las tareas que solicitas.

El token de emparejamiento se almacena únicamente en el almacenamiento local de la extensión en tu navegador y se usa solo para autenticar la conexión con tu servidor. Puedes desconectarte en cualquier momento desde la ventana emergente de la extensión — lo que borra el token almacenado — o eliminando la extensión.

## Cómo usamos la información

Usamos la información que recopilamos para:

- Proporcionar, operar y mejorar los Servicios
- Comunicarnos contigo sobre tu cuenta, solicitudes de soporte y actualizaciones del producto
- Monitorizar y analizar el uso, el rendimiento y la seguridad
- Cumplir con las obligaciones legales y hacer cumplir nuestros términos
- Cumplir de otro modo con los propósitos descritos en el momento de la recopilación o con tu consentimiento

## Cómo compartimos la información

Podemos compartir información:

- **Con proveedores de servicios** que nos asisten (por ejemplo, alojamiento, análisis, entrega de correo electrónico), sujeto a las salvaguardas apropiadas
- **Por razones legales** cuando creemos que la divulgación es requerida por ley, reglamentación, proceso legal o solicitud gubernamental
- **En relación con una transacción comercial** como una fusión, adquisición o venta de activos, donde la información puede transferirse como parte de dicha transacción
- **Con tu indicación o consentimiento**

No vendemos tu información personal en el sentido comúnmente entendido de ese término.

## Retención y eliminación de datos

Conservamos la información durante el tiempo necesario para proporcionar los Servicios, cumplir con las obligaciones legales, resolver disputas y hacer cumplir nuestros acuerdos. Los períodos de retención pueden variar según la naturaleza de los datos y cómo se utilizan.

Puedes solicitar la eliminación de tu información personal en cualquier momento desconectando la integración correspondiente, eliminando tu cuenta desde la configuración dentro del producto o contactándonos a través de la página de Contacto. Las divulgaciones adicionales específicas de los datos de usuario de Google—incluido cómo revocar el acceso y activar la eliminación—se proporcionan en la sección **Datos de usuario de Google** anterior.

## Seguridad

Protegemos la información personal mediante medidas técnicas y organizativas estándar de la industria, incluido el cifrado en tránsito (TLS) y en reposo, el cifrado a nivel de aplicación de credenciales sensibles como los tokens OAuth, controles de acceso basados en roles con autenticación multifactor para sistemas de producción, registros de auditoría, aislamiento de inquilinos y gestión rutinaria de vulnerabilidades. Ningún método de transmisión o almacenamiento es completamente seguro; no podemos garantizar seguridad absoluta.

## Transferencias internacionales

Si accedes a los Servicios desde fuera del país donde operamos, tu información puede ser procesada en países que pueden tener leyes de protección de datos diferentes a las de tu jurisdicción.

## Tus derechos y opciones

Dependiendo de dónde vivas, puedes tener derechos para acceder, corregir, eliminar o restringir el procesamiento de tu información personal, u oponerte a cierto procesamiento. También puedes tener derecho a la portabilidad de datos o a presentar una queja ante una autoridad supervisora. Para ejercer estos derechos donde corresponda, contáctanos usando los datos en nuestra página de Contacto.

Puedes controlar las cookies a través de la configuración de tu navegador tal como se describe en nuestra Política de Cookies.

## Privacidad de los menores

Los Servicios no están dirigidos a menores de 16 años (o la edad mínima requerida en tu jurisdicción), y no recopilamos conscientemente información personal de menores.

## Cambios a esta política

Podemos actualizar esta Política de Privacidad de vez en cuando. Publicaremos la política revisada en esta página y actualizaremos la fecha de "Última actualización". El uso continuado de los Servicios después de que los cambios entren en vigor constituye la aceptación de la política revisada, en la medida en que lo permita la ley.

## Contáctanos

Las preguntas sobre esta Política de Privacidad pueden enviarse a través de la página de Contacto de nuestro sitio web.
