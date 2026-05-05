package com.spire.backend.dto;

import com.spire.backend.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;

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

    // Per-day contribution map for the GitHub-style heatmap.
    // Keys are ISO local dates (YYYY-MM-DD); values are lessons completed
    // that day. Only days with activity are included; the frontend
    // fills in zeroes for the missing dates.
    private Map<String, Integer> contributions;

    public static ProfileDTO from(
            User user,
            int enrolledCoursesCount,
            int completedCoursesCount,
            int certificatesCount,
            int streakDays,
            int totalLessonsCompleted,
            int totalLearningMinutes,
            LocalDateTime lastActiveAt,
            Map<String, Integer> contributions) {
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
                .contributions(contributions)
                .build();
    }
}
