const { connectTestDB } = require("../../testHelpers/db");
const Ministry = require("../../models/Ministry");
const Event = require("../../models/Event");
const Person = require("../../models/Person");
const {
  DEFAULT_SECTIONS,
  buildDefaultSections,
  getMonthCalendarEntries,
  getMonthBirthdays,
} = require("../../services/newsletterService");

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "nl-svc-test" });
  await Event.deleteMany({ ministry_id: "nl-svc-test" });
  await Person.deleteMany({ ministry_id: "nl-svc-test" });
});

beforeEach(async () => {
  await Event.deleteMany({ ministry_id: "nl-svc-test" });
  await Person.deleteMany({ ministry_id: "nl-svc-test" });
});

describe("getMonthCalendarEntries", () => {
  it("includes a one-off public approved event that falls in the target month", async () => {
    await Event.create({
      ministry_id: "nl-svc-test",
      title: "Sunday Service",
      start: new Date("2026-07-12T18:00:00Z"),
      visibility: "public",
      status: "approved",
    });

    const entries = await getMonthCalendarEntries("nl-svc-test", 7, 2026);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "Sunday Service", recurring_note: null });
  });

  it("excludes a one-off event outside the target month", async () => {
    await Event.create({
      ministry_id: "nl-svc-test",
      title: "August Event",
      start: new Date("2026-08-01T18:00:00Z"),
      visibility: "public",
      status: "approved",
    });

    const entries = await getMonthCalendarEntries("nl-svc-test", 7, 2026);
    expect(entries).toHaveLength(0);
  });

  it("excludes internal events even if approved and in-range", async () => {
    await Event.create({
      ministry_id: "nl-svc-test",
      title: "Staff Prayer Call",
      start: new Date("2026-07-12T18:00:00Z"),
      visibility: "internal",
      status: "approved",
    });

    const entries = await getMonthCalendarEntries("nl-svc-test", 7, 2026);
    expect(entries).toHaveLength(0);
  });

  it("excludes pending (unapproved) events", async () => {
    await Event.create({
      ministry_id: "nl-svc-test",
      title: "Not Yet Approved",
      start: new Date("2026-07-12T18:00:00Z"),
      visibility: "public",
      status: "pending",
    });

    const entries = await getMonthCalendarEntries("nl-svc-test", 7, 2026);
    expect(entries).toHaveLength(0);
  });

  it("collapses a recurring event into a single summarized entry with no expanded occurrences", async () => {
    await Event.create({
      ministry_id: "nl-svc-test",
      title: "Weekly Bible Study",
      start: new Date("2026-01-06T18:00:00Z"),
      recurrence_rule: "FREQ=WEEKLY",
      visibility: "public",
      status: "approved",
    });

    const entries = await getMonthCalendarEntries("nl-svc-test", 7, 2026);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: "Weekly Bible Study", date: null, recurring_note: "Weekly" });
  });
});

describe("getMonthBirthdays", () => {
  it("includes a consenting person whose birthdate falls in the target month, any year", async () => {
    await Person.create({
      ministry_id: "nl-svc-test",
      name: "Has Consent",
      birthdate: new Date("1990-07-14"),
      newsletter_birthday_consent: true,
    });

    const entries = await getMonthBirthdays("nl-svc-test", 7);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe("Has Consent");
  });

  it("excludes a person with a birthdate but no consent", async () => {
    await Person.create({
      ministry_id: "nl-svc-test",
      name: "No Consent",
      birthdate: new Date("1990-07-14"),
      newsletter_birthday_consent: false,
    });

    const entries = await getMonthBirthdays("nl-svc-test", 7);
    expect(entries).toHaveLength(0);
  });

  it("excludes a consenting person whose birthday is in a different month", async () => {
    await Person.create({
      ministry_id: "nl-svc-test",
      name: "Wrong Month",
      birthdate: new Date("1990-03-14"),
      newsletter_birthday_consent: true,
    });

    const entries = await getMonthBirthdays("nl-svc-test", 7);
    expect(entries).toHaveLength(0);
  });

  it("excludes a person with no birthdate at all", async () => {
    await Person.create({
      ministry_id: "nl-svc-test",
      name: "No Birthdate",
      newsletter_birthday_consent: true,
    });

    const entries = await getMonthBirthdays("nl-svc-test", 7);
    expect(entries).toHaveLength(0);
  });
});

describe("buildDefaultSections", () => {
  it("seeds all 11 default section slots, in order, matching DEFAULT_SECTIONS", async () => {
    const sections = await buildDefaultSections("nl-svc-test", 7, 2026);
    expect(sections).toHaveLength(DEFAULT_SECTIONS.length);
    sections.forEach((s, i) => {
      expect(s.key).toBe(DEFAULT_SECTIONS[i].key);
      expect(s.order).toBe(i);
      expect(s.enabled).toBe(true);
    });
  });

  it("pre-populates the calendar and birthdays sections from real data", async () => {
    await Event.create({
      ministry_id: "nl-svc-test",
      title: "Sunday Service",
      start: new Date("2026-07-12T18:00:00Z"),
      visibility: "public",
      status: "approved",
    });
    await Person.create({
      ministry_id: "nl-svc-test",
      name: "Has Consent",
      birthdate: new Date("1990-07-14"),
      newsletter_birthday_consent: true,
    });

    const sections = await buildDefaultSections("nl-svc-test", 7, 2026);
    const calendar = sections.find((s) => s.key === "calendar");
    const birthdays = sections.find((s) => s.key === "birthdays");

    expect(calendar.content.entries).toHaveLength(1);
    expect(birthdays.content.entries).toHaveLength(1);
  });

  it("leaves freeform sections with blank starting content", async () => {
    const sections = await buildDefaultSections("nl-svc-test", 7, 2026);
    const leaderMessage = sections.find((s) => s.key === "leader_message");
    expect(leaderMessage.content).toEqual({ body: "", photo_url: "" });
  });
});
