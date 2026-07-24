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
  name: "Minimal",
  description: "Quiet single-column layout — plain typographic hierarchy, hairline rules, no color blocking.",
};

const renderTextBlock = (section, colors) => {
  const { byline, title, subtitle, body, key_takeaways, quote, saying, signature, blog_note, photo_url } =
    section.content || {};
  const takeaways = key_takeaways || [];
  return `
    <div class="block">
      <div class="block-title-row">${escapeHtml(section.title)}</div>
      ${byline ? `<div class="byline">${escapeHtml(byline)}</div>` : ""}
      ${photo_url ? `<img class="section-photo" src="${photo_url}" alt="" />` : ""}
      ${title ? `<div class="article-title">${escapeHtml(title)}</div>` : ""}
      ${subtitle ? `<div class="article-subtitle">${escapeHtml(subtitle)}</div>` : ""}
      <div class="block-text">${escapeHtml(body || "")}</div>
      ${
        takeaways.length > 0
          ? `<div class="takeaways">
               <div class="takeaways-title">Key Takeaways</div>
               <ul>${takeaways.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>
             </div>`
          : ""
      }
      ${saying ? `<div class="saying">${escapeHtml(saying)}</div>` : ""}
      ${signature ? `<div class="signature">${escapeHtml(signature)}</div>` : ""}
      ${quote ? `<div class="pull-quote" style="border-color:${colors.accent}">${escapeHtml(quote)}</div>` : ""}
      ${blog_note ? `<div class="blog-note">${escapeHtml(blog_note)}</div>` : ""}
    </div>`;
};

const renderListBlock = (section) => {
  const items = section.content?.items || [];
  if (items.length === 0) return "";
  return `
    <div class="block">
      <div class="block-title-row">${escapeHtml(section.title)}</div>
      <ul class="plain-list">
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
    <div class="block">
      <div class="block-title-row">${escapeHtml(section.title)}</div>
      <ul class="entry-list">
        ${entries
          .map(
            (e) =>
              `<li>${escapeHtml(e.name)} <span class="entry-meta">${escapeHtml(formatDay(e.date))}</span></li>`,
          )
          .join("")}
      </ul>
    </div>`;
};

const renderCalendar = (section) => {
  const entries = section.content?.entries || [];
  if (entries.length === 0) return "";
  return `
    <div class="block">
      <div class="block-title-row">${escapeHtml(section.title)}</div>
      <ul class="entry-list">
        ${entries
          .map((e) => {
            const when = e.recurring_note ? escapeHtml(e.recurring_note) : escapeHtml(formatDateRange(e.start_date, e.end_date));
            return `<li><strong>${escapeHtml(e.title)}</strong> <span class="entry-meta">${when}${e.location ? ` · ${escapeHtml(e.location)}` : ""}</span></li>`;
          })
          .join("")}
      </ul>
    </div>`;
};

const renderSpotlight = (section) => {
  const { person_name, photo_url, bio, qa } = section.content || {};
  if (!person_name && !bio) return "";
  return `
    <div class="block">
      <div class="block-title-row">${escapeHtml(section.title)}</div>
      ${photo_url ? `<img class="section-photo-circle" src="${photo_url}" alt="" />` : ""}
      <div class="article-title">${escapeHtml(person_name || "")}</div>
      <div class="block-text">${escapeHtml(bio || "")}</div>
      ${(qa || [])
        .map(
          (item) =>
            `<div class="qa-item"><strong>${escapeHtml(item.question)}</strong><div>${escapeHtml(item.answer)}</div></div>`,
        )
        .join("")}
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
    <div class="block give-block" style="border-top-color:${colors.accent}">
      <div class="block-title-row">${escapeHtml(section.title)}</div>
      <div class="block-text">${escapeHtml(body || "")}</div>
      ${qrImg}
    </div>`;
};

const renderSection = async (section, colors) => {
  switch (section.type) {
    case "text_block":
      return renderTextBlock(section, colors);
    case "list_block":
      return renderListBlock(section);
    case "birthdays":
      return renderBirthdays(section);
    case "calendar":
      return renderCalendar(section);
    case "spotlight":
      return renderSpotlight(section);
    case "give_cta":
      return renderGiveCta(section, colors);
    default:
      return "";
  }
};

const render = async (issue, ministry, { forEmail = false } = {}) => {
  const colors = resolveColors(ministry?.branding);
  const logo = renderLogo(ministry?.branding?.logo_url, 36);
  const monthLabel = MONTH_NAMES[issue.month - 1] || "";

  const orderedSections = orderedEnabledSections(issue);
  const sectionHtml = (await Promise.all(orderedSections.map((s) => renderSection(s, colors))))
    .filter(Boolean)
    .join("\n");
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
  <link href="https://fonts.googleapis.com/css2?family=Georgia&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Georgia, "Montserrat", serif; color: #222; font-size: 10.5pt; line-height: 1.7; }

    .page { max-width: 620px; margin: 0 auto; padding: 40px 32px; }

    .masthead { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #ccc; margin-bottom: 28px; }
    .masthead-issue { font-family: "Montserrat", sans-serif; font-size: 8pt; letter-spacing: 0.16em; text-transform: uppercase; color: #999; margin-bottom: 10px; }
    .logo { height: 36px; margin-bottom: 10px; }
    .masthead-title { font-family: Georgia, serif; font-size: 24pt; font-weight: 400; letter-spacing: 0.01em; }
    .masthead-theme { font-style: italic; font-size: 12pt; color: #555; margin-top: 8px; }
    .masthead-sub { font-family: "Montserrat", sans-serif; font-size: 7.5pt; color: #999; letter-spacing: 0.12em; text-transform: uppercase; margin-top: 10px; }
    .masthead-photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 16px; }
    .masthead-photo { width: 100%; height: 60px; object-fit: cover; object-position: center 20%; display: block; filter: grayscale(15%); }

    .block { margin-bottom: 30px; break-inside: avoid; }
    .block-title-row { font-family: "Montserrat", sans-serif; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e5e5; }
    .block-text { white-space: pre-wrap; word-wrap: break-word; }

    .byline { font-size: 8.5pt; font-style: italic; color: #888; margin-bottom: 8px; }
    .section-photo { max-width: 100%; margin-bottom: 12px; filter: grayscale(10%); }
    .section-photo-circle { width: 80px; height: 80px; object-fit: cover; border-radius: 50%; margin-bottom: 10px; display: block; filter: grayscale(10%); }
    .article-title { font-size: 15pt; font-weight: 400; margin-bottom: 4px; }
    .article-subtitle { font-family: "Montserrat", sans-serif; font-size: 9pt; color: #777; margin-bottom: 12px; }
    .qa-item { margin-top: 12px; font-size: 9.5pt; }

    .takeaways { margin: 14px 0; padding-left: 16px; }
    .takeaways-title { font-family: "Montserrat", sans-serif; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #999; margin-bottom: 8px; }
    .takeaways ul, .plain-list { list-style: disc; padding-left: 18px; }
    .takeaways li, .plain-list li { margin-bottom: 6px; font-size: 10pt; }

    .saying { font-style: italic; margin-top: 12px; color: #555; }
    .signature { font-style: italic; font-weight: 600; font-size: 12pt; margin-top: 6px; }
    .pull-quote { border-left: 3px solid; padding-left: 16px; margin-top: 16px; font-size: 11.5pt; font-style: italic; line-height: 1.6; }
    .blog-note { color: #777; margin-top: 12px; font-size: 9pt; font-style: italic; }

    .entry-list { list-style: none; }
    .entry-list li { padding: 7px 0; border-bottom: 1px solid #eee; font-size: 10pt; }
    .entry-list li:last-child { border-bottom: none; }
    .entry-meta { color: #999; font-size: 8.5pt; float: right; }

    .give-block { border-top: 1px solid; padding-top: 20px; text-align: center; }
    .qr { width: 84px; height: 84px; margin-top: 12px; }

    .footer { text-align: center; color: #999; font-family: "Montserrat", sans-serif; font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 30px; padding-top: 16px; border-top: 1px solid #e5e5e5; }
  </style></head>
  <body>
    <div class="page">
      <div class="masthead">
        <div class="masthead-issue">${escapeHtml(monthLabel)} ${issue.year}</div>
        ${logo}
        <div class="masthead-title">${escapeHtml(ministry?.name || "")} Journal</div>
        ${issue.theme ? `<div class="masthead-theme">${escapeHtml(issue.theme)}</div>` : ""}
        ${ministry?.tagline ? `<div class="masthead-sub">${escapeHtml(ministry.tagline)}</div>` : ""}
        ${coverPhotosHtml ? `<div class="masthead-photos">${coverPhotosHtml}</div>` : ""}
      </div>
      ${sectionHtml}
      <div class="footer">${escapeHtml(ministry?.name || "")} · ${escapeHtml(monthLabel)} ${issue.year}</div>
    </div>
  </body></html>`;
};

module.exports = { meta, render };
