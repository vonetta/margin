const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const NewsletterIssue = require("../models/NewsletterIssue");
const { requireRole } = require("../middleware/auth");
const { buildDefaultSections } = require("../services/newsletterService");
const { exportNewsletterAsPdf, exportNewsletterAsHtml } = require("../services/newsletterExportService");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Assembling/editing/exporting a newsletter is admin/leader work across
// the board — same posture as SOPs, another admin/leader-authored
// content type. No team-member read access carved out, for one
// consistent rule instead of a per-route split.
router.use(requireRole("admin", "leader"));

// GET /api/newsletter/issues
router.get("/issues", async (req, res) => {
  try {
    const issues = await NewsletterIssue.find({ ministry_id: req.ministryId }).sort({
      year: -1,
      month: -1,
    });
    res.json(issues);
  } catch (error) {
    res.status(500).json({ error: "Failed to load newsletter issues" });
  }
});

// GET /api/newsletter/issues/:id
router.get("/issues/:id", async (req, res) => {
  try {
    const issue = await NewsletterIssue.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!issue) return res.status(404).json({ error: "Newsletter issue not found" });
    res.json(issue);
  } catch (error) {
    res.status(500).json({ error: "Failed to load newsletter issue" });
  }
});

// POST /api/newsletter/issues
// Seeds the standard section list, auto-pulling Calendar/Birthdays from
// real data as a starting point (see newsletterService.buildDefaultSections).
router.post(
  "/issues",
  [
    body("month").isInt({ min: 1, max: 12 }).withMessage("month must be 1-12"),
    body("year").isInt({ min: 2000, max: 2100 }).withMessage("year is required"),
    body("theme").optional().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const { month, year, theme } = req.body;
      const sections = await buildDefaultSections(req.ministryId, month, year);
      const issue = await NewsletterIssue.create({
        ministry_id: req.ministryId,
        month,
        year,
        theme,
        sections,
        created_by: req.userId,
      });
      res.status(201).json(issue);
    } catch (error) {
      res.status(500).json({ error: "Failed to create newsletter issue" });
    }
  },
);

// PUT /api/newsletter/issues/:id
// Body: { theme?, status?, sections? } — sections is the whole array
// (toggle enabled, edit content, reorder), replaced wholesale rather than
// patched piecemeal, same convention as PUT /api/profile/templates.
router.put(
  "/issues/:id",
  [
    body("theme").optional().trim(),
    body("status").optional().isIn(["draft", "finalized"]),
    body("sections").optional().isArray(),
    body("cover_photos").optional().isArray(),
  ],
  validate,
  async (req, res) => {
    try {
      const updates = {};
      if (req.body.theme !== undefined) updates.theme = req.body.theme;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.sections !== undefined) updates.sections = req.body.sections;
      if (req.body.cover_photos !== undefined) updates.cover_photos = req.body.cover_photos;

      const issue = await NewsletterIssue.findOneAndUpdate(
        { _id: req.params.id, ministry_id: req.ministryId },
        { $set: updates },
        { returnDocument: "after", runValidators: true },
      );
      if (!issue) return res.status(404).json({ error: "Newsletter issue not found" });
      res.json(issue);
    } catch (error) {
      res.status(500).json({ error: "Failed to update newsletter issue" });
    }
  },
);

// GET /api/newsletter/issues/:id/export
// Renders on-demand — no PDF is stored — same convention as the SOP
// export route: always reflects the issue's current content, and there's
// nothing stale to invalidate when a section changes.
router.get("/issues/:id/export", async (req, res) => {
  try {
    const issue = await NewsletterIssue.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!issue) return res.status(404).json({ error: "Newsletter issue not found" });

    const pdf = await exportNewsletterAsPdf({ issue, ministry: req.ministry });
    const filename = `newsletter-${issue.year}-${String(issue.month).padStart(2, "0")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ error: "Failed to export newsletter" });
  }
});

// GET /api/newsletter/issues/:id/export-html
// For pasting into Mailchimp — Margin assembles, Mailchimp sends.
router.get("/issues/:id/export-html", async (req, res) => {
  try {
    const issue = await NewsletterIssue.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!issue) return res.status(404).json({ error: "Newsletter issue not found" });

    const html = await exportNewsletterAsHtml({ issue, ministry: req.ministry });
    const filename = `newsletter-${issue.year}-${String(issue.month).padStart(2, "0")}.html`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: "Failed to export newsletter HTML" });
  }
});

// DELETE /api/newsletter/issues/:id
router.delete("/issues/:id", async (req, res) => {
  try {
    const issue = await NewsletterIssue.findOneAndDelete({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!issue) return res.status(404).json({ error: "Newsletter issue not found" });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete newsletter issue" });
  }
});

module.exports = router;
