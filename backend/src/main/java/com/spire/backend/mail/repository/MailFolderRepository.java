package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailFolder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MailFolderRepository extends JpaRepository<MailFolder, Long> {

    /** The caller's whole folder tree (system + custom); siblings/descendants
     *  and dup checks are computed in-memory from this small list. */
    List<MailFolder> findByAccount_IdOrderBySortOrderAscNameAsc(Long accountId);

    /** Ownership-checked fetch — empty when the folder isn't the caller's. */
    Optional<MailFolder> findByIdAndAccount_Id(Long id, Long accountId);

    /** A specific system folder for an account, e.g. by key "INBOX". */
    Optional<MailFolder> findByAccount_IdAndSystemKey(Long accountId, String systemKey);

    /** Break internal parent links among a folder set before deleting it
     *  (the self-FK has no ON DELETE rule). Account-scoped. */
    @Modifying
    @Query("UPDATE MailFolder f SET f.parent = null WHERE f.account.id = :accountId AND f.id IN :ids")
    void clearParentsByIds(@Param("accountId") Long accountId, @Param("ids") Collection<Long> ids);

    /** Delete a folder set (the folder + its descendants). Account-scoped. */
    @Modifying
    @Query("DELETE FROM MailFolder f WHERE f.account.id = :accountId AND f.id IN :ids")
    void deleteByIds(@Param("accountId") Long accountId, @Param("ids") Collection<Long> ids);
}
