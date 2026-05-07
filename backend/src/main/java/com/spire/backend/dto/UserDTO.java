package com.spire.backend.dto;

import com.spire.backend.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;


@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserDTO {

    private Long id;
    private String email;
    private String fullName;
    private String role;
    private String avatarUrl;
    private String bio;
    private Boolean onboardingCompleted;
    private Boolean isActive;
    private Boolean instructorApproved;
    /**
     * True after the user has completed the OTP-confirmed Terms of
     * Service flow. The frontend reads this to decide whether to
     * route post-login users to /agreement.
     */
    private Boolean agreementAccepted;
    private LocalDateTime createdAt;

    public static UserDTO from(User user) {
        return UserDTO.builder()
                .id(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .role(user.getRole().getName())
                .avatarUrl(user.getAvatarUrl())
                .bio(user.getBio())
                .onboardingCompleted(Boolean.TRUE.equals(user.getOnboardingCompleted()))
                .isActive(Boolean.TRUE.equals(user.getIsActive()))
                .instructorApproved(Boolean.TRUE.equals(user.getInstructorApproved()))
                .agreementAccepted(Boolean.TRUE.equals(user.getAgreementAccepted()))
                .createdAt(user.getCreatedAt())
                .build();
    }
}
