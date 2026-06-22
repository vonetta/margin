const Ministry = require("../models/Ministry");

const tenantMiddleware = async (req, res, next) => {
  try {
    const ministryId = req.headers["x-ministry-id"];

    if (!ministryId) {
      return res.status(400).json({ error: "No ministry ID provided" });
    }

    const ministry = await Ministry.findOne({ ministry_id: ministryId });

    if (!ministry) {
      return res.status(404).json({ error: "Ministry not found" });
    }

    req.ministry = ministry;
    req.ministryId = ministryId;

    next();
  } catch (error) {
    res.status(500).json({ error: "Tenant resolution failed" });
  }
};

module.exports = tenantMiddleware;
