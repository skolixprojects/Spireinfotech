package com.spire.backend.service;

import com.spire.backend.dto.QuestionRequest;
import com.spire.backend.dto.QuizRequest;
import com.spire.backend.dto.QuizSubmitRequest;
import com.spire.backend.entity.*;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class QuizService {

    private final QuizRepository quizRepository;
    private final QuestionRepository questionRepository;
    private final QuizAttemptRepository attemptRepository;
    private final LessonRepository lessonRepository;
    private final EnrollmentRepository enrollmentRepository;
    private final UserRepository userRepository;
    private final RecordService recordService;

    /** A score at or above this fraction is treated as a "pass". */
    private static final int PASS_PERCENT = 60;

    @Transactional
    public Quiz createQuiz(Long lessonId, QuizRequest dto, Long userId, boolean isAdmin) {
        Lesson lesson = lessonRepository.findById(lessonId)
                .orElseThrow(() -> new ResourceNotFoundException("Lesson", "id", lessonId));

        if (!isAdmin && !lesson.getCourse().getInstructor().getId().equals(userId)) {
            throw new UnauthorizedException("You can only create quizzes for your own course lessons");
        }

        if (quizRepository.existsByLessonId(lessonId)) {
            throw new IllegalArgumentException("This lesson already has a quiz");
        }

        Quiz quiz = Quiz.builder()
                .title(dto.getTitle())
                .lesson(lesson)
                .build();

        return quizRepository.save(quiz);
    }

    @Transactional
    public Question addQuestion(Long quizId, QuestionRequest dto, Long userId, boolean isAdmin) {
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new ResourceNotFoundException("Quiz", "id", quizId));

        if (!isAdmin && !quiz.getLesson().getCourse().getInstructor().getId().equals(userId)) {
            throw new UnauthorizedException("You can only add questions to your own quizzes");
        }

        Question question = Question.builder()
                .quiz(quiz)
                .questionText(dto.getQuestionText())
                .optionA(dto.getOptionA())
                .optionB(dto.getOptionB())
                .optionC(dto.getOptionC())
                .optionD(dto.getOptionD())
                .correctAnswer(dto.getCorrectAnswer().toUpperCase())
                .build();

        return questionRepository.save(question);
    }

    public Quiz getQuizForLesson(Long lessonId) {
        return quizRepository.findByLessonId(lessonId)
                .orElseThrow(() -> new ResourceNotFoundException("Quiz not found for lesson " + lessonId));
    }

    public List<Question> getQuestions(Long quizId) {
        return questionRepository.findByQuizId(quizId);
    }

    @Transactional
    public QuizAttempt submitQuiz(Long quizId, QuizSubmitRequest dto, Long userId) {
        Quiz quiz = quizRepository.findById(quizId)
                .orElseThrow(() -> new ResourceNotFoundException("Quiz", "id", quizId));

        Long courseId = quiz.getLesson().getCourse().getId();
        if (!enrollmentRepository.existsByUserIdAndCourseId(userId, courseId)) {
            throw new UnauthorizedException("You must be enrolled to take quizzes");
        }

        if (attemptRepository.existsByQuizIdAndUserId(quizId, userId)) {
            throw new IllegalArgumentException("You have already attempted this quiz");
        }

        List<Question> questions = questionRepository.findByQuizId(quizId);
        if (questions.isEmpty()) {
            throw new IllegalArgumentException("This quiz has no questions");
        }

        Map<Long, String> answers = dto.getAnswers();
        int correct = 0;
        for (Question q : questions) {
            String submitted = answers.get(q.getId());
            if (submitted != null && submitted.equalsIgnoreCase(q.getCorrectAnswer())) {
                correct++;
            }
        }

        int total = questions.size();
        int percentage = (int) Math.round((correct * 100.0) / total);

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        QuizAttempt attempt = QuizAttempt.builder()
                .quiz(quiz)
                .user(user)
                .score(correct)
                .totalQuestions(total)
                .percentage(percentage)
                .build();

        QuizAttempt saved = attemptRepository.save(attempt);

        boolean passed = percentage >= PASS_PERCENT;
        Map<String, Object> details = new HashMap<>();
        details.put("quizId", quiz.getId());
        details.put("quizTitle", quiz.getTitle());
        details.put("courseTitle", quiz.getLesson().getCourse().getTitle());
        details.put("score", percentage);
        details.put("passed", passed);
        details.put("totalQuestions", total);
        details.put("correctAnswers", correct);
        details.put("wrongAnswers", total - correct);
        recordService.record(userId, "QUIZ_ATTEMPTED", RecordService.Category.ASSESSMENT,
                "Attempted quiz: " + quiz.getTitle(),
                "Scored " + percentage + "% (" + (passed ? "passed" : "failed") + ") on '" + quiz.getTitle() + "'",
                details);
        if (passed) {
            recordService.record(userId, "QUIZ_PASSED", RecordService.Category.ASSESSMENT,
                    "Passed quiz: " + quiz.getTitle(),
                    "Passed '" + quiz.getTitle() + "' with " + percentage + "%",
                    details);
        }

        return saved;
    }
}
