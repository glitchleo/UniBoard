# UniBoard

A campus noticeboard where students share opportunities, find teammates, and organize activities.

Built with React, TypeScript, Vite, Tailwind CSS, Node.js, Express, and PostgreSQL.

## Requirements

- Node.js 24 and npm 11 or newer
- PostgreSQL for API mode; the browser demo does not need a database

## Start the browser demo

From the project root:

```powershell
npm ci
npm run dev:web
```

Open [UniBoard](http://127.0.0.1:5173). The demo uses sample data and saves changes in your browser. If `campus/.env` already exists, set `VITE_DATA_MODE=demo` and restart Vite.

## Start with the API and database

Copy the example settings if you have not created your local environment files:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item campus/.env.example campus/.env
```

Set `DATABASE_URL` in `server/.env` to an existing development database. Keep `NODE_ENV=development` and set `VITE_DATA_MODE=api` in `campus/.env`.

```powershell
npm run db:migrate
npm run db:seed  # Optional: add development accounts and sample content
npm run dev
```

Open [UniBoard](http://127.0.0.1:5173). Vite forwards `/api` requests to Express on port 3001. Use `127.0.0.1` consistently for local development.

You can register a new account. In development, the account dialog provides a verification token so you can test without an email provider. Production requires email delivery to be configured.

## Project folders

```text
campus/    React interface, browser state, and frontend tests
server/    Express API, SQL migrations, and server tests
```

## Useful commands

| Command                | Purpose                       |
| ---------------------- | ----------------------------- |
| `npm run check`        | Check TypeScript              |
| `npm test`             | Run automated tests           |
| `npm run build`        | Build the frontend and server |
| `npm run format`       | Format project files          |
| `npm run format:check` | Check formatting              |

Database integration tests require `TEST_DATABASE_URL` pointing to a disposable test database. Live API tests require `UNIBOARD_API_TEST_URL` pointing to a local seeded development API; otherwise these suites are skipped.
