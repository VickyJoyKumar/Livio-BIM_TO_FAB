# Phase 00 — Project Setup

## Objective
Scaffold, configure, and verify the Livio AR BIM Viewer project so it's ready for feature development. By the end of this phase, the app runs locally, connects to Supabase, is pushed to a git remote, and can be deployed to Vercel.

## Scope

### 1. Scaffold Next.js App
- Next.js 14+ with App Router, TypeScript, src/ directory
- ESLint + Prettier config
- Strict TypeScript mode

### 2. Feature-based Folder Structure
```
src/
  app/          (Next.js App Router pages / layouts)
  components/   (shared UI components)
  features/     (feature modules — auth, projects, models, etc.)
  lib/          (utilities, clients — supabase client, helpers)
  types/        (global TS types)
public/
  models/       (sample/test model files, if any)
```

### 3. Core Dependencies
- `@supabase/supabase-js` — Supabase client
- `three` + `@react-three/fiber` + `@react-three/drei` — 3D rendering
- `@webxr` polyfills — AR (WebXR)
- `zod` — runtime validation
- Dev: `prettier`, `husky`, `lint-staged`

### 4. Supabase Project Setup (via browser)
- Create a new Supabase project (user has account open in Brave)
- Configure Google OAuth provider
- Create initial tables: `users`, `projects`, `panels`, `model_files`, `issues`
- Enable Supabase Storage bucket for model files
- Capture project URL + anon key into `.env.local`

### 5. Environment & Config
```
.env.local:
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 6. Git Init & First Commit
- `git init` with `.gitignore` (Next.js defaults)
- First commit: `"feat: initial project scaffold"`

### 7. Verify
- `npm run dev` starts without errors
- Supabase client connects (basic ping test)
- `npm run build` succeeds
- Deployable to Vercel (one-click from repo)

## Acceptance Criteria
- [ ] `npm run dev` launches the app at localhost:3000 with a landing page
- [ ] Supabase client can be imported and returns a valid client instance
- [ ] `npm run build` exits with code 0 — no TS errors, no lint errors
- [ ] Git repo exists with initial commit
- [ ] `.env.local` template documented (actual secrets not committed)
- [ ] Vercel-ready (no framework-specific blockers)

## Execution Plan

### Step 1 — Scaffold Next.js app
Run `create-next-app` with App Router + TypeScript + src/ directory in `D:\AI APPS\Liv_DTF`.

### Step 2 — Install dependencies
Add supabase client, Three.js stack, zod, prettier.

### Step 3 — Set up folder structure
Create the feature-based folders and stub files.

### Step 4 — Configure TypeScript strict mode
Set `strict: true` in `tsconfig.json`, resolve any new errors.

### Step 5 — Create Supabase client utility
`src/lib/supabase/client.ts` — reads env vars, exports singleton.

### Step 6 — Set up Supabase project (browser)
Navigate to the Supabase account in Brave, create project, configure Google OAuth, create tables, get keys.

### Step 7 — Configure `.env.local`
Write the template with placeholders for actual values from Step 6.

### Step 8 — Git init & first commit
Initialize repo, create `.gitignore`, make initial commit.

### Step 9 — Verify
Run dev server, build, confirm everything works.

## Verification
```bash
cd "D:\AI APPS\Liv_DTF"
npm run dev       # → http://localhost:3000 loads without error
npm run build     # → exit 0, no TS/lint errors
npm run lint      # → no warnings
```