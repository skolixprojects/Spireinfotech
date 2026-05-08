package com.spire.backend.service;

import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfImportedPage;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.PdfStamper;
import com.lowagie.text.pdf.PdfWriter;
import com.spire.backend.entity.AgreementAcceptance;
import com.spire.backend.entity.User;
import com.spire.backend.service.TermsContentService.Section;
import com.spire.backend.service.TermsContentService.TermsDocument;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Generates the personalized signed-agreement PDF emailed to a user
 * after they complete the OTP-verified Terms acceptance flow.
 *
 * Renders directly from {@link TermsContentService}, the same JSON
 * source the website's {@code /api/agreement/terms} endpoint reads,
 * so the PDF wording is always identical to what the user agreed to
 * on screen.
 *
 * Layout strategy:
 *   1. Build the body content as a borderless A4 PDF in memory.
 *   2. If a letterhead template exists at
 *      {@code resources/templates/letterhead.pdf}, overlay each body
 *      page onto a copy of the letterhead (page 1 → first letterhead
 *      page; subsequent body pages → letterhead page 1 reused).
 *   3. If no letterhead template ships, write the body PDF directly
 *      with a native teal header / footer so the document still looks
 *      branded.
 *
 * Files land at {@code signed-agreements/{userId}-{ts}.pdf} relative
 * to the working directory; same convention as the certificates
 * folder. The public download URL is
 * {@code /api/agreement/signed-pdf/{userId}/{fileName}} — gated to
 * the owning user or an admin.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AgreementPdfService {

    private static final Color TEAL_PRIMARY = new Color(15, 118, 110);   // #0F766E
    private static final Color TEAL_DARK = new Color(19, 78, 74);        // #134E4A
    private static final Color INK = new Color(31, 41, 55);
    private static final Color MUTED = new Color(107, 114, 128);
    private static final Color LIGHT_BG = new Color(249, 250, 251);

    private static final String LETTERHEAD_PATH = "templates/letterhead.pdf";
    private static final String OUTPUT_DIR = "signed-agreements";

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter DATE_TIME_FMT =
            DateTimeFormatter.ofPattern("d MMMM yyyy, h:mm a 'IST'", Locale.ENGLISH);

    private final TermsContentService termsContentService;

    /**
     * Generates the signed PDF for a verified acceptance row and
     * returns the on-disk filename. Caller is responsible for
     * persisting the resulting URL on the row.
     *
     * Throws on disk / rendering failure — agreement-acceptance flow
     * wraps the call in try/catch so a PDF outage doesn't roll back
     * the verification itself.
     */
    public String generate(AgreementAcceptance row) {
        TermsDocument doc = termsContentService.getTerms(row.getAgreementVersion());
        new File(OUTPUT_DIR).mkdirs();

        String fileName = row.getUser().getId() + "-" + System.currentTimeMillis() + ".pdf";
        String filePath = OUTPUT_DIR + "/" + fileName;

        byte[] body = renderBody(row, doc);

        ClassPathResource letterhead = new ClassPathResource(LETTERHEAD_PATH);
        if (letterhead.exists()) {
            try (var lhStream = letterhead.getInputStream();
                 var out = new FileOutputStream(filePath)) {
                overlayOnLetterhead(body, lhStream.readAllBytes(), out);
                log.info("Signed agreement PDF written (with letterhead) for user {}: {}",
                        row.getUser().getId(), filePath);
                return fileName;
            } catch (Exception e) {
                log.warn("Letterhead overlay failed, falling back to native header: {}",
                        e.getMessage());
            }
        }

        try (var out = new FileOutputStream(filePath)) {
            out.write(body);
            log.info("Signed agreement PDF written for user {}: {}",
                    row.getUser().getId(), filePath);
            return fileName;
        } catch (Exception e) {
            throw new RuntimeException(
                    "Failed to write signed agreement PDF: " + e.getMessage(), e);
        }
    }

    /**
     * Renders the body PDF: header, user details box, all terms
     * sections, acceptance confirmations, and signature block.
     * Returns the raw PDF bytes so the caller can either ship them
     * unmodified or overlay them onto a letterhead.
     */
    private byte[] renderBody(AgreementAcceptance row, TermsDocument doc) {
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            // Top margin leaves room for the letterhead header strip /
            // native header to live above the content area.
            Document document = new Document(PageSize.A4, 54, 54, 110, 70);
            PdfWriter writer = PdfWriter.getInstance(document, baos);
            writer.setPageEvent(new HeaderFooter(doc, row));
            document.open();

            User user = row.getUser();
            String acceptedAt = row.getAcceptedAt() == null
                    ? "—"
                    : row.getAcceptedAt().atZone(IST).format(DATE_TIME_FMT);

            // ── Title + intro ───────────────────────────────────────
            document.add(centered("SIGNED AGREEMENT",
                    new Font(Font.HELVETICA, 11, Font.BOLD, MUTED), 16));
            document.add(centered("Terms of Service Acceptance Record",
                    new Font(Font.TIMES_ROMAN, 22, Font.BOLD, TEAL_DARK), 8));
            document.add(centered("This document certifies the digital acceptance of the "
                            + doc.platform() + " Terms of Service by the named user below.",
                    new Font(Font.TIMES_ROMAN, 11, Font.ITALIC, MUTED), 18));

            // ── User details panel ──────────────────────────────────
            document.add(detailRow("Legal name", row.getLegalName()));
            document.add(detailRow("Email", user.getEmail()));
            document.add(detailRow("Agreement version", doc.version()
                    + (doc.effectiveDate() == null || doc.effectiveDate().isBlank()
                            ? "" : "  (effective " + doc.effectiveDate() + ")")));
            document.add(detailRow("Date of acceptance", acceptedAt));
            document.add(detailRow("Acceptance code", row.getAcceptanceCode() == null
                    ? "—" : row.getAcceptanceCode()));
            document.add(detailRow("Reply received", row.getUserReplyReceivedAt() == null
                    ? "—"
                    : row.getUserReplyReceivedAt().atZone(IST).format(DATE_TIME_FMT)
                            + "  ('" + safe(row.getUserReplyContent()) + "')"));
            document.add(detailRow("IP address", safe(row.getIpAddress())));
            document.add(detailRow("Browser / OS",
                    safe(row.getBrowser()) + " on " + safe(row.getOs())));
            document.add(spacer(18));

            // ── Acceptance confirmations ────────────────────────────
            document.add(sectionHeader("By accepting, the user confirmed:"));
            for (String c : doc.acceptanceConfirmations()) {
                document.add(bullet(c));
            }
            document.add(spacer(14));

            // ── Full terms ──────────────────────────────────────────
            document.add(sectionHeader("Terms of Service " + doc.version()));
            for (Section s : doc.sections()) {
                Paragraph title = new Paragraph(s.title(),
                        new Font(Font.HELVETICA, 11.5f, Font.BOLD, TEAL_DARK));
                title.setSpacingBefore(8);
                title.setSpacingAfter(2);
                document.add(title);

                Paragraph content = new Paragraph(s.content(),
                        new Font(Font.TIMES_ROMAN, 10.5f, Font.NORMAL, INK));
                content.setAlignment(Element.ALIGN_JUSTIFIED);
                content.setLeading(15);
                document.add(content);
            }

            // ── Signature block ─────────────────────────────────────
            document.add(spacer(20));
            document.add(sectionHeader("Digital Signature"));
            document.add(new Paragraph(
                    "This agreement has been digitally signed and verified through "
                            + "a multi-factor process: legal name typed by the user, "
                            + "email reply confirmation, and a one-time verification code "
                            + "delivered to and entered from the user's registered email "
                            + "address. The acceptance is recorded as legal evidence and "
                            + "constitutes binding consent equivalent to a handwritten signature.",
                    new Font(Font.TIMES_ROMAN, 10.5f, Font.NORMAL, INK)));
            document.add(spacer(16));

            Paragraph signedAs = new Paragraph();
            signedAs.add(new Chunk("Signed as: ",
                    new Font(Font.HELVETICA, 11, Font.NORMAL, MUTED)));
            signedAs.add(new Chunk(row.getLegalName(),
                    new Font(Font.HELVETICA, 13, Font.BOLD, INK)));
            document.add(signedAs);

            Paragraph signedOn = new Paragraph(
                    "Signed on " + acceptedAt,
                    new Font(Font.HELVETICA, 10, Font.ITALIC, MUTED));
            document.add(signedOn);

            // ── Contact / jurisdiction footer ───────────────────────
            document.add(spacer(18));
            document.add(new Paragraph(
                    "For verification or questions: " + doc.contactEmail()
                            + "  |  " + doc.supportUrl(),
                    new Font(Font.HELVETICA, 9, Font.NORMAL, MUTED)));
            document.add(new Paragraph(
                    "Jurisdiction: " + doc.jurisdiction(),
                    new Font(Font.HELVETICA, 9, Font.NORMAL, MUTED)));

            document.close();
            return baos.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("Failed to render agreement PDF body: " + e.getMessage(), e);
        }
    }

    /**
     * Overlays each body page onto a letterhead template. The
     * letterhead's first page is reused for every body page —
     * single-page letterheads are the common case, so we don't
     * try to multiplex multi-page letterheads.
     */
    private void overlayOnLetterhead(byte[] bodyBytes, byte[] letterheadBytes, FileOutputStream out)
            throws Exception {
        // Read body PDF, then stamp the letterhead behind every page.
        PdfReader bodyReader = new PdfReader(bodyBytes);
        ByteArrayOutputStream tmp = new ByteArrayOutputStream();
        PdfStamper stamper = new PdfStamper(bodyReader, tmp);

        PdfReader letterheadReader = new PdfReader(letterheadBytes);
        PdfImportedPage letterheadPage = stamper.getImportedPage(letterheadReader, 1);

        int pages = bodyReader.getNumberOfPages();
        for (int i = 1; i <= pages; i++) {
            PdfContentByte underContent = stamper.getUnderContent(i);
            underContent.addTemplate(letterheadPage, 0, 0);
        }
        stamper.close();
        bodyReader.close();
        letterheadReader.close();

        out.write(tmp.toByteArray());
    }

    // ─── Layout helpers ────────────────────────────────────────────

    private static Paragraph spacer(float leading) {
        Paragraph p = new Paragraph(" ");
        p.setLeading(leading);
        return p;
    }

    private static Paragraph centered(String text, Font font, float spacingAfter) {
        Paragraph p = new Paragraph(text, font);
        p.setAlignment(Element.ALIGN_CENTER);
        p.setSpacingAfter(spacingAfter);
        return p;
    }

    private static Paragraph sectionHeader(String text) {
        Paragraph p = new Paragraph(text,
                new Font(Font.HELVETICA, 11, Font.BOLD, TEAL_PRIMARY));
        p.setSpacingBefore(6);
        p.setSpacingAfter(8);
        return p;
    }

    private static Paragraph detailRow(String label, String value) {
        Paragraph p = new Paragraph();
        p.add(new Chunk(label + ":  ",
                new Font(Font.HELVETICA, 10, Font.BOLD, MUTED)));
        p.add(new Chunk(value == null || value.isBlank() ? "—" : value,
                new Font(Font.HELVETICA, 10, Font.NORMAL, INK)));
        p.setLeading(14);
        return p;
    }

    private static Paragraph bullet(String text) {
        Paragraph p = new Paragraph("•  " + text,
                new Font(Font.TIMES_ROMAN, 10.5f, Font.NORMAL, INK));
        p.setIndentationLeft(12);
        p.setLeading(15);
        p.setSpacingAfter(2);
        return p;
    }

    private static String safe(String s) {
        return s == null || s.isBlank() ? "—" : s;
    }

    /**
     * Native header + footer painted on every page when no
     * letterhead template is bundled. When a letterhead overlay is
     * used the visual header is provided by the letterhead PDF
     * itself, but we still render the page-number footer here
     * because letterheads typically don't carry that.
     */
    private static class HeaderFooter extends com.lowagie.text.pdf.PdfPageEventHelper {
        private final TermsDocument doc;
        private final AgreementAcceptance row;

        HeaderFooter(TermsDocument doc, AgreementAcceptance row) {
            this.doc = doc;
            this.row = row;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            try {
                PdfContentByte cb = writer.getDirectContent();
                Rectangle page = document.getPageSize();

                // Header: teal band + platform name. Sized to live
                // ABOVE the body's top margin so a letterhead overlay
                // can hide it if needed.
                cb.saveState();
                cb.setColorFill(TEAL_PRIMARY);
                cb.rectangle(0, page.getHeight() - 60, page.getWidth(), 60);
                cb.fill();
                cb.restoreState();

                cb.beginText();
                cb.setFontAndSize(com.lowagie.text.pdf.BaseFont.createFont(
                        com.lowagie.text.pdf.BaseFont.HELVETICA_BOLD,
                        com.lowagie.text.pdf.BaseFont.WINANSI, false), 16);
                cb.setColorFill(Color.WHITE);
                cb.setTextMatrix(54, page.getHeight() - 36);
                cb.showText(doc.platform());
                cb.endText();

                cb.beginText();
                cb.setFontAndSize(com.lowagie.text.pdf.BaseFont.createFont(
                        com.lowagie.text.pdf.BaseFont.HELVETICA,
                        com.lowagie.text.pdf.BaseFont.WINANSI, false), 9);
                cb.setColorFill(Color.WHITE);
                cb.setTextMatrix(54, page.getHeight() - 50);
                cb.showText("Signed Agreement  •  " + doc.version());
                cb.endText();

                // Right-aligned record locator on the header
                String locator = "AGR-" + row.getId();
                var bf = com.lowagie.text.pdf.BaseFont.createFont(
                        com.lowagie.text.pdf.BaseFont.HELVETICA,
                        com.lowagie.text.pdf.BaseFont.WINANSI, false);
                float w = bf.getWidthPoint(locator, 9);
                cb.beginText();
                cb.setFontAndSize(bf, 9);
                cb.setColorFill(Color.WHITE);
                cb.setTextMatrix(page.getWidth() - 54 - w, page.getHeight() - 36);
                cb.showText(locator);
                cb.endText();

                // Footer band — light grey rule + page number / contact
                cb.setColorStroke(LIGHT_BG);
                cb.setLineWidth(0.5f);
                cb.moveTo(54, 50);
                cb.lineTo(page.getWidth() - 54, 50);
                cb.stroke();

                cb.beginText();
                cb.setFontAndSize(bf, 8);
                cb.setColorFill(MUTED);
                cb.setTextMatrix(54, 36);
                cb.showText(doc.platform() + "  •  " + doc.platformUrl());
                cb.endText();

                String pageLabel = "Page " + writer.getPageNumber();
                float pw = bf.getWidthPoint(pageLabel, 8);
                cb.beginText();
                cb.setFontAndSize(bf, 8);
                cb.setColorFill(MUTED);
                cb.setTextMatrix(page.getWidth() - 54 - pw, 36);
                cb.showText(pageLabel);
                cb.endText();
            } catch (Exception e) {
                log.debug("Header/footer paint failed: {}", e.getMessage());
            }
        }
    }
}
