const mockRenderHtmlToPdf = jest.fn().mockResolvedValue(Buffer.from("fake-pdf"));
jest.mock("../../services/flyerRenderer", () => ({
  renderHtmlToPdf: (...args) => mockRenderHtmlToPdf(...args),
}));

const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const { registerMember } = require("../../testHelpers/register");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const NewsletterIssue = require("../../models/NewsletterIssue");
const Event = require("../../models/Event");
const Person = require("../../models/Person");
const User = require("../../models/User");

const testMinistry = { ministry_id: "nl-route-test", name: "Newsletter Test", plan: "enterprise" };

let adminToken;
let teamToken;

beforeAll(async () => {
  await connectTestDB();
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "nl-route-test" });
  await NewsletterIssue.deleteMany({ ministry_id: "nl-route-test" });
  await Event.deleteMany({ ministry_id: "nl-route-test" });
  await Person.deleteMany({ ministry_id: "nl-route-test" });
  await User.deleteMany({ email: { $in: ["nl-admin@ktm.com", "nl-team@ktm.com"] } });
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "nl-route-test" });
  await NewsletterIssue.deleteMany({ ministry_id: "nl-route-test" });
  await Event.deleteMany({ ministry_id: "nl-route-test" });
  await Person.deleteMany({ ministry_id: "nl-route-test" });
  await User.deleteMany({ email: { $in: ["nl-admin@ktm.com", "nl-team@ktm.com"] } });
  await Ministry.create(testMinistry);

  const adminRes = await request(app).post("/api/auth/register").send({
    email: "nl-admin@ktm.com",
    password: "Password123",
    name: "Admin",
    ministry_id: "nl-route-test",
  });
  adminToken = adminRes.body.token;

  const teamRes = await registerMember(app, {
    email: "nl-team@ktm.com",
    password: "Password123",
    name: "Team",
    ministry_id: "nl-route-test",
    role: "team",
  });
  teamToken = teamRes.body.token;
});

describe("POST /api/newsletter/issues", () => {
  it("creates an issue seeded with the default sections", async () => {
    const res = await request(app)
      .post("/api/newsletter/issues")
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ month: 7, year: 2026, theme: "Kingdom Strength" });

    expect(res.status).toBe(201);
    expect(res.body.theme).toBe("Kingdom Strength");
    expect(res.body.status).toBe("draft");
    expect(res.body.sections.length).toBeGreaterThan(0);
    expect(res.body.sections.map((s) => s.key)).toContain("leader_message");
  });

  it("rejects creation by a team member", async () => {
    const res = await request(app)
      .post("/api/newsletter/issues")
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ month: 7, year: 2026 });

    expect(res.status).toBe(403);
  });

  it("rejects an invalid month", async () => {
    const res = await request(app)
      .post("/api/newsletter/issues")
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ month: 13, year: 2026 });

    expect(res.status).toBe(400);
  });

  it("seeds the calendar and birthdays sections from real data", async () => {
    await Event.create({
      ministry_id: "nl-route-test",
      title: "Sunday Service",
      start: new Date("2026-07-12T18:00:00Z"),
      visibility: "public",
      status: "approved",
    });
    await Person.create({
      ministry_id: "nl-route-test",
      name: "Has Consent",
      birthdate: new Date("1990-07-14"),
      newsletter_birthday_consent: true,
    });

    const res = await request(app)
      .post("/api/newsletter/issues")
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ month: 7, year: 2026 });

    const calendar = res.body.sections.find((s) => s.key === "calendar");
    const birthdays = res.body.sections.find((s) => s.key === "birthdays");
    expect(calendar.content.entries).toHaveLength(1);
    expect(birthdays.content.entries).toHaveLength(1);
  });
});

describe("GET /api/newsletter/issues", () => {
  it("lists issues for the ministry, most recent first", async () => {
    await NewsletterIssue.create({ ministry_id: "nl-route-test", month: 1, year: 2026, sections: [] });
    await NewsletterIssue.create({ ministry_id: "nl-route-test", month: 7, year: 2026, sections: [] });

    const res = await request(app)
      .get("/api/newsletter/issues")
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].month).toBe(7);
  });

  it("rejects a team member — newsletter assembly is admin/leader-only, same as SOPs", async () => {
    const res = await request(app)
      .get("/api/newsletter/issues")
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${teamToken}`);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/newsletter/issues/:id", () => {
  it("returns 404 for a nonexistent issue", async () => {
    const res = await request(app)
      .get("/api/newsletter/issues/000000000000000000000000")
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/newsletter/issues/:id", () => {
  it("updates theme, status, and sections", async () => {
    const issue = await NewsletterIssue.create({
      ministry_id: "nl-route-test",
      month: 7,
      year: 2026,
      sections: [{ key: "leader_message", type: "text_block", title: "From the Leader", order: 0, content: {} }],
    });

    const res = await request(app)
      .put(`/api/newsletter/issues/${issue._id}`)
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        theme: "New Theme",
        status: "finalized",
        sections: [
          {
            key: "leader_message",
            type: "text_block",
            title: "From the Leader",
            order: 0,
            enabled: true,
            content: { body: "Hello church", photo_url: "" },
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.theme).toBe("New Theme");
    expect(res.body.status).toBe("finalized");
    expect(res.body.sections[0].content.body).toBe("Hello church");
  });

  it("rejects updates by a team member", async () => {
    const issue = await NewsletterIssue.create({ ministry_id: "nl-route-test", month: 7, year: 2026, sections: [] });

    const res = await request(app)
      .put(`/api/newsletter/issues/${issue._id}`)
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ theme: "Nope" });

    expect(res.status).toBe(403);
  });
});

describe("GET /api/newsletter/issues/:id/export", () => {
  it("streams a PDF for the issue", async () => {
    const issue = await NewsletterIssue.create({
      ministry_id: "nl-route-test",
      month: 7,
      year: 2026,
      sections: [
        { key: "leader_message", type: "text_block", title: "From the Leader", order: 0, enabled: true, content: { body: "Hi" } },
      ],
    });

    const res = await request(app)
      .get(`/api/newsletter/issues/${issue._id}/export`)
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toContain("newsletter-2026-07.pdf");
    expect(mockRenderHtmlToPdf).toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent issue", async () => {
    const res = await request(app)
      .get("/api/newsletter/issues/000000000000000000000000/export")
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects a team member, same as every other newsletter route", async () => {
    const issue = await NewsletterIssue.create({ ministry_id: "nl-route-test", month: 7, year: 2026, sections: [] });

    const res = await request(app)
      .get(`/api/newsletter/issues/${issue._id}/export`)
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${teamToken}`);

    expect(res.status).toBe(403);
  });
});

describe("GET /api/newsletter/issues/:id/export-html", () => {
  it("streams HTML for the issue, for pasting into Mailchimp", async () => {
    const issue = await NewsletterIssue.create({
      ministry_id: "nl-route-test",
      month: 7,
      year: 2026,
      sections: [
        { key: "leader_message", type: "text_block", title: "From the Leader", order: 0, enabled: true, content: { body: "Hi" } },
      ],
    });

    const res = await request(app)
      .get(`/api/newsletter/issues/${issue._id}/export-html`)
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["content-disposition"]).toContain("newsletter-2026-07.html");
    expect(res.text).toContain("From the Leader");
  });

  it("returns 404 for a nonexistent issue", async () => {
    const res = await request(app)
      .get("/api/newsletter/issues/000000000000000000000000/export-html")
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects a team member", async () => {
    const issue = await NewsletterIssue.create({ ministry_id: "nl-route-test", month: 7, year: 2026, sections: [] });

    const res = await request(app)
      .get(`/api/newsletter/issues/${issue._id}/export-html`)
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${teamToken}`);

    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/newsletter/issues/:id", () => {
  it("deletes an issue", async () => {
    const issue = await NewsletterIssue.create({ ministry_id: "nl-route-test", month: 7, year: 2026, sections: [] });

    const res = await request(app)
      .delete(`/api/newsletter/issues/${issue._id}`)
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(await NewsletterIssue.findById(issue._id)).toBeNull();
  });

  it("rejects deletion by a team member", async () => {
    const issue = await NewsletterIssue.create({ ministry_id: "nl-route-test", month: 7, year: 2026, sections: [] });

    const res = await request(app)
      .delete(`/api/newsletter/issues/${issue._id}`)
      .set("x-ministry-id", "nl-route-test")
      .set("Authorization", `Bearer ${teamToken}`);

    expect(res.status).toBe(403);
  });
});
