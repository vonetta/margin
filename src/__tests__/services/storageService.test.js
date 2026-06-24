const mockSend = jest.fn().mockResolvedValue({});

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn(() => ({ send: mockSend })),
  PutObjectCommand: jest.fn((args) => ({ ...args })),
  DeleteObjectCommand: jest.fn((args) => ({ ...args })),
}));

jest.mock("../../services/imageService", () => ({
  removeBackground: jest.fn().mockResolvedValue(Buffer.from("white-bg-image")),
  MODEL_ID: "gemini-2.5-flash-image",
}));

jest.mock("../../services/cutoutService", () => ({
  whiteToTransparent: jest
    .fn()
    .mockResolvedValue(Buffer.from("transparent-cutout")),
}));

process.env.R2_BUCKET = "margin-media";
process.env.R2_PUBLIC_URL = "https://pub-test.r2.dev";
process.env.R2_ENDPOINT = "https://test.r2.cloudflarestorage.com";
process.env.R2_ACCESS_KEY_ID = "test";
process.env.R2_SECRET_ACCESS_KEY = "test";

const {
  uploadFile,
  deleteFile,
  sanitizeName,
} = require("../../services/storageService");

describe("sanitizeName", () => {
  it("lowercases and dashes a name", () => {
    expect(sanitizeName("Apostle Khy.jpg")).toBe("apostle-khy");
  });

  it("strips special characters", () => {
    expect(sanitizeName("Jordan!! Franco@@.png")).toBe("jordan-franco");
  });

  it("falls back to file for empty input", () => {
    expect(sanitizeName("")).toBe("file");
  });
});

describe("uploadFile", () => {
  beforeEach(() => mockSend.mockClear());

  it("uploads and returns a ministry-scoped key and public url", async () => {
    const result = await uploadFile({
      ministryId: "ktm",
      category: "headshots",
      buffer: Buffer.from("fake image"),
      contentType: "image/jpeg",
      originalName: "Apostle Khy.jpg",
    });

    expect(result.key).toMatch(
      /^ktm\/headshots\/apostle-khy-[a-f0-9]{8}\.jpg$/,
    );
    expect(result.url).toMatch(
      /^https:\/\/pub-test\.r2\.dev\/ktm\/headshots\//,
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported file type", async () => {
    await expect(
      uploadFile({
        ministryId: "ktm",
        category: "headshots",
        buffer: Buffer.from("x"),
        contentType: "application/pdf",
        originalName: "doc.pdf",
      }),
    ).rejects.toThrow("Unsupported file type");
  });

  it("requires a ministryId", async () => {
    await expect(
      uploadFile({
        category: "headshots",
        buffer: Buffer.from("x"),
        contentType: "image/png",
        originalName: "x.png",
      }),
    ).rejects.toThrow("ministryId is required");
  });

  it("scopes the key to the correct ministry", async () => {
    const result = await uploadFile({
      ministryId: "second-ministry",
      category: "flyers",
      buffer: Buffer.from("x"),
      contentType: "image/png",
      originalName: "event.png",
    });
    expect(result.key).toMatch(/^second-ministry\/flyers\//);
  });
});

describe("deleteFile", () => {
  beforeEach(() => mockSend.mockClear());

  it("deletes a file by key", async () => {
    const result = await deleteFile("ktm/headshots/apostle-khy-a3f9.jpg");
    expect(result.deleted).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("requires a key", async () => {
    await expect(deleteFile()).rejects.toThrow("key is required");
  });
});
