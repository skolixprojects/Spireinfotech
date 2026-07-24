package com.spire.backend.dto;

import com.spire.backend.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

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
    private Boolean isActive;
    private Boolean instructorApproved;
    private Boolean emailVerified;
    private LocalDateTime deactivatedAt;

    private Integer enrolledCoursesCount;
    private Integer completedCoursesCount;
    private Integer certificatesCount;

    private Integer streakDays;
    private Integer totalLessonsCompleted;
    private Integer totalLearningMinutes;
    private LocalDateTime lastActiveAt;

    private Map<String, Integer> contributions;

    private List<CourseSummary> enrolledCourses;
    private List<CertSummary> certificates;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CourseSummary {
        private Long id;
        private String title;
        private String type;
        private Integer progressPercent;
        private Integer completedLessons;
        private Integer totalLessons;
        private Boolean completed;
        private LocalDateTime enrolledAt;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CertSummary {
        private Long id;
        private String certificateId;
        private String courseTitle;
        private String certificateUrl;
        private LocalDateTime issuedAt;
    }

    public static ProfileDTO from(
            User user,
            int enrolledCoursesCount,
            int completedCoursesCount,
            int certificatesCount,
            int streakDays,
            int totalLessonsCompleted,
            int totalLearningMinutes,
            LocalDateTime lastActiveAt,
            Map<String, Integer> contributions,
            List<CourseSummary> enrolledCourses,
            List<CertSummary> certificates) {
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
                .isActive(Boolean.TRUE.equals(user.getIsActive()))
                .instructorApproved(Boolean.TRUE.equals(user.getInstructorApproved()))
                .emailVerified(Boolean.TRUE.equals(user.getEmailVerified()))
                .deactivatedAt(user.getDeactivatedAt())
                .enrolledCoursesCount(enrolledCoursesCount)
                .completedCoursesCount(completedCoursesCount)
                .certificatesCount(certificatesCount)
                .streakDays(streakDays)
                .totalLessonsCompleted(totalLessonsCompleted)
                .totalLearningMinutes(totalLearningMinutes)
                .lastActiveAt(lastActiveAt)
                .contributions(contributions)
                .enrolledCourses(enrolledCourses)
                .certificates(certificates)
                .build();
    }
}
