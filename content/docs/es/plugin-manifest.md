# Referencia del manifiesto del plugin

El manifiesto es el documento JSON que Polymux genera desde la pestaña Publicar y almacena junto a cada versión publicada de un plugin. Normalmente no lo editas a mano — el formulario de la pestaña Publicar es la vía de autoría admitida — pero el esquema se documenta aquí para que sepas exactamente qué se serializa.

Un manifiesto tiene este aspecto:

```json
{
  "schema_version": 1,
  "id": "wf_3jK9aXq",
  "version": "1.4.0",
  "name": "Daily HN digest",
  "short_description": "Summarise the top Hacker News stories into a Google Doc.",
  "description_md": "## What it does\n\nEvery morning at 9am, this plugin scrapes...",
  "icon": "icon.png",
  "screenshots": ["screen-01.png", "screen-02.png"],
  "category": "research",
  "tags": ["news", "google-drive", "summary"],
  "connections": [
    {
      "kind": "oauth",
      "provider": "google-drive",
      "label": "Google Drive",
      "scope": ["drive.file"],
      "required": true
    },
    {
      "kind": "vault",
      "key": "openai_api_key",
      "label": "OpenAI API key",
      "help": "Used for the summarisation step. Get one at platform.openai.com.",
      "required": true
    }
  ],
  "inputs": [
    {
      "key": "folder",
      "label": "Destination folder",
      "type": "string",
      "default": "Polymux Digests"
    }
  ],
  "pricing": {
    "kind": "free"
  },
  "changelog_md": "### 1.4.0\n\n- Adds optional comment thread support."
}
```

El resto de esta página recorre cada campo.

## Campos de nivel superior

| Campo | Tipo | Notas |
| --- | --- | --- |
| `schema_version` | entero | Hoy siempre `1`. Polymux lo incrementa cuando se publican cambios disruptivos. |
| `id` | cadena | ID estable del workflow. Polymux lo asigna; no lo cambies. |
| `version` | cadena | Semver. Los incrementos mayores son obligatorios para cambios disruptivos (consulta [Construir un plugin](/documentation/plugin-build#7-publishing-updates)). |
| `name` | cadena | 1–40 caracteres. |
| `short_description` | cadena | Menos de 120 caracteres. Subtítulo de la tarjeta. |
| `description_md` | cadena | Markdown. Cuerpo de la ficha. |
| `icon` | cadena | Ruta a un archivo de icono dentro del paquete. PNG o SVG. |
| `screenshots` | array de cadenas | Opcional. Cada entrada es una ruta dentro del paquete. |
| `category` | cadena | Una de las categorías del marketplace. |
| `tags` | array de cadenas | Hasta 5 etiquetas en formato libre. |

## `connections`

Cada conexión describe un trozo de estado externo que el workflow necesita. Polymux usa esta lista para renderizar el diálogo de instalación.

### Conexiones de bóveda

```json
{
  "kind": "vault",
  "key": "openai_api_key",
  "label": "OpenAI API key",
  "help": "Used for the summarisation step.",
  "required": true
}
```

- `key` debe coincidir con una clave de bóveda referenciada por el workflow.
- `label` es lo que ve el instalador.
- `help` es opcional pero recomendable.
- `required: false` permite que el workflow se ejecute sin el valor, útil para funciones opcionales.

### Conexiones OAuth

```json
{
  "kind": "oauth",
  "provider": "google-drive",
  "label": "Google Drive",
  "scope": ["drive.file"],
  "required": true
}
```

- `provider` debe ser uno de los [proveedores OAuth admitidos](/documentation/connections-overview#supported-providers) — hoy, eso es `google-drive`.
- `scope` es específico del proveedor. Polymux lo valida contra el catálogo del proveedor en el momento de la instalación y rechaza los alcances desconocidos.

### Conexiones de integración

```json
{
  "kind": "integration",
  "integration_id": "stripe",
  "label": "Stripe account",
  "required": true
}
```

`integration_id` es el id de una integración del marketplace de la que depende el workflow (Stripe, AWS, conectores internos, etc.). El id coincide con el slug de marketplace de la integración; si el instalador aún no la tiene, Polymux le pedirá que la instale antes de que el plugin pueda ejecutarse. Consulta [Construir una conexión](/documentation/connections-build) para ver cómo se crean las integraciones.

## `inputs`

Las entradas son parámetros del workflow que el instalador puede configurar en el momento de la instalación y editar después desde la configuración del workflow. Cada entrada es:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `key` | cadena | Identificador en snake_case usado en el grafo del workflow. |
| `label` | cadena | Se muestra en el diálogo de instalación y en la página de configuración. |
| `type` | cadena | `string`, `number`, `boolean`, `select` o `secret`. |
| `default` | varía | Valor por defecto opcional. |
| `options` | array | Obligatorio para `type: "select"`. Cada opción es `{ value, label }`. |
| `help` | cadena | Opcional. Descripción breve mostrada debajo del campo. |

Una entrada `secret` se almacena en la bóveda internamente — úsala para tokens proporcionados en tiempo de ejecución que no quieres registrar.

## `pricing`

Tres formas:

```json
{ "kind": "free" }
```

```json
{
  "kind": "one_time",
  "amount_cents": 4900,
  "currency": "USD"
}
```

```json
{
  "kind": "subscription",
  "amount_cents": 900,
  "currency": "USD",
  "interval": "month"
}
```

La moneda es ISO 4217 — Polymux admite USD, EUR, GBP y JPY hoy. Las cantidades son céntimos enteros (o equivalentes de unidad menor).

## `changelog_md`

Un documento markdown con notas de versión por versión. Polymux solo renderiza la sección para la versión que se está viendo; tú eres responsable de los encabezados de sección, pero el convenio de `### <version>` es el que el diálogo de instalación y la página de la ficha analizan.

## Validación

La pestaña Publicar valida el manifiesto en cada guardado. Si importas un manifiesto de workflow a través de la API, se ejecuta el mismo validador. Errores comunes:

- `connections[i].key` no coincide con ninguna lectura de bóveda en el grafo del workflow.
- `inputs[i].type: "select"` no tiene `options`.
- `pricing.amount_cents` está por debajo del mínimo de la plataforma (1 USD / 100 céntimos).

## Próximos pasos

- Mira cómo experimentan los instaladores el manifiesto: [Visión general de conexiones](/documentation/connections-overview).
- Construye una conexión personalizada de la que otros plugins puedan depender: [Construir una conexión](/documentation/connections-build).
- Pon el plugin en vivo: [Lista de comprobación de publicación](/documentation/publishing).
