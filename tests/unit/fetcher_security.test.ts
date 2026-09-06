import { describe, expect, it } from "vitest";
import { RobustFetcher } from "@vietnam-tax/ingestion";

describe("RobustFetcher SSRF Defense & Domain Allowlist", () => {
  const fetcher = new RobustFetcher({ allowLocalhost: false });

  it("permits official legal domains and subdomains", () => {
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
  });

  it("rejects unauthorized external domains", () => {
    expect(() => fetcher.validateUrl("https://google.com/malicious")).toThrow(
      /SSRF defense/
    );

    expect(() => fetcher.validateUrl("https://evil-hacker.com/fake-law")).toThrow(
      /SSRF defense/
    );
  });

  it("blocks cloud metadata service and internal private IPs", () => {
    expect(() =>
      fetcher.validateUrl("http://169.254.169.254/latest/meta-data")
    ).toThrow(/SSRF defense/);

    expect(() => fetcher.validateUrl("http://10.0.0.1/admin")).toThrow(
      /SSRF defense/
    );

    expect(() => fetcher.validateUrl("http://192.168.1.1/router")).toThrow(
      /SSRF defense/
    );
  });

  it("blocks non-HTTP protocols (file:, ftp:, javascript:)", () => {
    expect(() => fetcher.validateUrl("file:///etc/passwd")).toThrow(
      /SSRF defense: Protocol/
    );

    expect(() => fetcher.validateUrl("ftp://ftp.example.com")).toThrow(
      /SSRF defense: Protocol/
    );
  });
});
