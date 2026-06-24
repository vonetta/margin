const escapeHtml = (str = "") => {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };
  
  const hexToRgba = (hex, alpha) => {
    const h = (hex || "#000000").replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  
  const DIMENSIONS = {
    social: { width: 1080, height: 1350 },
    print: { width: 1275, height: 1650 },
  };
  
  // Resolve the colors a layout uses from ministry branding, with safe fallbacks
  const resolveColors = (branding = {}) => {
    const c = branding.colors || {};
    return {
      primary: c.primary || "#1a1a2e",
      accent: c.accent || "#e94560",
      gold: c.gold || "#f5a623",
      bg: c.background || "#ffffff",
      text: c.text || "#1C1C1C",
    };
  };
  
  // Resolve fonts from selected typography, with safe fallbacks
  const resolveFonts = (typography) => ({
    display: typography?.display?.name || "Georgia",
    body: typography?.body?.name || "Helvetica",
    accent: typography?.accent?.name || typography?.display?.name || "Georgia",
  });
  
  module.exports = { escapeHtml, hexToRgba, DIMENSIONS, resolveColors, resolveFonts };