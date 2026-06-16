-- Spire Course Platform - PostgreSQL Schema for Supabase
-- Run this in the Supabase SQL Editor

-- ============================================
-- TABLES
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(100),
    avatar_url TEXT,
    bio TEXT,
    role VARCHAR(20) DEFAULT 'STUDENT' CHECK (role IN ('STUDENT', 'INSTRUCTOR', 'TRAINER', 'ADMIN')),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    slug VARCHAR(250) UNIQUE,
    description TEXT,
    short_description TEXT,
    thumbnail_url TEXT,
    instructor_id UUID REFERENCES users(id),
    category VARCHAR(100),
    level VARCHAR(20) CHECK (level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
    price NUMERIC(10,2) DEFAULT 0,
    is_free BOOLEAN DEFAULT true,
    duration_hours NUMERIC(5,1),
    lessons_count INTEGER DEFAULT 0,
    enrolled_count INTEGER DEFAULT 0,
    rating NUMERIC(3,2) DEFAULT 0,
    ratings_count INTEGER DEFAULT 0,
    tags TEXT[],
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    video_url TEXT,
    order_index INTEGER,
    duration_minutes INTEGER,
    is_free BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS module_id UUID;
ALTER TABLE lessons ADD CONSTRAINT fk_lessons_module
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL;

-- Welcome wizard flag. New signups default FALSE; the frontend belt-and-
-- suspenders also skips the wizard for users who already have enrollments.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Resume position so the focused course player can seek to where the
-- student left off. MySQL schema already declares this; Postgres backfill.
ALTER TABLE progress ADD COLUMN IF NOT EXISTS video_position_sec INTEGER NOT NULL DEFAULT 0;

-- Profile-page extras (avatar_url and bio already exist).
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(255) NULL;

-- COURSE vs SERVICE: courses include mentorship + assignments + certificate;
-- services are short, video-only walk-throughs (no mentor, no cert).
ALTER TABLE courses ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'COURSE';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS trainer_id UUID NULL;
ALTER TABLE courses ADD CONSTRAINT fk_courses_trainer
    FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP DEFAULT now(),
    UNIQUE(user_id, course_id)
);

CREATE TABLE course_mentors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL,
    user_id UUID NOT NULL,
    max_students INT NOT NULL DEFAULT 10,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(course_id, user_id)
);

CREATE TABLE mentor_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL UNIQUE,
    mentor_id UUID, -- nullable: PENDING_ASSIGNMENT rows have no mentor yet
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE,
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE session_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mentor_assignment_id UUID NOT NULL,
    requested_by UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    topic VARCHAR(500),
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_at TIMESTAMP NULL,
    meeting_url VARCHAR(500) NULL,
    notes TEXT NULL,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (mentor_assignment_id) REFERENCES mentor_assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
    completion_percent INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT false,
    streak_days INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT now()
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10,2),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature TEXT,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    badge_name VARCHAR(100),
    badge_icon VARCHAR(50),
    earned_at TIMESTAMP DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_courses_instructor_id ON courses(instructor_id);
CREATE INDEX idx_courses_slug ON courses(slug);
CREATE INDEX idx_courses_category ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_type ON courses(type);
CREATE INDEX IF NOT EXISTS idx_courses_trainer_id ON courses(trainer_id);
CREATE INDEX idx_modules_course_id ON modules(course_id);
CREATE INDEX idx_lessons_course_id ON lessons(course_id);
CREATE INDEX idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX idx_enrollments_course_id ON enrollments(course_id);
CREATE INDEX idx_course_mentors_course_id ON course_mentors(course_id);
CREATE INDEX idx_course_mentors_user_id ON course_mentors(user_id);
CREATE INDEX idx_mentor_assignments_mentor_id ON mentor_assignments(mentor_id);
CREATE INDEX idx_session_requests_assignment_id ON session_requests(mentor_assignment_id);
CREATE INDEX idx_session_requests_status ON session_requests(status);
CREATE INDEX idx_progress_user_id ON progress(user_id);
CREATE INDEX idx_progress_course_id ON progress(course_id);
CREATE INDEX idx_progress_lesson_id ON progress(lesson_id);
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_achievements_user_id ON achievements(user_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_lessons_updated_at
    BEFORE UPDATE ON lessons
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- MAIL MODULE (internal mail system)
-- ============================================
-- Documentation only — this file is the PostgreSQL/Supabase reference
-- schema and is NOT auto-run. The real tables are created at runtime by
-- Hibernate ddl-auto=update from the @Entity classes under
-- com.spire.backend.mail.entity, which is what gives cross-engine
-- portability: Hibernate emits AUTO_INCREMENT on MySQL (dev) and
-- GENERATED ... AS IDENTITY on PostgreSQL (prod) from the same
-- @GeneratedValue(IDENTITY) mapping. The Postgres-flavored DDL below
-- mirrors that shape for reference (enums as VARCHAR, no exotic types).
-- Phase 1 creates the three IDENTITY tables only; messages / mailboxes /
-- attachments arrive in Phase 3.

-- Phase 1: identity
CREATE TABLE mail_domains (
    id          BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    domain      VARCHAR(255) NOT NULL UNIQUE,
    entity_name VARCHAR(255) NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE mail_accounts (
    id                   BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    local_part           VARCHAR(64)  NOT NULL,
    domain_id            BIGINT       NOT NULL REFERENCES mail_domains(id),
    password_hash        VARCHAR(255) NOT NULL,
    display_name         VARCHAR(255),
    role                 VARCHAR(20)  NOT NULL DEFAULT 'USER',    -- USER | ADMIN | SUPER_ADMIN
    status               VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | SUSPENDED
    must_change_password BOOLEAN      NOT NULL DEFAULT FALSE,
    quota_bytes          BIGINT       NOT NULL DEFAULT 0,
    last_login_at        TIMESTAMP,
    created_at           TIMESTAMP    NOT NULL DEFAULT now(),
    CONSTRAINT uq_mail_account_local_domain UNIQUE (local_part, domain_id)
);

CREATE TABLE mail_setup_tokens (
    id         BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id BIGINT       NOT NULL REFERENCES mail_accounts(id),
    token_hash VARCHAR(255) NOT NULL,
    purpose    VARCHAR(20)  NOT NULL,   -- SETUP | RESET | CHANGE
    expires_at TIMESTAMP    NOT NULL,
    used_at    TIMESTAMP,
    created_at TIMESTAMP    NOT NULL DEFAULT now()
);

-- Phase 3: Mail Admin audit trail (one row per mutating admin action)
CREATE TABLE mail_audit_log (
    id               BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    actor_account_id BIGINT      NOT NULL REFERENCES mail_accounts(id),
    action           VARCHAR(64) NOT NULL,   -- MAILBOX_CREATE, MAILBOX_SUSPEND, DOMAIN_UPDATE, ...
    target_type      VARCHAR(32),            -- MAILBOX | DOMAIN
    target_id        BIGINT,
    details          TEXT,
    created_at       TIMESTAMP   NOT NULL DEFAULT now()
);

-- Phase 5: messaging core — one canonical message + per-recipient
-- envelope + per-participant mailbox entry (folder + flags). Walled per
-- domain at the service layer. thread_id = the root message's id.
CREATE TABLE mail_messages (
    id                BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    sender_account_id BIGINT       NOT NULL REFERENCES mail_accounts(id),
    subject           VARCHAR(998),
    body_html         TEXT,
    body_text         TEXT,
    thread_id         BIGINT,
    in_reply_to       BIGINT       REFERENCES mail_messages(id),
    message_uid       VARCHAR(255) NOT NULL UNIQUE,
    has_attachments   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMP    NOT NULL DEFAULT now()
);
CREATE INDEX idx_mail_msg_thread  ON mail_messages(thread_id);
CREATE INDEX idx_mail_msg_sender  ON mail_messages(sender_account_id);

CREATE TABLE mail_message_recipients (
    id                   BIGINT      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    message_id           BIGINT      NOT NULL REFERENCES mail_messages(id),
    recipient_account_id BIGINT      NOT NULL REFERENCES mail_accounts(id),
    recipient_type       VARCHAR(4)  NOT NULL    -- TO | CC | BCC
);
CREATE INDEX idx_mail_recipient_acct ON mail_message_recipients(recipient_account_id);
CREATE INDEX idx_mail_recipient_msg  ON mail_message_recipients(message_id);

CREATE TABLE mail_mailbox_entries (
    id           BIGINT      GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id   BIGINT      NOT NULL REFERENCES mail_accounts(id),
    message_id   BIGINT      NOT NULL REFERENCES mail_messages(id),
    folder       VARCHAR(20) NOT NULL,   -- INBOX | SENT | DRAFTS | ARCHIVE | TRASH
    is_read      BOOLEAN     NOT NULL DEFAULT FALSE,
    is_starred   BOOLEAN     NOT NULL DEFAULT FALSE,
    is_important BOOLEAN     NOT NULL DEFAULT FALSE,
    labels       TEXT,
    deleted_at   TIMESTAMP              -- tombstone: excluded from all views
);
CREATE INDEX idx_mail_mbox_acct_folder ON mail_mailbox_entries(account_id, folder);
CREATE INDEX idx_mail_mbox_msg         ON mail_mailbox_entries(message_id);

-- Phase 8/9: attachments — draft-anchored (message_id NOT NULL). Only the
-- opaque, backend-tagged storage_key is stored (s3:<objectKey> for the
-- private S3 bucket in prod, loc:<id> for the local-disk dev fallback); the
-- raw object URL is never persisted or returned — downloads go through the
-- authenticated, walled proxy GET /api/mail/attachments/{id}.
CREATE TABLE mail_attachments (
    id           BIGINT       GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    message_id   BIGINT       NOT NULL REFERENCES mail_messages(id),
    filename     VARCHAR(255) NOT NULL,
    content_type VARCHAR(128),
    size_bytes   BIGINT       NOT NULL,
    storage_key  VARCHAR(512) NOT NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT now()
);
CREATE INDEX idx_mail_attach_msg ON mail_attachments(message_id);
