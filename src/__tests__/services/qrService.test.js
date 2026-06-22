const {
  generateQRCode,
  generateQRBuffer,
} = require("../../services/qrService");

describe("QR Service", () => {
  describe("generateQRCode", () => {
    it("generates a base64 data URL for a valid URL", async () => {
      const result = await generateQRCode("https://khytraylorministries.com");
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it("generates a QR code with a custom color", async () => {
      const result = await generateQRCode("https://khytraylorministries.com", {
        darkColor: "#03293F",
      });
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it("throws an error for an empty URL", async () => {
      await expect(generateQRCode("")).rejects.toThrow(
        "A valid URL is required",
      );
    });

    it("throws an error for a null URL", async () => {
      await expect(generateQRCode(null)).rejects.toThrow(
        "A valid URL is required",
      );
    });

    it("throws an error for a whitespace-only URL", async () => {
      await expect(generateQRCode("   ")).rejects.toThrow(
        "A valid URL is required",
      );
    });
  });

  describe("generateQRBuffer", () => {
    it("generates an image buffer for a valid URL", async () => {
      const result = await generateQRBuffer("https://khytraylorministries.com");
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("throws an error for an empty URL", async () => {
      await expect(generateQRBuffer("")).rejects.toThrow(
        "A valid URL is required",
      );
    });
  });
});
