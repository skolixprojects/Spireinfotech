package com.spire.backend.mail.service;

import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * In-memory, per-account registry of Server-Sent-Event emitters for live
 * new-mail notifications. Thread-safe; one account may hold several emitters
 * (multiple tabs). Events are published ONLY to the target account's emitters,
 * so they are inherently walled (callers pass resolved recipient accountIds).
 *
 * <p>A self-contained single-thread scheduler sends a heartbeat comment to every
 * emitter so idle proxies don't drop the connection; it does NOT rely on the
 * app-wide scheduler. Dead emitters are pruned on completion/timeout/error and
 * on any send failure.
 *
 * <p>LIMITATION (v1): single-instance only. Across multiple app instances an
 * account's emitters live on whichever node it connected to, so a send on
 * another node won't reach them — a multi-instance deployment needs a shared
 * pub/sub fan-out (e.g. Redis). Flagged, not solved here.
 */
@Service
@Slf4j
public class MailSseService {

    private final Map<Long, Set<SseEmitter>> emitters = new ConcurrentHashMap<>();

    private final ScheduledExecutorService heartbeat =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "mail-sse-heartbeat");
                t.setDaemon(true);
                return t;
            });

    // Fan-out runs here, NOT on the caller's (sender's request) thread — a slow
    // recipient socket must never stall the sender's response. Separate from the
    // heartbeat so a stuck publish can't delay heartbeats.
    private final ExecutorService publishExecutor =
            Executors.newSingleThreadExecutor(r -> {
                Thread t = new Thread(r, "mail-sse-publish");
                t.setDaemon(true);
                return t;
            });

    public MailSseService() {
        heartbeat.scheduleAtFixedRate(this::sendHeartbeats, 25, 25, TimeUnit.SECONDS);
    }

    /** Register a new emitter for an account (never times out; client reconnects). */
    public SseEmitter register(Long accountId) {
        SseEmitter emitter = new SseEmitter(0L); // 0 = no server-side timeout
        // Add inside an atomic remap so register can't race the empty-key prune.
        emitters.compute(accountId, (k, set) -> {
            if (set == null) set = new CopyOnWriteArraySet<>();
            set.add(emitter);
            return set;
        });
        emitter.onCompletion(() -> remove(accountId, emitter));
        emitter.onTimeout(() -> remove(accountId, emitter));
        emitter.onError(e -> remove(accountId, emitter));
        try {
            emitter.send(SseEmitter.event().comment("connected"));
        } catch (Exception e) {
            remove(accountId, emitter);
        }
        return emitter;
    }

    /**
     * Best-effort fan-out of a new-mail event to one account's emitters. The
     * actual (blocking) socket writes are offloaded to {@code publishExecutor}
     * so the caller (the sender's committing request thread) is never blocked by
     * a slow recipient connection. Fire-and-forget; failures drop the emitter.
     */
    public void publishNewMail(Long accountId, Long messageId) {
        if (emitters.get(accountId) == null) return; // fast path: no listeners
        publishExecutor.submit(() -> doPublish(accountId, messageId));
    }

    private void doPublish(Long accountId, Long messageId) {
        Set<SseEmitter> set = emitters.get(accountId); // re-read (may have reconnected)
        if (set == null) return;
        Map<String, Object> payload = Map.of("type", "NEW_MAIL", "folder", "INBOX", "messageId", messageId);
        for (SseEmitter em : set) {
            try {
                em.send(SseEmitter.event().name("new-mail").data(payload, MediaType.APPLICATION_JSON));
            } catch (Exception e) {
                remove(accountId, em); // dead connection — drop it
            }
        }
    }

    /** Visible for tests: how many emitters an account currently holds. */
    public int emitterCount(Long accountId) {
        Set<SseEmitter> set = emitters.get(accountId);
        return set == null ? 0 : set.size();
    }

    private void sendHeartbeats() {
        for (Map.Entry<Long, Set<SseEmitter>> e : emitters.entrySet()) {
            for (SseEmitter em : e.getValue()) {
                try {
                    em.send(SseEmitter.event().comment("ping"));
                } catch (Exception ex) {
                    remove(e.getKey(), em);
                }
            }
        }
    }

    private void remove(Long accountId, SseEmitter emitter) {
        // Atomic per-key: remove the emitter and drop the key when its set empties,
        // without racing a concurrent register on the same account.
        emitters.computeIfPresent(accountId, (k, set) -> {
            set.remove(emitter);
            return set.isEmpty() ? null : set;
        });
    }

    @PreDestroy
    public void shutdown() {
        heartbeat.shutdownNow();
        publishExecutor.shutdownNow();
    }
}
