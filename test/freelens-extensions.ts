// Minimal stub of `@freelensapp/extensions` for unit tests.
//
// The published package is a shim that reads `Common`, `Main` and `Renderer`
// off `globalThis.FreelensExtensionApi`, which the Freelens host sets before it
// loads an extension. A Vitest process has no host, so importing the real
// package throws. `vitest.config.ts` aliases the import to this file instead.
// The package ships no mocks of its own to use in its place.
//
// Only the surface the tests exercise is stubbed here, and only at runtime: the
// tests are type-checked against the real declaration of the package. Extend it
// as the tests need more of the host API; a test that needs a member to behave
// differently mocks the module itself with `vi.mock`.
import { vi } from "vitest";

class LensExtension {
  onActivate() {}
  onDeactivate() {}
}

// The host's `Ipc` classes are singletons per subclass, created with the
// extension instance.
class Ipc {
  static createInstance() {
    return new this();
  }

  static resetInstance() {}
}

function Icon() {
  return null;
}

export const Main = {
  LensExtension,
  Ipc,
};

export const Renderer = {
  LensExtension,
  Ipc,
  Component: {
    Icon,
  },
};

export const Common = {
  App: {
    isWindows: false,
    isMac: false,
    isLinux: true,
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};
