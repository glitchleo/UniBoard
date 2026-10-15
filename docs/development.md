# Development guide

This guide is for someone learning the project as well as someone contributing to it. Start with [the architecture](./architecture.md) if the difference between demo mode and database-backed API mode is unclear.

## Prerequisites

- Node.js **24** and npm **11 or newer**, matching the root `package.json` engines.
- Git and an editor with TypeScript support.
- PostgreSQL for database-backed development. A local PostgreSQL instance or a development Neon database can be used.
- Two browser profiles or separate private sessions for testing shared-account workflows in API mode.

The root is an npm workspace. Workspaces let the frontend and server keep their own dependencies while one root installation and lockfile manage the project.

## First run

From the repository root:

```powershell
npm install
```

For a repeatable installation after the lockfile exists, use `npm ci`. Commit changes to `package-lock.json` when adding or updating dependencies. Avoid creating a second lockfile inside `campus/` or `server/`.

The frontend prototype can run without a database:

```powershell
npm run dev:web
```

Open `http://127.0.0.1:5173`. Demo mode is the default and can be explored without creating a real account. Its data stays in browser storage.

For the backend, copy the example configuration and edit `server/.env` to use your database:

```powershell
Copy-Item server/.env.example server/.env
```

The API startup and database scripts load `.env` from their working directory. The root npm commands run them inside `server/`, so `server/.env` is the expected local file. Keep it out of Git. Existing process environment variables take precedence, which is useful for hosting and CI.

The names and safe examples are listed in `server/.env.example`. You can also set them directly in the terminal instead of using a file.

For example, in PowerShell:

```powershell
$env:NODE_ENV = "development"
$env:PORT = "3001"
$env:APP_ORIGIN = "http://127.0.0.1:5173"
$env:DATABASE_URL = "postgresql://uniboard:uniboard@localhost:5432/uniboard"
$env:TRUST_PROXY = "0"
$env:SERVE_FRONTEND = "0"
npm run db:migrate
npm run db:seed
npm run dev
```

Replace the example connection string with a database that exists and that you are allowed to modify. The example does not create a PostgreSQL server, database, or user. For a hosted database, use the provider's TLS connection instructions and keep credentials out of source control.

`npm run dev` runs the frontend and API together. If you prefer separate terminals, run `npm run dev:web` in one and `npm run dev:api` in another; set the backend environment in the terminal that starts the API. Environment variables set with `$env:` apply to that PowerShell process and child processes, rather than every terminal on the machine.

Vite proxies `/api` requests to the local API. Keep the backend port, frontend proxy target, and `APP_ORIGIN` aligned. `http://localhost:5173` and `http://127.0.0.1:5173` are different origins, even when they reach the same machine.

### Switch to real API mode

Create the frontend's local environment file from its example:

```powershell
Copy-Item campus/.env.example campus/.env.local
```

Set `VITE_DATA_MODE=api` in `campus/.env.local`, then restart `npm run dev`. Keep `VITE_DATA_MODE=demo` for the browser-only demonstration. The backend must be running with a configured and migrated database for API mode.

API mode loads the real session/membership, feed, comments, saved posts, profile, polls, and notifications, and uses live account forms. Database-backed content is shared between accounts/devices; the session token stays in an HttpOnly cookie. A failing backend should produce an error instead of a successful demo mutation.

The initial feed fetch is capped at 100 posts, plus saved posts outside that page, with a visible limit notice when needed. UI search/filtering applies to that loaded set, so it is not yet exhaustive server-side search. Likes and accepted answers are unavailable in API mode because the backend does not implement them. A live moderation page supports the current review actions; full club-officer/administrator interfaces and durable uploads remain work.

Vite embeds `VITE_*` settings in the browser bundle. They are public configuration, never a place for database passwords or email-provider tokens. For a production build, set the desired mode before running `npm run build`; changing it only at server startup is too late.

### What the commands mean

| Root command           | Purpose                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`          | Run the frontend and API development processes together.                            |
| `npm run dev:web`      | Start the React/Vite development server.                                            |
| `npm run dev:api`      | Start the API with automatic restarts on source changes.                            |
| `npm run check`        | Check frontend TypeScript and compile the backend; this is not a linter.            |
| `npm run format`       | Apply the shared Prettier formatting rules.                                         |
| `npm run format:check` | Check formatting without rewriting files.                                           |
| `npm test`             | Run the tests defined by the workspaces.                                            |
| `npm run build`        | Produce the frontend production bundle and compile the server.                      |
| `npm run preview`      | Preview the built frontend through Vite; this is a local inspection tool.           |
| `npm start`            | Start the compiled API. With `SERVE_FRONTEND=1`, it also serves the built frontend. |
| `npm run db:migrate`   | Apply pending SQL migrations to `DATABASE_URL`.                                     |
| `npm run db:seed`      | Create explicitly development-only sample data.                                     |

The equivalent workspace command is, for example, `npm run db:migrate --workspace server`. Root commands are the normal entry point.

## Understand the application before changing it

The React application is assembled from pages and focused components. Demo state uses the browser board hook and local-storage adapter; API mode uses the API board adapter and maps real responses into the same UI shapes. Pure selectors derive lists from loaded state; for example, applying a category and search term to the feed should not mutate the original posts.

The API uses route modules for account and campus features, shared validation/security helpers, and a database wrapper. The actual request contract lives in the route and Zod schema source until an API contract document is maintained alongside it. Frontend types describe frontend objects; they are not automatically the API's request schema.

Read the code near a change and follow its naming and style. A small, consistent implementation is easier to learn than several competing architectural patterns.

The root `.prettierrc.json` defines shared formatting, and `.prettierignore` excludes generated or unsuitable files. Use `npm run format` before review, then `npm run format:check` to confirm consistency. Formatting is separate from TypeScript correctness and behavior tests.

## A standard feature workflow

1. **Define the outcome.** Write a concrete example: “An approved student can save a campus post and find it after signing in on another device.” Include the expected error or permission case.
2. **Identify the affected boundary.** A saved visual state belongs in React; persistent bookmarks require an API route and a database constraint. Security rules belong on the server even when the UI duplicates the check for usability.
3. **Design the smallest data change.** Add a migration if the feature changes the schema. Decide uniqueness and foreign-key rules before writing the route.
4. **Implement the backend contract.** Validate the request, resolve the session, check campus membership and resource ownership, and run parameterized SQL. Use a transaction for changes that must succeed together.
5. **Test the meaningful cases.** Include the authorized flow and the boundary most likely to break, such as another student's bookmark or another campus's post.
6. **Connect the frontend.** Extend the common API adapter. Include loading, empty, successful, and failed states. Preserve form content on a failed submission.
7. **Check the experience.** Use the keyboard, inspect the layout on narrow screens, and test a reload. For shared behavior, use separate browser profiles.
8. **Update the documentation.** Explain any new environment variable, schema step, permission, or limitation.
9. **Run the checks and open a focused pull request.** Describe the problem, resulting behavior, relevant validation, and any remaining limitation.

A feature is incomplete if it works only with an admin seed account, loses its data on reload, or can be bypassed by editing the HTTP request.

## Coding conventions

### TypeScript and React

- Keep strict TypeScript checks enabled. Model meaningful states instead of using `any` to silence errors.
- Use function components and hooks. Keep state close to the component that owns it; move shared board state into the shared hook rather than copying it into several pages.
- Keep filtering, formatting, and other pure transformations outside rendering when that makes them clearer and testable.
- Give components a clear purpose. A named component is useful when it has a coherent responsibility; extracting every small HTML fragment adds indirection.
- Give route pages responsibility for composition, and components responsibility for focused interaction.
- Use stable keys for lists. Do not use a list index when items can be reordered, edited, or removed.
- Treat browser storage as a prototype adapter, not a security boundary. Do not store real passwords, session tokens, or trusted roles there.
- Keep real requests in the API adapter, so response mapping and error handling have one home.

### Styling and accessibility

The frontend uses Tailwind CSS v4 through the Vite plugin, alongside readable component CSS. The university portal theme uses a blue header, dark blue navigation, white panels with gray headings, thin borders, modest corners, and the system Arial/Helvetica font stack. Keep form controls and spacing consistent. External fonts, decorative artwork, gradients, and heavy shadows are unnecessary for this interface.

- Use existing shared tokens and button/field patterns before adding a new visual variant.
- Prefer semantic HTML: actual buttons for actions, links for navigation, labels for inputs, and headings in a sensible order.
- Keep keyboard focus visible. Dialogs need a title, focus management, a close control, and a usable keyboard flow.
- Do not communicate status through color alone. Include a word or icon with an accessible meaning.
- Give images appropriate alternative text; decorative images should not create redundant screen-reader output.
- Verify narrow layouts without hiding the only way to perform an action.
- Avoid using `dangerouslySetInnerHTML` for student-provided content. Formatting requires a deliberate sanitization strategy.

The Tailwind setup follows the official [Vite installation guide](https://tailwindcss.com/docs/installation/using-vite), reviewed on October 15, 2026. Follow the installed v4 configuration instead of copying a v3 tutorial's setup.

### API and SQL

- Keep all public endpoints under `/api/v1`.
- Validate URL parameters, query strings, and JSON bodies with the relevant schema. A frontend type assertion is not input validation.
- Derive the acting user from the session. Ignore any client claim that it is an administrator or the owner of a resource.
- Scope queries by university and permission. Check that a child resource belongs to the parent resource named in the route.
- Use placeholders and parameter arrays for SQL values. Do not concatenate user text into a query.
- Use database constraints for invariants such as one bookmark per user/post pair. JavaScript checks alone can race under concurrent requests.
- Return predictable JSON and HTTP status codes. Keep internal error details in controlled server logs, rather than sending stack traces or SQL strings to the browser.
- Keep destructive or high-impact moderation actions explicit and attributable to an actor and reason.
- Do not log authorization headers, cookies, passwords, database URLs, or one-time tokens.

### Migrations and seeds

Add a new numbered migration for a schema change. Do not edit a migration that has already been applied to a shared environment; add the next migration so environments can move forward predictably.

Review a migration for both correctness and operational effect. Adding a required column to a table that already has rows needs a plan for those rows. Dropping a column deletes data; take an explicit backup or export before a production change that needs it.

Seed code is for repeatable development data. It must require `NODE_ENV=development`; production startup must not run it. Keep documented sample credentials separate from real credentials, and do not use seed users as production administrator accounts.

The current development seed creates these API users on its first run:

| Role      | Email                               | Development-only password  |
| --------- | ----------------------------------- | -------------------------- |
| Student   | `elira.hoxha@student.unitir.edu.al` | `UniBoard-Student-2026!`   |
| Moderator | `moderator@unitir.edu.al`           | `UniBoard-Moderator-2026!` |

Existing accounts keep their current passwords when the seed is run again. The seed also creates University of Tirana faculty records, approved memberships, clubs, and a few sample posts. These credentials are for a private development database, and are not a production provisioning mechanism.

Use these accounts through an HTTP client or the API-mode sign-in form. The demo-mode sign-in dialog deliberately does not accept a password and is separate from these database accounts.

For a runnable account-to-post workflow without a browser, follow [the PowerShell API guide](./api.md). It includes both university-email membership and manual moderator approval.

## Testing strategy

Test behavior and boundaries, rather than duplicating every line of implementation in a test.

| Level                              | Useful examples                                                                       | When to use it                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pure unit tests                    | Combined feed filters, validation, a permission helper, token hashing.                | Logic can run without a browser or database.                                                |
| HTTP tests                         | An unauthenticated request is rejected; a malformed body gets a clear error.          | Verify middleware and route behavior.                                                       |
| PostgreSQL integration tests       | Membership restrictions, author ownership, transactions, unique bookmark enforcement. | Real SQL behavior and relationships matter.                                                 |
| Browser/end-to-end tests           | Register, verify, join a campus, publish a post, and reply from another account.      | Prove the real frontend/API connection. These remain work to add where coverage is missing. |
| Manual visual/accessibility review | Responsive dialogs, keyboard navigation, empty/error states.                          | Layout and interaction need human inspection.                                               |

Use a dedicated test database for database tests. Do not point tests at production or at a development database whose data you need. Follow the suite's schema setup and clean up only test-owned data.

The existing PostgreSQL vertical-slice test opts in through `TEST_DATABASE_URL` and creates, migrates, and drops a randomly named private schema. To include it against a disposable local test database:

```powershell
$env:TEST_DATABASE_URL = "postgresql://test_user:test_password@localhost:5432/uniboard_test"
npm test
```

Replace the example with an actual disposable test database. Its user needs permission to create/drop a schema. Without `TEST_DATABASE_URL`, that test is skipped; a green test command then does not prove that real SQL executed.

The existing test command is not proof that the whole MVP is covered. Read the test files and the result to understand what was exercised. Database connectivity, email delivery, uploads, and a deployed browser workflow each require their own evidence.

The backend's SQL vertical slices have been exercised against a dedicated PostgreSQL database, including the stale-password login/reset race regression. This does not claim that a full browser session, a real email provider, or a public deployment was verified. Repeat the database suite through `TEST_DATABASE_URL` when changing its covered behavior.

Before a pull request, run:

```powershell
npm run format:check
npm run check
npm test
npm run build
```

The separate production build matters because a development server can mask build-time problems. Avoid repeatedly rerunning passing checks without a new change or concern.

## Git and pull requests

- Start from an up-to-date base branch and use a short descriptive feature branch, such as `codex/campus-search`.
- Keep a pull request centered on one outcome. Include the migration and UI work together when they are necessary for that outcome.
- Commit source, migrations, tests, documentation, and the root lockfile as appropriate.
- Exclude `node_modules`, generated `dist` folders, local environment files, credentials, and database exports.
- Use clear commits that explain the change, such as `Add university-scoped bookmark endpoint`.
- Explain how the change was validated and which expected cases remain untested. Do not claim a database or deployment check that was not run.
- Resolve review feedback and merge through the project's agreed branch policy. Avoid rewriting someone else's active branch.

## Continuous integration

The committed [CI workflow](../.github/workflows/ci.yml) runs on pushes and pull requests. It installs Node 24, runs `npm ci`, builds both workspaces, and runs the test command with a PostgreSQL 17 service. The build includes TypeScript checks. CI uses the committed lockfile so it tests the dependency versions that were reviewed.

CI sets `TEST_DATABASE_URL`, so the real PostgreSQL suite creates its private schema, applies the migration, exercises its vertical slices, and drops the schema. Locally that suite is skipped unless you set the variable. The workflow source is the source of truth for the checks that run; do not assume that a hosted CI run has succeeded just because the YAML exists.

Do not add production secrets to pull-request jobs. Email providers should be stubbed in automated tests; development shortcuts must be explicitly configured and unavailable in production.

## Troubleshooting

| Symptom                                                | Check                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The web preview works but API data fails               | The UI may still be using its local demo adapter. Check the browser network panel and the backend process separately.                                         |
| API reports that a database is unavailable             | Set `DATABASE_URL`, confirm PostgreSQL is reachable, then apply migrations. Missing configuration is not an empty campus.                                     |
| Requests are rejected by origin checks                 | Open the exact `APP_ORIGIN` and align it with the frontend dev URL. Check `localhost` versus `127.0.0.1`.                                                     |
| `/api` requests fail through Vite                      | Confirm the backend port matches the proxy target and that the API process is running.                                                                        |
| Sign-in succeeds in an HTTP client but not the browser | Check origin, cookie attributes, HTTPS settings, and whether the frontend sends credentials. Do not work around the issue by exposing tokens to JavaScript.   |
| Verification/reset does not send email                 | Production delivery needs an email integration. Browser preview flows intentionally send no email. Development tokens are test aids, not production delivery. |
| A UI change disappears or old demo data returns        | Check the local-storage adapter and its storage version/keys. Clearing site data deletes browser-local changes.                                               |
| Build cannot resolve a dependency                      | Install from the repository root and check that the workspace lists the dependency it imports.                                                                |

For hosting and operational configuration, continue with [deployment](./deployment.md).
