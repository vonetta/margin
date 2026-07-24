let browserPromise = null;

const getBrowser = async () => {
  if (!browserPromise) {
    const puppeteer = require("puppeteer");
    browserPromise = puppeteer
      .launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      })
      .then((browser) => {
        // If Chrome crashes later, drop the cache so the next render
        // relaunches a fresh browser instead of reusing a dead one.
        browser.once("disconnected", () => {
          browserPromise = null;
        });
        return browser;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
};

// networkidle0 only waits for the network fetch — decoding a large image
// (multi-MB headshots, etc.) can still be in flight after that, so layout
// isn't settled yet. Capturing before decode finishes has caused visible
// glitches: a photo popping in at its real size after a PDF's page breaks
// were already computed, throwing off pagination. img.decode() waits for
// the actual paintable bitmap regardless of load state.
const waitForImagesDecoded = (page) =>
  page.evaluate(() => Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => {}))));

const renderHtmlToPng = async (html, width, height) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    await waitForImagesDecoded(page);
    const buffer = await page.screenshot({ type: "png" });
    return buffer;
  } finally {
    await page.close();
  }
};

// A real multi-page document (unlike a flyer's fixed single canvas) — no
// fixed viewport, page size/margins come from Puppeteer's own PDF options
// instead.
const renderHtmlToPdf = async (html, { format = "Letter", margin } = {}) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle0" });
    await waitForImagesDecoded(page);
    const buffer = await page.pdf({
      format,
      printBackground: true,
      margin: margin || { top: "0.75in", bottom: "0.75in", left: "0.75in", right: "0.75in" },
    });
    return buffer;
  } finally {
    await page.close();
  }
};

const closeBrowser = async () => {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = null;
  }
};

module.exports = { renderHtmlToPng, renderHtmlToPdf, closeBrowser };
