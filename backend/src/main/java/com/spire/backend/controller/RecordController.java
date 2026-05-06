package com.spire.backend.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.dto.UserRecordDTO;
import com.spire.backend.entity.User;
import com.spire.backend.entity.UserRecord;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.repository.UserRecordRepository;
import com.spire.backend.repository.UserRepository;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.PrintWriter;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Admin-only access to the user_records audit log.
 *
 * - GET /api/admin/users/{userId}/records — paginated, filterable
 * - GET /api/admin/users/{userId}/records/summary — counts per category
 * - GET /api/admin/users/{userId}/records/download — full CSV export
 * - GET /api/admin/records/search — cross-user investigation
 */
@RestController
@RequiredArgsConstructor
public class RecordController {

    private final UserRecordRepository recordRepository;
    private final UserRepository userRepository;

    private static final DateTimeFormatter CSV_TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @GetMapping("/api/admin/users/{userId}/records")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getUserRecords(
            @PathVariable Long userId,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200));
        String cat = (category == null || category.isBlank() || "ALL".equalsIgnoreCase(category))
                ? null : category.toUpperCase();
        LocalDateTime fromTs = from != null ? from.atStartOfDay() : null;
        LocalDateTime toTs = to != null ? to.atTime(23, 59, 59) : null;

        Page<UserRecord> result = recordRepository.findForUser(userId, cat, fromTs, toTs, pageable);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("records", result.getContent().stream().map(UserRecordDTO::from).toList());
        body.put("page", result.getNumber());
        body.put("size", result.getSize());
        body.put("totalPages", result.getTotalPages());
        body.put("totalElements", result.getTotalElements());
        body.put("hasNext", result.hasNext());
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @GetMapping("/api/admin/users/{userId}/records/summary")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getUserRecordsSummary(@PathVariable Long userId) {
        Map<String, Long> counts = new LinkedHashMap<>();
        // Seed all categories so the UI can render zero badges without
        // having to know the full category list itself.
        for (String c : new String[] { "ACCOUNT", "LEARNING", "ASSESSMENT", "MENTORSHIP",
                                       "PAYMENT", "CERTIFICATE", "SECURITY" }) {
            counts.put(c, 0L);
        }
        for (Object[] row : recordRepository.countByCategoryForUser(userId)) {
            String cat = row[0] != null ? row[0].toString() : "OTHER";
            Long n = row[1] != null ? ((Number) row[1]).longValue() : 0L;
            counts.put(cat, n);
        }
        long total = recordRepository.countByUserId(userId);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("total", total);
        body.put("byCategory", counts);
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    @GetMapping("/api/admin/users/{userId}/records/download")
    @PreAuthorize("hasRole('ADMIN')")
    public void downloadUserRecords(@PathVariable Long userId,
                                     HttpServletResponse response) throws IOException {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        String safeName = user.getEmail() != null
                ? user.getEmail().replaceAll("[^a-zA-Z0-9._-]", "_")
                : "user-" + userId;
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition",
                "attachment; filename=" + safeName + "_complete_records_" + LocalDate.now() + ".csv");

        PrintWriter w = response.getWriter();
        w.println("Date,Time,Category,Type,Title,Description,IP,Device,Browser,OS,City");
        for (UserRecord r : recordRepository.findByUserIdOrderByCreatedAtDesc(userId)) {
            String ts = r.getCreatedAt() != null ? r.getCreatedAt().format(CSV_TS) : "";
            String date = ts.length() >= 10 ? ts.substring(0, 10) : ts;
            String time = ts.length() >= 19 ? ts.substring(11, 19) : "";
            w.println(String.join(",",
                    csv(date),
                    csv(time),
                    csv(r.getCategory()),
                    csv(r.getRecordType()),
                    csv(r.getTitle()),
                    csv(r.getDescription()),
                    csv(r.getIpAddress()),
                    csv(r.getDeviceType()),
                    csv(r.getBrowser()),
                    csv(r.getOs()),
                    csv(r.getCity())));
        }
        w.flush();
    }

    @GetMapping("/api/admin/records/search")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Map<String, Object>>> searchAcrossUsers(
            @RequestParam String query,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {

        Pageable pageable = PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), 200));
        LocalDateTime fromTs = from != null ? from.atStartOfDay() : null;
        LocalDateTime toTs = to != null ? to.atTime(23, 59, 59) : null;

        Page<UserRecord> result = recordRepository.searchAll(query.trim(), fromTs, toTs, pageable);
        List<UserRecordDTO> dtos = result.getContent().stream().map(UserRecordDTO::from).toList();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("records", dtos);
        body.put("page", result.getNumber());
        body.put("totalElements", result.getTotalElements());
        body.put("hasNext", result.hasNext());
        return ResponseEntity.ok(ApiResponse.success(body));
    }

    private String csv(Object value) {
        if (value == null) return "";
        String s = value.toString();
        boolean needsQuote = s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r");
        if (needsQuote) {
            s = "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }
}
