const { RRule } = require("rrule");
const ical = require("ical-generator").default;
const chrono = require("chrono-node");

// recurrence_rule is stored as just the RRULE portion (e.g.
// "FREQ=WEEKLY;BYDAY=TU,TH"), not the full RFC 5545 block — the event's
// own `start` field is always the recurrence anchor, so re-attaching it
// here avoids two sources of truth for when the series begins.
const buildRule = (event) => {
  if (!event.recurrence_rule) return null;
  const opts = RRule.parseString(event.recurrence_rule);
  return new RRule({ ...opts, dtstart: event.start });
};

// Validates a recurrence rule string can actually be parsed, without
// needing a real event to anchor it to.
const isValidRecurrenceRule = (ruleString) => {
  if (!ruleString) return true;
  try {
    RRule.parseString(ruleString);
    return true;
  } catch {
    return false;
  }
};

const durationMs = (event) =>
  event.end ? event.end.getTime() - event.start.getTime() : 0;

// Generic version of buildRule that isn't tied to the Event shape —
// Tasks recur off recurrence_rule + due_date rather than start/end, but
// it's the same RRULE mechanics.
const nextOccurrenceAfter = (ruleString, anchorDate, afterDate) => {
  if (!ruleString || !anchorDate) return null;
  const opts = RRule.parseString(ruleString);
  const rule = new RRule({ ...opts, dtstart: anchorDate });
  return rule.after(afterDate, false);
};

// Expands one stored Event document into its actual occurrences within
// [from, to]. A one-off event yields itself (if it falls in range); a
// recurring one yields every occurrence the RRULE produces in that window.
const expandEvent = (event, from, to) => {
  const rule = buildRule(event);
  if (!rule) {
    if (event.start >= from && event.start <= to) {
      return [{ ...event.toObject(), occurrence_start: event.start, occurrence_end: event.end || null }];
    }
    return [];
  }

  const dur = durationMs(event);
  return rule.between(from, to, true).map((occurrenceStart) => ({
    ...event.toObject(),
    occurrence_start: occurrenceStart,
    occurrence_end: dur ? new Date(occurrenceStart.getTime() + dur) : null,
  }));
};

// Expands a whole list of Event documents into occurrences within
// [from, to], sorted chronologically — what the calendar UI actually
// renders.
const expandEvents = (events, from, to) => {
  const occurrences = events.flatMap((e) => expandEvent(e, from, to));
  occurrences.sort((a, b) => a.occurrence_start - b.occurrence_start);
  return occurrences;
};

// Best-effort: turn a flyer's free-text date string ("August 15, 2026,
// 10AM - 4PM") into a real start/end Date. This feeds a *pending* calendar
// event that a human reviews before it's approved — getting it slightly
// wrong isn't dangerous, the approval step exists specifically to catch
// that, so "best effort" is an acceptable bar here.
const parseFlyerDate = (dateText) => {
  if (!dateText) return null;
  const results = chrono.parse(dateText, new Date(), { forwardDate: true });
  if (!results.length) return null;
  const r = results[0];
  const start = r.start ? r.start.date() : null;
  const end = r.end ? r.end.date() : null;
  if (!start) return null;
  return { start, end: end || null };
};

// Builds a public .ics feed for a single ministry — approved + public
// events only. This is what a WordPress calendar plugin (or Google/Apple/
// Outlook) subscribes to via URL; it must never include internal-only or
// pending/rejected events.
const buildPublicCalendarFeed = (ministry, events, { from, to }) => {
  const calendar = ical({
    name: `${ministry.name} — Public Events`,
    timezone: "UTC",
  });

  const publicApproved = events.filter(
    (e) =>
      e.visibility === "public" &&
      e.status === "approved" &&
      // A recurring event's own RRULE governs which occurrences are real
      // (and is handed to the calendar client to expand, not expanded
      // here) — only one-off events need the from/to window applied.
      (e.recurrence_rule || (e.start >= from && e.start <= to)),
  );

  for (const event of publicApproved) {
    calendar.createEvent({
      start: event.start,
      end: event.end || event.start,
      allDay: event.all_day,
      summary: event.title,
      description: event.description || "",
      location: event.location || "",
      id: event._id.toString(),
      repeating: event.recurrence_rule || undefined,
    });
  }

  return calendar.toString();
};

// The flyer wizard's date picker is a bare <input type="date">, which
// submits "YYYY-MM-DD" — fine as data, but rendered verbatim on a flyer
// (template or AI-generated) it reads as raw system output, not something
// a designer typed. Reformat only that exact bare-ISO shape; anything
// already free text (e.g. "Sunday, August 2 · 6:00 PM" from an API call)
// is left untouched rather than risk mangling it.
const formatFriendlyDate = (raw) => {
  if (!raw || typeof raw !== "string") return raw;
  const match = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

// Formats a bare "HH:MM" (24h) time, the shape a native <input type="time">
// submits, into "5:00 PM" — anything else (already-free-text, empty) is
// left untouched, same conservative posture as formatFriendlyDate.
const formatFriendlyTime = (raw) => {
  if (!raw || typeof raw !== "string") return raw;
  const match = raw.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return raw;
  const [, h, m] = match;
  const date = new Date(2000, 0, 1, Number(h), Number(m));
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

// Combines a bare-ISO date with optional start/end times into one display
// string for a flyer — "Saturday, July 11, 2026, 5:00 – 7:00 PM" — since
// every layout and the AI Studio prompt both just display whatever ends
// up in content.date as one line; this is the single place that decides
// how date+time gets worded, so every render path stays consistent.
const formatFriendlyDateTime = (dateRaw, timeRaw, endTimeRaw) => {
  const friendlyDate = formatFriendlyDate(dateRaw);
  const start = formatFriendlyTime(timeRaw);
  const end = formatFriendlyTime(endTimeRaw);

  if (!start) return friendlyDate;

  // "5:00 – 7:00 PM" when both share AM/PM, else "11:00 AM – 1:00 PM".
  let timePart = start;
  if (end) {
    const [startNum, startMeridiem] = start.split(" ");
    const [, endMeridiem] = end.split(" ");
    timePart =
      startMeridiem === endMeridiem ? `${startNum} – ${end}` : `${start} – ${end}`;
  }

  return friendlyDate ? `${friendlyDate}, ${timePart}` : timePart;
};

module.exports = {
  buildRule,
  isValidRecurrenceRule,
  expandEvent,
  expandEvents,
  parseFlyerDate,
  buildPublicCalendarFeed,
  nextOccurrenceAfter,
  formatFriendlyTime,
  formatFriendlyDateTime,
  formatFriendlyDate,
};
