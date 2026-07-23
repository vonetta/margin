const mockRenderHtmlToPdf = jest.fn().mockResolvedValue(Buffer.from("fake-pdf"));
jest.mock("../../services/flyerRenderer", () => ({
  renderHtmlToPdf: (...args) => mockRenderHtmlToPdf(...args),
}));

const mockGenerateQRCode = jest.fn().mockResolvedValue("data:image/png;base64,fakeqr");
jest.mock("../../services/qrService", () => ({
  generateQRCode: (...args) => mockGenerateQRCode(...args),
}));

const { buildNewsletterHtml, exportNewsletterAsPdf } = require("../../services/newsletterExportService");

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
          content: { entries: [{ title: "Weekly Bible Study", date: null, recurring_note: "Weekly", location: "" }] },
        },
      ]),
      ministry,
    );
    expect(html).toContain("Weekly Bible Study");
    expect(html).toContain("Weekly");
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
  it("builds the HTML and passes it to renderHtmlToPdf", async () => {
    const pdf = await exportNewsletterAsPdf({ issue: baseIssue([]), ministry });
    expect(mockRenderHtmlToPdf).toHaveBeenCalledWith(expect.stringContaining("KTM Ministries"));
    expect(pdf).toEqual(Buffer.from("fake-pdf"));
  });
});
