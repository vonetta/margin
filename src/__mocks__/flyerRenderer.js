// Test mock — never launches real Puppeteer
module.exports = {
  renderHtmlToPng: jest
    .fn()
    .mockResolvedValue(Buffer.from("fake-rendered-png")),
  renderHtmlToPdf: jest
    .fn()
    .mockResolvedValue(Buffer.from("fake-rendered-pdf")),
  closeBrowser: jest.fn().mockResolvedValue(undefined),
};
