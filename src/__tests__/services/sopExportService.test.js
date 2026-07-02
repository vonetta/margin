const mockRenderHtmlToPdf = jest.fn().mockResolvedValue(Buffer.from("fake-pdf"));

jest.mock("../../services/flyerRenderer", () => ({
  renderHtmlToPdf: (...args) => mockRenderHtmlToPdf(...args),
}));

const {
  buildSopExportHtml,
  stripReviewMarkers,
  exportSopAsPdf,
} = require("../../services/sopExportService");

describe("stripReviewMarkers", () => {
  it("removes [CONFIRM: ...] segments", () => {
    const result = stripReviewMarkers("Confirm by [CONFIRM: how many days?] before the event.");
    expect(result).not.toContain("CONFIRM");
    expect(result).toContain("Confirm by");
    expect(result).toContain("before the event.");
  });

  it("removes whole lines starting with FOR REVIEW", () => {
    const result = stripReviewMarkers("Line one.\nFOR REVIEW: Conita, check this.\nLine two.");
    expect(result).not.toContain("FOR REVIEW");
    expect(result).not.toContain("Conita");
    expect(result).toContain("Line one.");
    expect(result).toContain("Line two.");
  });

  it("collapses excess blank lines left behind by stripping", () => {
    const result = stripReviewMarkers("A\nFOR REVIEW: x\nFOR REVIEW: y\nB");
    expect(result).not.toMatch(/\n{3,}/);
  });
});

describe("buildSopExportHtml", () => {
  const draft = {
    title: "Sunday Setup <script>alert(1)</script>",
    content: "1. Arrange chairs.\n[CONFIRM: who?]\nFOR REVIEW: check this.",
    status: "pending_review",
    tags: ["setup"],
  };
  const ministry = { name: "KTM", branding: { colors: { primary: "#03293F" }, logo_url: "https://x/logo.png" } };

  it("escapes title/content so nothing injects raw HTML", () => {
    const html = buildSopExportHtml({ draft, ministry, mode: "internal" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("internal mode keeps CONFIRM/FOR REVIEW markers visible", () => {
    const html = buildSopExportHtml({ draft, ministry, mode: "internal" });
    expect(html).toContain("CONFIRM");
    expect(html).toContain("FOR REVIEW");
  });

  it("clean mode strips CONFIRM/FOR REVIEW markers", () => {
    const html = buildSopExportHtml({ draft, ministry, mode: "clean" });
    expect(html).not.toContain("CONFIRM");
    expect(html).not.toContain("FOR REVIEW");
  });

  it("shows a DRAFT watermark for a pending_review SOP", () => {
    const html = buildSopExportHtml({ draft, ministry, mode: "internal" });
    expect(html).toContain("DRAFT");
    expect(html).toContain("PENDING APPROVAL");
  });

  it("shows a REJECTED watermark for a rejected SOP", () => {
    const html = buildSopExportHtml({ draft: { ...draft, status: "rejected" }, ministry, mode: "internal" });
    expect(html).toContain("REJECTED");
  });

  it("shows no watermark for an approved SOP", () => {
    const html = buildSopExportHtml({ draft: { ...draft, status: "approved" }, ministry, mode: "internal" });
    expect(html).not.toContain("watermark\">DRAFT");
    expect(html).not.toContain("watermark\">REJECTED");
  });

  it("renders content as plain paragraphs, not parsed headers/bullets", () => {
    // No heuristic header/bullet parsing — this is the deliberate, safer
    // choice over risking a misparse on unstructured plain text.
    const html = buildSopExportHtml({ draft, ministry, mode: "internal" });
    expect(html).toContain('class="content"');
    expect(html).not.toContain("<h2>");
    expect(html).not.toContain("<li>");
  });
});

describe("exportSopAsPdf", () => {
  it("delegates HTML rendering to renderHtmlToPdf and returns its buffer", async () => {
    mockRenderHtmlToPdf.mockClear();
    const draft = { title: "T", content: "C", status: "approved", tags: [] };
    const result = await exportSopAsPdf({ draft, ministry: { name: "KTM" }, mode: "internal" });
    expect(mockRenderHtmlToPdf).toHaveBeenCalledTimes(1);
    expect(result.toString()).toBe("fake-pdf");
  });
});
