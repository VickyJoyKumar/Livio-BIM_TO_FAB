# Phase 05 — QR Scanner

## Objective
Build a camera-based QR scanner that reads panel QR codes and opens the panel detail page. Also provide printable QR code images for physical panel labels.

## Scope

### 1. QR Scanner Page (`/scanner`)
- Full-screen camera viewfinder optimized for iPad
- Uses `navigator.mediaDevices.getUserMedia()` for camera access
- Processes video frames with `jsQR` to detect QR codes
- On successful scan:
  - Plays a short vibration/haptic feedback
  - Looks up panel by QR code value
  - Redirects to panel detail page (`/panels/[id]`)
- Handles:
  - Camera permission denied → friendly error with instructions
  - Camera not available → fallback message
  - Continuous scanning (auto-resumes after a scan)

### 2. QR Code Lookup API
- `GET /api/qr/lookup?code=xxx` → returns panel ID + project ID
- Used by the scanner to find the matching panel

### 3. QR Code Image Generation
- On the panel detail page, add a **"Print QR Code"** button
- Uses `qrcode` npm package to generate a PNG QR code image
- Downloads or opens the QR code for printing on physical labels

### 4. Navigation
- Add "Scan QR" button to the app header dropdown
- Quick access from dashboard (FAB or header icon)

### 5. Test
- Generate a QR code for a test panel
- Test scanning with laptop camera or iPad camera
- Verify QR code → panel redirect works end-to-end

### Out of Scope
- QR code generation for bulk printing (could be a future enhancement)
- AR overlay on scanner (Phase 07)
- Batch scanning

## Dependencies
- `jsQR` — pure JS QR decoder (lightweight, no native deps)
- `qrcode` — QR code image generator (for printable labels)

## Execution Plan

### Step 1: Install dependencies (`jsQR`, `qrcode`)
### Step 2: Create QR lookup API route
### Step 3: Build QR scanner page with camera + jsQR
### Step 4: Add QR code generation to panel detail page
### Step 5: Add "Scan QR" to app header navigation
### Step 6: Verify: build, scanner, QR generation, lookup

## Acceptance Criteria
- [ ] `/scanner` page opens camera and shows viewfinder
- [ ] Scanning a QR code redirects to the correct panel
- [ ] "Print QR Code" button generates a downloadable PNG
- [ ] QR code lookup API works
- [ ] Camera permission denied shown gracefully
- [ ] iPad-optimized (full-screen, touch-friendly)
- [ ] `npm run build` — exit 0