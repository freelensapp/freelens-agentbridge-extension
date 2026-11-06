import { Renderer } from "@freelensapp/extensions";
import { useEffect, useRef, useState } from "react";
import styles from "./agentbridge-page.module.scss";
import { Glyph } from "./glyph";

const COPIED_MS = 1_600;

// The cluster frame may not hold the clipboard-write permission, so fall back to
// a selected textarea and `execCommand`, which Electron still honours.
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const area = document.createElement("textarea");

    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");

    area.remove();
    if (!copied) throw new Error("The clipboard is not available");
  }
}

// An icon button that copies `text` and confirms with a check for a moment.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function copy() {
    copyText(text)
      .then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      })
      .catch((error: unknown) => {
        Renderer.Component.Notifications.error(
          `Copy failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      data-done={copied}
    >
      <Glyph material={copied ? "check" : "content_copy"} small />
    </button>
  );
}
