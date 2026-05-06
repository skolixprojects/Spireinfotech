package com.spire.backend.service;

import com.spire.backend.dto.AdminEnrollmentRow;
import com.spire.backend.dto.AdminSessionRow;
import com.spire.backend.dto.UserDTO;
import com.spire.backend.entity.Enrollment;
import com.spire.backend.entity.MentorAssignment;
import com.spire.backend.entity.Role;
import com.spire.backend.entity.SessionRequest;
import com.spire.backend.entity.User;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final CourseRepository courseRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final LessonRepository lessonRepository;
    private final ProgressRepository progressRepository;
    private final CertificateRepository certificateRepository;
    private final SessionRequestRepository sessionRequestRepository;
    private final MentorAssignmentRepository mentorAssignmentRepository;

    /**
     * Platform-wide statistics powering the admin Overview tab.
     * Kept as a flat Map for easy frontend consumption.
     */
    public Map<String, Object> getAnalytics() {
        long totalStudents = countUsersWithRole("STUDENT");
        long totalInstructors = countUsersWithRole("INSTRUCTOR");
        long totalTrainers = countUsersWithRole("TRAINER");
        long totalAdmins = countUsersWithRole("ADMIN");

        long totalCoursesOnly = courseRepository.findAll().stream()
                .filter(c -> !"SERVICE".equals(c.getType()))
                .count();
        long totalServices = courseRepository.findAll().stream()
                .filter(c -> "SERVICE".equals(c.getType()))
                .count();

        long totalCompletions = countCompletedEnrollments();

        List<SessionRequest> allSessions = sessionRequestRepository.findAll();
        long sessionPending = allSessions.stream()
                .filter(s -> "PENDING".equals(s.getStatus())).count();
        long sessionAccepted = allSessions.stream()
                .filter(s -> "ACCEPTED".equals(s.getStatus())).count();
        long sessionCompleted = allSessions.stream()
                .filter(s -> "COMPLETED".equals(s.getStatus())).count();

        LocalDateTime now = LocalDateTime.now();
        long active7 = countActiveUsersSince(now.minusDays(7));
        long active30 = countActiveUsersSince(now.minusDays(30));

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalUsers", userRepository.count());
        stats.put("totalStudents", totalStudents);
        stats.put("totalInstructors", totalInstructors);
        stats.put("totalTrainers", totalTrainers);
        stats.put("totalAdmins", totalAdmins);
        stats.put("totalCourses", totalCoursesOnly);
        stats.put("totalServices", totalServices);
        stats.put("totalEnrollments", enrollmentRepository.count());
        stats.put("totalCompletions", totalCompletions);
        stats.put("totalCertificates", certificateRepository.count());
        stats.put("totalSessionRequests", (long) allSessions.size());
        stats.put("totalSessionsPending", sessionPending);
        stats.put("totalSessionsAccepted", sessionAccepted);
        stats.put("totalSessionsCompleted", sessionCompleted);
        stats.put("activeUsersLast7Days", active7);
        stats.put("activeUsersLast30Days", active30);
        return stats;
    }

    private long countUsersWithRole(String roleName) {
        return userRepository.findAll().stream()
                .filter(u -> u.getRole() != null && roleName.equals(u.getRole().getName()))
                .count();
    }

    private long countCompletedEnrollments() {
        long completed = 0;
        for (Enrollment e : enrollmentRepository.findAll()) {
            Long courseId = e.getCourse().getId();
            int total = lessonRepository.findByCourseIdOrderByOrderIndex(courseId).size();
            long done = progressRepository.countCompletedLessons(e.getUser().getId(), courseId);
            if (total > 0 && done >= total) completed++;
        }
        return completed;
    }

    private long countActiveUsersSince(LocalDateTime cutoff) {
        return progressRepository.findAll().stream()
                .filter(p -> p.getLastAccessed() != null
                        && p.getLastAccessed().isAfter(cutoff))
                .map(p -> p.getUser() != null ? p.getUser().getId() : null)
                .filter(Objects::nonNull)
                .distinct()
                .count();
    }

    public List<UserDTO> getAllUsers() {
        return userRepository.findAll().stream()
                .map(UserDTO::from)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<AdminEnrollmentRow> getAllEnrollments() {
        return enrollmentRepository.findAll().stream()
                .map(this::toEnrollmentRow)
                .sorted(Comparator.comparing(
                        AdminEnrollmentRow::getEnrolledAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());
    }

    private AdminEnrollmentRow toEnrollmentRow(Enrollment e) {
        Long userId = e.getUser().getId();
        Long courseId = e.getCourse().getId();
        int total = lessonRepository.findByCourseIdOrderByOrderIndex(courseId).size();
        long done = progressRepository.countCompletedLessons(userId, courseId);
        boolean isComplete = total > 0 && done >= total;
        int pct = total > 0 ? (int) Math.round(100.0 * done / total) : 0;

        String mentorName = null;
        String assignmentStatus = null;
        if (!"SERVICE".equals(e.getCourse().getType())) {
            MentorAssignment ma = mentorAssignmentRepository.findByEnrollmentId(e.getId()).orElse(null);
            if (ma != null) {
                assignmentStatus = ma.getStatus();
                if (ma.getMentor() != null) mentorName = ma.getMentor().getFullName();
            }
        }

        return AdminEnrollmentRow.builder()
                .enrollmentId(e.getId())
                .userId(userId)
                .studentName(e.getUser().getFullName())
                .studentEmail(e.getUser().getEmail())
                .courseId(courseId)
                .courseTitle(e.getCourse().getTitle())
                .courseType(e.getCourse().getType())
                .enrolledAt(e.getEnrolledAt())
                .progressPercent(pct)
                .completedLessons((int) done)
                .totalLessons(total)
                .completed(isComplete)
                .mentorName(mentorName)
                .mentorAssignmentStatus(assignmentStatus)
                .build();
    }

    @Transactional(readOnly = true)
    public List<AdminSessionRow> getAllSessions() {
        return sessionRequestRepository.findAll().stream()
                .map(this::toSessionRow)
                .sorted(Comparator.comparing(
                        AdminSessionRow::getRequestedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .collect(Collectors.toList());
    }

    private AdminSessionRow toSessionRow(SessionRequest s) {
        MentorAssignment ma = s.getMentorAssignment();
        String mentorName = ma != null && ma.getMentor() != null
                ? ma.getMentor().getFullName() : null;
        String courseTitle = ma != null && ma.getEnrollment() != null
                && ma.getEnrollment().getCourse() != null
                ? ma.getEnrollment().getCourse().getTitle() : null;

        return AdminSessionRow.builder()
                .sessionId(s.getId())
                .studentName(s.getRequestedBy() != null ? s.getRequestedBy().getFullName() : null)
                .studentEmail(s.getRequestedBy() != null ? s.getRequestedBy().getEmail() : null)
                .mentorName(mentorName)
                .courseTitle(courseTitle)
                .status(s.getStatus())
                .topic(s.getTopic())
                .requestedAt(s.getRequestedAt())
                .scheduledAt(s.getScheduledAt())
                .completedAt(s.getCompletedAt())
                .meetingUrl(s.getMeetingUrl())
                .build();
    }

    @Transactional
    public UserDTO updateUserRole(Long userId, String roleName) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        String normalizedRole = roleName.toUpperCase();

        // SECURITY: Cannot directly assign INSTRUCTOR via this endpoint.
        // Use the Instructor Approval System instead (approve-instructor).
        if ("INSTRUCTOR".equals(normalizedRole)) {
            throw new IllegalArgumentException(
                    "Cannot assign INSTRUCTOR role directly. Use the instructor approval system.");
        }

        Role role = roleRepository.findByName(normalizedRole)
                .orElseThrow(() -> new IllegalArgumentException("Invalid role: " + roleName));

        if ("INSTRUCTOR".equals(user.getRole().getName()) && !"INSTRUCTOR".equals(normalizedRole)) {
            user.setInstructorApproved(false);
        }

        user.setRole(role);
        return UserDTO.from(userRepository.save(user));
    }

    /**
     * Activate or deactivate a user account. An admin can't toggle
     * their own account to avoid lockout.
     */
    @Transactional
    public UserDTO updateUserStatus(Long userId, Long currentAdminId, boolean active) {
        if (userId.equals(currentAdminId)) {
            throw new IllegalArgumentException("You can't change your own account status.");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        user.setIsActive(active);
        return UserDTO.from(userRepository.save(user));
    }
}
