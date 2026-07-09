const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Flyer = require("../models/Flyer");
const Person = require("../models/Person");
const Ministry = require("../models/Ministry");
const AiProfile = require("../models/AiProfile");
const { requireRole } = require("../middleware/auth");
const { aiLimiter } = require("../middleware/rateLimiters");
const { generateFlyer } = require("../services/flyerService");
const { uploadFile, safeDeleteFile } = require("../services/storageService");
const { listLayouts, suggestLayout } = require("../services/layouts");
const { validateStyle } = require("../services/layouts/styleSchema");
const { resolveTone, inferTone } = require("../services/typographyService");
const {
  buildLiteralPrompt,
} = require("../services/backgroundSelector");
const { generateBackground } = require("../services/imageService");
const { generateAiFlyer } = require("../services/aiFlyerService");
const { generateContent } = require("../services/generationService");
const { withApprovedSops } = require("../services/sopService");
const ContentDraft = require("../models/ContentDraft");
const Background = require("../models/Background");
const Event = require("../models/Event");
const { parseFlyerDate, formatFriendlyDate } = require("../services/calendarService");
const { notifyEventPendingApproval } = require("../services/notificationService");
const { limitsFor, planLimitError, startOfMonth } = require("../services/planLimits");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// GET /api/flyers/layouts — the gallery of available layouts + metadata
router.get("/layouts", (req, res) => {
  res.json(listLayouts());
});

// POST /api/flyers/infer-tone — the manual-entry wizard's equivalent of
// the chat's AI-proposed tone, but genuinely free: keyword inference
// against this ministry's own tone_keywords (no AI call, no aiLimiter).
// Returns the ministry's own category names as `options` (so the wizard's
// dropdown is always self-consistent with what actually drives font/
// background selection) plus a suggested pre-fill. Read-only, no role
// gate — same posture as tasks' GET /similar duplicate-check.
router.post("/infer-tone", async (req, res) => {
  try {
    const { title = "", subtitle = "", description = "" } = req.body || {};
    const aiProfile = await AiProfile.findOne({ ministry_id: req.ministryId });
    const toneKeywords = aiProfile?.type_system?.tone_keywords || {};
    const options =
      toneKeywords instanceof Map ? Array.from(toneKeywords.keys()) : Object.keys(toneKeywords);
    const eventText = [title, subtitle, description].filter(Boolean).join(" ");
    const tone = eventText.trim() ? inferTone(eventText, toneKeywords) : null;
    res.json({ tone, options });
  } catch (error) {
    res.status(500).json({ error: "Could not infer a tone" });
  }
});

// POST /api/flyers/background-preview — generate one candidate literal
// image (real scenes/people, not the abstract-only auto fallback) for the
// styling wizard to show and let the user accept, regenerate, or skip.
// Nothing here attaches to a flyer; the wizard passes the returned url back
// as background_url on /generate only if the user actually accepts it.
router.post(
  "/background-preview",
  requireRole("admin", "leader"),
  aiLimiter,
  [body("topic_hint").optional().trim()],
  validate,
  async (req, res) => {
    try {
      const ministry = await Ministry.findOne({ ministry_id: req.ministryId });
      const prompt = buildLiteralPrompt(ministry, req.body.topic_hint);
      const png = await generateBackground(prompt);

      const { key, url } = await uploadFile({
        ministryId: req.ministryId,
        category: "backgrounds",
        buffer: png,
        contentType: "image/png",
        originalName: "literal-preview",
      });

      const background = await Background.create({
        ministry_id: req.ministryId,
        prompt,
        url,
        key,
        created_by: req.userId,
      });

      res.status(201).json(background);
    } catch (error) {
      console.error("Background preview generation error:", error);
      res.status(500).json({ error: "Failed to generate a background image" });
    }
  },
);

// GET /api/flyers — flyer history for the ministry
router.get("/", async (req, res) => {
  try {
    const flyers = await Flyer.find({ ministry_id: req.ministryId }).sort({
      created_at: -1,
    });
    res.json(flyers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch flyers" });
  }
});

// POST /api/flyers/generate — the main event
router.post(
  "/generate",
  requireRole("admin", "leader"),
  aiLimiter,
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("layout").optional().trim(),
    body("host_id").optional().trim(),
    body("speaker_ids")
      .optional()
      .isArray()
      .withMessage("speaker_ids must be an array"),
    body("qr_url").optional().trim(),
    body("theme_tags")
      .optional()
      .isArray()
      .withMessage("theme_tags must be an array"),
    body("highlights")
      .optional()
      .isArray()
      .withMessage("highlights must be an array"),
    body("platform").optional().trim(),
    body("background_url").optional().trim(),
    body("engine").optional().isIn(["template", "ai"]).withMessage("Invalid engine"),
    body("tone").optional().trim(),
  ],
  validate,
  async (req, res) => {
    try {
      const flyersThisMonth = await Flyer.countDocuments({
        ministry_id: req.ministryId,
        created_at: { $gte: startOfMonth() },
      });
      if (flyersThisMonth >= limitsFor(req.ministry.plan).flyers_per_month) {
        return res.status(402).json({ error: planLimitError("flyers_per_month", req.ministry.plan) });
      }

      const {
        title,
        subtitle,
        description,
        theme_tags,
        highlights,
        audience,
        date,
        location,
        cost,
        cta,
        qr_url,
        host_id,
        speaker_ids = [],
        layout,
        platform,
        background_url,
        engine = "template",
        tone,
      } = req.body;

      // Always clamped to safe ranges regardless of where it came from —
      // an AI-proposed value from the chat, a manual override from the
      // customization wizard, or a raw API call.
      const style = validateStyle(req.body.style);

      // Resolve ministry branding + type system
      const ministry = await Ministry.findOne({ ministry_id: req.ministryId });
      const aiProfile = await AiProfile.findOne({
        ministry_id: req.ministryId,
      });
      const typeSystem = aiProfile?.type_system || null;

      // Re-clamped here regardless of where `tone` came from (the chat
      // step already resolved it once, but the ministry's own categories
      // could have changed since, or this could be a raw API call) —
      // resolveTone can never return anything the ministry hasn't
      // actually defined. Undefined when no tone was sent at all, so
      // generateFlyer falls through to its normal keyword inference —
      // distinct from `null`, which would mean "AI looked and found no
      // match, don't infer further."
      const resolvedTone =
        tone !== undefined ? resolveTone(tone, typeSystem?.tone_keywords) : undefined;

      // Resolve people from the roster
      let host = null;
      if (host_id) {
        host = await Person.findOne({
          _id: host_id,
          ministry_id: req.ministryId,
        });
      }
      let speakers = [];
      if (speaker_ids.length) {
        speakers = await Person.find({
          _id: { $in: speaker_ids },
          ministry_id: req.ministryId,
        });
      }

      const content = {
        title,
        subtitle,
        description,
        theme_tags,
        highlights,
        audience,
        date: formatFriendlyDate(date),
        location,
        cost,
        cta,
        qr_caption: req.body.qr_caption,
      };

      const baseArgs = {
        content,
        branding: ministry?.branding || {},
        typeSystem,
        qrUrl: qr_url || null,
        host,
        speakers,
        layout: layout || null,
        style,
        resolvedTone,
        ministryId: req.ministryId,
        platform: platform || null,
        backgroundUrl: background_url || null,
      };

      let flyer;

      if (engine === "ai") {
        // A single full-image generation, not layout-driven — there's no
        // print size here since that would mean a second, independently
        // generated image (double the cost, different composition) rather
        // than a resize of the same one.
        const social = await generateAiFlyer({
          branding: ministry?.branding || {},
          content,
          host,
          speakers,
          qrUrl: qr_url || null,
          size: "social",
          typeSystem,
          resolvedTone,
        });

        const socialUp = await uploadFile({
          ministryId: req.ministryId,
          category: "flyers",
          buffer: social.png,
          contentType: "image/png",
          originalName: `${title}-social-ai`,
        });

        flyer = await Flyer.create({
          ministry_id: req.ministryId,
          title,
          layout: "ai",
          engine: "ai",
          social_url: socialUp.url,
          social_key: socialUp.key,
          content,
          host_id: host_id || null,
          speaker_ids,
          qr_url: qr_url || null,
          created_by: req.userId,
        });
      } else {
        // Generate both sizes
        const social = await generateFlyer({ ...baseArgs, size: "social" });
        const print = await generateFlyer({
          ...baseArgs,
          size: "print",
          backgroundUrl: null,
        });

        // Save both to R2
        const socialUp = await uploadFile({
          ministryId: req.ministryId,
          category: "flyers",
          buffer: social.png,
          contentType: "image/png",
          originalName: `${title}-social`,
        });
        const printUp = await uploadFile({
          ministryId: req.ministryId,
          category: "flyers",
          buffer: print.png,
          contentType: "image/png",
          originalName: `${title}-print`,
        });

        // Store the record
        flyer = await Flyer.create({
          ministry_id: req.ministryId,
          title,
          layout: social.meta.layout,
          engine: "template",
          tone: social.meta.tone,
          social_url: socialUp.url,
          social_key: socialUp.key,
          print_url: printUp.url,
          print_key: printUp.key,
          content,
          host_id: host_id || null,
          speaker_ids,
          background_id: social.meta.background_id || null,
          qr_url: qr_url || null,
          created_by: req.userId,
        });
      }

      // Best-effort: get the event onto the calendar as something a human
      // confirms, rather than requiring it be entered a second time by
      // hand. A date that fails to parse just means no calendar entry —
      // it never blocks the flyer itself from being created.
      const parsedDate = parseFlyerDate(date);
      if (parsedDate) {
        try {
          const pendingEvent = await Event.create({
            ministry_id: req.ministryId,
            title,
            description: description || undefined,
            location: location || undefined,
            start: parsedDate.start,
            end: parsedDate.end || undefined,
            status: "pending",
            source: "flyer",
            flyer_id: flyer._id.toString(),
            created_by: req.userId,
          });
          await notifyEventPendingApproval({ ministryId: req.ministryId, event: pendingEvent });
        } catch (eventError) {
          console.error("Auto calendar event creation failed:", eventError);
        }
      }

      res.status(201).json(flyer);
    } catch (error) {
      console.error("Flyer generation error:", error);
      res.status(500).json({ error: "Failed to generate flyer" });
    }
  },
);

// POST /api/flyers/:id/generate-caption — write an on-brand social caption
// for an already-generated flyer, using the same AI voice engine as
// Content Studio. Uses the flyer's own stored content fields (title/date/
// location/etc, already known exactly) rather than re-reading them off the
// image, so it's the direct in-app counterpart to Content Studio's
// upload-a-flyer-image bridge (POST /api/content/extract-flyer).
router.post(
  "/:id/generate-caption",
  requireRole("admin", "leader"),
  aiLimiter,
  [body("platform").optional().trim().isIn(["Instagram", "Facebook", "Email", "Quote card"])],
  validate,
  async (req, res) => {
    try {
      const flyer = await Flyer.findOne({
        _id: req.params.id,
        ministry_id: req.ministryId,
      });
      if (!flyer) return res.status(404).json({ error: "Flyer not found" });

      const profile = await AiProfile.findOne({ ministry_id: req.ministryId });
      if (!profile) {
        return res.status(404).json({ error: "AI profile not found for this ministry" });
      }

      const platform = req.body.platform || "Instagram";
      const c = flyer.content || {};
      const promptLines = [
        `Write a social caption for this event flyer, titled "${flyer.title}".`,
        c.subtitle && `Subtitle: ${c.subtitle}`,
        c.date && `Date: ${c.date}`,
        c.location && `Location: ${c.location}`,
        c.cost && `Cost: ${c.cost}`,
        c.audience && `Audience: ${c.audience}`,
        c.cta && `Call to action: ${c.cta}`,
        c.description && `Description: ${c.description}`,
      ].filter(Boolean);
      const prompt = promptLines.join("\n");

      const profileWithSops = await withApprovedSops(profile, req.ministryId);
      const caption = await generateContent(prompt, profileWithSops, req.ministry, platform);

      const draft = await ContentDraft.create({
        ministry_id: req.ministryId,
        prompt,
        platform,
        caption,
        image_url: flyer.social_url || undefined,
        generated_by: req.userId,
        status: "pending",
      });

      res.status(201).json(draft);
    } catch (error) {
      console.error("Flyer caption generation error:", error);
      res.status(500).json({ error: "Failed to generate a caption for this flyer" });
    }
  },
);

// DELETE /api/flyers/:id
router.delete("/:id", requireRole("admin", "leader"), async (req, res) => {
  try {
    const flyer = await Flyer.findOne({
      _id: req.params.id,
      ministry_id: req.ministryId,
    });
    if (!flyer) return res.status(404).json({ error: "Flyer not found" });

    for (const key of [flyer.social_key, flyer.print_key]) {
      if (key) await safeDeleteFile(key);
    }
    await Flyer.deleteOne({ _id: flyer._id });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete flyer" });
  }
});

module.exports = router;
