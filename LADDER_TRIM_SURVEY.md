# LADDER_TRIM_SURVEY

Survey for the workflow-ladder trim (Phase 5B). Read-only, execute in a
separate pass. Cross-references (do NOT re-derive):
[TWO_PIPELINE_SURVEY.md §2](TWO_PIPELINE_SURVEY.md), commit `424a350` (5A
gate-swap: the 6 step gates already read booleans, not status). Every
claim below is cited `path:line`.

> **Headline:** the trim is data-safe by construction — `currentStatus` is
> a plain `VARCHAR(50)` and `Status.valueOf(...)` silently degrades unknown
> values to `DRAFT_STARTED` at read time
> ([WorkflowService.java:82-95](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L82-L95)).
> That failure mode is *safe but stranding*: a real DASHBOARD-tier user
> sitting on a removed value would be blocked from every upper-lifecycle
> gate. Backfill must therefore run **BEFORE** the enum-removal deploy
> (reverse of the usual order). See §7 + §8.

---

## 1. `transition()` + status-read mechanics

- **`User.currentStatus` is a plain `String`, not `@Enumerated`.**
  [User.java:190-192](backend/src/main/java/com/spire/backend/entity/User.java#L190-L192):
  ```java
  @Column(name = "current_status", length = 50)
  @Builder.Default
  private String currentStatus = "DRAFT_STARTED";
  ```
  The DB can hold ANY string. Removing an enum value doesn't hit Hibernate;
  it only affects Java code paths that enum-parse the string.

- **`transition(...)` allows arbitrary jumps + backward moves.** Full body
  at [WorkflowService.java:146-179](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L146-L179):
  ```java
  public void transition(User user, Status newStatus, String trigger) { transition(user, newStatus, trigger, null); }
  public void transition(User user, Status newStatus, String trigger, String notes) {
      String oldStatus = user.getCurrentStatus();
      user.setCurrentStatus(newStatus.name());
      userRepository.save(user);
      WorkflowState ws = WorkflowState.builder()
              .userId(user.getId())
              .fromStatus(oldStatus)
              .toStatus(newStatus.name())
              .triggerEvent(trigger)
              .notes(notes)
              .build();
      workflowStateRepository.save(ws);
      // ... audit record + log
  }
  ```
  No whitelist, no order enforcement. Class docstring at
  [WorkflowService.java:29-33](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L29-L33)
  confirms: *"Soft validation: transition accepts ANY status change (no
  whitelist of allowed pairs)."* A `DRAFT_STARTED` user can be moved
  directly to `WELCOME_SENT` or `DASHBOARD_ENABLED` in a single call.

- **`isStatusAtLeast(...)` silently degrades unknown strings to
  `DRAFT_STARTED`.** [WorkflowService.java:82-99](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L82-L99):
  ```java
  public Status currentStatus(User user) {
      String s = user.getCurrentStatus();
      if (s == null || s.isBlank()) return Status.DRAFT_STARTED;
      try { return Status.valueOf(s); }
      catch (IllegalArgumentException e) {
          log.warn("Unknown workflow status '{}' on user {} — defaulting to DRAFT_STARTED", s, user.getId());
          return Status.DRAFT_STARTED;
      }
  }
  public boolean isStatusAtLeast(User user, Status target) {
      return currentStatus(user).ordinal() >= target.ordinal();
  }
  ```
  **Consequence:** removing an enum value at code deploy time does NOT
  throw at request time. Any user still sitting on a removed value is
  treated as `DRAFT_STARTED`, i.e. blocked from every `isStatusAtLeast`
  gate above `DRAFT_STARTED`. Data-safe but access-stranding — hence the
  backfill-first deploy order in §8.

---

## 2. Every WRITE of a to-be-removed status (12 deletions)

Grep `workflowService.transition(` across `backend/src/main/java`:

| # | File:line | Status written | Surrounding step |
|---|-----------|----------------|------------------|
| 1 | [AuthService.java:165](backend/src/main/java/com/spire/backend/service/AuthService.java#L165) | `BASIC_INFO_SUBMITTED` | inside `enrollParticipant` |
| 2 | [AuthService.java:166](backend/src/main/java/com/spire/backend/service/AuthService.java#L166) | `EMAIL_VERIFICATION_PENDING` | inside `enrollParticipant` |
| 3 | [AuthService.java:261-262](backend/src/main/java/com/spire/backend/service/AuthService.java#L261-L262) | `EMAIL_VERIFIED` | inside `verifyCode` (post-OTP) |
| 4 | [AuthService.java:276-277](backend/src/main/java/com/spire/backend/service/AuthService.java#L276-L277) | `PARTICIPANT_ID_CREATED` | inside `verifyCode` (ID mint) |
| 5 | [AuthService.java:280-281](backend/src/main/java/com/spire/backend/service/AuthService.java#L280-L281) | `ID_EMAIL_SENT` | inside `verifyCode` (ID email) |
| 6 | [AcknowledgmentService.java:112-113](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L112-L113) | `ACKNOWLEDGMENT_ACCEPTED` | inside `submit(...)` |
| 7 | [DocumentService.java:226-227](backend/src/main/java/com/spire/backend/service/DocumentService.java#L226-L227) | `DOCUMENTS_SUBMITTED` | inside `complete(...)` |
| 8 | [ProgramSelectionService.java:130-131](backend/src/main/java/com/spire/backend/service/ProgramSelectionService.java#L130-L131) | `PROGRAM_SELECTED` | inside `submit(...)` |
| 9 | [ParticipantAgreementService.java:82-83](backend/src/main/java/com/spire/backend/service/ParticipantAgreementService.java#L82-L83) | `AGREEMENT_SENT` | inside `sign(...)` (nested `if (!≥X)` write-guard) |
| 10 | [ParticipantAgreementService.java:88-89](backend/src/main/java/com/spire/backend/service/ParticipantAgreementService.java#L88-L89) | `AGREEMENT_COMPLETED` | inside `sign(...)` (nested write-guard) |
| 11 | [ParticipantCheckService.java:157-158](backend/src/main/java/com/spire/backend/service/ParticipantCheckService.java#L157-L158) | `CHECK_COPY_UPLOADED` | inside `advancePastCheckUpload(...)` (nested write-guard) |
| 12 | [ParticipantCheckService.java:171-172](backend/src/main/java/com/spire/backend/service/ParticipantCheckService.java#L171-L172) | `SIGNED_AGREEMENT_SENT_TO_ERM` | inside `advancePastCheckUpload(...)` (nested write-guard) |

**Surviving writes (keep untouched):**
- [OnboardingService.java:88-89](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L88-L89) → `WELCOME_SENT`
- [OnboardingService.java:99-100](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L99-L100) → `DEEPTHI_INTRO_SENT`
- [OnboardingService.java:111-112](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L111-L112) + [ParticipantController.java:849-850](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L849-L850) → `DASHBOARD_ENABLED`
- [OnboardingService.java:174-175](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L174-L175) → `ERM_ASSIGNED`
- [WeeklyReportService.java:64](backend/src/main/java/com/spire/backend/service/WeeklyReportService.java#L64) → `WEEKLY_REPORTING_ACTIVE`
- [EmploymentService.java:94, :184](backend/src/main/java/com/spire/backend/service/EmploymentService.java#L94) → `EMPLOYMENT_ACCEPTED`, `PHASE_1_COMPLETED`
- [PaymentService.java:172, :223, :296](backend/src/main/java/com/spire/backend/service/PaymentService.java#L172) → `PAYMENT_PLAN_ACCEPTED`, `INVOICING_ACTIVE`, `PAYMENTS_TRACKED`
- [CheckTrackingService.java:77](backend/src/main/java/com/spire/backend/service/CheckTrackingService.java#L77) → `CHECK_TRACKING_ADDED`

**None of the 12 deletion-candidate writes is depended on by a KEPT gate.** The upper-lifecycle gates (§5) all read middle-chain or upper values, never the pre-dashboard lower rungs.

**Write-side idempotent guards `if (!≥X) transition(X)` at rows 9-12** are deleted together with the transition they gate — the guard has no meaning without the transition it wraps.

---

## 3. Every remaining READ of a to-be-removed status

Grep-classified across `backend/src/main/java` + `frontend/src`:

### 3a. Backend reads

| File:line | Reference | Category |
|-----------|-----------|----------|
| [WorkflowService.java:110](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L110) | `canSubmitDocuments` reads `ACKNOWLEDGMENT_ACCEPTED` | **dead** (grep confirms zero callers post 5A) |
| [WorkflowService.java:115](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L115) | `canStartAgreement` reads `PROGRAM_SELECTED` | **dead** (zero callers) |
| [WorkflowService.java:125](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L125) | `canEnableDashboard` reads `COACHES_ASSIGNED` | **dead** (zero callers since Phase 1 coach removal) |
| [DocumentReminderJob.java:37-38](backend/src/main/java/com/spire/backend/service/DocumentReminderJob.java#L37-L38) | `STUCK_STATUSES = Set.of("ID_EMAIL_SENT","ACKNOWLEDGMENT_ACCEPTED")` — the cron uses this to pick nudge targets | **live but neutered** (nobody transitions to those statuses post-deploy → job silently matches nothing) |
| [AdminController.java:369-373](backend/src/main/java/com/spire/backend/controller/AdminController.java#L369-L373) | `/assignments/queue` pending set includes `SIGNED_AGREEMENT_SENT_TO_ERM`, `COACHES_ASSIGNED` | **live** — string filter, must be trimmed to survivor set |
| [AdminController.java:439-440](backend/src/main/java/com/spire/backend/controller/AdminController.java#L439-L440) | `/operations/enrollment-queue` `incomplete = Set.of("DRAFT_STARTED","BASIC_INFO_SUBMITTED","EMAIL_VERIFICATION_PENDING")` | **live** — reduce to `{"DRAFT_STARTED"}` |
| [AdminController.java:467-468](backend/src/main/java/com/spire/backend/controller/AdminController.java#L467-L468) | `/operations/agreement-queue` reads `AGREEMENT_SENT`, `CHECK_COPY_UPLOADED` | **live but empty post-trim** — either delete method or reimplement on `agreementComplete=false` flag |
| [AdminController.java:534, 545](backend/src/main/java/com/spire/backend/controller/AdminController.java#L534) | `/operations/exceptions` string branches on `DOCUMENTS_SUBMITTED`, `AGREEMENT_SENT` | **live** — the string branches become unreachable; safe to trim |
| [ParticipantDashboardService.java:152-161](backend/src/main/java/com/spire/backend/service/ParticipantDashboardService.java#L152-L161) | status → phase-number lookup for the dashboard roadmap | **cosmetic** — collapse to survivor-only mapping |
| [DataSeeder.java:81-97](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L81-L97) | one-off `DOCUSIGN_*` → `AGREEMENT_*` UPDATE run every boot | **cosmetic on migrated DBs, unsafe if re-introducing removed values** — see risk #9 |
| Docstrings/comments only | e.g. [AcknowledgmentService.java:27, :32, :35](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L27); [ParticipantController.java:88, :112, :275, :318-319](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L88); [OnboardingService.java:18](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L18); [AuthService.java:108-109, :164-166, :265, :298](backend/src/main/java/com/spire/backend/service/AuthService.java#L108); [ParticipantAgreementService.java:18-23](backend/src/main/java/com/spire/backend/service/ParticipantAgreementService.java#L18-L23); [ParticipantCheckService.java:33, :100, :134, :146-149](backend/src/main/java/com/spire/backend/service/ParticipantCheckService.java#L33); [DocumentService.java:27](backend/src/main/java/com/spire/backend/service/DocumentService.java#L27); [EmailTemplateService.java:220-221](backend/src/main/java/com/spire/backend/service/EmailTemplateService.java#L220); [ProgramSelectionService.java:29, :32, :68](backend/src/main/java/com/spire/backend/service/ProgramSelectionService.java#L29); [WorkflowState.java:15-16](backend/src/main/java/com/spire/backend/entity/WorkflowState.java#L15) | **cosmetic** — update or leave |

### 3b. Frontend reads

| File:line | Reference | Category |
|-----------|-----------|----------|
| [api.ts:1522-1555](frontend/src/lib/api.ts#L1522-L1555) | `getOnboardingRoute(status)` switch with cases for every to-be-removed status | **dead** (dashboard-guard hardening gated its caller to `!user.pipeline`; every user now has a pipeline post backfill) — shrink cases for hygiene |
| [welcome/page.tsx:69-74](frontend/src/app/welcome/page.tsx#L69-L74) | `earlierSteps` set used to bounce mis-routed users back | **live** — shrink to `["DRAFT_STARTED"]` |
| [OnboardingProgressBar.tsx:54-72](frontend/src/components/OnboardingProgressBar.tsx#L54-L72) | `case` labels for every to-be-removed status → step-number mapping | **cosmetic** — collapse to survivor-only |
| Docstrings/comments only | [acknowledgment/page.tsx:23](frontend/src/app/acknowledgment/page.tsx#L23), [agreement/page.tsx:27, :174, :176](frontend/src/app/agreement/page.tsx#L27), [check-upload/page.tsx:29](frontend/src/app/check-upload/page.tsx#L29), [dashboard/page.tsx:90](frontend/src/app/dashboard/page.tsx#L90), [program-selection/page.tsx:31](frontend/src/app/program-selection/page.tsx#L31), [api.ts:460-461, :644](frontend/src/lib/api.ts#L460) | **cosmetic** — update or leave |

---

## 4. Enroll + verify initial-status path

### Today
- `enrollParticipant` at [AuthService.java:117-176](backend/src/main/java/com/spire/backend/service/AuthService.java#L117-L176):
  - Sets `currentStatus = "DRAFT_STARTED"` on the row builder ([line 148](backend/src/main/java/com/spire/backend/service/AuthService.java#L148)).
  - Transitions `DRAFT_STARTED → BASIC_INFO_SUBMITTED → EMAIL_VERIFICATION_PENDING` ([lines 165-166](backend/src/main/java/com/spire/backend/service/AuthService.java#L165-L166)).
- `verifyCode` at [AuthService.java:189-302](backend/src/main/java/com/spire/backend/service/AuthService.java#L189-L302):
  - Transitions `EMAIL_VERIFIED` ([lines 261-262](backend/src/main/java/com/spire/backend/service/AuthService.java#L261-L262)) → `PARTICIPANT_ID_CREATED` ([276-277](backend/src/main/java/com/spire/backend/service/AuthService.java#L276-L277)) → `ID_EMAIL_SENT` ([280-281](backend/src/main/java/com/spire/backend/service/AuthService.java#L280-L281)).
  - Comment at [line 294-299](backend/src/main/java/com/spire/backend/service/AuthService.java#L294-L299) already documents: *"verify-code leaves the user at ID_EMAIL_SENT and the frontend routes them to /how-did-you-hear."*
- `/api/participants/attribution` at [ParticipantController.java:849-850](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L849-L850): DIRECT users transition to `DASHBOARD_ENABLED`; REFERENCE users leave the status alone.

### After the trim
- Delete the 5 transition writes at [AuthService.java:165, :166, :261-262, :276-277, :280-281](backend/src/main/java/com/spire/backend/service/AuthService.java#L165). No `Status` reads in this path — the fall-through leaves `currentStatus="DRAFT_STARTED"` (the default from `enrollParticipant` line 148).
- Nothing downstream breaks: `emailVerified` is a separate flag ([User.java:93-95](backend/src/main/java/com/spire/backend/entity/User.java#L93-L95)), the 6 step gates are boolean-flag-driven post 5A, and the attribution endpoint moves DIRECT users past `DRAFT_STARTED` in a single jump (`transition` allows jumps per §1).
- REFERENCE users: stay at `DRAFT_STARTED` through the 6 steps; the onboarding chain lifts them to `WELCOME_SENT → DEEPTHI_INTRO_SENT → ERM_ASSIGNED → DASHBOARD_ENABLED` when the chain fires (post-approval + steps done).

---

## 5. Middle-chain + upper-lifecycle read sites (must survive)

### Middle-chain (WELCOME_SENT / DEEPTHI_INTRO_SENT / ERM_ASSIGNED)
- **`OnboardingService.completeOnboarding` chain** — [OnboardingService.java:82, :93, :110](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L82) — read-then-transition guards for each step.
- **`OnboardingService.snapshotForWelcome`** — [OnboardingService.java:124-127](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L124-L127) — reads all three for the `/welcome-status` payload.
- **`OnboardingService.ensureErm`** — [OnboardingService.java:147-148](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L147-L148) — idempotent guard on `ERM_ASSIGNED`.
- **`/api/participants/welcome-status/refresh`** — [ParticipantController.java:431-432](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L431-L432) — reads `DASHBOARD_ENABLED` to decide whether to re-run the chain.
- **`AdminController.assignmentQueue`** — [AdminController.java:370-372](backend/src/main/java/com/spire/backend/controller/AdminController.java#L370-L372) — string-filters on `WELCOME_SENT`, `DEEPTHI_INTRO_SENT`, `ERM_ASSIGNED` (plus the two removed values which get stripped per §3a).

All middle-chain reads are compatible with removing the lower statuses — they only reference values in the KEEP set.

### Upper-lifecycle (DASHBOARD_ENABLED and above) — untouched
- **`WeeklyReportService`** — [line 63-65](backend/src/main/java/com/spire/backend/service/WeeklyReportService.java#L63-L65) transitions `WEEKLY_REPORTING_ACTIVE`; [line 160-161](backend/src/main/java/com/spire/backend/service/WeeklyReportService.java#L160-L161) gates `DASHBOARD_ENABLED`.
- **`EmploymentService`** — [line 66-67](backend/src/main/java/com/spire/backend/service/EmploymentService.java#L66-L67) gates `DASHBOARD_ENABLED`; [line 92-95](backend/src/main/java/com/spire/backend/service/EmploymentService.java#L92) transitions `EMPLOYMENT_ACCEPTED`; [line 182-185](backend/src/main/java/com/spire/backend/service/EmploymentService.java#L182) transitions `PHASE_1_COMPLETED`.
- **`PaymentService`** — [line 70-71, :148-149, :170-173, :221-224, :294-297](backend/src/main/java/com/spire/backend/service/PaymentService.java#L70) — gates and writes for `PHASE_1_COMPLETED`, `PAYMENT_PLAN_ACCEPTED`, `INVOICING_ACTIVE`, `PAYMENTS_TRACKED`.
- **`CheckTrackingService`** — [line 47-48, :75-78](backend/src/main/java/com/spire/backend/service/CheckTrackingService.java#L47) — gates + writes `PAYMENT_PLAN_ACCEPTED` / `CHECK_TRACKING_ADDED`.

**Zero upper-lifecycle read reaches into the pre-dashboard rungs.** The trim leaves this tier completely untouched.

---

## 6. `canEnableDashboard()` + the chain's dashboard transition

- **`canEnableDashboard(user)`** at [WorkflowService.java:124-126](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L124-L126): `return isStatusAtLeast(user, Status.COACHES_ASSIGNED);`
  - `COACHES_ASSIGNED` is dead post Phase 1 (no writes anywhere in the codebase — confirmed by the phase 1 coach-removal commit `114b79e`).
  - Grep confirms **zero callers** of `canEnableDashboard`. **Safe to delete** alongside `COACHES_ASSIGNED`.
- **Chain-end transition** at [OnboardingService.java:106-117](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L106-L117):
  ```java
  if (ermNow) {
      if (!workflowService.isStatusAtLeast(user, WorkflowService.Status.DASHBOARD_ENABLED)) {
          workflowService.transition(user, WorkflowService.Status.DASHBOARD_ENABLED, "dashboard_enabled");
      }
  }
  ```
  Condition is `if (ermNow)` — confirmed correct for post-Phase-1. Given `transition()` allows arbitrary jumps (§1), a `DRAFT_STARTED` user can be moved directly through `WELCOME_SENT → DEEPTHI_INTRO_SENT → ERM_ASSIGNED → DASHBOARD_ENABLED` by the chain calling `transition()` sequentially. **No stranding risk** — the chain works identically pre- and post-trim.

---

## 7. Operator query (do NOT run — needs live Railway psql)

Run this against the live Railway database and paste the result before executing the trim:

```sql
SELECT current_status, COUNT(*) AS n
  FROM users
 GROUP BY current_status
 ORDER BY n DESC;
```

**How to read the output:**
- Rows whose `current_status` is in the survivor set (§8a) need no action.
- Rows on a to-be-removed status must be migrated **before** the code deploy:
  - If the user is genuinely mid-onboarding (not yet through the 6 steps) → `DRAFT_STARTED`.
  - If the user is actually a completed/active participant (e.g. mid-agreement or beyond, or `profile_complete=true`) → `DASHBOARD_ENABLED` (the closest survivor that preserves upper-lifecycle access).
- Any surprising bucket (e.g. users at `PAYMENT_PLAN_ACCEPTED` but `profile_complete=false`) is a data-integrity anomaly worth understanding before finalising the mapping.

**Reverse deploy order (§8):** run the backfill FIRST, then deploy the enum-removal code. The reverse of the usual schema→code order because `currentStatus` is a plain string and `Status.valueOf` silently degrades unknown values to `DRAFT_STARTED` at request time (§1) — deploying code first would strand any DASHBOARD-tier user still on a removed value (blocked from all upper-lifecycle gates until the backfill runs).

---

## 8. Proposed plan + backfill skeleton (propose only, do not execute)

### 8a. Final survivor enum list (in order, sentinel below DASHBOARD_ENABLED)

```java
public enum Status {
    DRAFT_STARTED,          // sentinel — pre-dashboard, onboarding in progress
    WELCOME_SENT,
    DEEPTHI_INTRO_SENT,
    ERM_ASSIGNED,
    DASHBOARD_ENABLED,
    WEEKLY_REPORTING_ACTIVE,
    EMPLOYMENT_ACCEPTED,
    PHASE_1_COMPLETED,
    PAYMENT_PLAN_ACCEPTED,
    CHECK_TRACKING_ADDED,
    INVOICING_ACTIVE,
    PAYMENTS_TRACKED
}
```
**12 survivors** (down from 25 post-`DOC_REVIEW_PENDING` removal), **13 removals**. `DRAFT_STARTED.ordinal() = 0` < `DASHBOARD_ENABLED.ordinal() = 4` — invariant preserved.

### 8b. Transition-write deletions (12, from §2)

All 12 `workflowService.transition(...)` calls in §2, plus their surrounding write-side idempotent `if (!isStatusAtLeast(X))` guards where present (rows 9-12). No transition calls in `OnboardingService`, `WeeklyReportService`, `EmploymentService`, `PaymentService`, `CheckTrackingService`, or the attribution endpoint are touched.

### 8c. Read-site cleanups (from §3), each marked

| Site | Action |
|------|--------|
| `WorkflowService.canSubmitDocuments`, `canStartAgreement`, `canEnableDashboard` | **delete** (all three helpers — zero callers) |
| `DocumentReminderJob.STUCK_STATUSES` + surrounding job | **rewrite** to check boolean flags (`!acknowledgmentComplete && !documentsComplete`) OR **delete** the whole cron |
| `AdminController.assignmentQueue` pending set | **shrink** to `{"WELCOME_SENT","DEEPTHI_INTRO_SENT","ERM_ASSIGNED"}` |
| `AdminController.enrollmentQueue` incomplete set | **shrink** to `{"DRAFT_STARTED"}` |
| `AdminController.agreementQueue` (whole method) | **delete** or **reimplement** on `agreementComplete=false` flag |
| `AdminController.exceptions` dead string branches | **delete** the branches; keep AGREEMENT_STALLED reimplemented on `agreementComplete` flag if desired |
| `ParticipantDashboardService` phase-number map | **collapse** to survivor-only |
| `DataSeeder` DOCUSIGN rename block (lines 81-97) | **delete** (already-migrated DBs; risk #9) |
| Frontend `getOnboardingRoute` switch | **shrink** cases to survivor set; branch is dead-code after pipeline backfill |
| Frontend `welcome/page.tsx` earlierSteps set | **shrink** to `["DRAFT_STARTED"]` |
| Frontend `OnboardingProgressBar` case labels | **collapse** to survivor-only |
| Docstring/comment mentions (backend + frontend) | **cosmetic sweep** — update or leave |

### 8d. Backfill SQL skeleton

```sql
-- Two-pass workflow-ladder trim backfill. Run on Railway psql BEFORE
-- deploying the enum-removal code. Preview first with §7's query; adjust
-- the WHEN-clauses if it reveals a bucket the two-way mapping below
-- doesn't cover cleanly.

BEGIN;

-- Preview (from §7)
-- SELECT current_status, COUNT(*) FROM users GROUP BY current_status ORDER BY 2 DESC;

-- 1. Users on removed statuses who are still mid-onboarding
--    (profile_complete is not TRUE) → DRAFT_STARTED
UPDATE users
   SET current_status = 'DRAFT_STARTED'
 WHERE current_status IN (
     'BASIC_INFO_SUBMITTED','EMAIL_VERIFICATION_PENDING','EMAIL_VERIFIED',
     'PARTICIPANT_ID_CREATED','ID_EMAIL_SENT','ACKNOWLEDGMENT_ACCEPTED',
     'DOCUMENTS_SUBMITTED','PROGRAM_SELECTED','AGREEMENT_SENT',
     'AGREEMENT_COMPLETED','CHECK_COPY_UPLOADED','SIGNED_AGREEMENT_SENT_TO_ERM',
     'COACHES_ASSIGNED'
   )
   AND profile_complete IS NOT TRUE;

-- 2. Users on removed statuses who ARE profile-complete
--    (finished the 6 steps but historically sat at a removed mid-status)
--    → DASHBOARD_ENABLED so upper-lifecycle gates continue to allow them.
UPDATE users
   SET current_status = 'DASHBOARD_ENABLED'
 WHERE current_status IN (
     'BASIC_INFO_SUBMITTED','EMAIL_VERIFICATION_PENDING','EMAIL_VERIFIED',
     'PARTICIPANT_ID_CREATED','ID_EMAIL_SENT','ACKNOWLEDGMENT_ACCEPTED',
     'DOCUMENTS_SUBMITTED','PROGRAM_SELECTED','AGREEMENT_SENT',
     'AGREEMENT_COMPLETED','CHECK_COPY_UPLOADED','SIGNED_AGREEMENT_SENT_TO_ERM',
     'COACHES_ASSIGNED'
   )
   AND profile_complete IS TRUE;

-- workflow_states audit rows carry from_status/to_status pointing at removed
-- values. LEAVE them — they're historical audit records, not lookups against
-- the enum. Java never enum-parses those columns; they're String only.

-- Verify: only survivor set values should remain.
-- SELECT current_status, COUNT(*) FROM users GROUP BY current_status ORDER BY 2 DESC;

COMMIT;
```

### 8e. Deploy order (REVERSE of the usual)

1. **Operator runs §7 query** and shares the bucket distribution.
2. **Adjust the backfill WHEN-clauses** if any bucket the two-way mapping doesn't cover cleanly appears (e.g. genuine anomalies).
3. **Operator runs the backfill SQL** — every row moves off the removed values.
4. **THEN deploy the enum-removal code.**

**Why reverse:** `currentStatus` is a plain String column ([User.java:190-192](backend/src/main/java/com/spire/backend/entity/User.java#L190-L192)) and `Status.valueOf(...)` silently degrades unknown values to `DRAFT_STARTED` at read time ([WorkflowService.java:82-95](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L82-L95)). Deploying code first is data-safe but access-stranding: any real DASHBOARD-tier user sitting on a removed value would be blocked from every upper-lifecycle gate (weekly reports, employment, payments, invoicing) until the backfill runs.

---

## 9. Risks

1. **Backfill-first deploy discipline.** If the enum-removal code deploys before the backfill, `Status.valueOf` silently maps every real-user removed status to `DRAFT_STARTED` → they lose upper-lifecycle access until the SQL runs. Cited at [WorkflowService.java:82-95](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L82-L95).
2. **`DocumentReminderJob` becomes silently neutered.** [DocumentReminderJob.java:37-38](backend/src/main/java/com/spire/backend/service/DocumentReminderJob.java#L37-L38) scans for `ID_EMAIL_SENT` / `ACKNOWLEDGMENT_ACCEPTED` — after trim those statuses don't exist, so the cron sends zero reminders. Either rewrite on boolean flags or delete the job.
3. **`AdminController.agreementQueue` returns empty post-trim.** [AdminController.java:462-483](backend/src/main/java/com/spire/backend/controller/AdminController.java#L462-L483) filters on `AGREEMENT_SENT` / `CHECK_COPY_UPLOADED` — nobody sits at those post-trim. Operations Admin loses the stalled-agreement surface unless reimplemented on `agreementComplete=false`.
4. **`AdminController.enrollmentQueue` set shrinks to a single value.** [AdminController.java:439-440](backend/src/main/java/com/spire/backend/controller/AdminController.java#L439-L440) — must be reduced or the queue silently misses everyone.
5. **Frontend `getOnboardingRoute` dead cases.** [api.ts:1522-1555](frontend/src/lib/api.ts#L1522-L1555) — its only caller ([dashboard/page.tsx:88-92](frontend/src/app/dashboard/page.tsx#L88-L92)) is already gated behind `!user.pipeline`, so the switch is dead in practice. Shrink for hygiene only.
6. **`welcome/page.tsx:69-74` earlier-steps set.** After trim only `DRAFT_STARTED` remains; the bounce logic still works but the array is dead-weight.
7. **`WorkflowService.canEnableDashboard()` becomes broken.** [WorkflowService.java:124-126](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L124-L126) reads `COACHES_ASSIGNED`, being removed. Zero callers — safe to delete along with the enum value.
8. **`workflow_states` audit rows referencing removed values are preserved.** No code enum-parses `from_status` / `to_status` — historical audit integrity is intact. Leave as-is.
9. **`DataSeeder` DOCUSIGN rename migration re-introduces removed values.** [DataSeeder.java:80-97](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L80-L97) runs `UPDATE users SET current_status = 'AGREEMENT_SENT'/'AGREEMENT_COMPLETED'` on every boot. Post-trim these UPDATEs would rewrite legacy DOCUSIGN rows into removed enum values. **Must delete this block** as part of the code change; on production Railway all such rows have long been migrated so the delete is safe.

---

**LADDER_TRIM_SURVEY.md written — survivor set: 12 statuses, removals: 13, write-deletions: 12, read-cleanups: 12 (7 backend + 3 frontend + docstring sweep). Awaiting live current_status distribution (§7 operator query) before the execute prompt.**
