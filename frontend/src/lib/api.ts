// API base URL — preference order:
//   1. NEXT_PUBLIC_API_URL from build env (set on Vercel to the
//      Railway domain; can be overridden per-environment for staging).
//   2. Production fallback to the Railway URL — guards against a
//      missing env var on a Vercel build silently shipping with
//      `localhost:8080` baked in.
//   3. Localhost for `next dev` so the same code works locally
//      against `./mvnw spring-boot:run` on :8080.
//
// Exported so diagnostic surfaces can display the URL they're hitting
// without re-deriving the env-var resolution.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  || (process.env.NODE_ENV === "production"
      ? "https://spireinfotech-production.up.railway.app"
      : "http://localhost:8080");

// Internal alias kept so existing in-file references don't churn.
const BASE_URL = API_BASE_URL;

// ─── Types ──────────────────────────────────────────────────────────

// Spring Boot wraps all responses in ApiResponse<T>
interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface UserDTO {
  id: number;
  email: string;
  fullName: string;
  role: string;
  avatarUrl: string | null;
  bio: string | null;
  onboardingCompleted?: boolean;
  isActive?: boolean;
  instructorApproved?: boolean;
  // True after the user has completed the OTP-confirmed Terms of
  // Service flow. Optional so older payloads still parse.
  agreementAccepted?: boolean;
  createdAt?: string | null;
  // Stamped when an admin deactivates the account; cleared on
  // reactivate. Drives the "Deactivated on …" column on the admin
  // Deactivated Users tab.
  deactivatedAt?: string | null;
  // Phase 1B — participant lifecycle fields surfaced on every
  // login / profile read. The onboarding routing guard reads
  // currentStatus to decide which page the user should be on.
  participantId?: string | null;
  currentStatus?: string | null;
  emailVerified?: boolean;
  // Phase 3A pre-fill: skillset + availability the participant
  // captured at enrollment. The /program-selection form pre-fills
  // these but allows overrides.
  selectedTechnology?: string | null;
  availability?: string | null;
  /** Captured at enrollment; displayed on the agreement summary. */
  phone?: string | null;
  /** Free-form city / region, editable from the Profile tab. */
  location?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDTO;
}

export interface InstructorStudent {
  studentName: string;
  email: string;
  courseTitle: string;
  enrolledAt: string;
}

// ─── Core fetch helper ──────────────────────────────────────────────

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  // Handle 401 — try refresh, but don't redirect for non-auth failures
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${localStorage.getItem("access_token")}`;
      const retry = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
      if (retry.ok) return retry.json();
    }
    // Only redirect to login if we have no valid token at all
    // (not for 401s caused by enrollment/permission checks)
    const hasToken = typeof window !== "undefined" && localStorage.getItem("access_token");
    if (!hasToken && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // 403 AGREEMENT_REQUIRED — backend legacy gate still fires for
    // some non-participant endpoints (courses, lessons, …) when a
    // user has agreement_accepted=false. The new participant
    // lifecycle is exempt from this gate server-side, so this
    // branch should only trip for legacy-only users.
    //
    // We no longer auto-redirect on this code — the old fallback
    // to /agreement-legacy interrupted the new onboarding flow
    // when any background fetch raced ahead of the page logic.
    // The throw is preserved so the auth context's init useEffect
    // can keep its tokens intact (it special-cases this message).
    if (res.status === 403 && body?.message === "AGREEMENT_REQUIRED") {
      throw new Error("AGREEMENT_REQUIRED");
    }
    throw new Error(body.message || body.detail || `API error ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken =
    typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),  // camelCase for Spring Boot
    });
    if (!res.ok) return false;
    const wrapper: ApiResponse<AuthResponse> = await res.json();
    localStorage.setItem("access_token", wrapper.data.accessToken);
    localStorage.setItem("refresh_token", wrapper.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// ─── Auth ───────────────────────────────────────────────────────────

export interface RegistrationResponse {
  userId: number;
  email: string;
  requiresVerification: boolean;
}

/**
 * Thrown by {@link login} when the backend rejects the credentials
 * with a 403 carrying {@code message: "EMAIL_NOT_VERIFIED"} and the
 * user's email in {@code data.email}. The login page catches this
 * specifically to surface a "Verify Now" link instead of the
 * generic "wrong password" message.
 */
export class EmailNotVerifiedError extends Error {
  email: string;
  constructor(email: string) {
    super("EMAIL_NOT_VERIFIED");
    this.email = email;
    this.name = "EmailNotVerifiedError";
  }
}

export async function register(data: { fullName: string; email: string; password: string }): Promise<RegistrationResponse> {
  const wrapper = await apiFetch<ApiResponse<RegistrationResponse>>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

// ─── Phase 1B: participant enrollment ────────────────────────────────

export interface ParticipantEnrollRequest {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  location?: string;
  availability: string;
  selectedTechnology: string;
  targetExperienceLevel: string;
}

/**
 * Phase 1B enrollment — wider than the legacy {@link register}.
 * Body matches the backend ParticipantEnrollRequest record;
 * response shape stays {@link RegistrationResponse} so call sites
 * can route to /verify-email the same way.
 */
export async function enrollParticipant(
  data: ParticipantEnrollRequest,
): Promise<RegistrationResponse> {
  const wrapper = await apiFetch<ApiResponse<RegistrationResponse>>(
    "/api/participants/enroll",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
  return wrapper.data;
}

/** Fetches the caller's full profile incl. participantId + currentStatus. */
export async function getParticipantMe(): Promise<UserDTO> {
  const wrapper = await apiFetch<ApiResponse<UserDTO>>("/api/participants/me");
  return wrapper.data;
}

export interface ParticipantProfileUpdate {
  fullName?: string;
  phone?: string;
  location?: string;
  bio?: string;
  availability?: string;
}

export async function getParticipantProfile(): Promise<UserDTO> {
  const wrapper = await apiFetch<ApiResponse<UserDTO>>("/api/participants/profile");
  return wrapper.data;
}

export async function updateParticipantProfile(
  body: ParticipantProfileUpdate,
): Promise<UserDTO> {
  const wrapper = await apiFetch<ApiResponse<UserDTO>>(
    "/api/participants/profile",
    { method: "PUT", body: JSON.stringify(body) },
  );
  return wrapper.data;
}

// ─── Phase 2A: acknowledgment ────────────────────────────────────────

export interface AcknowledgmentSubmitRequest {
  legalName: string;
  /** Base64 data-URL (data:image/png;base64,…). */
  signatureImage: string;
  signatureMethod: "draw" | "upload";
  interestAccepted: boolean;
  documentationConsent: boolean;
  communicationConsent: boolean;
  /** Pinned to the exact text version the user accepted ("ACK-v1.0"). */
  acknowledgmentVersion: string;
}

export interface AcknowledgmentSubmitResponse {
  acknowledgmentId: number;
  version: string;
  nextStep: string;
  success: boolean;
}

/**
 * Phase 2A step-4 submission. Server enforces the workflow gate
 * (status &gt;= ID_EMAIL_SENT) and is idempotent — re-submitting
 * once already past ACKNOWLEDGMENT_ACCEPTED returns the existing
 * row rather than writing a duplicate.
 */
export async function submitAcknowledgment(
  body: AcknowledgmentSubmitRequest,
): Promise<AcknowledgmentSubmitResponse> {
  const wrapper = await apiFetch<ApiResponse<AcknowledgmentSubmitResponse>>(
    "/api/participants/acknowledgments",
    { method: "POST", body: JSON.stringify(body) },
  );
  return wrapper.data;
}

// ─── Phase 2B: document vault ──────────────────────────────────────

export type DocumentType =
  | "GOVERNMENT_ID" | "WORK_AUTHORIZATION" | "RESUME"
  | "SSN_DOCUMENT" | "DRIVERS_LICENSE" | "OTHER";

export type DocumentReviewStatus =
  | "PENDING" | "APPROVED" | "REJECTED" | "NOT_APPLICABLE";

export interface ParticipantDocument {
  id: number;
  documentType: DocumentType;
  fileName: string | null;
  fileSize: number | null;
  reviewStatus: DocumentReviewStatus;
  reviewerNotes: string | null;
  uploadedAt: string | null;
  reviewedAt: string | null;
  notApplicable: boolean;
}

/** Uploads a single file as the named documentType (multipart/form-data). */
export async function uploadParticipantDocument(
  documentType: DocumentType, file: File,
): Promise<ParticipantDocument> {
  const token = typeof window === "undefined"
    ? null : localStorage.getItem("access_token");
  const form = new FormData();
  form.append("file", file);
  form.append("documentType", documentType);
  const res = await fetch(`${API_BASE_URL}/api/participants/documents/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const body = (await res.json()) as ApiResponse<ParticipantDocument>;
  return body.data;
}

export async function listParticipantDocuments(): Promise<ParticipantDocument[]> {
  const wrapper = await apiFetch<ApiResponse<ParticipantDocument[]>>("/api/participants/documents");
  return wrapper.data ?? [];
}

export async function deleteParticipantDocument(documentId: number): Promise<void> {
  await apiFetch<ApiResponse<unknown>>(
    `/api/participants/documents/${documentId}`,
    { method: "DELETE" });
}

export async function markDocumentNotApplicable(
  documentType: DocumentType,
): Promise<ParticipantDocument> {
  const wrapper = await apiFetch<ApiResponse<ParticipantDocument>>(
    "/api/participants/documents/mark-na",
    { method: "POST", body: JSON.stringify({ documentType }) },
  );
  return wrapper.data;
}

export interface CompleteDocumentsResponse {
  success: boolean;
  missing: DocumentType[];
  message?: string;
  nextStep?: string;
}

export async function completeDocuments(): Promise<CompleteDocumentsResponse> {
  const wrapper = await apiFetch<ApiResponse<CompleteDocumentsResponse>>(
    "/api/participants/documents/complete",
    { method: "POST" },
  );
  return wrapper.data;
}

/**
 * Streams the underlying file via the auth-gated view endpoint and
 * opens it in a new tab. For Cloudinary-backed documents the server
 * returns a 5-minute signed URL; for local-disk documents the
 * server streams the bytes inline.
 */
export async function viewParticipantDocument(documentId: number): Promise<void> {
  const token = typeof window === "undefined"
    ? null : localStorage.getItem("access_token");
  const res = await fetch(`${API_BASE_URL}/api/participants/documents/${documentId}/view`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Couldn't load document (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    // Cloudinary path: ApiResponse with { url, expiresIn }.
    const body = (await res.json()) as ApiResponse<{ url: string }>;
    const url = body?.data?.url;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  // Local-disk path: blob stream.
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  window.open(objectUrl, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

// ─── Phase 3A: program selection ───────────────────────────────────

export interface ProgramSelectionRequest {
  program?: string;
  phase?: string;
  skillset?: string;
  targetJobTitle?: string;
  coachingPreference?: string;
  availability?: string;
  servicePackage?: string;
  serviceSummaryVersion?: string;
  notes?: string;
}

export interface ProgramSelectionDTO {
  id: number;
  program: string | null;
  phase: string | null;
  skillset: string | null;
  targetJobTitle: string | null;
  coachingPreference: string | null;
  availability: string | null;
  servicePackage: string | null;
  serviceSummaryVersion: string | null;
  notes: string | null;
  selectionDate: string | null;
}

export interface ProgramSelectionSubmitResponse {
  selectionId: number;
  serviceSummaryVersion: string;
  nextStep: string;
  success: boolean;
}

/** Returns the current saved selection (or null), used to pre-fill the form. */
export async function getProgramSelection(): Promise<ProgramSelectionDTO | null> {
  const wrapper = await apiFetch<ApiResponse<ProgramSelectionDTO | null>>(
    "/api/participants/program-selection",
  );
  return wrapper.data ?? null;
}

/**
 * Partial save — survives a refresh / sign-out. Server doesn't
 * validate or transition workflow on this path.
 */
export async function saveProgramSelectionDraft(
  body: ProgramSelectionRequest,
): Promise<ProgramSelectionDTO> {
  const wrapper = await apiFetch<ApiResponse<ProgramSelectionDTO>>(
    "/api/participants/program-selection/draft",
    { method: "POST", body: JSON.stringify(body) },
  );
  return wrapper.data;
}

/**
 * Final submit. Server validates required fields, transitions
 * workflow to PROGRAM_SELECTED, fires the confirmation email.
 */
export async function submitProgramSelection(
  body: ProgramSelectionRequest,
): Promise<ProgramSelectionSubmitResponse> {
  const wrapper = await apiFetch<ApiResponse<ProgramSelectionSubmitResponse>>(
    "/api/participants/program-selection",
    { method: "POST", body: JSON.stringify(body) },
  );
  return wrapper.data;
}

// ─── Phase 3B: participant agreement signing (one-click) ───────────

export interface SignAgreementRequest {
  legalName: string;
  signatureImage: string;
  signatureMethod: "draw" | "upload";
}

export async function signParticipantAgreement(
  body: SignAgreementRequest,
): Promise<{ success: boolean; status: string; nextStep: string; alreadySigned?: boolean }> {
  const wrapper = await apiFetch<ApiResponse<{
    success: boolean; status: string; nextStep: string; alreadySigned?: boolean;
  }>>(
    "/api/participants/agreement/sign",
    { method: "POST", body: JSON.stringify(body) },
  );
  return wrapper.data;
}

// ─── Phase 3B: check soft-copy uploads ────────────────────────────

export interface CheckDocumentDTO {
  id: number;
  checkNumber: string | null;
  amount: number | null;
  checkDate: string | null;
  notes: string | null;
  reviewStatus: string;
  uploadedAt: string | null;
}

export async function uploadCheckSoftCopy(
  file: File,
  meta: { checkNumber?: string; amount?: number; checkDate?: string; notes?: string },
): Promise<CheckDocumentDTO> {
  const token = typeof window === "undefined"
    ? null : localStorage.getItem("access_token");
  const form = new FormData();
  form.append("file", file);
  if (meta.checkNumber) form.append("checkNumber", meta.checkNumber);
  if (meta.amount !== undefined && meta.amount !== null) form.append("amount", String(meta.amount));
  if (meta.checkDate) form.append("checkDate", meta.checkDate);
  if (meta.notes) form.append("notes", meta.notes);
  const res = await fetch(`${API_BASE_URL}/api/participants/checks/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  const body = (await res.json()) as ApiResponse<CheckDocumentDTO>;
  return body.data;
}

export async function markCheckNotApplicable(): Promise<void> {
  await apiFetch<ApiResponse<unknown>>(
    "/api/participants/checks/mark-na",
    { method: "POST" });
}

export async function listMyChecks(): Promise<CheckDocumentDTO[]> {
  const wrapper = await apiFetch<ApiResponse<CheckDocumentDTO[]>>(
    "/api/participants/checks");
  return wrapper.data ?? [];
}

// ─── Phase 4: welcome / team-assembly status ──────────────────────

export interface WelcomeStatus {
  workflowStatus?: string;
  welcomeEmailSent?: boolean;
  coordinatorIntroSent?: boolean;
  ermAssigned?: boolean;
  coachesAssigned?: boolean;
  dashboardReady?: boolean;
  ermName?: string | null;
  ermEmail?: string | null;
  /** label → coach name (or "Awaiting assignment"). */
  coaches?: Record<string, string>;
}

export async function getWelcomeStatus(): Promise<WelcomeStatus> {
  const wrapper = await apiFetch<ApiResponse<WelcomeStatus>>(
    "/api/participants/welcome-status");
  return wrapper.data ?? {};
}

/** Re-runs the OnboardingService chain (idempotent). Used by the
 *  /welcome page when the user clicks "Check now". */
export async function refreshWelcomeStatus(): Promise<WelcomeStatus> {
  const wrapper = await apiFetch<ApiResponse<WelcomeStatus>>(
    "/api/participants/welcome-status/refresh",
    { method: "POST" });
  return wrapper.data ?? {};
}

// ─── Phase 5A: participant dashboard ───────────────────────────────

export interface ParticipantDashboard {
  participantId: string | null;
  fullName: string | null;
  email: string | null;
  currentStatus: string | null;
  roadmapTotal: number;
  roadmapStep: number;
  roadmapLabels: string[];
  nextAction: { label: string; href: string };
  program?: {
    program?: string;
    phase?: string;
    skillset?: string;
    targetJobTitle?: string;
    availability?: string;
  };
  team?: {
    ermName?: string | null;
    ermEmail?: string | null;
    coaches?: Record<string, string>;
  };
  recentActivity?: { title: string; category: string; createdAt: string }[];
  stats?: { weeksEnrolled: number; reportsSubmitted: number };
  currentWeekStart?: string;
  currentWeekEnd?: string;
  currentWeekReportStatus?: string;
  currentWeekReportId?: number;
}

export async function getParticipantDashboard(): Promise<ParticipantDashboard> {
  const wrapper = await apiFetch<ApiResponse<ParticipantDashboard>>(
    "/api/participants/dashboard");
  return wrapper.data;
}

export interface ParticipantTeam {
  erm?: { name: string | null; email: string | null; bio: string | null };
  coaches?: Record<string, string>;
}

export async function getParticipantTeam(): Promise<ParticipantTeam> {
  const wrapper = await apiFetch<ApiResponse<ParticipantTeam>>(
    "/api/participants/team");
  return wrapper.data ?? {};
}

// ─── Weekly reports ───────────────────────────────────────────────

export interface WeeklyReportJobSubmission {
  company?: string;
  client?: string;
  jobTitle?: string;
  technology?: string;
  portal?: string;
  applicationLink?: string;
  submissionDate?: string;
  status?: string;
  followUpDate?: string;
}

export interface WeeklyReportRequest {
  weekStart?: string;
  weekEnd?: string;
  jobSubmissions?: WeeklyReportJobSubmission[];
  resumeActivities?: Record<string, string>;
  interviewTraining?: Record<string, string>;
  communications?: Record<string, string>;
}

export interface WeeklyReportDTO {
  id: number;
  weekStart: string | null;
  weekEnd: string | null;
  submissionDueDate: string | null;
  submittedAt: string | null;
  ermReviewDate: string | null;
  ermNotes: string | null;
  /** JSON-encoded form payload. */
  reportData: string | null;
  status: string;
}

export async function submitWeeklyReport(body: WeeklyReportRequest): Promise<WeeklyReportDTO> {
  const wrapper = await apiFetch<ApiResponse<WeeklyReportDTO>>(
    "/api/participants/reports/weekly",
    { method: "POST", body: JSON.stringify(body) });
  return wrapper.data;
}

export async function saveWeeklyReportDraft(body: WeeklyReportRequest): Promise<WeeklyReportDTO> {
  const wrapper = await apiFetch<ApiResponse<WeeklyReportDTO>>(
    "/api/participants/reports/weekly/draft",
    { method: "POST", body: JSON.stringify(body) });
  return wrapper.data;
}

export async function listWeeklyReports(): Promise<WeeklyReportDTO[]> {
  const wrapper = await apiFetch<ApiResponse<WeeklyReportDTO[]>>(
    "/api/participants/reports/weekly");
  return wrapper.data ?? [];
}

export async function getWeeklyReport(id: number): Promise<WeeklyReportDTO> {
  const wrapper = await apiFetch<ApiResponse<WeeklyReportDTO>>(
    `/api/participants/reports/weekly/${id}`);
  return wrapper.data;
}

/**
 * Maps a participant's workflow status to the onboarding page they
 * belong on. Mirrors the backend's WorkflowService.Status enum.
 * Used by each onboarding page on mount to bounce the user to the
 * correct step if they're out of place; pages NOT listed here are
 * considered "general" (dashboard, admin, courses, etc.) and the
 * guard leaves the user alone.
 */
export function getOnboardingRoute(status: string | null | undefined): string {
  switch (status) {
    case "DRAFT_STARTED":
    case "BASIC_INFO_SUBMITTED":
      return "/enroll";
    case "EMAIL_VERIFICATION_PENDING":
      return "/verify-email";
    case "EMAIL_VERIFIED":
    case "PARTICIPANT_ID_CREATED":
    case "ID_EMAIL_SENT":
      return "/participant-id";
    case "ACKNOWLEDGMENT_ACCEPTED":
      return "/document-upload";
    case "DOC_REVIEW_PENDING":
      // Docs went out for review — send the user back to the
      // upload page so they can see review status and resubmit
      // if Operations rejected anything.
      return "/document-upload";
    case "DOCUMENTS_SUBMITTED":
      return "/program-selection";
    case "PROGRAM_SELECTED":
    case "DOCUSIGN_SENT":
    case "CHECK_COPY_UPLOADED":
      // The /agreement page IS the Phase 3B signing UI — review,
      // optional check upload, signature, send email, OTP. The
      // OLD Terms-of-Service flow lives at /agreement-legacy.
      return "/agreement";
    case "DOCUSIGN_COMPLETED":
    case "SIGNED_AGREEMENT_SENT_TO_ERM":
    case "WELCOME_SENT":
    case "DEEPTHI_INTRO_SENT":
    case "ERM_ASSIGNED":
    case "COACHES_ASSIGNED":
      // Phase 4 — between agreement completion and Gate 5
      // (dashboard enabled), the participant stays on /welcome
      // which polls for team-assembly progress.
      return "/welcome";
    case "DASHBOARD_ENABLED":
    case "WEEKLY_REPORTING_ACTIVE":
    case "EMPLOYMENT_ACCEPTED":
    case "PHASE_1_COMPLETED":
    case "PAYMENT_PLAN_ACCEPTED":
    case "CHECK_TRACKING_ADDED":
    case "INVOICING_ACTIVE":
    case "PAYMENTS_TRACKED":
      return "/dashboard";
    default:
      return "/enroll";
  }
}

/** Coarse "is this user past onboarding?" check the routing guard uses. */
export function isDashboardStatus(status: string | null | undefined): boolean {
  return getOnboardingRoute(status) === "/dashboard";
}

/**
 * Login. Bypasses {@link apiFetch} so a 403 EMAIL_NOT_VERIFIED can
 * be surfaced as a typed error (apiFetch flattens the response body
 * into a generic Error, which would lose the email payload the
 * verify page needs).
 */
export async function login(data: { email: string; password: string }): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  // Try to parse the body for both success and error paths so we
  // can pluck the email out of the EMAIL_NOT_VERIFIED payload.
  const body = (await res.json().catch(() => ({}))) as ApiResponse<AuthResponse> & {
    data?: { email?: string };
  };
  if (res.status === 403 && body?.message === "EMAIL_NOT_VERIFIED") {
    throw new EmailNotVerifiedError(body.data?.email ?? data.email);
  }
  if (!res.ok) {
    throw new Error(body?.message || `Login failed (${res.status})`);
  }
  return body.data as AuthResponse;
}

/**
 * Submits the 6-digit OTP. On success the backend hands back a full
 * {@link AuthResponse} (same shape as login) so the caller can store
 * the JWT and continue to /dashboard.
 */
export async function verifyCode(email: string, code: string): Promise<AuthResponse> {
  const wrapper = await apiFetch<ApiResponse<AuthResponse>>("/api/auth/verify-code", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
  return wrapper.data;
}

/**
 * Asks the backend to issue a fresh OTP (and email it). Server-side
 * cooldown is 60 seconds; the frontend countdown is just UX. Returns
 * the configured cooldown so the page can sync its timer.
 */
export async function resendVerificationCode(email: string): Promise<{ cooldownSeconds: number }> {
  const wrapper = await apiFetch<ApiResponse<{ cooldownSeconds: number }>>("/api/auth/resend-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return wrapper.data ?? { cooldownSeconds: 60 };
}

export function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  return Promise.resolve();
}

// ─── Agreement (Terms of Service acceptance) ───────────────────────

export interface TermsSection {
  title: string;
  content: string;
}

export interface TermsResponse {
  version: string;
  lastUpdated: string;
  sections: TermsSection[];
}

export type AgreementStatusValue =
  | "NOT_STARTED"
  | "WAITING_REPLY"
  | "CODE_SENT"
  | "VERIFIED";

export interface AgreementStatus {
  status: AgreementStatusValue;
  accepted: boolean;
  version: string;
  agreementExpiresAt?: string | null;
  acceptedAt?: string | null;
  legalName?: string | null;
}

/** Public — no auth required. Fetches the active terms document. */
export async function getTerms(): Promise<TermsResponse> {
  const wrapper = await apiFetch<ApiResponse<TermsResponse>>("/api/agreement/terms");
  return wrapper.data;
}

/**
 * Polled by the agreement page every few seconds while the user
 * is in WAITING_REPLY — the IMAP cron flips the row to CODE_SENT
 * once it sees the YES reply, at which point the page enables the
 * OTP entry boxes.
 */
export async function getAgreementStatus(): Promise<AgreementStatus> {
  const wrapper = await apiFetch<ApiResponse<AgreementStatus>>("/api/auth/agreement/check-status");
  return wrapper.data;
}

/**
 * Submits the agreement acceptance form. Server validates the legal
 * name + checkbox state and emails the user a "Reply YES" prompt;
 * no OTP yet — that comes after the IMAP cron sees the reply.
 * Returns {@code alreadyAccepted: true} on idempotent re-submits.
 */
export async function acceptAgreement(payload: {
  legalName: string;
  termsAccepted: boolean;
  contentPolicyAccepted: boolean;
  // Base64 data-URL of the user's drawn / uploaded signature.
  // Server-side validation requires the data:image/* prefix and
  // a payload under ~2 MB.
  signatureImage: string;
  signatureMethod: "draw" | "upload";
}): Promise<{ success: boolean; alreadyAccepted: boolean; status: AgreementStatusValue; message: string; expiresAt?: string }> {
  const wrapper = await apiFetch<ApiResponse<{
    success: boolean; alreadyAccepted: boolean;
    status: AgreementStatusValue; message: string; expiresAt?: string;
  }>>(
    "/api/auth/agreement/accept",
    { method: "POST", body: JSON.stringify(payload) },
  );
  return wrapper.data;
}

export async function verifyAgreementCode(code: string): Promise<void> {
  await apiFetch<ApiResponse<unknown>>("/api/auth/agreement/verify-code", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function resendAgreementCode(): Promise<{ cooldownSeconds: number }> {
  const wrapper = await apiFetch<ApiResponse<{ cooldownSeconds: number }>>(
    "/api/auth/agreement/resend",
    { method: "POST" },
  );
  return wrapper.data ?? { cooldownSeconds: 60 };
}

/**
 * Fetches the signed-agreement PDF as a blob with the user's JWT
 * attached, then triggers a browser download. Used by both the
 * student profile and the admin user-detail panel; the backend
 * gates the call to the owning user or any admin.
 */
export async function downloadSignedAgreementPdf(
  relativePath: string,
  filename = "Spire-Agreement.pdf",
): Promise<void> {
  const token = typeof window === "undefined"
    ? null
    : localStorage.getItem("access_token");
  const url = relativePath.startsWith("http")
    ? relativePath
    : `${API_BASE_URL}${relativePath}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

// ─── Password reset ─────────────────────────────────────────────────

/**
 * Always reports success regardless of whether the email is on file
 * (the backend deliberately doesn't reveal account existence). Caller
 * shows a generic "if that email exists, a link is on the way" UI.
 */
export async function requestPasswordReset(email: string) {
  const wrapper = await apiFetch<ApiResponse<{ message: string }>>(
    "/api/auth/forgot-password",
    { method: "POST", body: JSON.stringify({ email }) },
  );
  return wrapper.data;
}

export async function resetPassword(token: string, newPassword: string) {
  const wrapper = await apiFetch<ApiResponse<{ message: string }>>(
    "/api/auth/reset-password",
    { method: "POST", body: JSON.stringify({ token, newPassword }) },
  );
  return wrapper.data;
}

// ─── User / Profile ─────────────────────────────────────────────────

export interface ProfileAgreementSummary {
  id: number;
  accepted: boolean;
  status?: AgreementStatusValue;
  legalName: string | null;
  version: string;
  acceptedAt: string | null;
  agreementEmailSentAt?: string | null;
  userReplyReceivedAt?: string | null;
  userReplyContent?: string | null;
  verificationCodeSentAt?: string | null;
  verificationCodeVerifiedAt?: string | null;
  ipAddress: string | null;
  browser: string | null;
  os: string | null;
  recordId: string;
  // Personalized signed-agreement PDF download URL (relative to API_BASE_URL).
  // Null for legacy verified rows that pre-date the PDF flow.
  signedAgreementPdfUrl?: string | null;
  // Base64 data-URL of the user's drawn or uploaded signature.
  // Rendered in the admin user-detail panel; null for rows that
  // pre-date the signature feature.
  signatureImage?: string | null;
  signatureMethod?: "draw" | "upload" | null;
}

export interface ProfileData extends UserDTO {
  phone: string | null;
  location: string | null;
  createdAt: string | null;
  enrolledCoursesCount: number;
  completedCoursesCount: number;
  certificatesCount: number;
  streakDays: number;
  totalLessonsCompleted: number;
  totalLearningMinutes: number;
  lastActiveAt: string | null;
  contributions: Record<string, number>;
  enrolledCourses: ProfileCourseSummary[] | null;
  certificates: ProfileCertSummary[] | null;
  // Terms of Service acceptance — null when the user has never
  // started the flow. Admin user-detail panel renders this; the
  // self-service profile page can ignore it.
  agreement: ProfileAgreementSummary | null;
}

export interface ProfileCourseSummary {
  id: number;
  title: string;
  type: string; // COURSE | SERVICE
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  completed: boolean;
  enrolledAt: string | null;
}

export interface ProfileCertSummary {
  id: number;
  certificateId: string | null;
  courseTitle: string | null;
  certificateUrl: string | null;
  issuedAt: string | null;
}

export async function getProfile(): Promise<ProfileData> {
  const wrapper = await apiFetch<ApiResponse<ProfileData>>("/api/users/profile");
  return wrapper.data;
}

export interface UpdateProfileBody {
  fullName: string;
  phone?: string;
  bio?: string;
  location?: string;
}

export async function updateProfile(data: UpdateProfileBody): Promise<ProfileData> {
  const wrapper = await apiFetch<ApiResponse<ProfileData>>("/api/users/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

// Admin: read any user's full profile (analytics + activity heatmap).
export async function getUserProfileAsAdmin(userId: number | string): Promise<ProfileData> {
  const wrapper = await apiFetch<ApiResponse<ProfileData>>(
    `/api/admin/users/${userId}/profile`
  );
  return wrapper.data;
}

// Admin: change a user's role (uses the existing PUT /api/admin/users/{id}/role).
export async function updateUserRoleAsAdmin(userId: number | string, role: string) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(
    `/api/admin/users/${userId}/role`,
    {
      method: "PUT",
      body: JSON.stringify({ role }),
    }
  );
  return wrapper.data;
}

// Admin: activate/deactivate a user account.
export async function updateUserStatusAsAdmin(userId: number | string, active: boolean) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(
    `/api/admin/users/${userId}/status`,
    {
      method: "PUT",
      body: JSON.stringify({ active }),
    }
  );
  return wrapper.data;
}

// Admin: soft-delete a user (deactivates + scrubs personal data,
// preserves audit records). Server enforces "no self-delete" and
// "no admin-on-admin" rules and returns 400 with a message.
export async function softDeleteUserAsAdmin(userId: number | string) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(
    `/api/admin/users/${userId}`,
    { method: "DELETE" },
  );
  return wrapper.data;
}

// Admin: every enrollment on the platform with mentor + progress resolved.
export interface AdminEnrollmentRow {
  enrollmentId: number;
  userId: number;
  studentName: string;
  studentEmail: string;
  courseId: number;
  courseTitle: string;
  courseType: string; // COURSE | SERVICE
  enrolledAt: string;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  completed: boolean;
  mentorName: string | null;
  mentorAssignmentStatus: string | null;
}

export async function getAdminEnrollments() {
  const wrapper = await apiFetch<ApiResponse<AdminEnrollmentRow[]>>(
    "/api/admin/enrollments"
  );
  return wrapper.data;
}

// Admin: every session request on the platform.
export interface AdminSessionRow {
  sessionId: number;
  studentName: string | null;
  studentEmail: string | null;
  mentorName: string | null;
  courseTitle: string | null;
  status: string;
  topic: string | null;
  requestedAt: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  meetingUrl: string | null;
}

export async function getAdminSessions() {
  const wrapper = await apiFetch<ApiResponse<AdminSessionRow[]>>(
    "/api/admin/sessions"
  );
  return wrapper.data;
}

export async function completeOnboarding(): Promise<UserDTO> {
  const wrapper = await apiFetch<ApiResponse<UserDTO>>(
    "/api/users/complete-onboarding",
    { method: "PUT" }
  );
  return wrapper.data;
}

// ─── Dashboard "next action" ────────────────────────────────────────

export type NextActionType =
  | "SESSION_SOON"
  | "ASSIGNMENT_DUE"
  | "CONTINUE_COURSE"
  | "START_COURSE"
  | "BROWSE_COURSES"
  | "ALL_COMPLETE";

export interface NextAction {
  type: NextActionType;
  courseId?: number | null;
  courseTitle?: string | null;
  mentorName?: string | null;
  scheduledAt?: string | null;
  meetingUrl?: string | null;
  assignmentId?: number | null;
  assignmentTitle?: string | null;
  dueDate?: string | null;
  nextLessonId?: number | null;
  nextLessonTitle?: string | null;
  moduleTitle?: string | null;
  progressPercent?: number | null;
  firstLessonId?: number | null;
  firstLessonTitle?: string | null;
  completedCount?: number | null;
  certificateCount?: number | null;
}

export interface DashboardSummary {
  enrolledCourses: Array<{
    id: number;
    title: string;
    type: string;
    progressPercent: number;
    completedLessons: number;
    totalLessons: number;
    lastAccessedAt: string | null;
  }>;
  upcomingSessions: Array<{
    sessionId: number;
    courseTitle: string | null;
    mentorName: string | null;
    scheduledAt: string;
    meetingUrl: string | null;
  }>;
  recentActivity: Array<{ type: string; description: string; timestamp: string }>;
  streakDays: number;
}

export async function getNextAction() {
  const wrapper = await apiFetch<ApiResponse<NextAction>>("/api/users/next-action");
  return wrapper.data;
}

export async function getDashboardSummary() {
  const wrapper = await apiFetch<ApiResponse<DashboardSummary>>("/api/users/dashboard-summary");
  return wrapper.data;
}

// ─── Course progress (enrolled student) ─────────────────────────────

export interface LessonProgress {
  lessonId: number;
  title: string;
  orderIndex: number;
  completed: boolean;
  videoPositionSec?: number;
}

export interface ModuleProgress {
  moduleId: number;
  moduleTitle: string;
  orderIndex: number;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  lessons: LessonProgress[];
}

export interface CourseProgress {
  courseId: number;
  enrollmentId: number;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  modules: ModuleProgress[];
  orphanLessons: LessonProgress[];
}

export async function getCourseProgress(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<CourseProgress>>(
    `/api/courses/${courseId}/progress`
  );
  return wrapper.data;
}

// Persists where the student paused — fire-and-forget on pause/unmount.
export async function saveLessonPosition(
  courseId: number | string,
  lessonId: number,
  videoPositionSec: number
) {
  return apiFetch<ApiResponse<unknown>>(
    `/api/users/progress/${courseId}`,
    {
      method: "PUT",
      body: JSON.stringify({
        lessonId,
        videoPositionSec: Math.max(0, Math.round(videoPositionSec)),
      }),
    }
  );
}

// ─── Courses ────────────────────────────────────────────────────────

export async function getCourses(params?: { level?: string; search?: string }) {
  const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
  const wrapper = await apiFetch<ApiResponse<unknown[]>>(`/api/courses${qs}`);
  return wrapper.data;
}

// ─── Services ──────────────────────────────────────────────────
// Services share the courses table — backend filters via ?type=SERVICE.
// CourseDTO returns a `type` field so the frontend can branch UI.

export async function getServices() {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>("/api/courses?type=SERVICE");
  return wrapper.data;
}

export async function getService(id: string | number) {
  // Same endpoint as getCourse — response carries `type` field
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/courses/${id}`);
  return wrapper.data;
}

export async function createService(data: {
  title: string;
  description?: string;
  shortDescription?: string;
  price?: number;
  category?: string;
  trainerId?: number;
}) {
  const wrapper = await apiFetch<ApiResponse<unknown>>("/api/courses", {
    method: "POST",
    body: JSON.stringify({ ...data, type: "SERVICE" }),
  });
  return wrapper.data;
}

export async function getInstructorStudents() {
  const wrapper = await apiFetch<ApiResponse<Array<{ studentName: string; email: string; courseTitle: string; enrolledAt: string }>>>("/api/instructor/students");
  return wrapper.data;
}

export async function getCourse(id: string) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/courses/${id}`);
  return wrapper.data;
}

// ─── Enrollments ────────────────────────────────────────────────────

export async function getMyCourses() {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>("/api/courses/my");
  return wrapper.data;
}

export async function publishCourse(courseId: number) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/courses/${courseId}/publish`, { method: "PUT" });
  return wrapper.data;
}

export async function unpublishCourse(courseId: number) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/courses/${courseId}/unpublish`, { method: "PUT" });
  return wrapper.data;
}

export async function enroll(courseId: number) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/enrollments/${courseId}`, { method: "POST" });
  return wrapper.data;
}

export async function getEnrollments() {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>("/api/enrollments");
  return wrapper.data;
}

export async function getAdminCourses() {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>("/api/admin/courses");
  return wrapper.data;
}

// ─── Admin ──────────────────────────────────────────────────────────

export async function getAnalytics() {
  const wrapper = await apiFetch<ApiResponse<unknown>>("/api/admin/analytics");
  return wrapper.data;
}

/**
 * Admin user list. {@code status} narrows to `active` / `inactive`
 * rows (server-side); omit for all users. Returns the raw payload
 * for legacy callers that still cast to `User[]`; new callers should
 * use {@link UserDTO}.
 */
export async function getUsers(status?: "active" | "inactive") {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const wrapper = await apiFetch<ApiResponse<unknown[]>>(`/api/admin/users${qs}`);
  return wrapper.data;
}

export interface AdminUserCounts {
  active: number;
  inactive: number;
  total: number;
}

export async function getUserCountsAsAdmin(): Promise<AdminUserCounts> {
  const wrapper = await apiFetch<ApiResponse<AdminUserCounts>>("/api/admin/users/counts");
  return wrapper.data ?? { active: 0, inactive: 0, total: 0 };
}

/**
 * Flips a soft-deactivated account back to active. Distinct from
 * {@link updateUserStatusAsAdmin} so the call site reads as the
 * specific admin verb the UI surfaces (the Reactivate button on the
 * Deactivated Users tab).
 */
export async function reactivateUserAsAdmin(userId: number | string) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(
    `/api/admin/users/${userId}/reactivate`,
    { method: "PUT" },
  );
  return wrapper.data;
}

// ─── Admin: Revenue ─────────────────────────────────────────────────

export interface RevenueSummary {
  totalRevenue: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  totalTransactions: number;
  avgOrderValue: number;
  topCoursesByRevenue: Array<{
    courseId: number;
    courseTitle: string;
    type: string;
    enrollments: number;
    revenue: number;
  }>;
}

export interface RevenueTransaction {
  id: number;
  studentName: string | null;
  studentEmail: string | null;
  amount: number;
  currency: string;
  status: string | null;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  createdAt: string | null;
}

export async function getRevenueSummary() {
  const wrapper = await apiFetch<ApiResponse<RevenueSummary>>("/api/admin/revenue/summary");
  return wrapper.data;
}

export async function getRevenueTransactions(params?: {
  from?: string;
  to?: string;
  status?: string;
}) {
  const qs = params
    ? "?" + new URLSearchParams(
        Object.entries(params).filter(([, v]) => v) as [string, string][]
      ).toString()
    : "";
  const wrapper = await apiFetch<ApiResponse<RevenueTransaction[]>>(
    `/api/admin/revenue/transactions${qs}`
  );
  return wrapper.data;
}

// ─── Admin: CSV Exports ─────────────────────────────────────────────
// CSV endpoints stream a text/csv body — bypass apiFetch (which expects
// JSON) and trigger a browser download via blob URL.

// ─── Announcements ──────────────────────────────────────────────────

export interface Announcement {
  id: number;
  title: string;
  message: string;
  type: "INFO" | "SUCCESS" | "WARNING";
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdByName: string | null;
}

export async function getActiveAnnouncements() {
  const wrapper = await apiFetch<ApiResponse<Announcement[]>>("/api/announcements/active");
  return wrapper.data;
}

export async function getAllAnnouncements() {
  const wrapper = await apiFetch<ApiResponse<Announcement[]>>("/api/announcements");
  return wrapper.data;
}

export async function createAnnouncement(data: {
  title: string;
  message: string;
  type: "INFO" | "SUCCESS" | "WARNING";
  isActive?: boolean;
  expiresAt?: string | null;
}) {
  const wrapper = await apiFetch<ApiResponse<Announcement>>("/api/announcements", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function updateAnnouncement(id: number, data: Partial<{
  title: string;
  message: string;
  type: "INFO" | "SUCCESS" | "WARNING";
  isActive: boolean;
  expiresAt: string | null;
}>) {
  const wrapper = await apiFetch<ApiResponse<Announcement>>(`/api/announcements/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function deleteAnnouncement(id: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/announcements/${id}`, { method: "DELETE" });
}

// ─── User Records (immutable audit log) ────────────────────────────

export interface UserRecord {
  id: number;
  userId: number;
  recordType: string;
  category: string;
  title: string;
  description: string;
  details: string | null;
  ipAddress: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  city: string | null;
  createdAt: string;
}

export interface UserRecordsPage {
  records: UserRecord[];
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  hasNext: boolean;
}

export interface UserRecordsSummary {
  total: number;
  byCategory: Record<string, number>;
}

export async function getUserRecords(
  userId: number | string,
  params: { category?: string; from?: string; to?: string; page?: number; size?: number } = {}
) {
  const qs = "?" + new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)])
  ).toString();
  const wrapper = await apiFetch<ApiResponse<UserRecordsPage>>(
    `/api/admin/users/${userId}/records${qs}`
  );
  return wrapper.data;
}

export async function getUserRecordsSummary(userId: number | string) {
  const wrapper = await apiFetch<ApiResponse<UserRecordsSummary>>(
    `/api/admin/users/${userId}/records/summary`
  );
  return wrapper.data;
}

export async function downloadUserRecordsCsv(userId: number | string, fileBaseName: string) {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const res = await fetch(`${BASE_URL}/api/admin/users/${userId}/records/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `${fileBaseName}_records_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Sales / Contact Sales ──────────────────────────────────────────

export interface SalesQuoteItem {
  item: string;
  price: number;
}

export interface SalesMessage {
  id: number;
  senderId: number | null;
  senderName: string | null;
  senderRole: string | null;
  message: string;
  attachmentUrl: string | null;
  isQuote: boolean;
  quotedPrice: number | null;
  /** Raw JSON string returned from the server; parse with parseQuoteItems(). */
  quotedItems: string | null;
  /** ACCEPTED / DECLINED / COUNTER_OFFERED, or null. */
  quoteStatus: string | null;
  createdAt: string;
}

export interface SalesInquiry {
  id: number;
  userId: number | null;
  studentName: string | null;
  studentEmail: string | null;
  courseId: number | null;
  courseTitle: string | null;
  courseType: string | null;
  instructorId: number | null;
  instructorName: string | null;
  status: "NEW" | "IN_PROGRESS" | "QUOTED" | "CONVERTED" | "CLOSED" | "LOST";
  subject: string;
  budgetRange: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderName: string | null;
  lastMessageAt: string | null;
  messages: SalesMessage[] | null;
}

export function parseQuoteItems(raw: string | null): SalesQuoteItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p: { item?: unknown; price?: unknown }) => ({
      item: typeof p.item === "string" ? p.item : "",
      price: Number(p.price ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function createSalesInquiry(data: {
  courseId: number;
  subject?: string;
  budgetRange?: string;
  message: string;
}) {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry>>("/api/sales/inquiries", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function getMySalesInquiries() {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry[]>>("/api/sales/inquiries/my");
  return wrapper.data;
}

export async function getSalesInquiry(id: number) {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry>>(`/api/sales/inquiries/${id}`);
  return wrapper.data;
}

export async function postSalesMessage(id: number, message: string) {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry>>(
    `/api/sales/inquiries/${id}/messages`,
    { method: "POST", body: JSON.stringify({ message }) }
  );
  return wrapper.data;
}

export async function acceptSalesQuote(inquiryId: number, messageId: number) {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry>>(
    `/api/sales/inquiries/${inquiryId}/accept-quote`,
    { method: "POST", body: JSON.stringify({ messageId }) }
  );
  return wrapper.data;
}

export async function declineSalesQuote(inquiryId: number, messageId: number) {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry>>(
    `/api/sales/inquiries/${inquiryId}/decline-quote`,
    { method: "POST", body: JSON.stringify({ messageId }) }
  );
  return wrapper.data;
}

export async function closeSalesInquiry(id: number, reason?: string) {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry>>(
    `/api/sales/inquiries/${id}/close`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? null }) }
  );
  return wrapper.data;
}

export async function getInstructorSalesInquiries() {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry[]>>("/api/sales/inquiries/instructor");
  return wrapper.data;
}

export async function sendSalesQuote(id: number, data: {
  message: string;
  quotedPrice: number;
  quotedItems: SalesQuoteItem[];
}) {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry>>(
    `/api/sales/inquiries/${id}/quote`,
    { method: "POST", body: JSON.stringify(data) }
  );
  return wrapper.data;
}

export async function getAdminSalesInquiries() {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry[]>>("/api/admin/sales/inquiries");
  return wrapper.data;
}

export async function getAdminSalesInquiry(id: number) {
  const wrapper = await apiFetch<ApiResponse<SalesInquiry>>(`/api/admin/sales/inquiries/${id}`);
  return wrapper.data;
}

export interface SalesStats {
  totalInquiries: number;
  newCount: number;
  inProgressCount: number;
  quotedCount: number;
  convertedCount: number;
  closedCount: number;
  lostCount: number;
  conversionRate: number;
}

export async function getAdminSalesStats() {
  const wrapper = await apiFetch<ApiResponse<SalesStats>>("/api/admin/sales/stats");
  return wrapper.data;
}

export async function downloadAdminCsv(kind: "users" | "enrollments" | "sessions" | "revenue") {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const res = await fetch(`${BASE_URL}/api/admin/export/${kind}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `spire-${kind}-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Instructor Requests ────────────────────────────────────────

export async function requestInstructor() {
  return apiFetch<ApiResponse<unknown>>("/api/users/request-instructor", { method: "POST" });
}

export async function getPendingInstructorRequests() {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>("/api/admin/instructor-requests");
  return wrapper.data;
}

export async function approveInstructor(requestId: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/admin/approve-instructor/${requestId}`, { method: "PUT" });
}

export async function rejectInstructor(requestId: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/admin/reject-instructor/${requestId}`, { method: "PUT" });
}

// ─── Course Management ──────────────────────────────────────────

export async function createCourse(data: { title: string; description?: string; shortDescription?: string; level?: string; price?: number; category?: string; tags?: string }) {
  const wrapper = await apiFetch<ApiResponse<unknown>>("/api/courses", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function updateCourse(id: number, data: Record<string, unknown>) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/courses/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function deleteCourse(id: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/courses/${id}`, { method: "DELETE" });
}

// Returns the list of items still missing before the course can be
// published — empty array means the course is ready.
export interface PublishReadiness {
  ready: boolean;
  missing: string[];
}

export async function getPublishReadiness(id: number) {
  const wrapper = await apiFetch<ApiResponse<PublishReadiness>>(
    `/api/courses/${id}/publish-readiness`
  );
  return wrapper.data;
}

// Multipart upload — bypass apiFetch (which sets Content-Type: JSON)
// and let the browser set the multipart boundary itself.
export async function uploadCourseThumbnail(courseId: number, file: File) {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/api/courses/${courseId}/thumbnail`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || "Thumbnail upload failed");
  }
  const wrapper = await res.json();
  return wrapper.data as { thumbnailUrl: string };
}

// ─── Cloudinary direct upload signature (instructor bulk upload) ──

export interface CloudinarySignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

export async function getCloudinarySignature() {
  const wrapper = await apiFetch<ApiResponse<CloudinarySignature>>(
    "/api/instructor/cloudinary-signature"
  );
  return wrapper.data;
}

// ─── Lessons ────────────────────────────────────────────────────

export async function getCourseLessons(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>(`/api/courses/${courseId}/lessons`);
  return wrapper.data;
}

export async function createLesson(
  courseId: number | string,
  data: {
    title: string;
    description?: string;
    videoUrl?: string;
    orderIndex?: number;
    durationMinutes?: number;
    isFree?: boolean;
    /** Optional — attaches the lesson to a module on creation. */
    moduleId?: number;
  }
) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/courses/${courseId}/lessons`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function reorderLessons(lessonIds: number[]) {
  return apiFetch<ApiResponse<unknown>>("/api/lessons/reorder", {
    method: "PUT",
    body: JSON.stringify({ lessonIds }),
  });
}

export async function clearLessonVideo(lessonId: number) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(
    `/api/lessons/${lessonId}/video`,
    { method: "DELETE" }
  );
  return wrapper.data;
}

export async function updateLesson(lessonId: number, data: Record<string, unknown>) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/lessons/${lessonId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function deleteLesson(lessonId: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/lessons/${lessonId}`, { method: "DELETE" });
}

// ─── Modules ────────────────────────────────────────────────────

export async function getCourseModules(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<import("./types").Module[]>>(
    `/api/courses/${courseId}/modules`
  );
  return wrapper.data;
}

export async function createModule(
  courseId: number | string,
  data: { title: string; description?: string; orderIndex?: number }
) {
  const wrapper = await apiFetch<ApiResponse<import("./types").Module>>(
    `/api/courses/${courseId}/modules`,
    { method: "POST", body: JSON.stringify(data) }
  );
  return wrapper.data;
}

export async function updateModule(
  moduleId: number,
  data: { title?: string; description?: string; orderIndex?: number }
) {
  const wrapper = await apiFetch<ApiResponse<import("./types").Module>>(
    `/api/modules/${moduleId}`,
    { method: "PUT", body: JSON.stringify(data) }
  );
  return wrapper.data;
}

export async function deleteModule(moduleId: number) {
  return apiFetch<ApiResponse<unknown>>(
    `/api/modules/${moduleId}`,
    { method: "DELETE" }
  );
}

export async function completeLesson(lessonId: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/lessons/${lessonId}/complete`, { method: "POST" });
}

// ─── Assignments ────────────────────────────────────────────────

export async function getCourseAssignments(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>(`/api/courses/${courseId}/assignments`);
  return wrapper.data;
}

export async function submitAssignment(assignmentId: number, content: string) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/assignments/${assignmentId}/submit`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  return wrapper.data;
}

// ─── Quiz ───────────────────────────────────────────────────────
// NOTE: the old A/B/C/D fixed-option model was migrated to a
// normalized QuizOption / QuizAnswer schema. The legacy helpers
// (getLessonQuiz, addQuizQuestion with optionA/B/C/D) are removed
// alongside the QuizSection / QuizBuilder components that called
// them. New flow lives below.

export type QuizQuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "MULTI_SELECT";

export interface QuizOption {
  id: number;
  optionText: string;
  /** Server omits this on the student-taking view. */
  isCorrect?: boolean | null;
  orderIndex: number;
}

export interface QuizQuestion {
  id: number;
  questionText: string;
  questionType: QuizQuestionType;
  points: number;
  orderIndex: number;
  /** Only present for instructor view or after a student submits. */
  explanation?: string | null;
  options: QuizOption[];
}

export interface Quiz {
  id: number;
  courseId: number | null;
  moduleId: number | null;
  lessonId: number | null;
  moduleTitle: string | null;
  lessonTitle: string | null;
  title: string;
  description: string | null;
  passThreshold: number;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  isActive: boolean;
  orderIndex: number;
  questions?: QuizQuestion[];
  questionCount?: number;
  attemptCount?: number;
  bestScorePercent?: number | null;
}

export interface QuizQuestionResult {
  questionId: number;
  correct: boolean;
  selectedOptionIds: number[];
  correctOptionIds: number[];
  explanation: string | null;
}

export interface QuizSubmitResult {
  attemptId: number;
  scorePercent: number;
  passed: boolean;
  passThreshold: number;
  attemptNumber: number;
  attemptsRemaining: number | null;
  totalQuestions: number;
  correctCount: number;
  timeTakenSeconds: number | null;
  results: QuizQuestionResult[];
}

export interface QuizAttemptSummary {
  id: number;
  quizId: number;
  scorePercent: number | null;
  passed: boolean | null;
  attemptNumber: number | null;
  startedAt: string | null;
  completedAt: string | null;
  timeTakenSeconds: number | null;
}

// ─── Instructor: quiz CRUD ──────────────────────────────────────

export async function createInstructorQuiz(data: {
  courseId: number;
  moduleId?: number | null;
  lessonId?: number | null;
  title: string;
  description?: string;
  passThreshold?: number;
  timeLimitMinutes?: number | null;
  maxAttempts?: number | null;
  isActive?: boolean;
}) {
  const wrapper = await apiFetch<ApiResponse<Quiz>>("/api/instructor/quizzes", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function listInstructorQuizzes(courseId: number) {
  const wrapper = await apiFetch<ApiResponse<Quiz[]>>(
    `/api/instructor/courses/${courseId}/quizzes`
  );
  return wrapper.data;
}

export async function getInstructorQuiz(quizId: number) {
  const wrapper = await apiFetch<ApiResponse<Quiz>>(`/api/instructor/quizzes/${quizId}`);
  return wrapper.data;
}

export async function updateInstructorQuiz(quizId: number, data: Partial<{
  title: string;
  description: string;
  passThreshold: number;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  isActive: boolean;
  orderIndex: number;
}>) {
  const wrapper = await apiFetch<ApiResponse<Quiz>>(`/api/instructor/quizzes/${quizId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function deleteInstructorQuiz(quizId: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/instructor/quizzes/${quizId}`, {
    method: "DELETE",
  });
}

export async function addQuizQuestion(quizId: number, data: {
  questionText: string;
  questionType: QuizQuestionType;
  points?: number;
  explanation?: string;
  options: { optionText: string; isCorrect: boolean }[];
}) {
  const wrapper = await apiFetch<ApiResponse<QuizQuestion>>(
    `/api/instructor/quizzes/${quizId}/questions`,
    { method: "POST", body: JSON.stringify(data) }
  );
  return wrapper.data;
}

export async function updateQuizQuestion(questionId: number, data: {
  questionText: string;
  questionType: QuizQuestionType;
  points?: number;
  explanation?: string;
  options: { optionText: string; isCorrect: boolean }[];
}) {
  const wrapper = await apiFetch<ApiResponse<QuizQuestion>>(
    `/api/instructor/questions/${questionId}`,
    { method: "PUT", body: JSON.stringify(data) }
  );
  return wrapper.data;
}

export async function deleteQuizQuestion(questionId: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/instructor/questions/${questionId}`, {
    method: "DELETE",
  });
}

export async function reorderQuizQuestions(quizId: number, questionIds: number[]) {
  return apiFetch<ApiResponse<unknown>>(
    `/api/instructor/quizzes/${quizId}/questions/reorder`,
    { method: "PUT", body: JSON.stringify({ questionIds }) }
  );
}

// ─── Student: take quiz ─────────────────────────────────────────

export async function listCourseQuizzes(courseId: number) {
  const wrapper = await apiFetch<ApiResponse<Quiz[]>>(`/api/courses/${courseId}/quizzes`);
  return wrapper.data;
}

export async function getQuizForStudent(quizId: number) {
  const wrapper = await apiFetch<ApiResponse<Quiz>>(`/api/quizzes/${quizId}`);
  return wrapper.data;
}

export async function submitQuiz(
  quizId: number,
  data: {
    answers: { questionId: number; selectedOptionIds: number[] }[];
    timeTakenSeconds?: number;
  }
) {
  const wrapper = await apiFetch<ApiResponse<QuizSubmitResult>>(
    `/api/quizzes/${quizId}/submit`,
    { method: "POST", body: JSON.stringify(data) }
  );
  return wrapper.data;
}

export async function getMyQuizAttempts(quizId: number) {
  const wrapper = await apiFetch<ApiResponse<QuizAttemptSummary[]>>(
    `/api/quizzes/${quizId}/attempts`
  );
  return wrapper.data;
}

// ─── Certificates ───────────────────────────────────────────────

export interface CertificateDTO {
  id: number;
  certificateId: string;
  certificateUrl: string;
  issuedAt: string;
  finalScore: number | null;
  courseTitle: string;
  verificationUrl: string;
}

export interface CertificateCheck {
  exists: boolean;
  certificateId?: string;
  certificateUrl?: string;
  issuedAt?: string;
  finalScore?: number | null;
  courseTitle?: string;
  verificationUrl?: string;
}

export interface CertificateListItem {
  id: number;
  certificateId: string;
  courseId: number;
  courseTitle: string;
  certificateUrl: string;
  issuedAt: string;
  finalScore: number | null;
}

export interface CertificateVerification {
  valid: boolean;
  certificateId?: string;
  studentName?: string;
  courseTitle?: string;
  issuedAt?: string;
  finalScore?: number | null;
}

export async function generateCertificate(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<CertificateDTO>>(
    `/api/certificates/generate/${courseId}`,
    { method: "POST" }
  );
  return wrapper.data;
}

export async function checkCertificate(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<CertificateCheck>>(
    `/api/certificates/check/${courseId}`
  );
  return wrapper.data;
}

export async function getMyCertificates() {
  const wrapper = await apiFetch<ApiResponse<CertificateListItem[]>>("/api/certificates/my");
  return wrapper.data;
}

/**
 * Public verification — no auth required. Used by the /verify/[id]
 * page so anyone with a certificate ID can confirm its authenticity.
 *
 * Tries the cleaner /api/verify/{number} endpoint first, then falls
 * back to the legacy /api/certificates/verify/{id} path. The fallback
 * matters during a deploy window where the frontend (Vercel) ships
 * before the backend (Railway) — without it, the verify page would
 * render "Not found" for valid certs while the new endpoint is still
 * 404'ing on the old backend.
 *
 * Network/auth errors propagate; only a 404 on the new path triggers
 * the fallback (and even that is treated as a soft retry, not an error).
 */
export async function verifyCertificate(certificateId: string) {
  const enc = encodeURIComponent(certificateId);
  try {
    const wrapper = await apiFetch<ApiResponse<CertificateVerification>>(
      `/api/verify/${enc}`,
    );
    return wrapper.data;
  } catch {
    const wrapper = await apiFetch<ApiResponse<CertificateVerification>>(
      `/api/certificates/verify/${enc}`,
    );
    return wrapper.data;
  }
}

// ─── Video Upload ───────────────────────────────────────────────

export async function uploadLessonVideo(lessonId: number, file: File) {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/api/lessons/${lessonId}/upload-video`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,  // No Content-Type header — browser sets multipart boundary
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || "Upload failed");
  }

  const wrapper = await res.json();
  return wrapper.data as { lessonId: number; videoUrl: string; durationMinutes: number | null };
}

/**
 * Same upload as {@link uploadLessonVideo} but uses XMLHttpRequest so
 * the caller can render a real percent-complete progress bar and
 * cancel mid-upload. fetch() can't track upload progress in the
 * browser today.
 */
export interface VideoUploadHandle {
  /** Resolves with { videoUrl, durationMinutes } on success. */
  promise: Promise<{ lessonId: number; videoUrl: string; durationMinutes: number | null }>;
  /** Aborts the in-flight upload. */
  cancel: () => void;
}

export function uploadLessonVideoWithProgress(
  lessonId: number,
  file: File,
  onProgress?: (percent: number) => void,
): VideoUploadHandle {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const xhr = new XMLHttpRequest();

  const promise = new Promise<{ lessonId: number; videoUrl: string; durationMinutes: number | null }>(
    (resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);

      xhr.open("POST", `${BASE_URL}/api/lessons/${lessonId}/upload-video`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const wrapper = JSON.parse(xhr.responseText);
            resolve(wrapper.data);
          } catch {
            reject(new Error("Malformed upload response"));
          }
        } else {
          let message = `Upload failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText);
            if (body.message) message = body.message;
          } catch { /* keep default */ }
          reject(new Error(message));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
      xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

      xhr.send(formData);
    }
  );

  return { promise, cancel: () => xhr.abort() };
}

// ─── Tasks ──────────────────────────────────────────────────────

export async function getLessonTasks(lessonId: number) {
  const wrapper = await apiFetch<ApiResponse<Array<{
    id: number; title: string; description: string; instruction: string;
    type: string; orderIndex: number; unlocked: boolean; completed: boolean;
  }>>>(`/api/lessons/${lessonId}/tasks`);
  return wrapper.data;
}

export async function completeTask(taskId: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/tasks/${taskId}/complete`, { method: "POST" });
}

// ─── Cart ──────────────────────────────────────────────────────────

export async function addToCart(courseId: number) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/cart/${courseId}`, { method: "POST" });
  return wrapper.data;
}

export async function getCart() {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>("/api/cart");
  return wrapper.data;
}

export async function removeFromCart(courseId: number) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/cart/${courseId}`, { method: "DELETE" });
  return wrapper.data;
}

export async function clearCart() {
  const wrapper = await apiFetch<ApiResponse<unknown>>("/api/cart", { method: "DELETE" });
  return wrapper.data;
}

export interface CheckoutResult {
  subtotal: number;
  discount: number;
  total: number;
  couponCode: string | null;
}

export async function checkoutCart(couponCode?: string | null) {
  const wrapper = await apiFetch<ApiResponse<CheckoutResult>>("/api/cart/checkout", {
    method: "POST",
    body: JSON.stringify({ couponCode: couponCode ?? null }),
  });
  return wrapper.data;
}

// ─── Coupons ────────────────────────────────────────────────────────

export interface Coupon {
  id: number;
  code: string;
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CouponValidation {
  code: string;
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  cartTotal: number;
  discountAmount: number;
  finalTotal: number;
}

export async function validateCoupon(code: string, cartTotal: number) {
  const wrapper = await apiFetch<ApiResponse<CouponValidation>>("/api/coupons/validate", {
    method: "POST",
    body: JSON.stringify({ code, cartTotal }),
  });
  return wrapper.data;
}

export async function getAllCoupons() {
  const wrapper = await apiFetch<ApiResponse<Coupon[]>>("/api/admin/coupons");
  return wrapper.data;
}

export async function createCoupon(data: {
  code: string;
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  minOrderAmount?: number | null;
  maxUses?: number | null;
  expiresAt?: string | null;
  isActive?: boolean;
}) {
  const wrapper = await apiFetch<ApiResponse<Coupon>>("/api/admin/coupons", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function updateCoupon(id: number, data: Partial<{
  discountType: "PERCENT" | "FLAT";
  discountValue: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
}>) {
  const wrapper = await apiFetch<ApiResponse<Coupon>>(`/api/admin/coupons/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function deleteCoupon(id: number) {
  return apiFetch<ApiResponse<unknown>>(`/api/admin/coupons/${id}`, { method: "DELETE" });
}

// ─── Mentorship ────────────────────────────────────────────────

export async function getMyMentorForCourse(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<import("./types").MentorInfo>>(
    `/api/enrollments/courses/${courseId}/mentor`
  );
  return wrapper.data;
}

export async function requestSession(enrollmentId: number, topic: string) {
  const wrapper = await apiFetch<ApiResponse<import("./types").SessionRequest>>(
    "/api/sessions",
    { method: "POST", body: JSON.stringify({ enrollmentId, topic }) }
  );
  return wrapper.data;
}

export async function getMySessions() {
  const wrapper = await apiFetch<ApiResponse<import("./types").SessionRequest[]>>(
    "/api/sessions/my"
  );
  return wrapper.data;
}

export async function cancelSession(sessionId: number) {
  const wrapper = await apiFetch<ApiResponse<import("./types").SessionRequest>>(
    `/api/sessions/${sessionId}/cancel`,
    { method: "PUT" }
  );
  return wrapper.data;
}

// Get all session requests for this mentor (pending, accepted, etc.)
export async function getMentorSessions() {
  const wrapper = await apiFetch<ApiResponse<import("./types").SessionRequest[]>>(
    "/api/sessions/mentor"
  );
  return wrapper.data;
}

// Get only pending requests (mentor's inbox)
export async function getMentorPendingRequests() {
  const wrapper = await apiFetch<ApiResponse<import("./types").SessionRequest[]>>(
    "/api/sessions/mentor/pending"
  );
  return wrapper.data;
}

// Accept a session request (set time + meeting URL)
export async function acceptSessionRequest(
  sessionId: number,
  scheduledAt: string,
  meetingUrl: string
) {
  const wrapper = await apiFetch<ApiResponse<import("./types").SessionRequest>>(
    `/api/sessions/${sessionId}/accept`,
    {
      method: "PUT",
      body: JSON.stringify({ scheduledAt, meetingUrl }),
    }
  );
  return wrapper.data;
}

// Mark session as completed
export async function completeSession(sessionId: number) {
  const wrapper = await apiFetch<ApiResponse<import("./types").SessionRequest>>(
    `/api/sessions/${sessionId}/complete`,
    { method: "PUT" }
  );
  return wrapper.data;
}

// ─── Mentor Pools (admin) ──────────────────────────────────────

export interface CourseMentor {
  id: number;
  courseId: number;
  mentorId: number;
  mentorName: string;
  mentorEmail: string;
  activeStudentCount: number;
  maxStudents: number;
  isActive: boolean;
}

export async function getCourseMentors(courseId: number) {
  const wrapper = await apiFetch<ApiResponse<CourseMentor[]>>(
    `/api/admin/courses/${courseId}/mentors`
  );
  return wrapper.data;
}

export async function addMentorToCourse(courseId: number, userId: number) {
  const wrapper = await apiFetch<ApiResponse<CourseMentor>>(
    `/api/admin/courses/${courseId}/mentors`,
    { method: "POST", body: JSON.stringify({ userId }) }
  );
  return wrapper.data;
}

export async function removeMentorFromCourse(courseId: number, userId: number) {
  return apiFetch<ApiResponse<unknown>>(
    `/api/admin/courses/${courseId}/mentors/${userId}`,
    { method: "DELETE" }
  );
}
