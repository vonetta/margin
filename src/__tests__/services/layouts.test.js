const {
  listLayouts,
  renderLayout,
  suggestLayout,
} = require("../../services/layouts");

describe("layout registry", () => {
  it("lists available layouts with metadata", () => {
    const layouts = listLayouts();
    expect(layouts.length).toBeGreaterThanOrEqual(1);
    expect(layouts[0]).toHaveProperty("id");
    expect(layouts[0]).toHaveProperty("name");
  });

  it("renders monument by id", () => {
    const html = renderLayout("monument", {
      content: { title: "Test Event" },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
    });
    expect(html).toContain("Test Event");
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("throws on unknown layout", () => {
    expect(() => renderLayout("nope", {})).toThrow("Unknown layout");
  });
});

describe("suggestLayout", () => {
  it("suggests feature for a single host, no speakers", () => {
    expect(suggestLayout({ host: { cutout_url: "x" }, speakers: [] })).toBe(
      "feature",
    );
  });

  it("suggests monument for a host with speakers", () => {
    expect(
      suggestLayout({ host: { cutout_url: "x" }, speakers: [{}, {}] }),
    ).toBe("monument");
  });

  it("suggests showcase for many speakers, no host", () => {
    expect(suggestLayout({ host: null, speakers: [{}, {}, {}] })).toBe(
      "showcase",
    );
  });

  it("suggests canvas for a venue image, no people", () => {
    expect(suggestLayout({ host: null, speakers: [], venueImage: "x" })).toBe(
      "canvas",
    );
  });

  it("falls back to monument", () => {
    expect(suggestLayout({})).toBe("monument");
  });

  it("renders all four layouts without error", () => {
    const props = {
      content: { title: "Test Event", subtitle: "Sub", date: "June 1" },
      branding: {
        colors: { primary: "#03293F", gold: "#DAAE4F", accent: "#EA8A8B" },
      },
      host: {
        name: "Apostle Khy",
        title: "Host",
        cutout_url: "https://x.r2.dev/k.png",
      },
      speakers: [
        {
          name: "Jordan Franco",
          title: "Apostle",
          cutout_url: "https://x.r2.dev/j.png",
        },
        {
          name: "Robert Rush",
          title: "Apostle",
          cutout_url: "https://x.r2.dev/r.png",
        },
      ],
    };
    for (const id of ["monument", "feature", "canvas", "showcase"]) {
      const html = renderLayout(id, props);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Test Event");
    }
  });

  it("renders description, theme_tags, and audience when provided", () => {
    const html = renderLayout("monument", {
      content: {
        title: "Test Event",
        description: "Step into the supernatural.",
        theme_tags: ["Teaching", "Impartation"],
        audience: "Leaders and prophetic voices",
      },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
    });
    expect(html).toContain("Step into the supernatural.");
    expect(html).toContain("Teaching");
    expect(html).toContain("Impartation");
    expect(html).toContain("Leaders and prophetic voices");
  });

  it("renders highlights when provided", () => {
    const html = renderLayout("monument", {
      content: {
        title: "Test Event",
        highlights: ["Hands-on prophetic activation", "Time for personal ministry"],
      },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
    });
    expect(html).toContain("Hands-on prophetic activation");
    expect(html).toContain("Time for personal ministry");
  });

  it("respects a style object's visibility/size overrides", () => {
    const html = renderLayout("monument", {
      content: {
        title: "Test Event",
        description: "Should be hidden.",
      },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
      style: { description_visible: false, title_size: 55 },
    });
    expect(html).not.toContain("Should be hidden.");
    expect(html).toContain("font-size: 55px");
  });

  it("does not overlay the brand gradient on a background photo by default", () => {
    const html = renderLayout("monument", {
      content: { title: "Test Event" },
      branding: { colors: { primary: "#03293F", accent: "#EA8A8B", gold: "#DAAE4F" } },
      backgroundUrl: "https://example.com/photo.jpg",
    });
    // Only the dark legibility scrim + the photo — no extra gradient layer.
    expect(html.match(/background-image:/g).length).toBe(1);
  });

  it("layers a translucent brand gradient on top of a background photo when requested", () => {
    const html = renderLayout("monument", {
      content: { title: "Test Event" },
      branding: { colors: { primary: "#03293F", accent: "#EA8A8B", gold: "#DAAE4F" } },
      backgroundUrl: "https://example.com/photo.jpg",
      style: { gradient_overlay_opacity: 50 },
    });
    expect(html).toContain("rgba(3, 41, 63, 0.5)"); // #03293F at 50% alpha
    expect(html).toContain("url('https://example.com/photo.jpg')");
  });

  it("forces a backing on a photo-corner logo even when none was requested, since it always sits on busy content", () => {
    const html = renderLayout("monument", {
      content: { title: "Test Event" },
      branding: {
        colors: { primary: "#03293F", gold: "#DAAE4F" },
        logo_url: "https://example.com/logo.png",
      },
      style: { logo_placement: "photo-corner", logo_backing: "none" },
    });
    expect(html).toContain('class="logo-backing logo-backing-circle"');
  });

  it("respects an explicit pill backing on a photo-corner logo instead of forcing circle", () => {
    const html = renderLayout("monument", {
      content: { title: "Test Event" },
      branding: {
        colors: { primary: "#03293F", gold: "#DAAE4F" },
        logo_url: "https://example.com/logo.png",
      },
      style: { logo_placement: "photo-corner", logo_backing: "pill" },
    });
    expect(html).toContain('class="logo-backing logo-backing-pill"');
  });

  it("lists all four layouts", () => {
    const layouts = listLayouts();
    expect(layouts.length).toBe(4);
  });
});
