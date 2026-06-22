const puppeteer = require('puppeteer');

let browserPromise = null;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browserPromise;
};

const renderHtmlToPng = async (html, width, height) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buffer = await page.screenshot({ type: 'png' });
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

module.exports = { renderHtmlToPng, closeBrowser };