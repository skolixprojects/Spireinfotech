package com.spire.backend.mail.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

/**
 * Storage seam for mail attachments. In production (an S3 bucket configured
 * via {@code mail.s3.bucket}) it stores objects in a private S3 bucket and
 * reads the bytes back server-side. When no bucket is configured (local dev /
 * test) it falls back to a local temp directory so the upload/download/proxy
 * flow is fully exercisable without AWS credentials.
 *
 * <p>Only the opaque, backend-tagged storage key is persisted by callers
 * ({@code s3:<objectKey>} or {@code loc:<id>}); the raw object URL is never
 * generated or returned to clients — downloads stream through the
 * authenticated, walled proxy ({@code GET /api/mail/attachments/&#123;id&#125;}).
 * Reads/deletes dispatch on the key's tag, so objects always resolve against
 * the backend that wrote them.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MailBlobStore {

    // Backend tags persisted as part of the storage key.
    private static final String S3_PREFIX = "s3:";
    private static final String LOCAL_PREFIX = "loc:";
    // S3 object-key namespace within the bucket. The human filename lives in
    // the DB; object keys are opaque UUIDs.
    private static final String S3_KEY_PREFIX = "mail/attachments/";

    /** Signals a blob that is gone/unreadable; carries NO path or key. */
    public static class BlobNotFoundException extends RuntimeException {
        public BlobNotFoundException() { super("Attachment blob not found."); }
    }

    // Empty in dev (no bean created when mail.s3.bucket is unset).
    private final ObjectProvider<S3Client> s3ClientProvider;

    @Value("${mail.s3.bucket:}")
    private String s3Bucket;

    private boolean s3Configured() {
        return s3Bucket != null && !s3Bucket.isBlank();
    }

    private S3Client s3() {
        S3Client client = s3ClientProvider.getIfAvailable();
        if (client == null) {
            // s3Configured() implies the bean exists; this guards a misconfig.
            throw new IllegalStateException("Attachment storage is temporarily unavailable.");
        }
        return client;
    }

    private static boolean isS3Key(String storageKey) {
        return storageKey != null && storageKey.startsWith(S3_PREFIX);
    }

    /** Strip the backend tag, leaving the raw S3 object key or local file id. */
    private static String rawKey(String storageKey) {
        if (storageKey == null) return "";
        int colon = storageKey.indexOf(':');
        return colon >= 0 ? storageKey.substring(colon + 1) : storageKey;
    }

    /** Store bytes, return the opaque, backend-tagged storage key. */
    public String store(byte[] data) {
        try {
            if (s3Configured()) {
                String objectKey = S3_KEY_PREFIX + "mail_" + UUID.randomUUID();
                s3().putObject(
                        PutObjectRequest.builder().bucket(s3Bucket).key(objectKey).build(),
                        RequestBody.fromBytes(data));
                return S3_PREFIX + objectKey;
            }
            String id = "mail_" + UUID.randomUUID();
            Path file = localDir().resolve(id);
            Files.createDirectories(file.getParent());
            Files.write(file, data);
            return LOCAL_PREFIX + id;
        } catch (Exception e) {
            // Full detail to the server log only — never echo path/key/bucket to the client.
            log.error("Attachment store failed: {}", e.toString(), e);
            throw new IllegalStateException("Attachment storage is temporarily unavailable.");
        }
    }

    /**
     * Fetch the bytes for a stored key (server-side; never exposes a URL).
     * Routes on the key's backend tag. Throws {@link BlobNotFoundException}
     * when the object is gone; all other failures throw a non-leaking message.
     */
    public byte[] fetch(String storageKey) {
        try {
            if (isS3Key(storageKey)) {
                try {
                    return s3().getObjectAsBytes(GetObjectRequest.builder()
                            .bucket(s3Bucket).key(rawKey(storageKey)).build()).asByteArray();
                } catch (NoSuchKeyException e) {
                    throw new BlobNotFoundException();
                }
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

    /** Best-effort blob deletion (failure is logged, never fatal; missing key is not an error). */
    public void delete(String storageKey) {
        try {
            if (isS3Key(storageKey)) {
                // S3 DeleteObject is idempotent — a missing key returns success.
                s3().deleteObject(DeleteObjectRequest.builder()
                        .bucket(s3Bucket).key(rawKey(storageKey)).build());
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
