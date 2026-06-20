# Phase 03 — Project Dashboard

## Objective
Build a real project dashboard replacing the placeholder, with CRUD operations, card-based project listing, and a detail page — all iPad-optimized.

## Scope

### 1. Database — Add new columns to `projects` table
- `client_name TEXT`
- `project_number TEXT`
- `due_date DATE`
- `square_footage NUMERIC`

### 2. API Routes
| Method | Route | Purpose |
|---|---|---|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/[id]` | Get single project details |
| `PATCH` | `/api/projects/[id]` | Update project fields or archive |
| `DELETE` | `/api/projects/[id]` | Archive (set status to 'archived') |

### 3. Dashboard Page (`/dashboard`)
- **Card grid** — each card shows: name, status badge, address, client, project number, due date, created date
- **New Project button** — triggers a modal popup
- **Empty state** — friendly message: "No projects yet. Create your first project."
- **Status badges**: Active 🟢, Completed ✅, Archived ⬜

### 4. Create Project Modal
- Fields: name (required), description, address, client_name, project_number, due_date, square_footage
- Save button → creates project via API → refreshes list
- Cancel/close modal

### 5. Project Detail Page (`/projects/[id]`)
- Shows all project info in a clean layout
- Edit button → inline edit or separate section
- Archive button (with confirmation)
- Placeholder sections for future phases:
  - "Panels" (Phase 04-05)
  - "Models" (Phase 04)
  - "Issues" (Phase 09)

### 6. Future: Custom Fields (not implemented now)
- Admin will be able to add custom key-value fields to projects in a later phase
- Database will use a JSONB `custom_fields` column for extensibility

### Out of Scope
- Custom field system (deferred to later phase)
- Project deletion (soft-delete via archive only)
- Team/assignee management per project

## Acceptance Criteria
- [ ] Dashboard shows project cards in a grid
- [ ] "New Project" button opens modal with all fields
- [ ] Creating a project adds it to the list immediately
- [ ] Cards show: name, status, client, project number, due date, address
- [ ] Clicking a card navigates to `/projects/[id]`
- [ ] Project detail page shows all info + edit/archive
- [ ] Archive sets status to 'archived' (card becomes muted)
- [ ] Empty state when no projects exist
- [ ] iPad-optimized layout (touch-friendly cards, large buttons)
- [ ] `npm run build` — exit 0

## Execution Plan

### Step 1: Add new columns to database (SQL)
### Step 2: Create API routes
### Step 3: Build dashboard page with project cards
### Step 4: Build create project modal
### Step 5: Build project detail page
### Step 6: Verify build