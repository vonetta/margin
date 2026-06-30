const express = require("express");
const router = express.Router();
const { query, validationResult } = require("express-validator");
const Notification = require("../models/Notification");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/notifications?unread=true
router.get(
  "/",
  [query("unread").optional().isBoolean()],
  validate,
  async (req, res) => {
    try {
      const filter = { ministry_id: req.ministryId, user_id: req.userId.toString() };
      if (req.query.unread === "true") filter.read = false;

      const notifications = await Notification.find(filter).sort({ created_at: -1 }).limit(50);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  },
);

// PUT /api/notifications/:id/read
router.put("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, ministry_id: req.ministryId, user_id: req.userId.toString() },
      { read: true },
      { returnDocument: "after" },
    );
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

// PUT /api/notifications/read-all
router.put("/read-all", async (req, res) => {
  try {
    await Notification.updateMany(
      { ministry_id: req.ministryId, user_id: req.userId.toString(), read: false },
      { read: true },
    );
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

module.exports = router;
