// erp-rules R108's phone checks, shared so every module's E2E holds the same
// line. Plain Node like the rest of ./e2e — the spec owns its Playwright calls.
// Moved from erp-core e2e/support/phone.ts (Prompt 42); scm added 430x932.

export interface PhoneSize {
  width: number;
  height: number;
  deviceScaleFactor: number;
}

// iPhone 16 (the owner's phone), a short screen, a large phone (iPhone 16 Plus
// class, from scm's spec), and 320px — the width WCAG 1.4.10 (Reflow) names,
// so R108's "no sideways scroll" is tested at its edge.
export const PHONES: readonly PhoneSize[] = [
  { width: 393, height: 852, deviceScaleFactor: 3 },
  { width: 390, height: 664, deviceScaleFactor: 3 },
  { width: 430, height: 932, deviceScaleFactor: 3 },
  { width: 320, height: 568, deviceScaleFactor: 2 },
];

// The first width that gets the desktop shell (R108's 768px, Tailwind md).
export const TABLET_EDGE: PhoneSize = { width: 768, height: 1024, deviceScaleFactor: 2 };

// Chromium's phone emulation, as scm's probe found it (scm e2e/shell-phone.spec.ts,
// 2026-09-30): with isMobile it widens the layout viewport to fit a first
// render wider than the device, like Android Chrome — WebKit's iPhone
// profile does not, and it let scm's bug through. So open the context from
// Chromium. No user agent on purpose.
export const phoneContext = (size: PhoneSize) => ({
  viewport: { width: size.width, height: size.height },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: size.deviceScaleFactor,
  locale: "mn-MN",
  timezoneId: "Asia/Ulaanbaatar",
});

export interface PageWidths {
  inner: number;
  client: number;
  scroll: number;
}

// The few browser globals readWidths touches, typed here so this package
// needs no DOM lib.
interface PageGlobals {
  innerWidth: number;
  document: { documentElement: { clientWidth: number; scrollWidth: number } };
}

// For page.evaluate: it runs in the page from its source text, so it may use
// nothing but browser globals.
export const readWidths = (): PageWidths => {
  const page = globalThis as unknown as PageGlobals;
  return {
    inner: page.innerWidth,
    client: page.document.documentElement.clientWidth,
    scroll: page.document.documentElement.scrollWidth,
  };
};

// Every way the page failed to fit, in words a failure report can carry.
// Empty means it fits (WCAG 1.4.10: no sideways scroll at phone width).
export const widthProblems = (w: PageWidths, deviceWidth: number): string[] => {
  const problems: string[] = [];
  if (w.inner !== deviceWidth) {
    problems.push(
      `layout viewport is ${w.inner}px on a ${deviceWidth}px screen — the first render was wider than the device`,
    );
  }
  if (w.scroll > w.client) {
    problems.push(`the page scrolls sideways: content is ${w.scroll}px in a ${w.client}px window`);
  }
  return problems;
};
