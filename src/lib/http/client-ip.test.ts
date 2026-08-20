import { describe, expect, it } from "vitest";
import { clientIp, clientIpOrNull } from "./client-ip";

const xff = (value: string) => new Headers({ "x-forwarded-for": value });

describe("clientIp", () => {
  it("takes the entry the single trusted proxy appended, not the client's", () => {
    // What a spoofing client produces: it sends "1.2.3.4" itself, LiteSpeed
    // appends the address it actually saw. The forged entry is on the left.
    expect(clientIp(xff("1.2.3.4, 190.128.0.7"), 1)).toBe("190.128.0.7");
  });

  it("cannot be moved off a bucket by prepending entries", () => {
    const real = clientIp(xff("190.128.0.7"), 1);
    for (const forged of ["9.9.9.9", "a, b, c", "', 'x"]) {
      expect(clientIp(xff(`${forged}, 190.128.0.7`), 1)).toBe(real);
    }
  });

  it("skips the CDN's own address when a CDN is the extra hop", () => {
    // Cloudflare in front: client → CF (appends the client) → LiteSpeed
    // (appends CF's edge). Two trusted hops, so the client is second-to-last.
    expect(clientIp(xff("190.128.0.7, 172.68.1.1"), 2)).toBe("190.128.0.7");
  });

  it("clamps to the leftmost entry when the chain is shorter than configured", () => {
    expect(clientIp(xff("190.128.0.7"), 2)).toBe("190.128.0.7");
  });

  it("strips the port some proxies append, so one client is one bucket", () => {
    expect(clientIp(xff("190.128.0.7:51234"), 1)).toBe("190.128.0.7");
    expect(clientIp(xff("[2001:db8::1]:443"), 1)).toBe("2001:db8::1");
    expect(clientIp(xff("2001:db8::1"), 1)).toBe("2001:db8::1");
  });

  it("caps the value at what an ip_address column holds", () => {
    expect(clientIp(xff("x".repeat(200)), 1)).toHaveLength(45);
  });

  it("ignores blank entries in the trusted position", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": " ", "x-real-ip": "190.128.0.7" }), 1)).toBe(
      "190.128.0.7",
    );
  });

  it("falls back to x-real-ip, then to a shared bucket rather than to no limit", () => {
    expect(clientIp(new Headers({ "x-real-ip": "190.128.0.7" }), 1)).toBe("190.128.0.7");
    expect(clientIp(new Headers(), 1)).toBe("unknown");
  });
});

describe("clientIpOrNull", () => {
  it("records nothing rather than the word 'unknown'", () => {
    expect(clientIpOrNull(new Headers(), 1)).toBeUndefined();
    expect(clientIpOrNull(xff("190.128.0.7"), 1)).toBe("190.128.0.7");
  });
});
