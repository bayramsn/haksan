import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMailDocumentHtml, inlinePrintAssets } from "./core";

describe("teklif mail eki belgesi", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("görselleri data: URL olarak gömer, ulaşılamayanı olduğu gibi bırakır", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("ok.png")
      ? new Response(new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), { status: 200 })
      : new Response(null, { status: 404 })));
    vi.stubGlobal("FileReader", class {
      result: string | null = null; onload: null | (() => void) = null; onerror: null | (() => void) = null;
      readAsDataURL() { this.result = "data:image/png;base64,iVBORw=="; queueMicrotask(() => this.onload?.()); }
    });
    const html = '<img class="a" src="http://x/print/ok.png" alt=""><img src="http://x/print/missing.png"><img src="data:image/gif;base64,R0lG">';
    const out = await inlinePrintAssets(html);
    expect(out).toContain('src="data:image/png;base64,iVBORw=="');
    expect(out).toContain('src="http://x/print/missing.png"');
    expect(out).toContain('src="data:image/gif;base64,R0lG"');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2); // data: URL için istek atılmaz
  });

  it("otomatik yazdırma betiği olmadan tam HTML üretir", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    const html = await buildMailDocumentHtml({ title: "Teklif", css: ".x{}", body: "<p>Şık İçerik</p>" });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("<p>Şık İçerik</p>");
    expect(html).not.toContain("window.print");
  });
});
