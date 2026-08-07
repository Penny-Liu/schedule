# Supabase Auth and RLS migration plan

This migration must be rehearsed against a staging project before changing production. The current application authenticates by downloading rows from `public.users` and comparing plaintext passwords in the browser, so switching the frontend before accounts and policies exist would lock out every user.

## Confirmed login decision

- The user-facing login identifier remains the existing account name (`public.users.username`).
- Supabase password login currently accepts email or phone, so each normalized username maps deterministically to an internal Auth email through `services/authIdentity.mjs`.
- The mapping uses `u_<60 hex characters>@<controlled domain>`. It does not expose the original username and stays within the email local-part length limit.
- Configure `VITE_AUTH_USERNAME_DOMAIN` with a real domain controlled by the deployment owner. Do not use a fake or reserved domain.
- Before creating Auth accounts, run `findAuthUsernameCollisions` across every username and resolve all case, whitespace, or Unicode-normalization collisions.
- This design intentionally does not provide email-based self-service password recovery. Password resets remain an administrator workflow unless real per-user recovery email addresses are added later.
- Configure the controlled domain to receive these addresses, or configure a Send Email Auth Hook that intentionally suppresses Auth emails before enabling the migration. Do not allow messages to bounce through Supabase's shared SMTP service.

### Public VIEWER account exception

- The hospital-wide public account may retain its announced legacy password only while its application role is exactly `VIEWER`.
- `services/passwordPolicy.mjs` permits a minimum of four characters for `VIEWER`; every other role keeps the strong migration policy.
- Supabase Auth password strength is configured project-wide, not per application role. Keep the project-wide strong policy: `passwordForSupabaseAuth` deterministically transforms the public password into an Auth-compatible value before migration and sign-in, while the operator continues entering the announced password.
- The transformation only satisfies Auth formatting and does not add real secrecy or entropy. Anyone who knows the announced password should still be considered able to use the public account.
- Because the password is publicly announced, treat this identity as public rather than confidential. Do not rely on its password as a security boundary.
- Store the role only in administrator-controlled `app_metadata` and/or resolve it through `public.users.auth_user_id`. Never authorize from editable `user_metadata`.
- RLS must grant this identity SELECT only on approved, non-sensitive schedule data. It must have no INSERT, UPDATE, DELETE, RPC, Storage upload, audit-log read, user-list read, settings read, gene-appointment read, or medical-record-number access.
- If the account's role or permissions are upgraded, require a strong password before the role change takes effect and revoke existing sessions so stale JWTs cannot retain the old authorization state.

## Decisions still required before implementation

1. Confirm the role-to-permission matrix for supervisors, system administrators, schedulers, finance, health-management staff, viewers, and radiographers.
2. Confirm the controlled Auth email domain and its mail/hook behavior.
3. Confirm a maintenance window and rollback owner.

## Inventory to verify in Supabase

The application currently references at least these Data API tables:

- `users`, `settings`, `operation_logs`
- `shifts`, `leaves`, `radiographer_workload`, `radiographer_daily_workload`
- `doctors`, `doctor_shifts`, `physician_workload_daily`
- `health_mgmt_staff`, `health_mgmt_shifts`
- `anesthesia_staff`, `anesthesia_shifts`
- `administrative_staff`, `administrative_shifts`
- `cloud_schedule_entries`, `report_assistants`
- `meeting_room_bookings`, `gene_appointments`

Before authoring policies, export the actual schema, constraints, indexes, grants, policies, functions, views, and Realtime publication membership. The repository does not currently contain a complete source-of-truth migration history.

## Migration phases

### 1. Establish migration tooling

- Install and authenticate a current Supabase CLI or connect the Supabase MCP server.
- Discover CLI commands with `supabase --help`; do not assume an older command layout.
- Link a staging project and pull its current schema.
- Run database and security advisors before and after each policy change.

### 2. Add identity linkage without changing login

- Add a nullable, unique `auth_user_id uuid` relationship from `public.users` to `auth.users(id)`.
- Do not expose password hashes or Supabase admin credentials to the browser.
- Keep the legacy login temporarily while staging accounts are created and verified.
- Record an immutable mapping between each existing user row and the new Auth user.

### 3. Create Auth users server-side

- The chosen strategy is to preserve each user's current password during the one-time migration.
- Keep legacy login enabled during the password-upgrade window. Users whose password does not meet `services/passwordPolicy.mjs` may authenticate only to the forced password-change page; application data is not loaded until the update succeeds.
- Use a one-time server-only migration script with a secret/service-role key.
- Never use a `VITE_` variable for the secret key.
- Import the shared identity helper and use the same username normalization and internal-email mapping as the frontend.
- Abort the migration if normalized usernames collide or if the configured domain is not a controlled real domain.
- Run `npm run auth:migrate` first. This is a read-only dry run that reports only counts and never prints passwords.
- Administrators may run `npm run auth:migrate -- --list-noncompliant-users` to list account names that still need an update; passwords are never shown.
- Apply only in staging first with `npm run auth:migrate -- --apply --confirm-existing-passwords`.
- The apply command requires `public.users.auth_user_id` to exist, auto-confirms the internal email, creates missing Auth users with the existing password, and links each profile row.
- The script is resumable: already linked identities are verified and skipped; a conflicting identity stops the run.
- Non-compliant existing passwords are counted without being printed. The apply command stops while any remain, preventing those users from being locked out after cutover. The approved `VIEWER` exception is evaluated separately by role.
- Align the Supabase Auth password settings with `services/passwordPolicy.mjs` before staging. The transition baseline is at least six characters containing text and a number, with common passwords rejected.
- Do not pass passwords through command-line arguments, logs, exported JSON, or generated files.
- Verify disabled/resigned accounts remain unable to sign in.
- Revoke or destroy migration credentials and generated password files afterward.

### 4. Implement frontend session login

- Keep the visible field and wording as account name; do not expose the internal Auth email.
- Convert the entered account name with `usernameToAuthEmail` immediately before authentication.
- For `VIEWER`, also transform the entered public password with `passwordForSupabaseAuth` before calling Supabase. Other roles send their strong password unchanged.
- Replace browser-side password comparison with `supabase.auth.signInWithPassword`.
- Restore sessions through `onAuthStateChange`/session APIs.
- Resolve the application profile by `auth_user_id` after authentication.
- Remove `password` and `must_change_password` reads from browser profile queries.
- Sign out through Supabase Auth and clear application-only cached state.

### 5. Apply grants and RLS table by table

- Explicitly decide Data API `GRANT` privileges for `anon`, `authenticated`, and server roles. Grants and RLS are separate controls.
- Enable RLS on every exposed table.
- Remove `anon` data access except for an intentionally public login/bootstrap surface.
- Use ownership predicates for personal data and permission/role predicates for shared schedule data.
- Every UPDATE policy needs both `USING` and `WITH CHECK`, plus a compatible SELECT policy.
- Do not use `auth.role()` and do not treat `TO authenticated` alone as authorization.
- Do not use editable `user_metadata` for authorization. If JWT claims are used, store them in admin-controlled `app_metadata` and account for claim refresh latency.
- Keep privileged functions out of exposed schemas; avoid `SECURITY DEFINER` unless the function validates `auth.uid()`, has a fixed `search_path`, and has tightly restricted EXECUTE grants.
- Verify views use `security_invoker = true` or are not exposed to client roles.

### 6. Suggested access-policy groups

- Personal: a user can read/update only their own allowed profile fields and personal leave requests.
- Department shared-read: authenticated department members can read schedules required for their role.
- Editors: schedulers/supervisors can update only the modules and locations assigned to them.
- System administrators: administrative access through explicit policies, not frontend flags.
- Server sync: Salesforce/GitHub synchronization runs only with server credentials and does not reuse browser keys.
- Audit logs: clients may insert limited structured events; only authorized administrators may read/export logs. Clients must not choose another user's audit identity.

### 7. Verification and cutover

- Test every table as `anon`, a normal authenticated user, each editor role, and an administrator.
- Test SELECT, INSERT, UPDATE, DELETE, Realtime, and bulk upsert separately.
- Confirm forbidden requests fail even when sent directly to the REST API outside the UI.
- Verify password reset, disabled accounts, logout, token refresh, role changes, and expired sessions.
- Enable Auth login behind a feature flag, run a pilot group, then migrate all users.
- Drop the plaintext `password` column only after the rollback window closes and backups are verified.

## Rollback requirements

- Keep a pre-migration database backup and an exported user-to-auth mapping.
- Keep schema changes additive until the new login has completed a production soak period.
- Roll back frontend login independently from RLS policies; do not disable RLS as a rollback shortcut.
- Never restore production access by exposing tables to `anon`.
