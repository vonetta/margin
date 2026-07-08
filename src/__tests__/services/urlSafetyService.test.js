const dns = require("dns").promises;

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

const {
  safeFetch,
  assertPublicHost,
  isPubliclyRoutable,
  parseSafeUrl,
  UrlSafetyError,
} = require("../../services/urlSafetyService");

describe("isPubliclyRoutable", () => {
  it("allows globally-routable unicast addresses", () => {
    for (const a of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(isPubliclyRoutable(a)).toBe(true);
    }
  });

  it("blocks loopback, private, link-local (incl. cloud metadata), CGNAT, ULA, and IPv4-mapped", () => {
    for (const a of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.5.5",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:169.254.169.254",
      "0.0.0.0",
      "not-an-ip",
    ]) {
      expect(isPubliclyRoutable(a)).toBe(false);
    }
  });
});

describe("parseSafeUrl", () => {
  it("accepts http and https", () => {
    expect(parseSafeUrl("https://example.com").protocol).toBe("https:");
    expect(parseSafeUrl("http://example.com").protocol).toBe("http:");
  });

  it("rejects other schemes and garbage", () => {
    for (const u of ["ftp://example.com", "file:///etc/passwd", "gopher://x", "nonsense"]) {
      expect(() => parseSafeUrl(u)).toThrow(UrlSafetyError);
    }
  });
});

describe("assertPublicHost", () => {
  beforeEach(() => dns.lookup.mockReset());

  it("passes a hostname that resolves only to public IPs", async () => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertPublicHost("example.com")).resolves.toBeUndefined();
  });

  it("rejects if ANY resolved record is private (DNS rebinding to a mix)", async () => {
    dns.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(assertPublicHost("sneaky.example.com")).rejects.toThrow(UrlSafetyError);
  });

  it("rejects a literal private IP hostname without a DNS lookup", async () => {
    await expect(assertPublicHost("169.254.169.254")).rejects.toThrow(UrlSafetyError);
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("rejects an unresolvable host", async () => {
    dns.lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertPublicHost("does-not-exist.invalid")).rejects.toThrow(UrlSafetyError);
  });
});

describe("safeFetch", () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    dns.lookup.mockReset();
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  const streamOf = (str) => {
    const bytes = Buffer.from(str);
    let sent = false;
    return {
      getReader: () => ({
        read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })),
        cancel: async () => {},
      }),
    };
  };

  const htmlResponse = (body, { status = 200, headers = {} } = {}) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (h) => headers[h.toLowerCase()] ?? null },
    body: streamOf(body),
  });

  it("fetches a public URL and returns its body", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      htmlResponse("<title>Grace Church</title>", { headers: { "content-type": "text/html" } }),
    );
    const res = await safeFetch("https://example.com");
    expect(res.body).toContain("Grace Church");
    expect(res.contentType).toBe("text/html");
  });

  it("follows a redirect but re-validates the new host", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(htmlResponse("", { status: 302, headers: { location: "https://real.example.com/home" } }))
      .mockResolvedValueOnce(htmlResponse("<h1>Home</h1>", { headers: { "content-type": "text/html" } }));
    const res = await safeFetch("https://example.com");
    expect(res.body).toContain("Home");
    expect(res.finalUrl).toBe("https://real.example.com/home");
    // assertPublicHost ran for both the original and the redirect target.
    expect(dns.lookup).toHaveBeenCalledTimes(2);
  });

  it("blocks a redirect that points at a private address", async () => {
    dns.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]) // original: public
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]); // redirect target: private
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(htmlResponse("", { status: 302, headers: { location: "http://localhost/admin" } }));
    await expect(safeFetch("https://example.com")).rejects.toThrow(UrlSafetyError);
  });

  it("caps an oversized body instead of buffering it all", async () => {
    const oneKb = "x".repeat(1024);
    global.fetch = jest.fn().mockResolvedValue(
      htmlResponse(oneKb, { headers: { "content-type": "text/html" } }),
    );
    const res = await safeFetch("https://example.com", { maxBytes: 100 });
    // The read stops past the cap; we don't get the full kilobyte back.
    expect(res.body.length).toBeLessThan(1024);
  });

  it("surfaces a timeout as a friendly error", async () => {
    global.fetch = jest.fn().mockRejectedValue(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    await expect(safeFetch("https://example.com")).rejects.toThrow(/too long/);
  });
});
