## Package Management

Use the Bun CLI (`bun add`, `bun remove`, etc.) for all dependency changes. Do not manually edit `package.json` or `bun.lock` unless strictly necessary—request approval and provide justification before doing so.

## Project Structure

* The `SidePanel` is persistently fixed on the left across all pages.
* Maintain a clean, consistent directory structure aligned with routing.

## Routing

* Use `index.vue` strictly for default routing.
* Do not embed default page logic inside `index.vue`; delegate to explicit routes.

## Styling

* All colours must be defined in `main.css`.
* When introducing new colours, add them to `main.css` and maintain a consistent, standardised palette.

## Components

* Extract reusable UI into components when:

  * It appears multiple times, or
  * It is not tightly coupled to a single page’s structure.
* Prefer consistency: reuse or mirror existing components (e.g. dropdowns) rather than introducing new styles.

## Refactoring & Hygiene

* Remove unused files, components, and directories after refactoring.
* Update all references (routing, imports, filenames) to reflect structural changes.

## Conventions

* Shorthand references:

  * `chat/create` → `app/pages/chat/[id]/create.vue`
  * `config/settings` → `app/pages/config/settings.vue`
* Before creating new UI elements, check for existing implementations and align with their design and behaviour.
