# ACK_STEP_BUG_SURVEY

Diagnosis of "Acknowledgment step never persists as complete." Read-only,
no source files modified. Every claim is cited `path:line`.

> **One-line verdict (see §7):** `AcknowledgmentService.submit` short-
> circuits and returns *before* calling
> `ProfileCompletionService.markStepComplete("ACKNOWLEDGMENT")` for any
> user whose `currentStatus` is already `>= ACKNOWLEDGMENT_ACCEPTED` —
> and every Phase-1C signup lands at `DASHBOARD_ENABLED` (ordinal 18),
> which is well past `ACKNOWLEDGMENT_ACCEPTED` (ordinal 6). Result: the
> per-step flag is never flipped, `/completion` keeps reporting the
> step as incomplete, and the checklist keeps reopening at Step 2.

---

## 1. Frontend submit path

- Page: [frontend/src/app/acknowledgment/page.tsx](frontend/src/app/acknowledgment/page.tsx).
  Handler: `handleSubmit` at [line 164-197](frontend/src/app/acknowledgment/page.tsx#L164-L197).

- **HTTP call:** `submitAcknowledgment(...)` at [page.tsx:169-177](frontend/src/app/acknowledgment/page.tsx#L169-L177).
  The wrapper is at [frontend/src/lib/api.ts](frontend/src/lib/api.ts)
  and posts `POST /api/participants/acknowledgments`. Body shape sent
  from the page ([page.tsx:169-177](frontend/src/app/acknowledgment/page.tsx#L169-L177)):
  ```
  {
    legalName,
    signatureImage,           // data:image/png;base64,…
    signatureMethod,          // "draw" | "upload"
    interestAccepted,         // boolean
    documentationConsent,     // boolean
    communicationConsent,     // boolean
    acknowledgmentVersion     // literal "ACK-v1.0"
  }
  ```
  `ACK_VERSION = "ACK-v1.0"` at [page.tsx:27](frontend/src/app/acknowledgment/page.tsx#L27).

- **On success** ([page.tsx:178-191](frontend/src/app/acknowledgment/page.tsx#L178-L191)):
  1. `void result;` — the returned payload is **explicitly discarded**;
     nothing on the client reads what the backend just wrote.
  2. `await refreshUser();` — this re-fetches `GET /api/users/profile`
     ([frontend/src/lib/auth-context.tsx:144-155](frontend/src/lib/auth-context.tsx#L144-L155))
     and stores it into the auth-context `user` slot.
  3. `router.replace(...)`:
     - `fromProfile === true` → `/dashboard?tab=complete-profile&step=DOCUMENTS`
     - otherwise → `/dashboard?tab=complete-profile`

- **`?from=profile` param usage:** read at [page.tsx:42](frontend/src/app/acknowledgment/page.tsx#L42)
  (`const fromProfile = searchParams.get("from") === "profile";`) and
  affects **only** the post-success redirect target
  ([page.tsx:187-191](frontend/src/app/acknowledgment/page.tsx#L187-L191)). It
  does not change what the POST body carries or which endpoint is
  called.

- **Client-side gate before submit** at [page.tsx:78-94](frontend/src/app/acknowledgment/page.tsx#L78-L94):
  > `if (user.acknowledgmentComplete) { router.replace(".../complete-profile"); return; }`

  This is why the user re-lands on the form: `user.acknowledgmentComplete`
  is still `false` after `refreshUser()`, so the guard doesn't bounce
  them, and the checklist tab shows Acknowledgment as the active step.

---

## 2. Backend endpoint

### 2a. Controller

Handler at [backend/src/main/java/com/spire/backend/controller/ParticipantController.java:114-130](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L114-L130):

```java
@PostMapping("/acknowledgments")
@PreAuthorize("isAuthenticated()")
public ResponseEntity<ApiResponse<Map<String, Object>>> submitAcknowledgment(
        @Valid @RequestBody AcknowledgmentSubmitRequest request,
        Authentication auth,
        HttpServletRequest httpRequest) {
    Long userId = Long.parseLong(auth.getPrincipal().toString());
    Acknowledgment saved = acknowledgmentService.submit(userId, request, httpRequest);
    return ResponseEntity.ok(ApiResponse.success(
            "Acknowledgment accepted",
            Map.of(
                    "acknowledgmentId", saved.getId(),
                    "version", saved.getAcceptedTextVersion(),
                    "nextStep", "/document-upload",
                    "success", true
            )));
}
```

- Only guard on the controller itself: `@PreAuthorize("isAuthenticated()")`.
- DTO in: `AcknowledgmentSubmitRequest` at
  [backend/src/main/java/com/spire/backend/dto/AcknowledgmentSubmitRequest.java:24-42](backend/src/main/java/com/spire/backend/dto/AcknowledgmentSubmitRequest.java#L24-L42)
  — `@Valid` triggers `@NotBlank` on `legalName`, `signatureImage`,
  `acknowledgmentVersion`. `signatureMethod` and the three consent
  booleans are un-annotated.
- **Response body always shape:** `Map.of("acknowledgmentId",
  "version", "nextStep": "/document-upload", "success": true)`. It
  **does not** include the updated user or the completion snapshot.

### 2b. `AcknowledgmentService.submit` — the bug lives here

File: [backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java).

Signature: `@Transactional public Acknowledgment submit(Long userId,
AcknowledgmentSubmitRequest req, HttpServletRequest httpRequest)` at
[AcknowledgmentService.java:53-56](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L53-L56).

Branches, in order:

1. **User-exists guard** (line 57-58) — throws `ResourceNotFoundException`
   if the user id can't be found. Not the culprit.

2. **Pre-condition workflow gate** at [line 61-64](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L61-L64):
   ```java
   if (!workflowService.isStatusAtLeast(user, WorkflowService.Status.ID_EMAIL_SENT)) {
       throw new UnauthorizedException(
               "Complete email verification and receive your participant ID first.");
   }
   ```
   `ID_EMAIL_SENT` is enum ordinal 5
   ([backend/src/main/java/com/spire/backend/service/WorkflowService.java:48-75](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L48-L75)).
   A Phase-1C user at `DASHBOARD_ENABLED` (ordinal 18) passes this.

3. **⚠ Idempotent short-circuit — the bug** at [line 66-73](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L66-L73):
   ```java
   // ── Idempotent return if already accepted ───────────────────
   if (workflowService.isStatusAtLeast(user, WorkflowService.Status.ACKNOWLEDGMENT_ACCEPTED)) {
       return acknowledgmentRepository
               .findByUserIdAndAcknowledgmentType(userId, TYPE_INTEREST_AND_ACCEPTANCE)
               .stream()
               .findFirst()
               .orElseGet(() -> persist(user, req, httpRequest));
   }
   ```
   `ACKNOWLEDGMENT_ACCEPTED` is ordinal 6. For any user whose
   `currentStatus` is at ordinal ≥ 6 (i.e. every non-legacy signup
   because they all land at `DASHBOARD_ENABLED` = 18 straight after
   verification — see §4b) this branch is entered, and the method
   `return`s — either the existing acknowledgment row **or** a
   freshly-persisted one via `persist(...)` — **without ever running
   the code below**. Docstring at [line 34-36](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L34-L36)
   states the intent:
   > "Idempotent: a re-submission while the user is already at
   > ACKNOWLEDGMENT_ACCEPTED or later returns the existing row rather
   > than writing a duplicate."

   That intent was written when `currentStatus` actually meant
   "acknowledgment done." After Phase 1C decoupled the checklist from
   the status enum, "at least ACKNOWLEDGMENT_ACCEPTED" no longer
   implies the per-step flag was ever set.

4. **Validation** (line 76-97) — only reached when the short-circuit
   was **not** taken. On a Phase-1C signup it is never reached.

5. **`persist(...)`** (line 99, defined 132-155) — writes the row.

6. **Workflow transition** at line 102-104: `workflowService.transition(
   user, ACKNOWLEDGMENT_ACCEPTED, "acknowledgment")`. Also unreached.

7. **The flag flip** at [line 106-107](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L106-L107):
   ```java
   // ── Progressive profile flag (Phase 1C) ─────────────────────
   profileCompletionService.markStepComplete(user, "ACKNOWLEDGMENT");
   ```
   **Unreached on the short-circuit path.** This is the entire cause
   of the symptom.

8. **`RecordService.record(...)`** and info-log (line 109-124) — also
   unreached.

### 2c. `ProfileCompletionService.markStepComplete`

At [backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java:127-175](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L127-L175).

- **Does NOT early-return on already-true.** The `switch` at
  [line 128-141](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L128-L141)
  runs unconditionally:
  ```java
  switch (step) {
      case "ACKNOWLEDGMENT" -> user.setAcknowledgmentComplete(true);
      ...
  }
  ```
- The setter is unconditional; every subsequent line (percentage
  recompute, `userRepository.save(user)`, `RecordService.record(...)`,
  `OnboardingService.triggerProfileCompletionFlow` on first 100%
  crossing) runs on every call. So `markStepComplete` itself is not
  the problem — the problem is that it is never *called* on the
  short-circuit path in §2b.

---

## 3. Persistence + response

- **Transaction boundary:** `@Transactional` at
  [AcknowledgmentService.java:53](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L53).
  On the short-circuit path (§2b step 3), the transaction commits
  successfully — but nothing meaningful is written to `users`
  (only the acknowledgment row may be written by `persist(...)` if
  no prior row existed).
- **No hidden exception-swallowing wrapper.** The method body has no
  try/catch that would eat an exception and still return 200. The
  path is: enter method → early-return → controller returns 200.
- **Response body** from the controller
  ([ParticipantController.java:122-129](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L122-L129)):
  ```
  { "acknowledgmentId": <id>, "version": <string>,
    "nextStep": "/document-upload", "success": true }
  ```
  It does **not** include the updated user or the completion snapshot.
- **Client-side read-back:** the frontend explicitly discards this
  payload (`void result;` at [page.tsx:178](frontend/src/app/acknowledgment/page.tsx#L178))
  and instead calls `refreshUser()` at
  [page.tsx:182](frontend/src/app/acknowledgment/page.tsx#L182).
  `refreshUser` re-fetches `GET /api/users/profile`
  ([auth-context.tsx:144-155](frontend/src/lib/auth-context.tsx#L144-L155)),
  which reads `user.acknowledgmentComplete` off the row. Because
  §2b step 7 never fired, the value is still `false`, so the auth
  context holds `false`.
- On the dashboard, the checklist body calls `getProfileCompletion()`
  ([frontend/src/components/dashboard/ProfileCompletionChecklist.tsx:50-61](frontend/src/components/dashboard/ProfileCompletionChecklist.tsx#L50-L61))
  which hits `GET /api/participants/profile/completion`. That endpoint
  reads the same flags via `ProfileCompletionService.getStatus(user)`
  ([ProfileCompletionService.java:53-88](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L53-L88)),
  so it also reports `acknowledgmentComplete: false`, and
  `data.steps.findIndex(s => !s.completed)`
  ([ProfileCompletionChecklist.tsx:99](frontend/src/components/dashboard/ProfileCompletionChecklist.tsx#L99))
  points back at ACKNOWLEDGMENT as the active step.

---

## 4. Version / prerequisite guards

### 4a. Acknowledgment "version"

- Frontend pins `ACK_VERSION = "ACK-v1.0"` at
  [acknowledgment/page.tsx:27](frontend/src/app/acknowledgment/page.tsx#L27),
  posted as `acknowledgmentVersion`.
- Backend does **not compare** the version against anything. Grep of
  `AcknowledgmentService.java` for `version`:
  - Line 46 (`accepted_text_version`) — column name only.
  - Line 112, 115, 123 — reads `req.getAcknowledgmentVersion()` into
    the audit `record()` details and the log line, then persists it
    unchanged onto `Acknowledgment.acceptedTextVersion` via
    `persist(...)`.
  - **No equality check, no whitelist, no `if (!expected.equals(req...))`
    branch anywhere in the service.**
- The `Acknowledgment` entity's `acceptedTextVersion` column is
  `nullable=false, length=20`
  ([Acknowledgment.java:46-47](backend/src/main/java/com/spire/backend/entity/Acknowledgment.java#L46-L47))
  — `"ACK-v1.0"` (8 chars) fits.
- **There is no server-side constant** for a "current acknowledgment
  version." Grep in `AcknowledgmentService.java`, `Acknowledgment*.java`,
  and `backend/src/main/resources/terms/` (which contains only
  `v1.0.json` and is consumed by `TermsContentService` for the
  separate Terms-of-Service agreement flow, not this acknowledgment).
  A version mismatch cannot silently prevent completion because
  nothing checks the version.
- Conclusion: **version is NOT the cause.**

### 4b. Prerequisite step check

- Only pre-condition: `isStatusAtLeast(user, ID_EMAIL_SENT)` at
  [AcknowledgmentService.java:61](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L61).
  A Phase-1C signup lands at `DASHBOARD_ENABLED` (ordinal 18) — this
  is confirmed by:
  - `AuthService` at [line 295-310](backend/src/main/java/com/spire/backend/service/AuthService.java#L295-L310):
    > "Phase 1C: lift the user straight to DASHBOARD_ENABLED so
    > the frontend lands them on /dashboard immediately after
    > verifying email … `workflowService.transition(saved,
    > WorkflowService.Status.DASHBOARD_ENABLED, "dashboard_enabled_quick_signup");`"
  - `ID_EMAIL_SENT` is ordinal 5, `DASHBOARD_ENABLED` is ordinal 18
    ([WorkflowService.java:48-75](backend/src/main/java/com/spire/backend/service/WorkflowService.java#L48-L75)),
    so the ID_EMAIL_SENT gate passes trivially.
- **There is no "BASIC_INFO must be done first" check** in
  `AcknowledgmentService.submit`. `BasicInfoRequest` writes its own
  four fields directly to the user
  ([ParticipantController.java:785-802](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L785-L802))
  and no other step reads them as a precondition. So the six steps
  are backend-order-independent — the frontend's "locked" visual on
  later steps is UI-only, enforced at
  [ProfileCompletionChecklist.tsx:130-142](frontend/src/components/dashboard/ProfileCompletionChecklist.tsx#L130-L142).

---

## 5. Client-side stale state

- The checklist tab body reads from **two sources** in this sequence:
  1. On mount, `getProfileCompletion()`
     ([ProfileCompletionChecklist.tsx:50-61](frontend/src/components/dashboard/ProfileCompletionChecklist.tsx#L50-L61))
     — hits `GET /api/participants/profile/completion`, returns the
     server-authoritative `ProfileCompletion` snapshot into local
     `data` state.
  2. Immediately after, `await refreshUser()` at [line 55](frontend/src/components/dashboard/ProfileCompletionChecklist.tsx#L55)
     — refreshes the auth-context `user`, which the checklist body
     itself does not read for step state (it uses `data.steps`).
- The active-step index is computed from the **server response** at
  [ProfileCompletionChecklist.tsx:99](frontend/src/components/dashboard/ProfileCompletionChecklist.tsx#L99):
  > `const activeIdx = data.steps.findIndex((s) => !s.completed);`
- So the checklist is **not** rendering stale client state — it's
  showing what the server reports. And the server reports ACKNOWLEDGMENT
  incomplete because §2b step 7 never fired.
- `refreshUser()` **is** called in the acknowledgment success flow at
  [acknowledgment/page.tsx:182](frontend/src/app/acknowledgment/page.tsx#L182),
  so this is not a "the client forgot to refresh" bug. Even a hard
  page reload would show the same thing, because the row on disk was
  never updated.

---

## 6. Runtime checks the user should run (do not execute)

Copy-paste-ready one-liners. Replace `<user email>` with the real
email of the account that is stuck.

### 6a. Railway psql — check the flag + counter on `users`
```sql
SELECT id, email,
       acknowledgment_complete,
       basic_info_complete,
       profile_completion_pct,
       current_status
  FROM users
 WHERE email = '<user email>';
```
Expected if the bug is real: `acknowledgment_complete = false` (or
`NULL`) even after several submits; `current_status = 'DASHBOARD_ENABLED'`
(or later).

### 6b. Railway psql — count acknowledgment rows written
```sql
SELECT id, user_id, acknowledgment_type, accepted_text_version, created_at
  FROM acknowledgments
 WHERE user_id = (SELECT id FROM users WHERE email = '<user email>')
 ORDER BY id DESC
 LIMIT 5;
```
Expected: **one** row with `acknowledgment_type = 'INTEREST_AND_ACCEPTANCE'`
and `accepted_text_version = 'ACK-v1.0'`, created on the first
submit; **no additional rows** on subsequent submits (the short-
circuit path returns the existing one via `orElseGet`, so `persist`
never re-fires).

### 6c. Railway psql — check what the completion endpoint sees
```sql
SELECT acknowledgment_complete,
       (CASE WHEN basic_info_complete       THEN 1 ELSE 0 END
      + CASE WHEN acknowledgment_complete   THEN 1 ELSE 0 END
      + CASE WHEN documents_complete        THEN 1 ELSE 0 END
      + CASE WHEN program_selection_complete THEN 1 ELSE 0 END
      + CASE WHEN agreement_complete        THEN 1 ELSE 0 END
      + CASE WHEN check_upload_complete     THEN 1 ELSE 0 END) AS steps_done
  FROM users
 WHERE email = '<user email>';
```
Expected: `steps_done = 0` even after Acknowledgment "submits."

### 6d. DevTools Network capture

In Chrome DevTools → Network → filter box `acknowledg`, submit the
form again. Capture:
1. **Request URL** — should be `POST /api/participants/acknowledgments`.
2. **Response status** — expected `200 OK`.
3. **Response body** — expected
   `{"success":true,"message":"Acknowledgment accepted","data":{
   "acknowledgmentId":<num>,"version":"ACK-v1.0",
   "nextStep":"/document-upload","success":true}}`.
   Note: **no** `acknowledgmentComplete` field in the payload.
4. **Follow-up** request `GET /api/users/profile` (fired by
   `refreshUser`) — inspect the `data.acknowledgmentComplete` field.
   If it is `false`/absent while the acknowledgments row (§6b) exists,
   the bug is confirmed.
5. Follow-up `GET /api/participants/profile/completion` — inspect
   the ACKNOWLEDGMENT step's `completed` field. Same expected `false`.

---

## 7. Verdict

- **Root cause (highest confidence):** the idempotent short-circuit at
  [AcknowledgmentService.java:66-73](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L66-L73)
  is entered whenever `currentStatus` is at ordinal ≥ 6
  (`ACKNOWLEDGMENT_ACCEPTED`), and it `return`s before reaching the
  `profileCompletionService.markStepComplete(user, "ACKNOWLEDGMENT")`
  call at [line 107](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L107).
  All Phase-1C signups land at `DASHBOARD_ENABLED` (ordinal 18) after
  email verification ([AuthService.java:295-310](backend/src/main/java/com/spire/backend/service/AuthService.java#L295-L310)),
  so the short-circuit fires on the very first submit and every
  subsequent one. The per-step flag `acknowledgment_complete` is
  never written; the checklist keeps showing ACKNOWLEDGMENT as
  active. Response is `200 OK` throughout, so the frontend has no
  error to surface.
- **Confirmation check:** §6a and §6d together. If `users.acknowledgment_complete`
  is false and the Network response is `200 OK` with a normal
  "Acknowledgment accepted" body, the diagnosis is definitive.
- **Contributing detail:** the response body does not include the
  updated user or the completion snapshot
  ([ParticipantController.java:122-129](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L122-L129)),
  so the frontend has nothing better to read than a subsequent
  `/profile` refresh — which reads the same false flag from disk.
  Even a hard reload would show the same thing.
- **Version / prerequisites are NOT the cause.** `acknowledgmentVersion`
  is not validated server-side (§4a); the only precondition is
  `ID_EMAIL_SENT` (ordinal 5), which every affected user satisfies
  (§4b).
- **Same-shape bug also present, worth flagging** —
  `ProgramSelectionService.submit` at
  [line 85-95](backend/src/main/java/com/spire/backend/service/ProgramSelectionService.java#L85-L95)
  contains an identical idempotent-return pattern that skips
  `markStepComplete("PROGRAM_SELECTION")` (line 124) for the same
  class of users. Not the reported symptom, but the same failure
  mode is latent there.
