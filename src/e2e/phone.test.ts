import { afterEach, describe, expect, it, vi } from "vitest";
import { PHONES, phoneContext, readWidths, TABLET_EDGE, widthProblems } from "./phone.js";

describe("phoneContext", () => {
  // scm's probe (2026-09-30): only Chromium with isMobile widens the layout
  // viewport the way a real phone does, so these options ARE the test.
  it("emulates a touch phone at the given size", () => {
    expect(phoneContext(PHONES[0]!)).toEqual({
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      locale: "mn-MN",
      timezoneId: "Asia/Ulaanbaatar",
    });
  });

  it("covers the owner iPhone, a short screen, a large phone, the WCAG 320px width and the 768px edge", () => {
    expect(PHONES.map((p) => `${p.width}x${p.height}`)).toEqual(["393x852", "390x664", "430x932", "320x568"]);
    expect(TABLET_EDGE.width).toBe(768);
  });
});

describe("readWidths", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // page.evaluate sends the function's source text to the browser, so it must
  // not reach anything outside its own body — rebuilding it from that text
  // proves it.
  it("reads the three widths from the page globals, from its source text alone", () => {
    vi.stubGlobal("innerWidth", 811);
    vi.stubGlobal("document", { documentElement: { clientWidth: 811, scrollWidth: 900 } });
    const inPage = new Function(`return (${readWidths.toString()})();`) as () => unknown;
    expect(inPage()).toEqual({ inner: 811, client: 811, scroll: 900 });
  });
});

describe("widthProblems", () => {
  it("passes a page that fits the device", () => {
    expect(widthProblems({ inner: 393, client: 393, scroll: 393 }, 393)).toEqual([]);
  });

  it("reports a layout viewport wider than the device", () => {
    expect(widthProblems({ inner: 811, client: 811, scroll: 811 }, 393)).toEqual([
      "layout viewport is 811px on a 393px screen — the first render was wider than the device",
    ]);
  });

  it("reports a page that scrolls sideways", () => {
    expect(widthProblems({ inner: 393, client: 393, scroll: 540 }, 393)).toEqual([
      "the page scrolls sideways: content is 540px in a 393px window",
    ]);
  });
});
