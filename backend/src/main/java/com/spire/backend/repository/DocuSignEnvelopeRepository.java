package com.spire.backend.repository;

import com.spire.backend.entity.DocuSignEnvelope;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DocuSignEnvelopeRepository extends JpaRepository<DocuSignEnvelope, Long> {
    List<DocuSignEnvelope> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<DocuSignEnvelope> findByEnvelopeId(String envelopeId);
}
