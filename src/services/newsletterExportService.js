const { escapeHtml, resolveColors, renderLogo } = require("./layouts/shared");
const { renderHtmlToPdf } = require("./flyerRenderer");
const { generateQRCode } = require("./qrService");

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Formats in UTC explicitly — these dates are stored as UTC midnight
// (birthdate) or a UTC instant (event start), and toLocaleDateString's
// local-timezone conversion can shift a UTC-midnight date to the
// previous day depending on the server's timezone.
const formatDay = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

const formatShortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
};

const renderTextBlock = (section) => {
  const { body, photo_url } = section.content || {};
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(section.title)}</div>
      ${photo_url ? `<img class="section-photo" src="${photo_url}" alt="" />` : ""}
      <div class="section-body">${escapeHtml(body || "")}</div>
    </div>`;
};

const renderListBlock = (section) => {
  const items = section.content?.items || [];
  if (items.length === 0) return "";
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(section.title)}</div>
      <ul class="section-list">
        ${items
          .map(
            (item) =>
              `<li><strong>${escapeHtml(item.heading || "")}</strong>${
                item.body ? ` — ${escapeHtml(item.body)}` : ""
              }</li>`,
          )
          .join("")}
      </ul>
    </div>`;
};

const renderBirthdays = (section) => {
  const entries = section.content?.entries || [];
  if (entries.length === 0) return "";
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(section.title)}</div>
      <ul class="section-list">
        ${entries
          .map((e) => `<li>${escapeHtml(e.name)} — ${escapeHtml(formatDay(e.date))}</li>`)
          .join("")}
      </ul>
    </div>`;
};

const renderCalendar = (section) => {
  const entries = section.content?.entries || [];
  if (entries.length === 0) return "";
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(section.title)}</div>
      <ul class="section-list">
        ${entries
          .map((e) => {
            const when = e.recurring_note || formatShortDate(e.date);
            return `<li><strong>${escapeHtml(e.title)}</strong> — ${escapeHtml(when)}${
              e.location ? ` · ${escapeHtml(e.location)}` : ""
            }</li>`;
          })
          .join("")}
      </ul>
    </div>`;
};

const renderSpotlight = (section) => {
  const { person_name, photo_url, bio, qa } = section.content || {};
  if (!person_name && !bio) return "";
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(section.title)}</div>
      ${photo_url ? `<img class="section-photo-circle" src="${photo_url}" alt="" />` : ""}
      <div class="spotlight-name">${escapeHtml(person_name || "")}</div>
      <div class="section-body">${escapeHtml(bio || "")}</div>
      ${(qa || [])
        .map(
          (item) =>
            `<div class="qa-item"><strong>${escapeHtml(item.question)}</strong><div>${escapeHtml(
              item.answer,
            )}</div></div>`,
        )
        .join("")}
    </div>`;
};

// The only section whose render is genuinely async (QR generation) — a
// failed QR is non-fatal, same "best-effort" posture as the flyer
// background cut-out: the newsletter still renders, just without the code.
const renderGiveCta = async (section) => {
  const { body, give_url } = section.content || {};
  let qrImg = "";
  if (give_url) {
    try {
      const dataUrl = await generateQRCode(give_url);
      qrImg = `<img class="qr" src="${dataUrl}" alt="QR code" />`;
    } catch (err) {
      // best-effort — the newsletter still renders without the code
    }
  }
  return `
    <div class="section give-section">
      <div class="section-title">${escapeHtml(section.title)}</div>
      <div class="section-body">${escapeHtml(body || "")}</div>
      ${qrImg}
    </div>`;
};

const renderSection = async (section) => {
  switch (section.type) {
    case "text_block":
      return renderTextBlock(section);
    case "list_block":
      return renderListBlock(section);
    case "birthdays":
      return renderBirthdays(section);
    case "calendar":
      return renderCalendar(section);
    case "spotlight":
      return renderSpotlight(section);
    case "give_cta":
      return renderGiveCta(section);
    default:
      return "";
  }
};

const buildNewsletterHtml = async (issue, ministry) => {
  const colors = resolveColors(ministry?.branding);
  const logo = renderLogo(ministry?.branding?.logo_url, 48);
  const monthLabel = MONTH_NAMES[issue.month - 1] || "";

  const orderedSections = [...issue.sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
  const sectionHtml = (await Promise.all(orderedSections.map(renderSection))).filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, serif; color: #1c1c1c; font-size: 11pt; line-height: 1.6; }
    .masthead { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid ${colors.primary}; padding-bottom: 16px; margin-bottom: 24px; }
    .masthead-title { font-size: 22pt; font-weight: bold; color: ${colors.primary}; letter-spacing: 0.04em; }
    .masthead-sub { font-size: 10pt; color: ${colors.accent}; margin-top: 2px; }
    .masthead-issue { text-align: right; font-size: 9pt; color: #666; }
    .theme { font-size: 12pt; font-weight: bold; color: ${colors.gold}; margin-top: 2px; }
    .section { break-inside: avoid; margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid #e0e0e0; }
    .section-title { font-size: 10pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: ${colors.primary}; margin-bottom: 8px; }
    .section-body { white-space: pre-wrap; word-wrap: break-word; }
    .section-photo { max-width: 160px; border-radius: 6px; margin-bottom: 10px; }
    .section-photo-circle { width: 100px; height: 100px; object-fit: cover; border-radius: 50%; margin-bottom: 10px; }
    .spotlight-name { font-size: 13pt; font-weight: bold; color: ${colors.primary}; margin-bottom: 6px; }
    .qa-item { margin-top: 8px; }
    .section-list { list-style: none; }
    .section-list li { padding: 4px 0; border-bottom: 1px dotted #ddd; }
    .give-section { text-align: center; }
    .qr { width: 100px; height: 100px; margin-top: 12px; }
    .footer { margin-top: 12px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 8pt; color: #888; text-align: center; }
  </style></head>
  <body>
    <div class="masthead">
      <div>
        ${logo}
        <div class="masthead-title">${escapeHtml(ministry?.name || "")} Journal</div>
        <div class="masthead-sub">${escapeHtml(ministry?.tagline || "")}</div>
      </div>
      <div class="masthead-issue">
        ${escapeHtml(monthLabel)} ${issue.year}
        ${issue.theme ? `<div class="theme">${escapeHtml(issue.theme)}</div>` : ""}
      </div>
    </div>
    ${sectionHtml}
    <div class="footer">${escapeHtml(ministry?.name || "")} · ${escapeHtml(monthLabel)} ${issue.year}</div>
  </body></html>`;
};

const exportNewsletterAsPdf = async ({ issue, ministry }) => {
  const html = await buildNewsletterHtml(issue, ministry);
  return renderHtmlToPdf(html);
};

module.exports = { buildNewsletterHtml, exportNewsletterAsPdf };
