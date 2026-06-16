package com.spire.backend.mail.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;

/**
 * S3 client for mail attachment storage. The bean is created ONLY when a
 * bucket is configured ({@code mail.s3.bucket} non-empty), so dev/test with
 * no AWS env still boots and {@link com.spire.backend.mail.service.MailBlobStore}
 * falls back to local disk. Credentials come from the default AWS chain
 * (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env, instance profile, etc.);
 * region from {@code mail.s3.region} (AWS_REGION) or the default region chain.
 *
 * <p>This is mail-only and entirely separate from the LMS Cloudinary config.
 */
@Configuration
public class MailS3Config {

    @Bean
    @ConditionalOnExpression("'${mail.s3.bucket:}' != ''")
    public S3Client mailS3Client(@Value("${mail.s3.region:}") String region) {
        var builder = S3Client.builder()
                .credentialsProvider(DefaultCredentialsProvider.create());
        if (region != null && !region.isBlank()) {
            builder = builder.region(Region.of(region));
        }
        // When region is blank the SDK resolves it from the default chain
        // (AWS_REGION / profile); a prod bucket deploy is expected to set it.
        return builder.build();
    }
}
