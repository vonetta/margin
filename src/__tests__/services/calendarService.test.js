const {
  isValidRecurrenceRule,
  expandEvent,
  expandEvents,
  parseFlyerDate,
  buildPublicCalendarFeed,
  nextOccurrenceAfter,
  formatFriendlyDate,
  formatFriendlyTime,
  formatFriendlyDateTime,
} = require("../../services/calendarService");

const makeEvent = (overrides = {}) => ({
  _id: "evt1",
  title: "Test Event",
  description: "",
  location: "",
  start: new Date("2026-06-02T18:00:00Z"),
  end: new Date("2026-06-02T19:00:00Z"),
  all_day: false,
  recurrence_rule: null,
  visibility: "internal",
  status: "approved",
  toObject() {
    return { ...this };
  },
  ...overrides,
});

describe("isValidRecurrenceRule", () => {
  it("accepts a valid RRULE string", () => {
    expect(isValidRecurrenceRule("FREQ=WEEKLY;BYDAY=TU,TH")).toBe(true);
  });

  it("accepts null/empty (one-off event)", () => {
    expect(isValidRecurrenceRule(null)).toBe(true);
    expect(isValidRecurrenceRule("")).toBe(true);
  });

  it("rejects garbage", () => {
    expect(isValidRecurrenceRule("NOT A VALID RULE @@@")).toBe(false);
  });
});

describe("expandEvent", () => {
  it("returns the event itself once, for a one-off event in range", () => {
    const event = makeEvent();
    const occurrences = expandEvent(
      event,
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-10T00:00:00Z"),
    );
    expect(occurrences.length).toBe(1);
    expect(occurrences[0].occurrence_start).toEqual(event.start);
  });

  it("returns nothing for a one-off event outside the range", () => {
    const event = makeEvent();
    const occurrences = expandEvent(
      event,
      new Date("2026-07-01T00:00:00Z"),
      new Date("2026-07-10T00:00:00Z"),
    );
    expect(occurrences.length).toBe(0);
  });

  it("expands a twice-weekly recurring event (the prayer call case) correctly", () => {
    const event = makeEvent({ recurrence_rule: "FREQ=WEEKLY;BYDAY=TU,TH" });
    const occurrences = expandEvent(
      event,
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-15T00:00:00Z"),
    );
    // Tue/Thu across two weeks = 4 occurrences
    expect(occurrences.length).toBe(4);
    expect(occurrences.every((o) => o.occurrence_end)).toBe(true);
  });
});

describe("expandEvents", () => {
  it("sorts occurrences from multiple events chronologically", () => {
    const eventA = makeEvent({ _id: "a", start: new Date("2026-06-05T00:00:00Z") });
    const eventB = makeEvent({ _id: "b", start: new Date("2026-06-02T00:00:00Z") });
    const occurrences = expandEvents(
      [eventA, eventB],
      new Date("2026-06-01T00:00:00Z"),
      new Date("2026-06-10T00:00:00Z"),
    );
    expect(occurrences.map((o) => o._id)).toEqual(["b", "a"]);
  });
});

describe("parseFlyerDate", () => {
  it("parses a typical flyer date string into start/end", () => {
    const result = parseFlyerDate("August 15, 2026, 10AM - 4PM");
    expect(result.start).toBeInstanceOf(Date);
    expect(result.start.getUTCMonth()).toBe(7); // August
  });

  it("returns null for empty/unparseable input", () => {
    expect(parseFlyerDate("")).toBeNull();
    expect(parseFlyerDate(undefined)).toBeNull();
  });
});

describe("buildPublicCalendarFeed", () => {
  const ministry = { name: "Test Ministry" };

  it("only includes approved + public events", () => {
    const events = [
      makeEvent({ _id: "public-approved", visibility: "public", status: "approved", title: "Should appear" }),
      makeEvent({ _id: "internal-approved", visibility: "internal", status: "approved", title: "Internal only" }),
      makeEvent({ _id: "public-pending", visibility: "public", status: "pending", title: "Not approved yet" }),
    ];
    const feed = buildPublicCalendarFeed(ministry, events, {
      from: new Date("2026-06-01T00:00:00Z"),
      to: new Date("2026-06-10T00:00:00Z"),
    });
    expect(feed).toContain("Should appear");
    expect(feed).not.toContain("Internal only");
    expect(feed).not.toContain("Not approved yet");
  });

  it("emits a single VEVENT with a native RRULE for a recurring event, not one per occurrence", () => {
    const events = [
      makeEvent({
        _id: "prayer-call",
        visibility: "public",
        status: "approved",
        title: "Prayer Call",
        recurrence_rule: "FREQ=WEEKLY;BYDAY=TU,TH",
      }),
    ];
    const feed = buildPublicCalendarFeed(ministry, events, {
      from: new Date("2026-06-01T00:00:00Z"),
      to: new Date("2026-06-10T00:00:00Z"),
    });
    expect(feed.match(/BEGIN:VEVENT/g).length).toBe(1);
    expect(feed).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU,TH");
  });

  it("produces a valid VCALENDAR document", () => {
    const feed = buildPublicCalendarFeed(ministry, [], {
      from: new Date(),
      to: new Date(),
    });
    expect(feed).toContain("BEGIN:VCALENDAR");
    expect(feed).toContain("END:VCALENDAR");
  });
});

describe("nextOccurrenceAfter", () => {
  it("returns the next weekly occurrence strictly after the given date", () => {
    const next = nextOccurrenceAfter(
      "FREQ=WEEKLY",
      new Date("2026-06-02T18:00:00Z"),
      new Date("2026-06-02T18:00:00Z"),
    );
    expect(next.toISOString()).toBe("2026-06-09T18:00:00.000Z");
  });

  it("returns null for a non-recurring (null) rule", () => {
    expect(nextOccurrenceAfter(null, new Date(), new Date())).toBeNull();
  });

  it("returns null once a bounded recurrence (COUNT) is exhausted", () => {
    const next = nextOccurrenceAfter(
      "FREQ=WEEKLY;COUNT=1",
      new Date("2026-06-02T18:00:00Z"),
      new Date("2026-06-02T18:00:00Z"),
    );
    expect(next).toBeNull();
  });
});

describe("formatFriendlyDate", () => {
  it("reformats a bare YYYY-MM-DD (from the <input type=date> picker) into a readable date", () => {
    expect(formatFriendlyDate("2026-07-16")).toBe("Thursday, July 16, 2026");
  });

  it("leaves already-free-text dates untouched", () => {
    expect(formatFriendlyDate("Sunday, August 2 · 6:00 PM")).toBe(
      "Sunday, August 2 · 6:00 PM",
    );
  });

  it("passes through empty/nullish input unchanged", () => {
    expect(formatFriendlyDate("")).toBe("");
    expect(formatFriendlyDate(undefined)).toBeUndefined();
  });
});

describe("formatFriendlyTime", () => {
  it("reformats a bare HH:MM (from the <input type=time> picker) into 12-hour time", () => {
    expect(formatFriendlyTime("17:00")).toBe("5:00 PM");
    expect(formatFriendlyTime("09:30")).toBe("9:30 AM");
    expect(formatFriendlyTime("00:00")).toBe("12:00 AM");
  });

  it("leaves already-free-text times untouched", () => {
    expect(formatFriendlyTime("around 5ish")).toBe("around 5ish");
  });

  it("passes through empty/nullish input unchanged", () => {
    expect(formatFriendlyTime("")).toBe("");
    expect(formatFriendlyTime(undefined)).toBeUndefined();
  });
});

describe("formatFriendlyDateTime", () => {
  it("combines a date with a single start time", () => {
    expect(formatFriendlyDateTime("2026-07-11", "17:00")).toBe(
      "Saturday, July 11, 2026, 5:00 PM",
    );
  });

  it("combines a date with a start and end time sharing the same meridiem", () => {
    expect(formatFriendlyDateTime("2026-07-11", "17:00", "19:00")).toBe(
      "Saturday, July 11, 2026, 5:00 – 7:00 PM",
    );
  });

  it("shows both meridiems when start and end cross AM/PM", () => {
    expect(formatFriendlyDateTime("2026-07-11", "23:00", "01:00")).toBe(
      "Saturday, July 11, 2026, 11:00 PM – 1:00 AM",
    );
  });

  it("falls back to just the date when no time is given", () => {
    expect(formatFriendlyDateTime("2026-07-11")).toBe("Saturday, July 11, 2026");
  });

  it("falls back to just the time when no date is given", () => {
    expect(formatFriendlyDateTime(undefined, "17:00")).toBe("5:00 PM");
  });

  it("leaves an already-free-text date untouched even with a time provided", () => {
    expect(formatFriendlyDateTime("Sunday, August 2", "18:00")).toBe(
      "Sunday, August 2, 6:00 PM",
    );
  });
});
