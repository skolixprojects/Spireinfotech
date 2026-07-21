# TWO_PIPELINE_SURVEY

Read-only survey of every seam the two-pipeline signup restructure will
touch. Cross-references (do NOT re-derive):
[ROLES_SURVEY.md](ROLES_SURVEY.md),
[ACK_STEP_BUG_SURVEY.md](ACK_STEP_BUG_SURVEY.md),
[PROFILE_COMPLETION_SURVEY.md](PROFILE_COMPLETION_SURVEY.md). Every claim
here is cited `path:line`.

> **Headline seams:** the branch after email-verify happens today at
> exactly one place — [AuthService.java:303-310](backend/src/main/java/com/spire/backend/service/AuthService.java#L303-L310)
> lifts every verified user straight to `DASHBOARD_ENABLED`. That is
> the natural fork point for pipeline A vs B. The verify page then
> `window.location.href = "/dashboard"` at
> [verify-email/page.tsx:143](frontend/src/app/verify-email/page.tsx#L143)
> — the natural client-side interposition point for the "How did you
> hear?" screen. The 20-value workflow enum has **~40 backend
> consumers** across 12 files (§2). The profile-completion hard-gate
> is enforced in exactly **3 controller sites + 4 frontend redirects
> + 2 dashboard tab-locks** (§3). COACH/TECHNICAL_ADVISOR touch
> **~35 files** (§5). FINANCE touches ~15 files, most cosmetic label
> (§6). No `referral / referralSource / howDidYouHear` field exists
> today (§4).

---

## 0. Sanity

- Prior survey docs at repo root: `ls PROFILE_COMPLETION_SURVEY.md
  ACK_STEP_BUG_SURVEY.md ROLES_SURVEY.md` → **all three present**.
- Module roots:
  - Backend: [backend/](backend/) — Spring Boot 3, Java 21, Maven.
    Source under [backend/src/main/java/com/spire/backend/](backend/src/main/java/com/spire/backend/).
  - Frontend: [frontend/](frontend/) — Next.js App Router, source under
    [frontend/src/](frontend/src/).
- No `db/migration` — schema evolves via Hibernate `ddl-auto` +
  `schema.sql`. Documented in
  [User.java:202-210](backend/src/main/java/com/spire/backend/entity/User.java#L202-L210)
  and [ROLES_SURVEY §1c](ROLES_SURVEY.md).
- `git remote -v`:
  ```
  origin   https://github.com/AbhiZoe/Spire-Original.git   (fetch/push)
  railway  https://github.com/salyushchavas/Spireinfotech.git (fetch/push)
  ```

---

## 1. Signup + verification flow (end to end)

### 1a. Two backend signup endpoints, two role defaults

- **`POST /api/participants/enroll`** (public) —
  [ParticipantController.java:89-94](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L89-L94)
  →  `authService.enrollParticipant(...)`.
  - Role assigned: **PARTICIPANT** with STUDENT fallback —
    [AuthService.java:132-135](backend/src/main/java/com/spire/backend/service/AuthService.java#L132-L135).
  - Initial `currentStatus = "DRAFT_STARTED"` set on the row builder —
    [AuthService.java:148](backend/src/main/java/com/spire/backend/service/AuthService.java#L148).
  - Immediate ladder transitions **DRAFT_STARTED → BASIC_INFO_SUBMITTED →
    EMAIL_VERIFICATION_PENDING** —
    [AuthService.java:166-167](backend/src/main/java/com/spire/backend/service/AuthService.java#L166-L167).
  - Fires OTP email — [AuthService.java:169](backend/src/main/java/com/spire/backend/service/AuthService.java#L169).
- **`POST /api/auth/register`** (legacy) — [AuthService.java:48-100](backend/src/main/java/com/spire/backend/service/AuthService.java#L48-L100).
  - Role assigned: **STUDENT** — line 56-57.
  - Does NOT set `currentStatus` or walk the workflow ladder — the row
    is inserted with the default `"DRAFT_STARTED"` from the entity
    default at [User.java:191-192](backend/src/main/java/com/spire/backend/entity/User.java#L191-L192).
  - Fires OTP email — line 91.

### 1b. Verify-code path (single endpoint, both signup paths funnel through it)

`verifyCode(...)` at
[AuthService.java:188-313](backend/src/main/java/com/spire/backend/service/AuthService.java#L188-L313):
1. Idempotent early-return if already verified — line 193-196.
2. Lockout window check — line 199-207.
3. Code / expiry / brute-force checks — lines 209-237.
4. On success: `emailVerified = true`, clear code state, save —
   lines 239-248.
5. Ladder walk: `EMAIL_VERIFIED` → mint participantId + `PARTICIPANT_ID_CREATED`
   → send ID email + `ID_EMAIL_SENT` — lines 262-293.
6. **Phase-1C jump** — lines 303-310:
   ```java
   workflowService.transition(saved,
           WorkflowService.Status.DASHBOARD_ENABLED, "dashboard_enabled_quick_signup");
   ```
   Comment 295-302 documents the design:
   > "lift the user straight to DASHBOARD_ENABLED so the frontend
   > lands them on /dashboard immediately … The remaining lifecycle
   > (acknowledgment, documents, program, agreement, check upload)
   > becomes the progressive 'Complete Your Profile' surface inside
   > the dashboard — not a gate that blocks login."
7. Returns `AuthResponse` (JWT + `UserDTO`) — line 312.

**Exact status after verify (both signup paths): `DASHBOARD_ENABLED`
(ordinal 18) with `emailVerified = true`.** The new-pipeline branch
would happen right here (or immediately after — see §4).

### 1c. Frontend: post-verify redirect

- [frontend/src/app/verify-email/page.tsx:130-152](frontend/src/app/verify-email/page.tsx#L130-L152) — `handleSubmit` calls `verifyCode`, then:
  ```ts
  setSession(auth);
  // ... 800ms delay for the success animation ...
  window.location.href = "/dashboard";
  ```
  Line 143 is the **exact interposition point** for the new
  attribution screen. Note the hard `window.location.href` (full page
  load, not `router.replace`) — a comment at 138-142 explains why: it
  bypasses the auth-context stale-user race.

- Frontend enrollment start:
  [frontend/src/app/enroll/page.tsx:70](frontend/src/app/enroll/page.tsx#L70)
  routes to `/verify-email?email=...` immediately after
  `enrollParticipant`.

### 1d. Guard chain that decides "dashboard vs checklist" today

- **`middleware.ts`** at
  [frontend/src/middleware.ts:23-35](frontend/src/middleware.ts#L23-L35) — only
  gates `/admin`. `/dashboard` just requires a JWT.
- **Dashboard page guard** at [frontend/src/app/dashboard/page.tsx:34-86](frontend/src/app/dashboard/page.tsx#L34-L86):
  1. Not signed in → `/login`.
  2. Role dispatch (§7) to `/erm-dashboard`, `/coach-dashboard`, etc.
  3. Otherwise checks `currentStatus` + `participantId` — if the
     participant profile is missing, `/enroll`; if the status is
     mid-onboarding (`getOnboardingRoute(...)` at
     [frontend/src/lib/api.ts:1544-1594](frontend/src/lib/api.ts#L1544-L1594)),
     route to that step's page.
  4. All checks pass → render `<ParticipantDashboard />`.
- **No client-side gate decides "checklist vs dashboard" per se.**
  Once inside the dashboard, `ProfileCompletionBanner` +
  `ProfileCompletionChecklist` are always visible under
  `?tab=complete-profile`, but the user can navigate freely. The
  actual "checklist blocks you" behaviour is on the courses/services
  pages (§3), not the dashboard.
- **Note:** for pipeline A (non-reference), no code change is needed
  in the dashboard guard itself — the user already lands on the
  dashboard. The Phase-1C "Complete Your Profile" tab has to become
  conditional on `isReferralPath === true`.

---

## 2. Workflow status ladder (the thing being ripped out)

### 2a. Enum — 26 values

Defined at [WorkflowService.java:48-75](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L48-L75):

| Ord | Status | Ord | Status |
|-----|--------|-----|--------|
| 0 | DRAFT_STARTED | 13 | SIGNED_AGREEMENT_SENT_TO_ERM |
| 1 | BASIC_INFO_SUBMITTED | 14 | WELCOME_SENT |
| 2 | EMAIL_VERIFICATION_PENDING | 15 | DEEPTHI_INTRO_SENT |
| 3 | EMAIL_VERIFIED | 16 | ERM_ASSIGNED |
| 4 | PARTICIPANT_ID_CREATED | 17 | COACHES_ASSIGNED |
| 5 | ID_EMAIL_SENT | 18 | DASHBOARD_ENABLED |
| 6 | ACKNOWLEDGMENT_ACCEPTED | 19 | WEEKLY_REPORTING_ACTIVE |
| 7 | DOCUMENTS_SUBMITTED | 20 | EMPLOYMENT_ACCEPTED |
| 8 | DOC_REVIEW_PENDING | 21 | PHASE_1_COMPLETED |
| 9 | PROGRAM_SELECTED | 22 | PAYMENT_PLAN_ACCEPTED |
| 10 | AGREEMENT_SENT | 23 | CHECK_TRACKING_ADDED |
| 11 | AGREEMENT_COMPLETED | 24 | INVOICING_ACTIVE |
| 12 | CHECK_COPY_UPLOADED | 25 | PAYMENTS_TRACKED |

`isStatusAtLeast(user, target)` at
[WorkflowService.java:98-100](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L98-L100)
is monotonic ladder via `ordinal()`.

### 2b. Every consumer, grouped by file

Backend `.transition(...)` and `.isStatusAtLeast(...)` calls (grep of
`backend/src/main/java`):

- **`AuthService`** — 4 transitions (§1a-b): `BASIC_INFO_SUBMITTED`,
  `EMAIL_VERIFICATION_PENDING` (line 166-167); `EMAIL_VERIFIED`
  (line 262-263); `PARTICIPANT_ID_CREATED` (line 277-278);
  `ID_EMAIL_SENT` (line 281-282); `DASHBOARD_ENABLED`
  (line 304-305).
- **`WorkflowService`** — 5 named "gate" helpers cite statuses:
  `canSubmitDocuments` uses `ACKNOWLEDGMENT_ACCEPTED` (line 111);
  `canStartAgreement` uses `PROGRAM_SELECTED` (line 116);
  `canAssignCoaches` uses `ERM_ASSIGNED` (line 121);
  `canEnableDashboard` uses `COACHES_ASSIGNED` (line 126);
  `canActivatePayment` uses `PHASE_1_COMPLETED` (line 131).
- **`AcknowledgmentService`** — [line 61](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L61) `isStatusAtLeast(ID_EMAIL_SENT)` (gate); [line 67](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L67) `isStatusAtLeast(ACKNOWLEDGMENT_ACCEPTED)` (idempotent short-circuit — the bug fixed in [ACK_STEP_BUG_SURVEY](ACK_STEP_BUG_SURVEY.md)); [line 107-108](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L107-L108) `transition(ACKNOWLEDGMENT_ACCEPTED)`.
- **`DocumentService`** — [line 226-227](backend/src/main/java/com/spire/backend/service/DocumentService.java#L226-L227) `transition(DOCUMENTS_SUBMITTED)`; [line 270-271](backend/src/main/java/com/spire/backend/service/DocumentService.java#L270-L271) `isStatusAtLeast(ACKNOWLEDGMENT_ACCEPTED)` (gate).
- **`ProgramSelectionService`** — [line 67](backend/src/main/java/com/spire/backend/service/ProgramSelectionService.java#L67) `isStatusAtLeast(AGREEMENT_SENT)` (draft-past-lock guard); [line 90](backend/src/main/java/com/spire/backend/service/ProgramSelectionService.java#L90) `isStatusAtLeast(PROGRAM_SELECTED)` (idempotent short-circuit); [line 126-127](backend/src/main/java/com/spire/backend/service/ProgramSelectionService.java#L126-L127) `transition(PROGRAM_SELECTED)`; [line 163-164](backend/src/main/java/com/spire/backend/service/ProgramSelectionService.java#L163-L164) `isStatusAtLeast(DOCUMENTS_SUBMITTED)` (gate).
- **`ParticipantAgreementService`** — [line 56-57](backend/src/main/java/com/spire/backend/service/ParticipantAgreementService.java#L56-L57) `isStatusAtLeast(CHECK_COPY_UPLOADED)`; [line 65-66](backend/src/main/java/com/spire/backend/service/ParticipantAgreementService.java#L65-L66) `isStatusAtLeast(AGREEMENT_COMPLETED)`; [line 81-90](backend/src/main/java/com/spire/backend/service/ParticipantAgreementService.java#L81-L90) `transition(AGREEMENT_SENT)`, `transition(AGREEMENT_COMPLETED)`; [line 119-120](backend/src/main/java/com/spire/backend/service/ParticipantAgreementService.java#L119-L120) `isStatusAtLeast(PROGRAM_SELECTED)` (gate).
- **`ParticipantCheckService`** — [line 155-158](backend/src/main/java/com/spire/backend/service/ParticipantCheckService.java#L155-L158) `transition(CHECK_COPY_UPLOADED)`; [line 169-172](backend/src/main/java/com/spire/backend/service/ParticipantCheckService.java#L169-L172) `transition(SIGNED_AGREEMENT_SENT_TO_ERM)`; [line 200-201](backend/src/main/java/com/spire/backend/service/ParticipantCheckService.java#L200-L201) `isStatusAtLeast(PROGRAM_SELECTED)` (gate).
- **`OnboardingService`** — [line 85-92](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L85-L92) `transition(WELCOME_SENT)`; [line 96-103](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L96-L103) `transition(DEEPTHI_INTRO_SENT)`; [line 118-120](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L118-L120) `transition(DASHBOARD_ENABLED)`; snapshot reads at [line 132-136](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L132-L136); ERM/coach transitions at [line 158-159, 185-186, 195-196, 209-210](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L158).
- **`WeeklyReportService`** — [line 63-65](backend/src/main/java/com/spire/backend/service/WeeklyReportService.java#L63-L65) `transition(WEEKLY_REPORTING_ACTIVE)`; [line 160-161](backend/src/main/java/com/spire/backend/service/WeeklyReportService.java#L160-L161) `isStatusAtLeast(DASHBOARD_ENABLED)` (gate).
- **`EmploymentService`** — [line 66-67](backend/src/main/java/com/spire/backend/service/EmploymentService.java#L66-L67) `isStatusAtLeast(DASHBOARD_ENABLED)`; [line 92-95](backend/src/main/java/com/spire/backend/service/EmploymentService.java#L92-L95) `transition(EMPLOYMENT_ACCEPTED)`; [line 182-185](backend/src/main/java/com/spire/backend/service/EmploymentService.java#L182-L185) `transition(PHASE_1_COMPLETED)`.
- **`PaymentService`** — [line 70-71, 148-149](backend/src/main/java/com/spire/backend/service/PaymentService.java#L70-L71) `isStatusAtLeast(PHASE_1_COMPLETED)`; [line 170-173](backend/src/main/java/com/spire/backend/service/PaymentService.java#L170-L173) `transition(PAYMENT_PLAN_ACCEPTED)`; [line 221-224](backend/src/main/java/com/spire/backend/service/PaymentService.java#L221-L224) `transition(INVOICING_ACTIVE)`; [line 294-297](backend/src/main/java/com/spire/backend/service/PaymentService.java#L294-L297) `transition(PAYMENTS_TRACKED)`.
- **`CheckTrackingService`** — [line 47-48](backend/src/main/java/com/spire/backend/service/CheckTrackingService.java#L47-L48) `isStatusAtLeast(PAYMENT_PLAN_ACCEPTED)`; [line 75-78](backend/src/main/java/com/spire/backend/service/CheckTrackingService.java#L75-L78) `transition(CHECK_TRACKING_ADDED)`.
- **`ParticipantController`** — [line 432-433](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L432-L433) `isStatusAtLeast(DASHBOARD_ENABLED)` — checks whether to re-run the OnboardingService chain from `/welcome-status/refresh`.

Frontend enum consumers (grep):

- **`frontend/src/lib/api.ts` `getOnboardingRoute`** at [line 1544-1594](frontend/src/lib/api.ts#L1544-L1594) — the client-side switch that maps every status to a URL. This is the exhaustive front-side consumer.
- **`OnboardingProgressBar`** at [frontend/src/components/OnboardingProgressBar.tsx](frontend/src/components/OnboardingProgressBar.tsx) — visual progress bar keyed off `currentStatus`.
- **`ParticipantDashboardService`** in backend at [line 167](backend/src/main/java/com/spire/backend/service/ParticipantDashboardService.java#L167) maps the string `"COACHES_ASSIGNED"` to a phase number.
- **`AdminController`** at [line 378](backend/src/main/java/com/spire/backend/controller/AdminController.java#L378) does an ad-hoc string compare `"COACHES_ASSIGNED".equals(status)`.
- **`welcome/page.tsx`** at [line 72-84](frontend/src/app/welcome/page.tsx#L72-L84) hardcodes a "earlier steps" ladder using status strings.

### 2c. Load-bearing vs bookkeeping

**Load-bearing (a real endpoint refuses without them):**
- `ID_EMAIL_SENT` — precondition for `POST /acknowledgments` ([AcknowledgmentService.java:61](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L61)).
- `ACKNOWLEDGMENT_ACCEPTED` — precondition for `POST /documents/complete` ([DocumentService.java:270-271](backend/src/main/java/com/spire/backend/service/DocumentService.java#L270-L271)) + used as (buggy) idempotent short-circuit in `AcknowledgmentService`.
- `AGREEMENT_SENT` — draft-past-lock guard for program-selection ([ProgramSelectionService.java:67](backend/src/main/java/com/spire/backend/service/ProgramSelectionService.java#L67)).
- `PROGRAM_SELECTED` — precondition for `POST /agreement/sign` ([ParticipantAgreementService.java:119-120](backend/src/main/java/com/spire/backend/service/ParticipantAgreementService.java#L119-L120)) and `POST /checks/upload` ([ParticipantCheckService.java:200-201](backend/src/main/java/com/spire/backend/service/ParticipantCheckService.java#L200-L201)).
- `AGREEMENT_COMPLETED`, `CHECK_COPY_UPLOADED` — idempotent short-circuits in agreement/check services.
- `DASHBOARD_ENABLED` — precondition for weekly reports ([WeeklyReportService.java:160-161](backend/src/main/java/com/spire/backend/service/WeeklyReportService.java#L160-L161)) and employment-acceptance ([EmploymentService.java:66-67](backend/src/main/java/com/spire/backend/service/EmploymentService.java#L66-L67)).
- `PHASE_1_COMPLETED` — precondition for payment-plan acceptance ([PaymentService.java:70-71, 148-149](backend/src/main/java/com/spire/backend/service/PaymentService.java#L70-L71)).
- `PAYMENT_PLAN_ACCEPTED` — precondition for check-tracking ([CheckTrackingService.java:47-48](backend/src/main/java/com/spire/backend/service/CheckTrackingService.java#L47-L48)).

**Pure bookkeeping (no gate reads it):**
- `DRAFT_STARTED`, `BASIC_INFO_SUBMITTED`, `EMAIL_VERIFICATION_PENDING`, `EMAIL_VERIFIED`, `PARTICIPANT_ID_CREATED` — all set en-route, none read as preconditions elsewhere. Only consumed by `getOnboardingRoute` in api.ts for step-page routing.
- `WELCOME_SENT`, `DEEPTHI_INTRO_SENT` — set by `OnboardingService`, read only by `snapshotForWelcome` for the /welcome polling page.
- `ERM_ASSIGNED`, `COACHES_ASSIGNED` — set by `OnboardingService`, read by `snapshotForWelcome` and by the coach chain's own idempotency guard.
- `DOC_REVIEW_PENDING` — appears in the enum but no `.transition(DOC_REVIEW_PENDING)` and no `.isStatusAtLeast(DOC_REVIEW_PENDING)` calls anywhere. **Effectively dead.**
- `SIGNED_AGREEMENT_SENT_TO_ERM` — set only from `ParticipantCheckService`, never read as a gate.
- `WEEKLY_REPORTING_ACTIVE` — set by `WeeklyReportService`, never read as a gate.
- `EMPLOYMENT_ACCEPTED`, `INVOICING_ACTIVE`, `PAYMENTS_TRACKED`, `CHECK_TRACKING_ADDED` — set but not read as preconditions.

**Minimum replacement state set for the two-pipeline design (based on
what's actually gated):**
`{ pipeline_A_landed | pipeline_B_pending_erm_approval |
pipeline_B_approved | pipeline_B_rejected }` plus optional
`{ profile_ready | active | inactive }`. Everything else is
bookkeeping that consumers can be edited to drop.

---

## 3. Profile-completion gate — every enforcement point

### 3a. Backend hard-gates (all 3 return `403 PROFILE_INCOMPLETE`)

1. **Enroll in a course** — [EnrollmentController.java:44-50](backend/src/main/java/com/spire/backend/controller/EnrollmentController.java#L44-L50):
   ```java
   if (!profileCompletionService.canEnrollInCourses(user)) {
       ... ApiResponse.error("PROFILE_INCOMPLETE", body) ...
   }
   ```
2. **Cart** — [CartController.java:75-81](backend/src/main/java/com/spire/backend/controller/CartController.java#L75-L81) — same pattern.
3. **Wishlist bulk-enroll** — [ParticipantController.java:864-870](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L864-L870) — same pattern.

`canEnrollInCourses(user)` at
[ProfileCompletionService.java:178](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L178)
is just `Boolean.TRUE.equals(user.getProfileComplete())`. Making this
conditional on the reference path is a one-liner in that method plus
the three call-sites above.

Doc-note on wishlist: [Wishlist.java:11](backend/src/main/java/com/spire/backend/entity/Wishlist.java#L11) explicitly documents:
> "even when profile_complete = false — only the 'Enroll all' rolls-up
> path is gated."

### 3b. Frontend redirects that bounce to the checklist

1. **`/courses` list** — [courses/page.tsx:64-68](frontend/src/app/courses/page.tsx#L64-L68) — `router.replace("/dashboard?tab=complete-profile")` if `user.profileComplete === false` and not staff.
2. **`/courses/[id]` detail — page mount** — [courses/[id]/page.tsx:111](frontend/src/app/courses/[id]/page.tsx#L111) — same shape.
3. **`/courses/[id]` — click-to-enroll intercept** — [courses/[id]/page.tsx:229](frontend/src/app/courses/[id]/page.tsx#L229) — opens the `ProfileGateModal` instead of hitting the backend.
4. **`/services` list** — [services/page.tsx:29-32](frontend/src/app/services/page.tsx#L29-L32).

### 3c. Dashboard tab locks (client-side)

1. **My Courses tab** on the participant dashboard —
   [ParticipantDashboard.tsx:265-286](frontend/src/components/dashboard/ParticipantDashboard.tsx#L265-L286)
   renders `<LockedTabView>` when `!profileComplete` (see also
   [ParticipantDashboard.tsx:959-980](frontend/src/components/dashboard/ParticipantDashboard.tsx#L959-L980) for the tab body's own guard).
2. **Weekly tab** — same file [line 273-286](frontend/src/components/dashboard/ParticipantDashboard.tsx#L273-L286) — `<LockedTabView>` when `!profileComplete`.

### 3d. Cosmetic / linked (not hard-gates but read the flag)

- **Sidebar % badge** — [ParticipantDashboard.tsx:176-201](frontend/src/components/dashboard/ParticipantDashboard.tsx#L176-L201).
- **`ProfileCompletionBanner` visibility** — [ProfileCompletionBanner.tsx:59-72](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L59-L72).
- **Navbar link hiding for STUDENT/PARTICIPANT** — [Navbar.tsx:57-77, 187-189](frontend/src/components/layout/Navbar.tsx#L57-L77).
- **`apiFetch` error translation** — [lib/api.ts:175-179](frontend/src/lib/api.ts#L175-L179) intercepts 403 `PROFILE_INCOMPLETE` and re-throws as a typed Error the modal + tab-lock can catch. Locked-tab error mapping in [ParticipantDashboard.tsx:942-947](frontend/src/components/dashboard/ParticipantDashboard.tsx#L942-L947).

**The full "must become conditional on isReferralPath" list is
exactly §3a (3 sites) + §3b (4 sites) + §3c (2 sites) = 9 sites.**
Everything in §3d is cosmetic and follows automatically.

---

## 4. Attribution field + screen slot

### 4a. No existing field

`grep -rin "referral\|howdidyouhear\|hear about\|referralSource\|
attribution"` across `backend/src/main/java` and `frontend/src`
returns **only 2 hits, both irrelevant**:

- [backend/src/main/java/com/spire/backend/config/DataSeeder.java:752](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L752) — the string `"Job Board and Referral Strategy"` inside a service catalog lesson title.
- [backend/src/main/java/com/spire/backend/service/SalesService.java:123](backend/src/main/java/com/spire/backend/service/SalesService.java#L123) — a code comment mentioning "attribution".

**Not found:** `referralSource`, `howDidYouHear`, `source`, `utm_*`,
`referral_source`, or any equivalent column on `User` or on any other
entity. This is a green-field field.

### 4b. Where the new screen slots into the route flow

Current post-verify chain (from §1c):

```
/enroll (POST) → /verify-email (OTP) → [verify success]
                                     ↓
                                     window.location.href = "/dashboard"
                                     ─── verify-email/page.tsx:143 ───
```

The natural interposition sites:

- **Frontend, single line:** replace [verify-email/page.tsx:143](frontend/src/app/verify-email/page.tsx#L143)
  `window.location.href = "/dashboard"` with a route to the new
  attribution page (e.g. `/how-did-you-hear`), which then routes to
  `/dashboard` on submit.
- **Backend, single call:** the JWT already carries role and userId
  after `verifyCode` returns, so the new screen can POST to a new
  endpoint (e.g. `/api/participants/attribution`) with `Authorization:
  Bearer <token>` and no additional guarding beyond `isAuthenticated()`.
  The DASHBOARD_ENABLED transition at
  [AuthService.java:304-305](backend/src/main/java/com/spire/backend/service/AuthService.java#L304-L305)
  can stay or be split into "conditional on non-reference path".

---

## 5. Role DELETION kill-list: COACH + TECHNICAL_ADVISOR

### 5a. Seeder + role infrastructure
- Role names seeded in the Phase-1A batch — [DataSeeder.java:70](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L70):
  ```
  "PARTICIPANT", "ERM", "COACH", "TECHNICAL_ADVISOR", ...
  ```
- Team-user seeding — [DataSeeder.java:577-597](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L577-L597):
  `coachRole`, `techAdvisorRole` lookups, seed test users `arjun.coach@`,
  `priya.tech@`, `rahul.interview@`, plus prod `coach@spireitco.com` at
  line 607-609 and `advisor@spireitco.com` at line 610-612.

### 5b. Controllers + guards
- **`CoachController`** — entire file to delete: [backend/src/main/java/com/spire/backend/controller/CoachController.java](backend/src/main/java/com/spire/backend/controller/CoachController.java) (116 lines, 10 endpoints under `/api/coaches`). Class-level `@PreAuthorize("hasAnyRole('COACH','TECHNICAL_ADVISOR')")` at [line 26](backend/src/main/java/com/spire/backend/controller/CoachController.java#L26).
- **`ParticipantController` document-view ad-hoc check** — [line 213](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L213) does NOT reference COACH (only `ROLE_ADMIN`, `ROLE_OPERATIONS_ADMIN`, `ROLE_SYSTEM_ADMIN`, `ROLE_ERM`) — so no coach cleanup needed here.

### 5c. Services + entities to delete (or drastically shrink)
- **`CoachService`** — [backend/src/main/java/com/spire/backend/service/CoachService.java](backend/src/main/java/com/spire/backend/service/CoachService.java) (whole file).
- **`CoachAssignmentService`** — [backend/src/main/java/com/spire/backend/service/CoachAssignmentService.java](backend/src/main/java/com/spire/backend/service/CoachAssignmentService.java):
  - `COACH_ROLES` map (CAREER_COACH / TECHNICAL_ADVISOR / INTERVIEW_COACH) at [line 42-47](backend/src/main/java/com/spire/backend/service/CoachAssignmentService.java#L42-L47).
  - `COACH_USER_ROLES = Set.of("COACH", "TECHNICAL_ADVISOR")` at [line 50-51](backend/src/main/java/com/spire/backend/service/CoachAssignmentService.java#L50-L51).
  - `assignCoaches`, `getAssignedCoaches`, `hasAnyCoach`, `isEligibleCoach` — all methods.
- **`CoachAssignment` entity + repository** — [backend/src/main/java/com/spire/backend/entity/CoachAssignment.java](backend/src/main/java/com/spire/backend/entity/CoachAssignment.java), [.../repository/CoachAssignmentRepository.java](backend/src/main/java/com/spire/backend/repository/CoachAssignmentRepository.java). Docstring at [CoachAssignment.java:36](backend/src/main/java/com/spire/backend/entity/CoachAssignment.java#L36) notes `coachRole` column carries "COACH, TECHNICAL_ADVISOR, ERM".
- **`CoachingFeedback`, `CoachingSession`, `CoachingTask` entities + repositories** — three whole entity/repo pairs written for coach dashboards ([backend/src/main/java/com/spire/backend/entity/](backend/src/main/java/com/spire/backend/entity/)).

### 5d. `PermissionService` — passing references
- Docstring line [PermissionService.java:16](backend/src/main/java/com/spire/backend/service/PermissionService.java#L16) mentions COACH / TECHNICAL_ADVISOR in the role list.
- `isAssignedCoachFor(...)` method at [line 75-82](backend/src/main/java/com/spire/backend/service/PermissionService.java#L75-L82) — used only by `canViewDocuments` at line 91 (currently returns false for coaches — comment says "Coaches do NOT see ID documents by default"). This method becomes dead.

### 5e. `OnboardingService` chain (§9)
- `ensureCoaches(user)` at [OnboardingService.java:194-217](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L194-L217) — call site at line 111, dashboard gate depends on `anyCoach` at line 117. Removing this de-gates `DASHBOARD_ENABLED` in the onboarding chain.
- `COACHES_ASSIGNED` transition at [line 209-210](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L209-L210) — the enum value can be removed once the chain is deleted.

### 5f. Other backend references (indirect)
- **`EmailTemplateService`** — likely has `sendCoachAssignmentEmail(...)` since it's called from [OnboardingService.java:205](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L205). Full file needs its coach-related methods removed.
- **`AdminController`** — [line 631-632](backend/src/main/java/com/spire/backend/controller/AdminController.java#L631-L632):
  ```java
  out.put("coach", byRole.getOrDefault("COACH", ...));
  out.put("technicalAdvisor", byRole.getOrDefault("TECHNICAL_ADVISOR", ...));
  ```
  Staff-pool grouping by role.
- **`AdminController` COACHES_ASSIGNED string** — [line 378](backend/src/main/java/com/spire/backend/controller/AdminController.java#L378), [line 440-comment](backend/src/main/java/com/spire/backend/controller/AdminController.java#L440).

### 5g. Frontend
- **Whole page to delete:** [frontend/src/app/coach-dashboard/page.tsx](frontend/src/app/coach-dashboard/page.tsx) (478 lines). Role guard at [line 57-61](frontend/src/app/coach-dashboard/page.tsx#L57-L61): `if (role !== "COACH" && role !== "TECHNICAL_ADVISOR")`.
- **`dashboardRouteForRole`** — [lib/api.ts:1522](frontend/src/lib/api.ts#L1522): `if (r === "COACH" || r === "TECHNICAL_ADVISOR") return "/coach-dashboard";` — delete branch.
- **`/dashboard` guard** — [dashboard/page.tsx:47-48](frontend/src/app/dashboard/page.tsx#L47-L48) — delete branch.
- **`isStaff` chains** — three copies:
  - [courses/page.tsx:49](frontend/src/app/courses/page.tsx#L49)
  - [courses/[id]/page.tsx:108](frontend/src/app/courses/[id]/page.tsx#L108)
  - [services/page.tsx:26](frontend/src/app/services/page.tsx#L26)
  Each has `|| role === "COACH" || role === "TECHNICAL_ADVISOR"` to drop.
- **`ShellWrapper`** — [components/layout/ShellWrapper.tsx:28](frontend/src/components/layout/ShellWrapper.tsx#L28) — the routes list includes `/coach-dashboard`; drop.
- **`/welcome` page** — [welcome/page.tsx:35-40](frontend/src/app/welcome/page.tsx#L35-L40) `COACH_LABELS` array; [line 227-238](frontend/src/app/welcome/page.tsx#L227-L238) team cards render loop; [line 84](frontend/src/app/welcome/page.tsx#L84) comment about `COACHES_ASSIGNED`. Full page probably retires with the workflow chain.
- **`OperationsPanel`** — [components/admin/OperationsPanel.tsx:247-259](frontend/src/components/admin/OperationsPanel.tsx#L247-L259) — the "assign coach" admin dropdown with `CAREER_COACH / TECHNICAL_ADVISOR / INTERVIEW_COACH`.
- **`OnboardingProgressBar`** — [components/OnboardingProgressBar.tsx:77](frontend/src/components/OnboardingProgressBar.tsx#L77) `case "COACHES_ASSIGNED":` — drop.
- **`ErmDashboard`** — [erm-dashboard/page.tsx:47](frontend/src/app/erm-dashboard/page.tsx#L47) `{ id: "coaches", label: "Coaches", ... }` — the "Coaches" tab and its body `<CoachesTab>` need removal.
- **`api.ts` completion-status list** — [lib/api.ts:1570](frontend/src/lib/api.ts#L1570) `case "COACHES_ASSIGNED":` — drop.
- **`ParticipantDashboardService`** — [line 167](backend/src/main/java/com/spire/backend/service/ParticipantDashboardService.java#L167) `case "COACHES_ASSIGNED" -> 14;` (phase-number map) — drop.
- **`program-selection/page.tsx`** — [line 66](frontend/src/app/program-selection/page.tsx#L66) `COACHING_OPTIONS` array. This is a user-facing form option about coaching preferences, not a role check — probably keep the label but the underlying feature it feeds may go with the chain.

### 5h. Kill-list total
**Rough count: ~35 files touched** across backend (entities, repos,
services, controller, config) and frontend (page, guards, isStaff chains,
admin operations panel). Whole-file deletions: `CoachController.java`,
`CoachService.java`, `CoachAssignmentService.java`,
`CoachAssignmentRepository.java`, `CoachAssignment.java`, three coaching
entity+repo pairs (session/task/feedback), `coach-dashboard/page.tsx`.

---

## 6. Role RENAME list: FINANCE → Accounts

Question first — is this a **DB rename** (`roles.name = 'ACCOUNTS'`), a
**route rename** (`/finance-dashboard` → `/accounts-dashboard`), a
**class rename** (`FinanceController` → `AccountsController`), or just a
**display label change**? Below is the full list; the size of the diff
depends on how deep the rename goes.

### 6a. Seeder
- Role seeded in Phase-1A batch — [DataSeeder.java:71](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L71).
- Team-user seed — [DataSeeder.java:579-618](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L579-L618): `financeRole` lookup, `finance@spireitco.com` at line 614.

### 6b. Backend controllers + services
- **`FinanceController`** — [backend/src/main/java/com/spire/backend/controller/FinanceController.java](backend/src/main/java/com/spire/backend/controller/FinanceController.java) (315 lines, 15 endpoints under `/api/finance`). Class annotation [line 41](backend/src/main/java/com/spire/backend/controller/FinanceController.java#L41) `hasAnyRole('FINANCE','SYSTEM_ADMIN','OPERATIONS_ADMIN')` — if collapsing per §7 the second/third names drop out.
- **`PermissionService.FINANCE_ROLES`** — [line 36-38](backend/src/main/java/com/spire/backend/service/PermissionService.java#L36-L38) `Set.of("FINANCE", "SYSTEM_ADMIN")`; `isFinance` method line 55-57; methods that call `isFinance` — `canViewCheckImages`, `canViewPaymentDetails`, `canViewOwnPayments` — lines 103, 112, 119.
- **Docstring/comment mentions** of "Finance" (Finance-gated column, Finance reviews, etc.) — appear in `CheckDocument.java:13`, `CheckTracking.java:10`, `PaymentLedger.java:13`, `PaymentService.java:33, 60`, `ParticipantCheckService.java:28, 30, 106`, `CheckTrackingService.java:26, 110`, `PaymentJob.java:21`, `EmailTemplateService.java:836, 895`. All comment-only; rename-safe with a global label swap if desired.

### 6c. Frontend
- **`dashboardRouteForRole`** — [lib/api.ts:1523](frontend/src/lib/api.ts#L1523).
- **`/dashboard` guard** — [dashboard/page.tsx:50](frontend/src/app/dashboard/page.tsx#L50).
- **`/finance-dashboard/page.tsx`** — 874 lines. Role check [line 63-67](frontend/src/app/finance-dashboard/page.tsx#L63-L67). Header string "Finance overview" [line 118](frontend/src/app/finance-dashboard/page.tsx#L118). Uses `<RoleDashboardShell title="Finance" ...>` at [line 85](frontend/src/app/finance-dashboard/page.tsx#L85).
- **API wrappers** in [lib/api.ts:1100-1213](frontend/src/lib/api.ts#L1100-L1213) — `FinancePlanRow`, `getFinancePlans`, `createFinancePlan`, `getFinanceInvoices`, `getFinanceLedger`, `getFinanceTrackings`, `getFinanceDashboard`, `reviewFinanceCheck`, `getFinanceChecks`, `FinanceDashboardSummary`, `FinancePlaceholder`, `FinanceCheckRow`, `FinanceTrackingRow`. Rename touches ~15 exports.
- **`isStaff` chains** — three copies as in §5g:
  - [courses/page.tsx:50](frontend/src/app/courses/page.tsx#L50)
  - [courses/[id]/page.tsx:109](frontend/src/app/courses/[id]/page.tsx#L109)
  - [services/page.tsx:27](frontend/src/app/services/page.tsx#L27)
- **`ShellWrapper`** — [components/layout/ShellWrapper.tsx:28](frontend/src/components/layout/ShellWrapper.tsx#L28) route list.

### 6d. Rename scope answer

- **Label-only rename** = swap "Finance" → "Accounts" in `<RoleDashboardShell title=...>` at [finance-dashboard/page.tsx:85](frontend/src/app/finance-dashboard/page.tsx#L85) + a handful of user-facing strings. **~5 lines.**
- **Role-name rename in DB** = also touch DataSeeder + `FINANCE_ROLES` in PermissionService + `@PreAuthorize` on FinanceController + `dashboardRouteForRole` + `/finance-dashboard` guard + three `isStaff` chains. Plus a **backfill UPDATE** on the `roles` table (`SET name = 'ACCOUNTS' WHERE name = 'FINANCE'`). **~10 files.**
- **Route rename** to `/accounts-dashboard` = additionally rename the folder and every reference to `/finance-dashboard`. **~4-5 files** (folder + dashboardRouteForRole + dashboard/page.tsx + ShellWrapper + any absolute-link mentions).
- **Class rename** `FinanceController` → `AccountsController`, `/api/finance` → `/api/accounts`, plus all frontend `apiFetch("/api/finance/...")` calls — deepest. **~20+ files.**

If the design brief is "just relabel the UI card" this is a tiny task.
If it's "reflect the new nomenclature across the API and DB" it fans
out to the rename-list above.

---

## 7. Role COLLAPSE touch-points

Cross-referenced from [ROLES_SURVEY.md §2](ROLES_SURVEY.md); this
section only adds what that survey did not cover.

### 7a. TRAINER → Instructor (merge)
Only two backend touch-points:
- **Seed** — [DataSeeder.java:59-60](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L59-L60), [line 208-256](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L208-L256) (seeded services + trainer users under `seedServicesAndTrainer(trainerRole)`).
- **`CourseController.java:125`** — `hasAnyRole('ADMIN','INSTRUCTOR','TRAINER')` — TRAINER folds into INSTRUCTOR trivially.

Frontend TRAINER-specific:
- [Navbar.tsx:41-45, 64](frontend/src/components/layout/Navbar.tsx#L41-L45) `TRAINER_LINKS` + case in switch.
- [services/create/page.tsx:46, :54](frontend/src/app/services/create/page.tsx#L46) `canCreate = role === "ADMIN" || role === "TRAINER"`.
- [admin/users/[userId]/page.tsx:25](frontend/src/app/admin/users/[userId]/page.tsx#L25) hardcoded `ROLES = ["STUDENT","INSTRUCTOR","TRAINER","ADMIN"]` picker.

### 7b. OPERATIONS_ADMIN + SYSTEM_ADMIN → Admin (merge)
The critical finding — **does folding OPS/SYSTEM into ADMIN resolve
the URL-matcher-vs-annotation drift flagged in ROLES_SURVEY §5?** —
**Yes.**

Currently:
- URL matcher — [SecurityConfig.java:56](backend/src/main/java/com/spire/backend/security/SecurityConfig.java#L56):
  `.requestMatchers("/api/admin/**").hasRole("ADMIN")` — only ADMIN passes.
- Method annotation — [AdminController.java:48](backend/src/main/java/com/spire/backend/controller/AdminController.java#L48):
  `hasAnyRole('ADMIN','OPERATIONS_ADMIN','SYSTEM_ADMIN')` — permissive but unreachable.

If OPS/SYSTEM users are all migrated to ADMIN by a `roles` UPDATE,
the annotation collapses to `hasRole('ADMIN')` and both layers agree.

Other OPS/SYSTEM touch-points:
- **`PermissionService.ADMIN_ROLES`** — [line 33-35](backend/src/main/java/com/spire/backend/service/PermissionService.java#L33-L35) `Set.of("OPERATIONS_ADMIN", "SYSTEM_ADMIN", "ADMIN")`.
- **`PermissionService.isSystemAdmin`** — [line 59-61](backend/src/main/java/com/spire/backend/service/PermissionService.java#L59-L61) — becomes dead code.
- **`ParticipantController.java:212-213`** — ad-hoc `ROLE_ADMIN` / `ROLE_OPERATIONS_ADMIN` / `ROLE_SYSTEM_ADMIN` / `ROLE_ERM` sniff for document viewing.
- **`FinanceController.java:41`** — the OPS/SYSTEM names in `hasAnyRole(...)` fold away.
- **Frontend `/operations` page** — [operations/page.tsx:43-49, 61-64](frontend/src/app/operations/page.tsx#L43-L49): `role !== "OPERATIONS_ADMIN" && role !== "SYSTEM_ADMIN"` guard. **The whole `/operations` route either merges into `/admin` or becomes an admin-only sub-tab.**
- **`dashboardRouteForRole`** — [lib/api.ts:1530](frontend/src/lib/api.ts#L1530) sends OPS/SYSTEM to `/operations`.
- **Middleware** — [middleware.ts:29](frontend/src/middleware.ts#L29) already only checks `payload.role === "ADMIN"`. If OPS/SYSTEM users become ADMIN they gain `/admin` access via middleware for the first time.
- **`isStaff` chains** — 3 files include `role === "SYSTEM_ADMIN" || role === "OPERATIONS_ADMIN"`, all folded.
- **`finance-dashboard` guard** — [line 64](frontend/src/app/finance-dashboard/page.tsx#L64) allows SYSTEM_ADMIN/OPERATIONS_ADMIN in.

### 7c. PARTICIPANT → Student (merge)
[ROLES_SURVEY §2k](ROLES_SURVEY.md) already confirmed **zero
`hasRole('PARTICIPANT')` gates in the backend**. So the merge is a
data-only change plus the frontend touch-points below:
- **`Navbar.tsx:187-189`** — `user.role?.toUpperCase() !== "PARTICIPANT"` check (paired with STUDENT).
- **`PermissionService` docstring** — [line 19](backend/src/main/java/com/spire/backend/service/PermissionService.java#L19) `"STUDENT → PARTICIPANT"` alias comment becomes obsolete.
- **`AuthService.enrollParticipant`** — [line 132-135](backend/src/main/java/com/spire/backend/service/AuthService.java#L132-L135) currently prefers `PARTICIPANT` role, falls back to `STUDENT`. After collapse: just `STUDENT`.

---

## 8. ERM dashboard — current state + where the referral queue attaches

### 8a. `/erm-dashboard/page.tsx`
- File: [frontend/src/app/erm-dashboard/page.tsx](frontend/src/app/erm-dashboard/page.tsx) (760 lines).
- **Guard** — [line 62-65](frontend/src/app/erm-dashboard/page.tsx#L62-L65): `if ((user.role ?? "").toUpperCase() !== "ERM") router.replace("/dashboard")`.
- **Initial fetch** — [line 67](frontend/src/app/erm-dashboard/page.tsx#L67) `getErmRoster()` (only).
- **Tabs** — [line 40-49](frontend/src/app/erm-dashboard/page.tsx#L40-L49):
  ```
  home       — assigned participant roster + detail
  reports    — weekly report review
  comms      — communication log
  interviews — interview milestones
  employment — Phase 6 (employment verification)
  phase1     — Phase 6 (Phase 1 completion approval)
  coaches    — coach assignments (read-only) [DELETED per §5g]
  profile    — link out to /profile
  ```
- **Shell** — uses `RoleDashboardShell` (§11).

### 8b. `ErmController` — every endpoint
File: [backend/src/main/java/com/spire/backend/controller/ErmController.java](backend/src/main/java/com/spire/backend/controller/ErmController.java) (130 lines, class-level `@PreAuthorize("hasRole('ERM')")`):

| # | Verb | Path | Returns |
|---|------|------|---------|
| 1 | GET | `/api/erm/participants` | `List<Map>` — assigned participant roster |
| 2 | GET | `/api/erm/participants/{id}` | `Map` — participant detail |
| 3 | GET | `/api/erm/reports` | `List<WeeklyReport>` |
| 4 | PUT | `/api/erm/reports/{id}/review` | `WeeklyReport` — mark reviewed with notes |
| 5 | POST | `/api/erm/participants/{id}/notes` | `ErmAssignment` — append comms note |
| 6 | GET | `/api/erm/employment/pending` | `List<Map>` — pending employment verifications |
| 7 | PUT | `/api/erm/employment/{id}/verify` | `Map` — verify employment |
| 8 | GET | `/api/erm/phases/pending` | `List<Map>` — pending Phase-1 approvals |
| 9 | PUT | `/api/erm/phases/{id}/approve` | `Map` — approve Phase-1 |

### 8c. Where the referral queue attaches
The natural attachment is symmetric to the existing "pending" queues
(§8b rows 6-9):

- **New backend endpoints:** `GET /api/erm/referrals/pending`,
  `PUT /api/erm/referrals/{userId}/approve`,
  `PUT /api/erm/referrals/{userId}/reject`. Signature and pattern
  identical to the existing `phases/pending` + `phases/{id}/approve`
  pair at [ErmController.java:106-129](backend/src/main/java/com/spire/backend/controller/ErmController.java#L106-L129).
- **New frontend tab:** insert a `{ id: "referrals", label: "Referrals",
  Icon: Users }` at position 0 (or 1) in `TABS` at [erm-dashboard/page.tsx:40-49](frontend/src/app/erm-dashboard/page.tsx#L40-L49); render a new tab body component that follows the shape of the existing `EmploymentTab` / `Phase1Tab`.
- **Cross-participant auth** already lives in `ErmService`
  (referenced from the class docstring at [ErmController.java:20-21](backend/src/main/java/com/spire/backend/controller/ErmController.java#L20-L21)); the new approve/reject calls fold into that same pattern.

---

## 9. Onboarding chain (`OnboardingService`)

### 9a. Full chain flow
[backend/src/main/java/com/spire/backend/service/OnboardingService.java:77-126](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L77-L126):

```
completeOnboarding(user):
  Step 1 — sendWelcomeEmail            → WELCOME_SENT           (line 85-93)
  Step 2 — sendCoordinatorIntroEmail   → DEEPTHI_INTRO_SENT     (line 96-104)
  Step 3 — ensureErm(user)             → ERM_ASSIGNED           (line 107)
  Step 4 — ensureCoaches(user)         → COACHES_ASSIGNED       (line 111)  ← DELETE per §5
  Step 5 — if (erm && anyCoach)        → DASHBOARD_ENABLED      (line 117-121)
                                                                 ← post-delete: just if (erm)
```

Alternate entry: `triggerProfileCompletionFlow(user)` at
[OnboardingService.java:58-68](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L58-L68) — fires from `ProfileCompletionService.markStepComplete` on first 0→100 crossing. Sends the celebration email then delegates to `completeOnboarding(user)`.

### 9b. Coach-assigning step (to be removed)
`ensureCoaches(user)` at [OnboardingService.java:194-217](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L194-L217):
- Delegates to `coachAssignmentService.assignCoaches(user)`.
- Returns `true` when at least one coach was assigned.
- Fires `sendCoachAssignmentEmail(...)` — line 205 — the email lists the four coach role labels.
- Transitions to `COACHES_ASSIGNED` — line 209-210.

**Removal impact:**
- `dashboard` transition gate at [line 117](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L117) reduces from `if (ermNow && anyCoach)` to `if (ermNow)`.
- The `coaches` snapshot key at [line 141, 148](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L141) becomes obsolete — polling page (`/welcome`) will need updating.

### 9c. Natural hook for "ERM approval unlocks 6 steps"
There are **two viable hook points**:

1. **In the OnboardingService itself** — add a new step "Step 0"
   between the top of `completeOnboarding` and step 1: gate the whole
   chain on `user.getErmApprovedAt() != null` (a new field). Only
   pipeline B enters `completeOnboarding` after ERM approval; pipeline
   A skips this chain entirely.

2. **In the AuthService verify path** — the current
   `DASHBOARD_ENABLED` transition at [AuthService.java:303-310](backend/src/main/java/com/spire/backend/service/AuthService.java#L303-L310) is unconditional. Split it into:
   - Pipeline A (non-reference): keep transition to `DASHBOARD_ENABLED`.
   - Pipeline B (reference): transition to a new intermediate state
     (`AWAITING_ERM_APPROVAL`) that leaves the user out of the dashboard.

The two hooks are complementary — hook #2 handles the initial pause,
hook #1 handles the resumption after ERM approves. The approval
endpoint (`PUT /api/erm/referrals/{userId}/approve`, §8c) is the
natural place to flip the state and call
`onboardingService.completeOnboarding(user)`.

---

## 10. The "dropped" mechanism

**Yes — a full soft-delete surface already exists.** Rejected referrals
can reuse it verbatim.

- **User columns:**
  - `isActive` (boolean, non-null, default `true`) — [User.java:71-73](backend/src/main/java/com/spire/backend/entity/User.java#L71-L73).
  - `deactivatedAt` (timestamp, nullable) — [User.java:81-82](backend/src/main/java/com/spire/backend/entity/User.java#L81-L82). Doc: "Stamped when an admin flips isActive to false … Cleared when an admin reactivates the account."

- **Admin endpoints:**
  - `DELETE /api/admin/users/{id}` — [AdminController.java:150-155](backend/src/main/java/com/spire/backend/controller/AdminController.java#L150-L155) → `AdminService.softDeleteUser(...)`.
  - `PUT /api/admin/users/{id}/status` (active toggle) — set active/inactive with audit — `AdminService.updateUserStatus(...)`.

- **`AdminService.softDeleteUser`** at [AdminService.java:291-330](backend/src/main/java/com/spire/backend/service/AdminService.java#L291-L330):
  1. Refuses self-delete (line 291-294).
  2. Refuses admin-on-admin (line 297-299).
  3. Sets `isActive=false`, `deactivatedAt=now()` (line 307-308).
  4. Scrubs personal data + writes an audit record (line 325-329).

- **Consumers of `isActive` in gating** (10+ hits): [ProfileReminderJob.java:63](backend/src/main/java/com/spire/backend/service/ProfileReminderJob.java#L63), `CoachAssignmentService.isActiveCoach` at [line 179-186](backend/src/main/java/com/spire/backend/service/CoachAssignmentService.java#L179-L186), `ErmAssignmentService.isActiveErm` at [line 95](backend/src/main/java/com/spire/backend/service/ErmAssignmentService.java#L95), etc.

- **Frontend admin panel** — [admin/page.tsx](frontend/src/app/admin/page.tsx) — has an "Active | Deactivated" sub-tab on the Users panel per [ROLES_SURVEY.md](ROLES_SURVEY.md). Reactivation UI exists at [admin/page.tsx:183](frontend/src/app/admin/page.tsx) (`reactivatingId` state).

**"Rejected referral = dropped account"** is a one-call reuse:
`user.setIsActive(false); user.setDeactivatedAt(now()); userRepository.save(user);`
plus a `RecordService.record(...)` audit line naming the ERM as
`rejectedBy`. No new schema.

---

## 11. Placeholder dashboard scaffolding pattern

**Canonical pattern to stamp:** three pieces per role.

### 11a. Page file (uses `RoleDashboardShell`)
Full example: [frontend/src/app/coach-dashboard/page.tsx](frontend/src/app/coach-dashboard/page.tsx) (478 lines) — but the smaller / more direct scaffold is [frontend/src/app/erm-dashboard/page.tsx](frontend/src/app/erm-dashboard/page.tsx) or [frontend/src/app/finance-dashboard/page.tsx](frontend/src/app/finance-dashboard/page.tsx). Minimal shape (extracted from the pattern):

```tsx
// frontend/src/app/<role>-dashboard/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users } from "lucide-react";
import { RoleDashboardShell, type RoleDashboardTab }
  from "@/components/dashboard/RoleDashboardShell";
import { useAuth } from "@/lib/auth-context";

const TABS: ReadonlyArray<RoleDashboardTab> = [
  { id: "home", label: "Overview", Icon: Users },
];

export default function <Role>DashboardPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [active, setActive] = useState("home");

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace("/login"); return; }
    if ((user.role ?? "").toUpperCase() !== "<ROLE>") {
      router.replace("/dashboard");
      return;
    }
  }, [isLoading, user, router]);

  if (isLoading) return <div>…spinner…</div>;

  return (
    <RoleDashboardShell title="<Role>" tabs={TABS}
      active={active} onSelect={setActive}>
      {active === "home" && <div>Placeholder</div>}
    </RoleDashboardShell>
  );
}
```

The `RoleDashboardShell` component itself is at
[frontend/src/components/dashboard/RoleDashboardShell.tsx:27-128](frontend/src/components/dashboard/RoleDashboardShell.tsx#L27-L128).
Docstring at [line 10-19](frontend/src/components/dashboard/RoleDashboardShell.tsx#L10-L19):
> "Shared sidebar shell for role-scoped dashboards (ERM, Coach,
> Finance). Same desktop / mobile pattern as the participant
> dashboard."

### 11b. `dashboardRouteForRole` entry — [lib/api.ts:1519-1534](frontend/src/lib/api.ts#L1519-L1534)
Add a case at the top of the switch:
```
if (r === "<ROLE>") return "/<role>-dashboard";
```

### 11c. `/dashboard` guard entry — [dashboard/page.tsx:45-55](frontend/src/app/dashboard/page.tsx#L45-L55)
Add a case:
```
if (role === "<ROLE>") { router.replace("/<role>-dashboard"); return; }
```

### 11d. `ShellWrapper` route list — [components/layout/ShellWrapper.tsx:28](frontend/src/components/layout/ShellWrapper.tsx#L28)
Add `/<role>-dashboard` to the tuple.

### 11e. Backend
- New controller class annotated `@PreAuthorize("hasRole('<ROLE>')")` at `@RequestMapping("/api/<role>")`. Even for a placeholder, at least one `GET` returning `{}` satisfies the guard chain.

### 11f. Navbar (optional)
The current `Navbar.tsx` at [line 54-77](frontend/src/components/layout/Navbar.tsx#L54-L77) does role-scoped link lists via `pickNavLinks`; role-specific dashboards don't currently need their own link list (they don't render the marketing navbar — `ShellWrapper` swaps to a dashboard-only layout for routes in the `/*-dashboard` list at [ShellWrapper.tsx:28](frontend/src/components/layout/ShellWrapper.tsx#L28)).

**Placeholder ERM + Accounts dashboards can be stamped by copying
the ERM page's outer shell, dropping the fetch/tab bodies, and
replacing the guard string. ~50 lines each.** ERM already has a
non-placeholder implementation; Accounts (post-rename from FINANCE)
already exists at
[frontend/src/app/finance-dashboard/page.tsx](frontend/src/app/finance-dashboard/page.tsx)
— if the design brief is "keep the existing finance dashboard, just
relabel it Accounts" per §6d, no new page is needed.

---

## 12. Risks + open questions

1. **`schema.sql` role CHECK constraint would reject collapsed names.** [schema.sql:15](backend/src/main/resources/schema.sql#L15) still lists only `STUDENT|INSTRUCTOR|TRAINER|ADMIN` on a dead `role VARCHAR` column that the entity doesn't use. If a fresh cold-boot ever runs `schema.sql` on a Postgres before ddl-auto reshapes it, the constraint blocks `ACCOUNTS`, `ERM`, etc. Flagged in [ROLES_SURVEY §1c](ROLES_SURVEY.md).
2. **No Flyway/Liquibase → the role migration is an out-of-band SQL step.** Renames (`FINANCE → ACCOUNTS`) and collapses (`OPERATIONS_ADMIN → ADMIN`) require `UPDATE roles SET name=... WHERE name=...` scripts, run by hand on Railway, following the same pattern as `backfill/2026-07-phase1c-ack-and-program-flags.sql`.
3. **`ProfileDTO` is a fat superset shipped on `/api/users/profile`.** [PROFILE_COMPLETION_SURVEY §8 risk #3](PROFILE_COMPLETION_SURVEY.md). The auth-context stores whichever payload was most recently fetched — so downstream role/status/`profileComplete` reads must tolerate either shape.
4. **Two profile controllers with divergent DTOs.** [PROFILE_COMPLETION_SURVEY §8 risk #2](PROFILE_COMPLETION_SURVEY.md). Any new fields (attribution / referral status / rejected-at) must be added to whichever of the two controllers is authoritative — probably `ParticipantController` (`/api/participants/profile`).
5. **Pipeline B's "gate" is currently implicit in `currentStatus`.** Ripping out the 20-value ladder erases the mechanism by which today's chain communicates "not yet dashboardReady." A new column (e.g. `pipeline`, `referralStatus`) has to replace the semantics the ladder was carrying.
6. **`DASHBOARD_ENABLED` transition at [AuthService.java:303-310](backend/src/main/java/com/spire/backend/service/AuthService.java#L303-L310) is the sole seam.** All downstream logic (dashboard render, weekly-report gate, employment gate, etc.) trusts this one transition. Splitting it two ways is a small edit but every consumer of `DASHBOARD_ENABLED` has to be re-audited to confirm the two pipelines mean the same thing to each gate.
7. **`ensureCoaches` currently gates `DASHBOARD_ENABLED` in the chain.** Removing coach assignment (§5) means the onboarding chain now transitions `DASHBOARD_ENABLED` on just ERM assignment. This is a **behavior change** for existing pipeline-B users: they'll advance to the dashboard sooner. Not a regression, but flag it.
8. **The `/welcome` page polls coach-assignment status.** [welcome/page.tsx:227-238](frontend/src/app/welcome/page.tsx#L227-L238) renders four coach cards. Post-coach deletion this page renders empty coach columns unless updated. The whole `/welcome` page may retire with the workflow simplification.
9. **`OnboardingProgressBar` reads the enum by string.** [components/OnboardingProgressBar.tsx:59-77](frontend/src/components/OnboardingProgressBar.tsx#L59-L77) case-switches on `PARTICIPANT_ID_CREATED`, `COACHES_ASSIGNED`, etc. Every removed value has to be dropped from the case list or the bar shows stale-looking blank rows.
10. **`AdminController.updateUserRole` accepts arbitrary role names** — [AdminService.java:245-274](backend/src/main/java/com/spire/backend/service/AdminService.java#L245-L274). It's `roleRepository.findByName(normalizedRole).orElseThrow(...)`, no allowlist. That means after removing COACH/TECHNICAL_ADVISOR seed rows, `roleRepository.findByName("COACH")` still returns the row if it's not deleted from the table — the seeder is idempotent-add-only, no delete path. **A cleanup SQL step is needed to drop the obsolete role rows.**
11. **Frontend admin role picker is hardcoded** — [admin/users/[userId]/page.tsx:25](frontend/src/app/admin/users/[userId]/page.tsx#L25) — `["STUDENT", "INSTRUCTOR", "TRAINER", "ADMIN"]`. Doesn't include ERM, ACCOUNTS, etc. If the restructure keeps ERM as a role admins can assign, this needs an update; if ERM stays admin-seeded-only (like today), no change needed.
12. **`PermissionService` alias / role-set constants would need pruning** — [PermissionService.java:33-38](backend/src/main/java/com/spire/backend/service/PermissionService.java#L33-L38). `ADMIN_ROLES` reduces from `{OPERATIONS_ADMIN, SYSTEM_ADMIN, ADMIN}` to `{ADMIN}`; `FINANCE_ROLES` from `{FINANCE, SYSTEM_ADMIN}` to `{ACCOUNTS}`. Docstring at [line 15-22](backend/src/main/java/com/spire/backend/service/PermissionService.java#L15-L22) documenting the old aliases also becomes stale.
13. **`DOC_REVIEW_PENDING` is a dead enum value** (§2c). If you're already ripping out statuses, this one is safe to remove first as a stress-test of downstream code — it has zero consumers.
14. **Legacy `PUT /api/users/complete-onboarding`** at [UserController.java:51-58](backend/src/main/java/com/spire/backend/controller/UserController.java#L51-L58) flips `user.onboardingCompleted = true`, but nothing in the participant flow calls it (only the orphaned `OnboardingWizard` legacy LMS component does — see [PROFILE_COMPLETION_SURVEY §4c](PROFILE_COMPLETION_SURVEY.md)). Safe to keep, delete, or repurpose for the new attribution step.
15. **`Wishlist` explicitly documents "browsing allowed for incomplete profiles"** — [Wishlist.java:11](backend/src/main/java/com/spire/backend/entity/Wishlist.java#L11). Pipeline A ("no completion gate") already matches wishlist semantics; the new design needs to decide whether **enroll-all** stays gated for pipeline B or is universal.
16. **The `/welcome-status` polling endpoint** at [ParticipantController.java:409-416](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L409-L416) has no role gate (`isAuthenticated()`) but reads the `WelcomeStatus.dashboardReady` flag. Pipeline A users would receive `dashboardReady=false` until the chain runs. Consider whether the endpoint should be pipeline-conditional too, or replaced.

---

**TWO_PIPELINE_SURVEY.md written — 13 sections, ~180 citations,
1 "not found" item (§4a: no referral/attribution field), kill-list:
~35 coach references across ~20 files, rename-list: ~15 finance
references (label-only ~5 lines, full rename ~20+ files).**
