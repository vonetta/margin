// Test mock — never launches real Puppeteer
module.exports = {
  renderHtmlToPng: jest
    .fn()
    .mockResolvedValue(Buffer.from("fake-rendered-png")),
  closeBrowser: jest.fn().mockResolvedValue(undefined),
};
