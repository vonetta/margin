const { escapeHtml, resolveColors, renderLogo } = require("../layouts/shared");
const { generateQRCode } = require("../qrService");

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

const orderedEnabledSections = (issue) =>
  [...issue.sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order);

module.exports = {
  MONTH_NAMES,
  formatDay,
  formatShortDate,
  formatDateRange,
  orderedEnabledSections,
  escapeHtml,
  resolveColors,
  renderLogo,
  generateQRCode,
};
