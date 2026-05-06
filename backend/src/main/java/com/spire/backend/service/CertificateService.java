package com.spire.backend.service;

import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfWriter;
import com.spire.backend.entity.*;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.repository.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.awt.Color;
import java.io.File;
import java.io.FileOutputStream;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class CertificateService {

    private final CertificateRepository certificateRepository;
    private final CourseRepository courseRepository;
    private final UserRepository userRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final LessonRepository lessonRepository;
    private final ProgressRepository progressRepository;
    private final QuizAttemptRepository quizAttemptRepository;
    private final QuizRepository quizRepository;
    private final SubmissionRepository submissionRepository;
    private final AssignmentRepository assignmentRepository;
    private final RecordService recordService;

    @Transactional
    public Certificate generateCertificate(Long courseId, Long userId) {
        // 1. Check enrollment
        if (!enrollmentRepository.existsByUserIdAndCourseId(userId, courseId)) {
            throw new UnauthorizedException("You must be enrolled in this course");
        }

        Course course = courseRepository.findById(courseId)
                .orElseThrow(() -> new ResourceNotFoundException("Course", "id", courseId));

        // Services don't grant certificates (PRODUCT.md). Reject early so the
        // duplicate-check below doesn't accidentally return a stale cert from
        // before this guard existed.
        if (course.isService()) {
            throw new IllegalArgumentException("Services do not include certificates");
        }

        // 2. Check duplicate
        if (certificateRepository.existsByUserIdAndCourseId(userId, courseId)) {
            return certificateRepository.findByUserIdAndCourseId(userId, courseId).get();
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        // 3. Verify all lessons completed
        List<Lesson> lessons = lessonRepository.findByCourseIdOrderByOrderIndex(courseId);
        long completedLessons = progressRepository.countCompletedLessons(userId, courseId);
        if (!lessons.isEmpty() && completedLessons < lessons.size()) {
            throw new IllegalArgumentException(
                    String.format("Complete all lessons first (%d/%d done)", completedLessons, lessons.size()));
        }

        // 4. Verify all quizzes passed (≥60%)
        for (Lesson lesson : lessons) {
            if (quizRepository.existsByLessonId(lesson.getId())) {
                Quiz quiz = quizRepository.findByLessonId(lesson.getId()).get();
                var attempt = quizAttemptRepository.findByQuizIdAndUserId(quiz.getId(), userId);
                if (attempt.isEmpty()) {
                    throw new IllegalArgumentException("Complete the quiz for lesson: " + lesson.getTitle());
                }
                if (attempt.get().getPercentage() < 60) {
                    throw new IllegalArgumentException("Pass the quiz for lesson: " + lesson.getTitle() + " (minimum 60%)");
                }
            }
        }

        // 5. Verify final course assignment submitted (if exists)
        List<Assignment> courseAssignments = assignmentRepository.findByCourseIdOrderByCreatedAtDesc(courseId)
                .stream().filter(a -> a.getAssignmentType() == Assignment.AssignmentType.COURSE).toList();
        for (Assignment assignment : courseAssignments) {
            if (!submissionRepository.existsByAssignmentIdAndStudentId(assignment.getId(), userId)) {
                throw new IllegalArgumentException("Submit the course assignment: " + assignment.getTitle());
            }
        }

        // 6. Generate certificate record first (to get certificateId)
        Certificate certificate = Certificate.builder()
                .user(user)
                .course(course)
                .certificateUrl("") // will be set after PDF generation
                .build();
        certificate = certificateRepository.save(certificate);

        // 7. Generate PDF with certificate ID
        String dirPath = String.format("certificates/%d", courseId);
        String fileName = String.format("%d-%d.pdf", userId, System.currentTimeMillis());
        String filePath = dirPath + "/" + fileName;

        new File(dirPath).mkdirs();
        generatePdf(filePath, user.getFullName(), course.getTitle(), certificate.getCertificateId());

        // 8. Update URL
        certificate.setCertificateUrl("/api/certificates/download/" + courseId + "/" + fileName);

        Certificate saved = certificateRepository.save(certificate);

        recordService.record(userId, "CERTIFICATE_GENERATED", RecordService.Category.CERTIFICATE,
                "Certificate earned: " + course.getTitle(),
                "Certificate " + saved.getCertificateId() + " issued for '" + course.getTitle() + "'",
                java.util.Map.of(
                        "certificateId", saved.getCertificateId(),
                        "courseId", course.getId(),
                        "courseTitle", course.getTitle(),
                        "verificationUrl", "spire-infotech.com/certificate/" + saved.getCertificateId()
                ));

        log.info("Certificate generated for user {} course {}", userId, courseId);
        return saved;
    }

    public Certificate getCertificate(Long courseId, Long userId) {
        return certificateRepository.findByUserIdAndCourseId(userId, courseId)
                .orElse(null);
    }

    public List<Certificate> getUserCertificates(Long userId) {
        return certificateRepository.findByUserId(userId);
    }

    public java.util.Optional<Certificate> findByCertificateId(String certificateId) {
        return certificateRepository.findByCertificateId(certificateId);
    }

    private void generatePdf(String filePath, String studentName, String courseTitle, String certId) {
        try {
            Document doc = new Document(PageSize.A4.rotate());
            PdfWriter.getInstance(doc, new FileOutputStream(filePath));
            doc.open();

            // Border
            doc.add(new Paragraph("\n\n\n"));

            // Title
            Font titleFont = new Font(Font.HELVETICA, 36, Font.BOLD, new Color(27, 67, 50));
            Paragraph title = new Paragraph("CERTIFICATE OF COMPLETION", titleFont);
            title.setAlignment(Element.ALIGN_CENTER);
            doc.add(title);

            doc.add(new Paragraph("\n"));

            // Subtitle
            Font subFont = new Font(Font.HELVETICA, 14, Font.NORMAL, new Color(100, 100, 100));
            Paragraph sub = new Paragraph("This is to certify that", subFont);
            sub.setAlignment(Element.ALIGN_CENTER);
            doc.add(sub);

            doc.add(new Paragraph("\n"));

            // Student name
            Font nameFont = new Font(Font.HELVETICA, 28, Font.BOLD, new Color(27, 67, 50));
            Paragraph name = new Paragraph(studentName, nameFont);
            name.setAlignment(Element.ALIGN_CENTER);
            doc.add(name);

            doc.add(new Paragraph("\n"));

            // Course text
            Paragraph courseText = new Paragraph("has successfully completed the course", subFont);
            courseText.setAlignment(Element.ALIGN_CENTER);
            doc.add(courseText);

            doc.add(new Paragraph("\n"));

            // Course title
            Font courseFont = new Font(Font.HELVETICA, 22, Font.BOLD, new Color(82, 183, 136));
            Paragraph course = new Paragraph(courseTitle, courseFont);
            course.setAlignment(Element.ALIGN_CENTER);
            doc.add(course);

            doc.add(new Paragraph("\n\n"));

            // Date
            String dateStr = LocalDate.now().format(DateTimeFormatter.ofPattern("MMMM dd, yyyy"));
            Font dateFont = new Font(Font.HELVETICA, 12, Font.NORMAL, new Color(120, 120, 120));
            Paragraph date = new Paragraph("Issued on: " + dateStr, dateFont);
            date.setAlignment(Element.ALIGN_CENTER);
            doc.add(date);

            doc.add(new Paragraph("\n"));

            // Platform
            Font platformFont = new Font(Font.HELVETICA, 10, Font.ITALIC, new Color(150, 150, 150));
            Paragraph platform = new Paragraph("Spire Platform", platformFont);
            platform.setAlignment(Element.ALIGN_CENTER);
            doc.add(platform);

            doc.add(new Paragraph("\n"));

            // Certificate ID + verification
            Font idFont = new Font(Font.HELVETICA, 8, Font.NORMAL, new Color(180, 180, 180));
            Paragraph certIdP = new Paragraph("Certificate ID: " + certId, idFont);
            certIdP.setAlignment(Element.ALIGN_CENTER);
            doc.add(certIdP);

            Paragraph verify = new Paragraph("Verify at: spire-infotech.com/certificate/" + certId, idFont);
            verify.setAlignment(Element.ALIGN_CENTER);
            doc.add(verify);

            doc.close();
            log.info("PDF generated: {}", filePath);
        } catch (Exception e) {
            log.error("Failed to generate PDF: {}", e.getMessage(), e);
            throw new RuntimeException("Failed to generate certificate PDF");
        }
    }
}
