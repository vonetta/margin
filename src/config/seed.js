const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Ministry = require("../models/Ministry");
const AiProfile = require("../models/AiProfile");

dotenv.config();

const seedKTM = async () => {
  // This script DELETES the live ktm Ministry + AiProfile and recreates
  // them from the hardcoded values below — wiping any edits made in the
  // app since. The local .env points at the production database, so a
  // NODE_ENV check wouldn't protect anything; require an explicit,
  // unambiguous opt-in instead so this can never run by reflex.
  if (process.env.SEED_CONFIRM !== "yes-wipe-ktm") {
    console.error(
      "Refusing to run: this replaces the LIVE ktm ministry and AI profile with hardcoded seed data.\n" +
        "If you really mean it: SEED_CONFIRM=yes-wipe-ktm npm run seed",
    );
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    await Ministry.deleteOne({ ministry_id: "ktm" });
    await AiProfile.deleteOne({ ministry_id: "ktm" });

    const ministry = await Ministry.create({
      ministry_id: "ktm",
      name: "Khy Traylor Global Ministries",
      tagline: "Equipping Leaders. Changing Lives.",
      website: "khytraylorministries.com",
      entity_boundary:
        "KTM is educational and structural — leader development, ordination, deep training. Salt & Light is relational and gathering-focused — community activation and collective spiritual refreshing. Never mix entities in one content piece.",
      branding: {
        colors: {
          primary: "#03293F",
          accent: "#EA8A8B",
          background: "#F0C7C3",
          text: "#1C1C1C",
          gold: "#DAAE4F",
        },
        fonts: {
          heading: "Cinzel",
          body: "Montserrat",
        },
        image_treatment: {
          text_overlay_opacity: 0.34,
          image_only_opacity: 0.1,
        },
      },
      plan: "enterprise",
    });

    console.log(`Ministry created: ${ministry.name}`);

    const aiProfile = await AiProfile.create({
      ministry_id: "ktm",
      voice_profile: {
        persona_name: "Apostle Khy",
        sign_off: "Love and Blessings, Apostle Khy",
        tone_pillars: [
          "Apostolic weight",
          "Relational warmth",
          "Polished clarity",
        ],
        sample_phrases: [
          "Registration is officially OPEN for our upcoming interactive counseling intensive. If you are a leader, caregiver, or church worker called to help people heal, secure your spot today !!!",
          "Please secure your spot as soon as possible so we can ensure everyone has access to their course materials and tracking portals on time.",
          "Congratulations !! You are in the home stretch and almost done. We are so honored to walk with you through this licensing process. Love and Blessings, Apostle Khy.",
          "Worshipers, I believe this is your moment to be poured back into !!!",
          "I feel like this gathering was built specifically with you in mind.",
          "There is a specific grace required to carry this assignment.",
        ],
        avoid: [
          "em dashes",
          "secular marketplace jargon",
          "manufactured hype",
          "artificial urgency",
          "clinical corporate tone",
          "OMG",
          "run don't walk",
          "brand equity",
          "consumer trust",
          "backend metrics",
        ],
        registers: {
          public:
            "Apostolic weight and relational warmth. Elevated, declarative, spiritually authoritative. This is the voice the world sees.",
          administrative:
            "Short, direct, assumes reader has context. Warm closing but efficient body. Gets to the point immediately.",
          relational:
            "Conversational, uses I feel like and I believe. Self-aware, occasionally playful. Still carries spiritual weight but formality drops.",
        },
      },
      sops: [
        {
          title: "Conference SOP v1",
          content:
            "KTM conferences follow a structured apostolic format. Pre-event: registration closes 7 days before. Materials distributed 3 days before via email. Day-of: doors open 30 minutes early. Worship leads for 20 minutes. Apostle Khy opens in prayer before teaching. Post-event: follow-up email within 48 hours. Recording uploaded within 72 hours.",
          tags: ["conference", "event", "operations"],
        },
        {
          title: "KTM vs Salt & Light boundary",
          content:
            "Every initiative must have a single distinct digital footprint. If an event focuses on systematic tracking, enrollment, or curriculum it runs exclusively on the KTM tract. If it centers on relational community gathering it runs under Salt & Light. Never mix entities in a single content piece or announcement.",
          tags: ["operations", "brand", "entity"],
        },
      ],
      templates: [
        {
          title: "Event caption — enrollment",
          content:
            "Registration is officially OPEN for [EVENT NAME]. If you are a [AUDIENCE DESCRIPTION] called to [SPIRITUAL PURPOSE], secure your spot today !!! [CTA + LINK]",
          tags: ["social", "event", "instagram", "facebook"],
        },
        {
          title: "Milestone message",
          content:
            "Congratulations !! You are in the home stretch and almost done. We are so honored to walk with you through this [MILESTONE]. Love and Blessings, Apostle Khy.",
          tags: ["email", "milestone", "leadership"],
        },
        {
          title: "Workshop invitation — relational register",
          content:
            "I believe this gathering was built specifically with you in mind. On [DATE] we are hosting [EVENT] from [TIME]. [EVENT DESCRIPTION]. Cost is [PRICE]. [LUNCH/DETAILS]. Secure your spot today.",
          tags: ["social", "workshop", "instagram", "facebook"],
        },
      ],
      recurring_content: [
        {
          title: "Brand hashtags",
          content:
            "#KTM #KhyTraylorMinistries #EquippingLeaders #ChangingLives",
          tags: ["hashtags", "brand", "always"],
        },
        {
          title: "Content hashtags",
          content: "#Apostolic #Prophetic",
          tags: ["hashtags", "content", "prophetic", "contextual"],
        },
        {
          title: "Standard CTAs",
          content:
            "Enrollment: Secure your spot. Watch: Click the link in bio. Watch: Stream the series. Giving: directed to official giving channels only.",
          tags: ["cta", "social", "email"],
        },
      ],
      platforms: ["Instagram", "Facebook", "Email"],
      platform_notes: {
        Email:
          "Formal, structured, apostolic oversight tone. Used for announcements, ministry updates, systematic event tracking.",
        Instagram:
          "Conversational, immediate, visually driven. Community connection, rapid scannability, high engagement.",
        Facebook:
          "Slightly longer than Instagram. Same spiritual authority but more detail in the body.",
      },
      hashtags: {
        brand: [
          "#KTM",
          "#KhyTraylorMinistries",
          "#EquippingLeaders",
          "#ChangingLives",
        ],
        content: ["#Apostolic", "#Prophetic"],
      },
      ctas: {
        enrollment: "Secure your spot",
        enrollment_alt: "Register today",
        watch: "Click the link in bio",
        watch_alt: "Stream the series",
        watch_live: "Watch live",
        courses: "courses.khytraylorministries.com",
      },
      visual_prohibitions: [
        "Neon or hyper-saturated colors outside the official palette",
        "Cluttered or chaotic backgrounds",
        "Generic clip art or low-quality religious stock graphics",
        "Em dashes in copy or graphics",
        "Logo clear space violations — minimum clear space equals height of capital K in wordmark",
      ],
      type_system: {
        default_display: "Cinzel",
        default_body: "Montserrat",
        fonts: [
          {
            name: "Cinzel",
            roles: ["display"],
            tones: ["formal", "classic"],
            google_font: true,
            weights: ["400", "500", "600"],
          },
          {
            name: "Cormorant Garamond",
            roles: ["display"],
            tones: ["warm", "classic"],
            google_font: true,
            weights: ["400", "500", "600"],
          },
          {
            name: "Montserrat",
            roles: ["body", "display"],
            tones: ["formal", "warm", "energetic", "modern"],
            google_font: true,
            weights: ["300", "400", "500", "600"],
          },
          {
            name: "Poppins",
            roles: ["display", "body"],
            tones: ["energetic", "modern"],
            google_font: true,
            weights: ["400", "500", "600"],
          },
          {
            name: "Great Vibes",
            roles: ["script", "accent"],
            tones: ["warm", "classic"],
            google_font: true,
            weights: ["400"],
          },
        ],

        tone_keywords: {
          formal: [
            "ordination",
            "conference",
            "training",
            "intensive",
            "licensing",
            "apostolic",
            "leadership",
          ],
          warm: [
            "retreat",
            "worship",
            "fellowship",
            "koinonia",
            "community",
            "prayer",
          ],
          energetic: ["youth", "revival", "celebration", "night"],
          classic: ["anniversary", "dedication", "ceremony"],
        },
      },
    });

    console.log(`AI profile created for: ${aiProfile.ministry_id}`);
    console.log("KTM seed complete");
    process.exit(0);
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  }
};

seedKTM();
