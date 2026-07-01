const express = require("express");
const router = express.Router();
const multer = require("multer");
const { body, validationResult } = require("express-validator");
const Ministry = require("../models/Ministry");
const AiProfile = require("../models/AiProfile");
const User = require("../models/User");
const Event = require("../models/Event");
const Task = require("../models/Task");
const { requireRole } = require("../middleware/auth");
const { uploadFile, safeDeleteFile } = require("../services/storageService");
const { expandEvents } = require("../services/calendarService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
    }
  },
});

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
  requireRole("admin", "leader"),
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
    body("onboarding_complete").optional().isBoolean(),
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
        "onboarding_complete",
      ];

      const updates = Object.keys(req.body)
        .filter((key) => allowed.includes(key))
        .reduce((obj, key) => {
          obj[key] = req.body[key];
          return obj;
        }, {});

      // branding is a single nested field, so a wholesale $set would wipe
      // out logo_url/logo_key (managed by its own upload endpoint) and any
      // sibling color/font keys the caller didn't send. Merge instead.
      if (updates.branding) {
        const current = await Ministry.findOne({
          ministry_id: req.ministryId,
        });
        const currentBranding = current?.branding || {};
        updates.branding = {
          colors: { ...currentBranding.colors, ...updates.branding.colors },
          fonts: { ...currentBranding.fonts, ...updates.branding.fonts },
          image_treatment: {
            ...currentBranding.image_treatment,
            ...updates.branding.image_treatment,
          },
          logo_url: currentBranding.logo_url,
          logo_key: currentBranding.logo_key,
        };
      }

      const ministry = await Ministry.findOneAndUpdate(
        { ministry_id: req.ministryId },
        { $set: updates },
        { returnDocument: "after", runValidators: true },
      );

      res.json(ministry);
    } catch (error) {
      res.status(500).json({ error: "Failed to update ministry" });
    }
  },
);

// POST /api/ministry/logo
// Upload (or replace) the current ministry's logo
router.post(
  "/logo",
  requireRole("admin", "leader"),
  upload.single("logo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const current = await Ministry.findOne({ ministry_id: req.ministryId });
      if (current?.branding?.logo_key) {
        await safeDeleteFile(current.branding.logo_key);
      }

      const { key, url } = await uploadFile({
        ministryId: req.ministryId,
        category: "logos",
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: "logo",
      });

      const ministry = await Ministry.findOneAndUpdate(
        { ministry_id: req.ministryId },
        {
          $set: {
            "branding.logo_url": url,
            "branding.logo_key": key,
          },
        },
        { returnDocument: "after" },
      );

      res.json(ministry);
    } catch (error) {
      console.error("Logo upload error:", error);
      res.status(500).json({ error: "Failed to upload logo" });
    }
  },
);

// GET /api/ministry/team — the roster of logged-in team members for this
// ministry, used to pick who an internal event (e.g. a prayer call meant
// for a subset of staff) should be visible to. Distinct from
// /api/people, which is external contacts (speakers, congregants) rather
// than accounts that can log into Margin.
router.get("/team", requireRole("admin", "leader"), async (req, res) => {
  try {
    const users = await User.find({
      "ministries.ministry_id": req.ministryId,
      is_active: true,
    }).select("name email ministries");

    const team = users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.getMembership(req.ministryId)?.role,
    }));

    res.json(team);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch team" });
  }
});

// PUT /api/ministry/team/:userId — change an existing team member's role
// within this ministry. Admin-only (a leader can see the roster but
// shouldn't be able to grant themselves or others admin). Refuses to
// demote the last remaining admin — otherwise a ministry could end up
// with no one able to manage it, including the person making the change.
router.put(
  "/team/:userId",
  requireRole("admin"),
  [
    body("role")
      .isIn(["admin", "leader", "team"])
      .withMessage("Invalid role"),
  ],
  validate,
  async (req, res) => {
    try {
      const target = await User.findOne({
        _id: req.params.userId,
        "ministries.ministry_id": req.ministryId,
      });
      if (!target) {
        return res.status(404).json({ error: "Team member not found in this ministry" });
      }

      const membership = target.getMembership(req.ministryId);
      if (membership.role === "admin" && req.body.role !== "admin") {
        const adminCount = await User.countDocuments({
          "ministries.ministry_id": req.ministryId,
          "ministries.role": "admin",
        });
        if (adminCount <= 1) {
          return res.status(400).json({
            error: "Can't remove the last admin — promote someone else first",
          });
        }
      }

      membership.role = req.body.role;
      await target.save();

      res.json({
        _id: target._id,
        name: target.name,
        email: target.email,
        role: req.body.role,
      });
    } catch (error) {
      console.error("Team role update error:", error);
      res.status(500).json({ error: "Failed to update team member role" });
    }
  },
);

// GET /api/ministry/sub-ministries
// List ministries linked under the current one. This is visibility only —
// being able to see that a sub-ministry exists does not grant access to
// it. Access to each sub-ministry's own data is entirely separate
// membership, granted explicitly (e.g. at creation, or by that
// sub-ministry's own admin).
router.get(
  "/sub-ministries",
  requireRole("admin", "leader"),
  async (req, res) => {
    try {
      const subMinistries = await Ministry.find({
        parent_ministry_id: req.ministryId,
      });
      res.json(subMinistries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sub-ministries" });
    }
  },
);

// GET /api/ministry/org-overview — aggregate counts per sub-ministry
// (team size, pending approvals, open tasks, events in the next 30
// days), for a parent admin who wants to know what's happening across
// their org without joining each sub-ministry individually. Deliberately
// counts only — no event titles, task descriptions, or member emails —
// so this stays a rollup dashboard rather than a backdoor into a
// sub-ministry's actual data. Admin-only (stricter than
// /sub-ministries, which a leader can also see) since this is
// oversight, not something every leader needs.
router.get("/org-overview", requireRole("admin"), async (req, res) => {
  try {
    const subMinistries = await Ministry.find({
      parent_ministry_id: req.ministryId,
    });

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const overview = await Promise.all(
      subMinistries.map(async (m) => {
        const [teamCount, pendingApprovals, openTasks, approvedEvents] = await Promise.all([
          User.countDocuments({
            "ministries.ministry_id": m.ministry_id,
            is_active: true,
          }),
          Event.countDocuments({ ministry_id: m.ministry_id, status: "pending" }),
          Task.countDocuments({ ministry_id: m.ministry_id, status: "open" }),
          Event.find({ ministry_id: m.ministry_id, status: "approved" }),
        ]);

        return {
          ministry_id: m.ministry_id,
          name: m.name,
          team_count: teamCount,
          pending_approvals: pendingApprovals,
          open_tasks: openTasks,
          upcoming_events: expandEvents(approvedEvents, now, in30Days).length,
        };
      }),
    );

    res.json(overview);
  } catch (error) {
    console.error("Org overview error:", error);
    res.status(500).json({ error: "Failed to build org overview" });
  }
});

// POST /api/ministry/sub-ministries
// Create a new, fully independent tenant linked under the current
// ministry. Only an admin of the parent can do this. The creating admin
// is added as an admin member of the new sub-ministry so they aren't
// locked out of what they just made — that's the only access carried
// over; anyone else who needs into the new ministry must be added there
// directly, the same as any other tenant.
router.post(
  "/sub-ministries",
  requireRole("admin"),
  [
    body("ministry_id")
      .trim()
      .notEmpty()
      .withMessage("Ministry ID is required")
      .matches(/^[a-z0-9-]+$/)
      .withMessage(
        "Ministry ID must be lowercase letters, numbers, and hyphens only",
      ),
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("tagline").optional().trim(),
    body("website").optional().trim().isURL(),
  ],
  validate,
  async (req, res) => {
    try {
      const { ministry_id, name, tagline, website } = req.body;

      const existing = await Ministry.findOne({ ministry_id });
      if (existing) {
        return res.status(400).json({ error: "Ministry ID already in use" });
      }

      const subMinistry = await Ministry.create({
        ministry_id,
        parent_ministry_id: req.ministryId,
        name,
        tagline,
        website,
      });

      await AiProfile.create({
        ministry_id,
        voice_profile: {
          persona_name: name,
          sign_off: "",
          tone_pillars: [],
          sample_phrases: [],
          avoid: [],
        },
        hashtags: { brand: [], content: [] },
        sops: [],
        templates: [],
        recurring_content: [],
      });

      await User.findByIdAndUpdate(req.userId, {
        $push: { ministries: { ministry_id, role: "admin" } },
      });

      res.status(201).json(subMinistry);
    } catch (error) {
      console.error("Sub-ministry creation error:", error);
      res.status(500).json({ error: "Failed to create sub-ministry" });
    }
  },
);

module.exports = router;
