package com.spire.backend.service;

import com.spire.backend.dto.CourseDTO;
import com.spire.backend.dto.InstructorStudentDTO;
import com.spire.backend.entity.Course;
import com.spire.backend.entity.Enrollment;
import com.spire.backend.entity.User;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.repository.CourseRepository;
import com.spire.backend.repository.EnrollmentRepository;
import com.spire.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class EnrollmentService {

    private final EnrollmentRepository enrollmentRepository;
    private final UserRepository userRepository;
    private final CourseRepository courseRepository;
    private final MentorAssignmentService mentorAssignmentService;
    private final RecordService recordService;

    @Transactional
    public void enrollUser(Long userId, Long courseId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        // Admin is a supervisor, not a student. Block enrollment so the
        // role can't accidentally land in courses/cart flows. Admins use
        // the preview path on /admin to view content without enrolling.
        if (user.getRole() != null && "ADMIN".equals(user.getRole().getName())) {
            throw new IllegalArgumentException(
                    "Admin accounts cannot enroll in courses. Use admin preview to view content.");
        }

        if (enrollmentRepository.existsByUserIdAndCourseId(userId, courseId)) {
            throw new IllegalArgumentException("Already enrolled in this course");
        }

        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new ResourceNotFoundException("Course", "id", courseId));

        Enrollment enrollment = Enrollment.builder()
                .user(user)
                .course(course)
                .build();

        Enrollment savedEnrollment = enrollmentRepository.save(enrollment);

        course.setEnrolledCount(course.getEnrolledCount() + 1);
        courseRepository.save(course);

        // Mentorship applies to type=COURSE only. Services (Resume Prep,
        // Interview Training, etc.) are self-paced video walk-throughs and
        // don't get a mentor assigned — see PRODUCT.md.
        if (!course.isService()) {
            // Auto-assign a mentor from the course's pool. If no mentor has
            // capacity, this still creates an assignment row — with mentor=null
            // and status=PENDING_ASSIGNMENT — so admin can fix the pool later.
            mentorAssignmentService.assignMentor(savedEnrollment);
        }

        Map<String, Object> details = new HashMap<>();
        details.put("courseId", course.getId());
        details.put("courseTitle", course.getTitle());
        details.put("courseType", course.getType());
        details.put("amountPaid", course.getPrice());
        details.put("isFree", Boolean.TRUE.equals(course.getIsFree()));
        recordService.record(userId, "COURSE_ENROLLED", RecordService.Category.LEARNING,
                "Enrolled in " + course.getTitle(),
                "Enrolled in course '" + course.getTitle() + "' (ID: " + course.getId() + ")",
                details);
    }

    public List<CourseDTO> getUserEnrollments(Long userId) {
        return enrollmentRepository.findByUserId(userId).stream()
                .map(e -> CourseDTO.from(e.getCourse()))
                .collect(Collectors.toList());
    }

    public List<InstructorStudentDTO> getStudentsForInstructor(Long instructorId) {
        return enrollmentRepository.findByInstructorId(instructorId).stream()
                .map(InstructorStudentDTO::from)
                .collect(Collectors.toList());
    }

    public boolean isEnrolled(Long userId, Long courseId) {
        return enrollmentRepository.existsByUserIdAndCourseId(userId, courseId);
    }
}
