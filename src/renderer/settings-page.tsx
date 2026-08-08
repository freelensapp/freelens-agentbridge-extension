import { Renderer } from "@freelensapp/extensions";
import { ipcRenderer } from "electron";
import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_EDITOR_COMMAND,
  DEFAULT_PROBE_TIMEOUT_MS,
  type ExtensionSettings,
  MAX_PROBE_TIMEOUT_MS,
  MIN_PROBE_TIMEOUT_MS,
  normalizeEditorCommand,
  normalizeProbeTimeoutMs,
} from "../common/extension-settings";

const CHANNEL_PREFIX = "agentbridge-extension:";
const SAVE_DEBOUNCE_MS = 500;

export function ProbeTimeoutSetting() {
  const [value, setValue] = useState<string>();
  const [error, setError] = useState<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let cancelled = false;

    void ipcRenderer
      .invoke(`${CHANNEL_PREFIX}get-settings`)
      .then((settings: ExtensionSettings) => {
        if (!cancelled) setValue(String(settings.probeTimeoutMs));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setValue(String(DEFAULT_PROBE_TIMEOUT_MS));
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function save(next: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void ipcRenderer
        .invoke(`${CHANNEL_PREFIX}set-settings`, { probeTimeoutMs: normalizeProbeTimeoutMs(next) })
        .then(() => setError(undefined))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    }, SAVE_DEBOUNCE_MS);
  }

  function onChange(next: string) {
    setValue(next);
    save(next);
  }

  function onBlur() {
    if (value !== undefined) setValue(String(normalizeProbeTimeoutMs(value)));
  }

  if (value === undefined) {
    return <p>Loading settings...</p>;
  }

  return (
    <section>
      <Renderer.Component.SubTitle title="Version probe timeout (ms)" />
      <Renderer.Component.Input
        theme="round-black"
        type="number"
        min={MIN_PROBE_TIMEOUT_MS}
        max={MAX_PROBE_TIMEOUT_MS}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
      />
      {error && <p style={{ color: "var(--colorError)", marginTop: "0.5rem" }}>Failed to save settings: {error}</p>}
    </section>
  );
}

export function EditorCommandSetting() {
  const [value, setValue] = useState<string>();
  const [error, setError] = useState<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let cancelled = false;

    void ipcRenderer
      .invoke(`${CHANNEL_PREFIX}get-settings`)
      .then((settings: ExtensionSettings) => {
        if (!cancelled) setValue(settings.editorCommand);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setValue(DEFAULT_EDITOR_COMMAND);
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function save(next: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void ipcRenderer
        .invoke(`${CHANNEL_PREFIX}set-settings`, { editorCommand: normalizeEditorCommand(next) })
        .then(() => setError(undefined))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    }, SAVE_DEBOUNCE_MS);
  }

  function onChange(next: string) {
    setValue(next);
    save(next);
  }

  function onBlur() {
    if (value !== undefined) setValue(normalizeEditorCommand(value));
  }

  if (value === undefined) {
    return <p>Loading settings...</p>;
  }

  return (
    <section>
      <Renderer.Component.SubTitle title="Editor command" />
      <Renderer.Component.Input theme="round-black" value={value} onChange={onChange} onBlur={onBlur} />
      {error && <p style={{ color: "var(--colorError)", marginTop: "0.5rem" }}>Failed to save settings: {error}</p>}
    </section>
  );
}

export function EditorCommandHint() {
  return (
    <span>
      Command used by the &quot;Open in editor&quot; button to open the provider workspace as a project. Must be a bare
      executable name on your PATH (e.g. <code>code</code>, <code>codium</code>, <code>cursor</code>). On macOS run
      &quot;Shell Command: Install &apos;code&apos; command in PATH&quot; from VS Code first. If the command cannot be
      launched, the extension falls back to the editor&apos;s <code>://</code> URL handler. Default:{" "}
      <code>{DEFAULT_EDITOR_COMMAND}</code>.
    </span>
  );
}

export function ProbeTimeoutHint() {
  return (
    <span>
      How long to wait for an AI CLI (OpenCode, Claude Code, GitHub Copilot CLI) to answer a <code>--version</code>{" "}
      probe before giving up. Increase this value if you see &quot;version probe timed out&quot; errors. Default:{" "}
      {DEFAULT_PROBE_TIMEOUT_MS} ms.
    </span>
  );
}
