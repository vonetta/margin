const monument = require("./monument");
const feature = require("./feature");
const canvas = require("./canvas");
const showcase = require("./showcase");

const LAYOUTS = {
  monument,
  feature,
  canvas,
  showcase,
};

// Return metadata for all layouts (for the UI gallery + engine suggestion)
const listLayouts = () => {
  return Object.entries(LAYOUTS).map(([id, layout]) => ({
    id,
    ...layout.meta,
  }));
};

// Render a specific layout by id
const renderLayout = (id, props) => {
  const layout = LAYOUTS[id];
  if (!layout) {
    throw new Error(`Unknown layout: ${id}`);
  }
  return layout.render(props);
};

// Suggest the best layout for an event based on what it has.
// Returns a layout id.
const suggestLayout = ({ host, speakers = [], venueImage, tone } = {}) => {
  const speakerCount = speakers.length;
  const hasHost = !!(host && (host.cutout_url || host.headshot_url));

  // No people but a venue image → Canvas (save-the-date style)
  if (!hasHost && speakerCount === 0 && venueImage) return "canvas";
  // Many speakers, no single dominant host → Showcase
  if (speakerCount >= 3 && !hasHost) return "showcase";
  // A host with guest speakers → Monument
  if (hasHost && speakerCount >= 1) return "monument";
  // A single host, no speakers → Feature
  if (hasHost && speakerCount === 0) return "feature";
  // Fallback
  return "monument";
};

module.exports = { listLayouts, renderLayout, suggestLayout, LAYOUTS };
