const QRCode = require("qrcode");

const generateQRCode = async (url, options = {}) => {
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new Error("A valid URL is required to generate a QR code");
  }

  const settings = {
    errorCorrectionLevel: "M",
    margin: options.margin ?? 2,
    width: options.width ?? 400,
    color: {
      dark: options.darkColor || "#000000",
      light: options.lightColor || "#FFFFFF",
    },
  };

  const dataUrl = await QRCode.toDataURL(url.trim(), settings);
  return dataUrl;
};

const generateQRBuffer = async (url, options = {}) => {
  if (!url || typeof url !== "string" || !url.trim()) {
    throw new Error("A valid URL is required to generate a QR code");
  }

  const settings = {
    errorCorrectionLevel: "M",
    margin: options.margin ?? 2,
    width: options.width ?? 400,
    color: {
      dark: options.darkColor || "#000000",
      light: options.lightColor || "#FFFFFF",
    },
  };

  const buffer = await QRCode.toBuffer(url.trim(), settings);
  return buffer;
};

module.exports = { generateQRCode, generateQRBuffer };
