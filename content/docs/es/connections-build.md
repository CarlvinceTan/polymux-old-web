# Construir una conexión

Una _conexión_ en Polymux es un puente reutilizable entre un workflow y un proveedor externo. Los plugins consumen conexiones por su nombre; construir una conexión hace que un nuevo proveedor esté disponible para cada plugin del marketplace.

Las conexiones son una vía de autoría más avanzada que los plugins. La mayoría de los autores de plugins solo consumirán conexiones que ya existen en el marketplace. Construye una conexión personalizada cuando:

- El proveedor que necesitas aún no está publicado en el [marketplace](/integrations/marketplace).
- Un conector existente expone la forma incorrecta — por ejemplo, tu plugin necesita un alcance OAuth de grano fino que ningún conector existente solicita.
- Estás trabajando con un proveedor interno de código cerrado.

## Tipos de conexión, resumen

| Tipo | Cuándo construir uno | Superficie de autoría |
| --- | --- | --- |
| Bóveda | El proveedor se autentica con una clave o token estático. | Solo manifiesto — sin código. |
| OAuth | El proveedor usa OAuth2 u OIDC. | Manifiesto más un pequeño manejador. |
| Integración | El proveedor necesita autenticación personalizada, múltiples secretos o flujos no OAuth. | Manifiesto más un manejador completo. |

Las conexiones de bóveda son pura declaración. Las conexiones OAuth y de integración requieren un manejador que se ejecuta en el servidor de Polymux para intercambiar secretos, refrescar tokens y enrutar llamadas a herramientas.

## Conexiones de bóveda (sin código)

Una conexión solo de bóveda se declara enteramente en el manifiesto del plugin. Añádela al array `connections` de tu plugin:

```json
{
  "kind": "vault",
  "key": "stripe_restricted_key",
  "label": "Stripe restricted key",
  "help": "Use a restricted key with `write:checkout-sessions`.",
  "required": true,
  "shape": {
    "kind": "single",
    "field": "value",
    "secret": true
  }
}
```

`shape` describe lo que pega el instalador. `single` es un campo. Otras formas:

- `pair` — usuario + contraseña.
- `tuple` — N campos etiquetados, útil para tríos de estilo `{ access_key, secret_key, region }`.

La bóveda almacena el valor literalmente. Tu workflow llama a una acción de herramienta que saca el secreto de la bóveda y lo inyecta en la cabecera HTTP o flag de CLI correspondiente — consulta [Conceptos básicos de la bóveda](/documentation/vault#how-agents-access-the-vault).

No escribes ningún código de manejador para las conexiones de bóveda.

## Conexiones OAuth

Las conexiones OAuth necesitan un manejador para que Polymux sepa cómo:

- Construir la URL de autorización.
- Intercambiar el código de retorno por tokens.
- Refrescar tokens antes de que caduquen.
- Mostrar un error amigable si la concesión se rompe.

Un manejador es un módulo TypeScript que implementa la interfaz `ConnectorHandler` y vive en `web/server/connectors/`. La superficie mínima es:

```ts
import type { ConnectorHandler } from './types'

export const myProviderConnector: ConnectorHandler = {
  id: 'my-provider',
  label: 'My Provider',
  scopes: ['read:user', 'write:posts'],

  buildAuthorizeUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: useRuntimeConfig().myProviderClientId,
      redirect_uri: redirectUri,
      state,
      scope: 'read:user write:posts',
      response_type: 'code',
    })
    return `https://provider.example.com/oauth/authorize?${params.toString()}`
  },

  async exchangeCode({ code, redirectUri }) {
    const res = await $fetch<TokenResponse>('https://provider.example.com/oauth/token', {
      method: 'POST',
      body: { code, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    })
    return {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      expires_at: Date.now() + res.expires_in * 1000,
    }
  },

  async refresh({ refresh_token }) {
    // ... same shape as exchangeCode
  },

  async dispatchTool({ tool, args, credentials }) {
    // Translate workflow tool calls into HTTP requests
  },
}
```

Registra el manejador en `web/server/connectors/registry.ts`. A partir de ese momento aparece en el marketplace como una conexión que los plugins pueden declarar.

El método `dispatchTool` es donde conectas la API del proveedor con el modelo de herramientas de Polymux. Cada herramienta que un workflow puede invocar se distribuye a través de aquí. Consulta `web/server/connectors/google-drive.ts` para ver la implementación de referencia nativa.

## Conexiones de integración

Las conexiones de integración son las más flexibles — y las que más trabajo requieren para crearse. Úsalas cuando OAuth no encaje:

- Múltiples secretos no relacionados (clave API de Stripe + secreto de webhook + clave publicable).
- Transportes no HTTP (gRPC, TCP en crudo, MQTT).
- Flujos de arranque específicos del proveedor (crear una cuenta de servicio, conceder un rol IAM).

La interfaz es la misma forma `ConnectorHandler` pero también implementas una interfaz de configuración personalizada. Las interfaces de configuración viven en `web/app/components/integration/<provider>/` y siguen las mismas convenciones que el resto del panel.

Esto suele ser un proyecto a nivel de ingeniería de Polymux. Si tienes un proveedor que necesita un conector de integración, abre un hilo en el [foro](/forum) — hemos ayudado a autores de la comunidad a publicarlos de forma nativa.

## Probar una conexión localmente

Ejecuta la aplicación web localmente (`npm run dev` desde `web/`), abre `localhost:3000/integrations/marketplace`, y tu manejador aparecerá con los demás. El flujo completo de OAuth usa la `APP_URL` de tu configuración en tiempo de ejecución como base de redirección, así que asegúrate de que coincide con lo que está registrado en el proveedor.

Para los manejadores OAuth, puedes simular el intercambio de tokens con `npm run script -- test-connector my-provider --code <code>` desde `web/`. El script alimenta una redirección falsa a tu manejador e imprime los tokens. Útil para detectar discrepancias de esquema antes de involucrar una ronda real de OAuth.

## Publicar una conexión

Las conexiones se publican a través de la misma pestaña Publicar que los plugins, pero eliges **Conexión** en lugar de **Plugin** en el formulario de la ficha. Las revisiones son más estrictas — un conector roto rompe a todos los plugins que dependen de él — y podemos pedirte una revisión de código del manejador antes de aprobar.

Las conexiones aprobadas aparecen en el marketplace bajo la pestaña **Conexiones**. Los autores de plugins pueden declararlas inmediatamente en sus manifiestos.

## Próximos pasos

- Empareja esto con [Referencia del manifiesto del plugin](/documentation/plugin-manifest) para conocer el esquema en el que aparece tu conexión.
- Consulta la [Visión general de la API](/documentation/api-overview) si estás llamando a Polymux directamente en lugar de crear dentro de la plataforma.
- ¿Listo para enviar? Lee [Lista de comprobación de publicación](/documentation/publishing).
