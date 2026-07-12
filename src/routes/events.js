const express = require("express");
const router = express.Router();
const { body, query, validationResult } = require("express-validator");
const Event = require("../models/Event");
const Flyer = require("../models/Flyer");
const { requireRole } = require("../middleware/auth");
const { expandEvents, isValidRecurrenceRule, parseFlyerDate } = require("../services/calendarService");

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

const validVisibleTo = body("visible_to")
  .optional()
  .isArray()
  .withMessage("visible_to must be an array of user ids");

// Admins/leaders manage the calendar, so they see every event regardless
// of who it's addressed to. Everyone else only sees an event if it has
// no visible_to list (the default — open to the whole team) or they're
// explicitly named on it.
const applyVisibilityFilter = (req, filter) => {
  if (req.userRole === "admin" || req.userRole === "leader") return filter;
  return {
    ...filter,
    $or: [
      { visible_to: { $exists: false } },
      { visible_to: { $size: 0 } },
      { visible_to: req.userId.toString() },
    ],
  };
};

// GET /api/events — raw event list for this ministry (team view, every
// status/visibility, narrowed by per-event visible_to for non-admin/
// leader roles).
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    let filter = { ministry_id: req.ministryId };
    if (status) filter.status = status;
    filter = applyVisibilityFilter(req, filter);

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
      const filter = applyVisibilityFilter(req, {
        ministry_id: req.ministryId,
        status: { $ne: "rejected" },
      });
      const events = await Event.find(filter);
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
    validVisibleTo,
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
        visible_to: req.body.visible_to || [],
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
    validVisibleTo,
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

// GET /api/events/:id/suggested-tasks — three generic, always-applicable
// starter tasks for a newly-approved event. Nobody is guessed as the
// assignee here; the frontend shows these in a review panel where a
// human picks who each one goes to (or skips it) before anything is
// actually created via the ordinary POST /api/tasks.
router.get("/:id/suggested-tasks", requireRole("admin", "leader"), async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.id, ministry_id: req.ministryId });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const suggestions = [
      {
        title: `Day-of setup for ${event.title}`,
        description: "Prep the space and any equipment before the event starts.",
        due_date: event.start,
      },
    ];

    if (event.flyer_id) {
      const flyer = await Flyer.findOne({ _id: event.flyer_id, ministry_id: req.ministryId });
      // Prefer rsvp_by_raw (the exact picker value, stored alongside the
      // formatted display string since the raw-storage fix) over
      // re-parsing content.rsvp_by's already-formatted free text — that
      // round-trip through chrono was the lossy path this field exists
      // to avoid. Only falls back to parsing for flyers generated before
      // that fix, which have no raw field.
      const rsvpByRaw = flyer?.content?.rsvp_by_raw;
      const rsvpBy = flyer?.content?.rsvp_by;
      if (rsvpByRaw || rsvpBy) {
        const dueDate = rsvpByRaw ? new Date(rsvpByRaw) : parseFlyerDate(rsvpBy)?.start || null;
        suggestions.push({
          title: `RSVP follow-up for ${event.title}`,
          description: "Follow up with anyone who hasn't RSVP'd yet.",
          due_date: dueDate,
        });
      }
    }

    const debriefAnchor = event.end || event.start;
    suggestions.push({
      title: `Thank-you / debrief for ${event.title}`,
      description: "Send thank-yous and debrief what worked and what didn't.",
      due_date: new Date(debriefAnchor.getTime() + 2 * 24 * 60 * 60 * 1000),
    });

    res.json(suggestions);
  } catch (error) {
    console.error("Suggested tasks error:", error);
    res.status(500).json({ error: "Failed to compute suggested tasks" });
  }
});

module.exports = router;
