const express = require("express");
const router = express.Router();
const multer = require("multer");
const Person = require("../models/Person");
const { body, validationResult } = require("express-validator");
const { requireRole } = require("../middleware/auth");
const { uploadFile, safeDeleteFile } = require("../services/storageService");
const { removeBackground } = require("../services/imageService");
const { whiteToTransparent } = require("../services/cutoutService");

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

// GET /api/people
router.get("/", async (req, res) => {
  try {
    const { role } = req.query;
    const filter = { ministry_id: req.ministryId, active: true };
    if (role) filter.role = role;

    const people = await Person.find(filter).sort({ name: 1 });
    res.json(people);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch people" });
  }
});

// GET /api/people/:id
router.get("/:id", async (req, res) => {
  try {
    const person = await Person.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!person) {
      return res.status(404).json({ error: "Person not found" });
    }
    res.json(person);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch person" });
  }
});

// POST /api/people
router.post(
  "/",
  requireRole("admin", "leader"),
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("title").optional().trim(),
    body("role")
      .optional()
      .isIn(["host", "speaker", "leader", "member", "staff"])
      .withMessage("Invalid role"),
    body("email").optional().trim().isEmail().withMessage("Invalid email"),
    body("bio").optional().trim(),
    body("birthdate").optional({ nullable: true }).isISO8601().withMessage("Invalid birthdate"),
    body("newsletter_birthday_consent").optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const person = await Person.create({
        ministry_id: req.ministryId,
        name: req.body.name,
        title: req.body.title,
        role: req.body.role || "member",
        email: req.body.email,
        bio: req.body.bio,
        birthdate: req.body.birthdate || undefined,
        newsletter_birthday_consent: req.body.newsletter_birthday_consent || false,
      });
      res.status(201).json(person);
    } catch (error) {
      res.status(500).json({ error: "Failed to create person" });
    }
  },
);

// PUT /api/people/:id
router.put(
  "/:id",
  requireRole("admin", "leader"),
  [
    body("name")
      .optional()
      .trim()
      .notEmpty()
      .withMessage("Name cannot be empty"),
    body("role")
      .optional()
      .isIn(["host", "speaker", "leader", "member", "staff"])
      .withMessage("Invalid role"),
    body("email").optional().trim().isEmail().withMessage("Invalid email"),
    body("birthdate").optional({ nullable: true }).isISO8601().withMessage("Invalid birthdate"),
    body("newsletter_birthday_consent").optional().isBoolean(),
  ],
  validate,
  async (req, res) => {
    try {
      const allowed = [
        "name",
        "title",
        "role",
        "email",
        "bio",
        "active",
        "birthdate",
        "newsletter_birthday_consent",
      ];
      const updates = Object.keys(req.body)
        .filter((key) => allowed.includes(key))
        .reduce((obj, key) => {
          obj[key] = req.body[key];
          return obj;
        }, {});

      const person = await Person.findOneAndUpdate(
        { _id: req.params.id, ministry_id: req.ministryId },
        { $set: updates },
        { returnDocument: "after", runValidators: true },
      );

      if (!person) {
        return res.status(404).json({ error: "Person not found" });
      }
      res.json(person);
    } catch (error) {
      res.status(500).json({ error: "Failed to update person" });
    }
  },
);

// POST /api/people/:id/headshot
router.post(
  "/:id/headshot",
  requireRole("admin", "leader"),
  upload.single("headshot"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const person = await Person.findOne({
        _id: req.params.id,
        ministry_id: req.ministryId,
      });

      if (!person) {
        return res.status(404).json({ error: "Person not found" });
      }

      // Clean up old files if replacing
      if (person.headshot_key) await safeDeleteFile(person.headshot_key);
      if (person.cutout_key) await safeDeleteFile(person.cutout_key);

      // 1. Store the original
      const original = await uploadFile({
        ministryId: req.ministryId,
        category: "headshots",
        buffer: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname || person.name,
      });

      person.headshot_url = original.url;
      person.headshot_key = original.key;

      // 2. Generate the transparent cut-out (Gemini white bg + flood-fill)
      let cutoutResult = null;
      try {
        const whiteBg = await removeBackground(
          req.file.buffer,
          req.file.mimetype,
        );
        const cutout = await whiteToTransparent(whiteBg);
        cutoutResult = await uploadFile({
          ministryId: req.ministryId,
          category: "cutouts",
          buffer: cutout,
          contentType: "image/png",
          originalName: `${person.name}-cutout`,
        });
        person.cutout_url = cutoutResult.url;
        person.cutout_key = cutoutResult.key;
      } catch (e) {
        // Non-fatal: if cut-out fails, we still have the original
        console.error("Cut-out generation failed:", e.message);
      }

      await person.save();

      res.json({
        headshot_url: person.headshot_url,
        cutout_url: person.cutout_url,
        cutout_ready: !!cutoutResult,
        person,
      });
    } catch (error) {
      console.error("Headshot upload error:", error);
      res.status(500).json({ error: "Failed to upload headshot" });
    }
  },
);

// DELETE /api/people/:id
router.delete("/:id", requireRole("admin", "leader"), async (req, res) => {
  try {
    const person = await Person.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });

    if (!person) {
      return res.status(404).json({ error: "Person not found" });
    }

    if (person.headshot_key) await safeDeleteFile(person.headshot_key);
    if (person.cutout_key) await safeDeleteFile(person.cutout_key);

    await Person.deleteOne({ _id: person._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete person" });
  }
});

module.exports = router;
