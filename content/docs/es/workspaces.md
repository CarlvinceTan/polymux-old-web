# Espacios de trabajo y miembros

Un espacio de trabajo es el contenedor compartido para todo lo que un equipo construye en Polymux: workflows, entradas de bóveda, archivos, facturación y miembros. Perteneces al menos a un espacio de trabajo — uno personal — y puedes ser miembro de tantos espacios de trabajo compartidos como necesites.

## Crear un espacio de trabajo

Desde el panel lateral, abre el selector de espacios de trabajo y elige **+ Nuevo espacio de trabajo**. Dale un nombre y un avatar opcional. El nuevo espacio de trabajo está vacío: sin workflows, sin entradas de bóveda, sin archivos compartidos. El usuario que crea un espacio de trabajo es su primer **propietario**.

## Roles

Polymux tiene cuatro roles, en orden creciente de capacidad:

| Rol | Puede ejecutar workflows | Puede editar workflows | Puede gestionar miembros | Puede gestionar facturación |
| --- | --- | --- | --- | --- |
| Visualizador | sí | no | no | no |
| Miembro | sí | sí | no | no |
| Administrador | sí | sí | sí | no |
| Propietario | sí | sí | sí | sí |

Puedes cambiar el rol de un miembro en cualquier momento desde la configuración del espacio de trabajo. Siempre debe haber al menos un propietario; el selector de roles se negará a degradar al último propietario.

## Invitar a personas

Desde la configuración del espacio de trabajo, pega una lista de direcciones de correo electrónico en el campo de invitación, elige un rol y pulsa **Enviar invitaciones**. Cada invitado recibe un correo electrónico con un enlace que caduca en siete días. Las invitaciones pendientes aparecen en la misma página de configuración; puedes reenviarlas o revocar cualquiera de ellas.

Si el invitado ya tiene una cuenta de Polymux con el mismo correo electrónico, aceptar la invitación lo añade inmediatamente al espacio de trabajo. Si no tiene cuenta, el enlace de invitación lo lleva primero al registro.

## Cambiar de espacio de trabajo

El selector de espacios de trabajo en el panel lateral muestra todos los espacios de trabajo a los que perteneces. Cambiar de espacio cambia todo el contexto: el panel lateral se recarga con los workflows de ese espacio, las pestañas de bóveda y almacenamiento se limitan a él, y cualquier workflow nuevo que crees pertenecerá a él. Nada se filtra entre espacios de trabajo.

## Compartir dentro de un espacio de trabajo

Por defecto, cada miembro ve todos los workflows, entradas de bóveda y archivos del espacio de trabajo. No hay ACL por recurso — si necesitas un radio de impacto más reducido, usa un espacio de trabajo más pequeño.

Hay una excepción: los archivos en **Almacenamiento personal** son privados del que los sube. Para compartir un archivo o una carpeta con un compañero, ábrelo en el almacenamiento y elige **Compartir con**. Los recursos compartidos son revocables y aparecen en la pestaña _Compartido conmigo_ del destinatario.

## Eliminar miembros

Los administradores y propietarios pueden eliminar miembros desde la configuración del espacio de trabajo. Los miembros eliminados pierden el acceso inmediatamente; cualquier sesión que estuvieran ejecutando no se interrumpe, pero ya no pueden volver a conectarse.

Si un miembro eliminado es la única persona que emparejó la [extensión del navegador](/documentation/installation#browser-extension) para un workflow, el workflow sigue ejecutándose en navegadores alojados — los emparejamientos de extensión son por usuario, no por espacio de trabajo.

## Próximos pasos

- ¿Almacenando inicios de sesión o claves API que el espacio de trabajo debe usar? Consulta [Conceptos básicos de la bóveda](/documentation/vault).
- ¿Quieres un workflow que todo tu espacio de trabajo pueda usar sin reescribirlo? Consulta [Visión general de plugins](/documentation/plugin-overview) para empaquetarlo.
- ¿Te has encontrado con un error de permisos? Revisa las [preguntas frecuentes](/documentation/faq#permissions-errors).
