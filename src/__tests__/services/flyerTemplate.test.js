const { buildFlyerHtml, DIMENSIONS } = require("../../services/flyerTemplate");
const { speakerColumns } = require("../../services/flyerTemplate");

const baseInput = {
  size: "social",
  typography: {
    tone: "formal",
    display: { name: "Cinzel" },
    body: { name: "Montserrat" },
    accent: { name: "Great Vibes" },
  },
  branding: {
    colors: {
      primary: "#03293F",
      accent: "#EA8A8B",
      gold: "#DAAE4F",
      text: "#1C1C1C",
      background: "#ffffff",
    },
  },
  content: {
    title: "Prophetic Training Workshop",
    subtitle: "Step into the supernatural",
    date: "June 12-14",
    location: "Castaic, CA",
    cost: "$85",
    cta: "Secure your spot",
    qr_caption: "Scan to register",
  },
  qrDataUrl: "data:image/png;base64,FAKEQR",
  fontsUrl: "https://fonts.googleapis.com/css2?family=Cinzel&display=swap",
};

describe("buildFlyerHtml", () => {
  it("produces valid HTML with the title", () => {
    const html = buildFlyerHtml(baseInput);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Prophetic Training Workshop");
  });

  it("embeds the selected display font", () => {
    const html = buildFlyerHtml(baseInput);
    expect(html).toContain("'Cinzel'");
  });

  it("applies the ministry primary color", () => {
    const html = buildFlyerHtml(baseInput);
    expect(html).toContain("#03293F");
  });

  it("includes the QR code when provided", () => {
    const html = buildFlyerHtml(baseInput);
    expect(html).toContain("data:image/png;base64,FAKEQR");
    expect(html).toContain("Scan to register");
  });

  it("omits the QR slot when no QR is provided", () => {
    const html = buildFlyerHtml({ ...baseInput, qrDataUrl: null });
    expect(html).not.toContain('<img src="data:image/png');
    expect(html).not.toContain('class="qr-slot"');
  });

  it("uses the monument layout for a formal tone", () => {
    const html = buildFlyerHtml(baseInput);
    expect(html).toContain("layout-monument");
  });

  it("uses the aurora layout for a warm tone", () => {
    const html = buildFlyerHtml({
      ...baseInput,
      typography: { ...baseInput.typography, tone: "warm" },
    });
    expect(html).toContain("layout-aurora");
  });

  it("escapes HTML in content to prevent injection", () => {
    const html = buildFlyerHtml({
      ...baseInput,
      content: { ...baseInput.content, title: "<script>alert(1)</script>" },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("sets correct dimensions for print size", () => {
    const html = buildFlyerHtml({ ...baseInput, size: "print" });
    expect(html).toContain(`${DIMENSIONS.print.width}px`);
  });

  it("falls back to safe fonts when typography is missing", () => {
    const html = buildFlyerHtml({ ...baseInput, typography: null });
    expect(html).toContain("Georgia");
  });
});

describe("speakerColumns", () => {
  it("uses 1 column for a single speaker", () => {
    expect(speakerColumns(1)).toBe(1);
  });
  it("uses 2 columns for two speakers", () => {
    expect(speakerColumns(2)).toBe(2);
  });
  it("uses 3 columns for three speakers", () => {
    expect(speakerColumns(3)).toBe(3);
  });
  it("uses 2 columns for four speakers", () => {
    expect(speakerColumns(4)).toBe(2);
  });
});

describe("buildFlyerHtml with people", () => {
  it("renders a host hero block when host has a photo", () => {
    const html = buildFlyerHtml({
      ...baseInput,
      host: {
        name: "Apostle Khy",
        title: "Host",
        role: "Host",
        headshot_url: "https://pub-test.r2.dev/ktm/headshots/khy.jpg",
      },
    });
    expect(html).toContain("hero-photo");
    expect(html).toContain("Apostle Khy");
    expect(html).toContain("khy.jpg");
  });

  it("renders speaker cards", () => {
    const html = buildFlyerHtml({
      ...baseInput,
      speakers: [
        {
          name: "Jordan Franco",
          title: "Apostle",
          headshot_url: "https://pub-test.r2.dev/ktm/headshots/jordan.jpg",
        },
        {
          name: "Robert Rush",
          title: "Apostle",
          headshot_url: "https://pub-test.r2.dev/ktm/headshots/robert.jpg",
        },
      ],
    });
    expect(html).toContain("Jordan Franco");
    expect(html).toContain("Robert Rush");
    expect(html).toContain("sp-card");
  });

  it("renders an initial when a speaker has no photo", () => {
    const html = buildFlyerHtml({
      ...baseInput,
      speakers: [{ name: "Anonymous Speaker", title: "Guest" }],
    });
    expect(html).toContain("sp-photo-empty");
    expect(html).toContain(">A</div>");
  });

  it("omits hero when no host provided", () => {
    const html = buildFlyerHtml(baseInput);
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain("background-image:url");
  });
});
