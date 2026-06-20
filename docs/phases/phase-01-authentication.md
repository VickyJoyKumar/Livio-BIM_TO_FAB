# Phase 01 — Authentication

## Objective
Implement Google OAuth login/logout using Supabase Auth, with route protection and a user profile display. By the end of this phase, users can sign in with Google, see their profile, and access protected pages.

## Scope

### 1. Install @supabase/ssr (Server-Side Rendering helpers)
- Required for Next.js App Router cookie-based auth
- Replace the current bare `createClient` with the SSR-compatible browser client

### 2. Supabase Auth Helper Files
- `src/lib/supabase/client.ts` — update to use `createBrowserClient` from `@supabase/ssr`
- `src/lib/supabase/server.ts` — new: `createServerClient` for server components, reads cookies
- `src/middleware.ts` — refresh session on every request, redirect to login if unauthenticated

### 3. Auth Context & Provider
- `src/features/auth/auth-context.tsx` — React context providing `user`, `session`, `signIn`, `signOut`, `loading`
- Wraps the root layout so auth state is available everywhere

### 4. Login Page (`src/app/page.tsx`)
- Replace the default Next.js landing page with a clean login screen
- **Google Sign-In button** — styled for iPad (larger touch targets, proper sizing)
- Centered card layout with the Livio AR BIM Viewer branding
- States: idle (show button), loading (spinner), error (message)

### 5. Sign Out
- User avatar/name dropdown or button in the app layout
- Clears Supabase session, redirects to login

### 6. Route Protection (Middleware)
- `src/middleware.ts` — checks session on every request
- If no session → redirect to `/login`
- If session → allow through
- Excludes public paths: `/login`, `/auth/callback`, `/_next/*`, `/favicon.ico`

### 7. Auth Callback Route (`src/app/auth/callback/route.ts`)
- Handles the OAuth redirect from Supabase/Google
- Exchanges auth code for session, sets cookies, redirects to dashboard

### 8. User Profile Display
- Show signed-in user's name, email, and avatar in the app header
- Sign-out button alongside

### Out of Scope
- User role management (admin/engineer/inspector/crew) — Phase 02
- Email/password login — Google OAuth only for MVP

## Acceptance Criteria
- [ ] Google Sign-In button visible on `/login` page
- [ ] Clicking Sign-In redirects to Google OAuth consent screen
- [ ] After consent, user is redirected back and session is created
- [ ] Authenticated users see their name/avatar in the app header
- [ ] Unauthenticated users are redirected to `/login`
- [ ] Sign-out clears the session and returns to `/login`
- [ ] Auto-create user profile in `public.users` on first sign-up (trigger already set up)
- [ ] `npm run build` — exit code 0

## Execution Plan

### Step 1: Install `@supabase/ssr`
```bash
npm install @supabase/ssr
```

### Step 2: Update Supabase client files
- Update `src/lib/supabase/client.ts` → `createBrowserClient`
- Create `src/lib/supabase/server.ts` → `createServerClient`

### Step 3: Create middleware
- `src/middleware.ts` — session refresh + route protection

### Step 4: Create Auth Provider
- `src/features/auth/auth-context.tsx` — context + provider component
- Update `src/app/layout.tsx` to wrap with `<AuthProvider>`

### Step 5: Create login page
- Update `src/app/page.tsx` — Google Sign-In landing page
- Create Google sign-in button component

### Step 6: Create auth callback route
- `src/app/auth/callback/route.ts` — handle OAuth redirect

### Step 7: Create app header with user profile
- `src/components/app-header.tsx` — user avatar, name, sign-out

### Step 8: Update layout to include header for authenticated users

### Step 9: Verify
- Build passes, dev server works, sign-in flow testable

## Verification
```bash
npm run build    # exit 0, no errors
npm run dev      # loads at localhost:3000 → should show login page
```