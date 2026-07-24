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
    private String phone;
    private String location;
    private Boolean isActive;
    private Boolean instructorApproved;
    private Boolean emailVerified;
    private LocalDateTime createdAt;
    private LocalDateTime deactivatedAt;

    public static UserDTO from(User user) {
        return UserDTO.builder()
                .id(user.getId())
                .email(user.getEmail())
                .fullName(user.getFullName())
                .role(user.getRole().getName())
                .avatarUrl(user.getAvatarUrl())
                .bio(user.getBio())
                .phone(user.getPhone())
                .location(user.getLocation())
                .isActive(Boolean.TRUE.equals(user.getIsActive()))
                .instructorApproved(Boolean.TRUE.equals(user.getInstructorApproved()))
                .emailVerified(Boolean.TRUE.equals(user.getEmailVerified()))
                .createdAt(user.getCreatedAt())
                .deactivatedAt(user.getDeactivatedAt())
                .build();
    }
}
