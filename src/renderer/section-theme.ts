import { Renderer } from "@freelensapp/extensions";

// The Monaco editors always follow the host app theme. Only Monaco's built-in
// themes are guaranteed to exist in the extension's own Monaco instance. The
// host's custom `clouds-midnight` is registered against the HOST Monaco
// instance and is unavailable here, so a dark host theme falls back to the
// built-in `vs-dark`.
// ponytail: built-in themes only; register clouds-midnight locally only if the
// dark-shade mismatch turns out to matter.
export function resolveHostMonacoTheme(): string {
  // Defensive: in unit tests the SDK stub may not fully populate Theme.
  const hostTheme = Renderer?.Theme?.activeTheme?.get?.()?.monacoTheme;
  return hostTheme === "vs" ? "vs" : "vs-dark";
}
