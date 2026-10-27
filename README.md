# Anthetic Plus Studios

Anthetic Plus Studios is a React, TypeScript, TanStack Start, Vite, and Nitro application with Supabase integrations and a companion Python backend.

## Requirements

- Node.js `>=22.12.0`
- npm `>=10.9.0`
- Python version specified in `backend/.python-version` for backend development

## Frontend setup

```bash
npm ci
cp .env.example .env
npm run dev
```

The committed `package-lock.json` locks dependency versions. Use `npm ci` for reproducible installs; update dependencies deliberately and review the resulting lockfile changes.

The development server listens on `0.0.0.0` by default. Vite prints the local URL when it starts.

## Quality checks

```bash
npm run preflight
npm run typecheck
npm run lint
npm test
npm run build
```

Or run the typecheck, lint, and unit tests together:

```bash
npm run check
```

The production build generates the TanStack Start application and Nitro server output.

## Deployment

### Vercel

The included `vercel.json` configures the npm install/build commands and Nitro's Vercel preset. Import the repository or upload the project to Vercel, use Node.js 22 or newer, and configure the required environment variables in the Vercel project settings.

The build uses `npm run build`; do not set a static-only output directory for this server-rendered application. Cron jobs configured in `vercel.json` require the corresponding API routes and a Vercel plan that supports the configured schedule.

### Other Nitro targets

Nitro supports multiple deployment presets. Set `NITRO_PRESET` to the preset for your target platform and consult that platform's requirements. When no preset is specified, this project uses the generic Cloudflare-compatible output configured in `vite.config.ts`; that default is not a universal deployment target.

For container deployment, the included `Dockerfile` builds the application and runs the Nitro server on port `3000`.

## Environment configuration

Copy `.env.example` to `.env` for local development and configure only the variables required by the features you use. Never commit `.env` files or expose service-role keys, private tokens, or server-only credentials to client-side code.

Supabase projects, authentication providers, API credentials, email delivery, scheduled jobs, and other external services must be configured separately for each environment. A successful frontend build does not prove those services are configured or reachable.

## Backend

The `backend/` directory contains the companion Python service. Its `README.md` documents its setup and configuration. Install and run it independently from the Node.js frontend where required.

## Project structure

- `src/` — frontend application and routes
- `backend/` — Python backend service
- `supabase/` — Supabase configuration and migrations
- `drizzle/` — database schema/migrations
- `scripts/` — project checks and maintenance scripts
- `.github/workflows/` — npm-based CI checks

## Notes

- npm is the supported JavaScript package manager, and `package-lock.json` is committed for reproducible installs.
- Deployment presets and external services are environment-specific.
- Review and configure the environment variables before deploying to production.
