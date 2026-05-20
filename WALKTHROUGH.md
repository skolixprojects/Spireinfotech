# Spire — 20-Step Walkthrough Checklist

End-to-end manual QA script for the participant lifecycle. Tick each box from a clean DB to confirm every step works. Items grouped by the user who performs them.

## Setup

1. Backend running: `mvn spring-boot:run` in `backend/` (Java 21, port 8080)
2. Frontend running: `npm run dev` in `frontend/` (port 3000)
3. Seed accounts present (idempotent on startup via `DataSeeder`):
   - **Operations Admin** — `admin@spireitco.com` / `SpireAdmin@2026`
   - **ERM** — `erm@spireitco.com` / `SpireERM@2026`
   - **Coach** — `coach@spireitco.com` / `SpireCoach@2026`
   - **Advisor** — `advisor@spireitco.com` / `SpireAdvisor@2026`
   - **Finance** — `finance@spireitco.com` / `SpireFinance@2026`
   - **Legacy LMS admin** — `admin@spire.dev` / `admin123`
4. Open the browser dev console and watch the Network tab — every step should fire a `POST /api/...` (transition) that returns 200.
5. Optional: open a second window with `psql` or DB GUI to confirm `users.current_status` after each step.

---

## Participant path (steps 1–16)

Sign out, go to `/` → "Get Started" or `/enroll`.

### Step 1 — Enrollment (`DRAFT_STARTED` → `BASIC_INFO_SUBMITTED`)

- [ ] `/enroll` renders the OnboardingLayout (logo + progress bar, no marketing navbar)
- [ ] Fill: full name, email (use a real inbox you can read), phone, password
- [ ] Submit → routes to `/verify-email`
- [ ] `users.current_status` = `BASIC_INFO_SUBMITTED`

### Step 2 — Email verification (`EMAIL_VERIFICATION_PENDING` → `EMAIL_VERIFIED`)

- [ ] `/verify-email` shows 6-digit code input
- [ ] Verification email arrives (check spam / dev mail catcher)
- [ ] Enter code → routes to `/participant-id`
- [ ] Resend works if you click "Resend code"
- [ ] `current_status` = `EMAIL_VERIFIED`

### Step 3 — Participant ID (`PARTICIPANT_ID_CREATED` → `ID_EMAIL_SENT`)

- [ ] `/participant-id` shows the assigned ID (format like `SP-2026-XXXX`)
- [ ] "Participant ID created" email arrives
- [ ] "Continue" button routes to `/acknowledgment`
- [ ] `users.participant_id` populated

### Step 4 — Acknowledgment (`ACKNOWLEDGMENT_ACCEPTED`)

- [ ] `/acknowledgment` renders the acknowledgment text
- [ ] Checkbox is required before the "I acknowledge" button enables
- [ ] Submit → routes to `/document-upload`

### Step 5 — Documents (`DOCUMENTS_SUBMITTED` → `DOC_REVIEW_PENDING`)

- [ ] `/document-upload` accepts ID proof, address proof, photo (drag & drop or click)
- [ ] Upload completes — preview thumbnails visible
- [ ] "Submit for review" → routes to `/program-selection`
- [ ] Operations Admin (other tab) sees the doc in their queue

### Step 6 — Program selection (`PROGRAM_SELECTED`)

- [ ] `/program-selection` shows program / phase / skillset / target job title / availability fields
- [ ] Submit → routes to `/agreement`

### Step 7 — Agreement sent (`AGREEMENT_SENT`)

- [ ] `/agreement` renders the agreement body in a scrollable container
- [ ] "I agree" disabled until you scroll to the bottom + check the box
- [ ] Sign / type-name field accepts input

### Step 8 — Agreement complete (`AGREEMENT_COMPLETED`)

- [ ] Click "Sign agreement" → **stays on / progresses without bouncing back to `/dashboard`**
- [ ] Auto-routes to `/check-upload` after ~1.2s
- [ ] `agreement_records` row exists with `signed_at` set

### Step 9 — Check upload (`CHECK_COPY_UPLOADED`)

- [ ] `/check-upload` offers two paths: upload check soft-copy OR "Not applicable"
- [ ] Either path → routes to `/welcome`
- [ ] `participant_check.uploaded_at` OR `participant_check.not_applicable_at` set

### Step 10 — Signed agreement sent to ERM (`SIGNED_AGREEMENT_SENT_TO_ERM`)

- [ ] (Automatic) After Step 9, `agreement_records.erm_notified` = `true`
- [ ] Operations Admin sees the participant in the "Awaiting ERM assignment" queue

### Step 11 — Welcome (`WELCOME_SENT`)

- [ ] `/welcome` shows congratulations + program summary
- [ ] Welcome email arrives in participant inbox

### Step 12 — Coordinator intro (`DEEPTHI_INTRO_SENT`)

- [ ] (Automatic) Intro email from coordinator arrives shortly after Step 11
- [ ] Email contains coordinator name + contact info

### Step 13 — ERM assigned (`ERM_ASSIGNED`)

Log in as **`admin@spireitco.com`** → `/operations`:

- [ ] "ERM Assignments" tab lists the new participant
- [ ] Assign an ERM → participant's `assigned_erm_id` set
- [ ] ERM assignment email sent to both parties

### Step 14 — Coaches assigned (`COACHES_ASSIGNED`)

Still in `/operations`:

- [ ] "Coach Assignments" tab lists the participant (only after ERM assigned)
- [ ] Assign one or more coaches → `participant_coach_assignments` rows created
- [ ] Notification email sent

### Step 15 — Dashboard active (`DASHBOARD_ENABLED`)

Switch back to the **participant** account and log in:

- [ ] Lands on `/dashboard` (NOT `/enroll`, NOT "Complete your enrollment")
- [ ] Sidebar shows: Home, My Courses, Weekly Report, Messages, Team
- [ ] Roadmap shows 15/20 steps complete
- [ ] "Team" tab shows assigned ERM + coaches

### Step 16 — Weekly reporting (`WEEKLY_REPORTING_ACTIVE`)

- [ ] Dashboard "Weekly" tab loads current week
- [ ] Submit a weekly report → `weekly_reports` row with status `SUBMITTED`
- [ ] Roadmap advances to 16/20
- [ ] (Cron) Sunday-evening reminder email goes out if you don't submit by Friday

---

## Phase 6 — Employment + Phase 1 completion (steps 17–18)

### Step 17 — Employment accepted (`EMPLOYMENT_ACCEPTED`)

- [ ] Dashboard "Employment" tab is visible
- [ ] Participant uploads offer letter / fills employer + start-date fields
- [ ] Submit → `employment_acceptance` row created, `current_status` = `EMPLOYMENT_ACCEPTED`
- [ ] Roadmap advances to 17/20

### Step 18 — Phase 1 complete (`PHASE_1_COMPLETED`)

- [ ] (Automatic) After Step 17 acceptance, status transitions to `PHASE_1_COMPLETED`
- [ ] Dashboard shows "Phase 1 complete" milestone card
- [ ] Roadmap advances to 18/20

---

## Phase 7 — Payments (steps 19–20)

Switch to **`finance@spireitco.com`** → `/finance-dashboard`.

### Step 19 — Payment plan (`PAYMENT_PLAN_ACCEPTED`)

- [ ] Finance creates a payment plan for the participant (amount, installments, due dates)
- [ ] Participant logs back in → "Payments" tab shows the proposed plan
- [ ] Participant accepts → `payment_plans.accepted_at` set
- [ ] Roadmap advances to 19/20

### Step 20 — Payments tracked (`CHECK_TRACKING_ADDED` / `INVOICING_ACTIVE` / `PAYMENTS_TRACKED`)

- [ ] Finance dashboard shows invoices in "Active" state
- [ ] Mark an installment as paid (check tracking field captures check number / date)
- [ ] Participant's "Payments" tab reflects the paid status
- [ ] Roadmap reads 20/20 once all installments are tracked

---

## Cross-role sanity checks (do these at any point)

- [ ] **ERM login** (`erm@spireitco.com`) lands on `/erm-dashboard`, lists their assigned participants
- [ ] **Coach login** (`coach@spireitco.com`) lands on `/coach-dashboard`, lists their assigned participants
- [ ] **Advisor login** (`advisor@spireitco.com`) lands on `/coach-dashboard` (TECHNICAL_ADVISOR uses the same surface)
- [ ] **Finance login** (`finance@spireitco.com`) lands on `/finance-dashboard`
- [ ] **Ops Admin login** (`admin@spireitco.com`) lands on `/operations`
- [ ] **Legacy ADMIN** (`admin@spire.dev`) lands on `/admin` (LMS surface — courses, services, instructor approvals)
- [ ] **No marketing chrome** on any onboarding route: `/enroll`, `/verify-email`, `/participant-id`, `/acknowledgment`, `/document-upload`, `/program-selection`, `/agreement`, `/check-upload`, `/welcome` — all use OnboardingLayout
- [ ] **No marketing chrome** on any role dashboard: `/dashboard`, `/erm-dashboard`, `/coach-dashboard`, `/finance-dashboard`, `/operations`
- [ ] **Refresh in the middle of any step** → never bounces logged-in users to `/login` (the auth context rehydrates)
- [ ] **Browser back from `/dashboard`** → onboarding gates refuse to re-render completed steps (e.g. `/agreement` bounces forward if `AGREEMENT_COMPLETED` already)

## Audit checks

- [ ] `user_records` has a `WORKFLOW` row for every transition (20+ rows by Step 20)
- [ ] `workflow_states` append-only log has one row per status change
- [ ] No `agreement_acceptances` table exists in DB (renamed to `agreement_records`)
- [ ] `mvn compile` exits 0 against the backend
- [ ] `npx tsc --noEmit` exits 0 against the frontend
