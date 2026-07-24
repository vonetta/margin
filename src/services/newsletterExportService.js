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

// Same-day events (the common case) just show one date; a real
// multi-day range (a retreat, a conference) collapses to "Aug 7-9" when
// both ends fall in the same month, or "Jul 30 - Aug 2" when they don't.
const formatDateRange = (startIso, endIso) => {
  if (!startIso) return "";
  const start = new Date(startIso);
  const startLabel = formatShortDate(startIso);
  if (!endIso) return startLabel;

  const end = new Date(endIso);
  if (
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCDate() === end.getUTCDate()
  ) {
    return startLabel;
  }
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${MONTH_NAMES[start.getUTCMonth()].slice(0, 3)} ${start.getUTCDate()}-${end.getUTCDate()}`;
  }
  return `${startLabel} - ${formatShortDate(endIso)}`;
};

// A small calendar-style "tear-off" date chip (month abbreviation over
// day number) — the closest single-date shape to the reference's
// colored date badges without needing a real calendar-grid component.
const dateBadge = (iso, colors) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `<div class="date-badge" style="background:${colors.primary}">
      <div class="date-badge-month">${MONTH_NAMES[d.getUTCMonth()].slice(0, 3).toUpperCase()}</div>
      <div class="date-badge-day">${d.getUTCDate()}</div>
    </div>`;
};

// Leader Message and The Scholar's Desk both reuse text_block with these
// same optional fields rather than becoming two more bespoke section
// types — a byline/title/subtitle/key-takeaways/pull-quote/signature
// structure is generic enough to serve both (and any future text_block
// section that wants some of it), all fields optional and blank by
// default so plainer text_block sections (e.g. Scripture Meditation)
// are unaffected if left unset.
const renderTextBlock = (section) => {
  const { byline, title, subtitle, body, key_takeaways, quote, saying, signature, blog_note, photo_url } =
    section.content || {};
  const takeaways = key_takeaways || [];
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(section.title)}</div>
      ${byline ? `<div class="byline">${escapeHtml(byline)}</div>` : ""}
      ${photo_url ? `<img class="section-photo" src="${photo_url}" alt="" />` : ""}
      ${title ? `<div class="block-title">${escapeHtml(title)}</div>` : ""}
      ${subtitle ? `<div class="block-subtitle">${escapeHtml(subtitle)}</div>` : ""}
      <div class="card-body">${escapeHtml(body || "")}</div>
      ${
        takeaways.length > 0
          ? `<div class="takeaways">
               <div class="takeaways-title">Key Takeaways</div>
               <ul>${takeaways.map((t) => `<li><span class="check">✓</span>${escapeHtml(t)}</li>`).join("")}</ul>
             </div>`
          : ""
      }
      ${saying ? `<div class="saying">${escapeHtml(saying)}</div>` : ""}
      ${signature ? `<div class="signature">${escapeHtml(signature)}</div>` : ""}
      ${quote ? `<div class="pull-quote">${escapeHtml(quote)}</div>` : ""}
      ${blog_note ? `<div class="blog-note">🌐 ${escapeHtml(blog_note)}</div>` : ""}
    </div>`;
};

const renderListBlock = (section) => {
  const items = section.content?.items || [];
  if (items.length === 0) return "";
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(section.title)}</div>
      <ul class="checklist">
        ${items
          .map(
            (item) =>
              `<li><span class="check">✓</span><span><strong>${escapeHtml(item.heading || "")}</strong>${
                item.body ? ` — ${escapeHtml(item.body)}` : ""
              }</span></li>`,
          )
          .join("")}
      </ul>
    </div>`;
};

const renderBirthdays = (section, colors) => {
  const entries = section.content?.entries || [];
  if (entries.length === 0) return "";
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(section.title)}</div>
      <ul class="entry-list">
        ${entries
          .map(
            (e) =>
              `<li><span class="entry-icon" style="color:${colors.gold}">🎂</span> ${escapeHtml(
                e.name,
              )} <span class="entry-meta">${escapeHtml(formatDay(e.date))}</span></li>`,
          )
          .join("")}
      </ul>
    </div>`;
};

const renderCalendar = (section, colors) => {
  const entries = section.content?.entries || [];
  if (entries.length === 0) return "";
  return `
    <div class="card">
      <div class="card-title">${escapeHtml(section.title)}</div>
      ${entries
        .map((e) => {
          const badge = e.recurring_note
            ? `<div class="date-badge" style="background:${colors.gold}"><div class="date-badge-month">↻</div><div class="date-badge-day-sm">${escapeHtml(
                e.recurring_note,
              )}</div></div>`
            : dateBadge(e.start_date, colors) ||
              `<div class="date-badge" style="background:${colors.primary}"><div class="date-badge-month">—</div></div>`;
          const range = !e.recurring_note ? escapeHtml(formatDateRange(e.start_date, e.end_date)) : "";
          return `
            <div class="calendar-row">
              ${badge}
              <div class="calendar-details">
                <div class="calendar-title">${escapeHtml(e.title)}</div>
                <div class="entry-meta">${range}${e.location ? ` · ${escapeHtml(e.location)}` : ""}</div>
              </div>
            </div>`;
        })
        .join("")}
    </div>`;
};

const renderSpotlight = (section) => {
  const { person_name, photo_url, bio, qa } = section.content || {};
  if (!person_name && !bio) return "";
  return `
    <div class="card spotlight-card">
      <div class="card-title">${escapeHtml(section.title)}</div>
      ${photo_url ? `<img class="section-photo-circle" src="${photo_url}" alt="" />` : ""}
      <div class="spotlight-name">${escapeHtml(person_name || "")}</div>
      <div class="card-body">${escapeHtml(bio || "")}</div>
      ${(qa || [])
        .map(
          (item) =>
            `<div class="qa-item"><div class="qa-question">${escapeHtml(
              item.question,
            )}</div><div>${escapeHtml(item.answer)}</div></div>`,
        )
        .join("")}
    </div>`;
};

// The only section whose render is genuinely async (QR generation) — a
// failed QR is non-fatal, same "best-effort" posture as the flyer
// background cut-out: the newsletter still renders, just without the code.
const renderGiveCta = async (section, colors) => {
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
    <div class="card give-card" style="background:${colors.primary}">
      <div class="card-title give-title">${escapeHtml(section.title)}</div>
      <div class="card-body give-body">${escapeHtml(body || "")}</div>
      ${qrImg}
    </div>`;
};

const renderSection = async (section, colors) => {
  switch (section.type) {
    case "text_block":
      return renderTextBlock(section);
    case "list_block":
      return renderListBlock(section);
    case "birthdays":
      return renderBirthdays(section, colors);
    case "calendar":
      return renderCalendar(section, colors);
    case "spotlight":
      return renderSpotlight(section);
    case "give_cta":
      return renderGiveCta(section, colors);
    default:
      return "";
  }
};

// forEmail skips the cover's forced full-page height/break-after: a print
// PDF needs the cover pinned to exactly one page so section content starts
// cleanly on page 2, but an email has no pages to break across — that same
// forced height would just leave a huge dead gap in the middle of the message.
const buildNewsletterHtml = async (issue, ministry, { forEmail = false } = {}) => {
  const colors = resolveColors(ministry?.branding);
  const logo = renderLogo(ministry?.branding?.logo_url, 44);
  const monthLabel = MONTH_NAMES[issue.month - 1] || "";

  const orderedSections = [...issue.sections]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order);
  const sectionHtml = (await Promise.all(orderedSections.map((s) => renderSection(s, colors))))
    .filter(Boolean)
    .join("\n");
  const tocItems = orderedSections.map((s) => `<div>${escapeHtml(s.title)}</div>`).join("\n");
  // Only rendered for forEmail — the print PDF's page-break engine doesn't
  // fragment reliably around a masthead photo grid, so it stays PDF-free
  // to avoid reintroducing that bug. A scrolling email has no such risk.
  const coverPhotosHtml = forEmail
    ? (issue.cover_photos || [])
        .filter(Boolean)
        .slice(0, 4)
        .map((url) => `<img class="masthead-photo" src="${escapeHtml(url)}" alt="" />`)
        .join("\n")
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Montserrat", Georgia, serif; color: #1c1c1c; font-size: 10.5pt; line-height: 1.6; }

    .masthead { background: ${colors.primary}; color: #fff; padding: 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
    .masthead-main { flex: 1; min-width: 220px; }
    .masthead-issue { font-size: 8pt; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.6; margin-bottom: 10px; }
    .masthead-title-row { display: flex; align-items: center; gap: 10px; }
    .logo { height: 40px; }
    .masthead-title { font-family: "Cinzel", Georgia, serif; font-size: 26pt; font-weight: 600; letter-spacing: 0.02em; line-height: 1.15; }
    .masthead-theme { font-family: Georgia, serif; font-style: italic; font-size: 14pt; font-weight: 400; color: ${colors.accent}; margin-top: 8px; }
    .masthead-sub { font-size: 8pt; color: rgba(255,255,255,0.8); letter-spacing: 0.1em; text-transform: uppercase; margin-top: 12px; }
    .masthead-photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; width: 240px; flex-shrink: 0; }
    .masthead-photo { width: 100%; height: 78px; object-fit: cover; object-position: center 20%; border-radius: 4px; display: block; }
    .masthead-divider { height: 4px; background: ${colors.accent}; }

    .cover { ${forEmail ? "" : "min-height: 10.4in; break-after: page;"} display: flex; flex-direction: column; }
    .cover-toc { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #fdf8ec; padding: 40px 24px; }
    .cover-toc-title { font-family: "Cinzel", Georgia, serif; font-size: 11pt; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: ${colors.accent}; margin-bottom: 24px; }
    .cover-toc-list { columns: 2; column-gap: 40px; text-align: left; font-size: 10.5pt; }
    .cover-toc-list div { break-inside: avoid; padding: 6px 0; border-bottom: 1px dotted #ddd; }

    .grid { column-count: 2; column-gap: 18px; padding: 22px 24px; }

    .card { display: inline-block; width: 100%; padding-top: 12px; border-top: 3px solid ${colors.accent}; margin-bottom: 28px; }
    .card-title { font-family: "Montserrat", sans-serif; font-size: 11pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: ${colors.accent}; margin-bottom: 12px; break-after: avoid; }
    .card-body { white-space: pre-wrap; word-wrap: break-word; }

    .byline { font-size: 8.5pt; font-style: italic; color: #777; margin-bottom: 8px; margin-top: -6px; }
    .section-photo { max-width: 100%; border-radius: 6px; margin-bottom: 10px; }
    .section-photo-circle { width: 90px; height: 90px; object-fit: cover; border-radius: 50%; margin: 0 auto 10px; display: block; border: 3px solid ${colors.gold}; }
    .spotlight-card { break-inside: avoid; text-align: center; }
    .spotlight-name { font-family: "Cinzel", Georgia, serif; font-size: 12pt; font-weight: 600; color: ${colors.accent}; margin-bottom: 6px; }
    .qa-item { break-inside: avoid; margin-top: 10px; text-align: left; font-size: 9.5pt; }
    .qa-question { font-weight: 700; color: ${colors.accent}; }

    .block-title { font-size: 14pt; font-weight: 700; color: ${colors.accent}; margin-bottom: 4px; }
    .block-subtitle { font-size: 9.5pt; font-weight: 600; color: #555; margin-bottom: 10px; }

    .takeaways { break-inside: avoid; background: #fdf8ec; border: 0.5px solid ${colors.gold}; border-radius: 6px; padding: 12px 14px; margin: 12px 0; }
    .takeaways-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: ${colors.accent}; margin-bottom: 6px; }
    .takeaways ul, .checklist { list-style: none; }
    .takeaways li, .checklist li { break-inside: avoid; display: flex; align-items: flex-start; gap: 6px; margin-bottom: 6px; font-size: 9.5pt; }
    .check { color: ${colors.gold}; font-weight: 700; flex-shrink: 0; }

    .saying { font-style: italic; margin-top: 10px; color: ${colors.accent}; }
    .signature { font-style: italic; font-weight: 700; font-size: 13pt; margin-top: 4px; color: ${colors.accent}; }
    .pull-quote { break-inside: avoid; background: ${colors.primary}; color: #fff; font-weight: 700; text-align: center; padding: 14px; border-radius: 6px; margin-top: 14px; font-size: 10pt; line-height: 1.5; }
    .blog-note { break-inside: avoid; background: #f0ede8; border-radius: 6px; padding: 10px 12px; margin-top: 12px; font-size: 8.5pt; }

    .entry-list { list-style: none; }
    .entry-list li { break-inside: avoid; padding: 5px 0; border-bottom: 1px dotted #ddd; font-size: 9.5pt; }
    .entry-list li:last-child { border-bottom: none; }
    .entry-icon { margin-right: 4px; }
    .entry-meta { color: #777; font-size: 8.5pt; float: right; }

    .calendar-row { break-inside: avoid; display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dotted #ddd; }
    .calendar-row:last-child { border-bottom: none; }
    .date-badge { color: #fff; border-radius: 5px; width: 42px; height: 42px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .date-badge-month { font-size: 6.5pt; font-weight: 700; letter-spacing: 0.04em; }
    .date-badge-day { font-size: 13pt; font-weight: 700; line-height: 1; }
    .date-badge-day-sm { font-size: 6pt; font-weight: 600; text-align: center; line-height: 1.1; }
    .calendar-title { font-weight: 700; font-size: 9.5pt; }

    .give-card { break-inside: avoid; color: #fff; text-align: center; }
    .give-title { color: #fff; }
    .give-body { margin-bottom: 10px; }
    .qr { width: 90px; height: 90px; margin-top: 4px; background: #fff; padding: 6px; border-radius: 6px; }

    .footer { background: ${colors.primary}; color: rgba(255,255,255,0.75); padding: 10px 24px; font-size: 7.5pt; text-align: center; letter-spacing: 0.04em; text-transform: uppercase; }
  </style></head>
  <body>
    <div class="cover">
      <div class="masthead">
        <div class="masthead-main">
          <div class="masthead-issue">${escapeHtml(monthLabel)} ${issue.year}</div>
          <div class="masthead-title-row">
            ${logo}
            <div class="masthead-title">${escapeHtml(ministry?.name || "")} Journal</div>
          </div>
          ${issue.theme ? `<div class="masthead-theme">${escapeHtml(issue.theme)}</div>` : ""}
          ${ministry?.tagline ? `<div class="masthead-sub">${escapeHtml(ministry.tagline)}</div>` : ""}
        </div>
        ${coverPhotosHtml ? `<div class="masthead-photos">${coverPhotosHtml}</div>` : ""}
      </div>
      <div class="masthead-divider"></div>
      ${
        !forEmail && tocItems
          ? `<div class="cover-toc"><div class="cover-toc-title">Inside This Issue</div><div class="cover-toc-list">${tocItems}</div></div>`
          : ""
      }
    </div>
    <div class="grid">
      ${sectionHtml}
    </div>
    <div class="footer">${escapeHtml(ministry?.name || "")} · ${escapeHtml(monthLabel)} ${issue.year}</div>
  </body></html>`;
};

const exportNewsletterAsPdf = async ({ issue, ministry }) => {
  const html = await buildNewsletterHtml(issue, ministry);
  return renderHtmlToPdf(html, {
    margin: { top: "0.3in", bottom: "0.3in", left: "0.3in", right: "0.3in" },
  });
};

// For pasting into Mailchimp — no PDF pagination involved, just the raw
// HTML the issue's content assembles into.
const exportNewsletterAsHtml = async ({ issue, ministry }) => buildNewsletterHtml(issue, ministry, { forEmail: true });

module.exports = { buildNewsletterHtml, exportNewsletterAsPdf, exportNewsletterAsHtml };
