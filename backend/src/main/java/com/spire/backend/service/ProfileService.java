package com.spire.backend.service;

import com.spire.backend.dto.ProfileDTO;
import com.spire.backend.dto.UpdateProfileRequest;
import com.spire.backend.entity.Enrollment;
import com.spire.backend.entity.Progress;
import com.spire.backend.entity.User;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.repository.CertificateRepository;
import com.spire.backend.repository.EnrollmentRepository;
import com.spire.backend.repository.LessonRepository;
import com.spire.backend.repository.ProgressRepository;
import com.spire.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * Profile read + write. Reuses existing repositories for the learning-
 * stat counts. Update validates length but does not change email or role.
 */
@Service
@RequiredArgsConstructor
public class ProfileService {

    private final UserRepository userRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final LessonRepository lessonRepository;
    private final ProgressRepository progressRepository;
    private final CertificateRepository certificateRepository;

    @Transactional(readOnly = true)
    public ProfileDTO getProfile(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        List<Enrollment> enrollments = enrollmentRepository.findByUserId(userId);
        int enrolled = enrollments.size();

        int completed = 0;
        for (Enrollment e : enrollments) {
            Long courseId = e.getCourse().getId();
            int totalLessons = lessonRepository.findByCourseIdOrderByOrderIndex(courseId).size();
            long completedLessons = progressRepository.countCompletedLessons(userId, courseId);
            if (totalLessons > 0 && completedLessons >= totalLessons) {
                completed++;
            }
        }

        int certificates = certificateRepository.findByUserId(userId).size();

        // Activity analytics — derived from the user's per-lesson Progress rows.
        List<Progress> rows = progressRepository.findByUserId(userId);
        int streakDays = rows.stream()
                .map(Progress::getStreakDays)
                .filter(Objects::nonNull)
                .mapToInt(Integer::intValue)
                .max()
                .orElse(0);
        int totalLessonsCompleted = (int) rows.stream()
                .filter(p -> Boolean.TRUE.equals(p.getCompleted()))
                .count();
        int totalLearningMinutes = rows.stream()
                .filter(p -> Boolean.TRUE.equals(p.getCompleted()))
                .filter(p -> p.getLesson() != null && p.getLesson().getDurationMinutes() != null)
                .mapToInt(p -> p.getLesson().getDurationMinutes())
                .sum();
        LocalDateTime lastActiveAt = rows.stream()
                .map(Progress::getLastAccessed)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);

        // Daily contribution map for the heatmap. Counts lesson-completions
        // per day over the last 365 days.
        LocalDate cutoff = LocalDate.now().minusDays(365);
        Map<String, Integer> contributions = rows.stream()
                .filter(p -> Boolean.TRUE.equals(p.getCompleted()))
                .filter(p -> p.getLastAccessed() != null)
                .filter(p -> !p.getLastAccessed().toLocalDate().isBefore(cutoff))
                .collect(Collectors.groupingBy(
                        p -> p.getLastAccessed().toLocalDate().toString(),
                        Collectors.summingInt(p -> 1)));

        return ProfileDTO.from(
                user, enrolled, completed, certificates,
                streakDays, totalLessonsCompleted, totalLearningMinutes,
                lastActiveAt, contributions);
    }

    @Transactional
    public ProfileDTO updateProfile(Long userId, UpdateProfileRequest dto) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        // fullName: required, never overwritten with blank
        if (dto.getFullName() != null && !dto.getFullName().isBlank()) {
            user.setFullName(dto.getFullName().trim());
        }
        // avatarUrl: optional. Treat empty string as "clear" → null.
        if (dto.getAvatarUrl() != null) {
            user.setAvatarUrl(emptyToNull(dto.getAvatarUrl()));
        }
        // Optional fields — empty string clears them, null leaves alone.
        if (dto.getBio() != null) user.setBio(emptyToNull(dto.getBio()));
        if (dto.getPhone() != null) user.setPhone(emptyToNull(dto.getPhone().trim()));
        if (dto.getLocation() != null) user.setLocation(emptyToNull(dto.getLocation().trim()));

        userRepository.save(user);
        return getProfile(userId); // refetch with counts
    }

    private static String emptyToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }
}
