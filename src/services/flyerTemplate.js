const DIMENSIONS = {
    social: { width: 1080, height: 1350 },
    print: { width: 1275, height: 1650 }
  };
  
  const LAYOUTS = {
    formal: 'monument',
    classic: 'monument',
    warm: 'aurora',
    energetic: 'bold'
  };
  
  const escapeHtml = (str = '') => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  
  // Convert hex to rgba for layered transparency
  const hexToRgba = (hex, alpha) => {
    const h = (hex || '#000000').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  
  const buildFlyerHtml = ({
    size = 'social',
    typography,
    branding = {},
    content = {},
    qrDataUrl = null,
    fontsUrl = null
  }) => {
    const dims = DIMENSIONS[size] || DIMENSIONS.social;
    const colors = branding.colors || {};
    const primary = colors.primary || '#1a1a2e';
    const accent = colors.accent || '#e94560';
    const gold = colors.gold || '#f5a623';
    const bg = colors.background || '#ffffff';
  
    const displayFont = typography?.display?.name || 'Georgia';
    const bodyFont = typography?.body?.name || 'Helvetica';
    const accentFont = typography?.accent?.name || displayFont;
  
    const layout = LAYOUTS[typography?.tone] || 'monument';
  
    const title = escapeHtml(content.title || '');
    const subtitle = escapeHtml(content.subtitle || '');
    const dateLine = escapeHtml(content.date || '');
    const location = escapeHtml(content.location || '');
    const cost = escapeHtml(content.cost || '');
    const cta = escapeHtml(content.cta || '');
    const qrCaption = escapeHtml(content.qr_caption || 'Scan to register');
  
    const fontLink = fontsUrl ? `<link rel="stylesheet" href="${fontsUrl}">` : '';
  
    const detailItems = [
      dateLine && `<div class="detail"><span class="dlabel">When</span><span class="dval">${dateLine}</span></div>`,
      location && `<div class="detail"><span class="dlabel">Where</span><span class="dval">${location}</span></div>`,
      cost && `<div class="detail"><span class="dlabel">Cost</span><span class="dval">${cost}</span></div>`
    ].filter(Boolean).join('');
  
    const qrBlock = qrDataUrl
      ? `<div class="qr-slot">
           <img src="${qrDataUrl}" alt="QR code" class="qr-img" />
           <div class="qr-caption">${qrCaption}</div>
         </div>`
      : '';
  
    // Three layout treatments, each with intentional zoning.
    // monument: deep gradient header, light body, primary footer band
    // aurora: soft full-bleed gradient, airy and warm
    // bold: split color blocks, high energy
    const layoutStyles = {
      monument: `
        body { background: ${bg}; }
        .header {
          background: linear-gradient(160deg, ${primary} 0%, ${hexToRgba(primary, 0.88)} 100%);
          padding: 110px 80px 80px;
          position: relative;
        }
        .header::after {
          content: ''; position: absolute; bottom: 0; left: 80px; width: 120px; height: 5px;
          background: ${gold};
        }
        .title { color: #ffffff; }
        .subtitle { color: ${hexToRgba(gold, 0.95)}; }
        .body-zone { padding: 70px 80px 40px; flex: 1; display: flex; flex-direction: column; }
        .footer {
          background: ${primary}; padding: 50px 80px 70px;
          display: flex; justify-content: space-between; align-items: center; gap: 40px;
        }
        .footer .cta { color: ${gold}; margin: 0; }
        .footer .qr-caption { color: rgba(255,255,255,0.85); }
      `,
      aurora: `
        body {
          background: linear-gradient(165deg, ${bg} 0%, ${hexToRgba(accent, 0.18)} 55%, ${hexToRgba(primary, 0.22)} 100%);
        }
        .header { padding: 120px 90px 40px; }
        .title { color: ${primary}; }
        .subtitle { color: ${accent}; }
        .body-zone { padding: 50px 90px; flex: 1; display: flex; flex-direction: column; }
        .footer { padding: 40px 90px 80px; display: flex; flex-direction: column; gap: 30px; }
        .footer .cta { color: ${primary}; }
      `,
      bold: `
        body { background: ${bg}; }
        .header { background: ${primary}; padding: 100px 80px; }
        .title { color: #ffffff; }
        .subtitle { color: ${gold}; }
        .body-zone {
          padding: 70px 80px; flex: 1; display: flex; flex-direction: column;
          border-left: 12px solid ${accent};
        }
        .footer {
          background: ${accent}; padding: 50px 80px 70px;
          display: flex; justify-content: space-between; align-items: center; gap: 40px;
        }
        .footer .cta { color: #ffffff; margin: 0; }
        .footer .qr-caption { color: rgba(255,255,255,0.9); }
      `
    };
  
    const styles = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${dims.width}px; height: ${dims.height}px; }
      body {
        font-family: '${bodyFont}', sans-serif;
        display: flex; flex-direction: column;
        overflow: hidden;
      }
      .title {
        font-family: '${displayFont}', serif;
        font-size: 86px; line-height: 1.06; font-weight: 600; letter-spacing: 0.01em;
      }
      .subtitle {
        font-family: '${bodyFont}', sans-serif;
        font-size: 32px; margin-top: 26px; font-weight: 500; line-height: 1.35;
      }
      .body-zone { justify-content: center; }
      .details { display: flex; flex-direction: column; gap: 22px; }
      .detail { display: flex; align-items: baseline; gap: 18px; }
      .dlabel {
        font-family: '${displayFont}', serif;
        color: ${gold}; font-size: 26px; font-weight: 600;
        text-transform: uppercase; letter-spacing: 0.08em; min-width: 130px;
      }
      .dval { font-size: 38px; color: ${primary}; font-weight: 500; }
      .cta { font-family: '${accentFont}', cursive; font-size: 56px; }
      .qr-slot { display: flex; flex-direction: column; align-items: center; gap: 10px; }
      .qr-img { width: 170px; height: 170px; background: #fff; padding: 10px; border-radius: 8px; }
      .qr-caption { font-size: 20px; font-weight: 500; }
      ${layoutStyles[layout]}
    `;
  
    return `<!DOCTYPE html>
  <html>
  <head>
  <meta charset="utf-8">
  ${fontLink}
  <style>${styles}</style>
  </head>
  <body class="layout-${layout}">
    <div class="header">
      <div class="title">${title}</div>
      ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
    </div>
    <div class="body-zone">
      <div class="details">${detailItems}</div>
    </div>
    <div class="footer">
      ${cta ? `<div class="cta">${cta}</div>` : '<div></div>'}
      ${qrBlock}
    </div>
  </body>
  </html>`;
  };
  
  module.exports = { buildFlyerHtml, DIMENSIONS, LAYOUTS };