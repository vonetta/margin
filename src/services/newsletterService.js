const Event = require("../models/Event");
const Person = require("../models/Person");

// The 11 KTM Journal slots, each mapped onto one of the 6 underlying
// section types (see NewsletterIssue.js) rather than a bespoke layout
// per slot — keeps template rendering to 6 type-renderers instead of 11.
// Sections can still be toggled on/off (or reordered) per issue; this is
// just the starting composition a new issue is seeded with.
const DEFAULT_SECTIONS = [
  { key: "leader_message", type: "text_block", title: "From the Leader" },
  { key: "guest_column", type: "text_block", title: "The Scholar's Desk" },
  { key: "milestones", type: "list_block", title: "Ministry Milestones" },
  { key: "spotlight", type: "spotlight", title: "Faces of the Kingdom" },
  { key: "birthdays", type: "birthdays", title: "Kingdom Birthdays" },
  { key: "calendar", type: "calendar", title: "Kingdom Calendar" },
  { key: "prayer_focus", type: "list_block", title: "Prayer Focus" },
  { key: "resources", type: "list_block", title: "Kingdom Resources" },
  { key: "scripture", type: "text_block", title: "Scripture Meditation" },
  { key: "qa", type: "list_block", title: "Ask the Leader" },
  { key: "give", type: "give_cta", title: "Partner With Us" },
];

const defaultContentFor = (type) => {
  switch (type) {
    case "text_block":
      return { body: "", photo_url: "" };
    case "list_block":
      return { items: [] };
    case "birthdays":
      return { entries: [] };
    case "calendar":
      return { entries: [] };
    case "spotlight":
      return { person_name: "", photo_url: "", bio: "", qa: [] };
    case "give_cta":
      return { body: "", give_url: "" };
    default:
      return {};
  }
};

const describeRecurrence = (rule) => {
  if (!rule) return null;
  if (rule.includes("FREQ=DAILY")) return "Daily";
  if (rule.includes("FREQ=WEEKLY")) return "Weekly";
  if (rule.includes("FREQ=MONTHLY")) return "Monthly";
  return "Recurring";
};

// Only public + approved events — this ends up pasted into a
// congregation-wide Mailchimp send, so internal-only meetings (prayer
// calls, staff planning) must never leak in. Recurring events collapse
// to one entry each ("Weekly", not one row per occurrence) since a
// printed monthly list shouldn't repeat a standing weekly Bible study
// four times; one-off events are only included if they actually fall
// within the issue's month.
const getMonthCalendarEntries = async (ministryId, month, year) => {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const events = await Event.find({
    ministry_id: ministryId,
    visibility: "public",
    status: "approved",
  });

  const entries = [];
  for (const e of events) {
    if (e.recurrence_rule) {
      entries.push({
        title: e.title,
        date: null,
        recurring_note: describeRecurrence(e.recurrence_rule),
        location: e.location || "",
      });
    } else if (e.start >= from && e.start <= to) {
      entries.push({
        title: e.title,
        date: e.start.toISOString(),
        recurring_note: null,
        location: e.location || "",
      });
    }
  }
  return entries;
};

// Only people who've explicitly consented — birthdate existing on the
// roster is not itself permission to broadcast it. "This month" means
// month-of-year match regardless of birth year, so a straight date-range
// query doesn't work; filtered in JS since a ministry's roster is small
// enough that this is simpler than an aggregation pipeline.
const getMonthBirthdays = async (ministryId, month) => {
  const people = await Person.find({
    ministry_id: ministryId,
    active: true,
    newsletter_birthday_consent: true,
    birthdate: { $ne: null },
  });

  return people
    .filter((p) => new Date(p.birthdate).getUTCMonth() + 1 === month)
    .map((p) => ({ name: p.name, date: p.birthdate.toISOString() }))
    .sort((a, b) => new Date(a.date).getUTCDate() - new Date(b.date).getUTCDate());
};

// Builds the starting section list for a brand-new issue — Calendar and
// Birthdays get pre-populated (a snapshot, at creation time) from real
// data; everything else starts blank for the admin to fill in. Once
// created, all of it is just editable data on the issue — pulled entries
// can be edited or removed and new ones added manually the same way.
const buildDefaultSections = async (ministryId, month, year) => {
  const [calendarEntries, birthdayEntries] = await Promise.all([
    getMonthCalendarEntries(ministryId, month, year),
    getMonthBirthdays(ministryId, month),
  ]);

  return DEFAULT_SECTIONS.map((slot, index) => {
    const content = defaultContentFor(slot.type);
    if (slot.type === "calendar") content.entries = calendarEntries;
    if (slot.type === "birthdays") content.entries = birthdayEntries;
    return { ...slot, enabled: true, order: index, content };
  });
};

module.exports = { DEFAULT_SECTIONS, buildDefaultSections, getMonthCalendarEntries, getMonthBirthdays };
