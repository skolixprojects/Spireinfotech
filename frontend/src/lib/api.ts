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

// ─── Lessons ────────────────────────────────────────────────────

export async function getCourseLessons(courseId: number | string) {
  const wrapper = await apiFetch<ApiResponse<unknown[]>>(`/api/courses/${courseId}/lessons`);
  return wrapper.data;
}

export async function createLesson(courseId: number | string, data: { title: string; description?: string; videoUrl?: string; orderIndex?: number; durationMinutes?: number; isFree?: boolean }) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/courses/${courseId}/lessons`, {
    method: "POST",
    body: JSON.stringify(data),
  });
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

export async function getLessonQuiz(lessonId: number) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/lessons/${lessonId}/quiz`);
  return wrapper.data;
}

export async function submitQuiz(quizId: number, answers: Record<number, string>) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/quizzes/${quizId}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
  return wrapper.data;
}

export async function createQuiz(lessonId: number, title: string) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/lessons/${lessonId}/quiz`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return wrapper.data;
}

export async function addQuizQuestion(quizId: number, data: { questionText: string; optionA: string; optionB: string; optionC?: string; optionD?: string; correctAnswer: string }) {
  const wrapper = await apiFetch<ApiResponse<unknown>>(`/api/quizzes/${quizId}/questions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
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
  return wrapper.data as { lessonId: number; videoUrl: string };
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

export async function checkoutCart() {
  const wrapper = await apiFetch<ApiResponse<unknown>>("/api/cart/checkout", { method: "POST" });
  return wrapper.data;
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
