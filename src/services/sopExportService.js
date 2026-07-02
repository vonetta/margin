const { escapeHtml } = require("./layouts/shared");
const { renderHtmlToPdf } = require("./flyerRenderer");

// "Clean" mode strips internal review markers before a document leaves the
// app — a [CONFIRM: ...] blank or a "FOR REVIEW: ..." note addressed to a
// named person reads as unfinished/internal to an outside vendor or
// partner. "Internal" mode (the default) keeps everything as-is.
const stripReviewMarkers = (text) =>
  text
    .replace(/\[CONFIRM:[^\]]*\]/gi, "")
    .split("\n")
    .filter((line) => !/^\s*FOR REVIEW/i.test(line))
    .join("\n")
    // Collapse any run of 3+ blank lines left behind by the strips above.
    .replace(/\n{3,}/g, "\n\n");

const STATUS_LABEL = {
  pending_review: "DRAFT — PENDING APPROVAL",
  rejected: "REJECTED",
};

// Deliberately renders the SOP's free-text content as plain, safely-escaped
// paragraphs rather than trying to heuristically parse "1. TITLE" / "-
// bullet" conventions into styled headers — that parsing isn't guaranteed
// by anything upstream (an AI-drafted SOP and a hand-edited one don't
// necessarily follow the same conventions), so a misparse would silently
// mangle the document. Preserving line breaks as-is can never do that.
const buildSopExportHtml = ({ draft, ministry, mode }) => {
  const branding = ministry?.branding || {};
  const colors = branding.colors || {};
  const primary = colors.primary || "#1a1a2e";

  const rawContent = mode === "clean" ? stripReviewMarkers(draft.content) : draft.content;
  const contentHtml = escapeHtml(rawContent);

  const watermarkLabel = STATUS_LABEL[draft.status];
  const watermark = watermarkLabel
    ? `<div class="watermark">${escapeHtml(watermarkLabel)}</div>`
    : "";

  const logo = branding.logo_url
    ? `<img src="${branding.logo_url}" class="logo" alt="logo" />`
    : "";

  const exportedAt = new Date().toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, serif; color: #1c1c1c; font-size: 12pt; line-height: 1.6; position: relative; }
    .header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid ${primary}; padding-bottom: 14px; margin-bottom: 18px; }
    .logo { height: 40px; }
    .ministry-name { font-size: 11pt; color: ${primary}; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; }
    h1 { font-size: 18pt; color: ${primary}; margin-bottom: 4px; }
    .tags { font-size: 9pt; color: #666; margin-bottom: 18px; }
    .content { white-space: pre-wrap; word-wrap: break-word; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 8pt; color: #888; }
    .watermark { position: fixed; top: 45%; left: 0; right: 0; text-align: center; font-size: 30pt; font-weight: bold; color: rgba(200, 60, 60, 0.28); transform: rotate(-20deg); letter-spacing: 0.08em; z-index: 0; }
  </style></head>
  <body>
    ${watermark}
    <div class="header">
      ${logo}
      <div class="ministry-name">${escapeHtml(ministry?.name || "")}</div>
    </div>
    <h1>${escapeHtml(draft.title)}</h1>
    ${draft.tags?.length ? `<div class="tags">${draft.tags.map((t) => escapeHtml(t)).join(" · ")}</div>` : ""}
    <div class="content">${contentHtml}</div>
    <div class="footer">Exported ${escapeHtml(exportedAt)} · Status: ${escapeHtml(draft.status)} · Mode: ${escapeHtml(mode)}</div>
  </body></html>`;
};

const exportSopAsPdf = async ({ draft, ministry, mode = "internal" }) => {
  const html = buildSopExportHtml({ draft, ministry, mode });
  return renderHtmlToPdf(html);
};

module.exports = { exportSopAsPdf, buildSopExportHtml, stripReviewMarkers };
