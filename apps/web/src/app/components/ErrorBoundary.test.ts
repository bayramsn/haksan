import { describe, expect, it } from "vitest";
import { isChunkLoadError } from "./ErrorBoundary";

describe("isChunkLoadError", () => {
  it("tarayıcıların parça yükleme hatalarını tanır", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/Quotes-abc.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/Quotes-abc.css"))).toBe(true);
  });

  it("gerçek uygulama hatalarında yenilemez", () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'defaultTab')"))).toBe(false);
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false);
  });
});
