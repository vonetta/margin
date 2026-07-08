const mockExtractTasksFromTranscript = jest.fn();
jest.mock("../../services/meetingTaskService", () => {
  const actual = jest.requireActual("../../services/meetingTaskService");
  return {
    ...actual,
    extractTasksFromTranscript: (...args) => mockExtractTasksFromTranscript(...args),
  };
});

const request = require("supertest");
const { connectTestDB } = require("../../testHelpers/db");
const { registerMember } = require("../../testHelpers/register");
const app = require("../../app");
const Ministry = require("../../models/Ministry");
const User = require("../../models/User");
const Task = require("../../models/Task");
const MeetingTaskDraft = require("../../models/MeetingTaskDraft");

const KTM = "meetings-ktm-test";
const SALT_LIGHT = "meetings-salt-light-test";
const OUTSIDER = "meetings-outsider-test";

let ktmAdminToken, ktmAdminId, saltLightAdminId, ktmLeaderToken, ktmLeaderId;

beforeAll(async () => {
  await connectTestDB();
});

const cleanup = async () => {
  await Ministry.deleteMany({ ministry_id: { $in: [KTM, SALT_LIGHT, OUTSIDER] } });
  await Task.deleteMany({ ministry_id: { $in: [KTM, SALT_LIGHT, OUTSIDER] } });
  await MeetingTaskDraft.deleteMany({ ministry_id: { $in: [KTM, SALT_LIGHT, OUTSIDER] } });
  await User.deleteMany({
    email: {
      $in: [
        "meetings-ktm-admin@test.com",
        "meetings-ktm-leader@test.com",
        "meetings-sl-admin@test.com",
        "meetings-outsider-admin@test.com",
      ],
    },
  });
};

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await cleanup();
  mockExtractTasksFromTranscript.mockReset();

  await Ministry.create({ ministry_id: KTM, name: "KTM Test", plan: "enterprise" });
  await Ministry.create({
    ministry_id: SALT_LIGHT,
    name: "Salt & Light Test",
    parent_ministry_id: KTM,
    plan: "small",
  });
  await Ministry.create({ ministry_id: OUTSIDER, name: "Outsider Test", plan: "small" });

  const a = await request(app).post("/api/auth/register").send({
    email: "meetings-ktm-admin@test.com",
    password: "Password123",
    name: "KTM Admin",
    ministry_id: KTM,
    role: "admin",
  });
  ktmAdminToken = a.body.token;
  ktmAdminId = a.body.user.id;

  const l = await registerMember(app, {
    email: "meetings-ktm-leader@test.com",
    password: "Password123",
    name: "KTM Leader",
    ministry_id: KTM,
    role: "leader",
  });
  ktmLeaderToken = l.body.token;
  ktmLeaderId = l.body.user.id;

  const sl = await request(app).post("/api/auth/register").send({
    email: "meetings-sl-admin@test.com",
    password: "Password123",
    name: "Salt Light Admin",
    ministry_id: SALT_LIGHT,
    role: "admin",
  });
  saltLightAdminId = sl.body.user.id;
});

describe("POST /api/meetings/transcript", () => {
  it("resolves a task's ministry_name to the matching family ministry's id", async () => {
    mockExtractTasksFromTranscript.mockResolvedValue([
      { description: "Rent the van", ministry_name: "Salt & Light Test", ministry_uncertain: true },
      { description: "Confirm KTM Sunday service" },
    ]);

    const res = await request(app)
      .post("/api/meetings/transcript")
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmAdminToken}`)
      .send({ text: "some transcript" });

    expect(res.status).toBe(201);
    expect(res.body.tasks[0].target_ministry_id).toBe(SALT_LIGHT);
    expect(res.body.tasks[0].ministry_uncertain).toBe(true);
    expect(res.body.tasks[1].target_ministry_id).toBe(KTM);
    expect(res.body.tasks[1].ministry_uncertain).toBe(false);
  });

  it("falls back to the home ministry for a hallucinated/out-of-family ministry name", async () => {
    mockExtractTasksFromTranscript.mockResolvedValue([
      { description: "Something", ministry_name: "Not A Real Ministry" },
    ]);

    const res = await request(app)
      .post("/api/meetings/transcript")
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmAdminToken}`)
      .send({ text: "some transcript" });

    expect(res.body.tasks[0].target_ministry_id).toBe(KTM);
  });

  it("matches an assignee against the target ministry's own roster, not a merged one", async () => {
    mockExtractTasksFromTranscript.mockResolvedValue([
      { description: "Salt & Light task", assignee_name: "Salt Light Admin", ministry_name: "Salt & Light Test" },
    ]);

    const res = await request(app)
      .post("/api/meetings/transcript")
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmAdminToken}`)
      .send({ text: "some transcript" });

    expect(res.body.tasks[0].matched_user_id).toBe(saltLightAdminId);
  });
});

describe("PUT /api/meetings/transcripts/:id/tasks/:taskId/approve — cross-ministry authority", () => {
  const createDraftWithTask = async (overrides = {}) => {
    return MeetingTaskDraft.create({
      ministry_id: KTM,
      transcript: "transcript",
      tasks: [
        {
          description: "Rent the van",
          matched_user_id: saltLightAdminId,
          target_ministry_id: SALT_LIGHT,
          status: "pending_review",
          ...overrides,
        },
      ],
      created_by: ktmAdminId,
    });
  };

  it("blocks a KTM admin who has no membership at all in the target ministry", async () => {
    const draft = await createDraftWithTask();
    const taskId = draft.tasks[0]._id.toString();

    const res = await request(app)
      .put(`/api/meetings/transcripts/${draft._id}/tasks/${taskId}/approve`)
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin or leader/);
    const task = await Task.findOne({ ministry_id: SALT_LIGHT });
    expect(task).toBeNull();
  });

  it("blocks a KTM leader the same way", async () => {
    const draft = await createDraftWithTask();
    const taskId = draft.tasks[0]._id.toString();

    const res = await request(app)
      .put(`/api/meetings/transcripts/${draft._id}/tasks/${taskId}/approve`)
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmLeaderToken}`);

    expect(res.status).toBe(403);
  });

  it("rejects a target ministry outside the org family even for an admin of both the home and outsider ministries", async () => {
    await User.findByIdAndUpdate(ktmAdminId, {
      $push: { ministries: { ministry_id: OUTSIDER, role: "admin" } },
    });
    const draft = await createDraftWithTask({
      target_ministry_id: OUTSIDER,
      matched_user_id: ktmAdminId,
    });
    const taskId = draft.tasks[0]._id.toString();

    const res = await request(app)
      .put(`/api/meetings/transcripts/${draft._id}/tasks/${taskId}/approve`)
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmAdminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/org family/);
  });

  it("allows approval when the caller is also admin/leader of the target ministry", async () => {
    await User.findByIdAndUpdate(ktmAdminId, {
      $push: { ministries: { ministry_id: SALT_LIGHT, role: "leader" } },
    });
    const draft = await createDraftWithTask();
    const taskId = draft.tasks[0]._id.toString();

    const res = await request(app)
      .put(`/api/meetings/transcripts/${draft._id}/tasks/${taskId}/approve`)
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmAdminToken}`);

    expect(res.status).toBe(200);
    const task = await Task.findOne({ ministry_id: SALT_LIGHT });
    expect(task).not.toBeNull();
    expect(task.title).toBe("Rent the van");
    expect(task.assigned_to).toBe(saltLightAdminId);
  });

  it("still works normally (no cross-ministry check) when the task targets the caller's own ministry", async () => {
    const draft = await createDraftWithTask({
      target_ministry_id: KTM,
      matched_user_id: ktmAdminId,
    });
    const taskId = draft.tasks[0]._id.toString();

    const res = await request(app)
      .put(`/api/meetings/transcripts/${draft._id}/tasks/${taskId}/approve`)
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmAdminToken}`);

    expect(res.status).toBe(200);
    const task = await Task.findOne({ ministry_id: KTM });
    expect(task).not.toBeNull();
  });
});

describe("PUT /api/meetings/transcripts/:id/tasks/:taskId — editing target_ministry_id", () => {
  it("rejects a target_ministry_id outside the org family", async () => {
    const draft = await MeetingTaskDraft.create({
      ministry_id: KTM,
      transcript: "transcript",
      tasks: [{ description: "Something", target_ministry_id: KTM, status: "pending_review" }],
      created_by: ktmAdminId,
    });
    const taskId = draft.tasks[0]._id.toString();

    const res = await request(app)
      .put(`/api/meetings/transcripts/${draft._id}/tasks/${taskId}`)
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmAdminToken}`)
      .send({ target_ministry_id: OUTSIDER });

    expect(res.status).toBe(400);
  });

  it("clears a stale matched_user_id when the target ministry changes", async () => {
    const draft = await MeetingTaskDraft.create({
      ministry_id: KTM,
      transcript: "transcript",
      tasks: [
        {
          description: "Something",
          target_ministry_id: KTM,
          matched_user_id: ktmAdminId,
          status: "pending_review",
        },
      ],
      created_by: ktmAdminId,
    });
    const taskId = draft.tasks[0]._id.toString();

    const res = await request(app)
      .put(`/api/meetings/transcripts/${draft._id}/tasks/${taskId}`)
      .set("x-ministry-id", KTM)
      .set("Authorization", `Bearer ${ktmAdminToken}`)
      .send({ target_ministry_id: SALT_LIGHT });

    expect(res.status).toBe(200);
    const updated = res.body.tasks.find((t) => t._id === taskId);
    expect(updated.matched_user_id).toBeFalsy();
    expect(updated.target_ministry_id).toBe(SALT_LIGHT);
  });
});
