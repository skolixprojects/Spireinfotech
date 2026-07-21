# PROFILE_COMPLETION_SURVEY

Read-only survey of the existing "profile completion" surface in Spire.
Every claim below is cited `path:line`. **Absence is a finding** — where
something would exist in a Skyzen/Sage-style codebase and does not exist
here, that is stated explicitly.

> **Headline for the design conversation:** the intended feature already
> exists end-to-end in Spire and is called **"Phase 1C progressive
> profile completion."** Backend fields, endpoint, DTO, cron reminder,
> dashboard banner, dashboard tab checklist, sidebar % badge,
> per-page redirect gate, and gate modal are all live. Any new design
> is either evolving or replacing that feature, not building it from
> scratch. See §5 for the visible surfaces today and §8 for the risks
> that fall out of that.

---

## 0. Repo layout sanity

- Monorepo. Two module roots at repo root:
  - Backend: [backend/](backend/) — Spring Boot (Java 21, Maven). Entry package
    `com.spire.backend` under [backend/src/main/java/com/spire/backend/](backend/src/main/java/com/spire/backend/).
  - Frontend: [frontend/](frontend/) — Next.js App Router, source under [frontend/src/](frontend/src/).
- **No migrations folder.** `find backend/src/main/resources` returns only
  `application.properties`, `schema.sql`, `seed.sql`, `templates/letterhead.pdf`,
  `terms/v1.0.json`. There is **no** `db/migration` directory and no
  Flyway/Liquibase dependency; schema evolution is driven by Hibernate
  `ddl-auto` running `ALTER TABLE` at boot. This is documented inline
  at [backend/src/main/java/com/spire/backend/entity/User.java:204-210](backend/src/main/java/com/spire/backend/entity/User.java#L204-L210):
  > "Nullable on purpose: Hibernate ddl-auto runs ALTER TABLE on
  > existing prod rows, and Postgres refuses to add a NOT NULL column
  > to a table with existing rows unless a DEFAULT is declared."
- `git remote -v` output:
  ```
  origin   https://github.com/AbhiZoe/Spire-Original.git (fetch)
  origin   https://github.com/AbhiZoe/Spire-Original.git (push)
  railway  https://github.com/salyushchavas/Spireinfotech.git (fetch)
  railway  https://github.com/salyushchavas/Spireinfotech.git (push)
  ```
- Frontend "this is not the Next.js you know" notice at
  [frontend/AGENTS.md](frontend/AGENTS.md): "This version has breaking
  changes — APIs, conventions, and file structure may all differ from
  your training data."

---

## 1. User / Profile entity — every field

**There is no separate `Profile` / `StudentProfile` entity.** All
profile data lives on a single `User` entity at
[backend/src/main/java/com/spire/backend/entity/User.java:22-258](backend/src/main/java/com/spire/backend/entity/User.java#L22-L258):
> `@Entity @Table(name = "users") @DynamicUpdate`

### Every persisted field on `User`

| Field | Type | @Column | Nullable | Default | Constraints | Set at | Editable | System-managed |
|-------|------|---------|----------|---------|-------------|--------|----------|----------------|
| `id` | `Long` | — | no | IDENTITY | `@Id` | — | — | ✓ |
| `email` | `String` | `nullable=false, unique=true, length=255` | no | — | — | registration | never (via profile update) | — |
| `passwordHash` | `String` | `nullable=false, length=255` | no | — | — | registration | via password-reset | ✓ |
| `fullName` | `String` | `nullable=false, length=100` | no | — | UpdateProfileRequest `@Size(2..100)` | registration | ✓ | — |
| `role` | `Role` (FK) | `@ManyToOne` on `role_id` `nullable=false` | no | — | — | registration | admin only | ✓ |
| `avatarUrl` | `String` | `length=500` | yes | null | UpdateProfileRequest `@Size(max=500)` | — | ✓ | — |
| `bio` | `String` | `columnDefinition="TEXT"` | yes | null | UpdateProfileRequest `@Size(max=500)` | — | ✓ | — |
| `phone` | `String` | `length=20` | yes | null | UpdateProfileRequest `@Size(max=20)` | enrollment | ✓ | — |
| `location` | `String` | `length=255` | yes | null | UpdateProfileRequest `@Size(max=255)` | Basic Info step | ✓ | — |
| `instructorApproved` | `Boolean` | `nullable=false` | no | `false` | — | admin only | admin only | ✓ |
| `onboardingCompleted` | `Boolean` | `nullable=false` | no | `false` | — | wizard done | flipped by `/complete-onboarding` | ✓ |
| `isActive` | `Boolean` | `nullable=false` | no | `true` | — | admin only | admin only | ✓ |
| `deactivatedAt` | `LocalDateTime` | — | yes | null | — | admin only | admin only | ✓ |
| `emailVerified` | `Boolean` | `nullable=false` | no | `false` | — | OTP flow | — | ✓ |
| `verificationToken` | `String` | `length=64` | yes | null | — | signup (legacy) | — | ✓ |
| `verificationExpiresAt` | `LocalDateTime` | — | yes | null | — | signup (legacy) | — | ✓ |
| `verificationCode` | `String` | `length=6` | yes | null | — | signup | — | ✓ |
| `verificationCodeExpiresAt` | `LocalDateTime` | — | yes | null | — | signup | — | ✓ |
| `verificationFailedAttempts` | `Integer` | `nullable=false` | no | `0` | — | OTP flow | — | ✓ |
| `verificationLockedUntil` | `LocalDateTime` | — | yes | null | — | brute-force lockout | — | ✓ |
| `lastVerificationResendAt` | `LocalDateTime` | — | yes | null | — | resend | — | ✓ |
| `agreementAccepted` | `Boolean` | `nullable=false` | no | `false` | — | agreement OTP | — | ✓ |
| `resetToken` | `String` | `length=64` | yes | null | — | password reset | — | ✓ |
| `resetTokenExpiresAt` | `LocalDateTime` | — | yes | null | — | password reset | — | ✓ |
| `lastNudgeSentAt` | `LocalDateTime` | — | yes | null | — | inactivity cron | — | ✓ |
| `createdAt` | `LocalDateTime` | `updatable=false` | no | `CreationTimestamp` | — | — | — | ✓ |
| `updatedAt` | `LocalDateTime` | — | no | `UpdateTimestamp` | — | — | — | ✓ |
| `participantId` | `String` | `length=20, unique=true` | yes | null | — | ID mint | — | ✓ |
| `participantIdCreatedAt` | `LocalDateTime` | — | yes | null | — | ID mint | — | ✓ |
| `availability` | `String` | `length=100` | yes | null | BasicInfoRequest `@NotBlank` | Basic Info step | ✓ (participant profile PUT) | — |
| `selectedTechnology` | `String` | `length=255` | yes | null | BasicInfoRequest `@NotBlank` | Basic Info step | via /program-selection override | — |
| `targetExperienceLevel` | `String` | `length=50` | yes | null | BasicInfoRequest `@NotBlank` | Basic Info step | — | — |
| `currentStatus` | `String` | `length=50` | yes | `"DRAFT_STARTED"` | — | workflow transitions | workflow transitions | ✓ |
| **`profileComplete`** | `Boolean` | — | **yes** (intentional) | `false` | — | on 6/6 steps done | — | ✓ |
| **`profileCompletionPct`** | `Integer` | — | **yes** | `0` | — | on each step | — | ✓ |
| **`profileCompletedAt`** | `LocalDateTime` | — | yes | null | — | first 100% crossing | — | ✓ |
| **`basicInfoComplete`** | `Boolean` | — | **yes** | `false` | — | POST /profile/basic-info | — | ✓ |
| **`acknowledgmentComplete`** | `Boolean` | — | **yes** | `false` | — | POST /acknowledgments | — | ✓ |
| **`documentsComplete`** | `Boolean` | — | **yes** | `false` | — | POST /documents/complete | — | ✓ |
| **`programSelectionComplete`** | `Boolean` | — | **yes** | `false` | — | POST /program-selection | — | ✓ |
| **`agreementComplete`** | `Boolean` | — | **yes** | `false` | — | POST /agreement/sign | — | ✓ |
| **`checkUploadComplete`** | `Boolean` | — | **yes** | `false` | — | POST /checks/upload or /checks/mark-na | — | ✓ |
| **`profileReminderCount`** | `Integer` | — | **yes** | `0` | — | ProfileReminderJob | — | ✓ |
| **`lastProfileReminderAt`** | `LocalDateTime` | — | yes | null | — | ProfileReminderJob | — | ✓ |

- **Avatar/photo:** single `avatar_url` string column at
  [backend/src/main/java/com/spire/backend/entity/User.java:47-48](backend/src/main/java/com/spire/backend/entity/User.java#L47-L48).
  Stored as an arbitrary URL string (`length=500`). It is written via
  the profile PUT DTO (see §2). There is a `CloudinaryConfig` bean at
  [backend/src/main/java/com/spire/backend/config/CloudinaryConfig.java](backend/src/main/java/com/spire/backend/config/CloudinaryConfig.java)
  and a `DocumentStorageService` that can hand out signed Cloudinary
  URLs, but the profile `avatar_url` is not tied to any presigned-URL
  or upload endpoint — the field is treated as a caller-supplied
  string. **There is no `/api/users/avatar` or `/api/users/profile/avatar`
  upload endpoint.**

### Migration history for the `users` table

There are **no `V*.sql` migration files** — see §0. The only file that
touches `users` at boot is
[backend/src/main/resources/schema.sql](backend/src/main/resources/schema.sql).
Statements against `users`, in file order:

- `schema.sql:8-18` — `CREATE TABLE users` (id, email, password_hash,
  full_name, avatar_url, bio, `role VARCHAR(20) CHECK IN (STUDENT,
  INSTRUCTOR, TRAINER, ADMIN)`, created_at, updated_at).
- `schema.sql:73` — `ADD COLUMN IF NOT EXISTS onboarding_completed
  BOOLEAN NOT NULL DEFAULT FALSE` — welcome-wizard flag.
- `schema.sql:80` — `ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL`.
- `schema.sql:81` — `ADD COLUMN IF NOT EXISTS location VARCHAR(255) NULL`.
- `schema.sql:188` — `CREATE INDEX idx_users_email ON users(email)`.
- `schema.sql:202-204` — `trg_users_updated_at` trigger.

**Every other user column** (all verification tokens, participant-
lifecycle fields, agreement fields, Phase 1C progressive-completion
columns, reminder counters) is created by Hibernate ddl-auto at boot
against a live Postgres. **Not found**: any file called
`V1__*.sql`, `V2__*.sql`, `changelog.xml`, `db/migration`.

**Note:** `schema.sql` also declares `role` as a `VARCHAR(20)` with a
`CHECK` constraint, but the running entity uses a `role_id` FK to a
`roles` table
([backend/src/main/java/com/spire/backend/entity/User.java:43-45](backend/src/main/java/com/spire/backend/entity/User.java#L43-L45)).
Which of the two is authoritative on a fresh boot depends on
`ddl-auto` mode. Flagged in §8.

---

## 2. Profile REST endpoints

There are **two overlapping profile controllers**. Both are live.

### `UserController` — LMS-era profile (`/api/users`)

At [backend/src/main/java/com/spire/backend/controller/UserController.java:20-23](backend/src/main/java/com/spire/backend/controller/UserController.java#L20-L23):
> `@RestController @RequestMapping("/api/users")`

| Method | Path | Auth | Body (DTO in) | Response (DTO out) |
|--------|------|------|---------------|--------------------|
| GET | `/api/users/profile` | authenticated (`Authentication` bean) | — | `ApiResponse<ProfileDTO>` (fat DTO with learning stats) |
| PUT | `/api/users/profile` | authenticated | `UpdateProfileRequest` `@Valid` | `ApiResponse<ProfileDTO>` |
| POST | `/api/users/request-instructor` | `@PreAuthorize("hasRole('STUDENT')")` | — | `ApiResponse<String>` |
| PUT | `/api/users/complete-onboarding` | authenticated | — | `ApiResponse<UserDTO>` (flips `onboardingCompleted=true`) |
| GET | `/api/users/progress` | authenticated | — | `ApiResponse<List<ProgressDTO>>` |
| PUT | `/api/users/progress/{courseId}` | authenticated | `ProgressDTO` | `ApiResponse<ProgressDTO>` |

Cited at [backend/src/main/java/com/spire/backend/controller/UserController.java:30-73](backend/src/main/java/com/spire/backend/controller/UserController.java#L30-L73).

**`UpdateProfileRequest`** — accepted fields at
[backend/src/main/java/com/spire/backend/dto/UpdateProfileRequest.java:16-31](backend/src/main/java/com/spire/backend/dto/UpdateProfileRequest.java#L16-L31):
`fullName`, `avatarUrl`, `bio`, `phone`, `location`. The docstring at
line 8-12 states:
> "Only allows fullName, avatarUrl, bio, phone, location — NO role,
> id, or email. Prevents mass assignment / privilege escalation."

Every other field is **ignored / silently dropped** in `ProfileService.updateProfile`
([backend/src/main/java/com/spire/backend/service/ProfileService.java:161-233](backend/src/main/java/com/spire/backend/service/ProfileService.java#L161-L233)).

**`ProfileDTO`** returned by `getProfile` is a fat mixed object —
identity + progress + learning stats + Terms-of-Service audit — at
[backend/src/main/java/com/spire/backend/dto/ProfileDTO.java:24-93](backend/src/main/java/com/spire/backend/dto/ProfileDTO.java#L24-L93).
Every Phase 1C completion flag is already on this DTO at
[backend/src/main/java/com/spire/backend/dto/ProfileDTO.java:55-66](backend/src/main/java/com/spire/backend/dto/ProfileDTO.java#L55-L66):
> `profileComplete, profileCompletionPct, basicInfoComplete,
> acknowledgmentComplete, documentsComplete,
> programSelectionComplete, agreementComplete, checkUploadComplete`.

### `ParticipantController` — Phase 1B/1C profile (`/api/participants`)

At [backend/src/main/java/com/spire/backend/controller/ParticipantController.java:59-62](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L59-L62):
> `@RestController @RequestMapping("/api/participants")`

Profile-relevant endpoints (there are ~40 total on this controller):

| Method | Path | Auth | Body (DTO in) | Response |
|--------|------|------|---------------|----------|
| GET | `/api/participants/me` | `@PreAuthorize("isAuthenticated()")` | — | `ApiResponse<UserDTO>` |
| GET | `/api/participants/profile` | authenticated | — | `ApiResponse<UserDTO>` |
| PUT | `/api/participants/profile` | authenticated | `ProfileUpdateRequest` (inline handler — no `@Valid`) | `ApiResponse<UserDTO>` |
| **GET** | **`/api/participants/profile/completion`** | authenticated | — | **`ApiResponse<ProfileCompletionDto>`** |
| POST | `/api/participants/profile/basic-info` | authenticated | `BasicInfoRequest` `@Valid` | `ApiResponse<{success, completion}>` — flips `basicInfoComplete=true` |
| POST | `/api/participants/acknowledgments` | authenticated | `AcknowledgmentSubmitRequest` | `ApiResponse<{acknowledgmentId, version, nextStep, success}>` — inside `AcknowledgmentService` calls `markStepComplete("ACKNOWLEDGMENT")` |
| POST | `/api/participants/documents/upload` | authenticated | multipart | `ApiResponse<ParticipantDocumentDTO>` |
| POST | `/api/participants/documents/complete` | authenticated | — | flips `documentsComplete=true` via `DocumentService.complete` |
| POST | `/api/participants/program-selection` | authenticated | `ProgramSelectionRequest` | flips `programSelectionComplete=true` |
| POST | `/api/participants/agreement/sign` | authenticated | `{legalName, signatureImage, signatureMethod}` | flips `agreementComplete=true` |
| POST | `/api/participants/checks/upload` | authenticated | multipart | flips `checkUploadComplete=true` |
| POST | `/api/participants/checks/mark-na` | authenticated | — | flips `checkUploadComplete=true` |

`PUT /api/participants/profile` accepts a **different** field set from
the `/api/users/profile` variant — the inline handler at
[backend/src/main/java/com/spire/backend/controller/ParticipantController.java:724-754](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L724-L754)
maps: `fullName`, `phone`, `location`, `bio`, `availability`. Note the
**absence** of `avatarUrl` here, and the presence of `availability`
which the `/api/users` variant does not accept. Both DTOs are live.

### Completeness endpoint — the intended feature already exists

**`GET /api/participants/profile/completion`** returns
`ProfileCompletionDto` at
[backend/src/main/java/com/spire/backend/controller/ParticipantController.java:759-768](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L759-L768).
The DTO at [backend/src/main/java/com/spire/backend/dto/ProfileCompletionDto.java:21-59](backend/src/main/java/com/spire/backend/dto/ProfileCompletionDto.java#L21-L59)
carries:

- `completionPercentage: int` (0–100)
- `completedSteps: int`
- `totalSteps: int`
- `isComplete: boolean`
- `nextStep: String` — one of `BASIC_INFO | ACKNOWLEDGMENT | DOCUMENTS
  | PROGRAM_SELECTION | AGREEMENT | CHECK_UPLOAD | COMPLETE`
- `steps: List<StepInfo>` — each row is `{ key, title, description,
  estimatedTime, completed }`

Computed in `ProfileCompletionService.getStatus` at
[backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java:53-88](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L53-L88).
Step keys and step order are fixed constants at line 40-43:
> `public static final List<String> STEPS = Arrays.asList("BASIC_INFO",
> "ACKNOWLEDGMENT", "DOCUMENTS", "PROGRAM_SELECTION", "AGREEMENT",
> "CHECK_UPLOAD");`

The "%" formula is integer-division:
> `pct = total == 0 ? 0 : (done * 100) / total`
at line 57 — with 6 steps this yields 0/16/33/50/66/83/100 (line 143
recomputes it the same way on every `markStepComplete`).

`markStepComplete(user, step)` at
[backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java:127-175](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L127-L175)
is the sole path used by every step endpoint. All six call-sites:
- `POST /profile/basic-info` → [ParticipantController.java:794](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L794)
- `AcknowledgmentService.submit` → [AcknowledgmentService.java:107](backend/src/main/java/com/spire/backend/service/AcknowledgmentService.java#L107)
- `DocumentService.complete` → [DocumentService.java:229](backend/src/main/java/com/spire/backend/service/DocumentService.java#L229)
- `ProgramSelectionService.submit` → [ProgramSelectionService.java:124](backend/src/main/java/com/spire/backend/service/ProgramSelectionService.java#L124)
- `ParticipantAgreementService.sign` → [ParticipantAgreementService.java:93](backend/src/main/java/com/spire/backend/service/ParticipantAgreementService.java#L93)
- `ParticipantCheckService.upload` → [ParticipantCheckService.java:185](backend/src/main/java/com/spire/backend/service/ParticipantCheckService.java#L185)

`markStepComplete` also fires an audit record (see §7) and, on the
first 0→100 transition, calls `OnboardingService.triggerProfileCompletionFlow(user)`
at [ProfileCompletionService.java:165-174](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L165-L174),
which emails the "profile complete" celebration and runs the
welcome → coordinator → ERM → coaches chain
([OnboardingService.java:58-68](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L58-L68)).

### Grep sweep for other completeness surfaces

`grep -rn "profileComplete\|completeness\|profile_complete\|nextStep\|
checklist"` across `backend/src/main/java` and `frontend/src`:

Backend hits (21 files) — all downstream consumers of the fields above,
no other independent implementation. Key hits:
- [ProfileCompletionService.java](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java) — the service
- [ProfileCompletionDto.java](backend/src/main/java/com/spire/backend/dto/ProfileCompletionDto.java) — the DTO
- [ProfileReminderJob.java](backend/src/main/java/com/spire/backend/service/ProfileReminderJob.java) — cron nudge
- [OnboardingService.java](backend/src/main/java/com/spire/backend/service/OnboardingService.java) — 100% trigger
- [CartController.java](backend/src/main/java/com/spire/backend/controller/CartController.java), [EnrollmentController.java](backend/src/main/java/com/spire/backend/controller/EnrollmentController.java) — 403 gates that return `PROFILE_INCOMPLETE` + the completion snapshot in the response body
- [WishlistService.java](backend/src/main/java/com/spire/backend/service/WishlistService.java) — also gates on `canEnrollInCourses`

Frontend hits (15 files) — enumerated in §3, §5, §7 below.

**Nothing else independently computes a percentage or a checklist.**

---

## 3. Frontend profile page

- **`/profile` is a redirect stub, not a page.** [frontend/src/app/profile/page.tsx:17-35](frontend/src/app/profile/page.tsx#L17-L35):
  > "/profile is no longer a standalone page. Every role has a Profile
  > tab inside its own dashboard … This stub just sends the user to
  > the correct dashboard."
  Behaviour: `router.replace(dashboardRouteForRole(user.role))`.
- **The real profile editor lives inside the dashboard.** For a
  participant it is the `ProfileTab()` inside
  [frontend/src/components/dashboard/ParticipantDashboard.tsx:2048-2157](frontend/src/components/dashboard/ParticipantDashboard.tsx#L2048-L2157).
- Fields the participant Profile tab **displays** (from
  `getParticipantProfile()` = `GET /api/participants/profile`, returned
  as `UserDTO`):
  - Read-only ([ParticipantDashboard.tsx:2107-2118](frontend/src/components/dashboard/ParticipantDashboard.tsx#L2107-L2118)):
    `email`, `participantId`, `createdAt` (as "Enrolled"),
    `currentStatus`, `selectedTechnology`.
  - Editable ([ParticipantDashboard.tsx:2121-2134](frontend/src/components/dashboard/ParticipantDashboard.tsx#L2121-L2134)):
    `fullName`, `phone`, `location`, `availability`, `bio`.
  - **Not on this tab:** avatar upload, email change, password change.
- Backend call is `updateParticipantProfile()` in
  [frontend/src/lib/api.ts:394](frontend/src/lib/api.ts#L394) →
  `PUT /api/participants/profile`, sending `{fullName, phone,
  location, availability, bio}`. This is the `ParticipantController`
  handler, not `UserController`.
- Fetch helper: no axios. A single hand-rolled `apiFetch<T>` at
  [frontend/src/lib/api.ts:127-143](frontend/src/lib/api.ts#L127-L143)
  wraps `fetch()`, injects the `Authorization: Bearer <token>` header
  from `localStorage.access_token`, and unwraps `ApiResponse<T>`.
- **Progress / meter / % on the Profile tab:** `grep -rn
  "progress\|complete\|meter\|percent"` inside the ProfileTab region
  finds only the `completionPercent` inside `ProfileCourseSummary`
  (per-course learning progress, not profile completion). The
  ProfileTab itself renders no completion meter — the completion UI
  is on the dashboard **home banner** and the **"Complete Profile"
  sidebar tab**, not the Profile tab (see §5).
- **Avatar upload mechanism:** **not found**. `avatarUrl` is written
  to the DB as a supplied string via `UpdateProfileRequest.avatarUrl`
  ([UpdateProfileRequest.java:22](backend/src/main/java/com/spire/backend/dto/UpdateProfileRequest.java#L22)),
  but the participant Profile tab **does not expose it** in the form
  ([ParticipantDashboard.tsx:2121-2134](frontend/src/components/dashboard/ParticipantDashboard.tsx#L2121-L2134)),
  the participant PUT handler **strips it out**
  ([ParticipantController.java:733-751](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L733-L751)),
  and there is **no `/api/users/avatar` presigned-URL endpoint** in
  the controller listing. The Navbar avatar renders the initial of
  the user's `fullName`, not the URL
  ([Navbar.tsx:159-161](frontend/src/components/layout/Navbar.tsx#L159-L161)).

---

## 4. Onboarding wizard — what already exists

Spire has **two distinct "onboarding" surfaces**, plus one **orphaned
legacy component**. This is worth reading carefully because "the
onboarding wizard" is ambiguous in this codebase.

### 4a. `/welcome` — post-agreement team-assembly status page (Phase 4)

- Route: [frontend/src/app/welcome/page.tsx](frontend/src/app/welcome/page.tsx),
  header docstring at line 20-31:
  > "Holding page between agreement completion (Phase 3B) and Gate 5
  > (ERM + at least one coach assigned). Polls
  > `GET /participants/welcome-status` every 5 seconds and updates the
  > checklist + team cards as the OnboardingService chain runs."
- **Not a step wizard.** No user input; it's a status card with a
  live checklist of automated steps (welcome email → coordinator
  intro → ERM assigned → coaches assigned → dashboard ready) and an
  "Enter dashboard" CTA that is disabled until `dashboardReady=true`.
- Fields written to `User`: **none.** The page just observes
  `currentStatus` transitions performed by `OnboardingService`
  ([backend/src/main/java/com/spire/backend/service/OnboardingService.java:77-126](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L77-L126)).
- "Done" signal: `WelcomeStatus.dashboardReady === true` (server-side
  `currentStatus >= DASHBOARD_ENABLED`). At
  [frontend/src/app/welcome/page.tsx:121-131](frontend/src/app/welcome/page.tsx#L121-L131)
  a `setTimeout` auto-navigates to `/dashboard` after 2.2 s.
- Re-entry: bounced away on gate check (`isDashboardStatus(s)` →
  `router.replace("/dashboard")` at
  [frontend/src/app/welcome/page.tsx:66-70](frontend/src/app/welcome/page.tsx#L66-L70)),
  so once the user is past this stage they cannot re-open it.
- Not dismissible; there is no skip.
- Route protection: gate at [welcome/page.tsx:54-100](frontend/src/app/welcome/page.tsx#L54-L100)
  ranks the user's `currentStatus` against a hard-coded ladder of
  "earlier steps" (DRAFT_STARTED, EMAIL_VERIFICATION_PENDING, …) and
  routes them backward with `getOnboardingRoute(s)`.

### 4b. `ProfileCompletionChecklist` — the 6-step "Complete Your Profile" wizard (Phase 1C)

- Not a full-page route. It is the dashboard **"Complete Profile" tab
  body** at [frontend/src/components/dashboard/ProfileCompletionChecklist.tsx:38-211](frontend/src/components/dashboard/ProfileCompletionChecklist.tsx#L38-L211).
  Renders the six ordered steps as an `<ol>`, each row in one of three
  visual states (completed / active / locked) per the docstring at
  line 16-28.
- Step 1 ("About You" = `BASIC_INFO`) is completed inline via
  [frontend/src/components/dashboard/BasicInfoStep.tsx:1-157](frontend/src/components/dashboard/BasicInfoStep.tsx#L1-L157);
  steps 2-6 link to their standalone pages
  ([ProfileCompletionChecklist.tsx:29-36](frontend/src/components/dashboard/ProfileCompletionChecklist.tsx#L29-L36)):
  `/acknowledgment?from=profile`, `/document-upload?from=profile`,
  `/program-selection?from=profile`, `/agreement?from=profile`,
  `/check-upload?from=profile`. Each redirects back to
  `/dashboard?tab=complete-profile` with `?step=<KEY>` so the
  checklist can scroll + flash a "step completed" toast
  ([ProfileCompletionChecklist.tsx:63-81](frontend/src/components/dashboard/ProfileCompletionChecklist.tsx#L63-L81)).
- Fields written to `User`: `location`, `availability`,
  `selectedTechnology`, `targetExperienceLevel` (from `BASIC_INFO`);
  plus each step's per-step boolean flag; plus, on the last step's
  completion, `profileComplete=true` + `profileCompletedAt=now()`
  ([ProfileCompletionService.java:146-151](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L146-L151)).
- "Done" signal: server-side `profileComplete=true`; client-side the
  same flag is read from the auth-context `user` object and also from
  `ProfileCompletion.isComplete` on the `/completion` response.
- Re-entry: no gate. The tab is always accessible; once complete, the
  header switches to a green completed state per step.
- **The "done" celebration** is a one-shot 5-second card in
  `ProfileCompletionBanner`, keyed by `localStorage.profile_completion_celebration_shown`
  ([ProfileCompletionBanner.tsx:24-88](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L24-L88)).

### 4c. `OnboardingWizard` — LMS-era 3-step tour, **orphaned**

- File exists at [frontend/src/components/onboarding/OnboardingWizard.tsx:49-289](frontend/src/components/onboarding/OnboardingWizard.tsx#L49-L289).
  Three steps: `WelcomeStep`, `HowItWorksStep`, `ChoosePathStep`.
  Persists via `PUT /api/users/complete-onboarding` and the
  localStorage key `spire-onboarded-<userId>`.
- **No render site.** `grep -rn "OnboardingWizard\|<OnboardingWizard"
  frontend/src` finds only self-references at
  [OnboardingWizard.tsx:13, :49](frontend/src/components/onboarding/OnboardingWizard.tsx#L13).
- The `onboardingCompleted` boolean on `User`
  ([User.java:67-69](backend/src/main/java/com/spire/backend/entity/User.java#L67-L69))
  and the `PUT /api/users/complete-onboarding` endpoint
  ([UserController.java:51-58](backend/src/main/java/com/spire/backend/controller/UserController.java#L51-L58))
  still exist but nothing on the participant surface writes to them.
  Effectively legacy for the LMS-era Student dashboard.

---

## 5. Dashboard — is there a "complete your profile" surface today?

**Yes — extensively.** The participant dashboard is a client-side SPA
with sidebar tabs and a shared banner. All of the following are live:

### 5a. Where the dashboard lives

- Route entry: [frontend/src/app/dashboard/page.tsx:29-97](frontend/src/app/dashboard/page.tsx#L29-L97).
  This page does role-based routing + a routing-guard for participants
  (`currentStatus`, `participantId`); if all checks pass it renders
  `<ParticipantDashboard />`.
- Actual dashboard: [frontend/src/components/dashboard/ParticipantDashboard.tsx](frontend/src/components/dashboard/ParticipantDashboard.tsx)
  (2263 lines, `"use client"`).

### 5b. Tabs on the participant dashboard

Sidebar `NAV` at [ParticipantDashboard.tsx:69-83](frontend/src/components/dashboard/ParticipantDashboard.tsx#L69-L83):

```
home, complete-profile, courses, weekly, resume, interview,
employment, payments, documents, agreement, team, messages, profile
```

### 5c. Existing "complete your profile" surfaces

1. **Sticky banner above every tab** — `<ProfileCompletionBanner
   onContinueSetup={() => setActive("complete-profile")} />` at
   [ParticipantDashboard.tsx:257-259](frontend/src/components/dashboard/ParticipantDashboard.tsx#L257-L259).
   Implementation at [ProfileCompletionBanner.tsx:31-156](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L31-L156).
   - Reads `getProfileCompletion()` on mount.
   - Shows: pct + "N of 6 done" + next step name + "Continue Setup"
     button + `<X>` "Remind me later" dismiss.
   - **Dismissal persists 24 h** via `localStorage.profile_banner_dismissed_until`
     ([ProfileCompletionBanner.tsx:23, :91-95](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L23)).
   - Renders a **5-second celebration card** on the first 0→100
     transition, gated by `localStorage.profile_completion_celebration_shown`
     ([ProfileCompletionBanner.tsx:24, :56-88](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L24)).

2. **Sidebar tab with % badge** — the "Complete Profile" tab in the
   sidebar wears an amber pill showing the live percentage. Rendered
   at [ParticipantDashboard.tsx:171-201](frontend/src/components/dashboard/ParticipantDashboard.tsx#L171-L201);
   the badge is hidden once `user.profileComplete === true`.

3. **`ProfileCompletionChecklist` tab body** — full six-step vertical
   checklist with inline "About You" form, sticky header progress bar,
   auto-scroll-to-step from `?step=` query param, and per-step
   toasts. Rendered at [ParticipantDashboard.tsx:265](frontend/src/components/dashboard/ParticipantDashboard.tsx#L265)
   when `active === "complete-profile"`.

4. **`LockedTabView` empty states** on gated tabs. Used at
   [ParticipantDashboard.tsx:275-286](frontend/src/components/dashboard/ParticipantDashboard.tsx#L275-L286)
   for the Weekly Report tab and at
   [ParticipantDashboard.tsx:967-980](frontend/src/components/dashboard/ParticipantDashboard.tsx#L967-L980)
   for the My Courses tab. Component definition at
   [LockedTabView.tsx:31-128](frontend/src/components/dashboard/LockedTabView.tsx#L31-L128)
   — shows a lock icon, live completion bar, remaining-steps list,
   and one CTA.

5. **`ProfileGateModal`** — pop-over for enroll/cart flows. Rendered
   from **one place today**, the course detail page
   [frontend/src/app/courses/[id]/page.tsx:19, :444](frontend/src/app/courses/[id]/page.tsx#L19).
   The other course/service pages instead **hard-redirect** the user
   to the checklist:
   - [frontend/src/app/courses/page.tsx:64-68](frontend/src/app/courses/page.tsx#L64-L68) —
     `router.replace("/dashboard?tab=complete-profile")` on mount if
     `user.profileComplete === false`.
   - [frontend/src/app/services/page.tsx:28-32](frontend/src/app/services/page.tsx#L28-L32) —
     same pattern.

### 5d. Would a new card fit? Where?

- The parent container is the "Main" region at
  [ParticipantDashboard.tsx:243-310](frontend/src/components/dashboard/ParticipantDashboard.tsx#L243-L310).
  The layout in this region is:
  1. `<div className="md:hidden sticky top-0 ..."` — mobile top bar.
  2. `<ProfileCompletionBanner ... />` — the sticky banner, above
     every tab.
  3. `<div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">` —
     tab-body wrapper (**single column, `max-w-5xl`**).
- Inside the tab-body wrapper the active tab renders a single
  top-level element (either a checklist, form, or `LockedTabView`).
  A new dashboard-wide card would slot naturally either **above** the
  tab-body wrapper (peer of the banner) or **inside the `home`
  tab**, whose top-level layout is the `HomeTab({data, team, userEmail,
  onJumpTo})` at [ParticipantDashboard.tsx:262-264](frontend/src/components/dashboard/ParticipantDashboard.tsx#L262-L264).
- The `home` tab is where a new profile-completion "meter card" would
  slot alongside the existing roadmap/team/activity content. It would
  need `onJumpTo("complete-profile")` to keep the existing SPA flow.

---

## 6. Auth / session shape passed to the client

- **After login,** the frontend calls `POST /api/auth/login` and
  receives an `AuthResponse` at
  [backend/src/main/java/com/spire/backend/dto/AuthResponse.java:12-16](backend/src/main/java/com/spire/backend/dto/AuthResponse.java#L12-L16):
  > `{ accessToken: String, refreshToken: String, user: UserDTO }`

- **`UserDTO`** at [backend/src/main/java/com/spire/backend/dto/UserDTO.java:16-105](backend/src/main/java/com/spire/backend/dto/UserDTO.java#L16-L105).
  Every field shipped to the client — critically, **all Phase 1C
  completion flags are already on this DTO** (lines 60-72):
  > `profileComplete, profileCompletionPct, basicInfoComplete,
  > acknowledgmentComplete, documentsComplete,
  > programSelectionComplete, agreementComplete, checkUploadComplete`.

  Also present: `id`, `email`, `fullName`, `role`, `avatarUrl`, `bio`,
  `onboardingCompleted`, `isActive`, `instructorApproved`,
  `agreementAccepted`, `createdAt`, `deactivatedAt`, `participantId`,
  `currentStatus`, `emailVerified`, `selectedTechnology`,
  `availability`, `phone`, `location`.

- **On the client** the shape is mirrored at
  [frontend/src/lib/api.ts:29-75](frontend/src/lib/api.ts#L29-L75).
  Comment at line 63-67 states the design intent:
  > "Mirrored from the backend so the dashboard banner, gate modal,
  > and sidebar badge can all read off the auth-context user object
  > without an extra `/completion` fetch on every render."

- **Storage** — `auth-context.tsx`:
  - `accessToken` in `localStorage.access_token` **and** a cookie
    (`document.cookie` set with `SameSite=Lax`, 7-day expiry) at
    [frontend/src/lib/auth-context.tsx:56-73](frontend/src/lib/auth-context.tsx#L56-L73).
    The cookie exists so `middleware.ts` can gate SSR routes.
  - `refreshToken` in `localStorage.refresh_token`.
  - `user` in React state, held in `AuthProvider` React Context at
    [frontend/src/lib/auth-context.tsx:65-179](frontend/src/lib/auth-context.tsx#L65-L179);
    consumed via `useAuth()` at line 181-185.
- **No Zustand, no Redux, no localStorage user object.** `grep -rn
  "zustand"` returns 0 hits in `frontend/src`.
- **`refreshUser()`** at [auth-context.tsx:144-155](frontend/src/lib/auth-context.tsx#L144-L155)
  re-fetches `GET /api/users/profile` (i.e. `ProfileService`, the fat
  DTO — not `/api/participants/me`) and stores the whole response into
  the same `user` slot. Note the mismatch: `useAuth().user` at
  runtime can be either a bare `UserDTO` (from login) or the fat
  `ProfileData` (after `refreshUser`), depending on which path last
  ran.

### JWT vs `/me` split of what is available client-side

- The client obtains `user: UserDTO` **directly in the login response**.
  It does not decode the JWT client-side (the JWT is opaque to
  `apiFetch`).
- The `/api/users/profile` refresh path returns `ProfileData` (extends
  `UserDTO`) at [frontend/src/lib/api.ts:1829-1871](frontend/src/lib/api.ts#L1829-L1871).
- **Fields available client-side without an extra fetch:** every
  field on `UserDTO` above — including all six per-step booleans plus
  `profileComplete` + `profileCompletionPct`. This is why the
  sidebar badge can render the pct without hitting `/completion`
  ([ParticipantDashboard.tsx:175-200](frontend/src/components/dashboard/ParticipantDashboard.tsx#L175-L200)).

---

## 7. Related feature seams worth knowing about

### 7a. Notifications / toasts / banners

- **Global toast infrastructure:** [frontend/src/components/ui/Toast.tsx:37-97](frontend/src/components/ui/Toast.tsx#L37-L97).
  `ToastProvider` + `useToast()` hook; types `success | error | info
  | cart`; anchored bottom-right; auto-dismiss after `duration ?? 3000`
  ms. 46 files import from this module per grep.
- **Inline "banner" pattern:** rolled by hand — the `ProfileCompletionBanner`
  at [ProfileCompletionBanner.tsx:98-155](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L98-L155)
  is a bespoke amber `<div>` with its own dismissal state, not a
  shared component. `AnnouncementsBanner`
  ([frontend/src/components/dashboard/AnnouncementsBanner.tsx](frontend/src/components/dashboard/AnnouncementsBanner.tsx))
  is another bespoke banner and does not share code with it.
- **No shared `<Alert>` primitive.** `grep -rn "Alert " frontend/src/components`
  finds only `SecureVideoPlayer` (custom in-player alert) and
  `AnnouncementsBanner`. Any new banner has to be a bespoke component
  or an extension of one of the two above.

### 7b. Feature-flag / settings-toggle infra

- **Not found.** No `feature_flag`, `FeatureFlag`, `user_settings`,
  `user_preferences`, `UserSettings`, or `UserPreferences` class or
  table anywhere in `backend/src/main/java` (0 grep hits).
- **Client-side "dismissed prompts" persistence:** the only precedent
  is direct `localStorage.setItem(...)` calls with hand-chosen keys.
  Existing keys:
  - `profile_banner_dismissed_until` — 24 h dismissal of the profile
    banner ([ProfileCompletionBanner.tsx:23](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L23)).
  - `profile_completion_celebration_shown` — one-shot celebration
    ([ProfileCompletionBanner.tsx:24](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L24)).
  - `spire-onboarded-<userId>` — legacy LMS wizard dismissal
    ([OnboardingWizard.tsx:29-30](frontend/src/components/onboarding/OnboardingWizard.tsx#L29-L30)).
- There is **no** central `Preferences` context or hook. Each surface
  reads/writes its own key.

### 7c. `user_settings` / `user_preferences`

**Not found.** No such table in [schema.sql](backend/src/main/resources/schema.sql),
no such entity or repository in
[backend/src/main/java/com/spire/backend/entity/](backend/src/main/java/com/spire/backend/entity/) or
[.../repository/](backend/src/main/java/com/spire/backend/repository/).

### 7d. Analytics / telemetry hooks a "profile step completed" event could fire into

- **`RecordService`** — append-only audit logger at
  [backend/src/main/java/com/spire/backend/service/RecordService.java:37-73](backend/src/main/java/com/spire/backend/service/RecordService.java#L37-L73).
  Categories: `ACCOUNT, LEARNING, ASSESSMENT, MENTORSHIP, PAYMENT,
  CERTIFICATE, SECURITY, WORKFLOW, DOCUMENT, EMAIL` (line 42-54).
  Writes rows to the `UserRecord` entity with `REQUIRES_NEW`
  propagation so failures don't roll back the caller.
- **A `PROFILE_STEP_COMPLETED` event already fires** on every step
  completion, at [ProfileCompletionService.java:155-163](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L155-L163):
  > `recordService.record(user.getId(), "PROFILE_STEP_COMPLETED",
  > RecordService.Category.ACCOUNT, "Profile step completed",
  > "Step " + step + " marked complete (" + newPct + "% overall)",
  > Map.of("step", step, "percentage", String.valueOf(newPct)));`
- **Email cron for nudges:** `ProfileReminderJob` at
  [backend/src/main/java/com/spire/backend/service/ProfileReminderJob.java:29-98](backend/src/main/java/com/spire/backend/service/ProfileReminderJob.java#L29-L98).
  Constants: `MIN_ACCOUNT_AGE_HOURS=24`, `COOLDOWN_DAYS=2`,
  `MAX_REMINDERS=3`. Runs on `@Scheduled(cron = "0 0 4 * * *")` (04:00
  UTC daily). Also reachable at `POST /api/internal/profile-reminder`
  guarded by the `X-Cron-Secret` header
  ([InternalCronController.java:77-89](backend/src/main/java/com/spire/backend/controller/InternalCronController.java#L77-L89)).
- **No third-party analytics** (no PostHog / Segment / Mixpanel / GA
  server-side call) — 0 grep hits for those SDK names in
  `backend/src/main/java` or `frontend/src`.

---

## 8. Risks + open questions

1. **The intended feature already exists as "Phase 1C progressive
   profile completion."** Every headline element in the design brief
   (percentage meter, step list, "next step" CTA, dismissible prompt)
   has a live implementation cited in §2, §5, §7. Any "design" pass
   is really an *evolution or replacement*, not a green-field build.
   Question for section 8: is the goal to redesign the visual
   language, expand the step set beyond the six lifecycle steps
   (which are load-bearing for enrollment gating), or something else?
2. **Two profile controllers with divergent DTOs.** `UserController
   /api/users/profile` (PUT accepts `avatarUrl`,
   [UpdateProfileRequest.java:22](backend/src/main/java/com/spire/backend/dto/UpdateProfileRequest.java#L22))
   vs `ParticipantController /api/participants/profile` (PUT accepts
   `availability`, drops `avatarUrl`,
   [ParticipantController.java:733-751](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L733-L751)).
   Which one owns "the profile" for a participant?
3. **Fat `ProfileDTO` on `/api/users/profile`.** The response mixes
   identity, learning stats, completion flags, per-course summaries,
   certificates, contribution heatmap, and Terms-of-Service audit
   record ([ProfileDTO.java:24-93](backend/src/main/java/com/spire/backend/dto/ProfileDTO.java#L24-L93)).
   `refreshUser()` stores this whole payload into the auth-context
   `user` slot ([auth-context.tsx:144-155](frontend/src/lib/auth-context.tsx#L144-L155)),
   so downstream code that expects a bare `UserDTO` gets a fatter
   object at some times but not others.
4. **`avatarUrl` is a "field" without an upload path.** The column,
   the write DTO, and the length constraint exist
   ([User.java:47-48](backend/src/main/java/com/spire/backend/entity/User.java#L47-L48),
   [UpdateProfileRequest.java:21-22](backend/src/main/java/com/spire/backend/dto/UpdateProfileRequest.java#L21-L22))
   — but the participant Profile tab does not show it, the
   participant PUT drops it, and there is no presigned-URL /
   Cloudinary avatar upload endpoint. A "profile completion" that
   scores an avatar would need to invent that seam.
5. **Schema.sql is out of sync with the entity.** The `role` column
   is `VARCHAR(20) CHECK` in schema.sql
   ([schema.sql:15](backend/src/main/resources/schema.sql#L15)) but a
   `role_id` FK to `roles` in the entity
   ([User.java:43-45](backend/src/main/java/com/spire/backend/entity/User.java#L43-L45)).
   None of the Phase 1C columns exist in schema.sql at all — they
   come from Hibernate ddl-auto. Any environment that boots off
   schema.sql cold and then upgrades to ddl-auto may hit `ALTER TABLE`
   surprises (the docstring at
   [User.java:202-210](backend/src/main/java/com/spire/backend/entity/User.java#L202-L210)
   already flags this and forced the flags nullable).
6. **`ProfileCompletion.isComplete` vs `complete` — Jackson quirk.**
   Backend DTO field is `private boolean isComplete`
   ([ProfileCompletionDto.java:28](backend/src/main/java/com/spire/backend/dto/ProfileCompletionDto.java#L28));
   Jackson can serialise it as `isComplete` or `complete` depending on
   Lombok/`@Data`. The frontend tolerates both:
   [api.ts:301-306](frontend/src/lib/api.ts#L301-L306). Any new client
   code that reads this field needs to keep the same `res.isComplete
   ?? res.complete ?? false` guard.
7. **Gate-modal usage is asymmetric.** `ProfileGateModal` is only
   rendered in the course-detail page
   ([courses/[id]/page.tsx:19, :444](frontend/src/app/courses/[id]/page.tsx#L19)).
   The `/courses` and `/services` list pages just `router.replace(...)`
   to the checklist ([courses/page.tsx:64-68](frontend/src/app/courses/page.tsx#L64-L68),
   [services/page.tsx:28-32](frontend/src/app/services/page.tsx#L28-L32)).
   Question: is the modal the intended pattern, or is the redirect?
8. **`OnboardingWizard` component is orphaned.** Defined at
   [OnboardingWizard.tsx:49](frontend/src/components/onboarding/OnboardingWizard.tsx#L49)
   with no render site anywhere in `frontend/src`. The `onboardingCompleted`
   flag on `User` and `PUT /api/users/complete-onboarding` still
   exist ([UserController.java:51-58](backend/src/main/java/com/spire/backend/controller/UserController.java#L51-L58)),
   but nothing on the participant surface writes to them. A designer
   asked to "extend the wizard" could plausibly modify the wrong
   component. Which of the two surfaces (`/welcome` polling page,
   `ProfileCompletionChecklist` dashboard tab) is "the wizard"?
9. **Sidebar % badge already exists and is authoritative.** The
   dashboard sidebar reads `user.profileCompletionPct` directly from
   the auth-context user object
   ([ParticipantDashboard.tsx:175-200](frontend/src/components/dashboard/ParticipantDashboard.tsx#L175-L200));
   the banner reads a fresh `/completion` snapshot on mount
   ([ProfileCompletionBanner.tsx:47-54](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L47-L54)).
   Two source-of-truth patterns for the same number. Which wins if a
   new "meter" is introduced?
10. **Dismissal state has no server-side surface.** The 24-hour
    banner-dismissal + one-shot celebration flag live only in
    `localStorage` ([ProfileCompletionBanner.tsx:23-24](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L23-L24));
    across devices the user sees the prompt again. There is no
    `user_settings` / `user_preferences` table (§7c), so a
    "cross-device dismiss" would require a new table or a JSON blob
    on `users`.
11. **`ParticipantDashboard.tsx` is a 2263-line single client
    component.** Every tab body, subform, and helper is co-located
    ([ParticipantDashboard.tsx](frontend/src/components/dashboard/ParticipantDashboard.tsx)).
    A "new card on the home tab" edit lands inside `HomeTab(...)`
    somewhere below [ParticipantDashboard.tsx:262-264](frontend/src/components/dashboard/ParticipantDashboard.tsx#L262-L264)
    — expect the file to be large-diff-friendly, not
    small-diff-friendly.
12. **Completion "%" is integer division on a 6-step denominator.**
    Achievable values are 0, 16, 33, 50, 66, 83, 100
    ([ProfileCompletionService.java:57, :143](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L57)).
    Any new "meter" that promises finer granularity has to either
    weight the steps or introduce sub-steps.
13. **`profile_complete` gate has a hard business-rule side-effect.**
    The 0→100 transition triggers `OnboardingService.triggerProfileCompletionFlow`
    ([ProfileCompletionService.java:165-174](backend/src/main/java/com/spire/backend/service/ProfileCompletionService.java#L165-L174)),
    which sends a "profile complete" celebration email and runs the
    welcome → coordinator → ERM → coaches assignment chain
    ([OnboardingService.java:58-68](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L58-L68)).
    A design that introduces new gate steps has to route around this
    hook or extend it, not replace it.
14. **`WelcomeStatus.dashboardReady` is a Gate 5, not a profile-
    completion signal.** It requires ERM + at least one coach
    assigned ([OnboardingService.java:117-125](backend/src/main/java/com/spire/backend/service/OnboardingService.java#L117-L125)).
    A "profile complete" user with an unresolved coach pool sees a
    non-dismissable pending state on `/welcome` and cannot enter
    `/dashboard` from that flow. This is a separate "readiness"
    concept from the six-step profile completion.
15. **Nothing in the codebase implements a "next step CTA" that
    changes copy per-step at the banner level.** The current banner
    shows `Next: {step.title} ({step.estimatedTime})`
    ([ProfileCompletionBanner.tsx:120-125](frontend/src/components/dashboard/ProfileCompletionBanner.tsx#L120-L125)),
    which is what the design brief describes. If the design wants
    step-specific graphics or a different word for "Next," that's a
    new capability, not a rework.

---

## 9. Do NOT propose a design

Per instructions, no schema/API/UI is sketched here. Open questions
have been folded into §8 as citations against the existing surface.
