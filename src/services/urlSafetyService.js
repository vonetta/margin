const dns = require("dns").promises;
const net = require("net");
const ipaddr = require("ipaddr.js");

// The onboarding prefill fetches a user-supplied URL server-side, which
// is a classic SSRF vector (an admin submits http://169.254.169.254/... as
// their "ministry website" to read cloud metadata, or an internal
// hostname to reach services behind the firewall). There was no
// URL-fetching-arbitrary-input capability anywhere in this codebase
// before, so this service is the sole guarded gate for it.

class UrlSafetyError extends Error {}

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB of HTML is plenty to scrape.

// Allowlist, not blocklist: an address is only reachable if it resolves
// to a globally-routable unicast IP. Everything ipaddr.js classifies as
// anything else — loopback, private, linkLocal (incl. the cloud metadata
// endpoint), carrierGradeNat, uniqueLocal, unspecified, reserved — is
// denied, so an unfamiliar range fails closed rather than open.
const isPubliclyRoutable = (ipStr) => {
  let addr;
  try {
    addr = ipaddr.parse(ipStr);
  } catch {
    return false;
  }
  // An IPv4-mapped IPv6 address (::ffff:a.b.c.d) must be judged by its
  // embedded IPv4 — otherwise ::ffff:169.254.169.254 would sail through.
  if (addr.kind() === "ipv6" && addr.isIPv4MappedAddress()) {
    addr = addr.toIPv4Address();
  }
  return addr.range() === "unicast";
};

// Resolve every A/AAAA record and require ALL of them to be public — a
// hostname that resolves to a mix (one public, one 127.0.0.1) is
// rejected, since which one a later connection lands on isn't guaranteed.
const assertPublicHost = async (hostname) => {
  if (net.isIP(hostname)) {
    if (!isPubliclyRoutable(hostname)) {
      throw new UrlSafetyError("That address isn't allowed");
    }
    return;
  }
  let records;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new UrlSafetyError("Could not resolve that website's address");
  }
  if (records.length === 0) {
    throw new UrlSafetyError("Could not resolve that website's address");
  }
  for (const { address } of records) {
    if (!isPubliclyRoutable(address)) {
      throw new UrlSafetyError("That address isn't allowed");
    }
  }
};

const parseSafeUrl = (raw) => {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlSafetyError("That doesn't look like a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlSafetyError("Only http and https URLs are supported");
  }
  return url;
};

// Read a web ReadableStream body but stop the moment it exceeds maxBytes,
// so a hostile server can't stream gigabytes at us to exhaust memory —
// the Content-Length header is advisory and can't be trusted for this.
const readCapped = async (response, maxBytes) => {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
};

// Fetch an untrusted URL with full SSRF protection: https/http only, the
// resolved host validated as public, redirects followed manually and
// re-validated at every hop (a public URL that 302s to an internal one is
// the classic bypass), a hard timeout, and a response-size cap.
//
// Residual: a DNS-rebinding attacker could change the record in the
// window between assertPublicHost and the actual connection. Pinning the
// connection to the validated IP would close it fully; given this is an
// authenticated-admin trigger (not an anonymous endpoint) that window is
// an acceptable v1 posture, noted here so it's a known limit, not an
// oversight.
const safeFetch = async (
  rawUrl,
  { maxBytes = DEFAULT_MAX_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS, maxRedirects = MAX_REDIRECTS } = {},
) => {
  let current = parseSafeUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(current.hostname);

    let response;
    try {
      response = await fetch(current.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "MarginBot/1.0 (+onboarding profile builder)" },
      });
    } catch (err) {
      if (err.name === "TimeoutError") {
        throw new UrlSafetyError("That website took too long to respond");
      }
      throw new UrlSafetyError("Could not reach that website");
    }

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      current = parseSafeUrl(new URL(response.headers.get("location"), current.href).href);
      continue;
    }

    if (!response.ok) {
      throw new UrlSafetyError(`That website returned an error (${response.status})`);
    }

    const contentType = response.headers.get("content-type") || "";
    const body = await readCapped(response, maxBytes);
    return { finalUrl: current.href, status: response.status, contentType, body };
  }

  throw new UrlSafetyError("That website redirected too many times");
};

module.exports = { safeFetch, assertPublicHost, isPubliclyRoutable, parseSafeUrl, UrlSafetyError };
