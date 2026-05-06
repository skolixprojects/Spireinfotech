package com.spire.backend.repository;

import com.spire.backend.entity.Enrollment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;


@Repository
public interface EnrollmentRepository extends JpaRepository<Enrollment, Long> {

    List<Enrollment> findByUserId(Long userId);

    Optional<Enrollment> findByUserIdAndCourseId(Long userId, Long courseId);

    boolean existsByUserIdAndCourseId(Long userId, Long courseId);

    long countByCourseId(Long courseId);

    @Query("""
            SELECT e FROM Enrollment e
            JOIN FETCH e.course c
            JOIN FETCH e.user u
            WHERE c.instructor.id = :instructorId
            ORDER BY e.enrolledAt DESC
            """)
    List<Enrollment> findByInstructorId(@Param("instructorId") Long instructorId);
}
