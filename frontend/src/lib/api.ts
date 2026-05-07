const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

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
  createdAt?: string | null;
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

export async function register(data: { fullName: string; email: string; password: string }): Promise<AuthResponse> {
  const wrapper = await apiFetch<ApiResponse<AuthResponse>>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export async function login(data: { email: string; password: string }): Promise<AuthResponse> {
  const wrapper = await apiFetch<ApiResponse<AuthResponse>>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return wrapper.data;
}

export function logout() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  return Promise.resolve();
}

// ─── User / Profile ─────────────────────────────────────────────────

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

export async function getUsers() {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>("/api/admin/users");
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

export async function generateCertificate(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<{ id: number; certificateUrl: string; issuedAt: string }>>(`/api/certificates/generate/${courseId}`, { method: "POST" });
  return wrapper.data;
}

export async function checkCertificate(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<{ exists: boolean; certificateUrl?: string; issuedAt?: string }>>(`/api/certificates/check/${courseId}`);
  return wrapper.data;
}

export async function getMyCertificates() {
  const wrapper = await apiFetch<ApiResponse<Array<{ id: number; courseTitle: string; certificateUrl: string; issuedAt: string }>>>("/api/certificates/my");
  return wrapper.data;
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
