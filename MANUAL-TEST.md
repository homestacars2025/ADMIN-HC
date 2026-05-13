# Security Lockdown — Manual Test Plan

## Pre-flight: verify your own account first

In Supabase SQL Editor:
```sql
SELECT id, email, role FROM public.profiles WHERE email = 'homestacars@gmail.com';
```
`role` must be exactly `'admin'` before you deploy anything.

---

## Test A — Admin user: full access

1. Sign in with your admin account (`homestacars@gmail.com`).
2. You should land on the dashboard normally.
3. Navigate to every sidebar item (Cars, Bookings, Customers, Investors, Accounting, etc.).
4. **Expected:** every page loads with data, no redirects.

---

## Test B — Staff/non-admin user: instant block

### Layer 3 — Login page blocks before dashboard
1. Create or use a test account with `role = 'staff'` in `profiles`.
2. Go to `/login` and sign in with the staff credentials.
3. **Expected:** spinner briefly, then the red error box appears:
   > *Access denied. This portal is restricted to administrators only.*
4. The URL stays at `/login`. No `/dashboard` flash, ever.

### Layer 1 — Route guard blocks on direct URL access
1. While logged in as admin, manually change the staff user's `role` to `'staff'` in Supabase (simulate a mid-session downgrade).
2. In a separate browser / incognito window, sign in as the staff user (they'll get blocked at login as above).
3. Alternatively — if you have a staff session open — navigate to any `/dashboard` sub-page.
4. **Expected:** redirect to `/login?error=access_denied` with the access-denied message.

### Verify the console.warn fires
1. Open DevTools → Console.
2. Attempt staff login.
3. **Expected:** `[HomestaCars] Access denied for: staff@example.com — role: staff`

---

## Test C — Database layer: RLS blocks data even if React guard is bypassed

In the Supabase dashboard:

1. Go to **Authentication → Users** → find your staff user → click **"Send magic link"** or use **"Log in as user"** (available in the Users tab).
2. Open **SQL Editor** and run:
   ```sql
   SELECT * FROM public.bookings LIMIT 5;
   SELECT * FROM public.customers LIMIT 5;
   SELECT * FROM public.cars LIMIT 5;
   SELECT * FROM public.profiles LIMIT 5;
   SELECT * FROM public.investors LIMIT 5;
   ```
3. **Expected:** every query returns **0 rows** (not an error — RLS silently filters them out).

Alternatively, use the Supabase **"Test a query"** feature under Table Editor → select a table → click the policy → "Test query with role: authenticated".

---

## Test D — Missing profiles row (no role at all)

1. Create a Supabase Auth user but do NOT insert a `profiles` row for them.
2. Attempt to sign in from the login page.
3. **Expected:** access denied — treated the same as a non-admin.

---

## Confirm the SQL migration ran correctly

```sql
-- All tables should show rowsecurity = true
SELECT tablename, rowsecurity, forcerowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles','bookings','cars','customers','investors',
    'company_expenses','financial_transactions','exchange_rates',
    'cars_registration','car_tracking','operations','kgm',
    'traffic_fines','model_group'
  )
ORDER BY tablename;

-- Only "admin_only" policies should exist
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
```
