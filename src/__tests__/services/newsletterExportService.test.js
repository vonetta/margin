const mockRenderHtmlToPdf = jest.fn().mockResolvedValue(Buffer.from("fake-pdf"));
jest.mock("../../services/flyerRenderer", () => ({
  renderHtmlToPdf: (...args) => mockRenderHtmlToPdf(...args),
}));

const mockGenerateQRCode = jest.fn().mockResolvedValue("data:image/png;base64,fakeqr");
jest.mock("../../services/qrService", () => ({
  generateQRCode: (...args) => mockGenerateQRCode(...args),
}));

const { buildNewsletterHtml, exportNewsletterAsPdf, exportNewsletterAsHtml } = require("../../services/newsletterExportService");

const ministry = {
  name: "KTM Ministries",
  tagline: "Equipping leaders",
  branding: { colors: { primary: "#1a1a2e", accent: "#e94560", gold: "#f5a623" } },
};

const baseIssue = (sections) => ({
  month: 7,
  year: 2026,
  theme: "Kingdom Strength",
  sections,
});

beforeEach(() => {
  mockRenderHtmlToPdf.mockClear();
  mockGenerateQRCode.mockClear();
});

describe("buildNewsletterHtml", () => {
  it("includes the ministry name, month/year, and theme in the masthead", async () => {
    const html = await buildNewsletterHtml(baseIssue([]), ministry);
    expect(html).toContain("KTM Ministries");
    expect(html).toContain("July 2026");
    expect(html).toContain("Kingdom Strength");
  });

  it("includes a table-of-contents bar listing the enabled sections' titles", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        { key: "leader_message", type: "text_block", title: "From the Leader", enabled: true, order: 0, content: { body: "" } },
        { key: "milestones", type: "list_block", title: "Ministry Milestones", enabled: true, order: 1, content: { items: [] } },
      ]),
      ministry,
    );
    expect(html).toContain("Inside This Issue");
    expect(html).toContain("From the Leader");
    expect(html).toContain("Ministry Milestones");
  });

  it("omits a disabled section from the table of contents", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        { key: "leader_message", type: "text_block", title: "From the Leader", enabled: false, order: 0, content: { body: "" } },
      ]),
      ministry,
    );
    expect(html.split("Inside This Issue")[1] || "").not.toContain("From the Leader");
  });

  it("omits the Inside This Issue cover panel for the email export", async () => {
    const html = await buildNewsletterHtml(baseIssue([]), ministry, { forEmail: true });
    expect(html).not.toContain("Inside This Issue");
  });

  it("renders a masthead photo collage only for the email export", async () => {
    const issue = { ...baseIssue([]), cover_photos: ["https://example.com/a.jpg", "https://example.com/b.jpg"] };

    const emailHtml = await buildNewsletterHtml(issue, ministry, { forEmail: true });
    expect(emailHtml).toContain('class="masthead-photos"');
    expect(emailHtml).toContain('src="https://example.com/a.jpg"');

    const printHtml = await buildNewsletterHtml(issue, ministry, { forEmail: false });
    expect(printHtml).not.toContain('class="masthead-photos"');
  });

  it("caps the masthead photo collage at 4 photos", async () => {
    const cover_photos = Array.from({ length: 9 }, (_, i) => `https://example.com/${i}.jpg`);
    const html = await buildNewsletterHtml({ ...baseIssue([]), cover_photos }, ministry, { forEmail: true });
    expect((html.match(/class="masthead-photo"/g) || []).length).toBe(4);
  });

  it("renders a date badge for a same-day calendar entry", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "calendar",
          type: "calendar",
          title: "Kingdom Calendar",
          enabled: true,
          order: 0,
          content: {
            entries: [
              { title: "Sunday Service", start_date: "2026-07-12T18:00:00Z", end_date: null, recurring_note: null, location: "" },
            ],
          },
        },
      ]),
      ministry,
    );
    expect(html).toContain("date-badge");
    expect(html).toContain("JUL");
    expect(html).toContain("12");
  });

  it("gives the give_cta section a filled ministry-color background", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "give",
          type: "give_cta",
          title: "Partner With Us",
          enabled: true,
          order: 0,
          content: { body: "Give today" },
        },
      ]),
      ministry,
    );
    expect(html).toContain("give-card");
    expect(html).toContain('style="background:#1a1a2e"');
  });

  it("renders an enabled text_block section with its body", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "leader_message",
          type: "text_block",
          title: "From the Leader",
          enabled: true,
          order: 0,
          content: { body: "Trust the process." },
        },
      ]),
      ministry,
    );
    expect(html).toContain("From the Leader");
    expect(html).toContain("Trust the process.");
  });

  it("renders a text_block's byline, title, and subtitle when set (The Scholar's Desk)", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "guest_column",
          type: "text_block",
          title: "The Scholar's Desk",
          enabled: true,
          order: 0,
          content: {
            byline: "with Vonetta Stevenson",
            title: "Cracking the Code",
            subtitle: "The Mechanics of Under-Pressure Faith",
            body: "One of the biggest misconceptions...",
          },
        },
      ]),
      ministry,
    );
    expect(html).toContain("with Vonetta Stevenson");
    expect(html).toContain("Cracking the Code");
    expect(html).toContain("The Mechanics of Under-Pressure Faith");
  });

  it("renders a text_block's key takeaways as a bulleted list", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "guest_column",
          type: "text_block",
          title: "The Scholar's Desk",
          enabled: true,
          order: 0,
          content: {
            body: "",
            key_takeaways: [
              "Comfort has both an emotional and legal dimension in Scripture.",
              "God is our Advocate.",
              "Understanding the mechanics of comfort changes how we navigate affliction.",
            ],
          },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Key Takeaways");
    expect(html).toContain("God is our Advocate.");
  });

  it("omits the key-takeaways box entirely when there are none", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        { key: "guest_column", type: "text_block", title: "The Scholar's Desk", enabled: true, order: 0, content: { body: "" } },
      ]),
      ministry,
    );
    expect(html).not.toContain("Key Takeaways");
  });

  it("renders a text_block's saying, signature, and pull-quote (From the Leader)", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "leader_message",
          type: "text_block",
          title: "From the Leader",
          enabled: true,
          order: 0,
          content: {
            body: "In a world that moves fast...",
            saying: "Keep trusting. Keep building. Keep believing.",
            signature: "Apostle Khy",
            quote: "The pressure that feels like it will break you is preparing you to carry what will change many.",
          },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Keep trusting. Keep building. Keep believing.");
    expect(html).toContain("Apostle Khy");
    expect(html).toContain("preparing you to carry what will change many.");
  });

  it("renders a text_block's blog_note (the 'want to go deeper' callout)", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "guest_column",
          type: "text_block",
          title: "The Scholar's Desk",
          enabled: true,
          order: 0,
          content: {
            body: "",
            blog_note: "Want to go deeper? Read more from Vonetta Stevenson on her blog: irepresentchrist.com",
          },
        },
      ]),
      ministry,
    );
    expect(html).toContain("irepresentchrist.com");
  });

  it("omits a disabled section entirely", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "leader_message",
          type: "text_block",
          title: "From the Leader",
          enabled: false,
          order: 0,
          content: { body: "Should not appear anywhere." },
        },
      ]),
      ministry,
    );
    expect(html).not.toContain("Should not appear anywhere.");
  });

  it("renders sections in their assigned order regardless of array order", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        { key: "second", type: "text_block", title: "Second Section", enabled: true, order: 1, content: { body: "" } },
        { key: "first", type: "text_block", title: "First Section", enabled: true, order: 0, content: { body: "" } },
      ]),
      ministry,
    );
    expect(html.indexOf("First Section")).toBeLessThan(html.indexOf("Second Section"));
  });

  it("renders a list_block section's items", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "milestones",
          type: "list_block",
          title: "Ministry Milestones",
          enabled: true,
          order: 0,
          content: { items: [{ heading: "Spoke at conference", body: "" }] },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Spoke at conference");
  });

  it("renders birthday entries with a formatted date", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "birthdays",
          type: "birthdays",
          title: "Kingdom Birthdays",
          enabled: true,
          order: 0,
          content: { entries: [{ name: "Jacob Trenier", date: "2000-07-07T00:00:00Z" }] },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Jacob Trenier");
    expect(html).toMatch(/July 7/);
  });

  it("renders a recurring calendar entry using its recurring_note instead of a date", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "calendar",
          type: "calendar",
          title: "Kingdom Calendar",
          enabled: true,
          order: 0,
          content: {
            entries: [{ title: "Weekly Bible Study", start_date: null, end_date: null, recurring_note: "Weekly", location: "" }],
          },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Weekly Bible Study");
    expect(html).toContain("Weekly");
  });

  it("renders a same-day calendar entry as a single date", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "calendar",
          type: "calendar",
          title: "Kingdom Calendar",
          enabled: true,
          order: 0,
          content: {
            entries: [
              {
                title: "Sunday Service",
                start_date: "2026-07-12T18:00:00Z",
                end_date: null,
                recurring_note: null,
                location: "",
              },
            ],
          },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Jul 12");
  });

  it("renders a multi-day calendar entry as a date range within the same month", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "calendar",
          type: "calendar",
          title: "Kingdom Calendar",
          enabled: true,
          order: 0,
          content: {
            entries: [
              {
                title: "Prophetic Intensive",
                start_date: "2026-08-07T13:00:00Z",
                end_date: "2026-08-09T20:00:00Z",
                recurring_note: null,
                location: "Atlanta, GA",
              },
            ],
          },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Aug 7-9");
  });

  it("renders a multi-day calendar entry spanning two different months", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "calendar",
          type: "calendar",
          title: "Kingdom Calendar",
          enabled: true,
          order: 0,
          content: {
            entries: [
              {
                title: "Cross-Month Retreat",
                start_date: "2026-07-30T13:00:00Z",
                end_date: "2026-08-02T20:00:00Z",
                recurring_note: null,
                location: "",
              },
            ],
          },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Jul 30 - Aug 2");
  });

  it("escapes HTML in freeform content to prevent injection", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "leader_message",
          type: "text_block",
          title: "From the Leader",
          enabled: true,
          order: 0,
          content: { body: "<script>alert(1)</script>" },
        },
      ]),
      ministry,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("generates a QR code for the give_cta section when a give_url is set", async () => {
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "give",
          type: "give_cta",
          title: "Partner With Us",
          enabled: true,
          order: 0,
          content: { body: "Give today", give_url: "https://ktmglobal.org/give" },
        },
      ]),
      ministry,
    );
    expect(mockGenerateQRCode).toHaveBeenCalledWith("https://ktmglobal.org/give");
    expect(html).toContain("data:image/png;base64,fakeqr");
  });

  it("still renders the give_cta section if QR generation fails", async () => {
    mockGenerateQRCode.mockRejectedValueOnce(new Error("qr failed"));
    const html = await buildNewsletterHtml(
      baseIssue([
        {
          key: "give",
          type: "give_cta",
          title: "Partner With Us",
          enabled: true,
          order: 0,
          content: { body: "Give today", give_url: "https://ktmglobal.org/give" },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Give today");
  });
});

describe("exportNewsletterAsPdf", () => {
  it("builds the HTML and passes it to renderHtmlToPdf with tight margins for the multi-column grid", async () => {
    const pdf = await exportNewsletterAsPdf({ issue: baseIssue([]), ministry });
    expect(mockRenderHtmlToPdf).toHaveBeenCalledWith(
      expect.stringContaining("KTM Ministries"),
      expect.objectContaining({ margin: expect.any(Object) }),
    );
    expect(pdf).toEqual(Buffer.from("fake-pdf"));
  });
});

describe("exportNewsletterAsHtml", () => {
  it("returns raw HTML, not a rendered PDF", async () => {
    const html = await exportNewsletterAsHtml({ issue: baseIssue([]), ministry });
    expect(html).toContain("KTM Ministries");
    expect(mockRenderHtmlToPdf).not.toHaveBeenCalled();
  });

  it("skips the print-only full-page cover height so an email has no dead gap", async () => {
    const html = await exportNewsletterAsHtml({ issue: baseIssue([]), ministry });
    expect(html).not.toContain("min-height: 10.4in");
    expect(html).not.toContain("break-after: page");
  });
});
