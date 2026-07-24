const {
  MONTH_NAMES,
  formatDay,
  formatDateRange,
  orderedEnabledSections,
  escapeHtml,
  resolveColors,
  renderLogo,
  generateQRCode,
} = require("./shared");

const meta = {
  name: "Bold",
  description: "Single-column, high-contrast layout with full-width color-block section headers.",
};

const dateBadge = (iso, colors) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `<div class="date-badge" style="background:${colors.accent}">
      <div class="date-badge-month">${MONTH_NAMES[d.getUTCMonth()].slice(0, 3).toUpperCase()}</div>
      <div class="date-badge-day">${d.getUTCDate()}</div>
    </div>`;
};

const sectionHeader = (title, colors) =>
  `<div class="section-header" style="background:${colors.primary}">${escapeHtml(title)}</div>`;

const renderTextBlock = (section, colors) => {
  const { byline, title, subtitle, body, key_takeaways, quote, saying, signature, blog_note, photo_url } =
    section.content || {};
  const takeaways = key_takeaways || [];
  return `
    <div class="block">
      ${sectionHeader(section.title, colors)}
      <div class="block-body">
        ${byline ? `<div class="byline">${escapeHtml(byline)}</div>` : ""}
        ${photo_url ? `<img class="section-photo" src="${photo_url}" alt="" />` : ""}
        ${title ? `<div class="block-title">${escapeHtml(title)}</div>` : ""}
        ${subtitle ? `<div class="block-subtitle">${escapeHtml(subtitle)}</div>` : ""}
        <div class="block-text">${escapeHtml(body || "")}</div>
        ${
          takeaways.length > 0
            ? `<div class="takeaways" style="border-color:${colors.accent}">
                 <div class="takeaways-title" style="color:${colors.accent}">Key Takeaways</div>
                 <ul>${takeaways.map((t) => `<li><span class="check" style="color:${colors.accent}">✓</span>${escapeHtml(t)}</li>`).join("")}</ul>
               </div>`
            : ""
        }
        ${saying ? `<div class="saying" style="color:${colors.accent}">${escapeHtml(saying)}</div>` : ""}
        ${signature ? `<div class="signature" style="color:${colors.accent}">${escapeHtml(signature)}</div>` : ""}
        ${quote ? `<div class="pull-quote" style="background:${colors.accent}">${escapeHtml(quote)}</div>` : ""}
        ${blog_note ? `<div class="blog-note">🌐 ${escapeHtml(blog_note)}</div>` : ""}
      </div>
    </div>`;
};

const renderListBlock = (section, colors) => {
  const items = section.content?.items || [];
  if (items.length === 0) return "";
  return `
    <div class="block">
      ${sectionHeader(section.title, colors)}
      <div class="block-body">
        <ul class="checklist">
          ${items
            .map(
              (item) =>
                `<li><span class="check" style="color:${colors.accent}">✓</span><span><strong>${escapeHtml(item.heading || "")}</strong>${
                  item.body ? ` — ${escapeHtml(item.body)}` : ""
                }</span></li>`,
            )
            .join("")}
        </ul>
      </div>
    </div>`;
};

const renderBirthdays = (section, colors) => {
  const entries = section.content?.entries || [];
  if (entries.length === 0) return "";
  return `
    <div class="block">
      ${sectionHeader(section.title, colors)}
      <div class="block-body">
        <ul class="entry-list">
          ${entries
            .map(
              (e) =>
                `<li><span class="entry-icon">🎂</span> ${escapeHtml(e.name)} <span class="entry-meta">${escapeHtml(formatDay(e.date))}</span></li>`,
            )
            .join("")}
        </ul>
      </div>
    </div>`;
};

const renderCalendar = (section, colors) => {
  const entries = section.content?.entries || [];
  if (entries.length === 0) return "";
  return `
    <div class="block">
      ${sectionHeader(section.title, colors)}
      <div class="block-body">
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
      </div>
    </div>`;
};

const renderSpotlight = (section, colors) => {
  const { person_name, photo_url, bio, qa } = section.content || {};
  if (!person_name && !bio) return "";
  return `
    <div class="block spotlight-block">
      ${sectionHeader(section.title, colors)}
      <div class="block-body" style="text-align:center">
        ${photo_url ? `<img class="section-photo-circle" src="${photo_url}" alt="" style="border-color:${colors.accent}" />` : ""}
        <div class="spotlight-name" style="color:${colors.accent}">${escapeHtml(person_name || "")}</div>
        <div class="block-text">${escapeHtml(bio || "")}</div>
        ${(qa || [])
          .map(
            (item) =>
              `<div class="qa-item" style="text-align:left"><div class="qa-question" style="color:${colors.accent}">${escapeHtml(
                item.question,
              )}</div><div>${escapeHtml(item.answer)}</div></div>`,
          )
          .join("")}
      </div>
    </div>`;
};

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
    <div class="give-block" style="background:${colors.accent}">
      <div class="give-title">${escapeHtml(section.title)}</div>
      <div class="give-body">${escapeHtml(body || "")}</div>
      ${qrImg}
    </div>`;
};

const renderSection = async (section, colors) => {
  switch (section.type) {
    case "text_block":
      return renderTextBlock(section, colors);
    case "list_block":
      return renderListBlock(section, colors);
    case "birthdays":
      return renderBirthdays(section, colors);
    case "calendar":
      return renderCalendar(section, colors);
    case "spotlight":
      return renderSpotlight(section, colors);
    case "give_cta":
      return renderGiveCta(section, colors);
    default:
      return "";
  }
};

const render = async (issue, ministry, { forEmail = false } = {}) => {
  const colors = resolveColors(ministry?.branding);
  const logo = renderLogo(ministry?.branding?.logo_url, 48);
  const monthLabel = MONTH_NAMES[issue.month - 1] || "";

  const orderedSections = orderedEnabledSections(issue);
  const sectionHtml = (await Promise.all(orderedSections.map((s) => renderSection(s, colors))))
    .filter(Boolean)
    .join("\n");
  // Single-column flow, so — unlike Classic's multi-column grid — there's
  // no PDF page-fragmentation risk here; still kept email-only for one
  // predictable rule across every template rather than a per-template
  // exception.
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
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: "Montserrat", Georgia, serif; color: #1c1c1c; font-size: 10.5pt; line-height: 1.65; }

    .masthead { background: ${colors.primary}; color: #fff; padding: 36px 28px; text-align: center; }
    .masthead-issue { font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.6; margin-bottom: 14px; }
    .logo { height: 48px; margin-bottom: 14px; }
    .masthead-title { font-family: "Cinzel", Georgia, serif; font-size: 34pt; font-weight: 700; letter-spacing: 0.01em; line-height: 1.1; }
    .masthead-theme { display: inline-block; margin-top: 16px; padding: 8px 20px; background: ${colors.accent}; color: #fff; font-weight: 700; text-transform: uppercase; font-size: 10pt; letter-spacing: 0.06em; border-radius: 2px; }
    .masthead-sub { font-size: 8pt; color: rgba(255,255,255,0.75); letter-spacing: 0.12em; text-transform: uppercase; margin-top: 16px; }
    .masthead-photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 20px; }
    .masthead-photo { width: 100%; height: 90px; object-fit: cover; object-position: center 20%; display: block; }

    .content { padding: 28px 24px; }

    .block { margin-bottom: 26px; break-inside: avoid; }
    .section-header { color: #fff; font-family: "Montserrat", sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 12pt; padding: 10px 16px; }
    .block-body { padding: 16px 4px 0; }
    .block-text { white-space: pre-wrap; word-wrap: break-word; }

    .byline { font-size: 8.5pt; font-style: italic; color: #777; margin-bottom: 8px; }
    .section-photo { max-width: 100%; border-radius: 4px; margin-bottom: 12px; }
    .section-photo-circle { width: 110px; height: 110px; object-fit: cover; border-radius: 50%; margin: 0 auto 12px; display: block; border: 4px solid; }
    .spotlight-name { font-family: "Cinzel", Georgia, serif; font-size: 15pt; font-weight: 700; margin-bottom: 8px; }
    .qa-item { margin-top: 12px; font-size: 9.5pt; }
    .qa-question { font-weight: 700; }

    .block-title { font-size: 17pt; font-weight: 800; margin-bottom: 4px; }
    .block-subtitle { font-size: 10pt; font-weight: 600; color: #555; margin-bottom: 12px; }

    .takeaways { border: 2px solid; border-radius: 4px; padding: 14px 16px; margin: 14px 0; }
    .takeaways-title { font-size: 8.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
    .takeaways ul, .checklist { list-style: none; }
    .takeaways li, .checklist li { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; font-size: 10pt; }
    .check { font-weight: 800; flex-shrink: 0; }

    .saying { font-style: italic; font-weight: 600; margin-top: 12px; }
    .signature { font-style: italic; font-weight: 800; font-size: 15pt; margin-top: 6px; }
    .pull-quote { color: #fff; font-weight: 800; text-align: center; padding: 20px; margin-top: 16px; font-size: 13pt; line-height: 1.5; }
    .blog-note { background: #f0ede8; border-radius: 4px; padding: 12px 14px; margin-top: 14px; font-size: 9pt; }

    .entry-list { list-style: none; }
    .entry-list li { padding: 8px 0; border-bottom: 1px solid #eee; font-size: 10.5pt; }
    .entry-list li:last-child { border-bottom: none; }
    .entry-icon { margin-right: 6px; }
    .entry-meta { color: #777; font-size: 9pt; float: right; }

    .calendar-row { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid #eee; }
    .calendar-row:last-child { border-bottom: none; }
    .date-badge { color: #fff; border-radius: 4px; width: 50px; height: 50px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .date-badge-month { font-size: 7pt; font-weight: 800; letter-spacing: 0.04em; }
    .date-badge-day { font-size: 15pt; font-weight: 800; line-height: 1; }
    .date-badge-day-sm { font-size: 6.5pt; font-weight: 700; text-align: center; line-height: 1.1; }
    .calendar-title { font-weight: 800; font-size: 10.5pt; }

    .give-block { break-inside: avoid; color: #fff; text-align: center; padding: 28px 24px; margin: 8px 0 0; }
    .give-title { font-family: "Montserrat", sans-serif; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; font-size: 13pt; margin-bottom: 10px; }
    .give-body { margin-bottom: 14px; }
    .qr { width: 100px; height: 100px; margin-top: 4px; background: #fff; padding: 8px; border-radius: 4px; }

    .footer { background: ${colors.primary}; color: rgba(255,255,255,0.75); padding: 12px 24px; font-size: 8pt; text-align: center; letter-spacing: 0.06em; text-transform: uppercase; }
  </style></head>
  <body>
    <div class="masthead">
      <div class="masthead-issue">${escapeHtml(monthLabel)} ${issue.year}</div>
      ${logo}
      <div class="masthead-title">${escapeHtml(ministry?.name || "")} Journal</div>
      ${issue.theme ? `<div class="masthead-theme">${escapeHtml(issue.theme)}</div>` : ""}
      ${ministry?.tagline ? `<div class="masthead-sub">${escapeHtml(ministry.tagline)}</div>` : ""}
      ${coverPhotosHtml ? `<div class="masthead-photos">${coverPhotosHtml}</div>` : ""}
    </div>
    <div class="content">
      ${sectionHtml}
    </div>
    <div class="footer">${escapeHtml(ministry?.name || "")} · ${escapeHtml(monthLabel)} ${issue.year}</div>
  </body></html>`;
};

module.exports = { meta, render };
