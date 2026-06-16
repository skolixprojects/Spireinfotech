package com.spire.backend.mail.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;

/**
 * Storage seam for mail attachments. In production (Cloudinary
 * configured) it uses Cloudinary raw upload under
 * {@code spire/mail/attachments} with a unique, non-overwriting
 * public_id and reads bytes back server-side. When Cloudinary is NOT
 * configured (local dev / test) it falls back to a local temp directory
 * so the upload/download/proxy flow is fully exercisable without
 * credentials. Only the opaque storage key is persisted by callers; the
 * raw delivery URL is never returned to clients (downloads stream
 * through the authenticated proxy).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MailBlobStore {

    private static final String FOLDER = "spire/mail/attachments";
    // Stored keys carry an explicit backend tag so reads/deletes route to the
    // SAME backend that wrote them — independent of Cloudinary's folder mode and
    // of whether the cloud config happens to be set at read time.
    private static final String CLOUD_PREFIX = "cld:";
    private static final String LOCAL_PREFIX = "loc:";

    /** Signals a blob that is gone/unreadable; carries NO path or key. */
    public static class BlobNotFoundException extends RuntimeException {
        public BlobNotFoundException() { super("Attachment blob not found."); }
    }

    private final Cloudinary cloudinary;

    // HttpClient is thread-safe and meant to be reused — one instance gives
    // connection pooling and a single selector thread for the service lifetime.
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10)).build();

    @Value("${cloudinary.cloud-name:}")
    private String cloudName;

    private boolean cloudConfigured() {
        return cloudName != null && !cloudName.isBlank();
    }

    private boolean isCloudKey(String storageKey) {
        return storageKey != null && storageKey.startsWith(CLOUD_PREFIX);
    }

    /** Strip the backend tag, leaving the raw Cloudinary public_id or local file id. */
    private static String rawKey(String storageKey) {
        if (storageKey == null) return "";
        if (storageKey.startsWith(CLOUD_PREFIX) || storageKey.startsWith(LOCAL_PREFIX)) {
            return storageKey.substring(4);
        }
        return storageKey;
    }

    /** Store bytes, return the opaque, backend-tagged storage key. */
    public String store(byte[] data) {
        String id = "mail_" + UUID.randomUUID();
        try {
            if (cloudConfigured()) {
                @SuppressWarnings("unchecked")
                var result = (java.util.Map<String, Object>) cloudinary.uploader().upload(data, ObjectUtils.asMap(
                        "resource_type", "raw",
                        "folder", FOLDER,
                        "public_id", id,
                        "use_filename", false,
                        "unique_filename", false,
                        "overwrite", false,
                        "timeout", 30000));
                // Persist EXACTLY the public_id Cloudinary assigned (folder-prefixed or
                // not, per the account's folder mode) so fetch/delete round-trip.
                return CLOUD_PREFIX + result.get("public_id");
            }
            Path file = localDir().resolve(id);
            Files.createDirectories(file.getParent());
            Files.write(file, data);
            return LOCAL_PREFIX + id;
        } catch (Exception e) {
            // Full detail to the server log only — never echo path/key/URL to the client.
            log.error("Attachment store failed: {}", e.toString(), e);
            throw new IllegalStateException("Attachment storage is temporarily unavailable.");
        }
    }

    /**
     * Fetch the bytes for a stored key (server-side; never exposes the URL).
     * Routes on the key's backend tag, so a write/read pair is consistent even
     * if the Cloudinary config is toggled between them. Throws
     * {@link BlobNotFoundException} when the blob is gone; all other failures
     * throw a non-leaking message.
     */
    public byte[] fetch(String storageKey) {
        try {
            if (isCloudKey(storageKey)) {
                String url = cloudinary.url().resourceType("raw").secure(true).generate(rawKey(storageKey));
                HttpResponse<byte[]> resp = httpClient.send(
                        HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(30)).GET().build(),
                        HttpResponse.BodyHandlers.ofByteArray());
                if (resp.statusCode() == 404) {
                    throw new BlobNotFoundException();
                }
                if (resp.statusCode() != 200) {
                    log.warn("Cloudinary fetch returned {} for an attachment", resp.statusCode());
                    throw new IllegalStateException("Attachment is temporarily unavailable.");
                }
                return resp.body();
            }
            // Local fallback — resolve only the last path segment so the key can
            // never escape the directory.
            Path file = localDir().resolve(lastSegment(rawKey(storageKey)));
            if (!Files.exists(file)) {
                throw new BlobNotFoundException();
            }
            return Files.readAllBytes(file);
        } catch (BlobNotFoundException | IllegalStateException e) {
            throw e;
        } catch (java.nio.file.NoSuchFileException e) {
            throw new BlobNotFoundException();
        } catch (Exception e) {
            log.error("Attachment fetch failed: {}", e.toString(), e);
            throw new IllegalStateException("Attachment is temporarily unavailable.");
        }
    }

    /** Best-effort blob deletion (failure is logged, never fatal). */
    public void delete(String storageKey) {
        try {
            if (isCloudKey(storageKey)) {
                cloudinary.uploader().destroy(rawKey(storageKey), ObjectUtils.asMap("resource_type", "raw", "invalidate", true));
            } else {
                Files.deleteIfExists(localDir().resolve(lastSegment(rawKey(storageKey))));
            }
        } catch (Exception e) {
            log.warn("Failed to delete attachment blob: {}", e.toString());
        }
    }

    private static String lastSegment(String key) {
        if (key == null) return "";
        int slash = key.lastIndexOf('/');
        return slash < 0 ? key : key.substring(slash + 1);
    }

    private Path localDir() {
        return Path.of(System.getProperty("java.io.tmpdir"), "spire-mail-attachments");
    }
}
