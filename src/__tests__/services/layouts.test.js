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

  it("suggests canvas for sparse content (no people, no body copy), even without a venue image", () => {
    expect(
      suggestLayout({
        host: null,
        speakers: [],
        content: { title: "Women's Self Defense Workshop", date: "Aug 15", cost: "$50" },
      }),
    ).toBe("canvas");
  });

  it("keeps monument when there's no host/speakers but real body copy to fill it", () => {
    expect(
      suggestLayout({
        host: null,
        speakers: [],
        content: { title: "Worship Intensive", description: "A full day to refresh and equip." },
      }),
    ).toBe("monument");
    expect(
      suggestLayout({
        host: null,
        speakers: [],
        content: { title: "Worship Intensive", highlights: ["Sessions", "Refreshing"] },
      }),
    ).toBe("monument");
  });

  it("falls back to canvas for completely empty input (sparse by definition)", () => {
    expect(suggestLayout({})).toBe("canvas");
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

  it("renders description, theme_tags, and highlights on all four layouts, not just monument", () => {
    const props = {
      content: {
        title: "Test Event",
        description: "A description that should show up.",
        theme_tags: ["Worship", "Equipping"],
        highlights: ["A highlight line"],
        audience: "Worship leaders",
      },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F", accent: "#EA8A8B" } },
    };
    for (const id of ["monument", "feature", "canvas", "showcase"]) {
      const html = renderLayout(id, props);
      expect(html).toContain("A description that should show up.");
      expect(html).toContain("Worship");
      expect(html).toContain("A highlight line");
    }
  });

  it("applies title_size and color_variant on all four layouts, not just monument", () => {
    const props = {
      content: { title: "Test Event" },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F", accent: "#EA8A8B" } },
      style: { title_size: 55, color_variant: "triad" },
    };
    for (const id of ["monument", "feature", "canvas", "showcase"]) {
      const html = renderLayout(id, props);
      expect(html).toContain("font-size: 55px");
    }
  });

  it("forces a logo backing on photo-corner placement for every layout, since none of them have a scrim there", () => {
    const props = {
      content: { title: "Test Event" },
      branding: {
        colors: { primary: "#03293F", gold: "#DAAE4F" },
        logo_url: "https://example.com/logo.png",
      },
      style: { logo_placement: "photo-corner", logo_backing: "none" },
    };
    for (const id of ["feature", "canvas", "showcase"]) {
      const html = renderLayout(id, props);
      expect(html).toContain('class="logo-backing logo-backing-circle"');
    }
  });

  it("renders showcase's footer without clipping it off the left edge", () => {
    const html = renderLayout("showcase", {
      content: { title: "Test Event", cta: "Register today!" },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
    });
    expect(html).not.toContain("margin: 0 -60px");
  });

  it("showcase degrades gracefully with no host or speakers, instead of an empty grid", () => {
    const html = renderLayout("showcase", {
      content: { title: "Test Event" },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
      host: null,
      speakers: [],
    });
    expect(html).not.toContain("Featuring");
    expect(html).toContain("justify-content: center;");
  });

  it("lays out feature's meta pills as a 2-column grid, not a tall single column that can clip off the canvas", () => {
    const html = renderLayout("feature", {
      content: {
        title: "Test Event",
        date: "August 15",
        location: "Los Angeles",
        cost: "$75",
        audience: "Worship leaders",
      },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
    });
    expect(html).toContain("grid-template-columns: repeat(2, 1fr)");
  });

  it("lists all five layouts", () => {
    const layouts = listLayouts();
    expect(layouts.length).toBe(5);
  });

  it("renders collage with scattered photo cards for people with photos", () => {
    const html = renderLayout("collage", {
      content: { title: "Fall Retreat", date: "October 10", location: "Camp Cedar" },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
      speakers: [
        { name: "A", headshot_url: "https://example.com/a.jpg" },
        { name: "B", headshot_url: "https://example.com/b.jpg" },
      ],
    });
    expect(html).toContain("photo-card");
    expect((html.match(/photo-card/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("collage doesn't leave a dead empty zone when no one has a photo", () => {
    const html = renderLayout("collage", {
      content: { title: "Worship Intensive", date: "August 15", location: "Los Angeles" },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
    });
    expect(html).not.toContain('<div class="photo-card"');
    // Falls back to a centered title over a textured background instead of
    // a fixed bottom offset that leaves an empty top half.
    expect(html).toContain("top: 50%");
  });

  it("collage badge never falls back to CTA text and stays on-brand gold", () => {
    const html = renderLayout("collage", {
      content: {
        title: "Worship Intensive",
        cta: "Secure your spot at google.com",
      },
      branding: { colors: { primary: "#03293F", gold: "#DAAE4F" } },
      style: { color_variant: "triad" },
    });
    expect(html).not.toContain('<div class="seal-slot"');
    expect(html).not.toContain("google.com");
  });

  it("suggests collage for a warm/energetic tone with multiple people photos", () => {
    const id = suggestLayout({
      speakers: [{ headshot_url: "a.jpg" }, { headshot_url: "b.jpg" }],
      tone: "warm",
    });
    expect(id).toBe("collage");
  });
});
