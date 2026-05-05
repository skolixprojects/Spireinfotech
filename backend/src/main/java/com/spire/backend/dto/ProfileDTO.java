package com.spire.backend.dto;

import com.spire.backend.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Extended user profile shown on /profile. Superset of UserDTO —
 * keeps the same field names (avatarUrl, role, etc.) so callers
 * that consumed UserDTO (auth-context) continue to work, and adds
 * profile-page extras: phone, location, createdAt, plus learning
 * stats (enrolled / completed / certificate counts).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProfileDTO {

    private Long id;
    private String email;
    private String fullName;
    private String role;
    private String avatarUrl;
    private String bio;
    private String phone;
    private String location;
    private LocalDateTime createdAt;
    private Boolean onboardingCompleted;

    private Integer enrolledCoursesCount;
    private Integer completedCoursesCount;
    private Integer certificatesCount;

    // Activity analytics — surfaced beside the profile card on /profile.
    private Integer streakDays;
    private Integer totalLessonsCompleted;
    private Integer totalLearningMinutes;
    private LocalDateTime lastActiveAt;

    public static ProfileDTO from(
            User user,
            int enrolledCoursesCount,
            int completedCoursesCount,
            int certificatesCount,
            int streakDays,
            int totalLessonsCompleted,
            int totalLearningMinutes,
            LocalDateTime lastActiveAt) {
        return ProfileDTO.builder()
                .id(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .role(user.getRole().getName())
                .avatarUrl(user.getAvatarUrl())
                .bio(user.getBio())
                .phone(user.getPhone())
                .location(user.getLocation())
                .createdAt(user.getCreatedAt())
                .onboardingCompleted(Boolean.TRUE.equals(user.getOnboardingCompleted()))
                .enrolledCoursesCount(enrolledCoursesCount)
                .completedCoursesCount(completedCoursesCount)
                .certificatesCount(certificatesCount)
                .streakDays(streakDays)
                .totalLessonsCompleted(totalLessonsCompleted)
                .totalLearningMinutes(totalLearningMinutes)
                .lastActiveAt(lastActiveAt)
                .build();
    }
}
