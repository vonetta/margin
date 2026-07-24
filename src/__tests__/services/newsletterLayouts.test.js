const mockGenerateQRCode = jest.fn().mockResolvedValue("data:image/png;base64,fakeqr");
jest.mock("../../services/qrService", () => ({
  generateQRCode: (...args) => mockGenerateQRCode(...args),
}));

const { listLayouts, renderLayout, LAYOUTS } = require("../../services/newsletterLayouts");

const ministry = {
  name: "KTM Ministries",
  tagline: "Equipping leaders",
  branding: { colors: { primary: "#1a1a2e", accent: "#e94560", gold: "#f5a623" } },
};

const fullIssue = {
  month: 7,
  year: 2026,
  theme: "Rooted & Rising",
  cover_photos: ["https://example.com/a.jpg"],
  sections: [
    { key: "leader_message", type: "text_block", title: "From the Leader", enabled: true, order: 0,
      content: { byline: "Apostle Khy", body: "Beloved family.", key_takeaways: ["Grow deep."], quote: "A quote.", saying: "A saying.", signature: "Apostle Khy" } },
    { key: "milestones", type: "list_block", title: "Ministry Milestones", enabled: true, order: 1,
      content: { items: [{ heading: "Did a thing", body: "details" }] } },
    { key: "spotlight", type: "spotlight", title: "Faces of the Kingdom", enabled: true, order: 2,
      content: { person_name: "Renee Carter", bio: "A bio.", qa: [{ question: "Q?", answer: "A." }] } },
    { key: "birthdays", type: "birthdays", title: "Kingdom Birthdays", enabled: true, order: 3,
      content: { entries: [{ name: "Marcus Bell", date: "2026-07-03T00:00:00Z" }] } },
    { key: "calendar", type: "calendar", title: "Kingdom Calendar", enabled: true, order: 4,
      content: { entries: [{ title: "Men's Breakfast", start_date: "2026-07-11T13:00:00Z", location: "Fellowship Hall" }] } },
    { key: "give", type: "give_cta", title: "Partner With Us", enabled: true, order: 5,
      content: { body: "Give.", give_url: "https://give.example.com/ktm" } },
  ],
};

describe("newsletterLayouts index", () => {
  it("lists all registered layouts with name/description metadata", () => {
    const layouts = listLayouts();
    expect(layouts.map((l) => l.id).sort()).toEqual(["bold", "classic", "minimal"]);
    layouts.forEach((l) => {
      expect(l.name).toEqual(expect.any(String));
      expect(l.description).toEqual(expect.any(String));
    });
  });

  it("falls back to classic for an unknown or missing template id", async () => {
    const unknown = await renderLayout("not-a-real-template", fullIssue, ministry);
    const missing = await renderLayout(undefined, fullIssue, ministry);
    const classic = await LAYOUTS.classic.render(fullIssue, ministry);
    expect(unknown).toBe(classic);
    expect(missing).toBe(classic);
  });
});

describe.each(["classic", "bold", "minimal"])("%s layout", (id) => {
  it("renders every section type without throwing, for both PDF and email", async () => {
    const pdfHtml = await renderLayout(id, fullIssue, ministry, { forEmail: false });
    const emailHtml = await renderLayout(id, fullIssue, ministry, { forEmail: true });

    for (const html of [pdfHtml, emailHtml]) {
      expect(html).toContain("KTM Ministries");
      expect(html).toContain("From the Leader");
      expect(html).toContain("Ministry Milestones");
      expect(html).toContain("Renee Carter");
      expect(html).toContain("Marcus Bell");
      expect(html).toContain("Men's Breakfast");
      expect(html).toContain("Partner With Us");
    }
  });

  it("shows the masthead photo collage only in the email export", async () => {
    const pdfHtml = await renderLayout(id, fullIssue, ministry, { forEmail: false });
    const emailHtml = await renderLayout(id, fullIssue, ministry, { forEmail: true });
    expect(pdfHtml).not.toContain("https://example.com/a.jpg");
    expect(emailHtml).toContain("https://example.com/a.jpg");
  });

  it("omits a disabled section", async () => {
    const issue = {
      ...fullIssue,
      sections: fullIssue.sections.map((s) => (s.key === "milestones" ? { ...s, enabled: false } : s)),
    };
    const html = await renderLayout(id, issue, ministry);
    expect(html).not.toContain("Ministry Milestones");
  });
});
