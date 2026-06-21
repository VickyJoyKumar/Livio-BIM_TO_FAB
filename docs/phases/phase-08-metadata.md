# Phase 08 — Panel Metadata

## Objective
Add a metadata viewer and editor to panels, allowing users to store and manage custom key-value data (dimensions, material, manufacturer, notes, etc.) directly on each panel.

## Scope

### 1. Metadata Section on Panel Detail Page
- Add a "Metadata" card/section below the model files
- Display existing metadata as key-value pairs in a clean table
- Keys shown in title case, values shown inline

### 2. Metadata Editor
- "Edit Metadata" button toggles edit mode
- Add new field: key + value inputs with an "Add" button
- Edit existing: inline text inputs for each value
- Delete field: remove button per row
- Save all changes at once via API

### 3. API Route
- `PATCH /api/panels/[id]` — update panel metadata (already exists, supports `metadata` field)
- Client-side handles the add/edit/delete UI

### 4. Empty State
- "No metadata yet" message when metadata is empty
- Prompt to add first field

### 5. Visual Design
- iPad-friendly: large touch targets, clean card layout
- Keys displayed with subtle styling (gray labels)
- Values displayed prominently

### Out of Scope
- IFC property extraction from model files (future enhancement)
- Metadata search/filter across panels (future)
- Metadata templates / presets (future)

## Execution Plan

### Step 1: Add Metadata section to panel detail page
- New section card below model files
- Display existing `panel.metadata` entries

### Step 2: Build edit mode UI
- Add/remove/edit key-value pairs
- Save handler that PATCHes the panel

### Step 3: Verify — build, CRUD metadata

## Acceptance Criteria
- [ ] Panel detail page shows a Metadata section
- [ ] Existing metadata fields are displayed as key-value pairs
- [ ] "Edit Metadata" toggles editor with add/edit/delete
- [ ] Changes persist after save and page refresh
- [ ] Empty state when no metadata exists
- [ ] `npm run build` — exit 0