package com.spire.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Body of POST /api/participants/enroll. Extends the legacy
 * RegisterRequest payload with the additional participant-lifecycle
 * fields (phone, location, availability, technology, experience
 * level). The fullName / email / password trio mirrors
 * {@link RegisterRequest} so the user creation path can re-use the
 * same hashing + OTP primitives without duplication.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ParticipantEnrollRequest {

    @NotBlank(message = "Full legal name is required")
    private String fullName;

    @NotBlank(message = "Email is required")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "Phone is required")
    private String phone;

    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    private String password;

    private String location;

    @NotBlank(message = "Availability is required")
    private String availability;

    @NotBlank(message = "Technology / skillset is required")
    private String selectedTechnology;

    @NotBlank(message = "Target experience level is required")
    private String targetExperienceLevel;
}
