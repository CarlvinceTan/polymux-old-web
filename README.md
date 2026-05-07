# Nuxt Minimal Starter

Look at the [Nuxt documentation](https://nuxt.com/docs/getting-started/introduction) to learn more.

## Setup

Make sure to install dependencies:

```bash
# npm
npm install

# pnpm
pnpm install

# yarn
yarn install

# bun
bun install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
# npm
npm run dev

# pnpm
pnpm dev

# yarn
yarn dev

# bun
bun run dev
```

### Testing from another device on the LAN

Don't access the dev server via its LAN IP (e.g. `http://192.168.1.x:3000`) — Supabase Auth blocks redirects to RFC1918 private IPs, so Google/OAuth sign-in will silently fall back to the production Site URL. Use SSH port forwarding from the testing device instead:

```bash
ssh -L 3000:localhost:3000 <dev-host>
```

Then open `http://localhost:3000` on the testing device. `localhost` is exempt from the IP block and is already in the Supabase Redirect URLs allow list.

## Production

Build the application for production:

```bash
# npm
npm run build

# pnpm
pnpm build

# yarn
yarn build

# bun
bun run build
```

Locally preview production build:

```bash
# npm
npm run preview

# pnpm
pnpm preview

# yarn
yarn preview

# bun
bun run preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.
