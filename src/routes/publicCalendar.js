const express = require("express");
const router = express.Router();
const Event = require("../models/Event");
const Ministry = require("../models/Ministry");
const { buildPublicCalendarFeed } = require("../services/calendarService");

// GET /api/public/calendar/:ministry_id.ics — no auth, no tenant
// middleware. This is the URL a WordPress calendar plugin (or Google/
// Apple/Outlook) subscribes to directly. Only approved + public events
// are ever included — see calendarService.buildPublicCalendarFeed, which
// filters before anything is expanded into the feed.
router.get("/:ministryFile", async (req, res) => {
  try {
    const ministryId = req.params.ministryFile.replace(/\.ics$/i, "");
    const ministry = await Ministry.findOne({ ministry_id: ministryId });
    if (!ministry) {
      return res.status(404).send("Calendar not found");
    }

    // A year-wide window — generous enough to cover any realistic
    // recurrence subscription refresh cadence without growing unbounded.
    const from = new Date();
    from.setMonth(from.getMonth() - 1);
    const to = new Date();
    to.setFullYear(to.getFullYear() + 1);

    const events = await Event.find({
      ministry_id: ministryId,
      visibility: "public",
      status: "approved",
    });

    const feed = buildPublicCalendarFeed(ministry, events, { from, to });

    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", `inline; filename="${ministryId}.ics"`);
    res.send(feed);
  } catch (error) {
    console.error("Public calendar feed error:", error);
    res.status(500).send("Failed to generate calendar feed");
  }
});

module.exports = router;
