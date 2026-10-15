# Product roadmap and MVP acceptance criteria

UniBoard should become the place students know to check and the place their posts will be seen. The first release should make one university useful before expanding into many separate social features.

This document separates the browser-local demonstration, the selectable API-backed experience, and the requirements for a complete shared MVP. A button appearing in the interface does not prove that its full operational workflow has been tested.

## Current delivery boundaries

| Area                                            | What the project currently provides                                                                                                          | What remains before a real release                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Browser experience                              | Default demo mode and explicit `VITE_DATA_MODE=api` mode using the shared React screens.                                                     | Browser end-to-end and usability validation of live workflows.                                                                 |
| Persistence                                     | Browser localStorage for demo mode; real PostgreSQL records through the API adapter in API mode.                                             | Complete paging and error/retry behavior as campus data grows.                                                                 |
| Accounts                                        | Honest preview controls in demo mode; live account/session forms and token-entry verification/reset in API mode.                             | Production email delivery, complete real-email recovery tests, and optional automatic link handling.                           |
| University membership                           | Preview selection in demo mode; real membership/session state and server access rules in API mode.                                           | Full moderator review UI and operational membership/role management.                                                           |
| Feed and search                                 | Loaded API feed mapped into shared screens; the first 100 posts are fetched, with a limit notice and browser filtering.                      | Server-driven search and pagination so older matching posts are discoverable.                                                  |
| Comments, saves, profiles, polls, notifications | API-mode adapters connect these workflows to the server.                                                                                     | Full browser and concurrency coverage; polished errors and collection pagination.                                              |
| Moderation                                      | Server report/review/removal/suspension/audit endpoints, live report/membership review UI, reasons, audit trail, and decision notifications. | Browser validation of complete reporting/review flows and an operational response process; full administrator provisioning UI. |
| Images and attachments                          | Illustrative images and URL-based preview inputs.                                                                                            | Durable file storage, upload validation, authorization, size limits, and deletion policy.                                      |
| Hosting                                         | Deployment instructions.                                                                                                                     | Provision and deploy infrastructure, configure secrets/domain/email, and complete release checks.                              |

Neither browser-local state nor a sample “verified” badge establishes a person's identity or university membership. Development seed users must remain development-only.

Likes and accepted answers have no real API implementation and are unavailable in API mode. Club reference information is separate from full club-officer management. Durable file uploads and full administrator/club-officer interfaces remain future work. The initial live moderation interface must still be validated as a complete browser workflow.

## Roles and permissions

The roles below describe intended MVP behavior. Server authorization must enforce it; UI visibility is only a convenience.

| Action                                    | Visitor/signed out | Account with pending membership | Approved student                 | Campus moderator                        | Campus administrator                         |
| ----------------------------------------- | ------------------ | ------------------------------- | -------------------------------- | --------------------------------------- | -------------------------------------------- |
| Register, sign in, request reset          | Yes                | Yes                             | Yes                              | Yes                                     | Yes                                          |
| Edit own profile                          | No                 | Yes                             | Yes                              | Yes                                     | Yes                                          |
| Request university membership             | No                 | Yes                             | Yes, when joining/changing       | Yes                                     | Yes                                          |
| Read protected campus feed                | No                 | No                              | Own approved campus and audience | Own approved campus                     | Own campus                                   |
| Create posts/comments                     | No                 | No                              | Yes, while active                | Yes                                     | Yes                                          |
| Edit/delete own content                   | No                 | No                              | Yes                              | Yes                                     | Yes                                          |
| Bookmark campus posts                     | No                 | No                              | Yes                              | Yes                                     | Yes                                          |
| Read own account/membership notifications | No                 | Yes                             | Yes                              | Yes                                     | Yes                                          |
| Report content/users                      | No                 | No                              | Yes                              | Yes                                     | Yes                                          |
| Review reports and remove content         | No                 | No                              | No                               | Own campus only                         | Own campus only                              |
| Approve manual memberships                | No                 | No                              | No                               | According to assigned campus permission | Own campus                                   |
| Suspend accounts/memberships              | No                 | No                              | No                               | Only within granted scope               | Own campus, according to policy              |
| Assign campus roles                       | No                 | No                              | No                               | No                                      | Own campus, with an explicit permission rule |

An administrator is not automatically a global administrator. Cross-university access must require a separately designed and audited platform role if that is ever introduced. A suspended account must not continue creating content through an old session.

The current backend suspends a university membership, while preserving the account and its access to account-level decision notifications. It does not implement a global account-ban role or a self-service role-assignment screen.

The exact initial route permissions are defined by server code. Where this matrix exceeds the implemented backend, it is a release requirement, not a claim that the capability already exists.

## MVP acceptance criteria

Use these as feature-level completion criteria. An item is done only when the real frontend and API work together, authorization is verified, and the failure cases are understandable.

| Feature                         | Acceptance criteria                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registration and authentication | A student can register with a valid email and password, verify ownership of the email, sign in, sign out, and request/reset a forgotten password. Duplicate registration and invalid/expired tokens produce clear responses without leaking credentials. Signing out invalidates the server session. No secrets appear in browser storage. |
| University membership           | A signed-in user can request a campus, verify an approved university domain or submit a manual request, and see pending/approved/rejected states. University email verification and manual decisions are real server actions. A pending user cannot read protected campus data. Changing campuses does not silently grant approval.        |
| Student profile                 | A student can save name, profile photo, faculty, program, optional year, and short bio. Faculty belongs to the selected university. Validation failures preserve entered content and explain what to fix. Email changes follow verification policy.                                                                                        |
| Campus feed                     | Approved students see posts from their campus and permitted faculty audience. Newest sorting is stable; category and faculty filters combine correctly. Empty/loading/error states work. Data remains correct after reload and across devices.                                                                                             |
| Creating posts                  | A student can choose a type, title, details, audience, tags, and type-specific fields; preview, publish, edit, and delete their own posts. Other students cannot alter the content through direct API calls. Required date/link/number fields are validated for the selected type.                                                         |
| Search                          | Search covers titles and descriptions, with type, tag, and date filters. Searches remain campus-scoped and audience-scoped. Empty results explain how to broaden the search. Pagination or another bounded result strategy prevents unlimited responses.                                                                                   |
| Comments                        | Students can comment, reply, edit/delete their own comments, and read the thread. The post author can close/reopen comments. A reply cannot reference a different post. Closed, removed, or inaccessible content rejects new comments.                                                                                                     |
| Saved posts                     | Saving and unsaving is idempotent. Each student sees only their bookmarks, and a post removed or made inaccessible no longer exposes protected content through saved posts.                                                                                                                                                                |
| Notifications                   | Comments on a student's posts, replies, and moderation decisions create accurate notifications. Students can mark their own notifications read and open a permitted destination. Repeating a request does not produce misleading duplicates.                                                                                               |
| Dashboard                       | “My posts,” “Saved posts,” and recent activity reflect the signed-in student and the database. Counts update after mutations and do not include another account's private data.                                                                                                                                                            |
| Moderation                      | Students can report posts, comments, and users. Authorized campus moderators can review reports, remove content, and apply allowed suspensions with a reason. Actions are scoped to the university and produce an audit record and the relevant student notification.                                                                      |

The current API may implement only part of an acceptance criterion. Verify the source and integration tests before marking an entire feature complete.

## Post types

Keep one consistent creation flow. Show extra fields only after a student chooses a type.

| Type                       | Useful fields                                               | Behavior to verify                                                                         |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Announcement               | Audience, expiry                                            | Expired content is clearly labeled or excluded according to the chosen feed rule.          |
| Club recruitment           | Club, joining instructions, deadline                        | Deadline and club identity remain visible; expired recruitment is distinguishable.         |
| Event                      | Date/time, timezone, location, organizer, registration link | Display the correct local time, including daylight-saving changes; reject invalid links.   |
| Competition or opportunity | Deadline, eligibility, organizer, application link          | The deadline is unambiguous, and external links are safe.                                  |
| Find teammates             | Skills, people needed, deadline, open/filled                | The author can mark a team filled; the search/feed shows the state.                        |
| Study group                | Course, meeting format, schedule, available places          | Meeting details are understandable; capacity is validated if tracked.                      |
| Question or discussion     | Tags, optional accepted answer                              | An accepted answer belongs to the question; only an authorized user can select it.         |
| Lost and found             | Item, approximate location/date, resolved status            | Avoid publishing sensitive ID details; the author can mark the item resolved.              |
| Student feedback or poll   | Choices, closing date                                       | A student's vote is counted once according to the policy; a closed poll rejects new votes. |

The last column describes intended real behavior. A preview of a field alone does not implement capacity, registration, accepted-answer, or vote-integrity rules.

## Delivery phases

### Phase 1: Make the product understandable

Deliver a minimal, responsive browser prototype with representative campus posts. Exercise the feed, filters, post composer, detail view, comments, saved posts, dashboard, and account dialogs. Clearly label local preview account and membership behavior.

**Exit:** a student can navigate the main tasks without coaching, and the demo makes no claim to real email delivery, approval, or shared persistence.

### Phase 2: Establish the server foundation

Deliver the Express/PostgreSQL application, migrations, development seed data, account/session flows, campus membership, core content routes, and scoped authorization. Use structured validation, parameterized SQL, explicit errors, and security middleware.

**Exit:** API workflows can be exercised against a real test database. Critical ownership and campus boundary checks have integration coverage. Production configuration does not expose development tokens or seed accounts.

### Phase 3: Connect the frontend

The selectable API adapter connects session/profile/membership, loaded feed, post mutations, comments, saved posts, polls, and notifications. The loaded feed includes the first 100 posts plus saved posts outside that page. Continue by verifying complete browser workflows and adding server-driven searching/pagination. Keep demo storage separate from real account data.

**Exit:** two students in separate browser profiles can exchange posts/comments, use their own saved lists, and receive the right notifications. A student from another campus cannot see or alter protected content through a modified request.

Backend authentication and campus-isolation vertical slices have been run against a real PostgreSQL database. That evidence does not claim that the phase's complete browser experience or production email delivery has been verified.

### Phase 4: Complete operational MVP features

Connect production email delivery, manual membership review, moderator decision screens, durable uploads, and account suspension handling. Test access, usability, accessibility, and failure states. Decide moderation response expectations and who handles reports.

**Exit:** every MVP criterion above has a verified result; real users have an operational support/moderation path; secrets, backup/recovery, and release configuration are ready.

### Phase 5: Run a focused campus pilot

Deploy to a testable environment, recruit a small group, and seed useful opportunities with permission. Observe whether students return and whether posts receive useful responses. Address broken workflows before expanding to more universities.

**Exit:** the pilot can operate without manual database fixes for normal tasks, and feedback supports the next investment.

## What to measure

- **Useful discovery:** students open posts, save opportunities, or follow relevant links.
- **Useful responses:** posts receive meaningful replies or are marked filled/resolved.
- **Return visits:** students come back in later weeks because fresh content exists.
- **Content coverage:** enough relevant posts appear across faculties, without a feed dominated by one group.
- **Community health:** report volume, time to review, repeated abuse, and disputed decisions.

Use aggregate measurements with a clear purpose. Detailed behavior tracking is not a prerequisite for the first working MVP.

## Scope to defer

Direct messaging, recommendation algorithms, mobile apps, cross-campus discovery, sophisticated club administration, payments, and microservices can wait. First prove the central loop: a relevant campus post is published, another student sees it, and something useful happens.

See [architecture](./architecture.md) for boundaries and [development](./development.md) for the feature workflow.
