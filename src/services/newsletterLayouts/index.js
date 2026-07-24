const classic = require("./classic");
const bold = require("./bold");
const minimal = require("./minimal");

const LAYOUTS = { classic, bold, minimal };

const listLayouts = () => Object.entries(LAYOUTS).map(([id, layout]) => ({ id, ...layout.meta }));

const renderLayout = (id, issue, ministry, opts) => {
  const layout = LAYOUTS[id] || LAYOUTS.classic;
  return layout.render(issue, ministry, opts);
};

module.exports = { listLayouts, renderLayout, LAYOUTS };
