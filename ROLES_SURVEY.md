# ROLES_SURVEY

Read-only survey of every role in the Spire codebase today. Assumes
familiarity with [ACK_STEP_BUG_SURVEY.md](ACK_STEP_BUG_SURVEY.md) and
[PROFILE_COMPLETION_SURVEY.md](PROFILE_COMPLETION_SURVEY.md) — the User
entity, workflow enum, and dashboard split are described there and not
repeated. Every claim is cited `path:line`.

> **Headline:** **11 role names** are seeded, **10 are used** by at
> least one gate somewhere. **PARTICIPANT** is seeded and assigned but
> has **zero `hasRole('PARTICIPANT')`** guards anywhere — participant
> access is instead expressed as `isAuthenticated()` and enforced at
> the workflow-status / per-step-completion level. **String-compare
> risk is systemic**: there is no Java or TypeScript enum for role
> values; every gate compares raw strings. See §5.

---

## 1. Every role value that exists

### 1a. Roles seeded at boot

Role rows are seeded by `DataSeeder` — idempotent via `findByName ...
orElseGet(save)`. Two batches:

**Legacy LMS roles** — [backend/src/main/java/com/spire/backend/config/DataSeeder.java:52-62](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L52-L62):
```
STUDENT
INSTRUCTOR
ADMIN
TRAINER
```

**Phase 1A roles** (added alongside, not replacing) —
[DataSeeder.java:69-77](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L69-L77):
```
PARTICIPANT
ERM
COACH
TECHNICAL_ADVISOR
OPERATIONS_ADMIN
FINANCE
SYSTEM_ADMIN
```

Total: **11 role rows** in the `roles` table.

### 1b. The `Role` entity

[backend/src/main/java/com/spire/backend/entity/Role.java:19-31](backend/src/main/java/com/spire/backend/entity/Role.java#L19-L31):
```
@Table(name = "roles")
public class Role {
    private Long id;
    private String name;   // @Column(nullable=false, unique=true, length=20)
    private LocalDateTime createdAt;
}
```

- **No Java enum for role values.** The class is a JPA entity carrying
  a free-form `String name`. Every role reference elsewhere is a bare
  string.
- Repository: [backend/src/main/java/com/spire/backend/repository/RoleRepository.java:10-13](backend/src/main/java/com/spire/backend/repository/RoleRepository.java#L10-L13)
  exposes only `findByName(String)`.
- Class-level docstring is **stale** — [Role.java:11](backend/src/main/java/com/spire/backend/entity/Role.java#L11):
  > "Stores user roles: STUDENT, INSTRUCTOR, ADMIN."
  Missing TRAINER and every Phase 1A role.

### 1c. `schema.sql` CHECK constraint — **mismatched with the entity**

[backend/src/main/resources/schema.sql:15](backend/src/main/resources/schema.sql#L15):
```sql
role VARCHAR(20) DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'INSTRUCTOR', 'TRAINER', 'ADMIN')),
```

- This defines a `role` **column on `users`** (inline enum-style), but
  the running `User` entity uses a **FK `role_id` to `roles`** at
  [backend/src/main/java/com/spire/backend/entity/User.java:43-45](backend/src/main/java/com/spire/backend/entity/User.java#L43-L45).
  The two schemas describe two different designs.
- Consequence: on a fresh cold-boot from `schema.sql`, the `users`
  table has a **`role` VARCHAR column** constrained to the 4 legacy
  names — but Hibernate ddl-auto then adds `role_id`, `roles` gets
  seeded with **11 names**, and the FK becomes authoritative. The
  original `role` VARCHAR column and its CHECK constraint are
  effectively dead columns (unused by the entity, unreachable from
  application code). Flagged in §5.

The **second `role` column** at [schema.sql:243](backend/src/main/resources/schema.sql#L243)
is unrelated — it belongs to `mail_accounts` (the mail-app sub-system)
and uses a **different vocabulary**: `USER | ADMIN | SUPER_ADMIN`.
The mail-app roles are managed by a separate security chain
(`MailSecurityConfig`, `@Order(1)`) referenced at
[backend/src/main/java/com/spire/backend/security/SecurityConfig.java:34](backend/src/main/java/com/spire/backend/security/SecurityConfig.java#L34)
and are **not** part of the participant-lifecycle role set surveyed here.

### 1d. Role → Spring Security authority mapping

- JWT filter — [backend/src/main/java/com/spire/backend/security/JwtAuthFilter.java:53-54](backend/src/main/java/com/spire/backend/security/JwtAuthFilter.java#L53-L54):
  ```java
  List<SimpleGrantedAuthority> authorities = List.of(
          new SimpleGrantedAuthority("ROLE_" + role));
  ```
- Non-JWT path — [backend/src/main/java/com/spire/backend/security/UserDetailsServiceImpl.java:27](backend/src/main/java/com/spire/backend/security/UserDetailsServiceImpl.java#L27):
  ```java
  List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().getName()))
  ```
  Both prepend `ROLE_` and never uppercase. Whatever `role.name` is in
  the DB becomes the authority. All seeded names are already uppercase,
  so this is fine in practice; but a DB row with, e.g., `student`
  would silently produce `ROLE_student` and every `hasRole('STUDENT')`
  gate would reject it. No normalisation layer.

### 1e. Enum-vs-DB mismatch summary

| Source | Vocabulary | Count |
|--------|------------|-------|
| Java enum for user roles | **not found** | — |
| `roles` table (via `DataSeeder`) | STUDENT, INSTRUCTOR, ADMIN, TRAINER, PARTICIPANT, ERM, COACH, TECHNICAL_ADVISOR, OPERATIONS_ADMIN, FINANCE, SYSTEM_ADMIN | 11 |
| `schema.sql` `users.role` CHECK (dead column) | STUDENT, INSTRUCTOR, TRAINER, ADMIN | 4 |
| `schema.sql` `mail_accounts.role` (mail-app, separate) | USER, ADMIN, SUPER_ADMIN | 3 |
| `Role.java` class docstring (stale) | STUDENT, INSTRUCTOR, ADMIN | 3 |
| Frontend hard-coded role list in admin UI | STUDENT, INSTRUCTOR, TRAINER, ADMIN | 4 |

The **schema-vs-entity mismatch** on the `users` table is documented
implicitly ([User.java:202-210](backend/src/main/java/com/spire/backend/entity/User.java#L202-L210)
notes ddl-auto drift on Phase 1C columns), but the specific dead
`role VARCHAR CHECK` column is not.

---

## 2. Endpoints per role (backend `@PreAuthorize`)

Method-level rules from `backend/src/main/java/com/spire/backend/controller/**`.
`isAuthenticated()`-only endpoints are counted separately at the end.
URL-level rules from
[SecurityConfig.java:44-58](backend/src/main/java/com/spire/backend/security/SecurityConfig.java#L44-L58):

- `.requestMatchers("/api/health").permitAll()`
- `.requestMatchers("/api/auth/**").permitAll()`
- `.requestMatchers(POST, "/api/participants/enroll").permitAll()`
- `.requestMatchers(GET, "/api/courses", "/api/courses/**").permitAll()`
- `.requestMatchers("/api/webhooks/**").permitAll()`
- `.requestMatchers("/api/certificates/verify/**").permitAll()`
- `.requestMatchers("/api/certificates/download/**").permitAll()`
- `.requestMatchers("/api/verify/**").permitAll()`
- `.requestMatchers(GET, "/api/agreement/terms").permitAll()`
- **`.requestMatchers("/api/admin/**").hasRole("ADMIN")`**
- `.anyRequest().authenticated()`

### 2a. STUDENT — 2 endpoints
- `POST /api/users/request-instructor` — [UserController.java:44](backend/src/main/java/com/spire/backend/controller/UserController.java#L44) — `@PreAuthorize("hasRole('STUDENT')")`.
- `POST /api/certificates/claim` (path from surrounding context) — [CertificateController.java:31](backend/src/main/java/com/spire/backend/controller/CertificateController.java#L31) — `@PreAuthorize("hasRole('STUDENT')")`.

### 2b. INSTRUCTOR — 26 endpoints
Grouped by controller:
- `AssignmentController` — [line 45, 96, 122](backend/src/main/java/com/spire/backend/controller/AssignmentController.java#L45) (owning-instructor or ADMIN).
- `CourseController` — [line 46 (create), 160, 175, 189, 203, 219, 235 (owner or ADMIN)](backend/src/main/java/com/spire/backend/controller/CourseController.java#L46), plus [line 125 (`hasAnyRole('ADMIN','INSTRUCTOR','TRAINER')`)](backend/src/main/java/com/spire/backend/controller/CourseController.java#L125).
- `InstructorController` — [line 24](backend/src/main/java/com/spire/backend/controller/InstructorController.java#L24) — `hasRole('INSTRUCTOR')`.
- `LessonController` — [line 28, 43, 58, 72, 87, 101](backend/src/main/java/com/spire/backend/controller/LessonController.java#L28) (owner or ADMIN, or ADMIN|INSTRUCTOR).
- `MediaController` — [line 48](backend/src/main/java/com/spire/backend/controller/MediaController.java#L48) — `hasAnyRole('INSTRUCTOR','ADMIN')`.
- `ModuleController` — [line 44, 59, 74, 88](backend/src/main/java/com/spire/backend/controller/ModuleController.java#L44).
- `QuizController` — [line 43, 51, 59, 70, 78, 88, 96, 104, 112](backend/src/main/java/com/spire/backend/controller/QuizController.java#L43) — nine `hasAnyRole('INSTRUCTOR','ADMIN')` endpoints.
- `SalesController` — [line 111, 118](backend/src/main/java/com/spire/backend/controller/SalesController.java#L111) — `hasAnyRole('INSTRUCTOR','ADMIN')`.
- `SessionRequestController` — [line 51, 62, 73](backend/src/main/java/com/spire/backend/controller/SessionRequestController.java#L51) — `hasRole('INSTRUCTOR')`.
- `TaskController` — [line 27](backend/src/main/java/com/spire/backend/controller/TaskController.java#L27) — `hasRole('ADMIN') or hasRole('INSTRUCTOR')`.

### 2c. TRAINER — 1 endpoint
- `POST /api/courses` — [CourseController.java:125](backend/src/main/java/com/spire/backend/controller/CourseController.java#L125) — via `hasAnyRole('ADMIN','INSTRUCTOR','TRAINER')`.
- **That is the only `@PreAuthorize` mention of TRAINER anywhere in the controller layer.** Verified via grep.

### 2d. ADMIN — every endpoint on `/api/admin/**` plus a large shared LMS surface
- **URL-level:** `/api/admin/**` is `.hasRole("ADMIN")` at [SecurityConfig.java:56](backend/src/main/java/com/spire/backend/security/SecurityConfig.java#L56). This gates every path under `/api/admin`, regardless of the method-level annotation on the controller.
- **Method-level:** at least these controllers use `hasRole('ADMIN')` or `hasAnyRole('...','ADMIN', ...)`:
  - `AdminController` — class-level `hasAnyRole('ADMIN','OPERATIONS_ADMIN','SYSTEM_ADMIN')` at [line 48](backend/src/main/java/com/spire/backend/controller/AdminController.java#L48) — but the URL matcher above narrows that to ADMIN only (see §5).
  - `AdminSalesController` — [line 24](backend/src/main/java/com/spire/backend/controller/AdminSalesController.java#L24) `hasRole('ADMIN')`.
  - `AnnouncementController` — [line 33, 39, 50, 58](backend/src/main/java/com/spire/backend/controller/AnnouncementController.java#L33) — four `hasRole('ADMIN')` writes.
  - `CouponController` — [line 34, 40, 46, 53](backend/src/main/java/com/spire/backend/controller/CouponController.java#L34) — four admin writes.
  - `MentorPoolController` — comments at [line 20-22](backend/src/main/java/com/spire/backend/controller/MentorPoolController.java#L20) note it relies on `/api/admin/**` URL-level rule; no method-level annotation.
  - `RecordController` — [line 59, 87, 110, 156](backend/src/main/java/com/spire/backend/controller/RecordController.java#L59) — audit records.
  - Course/Lesson/Module/Quiz/Task/Assignment/Media/Sales — reuses `ADMIN` or `INSTRUCTOR` (see §2b).

### 2e. OPERATIONS_ADMIN — 8 endpoints
- Class-level on `AdminController` — [line 48](backend/src/main/java/com/spire/backend/controller/AdminController.java#L48) — `hasAnyRole('ADMIN','OPERATIONS_ADMIN','SYSTEM_ADMIN')`. **However**, the `/api/admin/**` URL matcher at [SecurityConfig.java:56](backend/src/main/java/com/spire/backend/security/SecurityConfig.java#L56) narrows this to `ADMIN` only, so OPERATIONS_ADMIN is **rejected before the method-level check runs**. See §5 for the drift.
- Class-level on `FinanceController` — [line 41](backend/src/main/java/com/spire/backend/controller/FinanceController.java#L41) — `hasAnyRole('FINANCE','SYSTEM_ADMIN','OPERATIONS_ADMIN')`. Not gated by any URL matcher, so this one actually works.
- `PermissionService.ADMIN_ROLES` — [PermissionService.java:33-35](backend/src/main/java/com/spire/backend/service/PermissionService.java#L33-L35) — used by the service-layer `canViewDocuments`, `canTransitionWorkflow`, etc. Not a controller gate; recognises `OPERATIONS_ADMIN` for document/workflow reads.
- Ad-hoc authority-string check — [ParticipantController.java:212-213](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L212-L213) — inside `GET /api/participants/documents/{id}/view`, allows the caller through when they carry `ROLE_OPERATIONS_ADMIN`.

### 2f. SYSTEM_ADMIN — 3 endpoints
- Class-level on `AdminController` — same drift as OPERATIONS_ADMIN (§2e); blocked by URL matcher.
- Class-level on `FinanceController` — [line 41](backend/src/main/java/com/spire/backend/controller/FinanceController.java#L41).
- `PermissionService.isSystemAdmin` — [line 59-61](backend/src/main/java/com/spire/backend/service/PermissionService.java#L59-L61).
- Ad-hoc — [ParticipantController.java:213](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L213) `ROLE_SYSTEM_ADMIN`.

### 2g. FINANCE — 1 controller class
- `FinanceController` class-level — [line 41](backend/src/main/java/com/spire/backend/controller/FinanceController.java#L41) `hasAnyRole('FINANCE','SYSTEM_ADMIN','OPERATIONS_ADMIN')`.
- `PermissionService.FINANCE_ROLES` — [line 36-38](backend/src/main/java/com/spire/backend/service/PermissionService.java#L36-L38).

### 2h. ERM — 1 controller class + 1 ad-hoc
- `ErmController` class-level — [line 25](backend/src/main/java/com/spire/backend/controller/ErmController.java#L25) `hasRole('ERM')`.
- Ad-hoc — [ParticipantController.java:213](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L213) `ROLE_ERM` allows document view.

### 2i. COACH — 1 controller class
- `CoachController` class-level — [line 26](backend/src/main/java/com/spire/backend/controller/CoachController.java#L26) `hasAnyRole('COACH','TECHNICAL_ADVISOR')`.

### 2j. TECHNICAL_ADVISOR — same class as COACH
- Shares `CoachController` with COACH via `hasAnyRole`.

### 2k. PARTICIPANT — **zero controller-level gates**
- **`grep -rn "hasRole('PARTICIPANT')\|hasAnyRole.*PARTICIPANT" backend/src/main/java`** returns **no matches**.
- Every participant endpoint on `ParticipantController` uses `isAuthenticated()` (see §2l). Access control for participants is expressed via workflow status (`WorkflowService.isStatusAtLeast(...)`) and per-step completion flags (`ProfileCompletionService.canEnrollInCourses(...)`), not via role.
- The service layer aliases STUDENT → PARTICIPANT for backward compat — [PermissionService.java:17-20](backend/src/main/java/com/spire/backend/service/PermissionService.java#L17-L20) documents:
  > "STUDENT  → PARTICIPANT; ADMIN → OPERATIONS_ADMIN"
  but no code enforces this at controller entry.

### 2l. `isAuthenticated()`-only endpoints (any role)
- `AgreementController` — [line 60, 80, 101, 109, 120, 215](backend/src/main/java/com/spire/backend/controller/AgreementController.java#L60) — six.
- `AssignmentController` — [line 29, 65, 79](backend/src/main/java/com/spire/backend/controller/AssignmentController.java#L29) — three.
- `CartController` — [line 30, 40, 47, 56, 64](backend/src/main/java/com/spire/backend/controller/CartController.java#L30) — five.
- `CertificateController` — [line 44, 63, 135, 155](backend/src/main/java/com/spire/backend/controller/CertificateController.java#L44) — four.
- `CouponController` — [line 62](backend/src/main/java/com/spire/backend/controller/CouponController.java#L62) — one.
- `ParticipantController` — 43 endpoints, every one `isAuthenticated()` — lines 99, 115, 136, 150, 160, 172, 189, 204, 266, 280, 302, 325, 361, 384, 393, 409, 425, 446, 455, 471, 483, 495, 505, 523, 553, 574, 581, 615, 629, 658, 682, 690, 698, 706, 716, 725, 760, 777, 807, 816, 839, 858 (see the full list in the survey grep earlier).
- `QuizController` — [line 128, 136, 144, 154](backend/src/main/java/com/spire/backend/controller/QuizController.java#L128) — four (take/submit).
- `SalesController` — [line 26, 45, 52, 60, 70, 84, 98](backend/src/main/java/com/spire/backend/controller/SalesController.java#L26) — seven.
- `TaskController` — [line 41, 50](backend/src/main/java/com/spire/backend/controller/TaskController.java#L41) — two.

Note: PARTICIPANT, STUDENT, INSTRUCTOR, TRAINER, ADMIN, ERM, COACH, TECHNICAL_ADVISOR, OPERATIONS_ADMIN, FINANCE, SYSTEM_ADMIN can **all** hit `isAuthenticated()` endpoints. The finer role check inside these endpoints (when there is one) is either an ad-hoc authority-string sniff or business-logic via `PermissionService`.

---

## 3. Frontend surfaces per role

### 3a. Route dispatcher — `dashboardRouteForRole`

[frontend/src/lib/api.ts:1519-1534](frontend/src/lib/api.ts#L1519-L1534) maps role → landing route:

| Role | Route |
|------|-------|
| ERM | `/erm-dashboard` |
| COACH | `/coach-dashboard` |
| TECHNICAL_ADVISOR | `/coach-dashboard` |
| FINANCE | `/finance-dashboard` |
| OPERATIONS_ADMIN | `/operations` |
| SYSTEM_ADMIN | `/operations` |
| ADMIN | `/admin` |
| INSTRUCTOR | `/instructor` |
| (default / STUDENT / PARTICIPANT / TRAINER) | `/dashboard` |

Same map is duplicated in [frontend/src/app/dashboard/page.tsx:45-55](frontend/src/app/dashboard/page.tsx#L45-L55) as the routing guard on `/dashboard`.

### 3b. Per-role frontend gate + surface

- **STUDENT** — default LMS surface.
  - Navbar links `STUDENT_LINKS` at [Navbar.tsx:24-31](frontend/src/components/layout/Navbar.tsx#L24-L31): Courses / Services / Dashboard / Messages / Profile / Cart.
  - Course-catalog gate hides categories from unset (non-staff) students with an incomplete profile — [Navbar.tsx:65-77](frontend/src/components/layout/Navbar.tsx#L65-L77), [courses/page.tsx:64-68](frontend/src/app/courses/page.tsx#L64-L68), [services/page.tsx:28-32](frontend/src/app/services/page.tsx#L28-L32).

- **PARTICIPANT** — participant lifecycle surface.
  - Renders the sidebar `ParticipantDashboard` — dispatched from [dashboard/page.tsx:96](frontend/src/app/dashboard/page.tsx#L96) when the role falls through the switch.
  - Navbar treats STUDENT and PARTICIPANT identically — [Navbar.tsx:187-189](frontend/src/components/layout/Navbar.tsx#L187-L189):
    > `(user.role?.toUpperCase() !== "STUDENT" && user.role?.toUpperCase() !== "PARTICIPANT") || user.profileComplete ? Courses link : hide`.
  - No PARTICIPANT-specific route beyond `/dashboard` (route+role sharing).

- **INSTRUCTOR** — `/instructor` hub.
  - Guard at [instructor/page.tsx:40-42](frontend/src/app/instructor/page.tsx#L40-L42) reads `role.toUpperCase() === "INSTRUCTOR"`.
  - Navbar links `INSTRUCTOR_LINKS` at [Navbar.tsx:33-39](frontend/src/components/layout/Navbar.tsx#L33-L39): Courses / My Courses / Dashboard / Messages / Profile.

- **TRAINER** — `/services/create` surface.
  - Navbar links `TRAINER_LINKS` at [Navbar.tsx:41-45](frontend/src/components/layout/Navbar.tsx#L41-L45): Services / Dashboard / Profile.
  - Can create services — [services/create/page.tsx:46, :54](frontend/src/app/services/create/page.tsx#L46) checks `role === "ADMIN" || role === "TRAINER"`. Service creation UI lists all TRAINER users at line 54.

- **ADMIN** — `/admin` LMS operations panel.
  - Guard at [middleware.ts:23-29](frontend/src/middleware.ts#L23-L29) — the **only** middleware-level role check in the app:
    > `if (payload.role?.toUpperCase() !== "ADMIN") redirect to /dashboard`
  - Navbar links `ADMIN_LINKS` at [Navbar.tsx:47-52](frontend/src/components/layout/Navbar.tsx#L47-L52): Courses / Services / Admin / Profile.
  - Admin panel role-picker for user role assignment — [admin/users/[userId]/page.tsx:25](frontend/src/app/admin/users/[userId]/page.tsx#L25):
    > `const ROLES = ["STUDENT", "INSTRUCTOR", "TRAINER", "ADMIN"] as const;`
    (only 4 of 11 roles selectable). Flagged in §5.

- **OPERATIONS_ADMIN** — `/operations` console.
  - Guard at [operations/page.tsx:43-49, :61-64](frontend/src/app/operations/page.tsx#L43-L49) — allows `OPERATIONS_ADMIN` or `SYSTEM_ADMIN`.
  - `dashboardRouteForRole` sends both here.

- **SYSTEM_ADMIN** — same `/operations` console as OPERATIONS_ADMIN.
  - Additionally allowed on `/finance-dashboard` — [finance-dashboard/page.tsx:64](frontend/src/app/finance-dashboard/page.tsx#L64).

- **FINANCE** — `/finance-dashboard`.
  - Guard at [finance-dashboard/page.tsx:63-67](frontend/src/app/finance-dashboard/page.tsx#L63-L67) — allows `FINANCE`, `SYSTEM_ADMIN`, or `OPERATIONS_ADMIN`.

- **ERM** — `/erm-dashboard`.
  - Guard at [erm-dashboard/page.tsx:62-65](frontend/src/app/erm-dashboard/page.tsx#L62-L65) — allows `ERM` only.

- **COACH** — `/coach-dashboard`.
  - Guard at [coach-dashboard/page.tsx:57-61](frontend/src/app/coach-dashboard/page.tsx#L57-L61) — allows `COACH` or `TECHNICAL_ADVISOR`.

- **TECHNICAL_ADVISOR** — same `/coach-dashboard` as COACH.

### 3c. Cross-cutting "isStaff" gate

The course/service list pages define a large `isStaff` set that spans
every non-participant role and lets them fall through the "must
complete profile" gate — [courses/page.tsx:46-50](frontend/src/app/courses/page.tsx#L46-L50), duplicated at
[courses/[id]/page.tsx:105-109](frontend/src/app/courses/[id]/page.tsx#L105-L109) and [services/page.tsx:23-27](frontend/src/app/services/page.tsx#L23-L27):
```ts
role === "ADMIN" || role === "INSTRUCTOR" || role === "TRAINER"
|| role === "SYSTEM_ADMIN" || role === "OPERATIONS_ADMIN"
|| role === "ERM" || role === "COACH" || role === "TECHNICAL_ADVISOR"
|| role === "FINANCE"
```
Any newly-added role has to be inserted in **three** places to
preserve this behaviour. Flagged in §5.

### 3d. Mail-app roles (separate namespace)

The mail-app under `/mail` and `/mail-admin` uses its own role
vocabulary (`USER | ADMIN | SUPER_ADMIN`) tied to `mail_accounts.role`,
not the participant-lifecycle roles surveyed above:
- [(mail)/mail/page.tsx:363](frontend/src/app/(mail)/mail/page.tsx#L363), [(mail)/mail-admin/layout.tsx:10](frontend/src/app/(mail)/mail-admin/layout.tsx#L10), [(mail)/mail-admin/page.tsx:26](frontend/src/app/(mail)/mail-admin/page.tsx#L26).
Flagged for completeness; not part of the main role model.

---

## 4. Defined-but-unused roles

Using the strict definition ("has a `hasRole` / `hasAnyRole` /
`role.toUpperCase() === X` gate anywhere"):

| Role | Backend gate? | Frontend gate? | Verdict |
|------|---------------|----------------|---------|
| STUDENT | 2 endpoints (§2a) | Navbar links, courses gate | **used** |
| INSTRUCTOR | 26 endpoints (§2b) | `/instructor`, LMS surfaces | **used** |
| TRAINER | 1 endpoint (§2c) | `/services/create` | **used, narrowly** |
| ADMIN | dozens (§2d) | `middleware.ts`, `/admin` | **used** |
| PARTICIPANT | **0 controller gates** (§2k) | Navbar checks it | **defined but not gated at the API — role is assigned to new participants but access control is delegated to `isAuthenticated()` + workflow status. See risk #2 in §5.** |
| ERM | 1 class (§2h) | `/erm-dashboard` | **used** |
| COACH | 1 class (§2i) | `/coach-dashboard` | **used** |
| TECHNICAL_ADVISOR | shares COACH class | `/coach-dashboard` | **used** |
| OPERATIONS_ADMIN | 8 hits (§2e) — **but URL matcher blocks it from `/api/admin`** | `/operations`, `/finance-dashboard` | **partially defeated — see risk #1 in §5** |
| FINANCE | 1 class (§2g) | `/finance-dashboard` | **used** |
| SYSTEM_ADMIN | 3 hits (§2f) — **URL matcher also blocks it from `/api/admin`** | `/operations`, `/finance-dashboard` | **partially defeated — see risk #1 in §5** |

**Strictly "defined but unused":** **none.** Every role has at least
one gate. But **PARTICIPANT has zero *role-based* controller gates**,
and **OPERATIONS_ADMIN / SYSTEM_ADMIN have method-level access to
`/api/admin` that is blocked at the URL layer** — see §5.

---

## 5. String-compare risks (typo-hostile checks)

Everything is a string. There is **no Java enum, no TypeScript union
of role literals, no single source of truth**. Every gate below is a
place a typo would silently disable access without a compiler error.

### 5a. Backend typo risks

- **`ROLE_` prefix hard-coded 4 times** — [JwtAuthFilter.java:54](backend/src/main/java/com/spire/backend/security/JwtAuthFilter.java#L54), [UserDetailsServiceImpl.java:27](backend/src/main/java/com/spire/backend/security/UserDetailsServiceImpl.java#L27), and inside [ParticipantController.java:212-213](backend/src/main/java/com/spire/backend/controller/ParticipantController.java#L212-L213) where the authority string is directly compared to `"ROLE_ADMIN"`, `"ROLE_OPERATIONS_ADMIN"`, `"ROLE_SYSTEM_ADMIN"`, `"ROLE_ERM"`. A rename of any role has to touch every one of these sites, and Spring's `hasRole('X')` sugar strips `ROLE_` for you — so the direct comparison here is a second, parallel spelling.
- **Every `@PreAuthorize` argument is a bare string literal.** Grep confirms ~50+ hits (see §2). Renaming `TECHNICAL_ADVISOR` to `TECH_ADVISOR` in the seeder would silently break `CoachController`'s `hasAnyRole('COACH','TECHNICAL_ADVISOR')` at [line 26](backend/src/main/java/com/spire/backend/controller/CoachController.java#L26).
- **`PermissionService.ADMIN_ROLES` / `FINANCE_ROLES`** — [line 33-38](backend/src/main/java/com/spire/backend/service/PermissionService.java#L33-L38) — hard-coded `Set.of(...)` of role name strings. Separate spelling from the `@PreAuthorize` gates and the seeder.
- **`AdminController` URL-vs-method mismatch (drift bug, not typo).** URL matcher at [SecurityConfig.java:56](backend/src/main/java/com/spire/backend/security/SecurityConfig.java#L56) is `.hasRole("ADMIN")`. Class-level annotation at [AdminController.java:48](backend/src/main/java/com/spire/backend/controller/AdminController.java#L48) is `hasAnyRole('ADMIN','OPERATIONS_ADMIN','SYSTEM_ADMIN')`. The comment on that line explicitly says "Double-layer: URL config + method-level" — which is only equivalent when both allow the same set. **OPERATIONS_ADMIN and SYSTEM_ADMIN are effectively locked out of `/api/admin/**`** despite the annotation naming them. Not a typo; a maintenance drift risk. Cited.
- **`Role.name` column has no CHECK constraint on the FK path.** Any string can be inserted into `roles.name`; no enforcement.

### 5b. Frontend typo risks

- **`middleware.ts:29`** — `payload.role?.toUpperCase() !== "ADMIN"`. Any rename would silently unlock `/admin` for the wrong roles or lock it for the right ones.
- **Duplicated `isStaff` chain in three files** — [courses/page.tsx:46-50](frontend/src/app/courses/page.tsx#L46-L50), [courses/[id]/page.tsx:105-109](frontend/src/app/courses/[id]/page.tsx#L105-L109), [services/page.tsx:23-27](frontend/src/app/services/page.tsx#L23-L27). A new role has to be added in all three.
- **Every dashboard guard is a bare string comparison** — [dashboard/page.tsx:45-55](frontend/src/app/dashboard/page.tsx#L45-L55), [erm-dashboard/page.tsx:62](frontend/src/app/erm-dashboard/page.tsx#L62), [coach-dashboard/page.tsx:57-58](frontend/src/app/coach-dashboard/page.tsx#L57-L58), [finance-dashboard/page.tsx:64](frontend/src/app/finance-dashboard/page.tsx#L64), [operations/page.tsx:43-49, :61-64](frontend/src/app/operations/page.tsx#L43-L49), [instructor/page.tsx:40-42](frontend/src/app/instructor/page.tsx#L40-L42).
- **Admin user-role picker is stale** — [admin/users/[userId]/page.tsx:25](frontend/src/app/admin/users/[userId]/page.tsx#L25):
  > `const ROLES = ["STUDENT", "INSTRUCTOR", "TRAINER", "ADMIN"] as const;`
  Only 4 of 11 roles. An admin cannot assign PARTICIPANT / ERM / COACH / TECHNICAL_ADVISOR / OPERATIONS_ADMIN / FINANCE / SYSTEM_ADMIN via this UI, even though those rows exist. (Team users are seeded by `DataSeeder.seedTeamUser(...)` at [line 629](backend/src/main/java/com/spire/backend/config/DataSeeder.java#L629); no other mutation path in the app.)
- **`Navbar.tsx:270`** — `user.role?.toUpperCase() === "ADMIN"` for the "Admin Panel" mobile link. Same string-compare risk.

**Total string-compare hits (frontend + backend combined):** on the order of **100+ literals**, split across ~30 files. Every single one is a potential silent-failure site under rename.

### 5c. Dead / mismatched artifacts

- The `users.role` VARCHAR + CHECK column at [schema.sql:15](backend/src/main/resources/schema.sql#L15) is unreachable from application code (the entity uses `role_id` FK). It is a stale schema artifact from a pre-normalisation design and would silently mislead a new engineer reading `schema.sql`.
- `Role.java:11` docstring says "STUDENT, INSTRUCTOR, ADMIN" (3 roles); the DB has 11.
- The **JWT role claim is not uppercased**. JwtAuthFilter prepends `ROLE_` to whatever the token carries, so a DB row with lowercase `student` would produce authority `ROLE_student` and every `hasRole('STUDENT')` check would fail silently.

---

## 6. Default role for a fresh signup

Two signup paths, each with its own default:

### 6a. Legacy `/api/auth/register` → **STUDENT**
[backend/src/main/java/com/spire/backend/service/AuthService.java:55-57](backend/src/main/java/com/spire/backend/service/AuthService.java#L55-L57):
```java
// 2. Fetch STUDENT role from roles table
Role studentRole = roleRepository.findByName("STUDENT")
        .orElseThrow(() -> new IllegalStateException(
                "Default role STUDENT not found in database"));
```
Assigned at [line 67](backend/src/main/java/com/spire/backend/service/AuthService.java#L67). Class docstring [line 24](backend/src/main/java/com/spire/backend/service/AuthService.java#L24):
> "Registration: validates email uniqueness, hashes password, assigns STUDENT role."

### 6b. Phase 1B `/api/participants/enroll` → **PARTICIPANT** (fallback STUDENT)
[backend/src/main/java/com/spire/backend/service/AuthService.java:132-135](backend/src/main/java/com/spire/backend/service/AuthService.java#L132-L135):
```java
Role participantRole = roleRepository.findByName("PARTICIPANT")
        .orElseGet(() -> roleRepository.findByName("STUDENT")
                .orElseThrow(() -> new IllegalStateException(
                        "Neither PARTICIPANT nor STUDENT role exists")));
```
Docstring [line 114](backend/src/main/java/com/spire/backend/service/AuthService.java#L114):
> "the role to be PARTICIPANT, not STUDENT."

Because both roles are seeded at every boot (§1a), the fallback branch
is effectively unreachable in production; but it's the reason the
service layer aliases STUDENT → PARTICIPANT at [PermissionService.java:19](backend/src/main/java/com/spire/backend/service/PermissionService.java#L19).

### 6c. Which path a real user takes
The frontend signup flow calls `/api/participants/enroll` — see the
"Get Started" CTA on `/enroll` and the `enrollParticipant` wire in
[frontend/src/lib/api.ts:265](frontend/src/lib/api.ts#L265). The
`/api/auth/register` endpoint is retained for legacy clients and admin
tooling. In production every fresh signup should land as **PARTICIPANT**.

---

**ROLES_SURVEY.md written — 11 roles found, 0 strictly defined-but-unused (PARTICIPANT is assigned but has zero role-based controller gates), 100+ string-compare risks (systemic — no enum anywhere).**
