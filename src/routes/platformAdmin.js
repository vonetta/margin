const express = require("express");
const router = express.Router();
const { requirePlatformAdmin } = require("../middleware/platformAdmin");
const Ministry = require("../models/Ministry");
const User = require("../models/User");
const Task = require("../models/Task");
const Event = require("../models/Event");
const Flyer = require("../models/Flyer");
const EmailDraft = require("../models/EmailDraft");

router.use(requirePlatformAdmin);

// GET /api/platform-admin/ministries
// Every ministry in the system, read-only — for platform-operator
// awareness of what's out there, not day-to-day ministry management.
router.get("/ministries", async (req, res) => {
  try {
    const ministries = await Ministry.find().sort({ created_at: -1 });
    const memberCounts = await User.aggregate([
      { $unwind: "$ministries" },
      { $group: { _id: "$ministries.ministry_id", count: { $sum: 1 } } },
    ]);
    const countByMinistry = new Map(memberCounts.map((m) => [m._id, m.count]));

    res.json(
      ministries.map((m) => ({
        ministry_id: m.ministry_id,
        name: m.name,
        plan: m.plan,
        onboarding_complete: m.onboarding_complete,
        parent_ministry_id: m.parent_ministry_id,
        created_at: m.created_at,
        member_count: countByMinistry.get(m.ministry_id) || 0,
      })),
    );
  } catch (error) {
    res.status(500).json({ error: "Failed to load ministries" });
  }
});

// GET /api/platform-admin/ministries/:id/overview
// Read-only snapshot of one ministry's real activity — team roster plus
// its 10 most recent tasks/events/flyers/communications drafts. No
// mutation routes exist here at all; this is observation only.
router.get("/ministries/:id/overview", async (req, res) => {
  try {
    const ministryId = req.params.id;
    const ministry = await Ministry.findOne({ ministry_id: ministryId });
    if (!ministry) {
      return res.status(404).json({ error: "Ministry not found" });
    }

    const [team, recentTasks, recentEvents, recentFlyers, recentDrafts] = await Promise.all([
      User.find({ "ministries.ministry_id": ministryId }, "name email ministries"),
      Task.find({ ministry_id: ministryId }).sort({ created_at: -1 }).limit(10),
      Event.find({ ministry_id: ministryId }).sort({ created_at: -1 }).limit(10),
      Flyer.find({ ministry_id: ministryId }).sort({ created_at: -1 }).limit(10),
      EmailDraft.find({ ministry_id: ministryId }).sort({ created_at: -1 }).limit(10),
    ]);

    res.json({
      ministry: {
        ministry_id: ministry.ministry_id,
        name: ministry.name,
        plan: ministry.plan,
        onboarding_complete: ministry.onboarding_complete,
        created_at: ministry.created_at,
      },
      team: team.map((u) => ({
        name: u.name,
        email: u.email,
        role: u.getMembership(ministryId)?.role,
      })),
      recent_tasks: recentTasks,
      recent_events: recentEvents,
      recent_flyers: recentFlyers,
      recent_drafts: recentDrafts,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load ministry overview" });
  }
});

module.exports = router;
