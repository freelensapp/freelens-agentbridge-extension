// Minimal stub for `@freelensapp/extensions` in tests.
//
// `section-theme.ts` reads `Renderer.Theme.activeTheme.get().monacoTheme` when
// resolving the "auto" preference. The stub exposes a mutable holder so tests
// can drive that value:
//
//   setActiveMonacoTheme("clouds-midnight"); // simulate host dark theme
//   setActiveMonacoTheme("vs");              // simulate host light theme
//
// Everything else the extension imports from the SDK is not exercised by unit
// tests, so Main/Common stay empty.

export const Main = {};
export const Common = {};

class LensExtension {}

function Icon() {
  return null;
}

let activeMonacoTheme = "vs-dark";

export function setActiveMonacoTheme(theme: string): void {
  activeMonacoTheme = theme;
}

export const Renderer = {
  LensExtension,
  Component: {
    Icon,
  },
  Theme: {
    activeTheme: {
      get() {
        return { monacoTheme: activeMonacoTheme };
      },
    },
  },
};
