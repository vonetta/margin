const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Ministry = require("../models/Ministry");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/ministry
// Get current ministry profile
router.get("/", async (req, res) => {
  try {
    res.json(req.ministry);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch ministry" });
  }
});

// PUT /api/ministry
// Update current ministry profile
router.put(
  "/",
  [
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Name cannot be empty"),
    body("tagline").optional().trim(),
    body("website")
      .optional()
      .trim()
      .isURL()
      .withMessage("Website must be a valid URL"),
    body("plan")
      .optional()
      .isIn(["small", "mid", "enterprise"])
      .withMessage("Invalid plan"),
    body("branding.colors.primary")
      .optional()
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage("Primary color must be a valid hex code"),
    body("branding.fonts.heading").optional().trim(),
    body("branding.fonts.body").optional().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const allowed = [
        "name",
        "tagline",
        "website",
        "entity_boundary",
        "branding",
        "plan",
      ];

      const updates = Object.keys(req.body)
        .filter((key) => allowed.includes(key))
        .reduce((obj, key) => {
          obj[key] = req.body[key];
          return obj;
        }, {});

        const ministry = await Ministry.findOneAndUpdate(
            { ministry_id: req.ministryId },
            { $set: updates },
            { returnDocument: 'after', runValidators: true }
          );

      res.json(ministry);
    } catch (error) {
      res.status(500).json({ error: "Failed to update ministry" });
    }
  },
);

module.exports = router;
