const { renderHtmlToPdf } = require("./flyerRenderer");
const { renderLayout, listLayouts } = require("./newsletterLayouts");

// Dispatches to whichever layout the issue picked (defaults to "classic"
// for issues created before templates existed). Each layout owns its own
// full HTML/CSS — see newsletterLayouts/ — this is just the routing point.
const buildNewsletterHtml = (issue, ministry, opts) => renderLayout(issue.template, issue, ministry, opts);

const exportNewsletterAsPdf = async ({ issue, ministry }) => {
  const html = await buildNewsletterHtml(issue, ministry);
  return renderHtmlToPdf(html, {
    margin: { top: "0.3in", bottom: "0.3in", left: "0.3in", right: "0.3in" },
  });
};

// For pasting into Mailchimp — no PDF pagination involved, just the raw
// HTML the issue's content assembles into.
const exportNewsletterAsHtml = async ({ issue, ministry }) => buildNewsletterHtml(issue, ministry, { forEmail: true });

module.exports = { buildNewsletterHtml, exportNewsletterAsPdf, exportNewsletterAsHtml, listNewsletterTemplates: listLayouts };
