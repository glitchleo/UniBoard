# Deployment guide

The recommended starting point is **one Render Node web service** serving the compiled Express API and built React frontend, with **Neon PostgreSQL** for shared data. This keeps the browser and API on one origin, and avoids operating a separate frontend host for the initial project.

This is a deployment plan. It does not claim that a Render service, Neon database, custom domain, email provider, or production release has already been created. The frontend has selectable demo and API modes; a shared deployment must build API mode, connect a migrated database, and complete operational email/moderation/upload requirements before a public MVP release.

Provider recommendations and the cited limitations were reviewed on **October 15, 2026**. Check the linked provider pages again before relying on a plan for a pilot or public launch.

## Why these services

| Service                         | Responsibility                                                            | Practical limit                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render Node web service         | Run Node/Express and serve the built frontend.                            | A free service spins down after 15 minutes without inbound traffic. Its filesystem is ephemeral. See [Render free instances](https://render.com/docs/free). |
| Neon PostgreSQL                 | Store accounts, sessions, memberships, posts, comments, and related data. | Free-plan quotas and included features can change. Check [Neon's current pricing](https://neon.com/pricing) rather than designing around a copied quota.    |
| Email provider, to be connected | Deliver verification and password-reset email.                            | The backend requires a configured integration for production email flows. A local token or preview notice is not email delivery.                            |
| Object storage, to be designed  | Store real uploaded photos/attachments durably.                           | Render's ephemeral local disk is unsuitable for persistent user uploads.                                                                                    |

Render's free PostgreSQL database expires after 30 days. Use Neon for the persistent database in this proposed setup, and review retention/backup features before collecting real student data. See [Render's free-service limits](https://render.com/docs/free).

Free hosting is useful for a learning project and a limited pilot. A service waking from inactivity can respond slowly on the first request. Decide whether that is acceptable before inviting a campus to rely on it.

## 1. Prepare the application

From the repository root, use the same checks you expect CI to run:

```powershell
npm ci
npm run check
npm test
npm run build
```

This produces `campus/dist` and the compiled server in `server/dist`. Keep generated files out of Git; Render builds them from source.

Review the scope you are publishing. `VITE_DATA_MODE=demo` builds a browser-local demonstration; `VITE_DATA_MODE=api` builds the real API client. The repository's `render.yaml` selects API mode. Vite reads that variable while building, so changing it after the bundle exists cannot switch a deployed frontend.

The initial API client fetches the first 100 posts plus the student's saved posts and filters that loaded set locally, with a visible limit notice when needed. Full server-driven feed search/pagination, durable uploads, and full club-officer/administrator interfaces remain work. The live moderation page handles current review actions; its operational process and browser behavior still need validation. A shared deployment should communicate those limits accurately.

## 2. Create a Neon database

1. Create a project and a database for UniBoard in Neon.
2. Choose a region appropriate for the Render service and expected users.
3. Copy the PostgreSQL connection string from Neon's connection interface.
4. Follow the provider's TLS connection requirements. Do not disable certificate verification to make a connection work.
5. Store the connection string as `DATABASE_URL` in the Render service's environment settings, rather than in the repository.

Use separate databases or branches for development/test and production. A connection string contains a password; treat it as a secret and rotate it if it is exposed.

Review current limits, restore/backup options, and retention in [Neon's pricing](https://neon.com/pricing) before depending on any free-plan capability. This guide deliberately does not hardcode changing quotas.

## 3. Create the Render service

Connect the intended Git repository and create a **Node web service** from the repository root.

The repository includes a [Render blueprint](../render.yaml) describing this one-service setup. Review its environment values and fill secret settings in the hosting interface. It does not provision the Neon database or email service for you.

| Setting           | Value                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Root directory    | Repository root; leave empty if the root is already selected.                                                    |
| Runtime           | Node.                                                                                                            |
| Node version      | Match the root `package.json`: Node 24.                                                                          |
| Build command     | `npm ci --include=dev && npm run build`                                                                          |
| Start command     | `npm start`                                                                                                      |
| Instance          | A free instance is suitable for a learning demo, subject to Render's limits.                                     |
| Health check path | `/api/v1/health/ready` checks database connectivity. It does not check whether every migration has been applied. |

The build needs development dependencies because TypeScript, Vite, and other compilation tools live there. The Node service must bind to the host-provided `PORT`; do not force the local development port in production.

`SERVE_FRONTEND=1` tells Express to serve `campus/dist`. Requests under `/api/v1` are handled as API requests; frontend navigation should fall back to the React HTML only for frontend routes. Test a direct reload of a nested client route after deployment.

## 4. Configure environment variables

Use the server's `.env.example` as the definitive list and compare it to configuration code when changing the application.

| Variable              | Production value/purpose                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`            | `production`. This must never be `development` on the public service.                                                                                  |
| `VITE_DATA_MODE`      | `api` **at build time** for the shared application; `demo` is only for an explicitly labeled browser demo.                                             |
| `DATABASE_URL`        | Secret Neon PostgreSQL connection string with the provider's required TLS settings.                                                                    |
| `APP_ORIGIN`          | Exact public HTTPS origin, for example `https://your-service.onrender.com`. Update it if using a custom domain.                                        |
| `SERVE_FRONTEND`      | `1`, so the same Node process serves the built browser application.                                                                                    |
| `TRUST_PROXY`         | Configure according to the trusted reverse-proxy topology. The provided single-proxy setting is `1`; do not broadly trust arbitrary forwarded headers. |
| `PORT`                | Let Render supply it. The API must read it from the environment.                                                                                       |
| `EMAIL_WEBHOOK_URL`   | HTTPS endpoint for the email integration once that integration has been implemented and tested.                                                        |
| `EMAIL_WEBHOOK_TOKEN` | Required with the webhook URL; a secret of at least 24 characters.                                                                                     |

An email webhook URL is an integration contract, not a universal email-provider API. The backend sends a JSON body containing `to`, `kind`, `token`, optional `universityId`, and `appOrigin`, with an `Authorization: Bearer ...` header. `kind` is `verify_email`, `reset_password`, or `verify_membership`. The receiving service must authenticate the request, create the correct email/link for that kind, and actually deliver the message. Confirm the implementation before putting a provider API URL here.

The current live account dialog accepts a verification/reset token in a form; automatic deep-link consumption is not implemented. The email integration can deliver that token with clear instructions, or a later change can add a complete link-based flow. Test delivery and consumption together. The local demo dialog cannot consume real recovery tokens, and a provider's default email template should not be assumed to match this contract.

Production registration/verification/reset behavior must fail clearly when delivery is unavailable; it must not expose a token as a substitute. Browser preview account dialogs intentionally send no email regardless of deployment settings.

Secrets belong in the hosting provider's environment settings. Commit names and safe example values only. Do not put database credentials into `VITE_*` variables: Vite embeds client environment values in assets that browsers can read.

## 5. Apply database migrations

Migrations must run against the intended database before users exercise routes that require the schema. Use the repository's migration command from a trusted local or CI environment with that database connection:

```powershell
$env:NODE_ENV = "production"
$env:DATABASE_URL = "<the production database connection string>"
npm run db:migrate
```

Replace the placeholder privately. Do not paste the actual value into a committed script, screenshot, pull request, or shared terminal transcript.

This approach does not rely on a paid hosting pre-deploy feature. If a deployment pipeline later runs migrations automatically, ensure it runs one migration job per release and coordinates schema changes with the running application.

Do **not** run `db:seed` in production. It is guarded for development and creates illustrative accounts/content. Real campus administrator access needs an explicit provisioning procedure, rather than a public development password.

For later releases, prefer compatible migrations: add new structures first, deploy code that uses them, then remove obsolete structures in a separate change after verifying that they are no longer needed.

## 6. Inspect the deployed service

After Render reports a successful deployment:

- Open the public HTTPS URL and inspect the rendered frontend.
- Reload a nested frontend route directly to verify the static fallback.
- Check `/api/v1/health`, which reports process/database configuration, and `/api/v1/health/ready`, which performs a database query. Neither verifies the complete application schema; inspect migration output and exercise a schema-dependent route too.
- In the API-mode frontend, sign in with a test account and exercise a database-backed workflow. Confirm that a second browser profile sees shared changes and keeps its own saved list.
- Verify session cookies are secure/HttpOnly in production and that wrong-origin writes are rejected.
- Test a real verification email and password reset only after connecting email delivery. Confirm that expired/used tokens fail.
- Use a second account to check shared posts and ownership. Use a second campus to check isolation.

Record what was actually tested. A successful build, a reachable homepage, and a working multi-user campus workflow are different levels of evidence.

If this is a demo deployment, the homepage may work while data remains local to each browser. Keep that limitation visible to users and do not collect real passwords through the preview dialogs.

## Static assets and uploads

Built frontend files are recreated on every deploy and can be served from the application bundle. Real user uploads need durable storage, upload limits, content-type checks, authorization, safe download behavior, and cleanup when content is deleted.

Do not save profile photos or attachments to the Node service's local disk. Render's free filesystem is ephemeral, so those files can disappear on restart or redeployment. See [Render's free-instance documentation](https://render.com/docs/free).

Object-storage selection and its API integration are a later implementation decision; this repository should not claim working file uploads until that path is built and tested.

## Operations and recovery

- Keep development/test data separate from the production database.
- Review the provider's current backup and restore features; do not assume a free tier includes the retention you need.
- Keep an export/recovery procedure for data you cannot afford to lose, and test restoration before relying on it.
- Monitor failed requests and database connectivity. Log actionable errors without credentials, session tokens, or sensitive post bodies.
- Review free-plan usage and cold starts before expanding the pilot. Upgrade when actual reliability or capacity needs justify it.
- Roll back application code through a known-good deployment when appropriate. A code rollback does not undo a database migration; schema compatibility and restoration need their own plan.

The [roadmap](./product-roadmap.md) defines what must be complete before calling the project a shared MVP. The [development guide](./development.md) covers local setup and contribution practices.
