const { limitsFor, planLimitError, startOfMonth, PLAN_LIMITS } = require("../../services/planLimits");

describe("limitsFor", () => {
  it("returns the caps for a known plan", () => {
    expect(limitsFor("small")).toEqual(PLAN_LIMITS.small);
    expect(limitsFor("mid")).toEqual(PLAN_LIMITS.mid);
  });

  it("enterprise is uncapped", () => {
    const limits = limitsFor("enterprise");
    expect(limits.team_members).toBe(Infinity);
    expect(limits.sub_ministries).toBe(Infinity);
    expect(limits.flyers_per_month).toBe(Infinity);
  });

  it("falls back to small for an unknown or missing plan", () => {
    expect(limitsFor(undefined)).toEqual(PLAN_LIMITS.small);
    expect(limitsFor("not-a-real-plan")).toEqual(PLAN_LIMITS.small);
  });
});

describe("planLimitError", () => {
  it("includes the actual limit and plan name in the message", () => {
    const msg = planLimitError("team_members", "small");
    expect(msg).toContain("5");
    expect(msg).toContain("small");
    expect(msg).toContain("team members");
  });
});

describe("startOfMonth", () => {
  it("returns midnight on the 1st of the current month", () => {
    const result = startOfMonth();
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
    expect(result.getMonth()).toBe(new Date().getMonth());
  });
});
