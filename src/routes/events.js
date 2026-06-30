const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const Event = require("../models/Event");
const { requireRole } = require("../middleware/auth");
const { expandEvents, isValidRecurrenceRule } = require("../services/calendarService");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const validRecurrence = body("recurrence_rule")
  .optional({ nullable: true })
  .trim()
  .custom((value) => {
    if (value && !isValidRecurrenceRule(value)) {
      throw new Error("recurrence_rule is not a valid recurrence pattern");
    }
    return true;
  });

// GET /api/events — raw event list for this ministry (team view, every
// status/visibility). Any authenticated team member can see their own
// ministry's full calendar — the access split that matters here is
// internal team vs. public congregants, not role-within-the-team.
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { ministry_id: req.ministryId };
    if (status) filter.status = status;

    const events = await Event.find(filter).sort({ start: 1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// GET /api/events/expanded?from=&to= — recurrence-expanded occurrences in
// a date range, which is what the calendar UI actually renders. Pending
// and rejected events are included here too (the team view shows
// everything) — the public feed is the one that filters those out.
router.get(
  "/expanded",
  [
    query("from").isISO8601().withMessage("from must be an ISO date"),
    query("to").isISO8601().withMessage("to must be an ISO date"),
  ],
  validate,
  async (req, res) => {
    try {
      const from = new Date(req.query.from);
      const to = new Date(req.query.to);
      const events = await Event.find({
        ministry_id: req.ministryId,
        status: { $ne: "rejected" },
      });
      res.json(expandEvents(events, from, to));
    } catch (error) {
      console.error("Event expansion error:", error);
      res.status(500).json({ error: "Failed to expand events" });
    }
  },
);

// POST /api/events
router.post(
  "/",
  requireRole("admin", "leader"),
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("start").isISO8601().withMessage("start must be an ISO date"),
    body("end").optional().isISO8601(),
    body("description").optional().trim(),
    body("location").optional().trim(),
    body("all_day").optional().isBoolean(),
    validRecurrence,
    body("visibility").optional().isIn(["internal", "public"]),
  ],
  validate,
  async (req, res) => {
    try {
      const event = await Event.create({
        ministry_id: req.ministryId,
        title: req.body.title,
        description: req.body.description,
        location: req.body.location,
        start: new Date(req.body.start),
        end: req.body.end ? new Date(req.body.end) : undefined,
        all_day: req.body.all_day || false,
        recurrence_rule: req.body.recurrence_rule || undefined,
        visibility: req.body.visibility || "internal",
        status: "approved",
        source: "manual",
        created_by: req.userId,
      });
      res.status(201).json(event);
    } catch (error) {
      console.error("Event creation error:", error);
      res.status(500).json({ error: "Failed to create event" });
    }
  },
);

// PUT /api/events/:id
router.put(
  "/:id",
  requireRole("admin", "leader"),
  [
    body("title").optional().trim().notEmpty(),
    body("start").optional().isISO8601(),
    body("end").optional().isISO8601(),
    body("description").optional().trim(),
    body("location").optional().trim(),
    body("all_day").optional().isBoolean(),
    validRecurrence,
    body("visibility").optional().isIn(["internal", "public"]),
  ],
  validate,
  async (req, res) => {
    try {
      const updates = { ...req.body };
      if (updates.start) updates.start = new Date(updates.start);
      if (updates.end) updates.end = new Date(updates.end);

      const event = await Event.findOneAndUpdate(
        { _id: req.params.id, ministry_id: req.ministryId },
        updates,
        { returnDocument: "after", runValidators: true },
      );
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (error) {
      console.error("Event update error:", error);
      res.status(500).json({ error: "Failed to update event" });
    }
  },
);

// DELETE /api/events/:id
router.delete("/:id", requireRole("admin", "leader"), async (req, res) => {
  try {
    const event = await Event.findOneAndDelete({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete event" });
  }
});

// PUT /api/events/:id/approve — for events sitting pending, most often
// ones auto-created from a generated flyer.
router.put("/:id/approve", requireRole("admin", "leader"), async (req, res) => {
  try {
    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, ministry_id: req.ministryId },
      { status: "approved" },
      { returnDocument: "after" },
    );
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: "Failed to approve event" });
  }
});

// PUT /api/events/:id/reject
router.put("/:id/reject", requireRole("admin", "leader"), async (req, res) => {
  try {
    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, ministry_id: req.ministryId },
      { status: "rejected" },
      { returnDocument: "after" },
    );
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: "Failed to reject event" });
  }
});

module.exports = router;
