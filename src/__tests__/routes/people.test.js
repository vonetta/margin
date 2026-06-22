jest.mock("../../services/storageService", () => ({
  uploadFile: jest.fn().mockResolvedValue({
    key: "ktm-test/headshots/test-abc123.jpg",
    url: "https://pub-test.r2.dev/ktm-test/headshots/test-abc123.jpg",
  }),
  deleteFile: jest.fn().mockResolvedValue({ deleted: true }),
}));

const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const Person = require("../../models/Person");
const User = require("../../models/User");

const testMinistry = {
  ministry_id: "ktm-test",
  name: "KTM Test",
  plan: "enterprise",
};

let adminToken;
let teamToken;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
});

afterAll(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Person.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["people-admin@ktm.com", "people-team@ktm.com"] },
  });
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Ministry.deleteMany({ ministry_id: "ktm-test" });
  await Person.deleteMany({ ministry_id: "ktm-test" });
  await User.deleteMany({
    email: { $in: ["people-admin@ktm.com", "people-team@ktm.com"] },
  });
  await Ministry.create(testMinistry);

  const adminRes = await request(app).post("/api/auth/register").send({
    email: "people-admin@ktm.com",
    password: "Password123",
    name: "Admin",
    ministry_id: "ktm-test",
    role: "admin",
  });
  adminToken = adminRes.body.token;

  const teamRes = await request(app).post("/api/auth/register").send({
    email: "people-team@ktm.com",
    password: "Password123",
    name: "Team",
    ministry_id: "ktm-test",
    role: "team",
  });
  teamToken = teamRes.body.token;
});

describe("POST /api/people", () => {
  it("creates a person as admin", async () => {
    const res = await request(app)
      .post("/api/people")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Apostle Khy Traylor", title: "Host", role: "host" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Apostle Khy Traylor");
    expect(res.body.role).toBe("host");
  });

  it("rejects creation by a team member", async () => {
    const res = await request(app)
      .post("/api/people")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${teamToken}`)
      .send({ name: "Should Fail" });

    expect(res.status).toBe(403);
  });

  it("rejects a person with no name", async () => {
    const res = await request(app)
      .post("/api/people")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "No name" });

    expect(res.status).toBe(400);
  });
});

describe("GET /api/people", () => {
  it("returns people for the ministry", async () => {
    await Person.create({
      ministry_id: "ktm-test",
      name: "Person One",
      role: "speaker",
    });
    await Person.create({
      ministry_id: "ktm-test",
      name: "Person Two",
      role: "member",
    });

    const res = await request(app)
      .get("/api/people")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it("filters by role", async () => {
    await Person.create({
      ministry_id: "ktm-test",
      name: "Speaker",
      role: "speaker",
    });
    await Person.create({
      ministry_id: "ktm-test",
      name: "Member",
      role: "member",
    });

    const res = await request(app)
      .get("/api/people?role=speaker")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.length).toBe(1);
    expect(res.body[0].role).toBe("speaker");
  });

  it("does not return another ministry's people", async () => {
    await Person.create({
      ministry_id: "other-ministry",
      name: "Outsider",
      role: "member",
    });

    const res = await request(app)
      .get("/api/people")
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.length).toBe(0);
  });
});

describe("POST /api/people/:id/headshot", () => {
  it("uploads a headshot and sets the url", async () => {
    const person = await Person.create({
      ministry_id: "ktm-test",
      name: "Khy",
      role: "host",
    });

    const res = await request(app)
      .post(`/api/people/${person._id}/headshot`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("headshot", Buffer.from("fake-image-bytes"), {
        filename: "khy.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(200);
    expect(res.body.headshot_url).toContain("r2.dev");
    expect(res.body.person.headshot_key).toBeDefined();
  });

  it("rejects upload with no file", async () => {
    const person = await Person.create({
      ministry_id: "ktm-test",
      name: "Khy",
      role: "host",
    });

    const res = await request(app)
      .post(`/api/people/${person._id}/headshot`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/people/:id", () => {
  it("deletes a person", async () => {
    const person = await Person.create({
      ministry_id: "ktm-test",
      name: "Delete Me",
      role: "member",
    });

    const res = await request(app)
      .delete(`/api/people/${person._id}`)
      .set("x-ministry-id", "ktm-test")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    const check = await Person.findById(person._id);
    expect(check).toBeNull();
  });
});
