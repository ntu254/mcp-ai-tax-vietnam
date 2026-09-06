import { describe, expect, it } from "vitest";
import { RobustFetcher } from "@vietnam-tax/ingestion";

describe("RobustFetcher Hardened Security & SSRF Defense (Point 2)", () => {
  const fetcher = new RobustFetcher({ allowLocalhost: false });

  it("permits legitimate official legal domains and subdomains", () => {
    expect(() =>
      fetcher.validateUrl("https://congbao.chinhphu.vn/rss")
    ).not.toThrow();

    expect(() =>
      fetcher.validateUrl("https://vanban.chinhphu.vn/default.aspx")
    ).not.toThrow();

    expect(() =>
      fetcher.validateUrl("https://gdt.gov.vn/wps/portal")
    ).not.toThrow();

    expect(() =>
      fetcher.validateUrl("https://mof.gov.vn/webcenter/portal/btc")
    ).not.toThrow();

    expect(() =>
      fetcher.validateUrl("https://vbpl.vn/van-ban/trung-uong")
    ).not.toThrow();

    expect(() =>
      fetcher.validateUrl("https://ws.vbpl.vn/vbqppl.asmx")
    ).not.toThrow();
  });

  it("normalizes hostname with trailing dots and casing", () => {
    expect(() =>
      fetcher.validateUrl("https://CONGBAO.CHINHPHU.VN./rss")
    ).not.toThrow();
  });

  it("rejects userinfo embedded credentials in URLs", () => {
    expect(() =>
      fetcher.validateUrl("https://admin:secret@congbao.chinhphu.vn/rss")
    ).toThrow(/SSRF defense: URLs with embedded userinfo/);
  });

  it("rejects non-standard ports in production", () => {
    expect(() =>
      fetcher.validateUrl("https://congbao.chinhphu.vn:8080/rss")
    ).toThrow(/SSRF defense: Non-standard port/);

    expect(() =>
      fetcher.validateUrl("https://congbao.chinhphu.vn:22/rss")
    ).toThrow(/SSRF defense: Non-standard port/);
  });

  it("blocks IPv6 loopback, link-local, and unique-local private addresses", () => {
    expect(() => fetcher.validateUrl("http://[::1]/")).toThrow(/SSRF defense/);
    expect(() => fetcher.validateUrl("http://[fe80::1]/")).toThrow(
      /SSRF defense/
    );
    expect(() => fetcher.validateUrl("http://[fc00::1]/")).toThrow(
      /SSRF defense/
    );
    expect(() => fetcher.validateUrl("http://[fd00::1]/")).toThrow(
      /SSRF defense/
    );
  });

  it("blocks cloud metadata address (169.254.169.254) and private IPv4 networks", () => {
    expect(() =>
      fetcher.validateUrl("http://169.254.169.254/latest/meta-data")
    ).toThrow(/SSRF defense/);

    expect(() => fetcher.validateUrl("http://10.0.0.1/admin")).toThrow(
      /SSRF defense/
    );

    expect(() => fetcher.validateUrl("http://192.168.1.1/router")).toThrow(
      /SSRF defense/
    );

    expect(() => fetcher.validateUrl("http://172.20.0.1/secret")).toThrow(
      /SSRF defense/
    );
  });

  it("blocks non-HTTP protocols (file:, ftp:, gopher:)", () => {
    expect(() => fetcher.validateUrl("file:///etc/passwd")).toThrow(
      /SSRF defense: Protocol/
    );

    expect(() => fetcher.validateUrl("ftp://ftp.example.com")).toThrow(
      /SSRF defense: Protocol/
    );

    expect(() => fetcher.validateUrl("gopher://gopher.example.com")).toThrow(
      /SSRF defense: Protocol/
    );
  });

  it("aborts when redirect hops to a disallowed destination or private IP", () => {
    // Verifying redirect hop validation:
    // If a legitimate domain redirects to 169.254.169.254, validateUrl will reject the hop
    const redirectHop = "http://169.254.169.254/secret";
    expect(() => fetcher.validateUrl(redirectHop)).toThrow(
      /SSRF defense: Direct access to internal, loopback, or metadata address/
    );

    const redirectHopExternal = "https://malicious-external-site.com/evil";
    expect(() => fetcher.validateUrl(redirectHopExternal)).toThrow(
      /SSRF defense: Target domain/
    );
  });
});
