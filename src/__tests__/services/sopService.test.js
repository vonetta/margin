const mockFind = jest.fn();

jest.mock("../../models/SopDraft", () => ({
  find: (...args) => mockFind(...args),
}));

const { withApprovedSops } = require("../../services/sopService");

describe("withApprovedSops", () => {
  beforeEach(() => mockFind.mockReset());

  const chainableFind = (result) => {
    mockFind.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(result) }),
    });
  };

  it("appends only approved SOP drafts to the profile's existing sops", async () => {
    chainableFind([
      { title: "Sunday Setup", content: "1. Arrange chairs" },
      { title: "Livestream Checklist", content: "1. Test the mic" },
    ]);

    const profile = {
      toObject: () => ({
        sops: [{ title: "Existing SOP", content: "Already here" }],
        voice_profile: { persona_name: "Apostle Khy" },
      }),
    };

    const result = await withApprovedSops(profile, "ktm");

    expect(mockFind).toHaveBeenCalledWith({ ministry_id: "ktm", status: "approved" });
    expect(result.sops).toEqual([
      { title: "Existing SOP", content: "Already here" },
      { title: "Sunday Setup", content: "1. Arrange chairs" },
      { title: "Livestream Checklist", content: "1. Test the mic" },
    ]);
    // Everything else on the profile is preserved untouched.
    expect(result.voice_profile).toEqual({ persona_name: "Apostle Khy" });
  });

  it("works when there are no approved drafts yet", async () => {
    chainableFind([]);

    const profile = { toObject: () => ({ sops: [{ title: "Existing SOP", content: "x" }] }) };
    const result = await withApprovedSops(profile, "ktm");

    expect(result.sops).toEqual([{ title: "Existing SOP", content: "x" }]);
  });

  it("works with a plain object profile (no toObject), e.g. in tests", async () => {
    chainableFind([{ title: "New SOP", content: "y" }]);

    const profile = { sops: [] };
    const result = await withApprovedSops(profile, "ktm");

    expect(result.sops).toEqual([{ title: "New SOP", content: "y" }]);
  });
});
