# Phase 02 — User Profile & Invitations

## Objective
Build a profile page where users can view/edit their info, and an admin panel to manage users and invite new ones.

## Scope

### 1. Profile Page (`/profile`)
- Display user info from Supabase `public.users` table
- Fields: avatar, name, email, designation, role badge
- Editable: name, designation
- Read-only: email (from Google), role (self-service view-only)

### 2. Edit Profile
- Inline form on the profile page
- Updates `public.users` table via API
- Instant UI update after save

### 3. Role Badge
- Color-coded pill showing the user's role:
  - **Admin** 🟣 Purple
  - **Engineer** 🔵 Blue
  - **Inspector** 🟢 Green
  - **Crew** 🟡 Yellow/Orange

### 4. Admin User Management (`/admin/users`)
- Only accessible to users with role = `admin`
- Lists all users in the organization
- Search/filter by name, email, or role
- Change user roles (dropdown selector)
- Delete users (with confirmation)

### 5. Invite New Users
- Admin-only: send invitation email via Supabase Auth
- Invite form on the admin page: email + role fields
- Uses `supabase.auth.admin.inviteUserByEmail()` via a server API route
- Invited user receives email, creates account via Google, auto-assigned role

### 6. Navigation
- App header shows user avatar dropdown with:
  - "Profile" link → `/profile`
  - "Admin" link → `/admin/users` (only for admins)
  - "Sign Out"
- Header also shows role badge

### Out of Scope
- Multi-organization / team management
- Custom invitation email templates
- Audit log of role changes

### API Routes
| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/profile` | Get current user's profile |
| `PATCH` | `/api/profile` | Update name, designation |
| `GET` | `/api/admin/users` | List all users (admin only) |
| `PATCH` | `/api/admin/users/[id]` | Change user role (admin only) |
| `POST` | `/api/admin/invite` | Invite new user (admin only) |

### Database
The `public.users` table already has: `id`, `email`, `name`, `avatar_url`, `role`, `created_at`.

**Need to add:** `designation` column (TEXT, nullable).

### Execution Plan

1. Add `designation` column to `public.users` via Supabase SQL
2. Create API routes (profile + admin)
3. Build profile page UI (iPad-optimized)
4. Build admin user management page
5. Add invite user form
6. Update app header with navigation
7. Verify

## Acceptance Criteria
- [ ] Profile page shows avatar, name, email, designation, role badge
- [ ] User can edit name and designation — changes persist
- [ ] Admin users can access `/admin/users`, see all users, change roles, invite
- [ ] Non-admin users get redirected from `/admin/users`
- [ ] Invite sends email via Supabase Auth
- [ ] Role badge is color-coded correctly
- [ ] Navigation in app header works (Profile, Admin link for admins, Sign Out)
- [ ] `npm run build` — exit code 0
