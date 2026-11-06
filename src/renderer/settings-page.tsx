import { Renderer } from "@freelensapp/extensions";
import { useEffect, useRef, useState } from "react";
import { agentBridgeProviders } from "../common/agentbridge-providers";
import {
  DEFAULT_EDITOR_COMMAND,
  DEFAULT_PROBE_TIMEOUT_MS,
  MAX_PROBE_TIMEOUT_MS,
  MIN_PROBE_TIMEOUT_MS,
  normalizeEditorCommand,
  normalizeProbeTimeoutMs,
} from "../common/extension-settings";
import { ipcChannels } from "../common/ipc-channels";
import { invoke } from "./ipc";
import styles from "./settings-page.module.scss";

const SAVE_DEBOUNCE_MS = 500;

function ProbeTimeoutSetting() {
  const [value, setValue] = useState<string>();
  const [error, setError] = useState<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;

    void invoke(ipcChannels.getSettings)
      .then((settings) => {
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
      void invoke(ipcChannels.setSettings, {
        probeTimeoutMs: normalizeProbeTimeoutMs(next),
      })
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
    return <p>Loading settings…</p>;
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
      <SaveError error={error} />
      <div className="hint">
        <ProbeTimeoutHint />
      </div>
    </section>
  );
}

function EditorCommandSetting() {
  const [value, setValue] = useState<string>();
  const [error, setError] = useState<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    let cancelled = false;

    void invoke(ipcChannels.getSettings)
      .then((settings) => {
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
      void invoke(ipcChannels.setSettings, {
        editorCommand: normalizeEditorCommand(next),
      })
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
    return <p>Loading settings…</p>;
  }

  return (
    <section>
      <Renderer.Component.SubTitle title="Editor command" />
      <Renderer.Component.Input theme="round-black" value={value} onChange={onChange} onBlur={onBlur} />
      <SaveError error={error} />
      <div className="hint">
        <EditorCommandHint />
      </div>
    </section>
  );
}

function SaveError({ error }: { error?: string }) {
  return error ? (
    <p role="alert" style={{ color: "var(--colorSoftError)", margin: "0.5rem 0 0" }}>
      Not saved: {error}
    </p>
  ) : null;
}

function EditorCommandHint() {
  return (
    <span>
      The program <b>Open in editor</b> starts to open a workspace, for example <code>code</code>, <code>codium</code>{" "}
      or <code>cursor</code>. Give a bare name on your PATH. If it cannot start, AgentBridge opens the workspace through
      the editor&apos;s own link, such as <code>vscode://</code>, instead. On macOS, first run &quot;Shell Command:
      Install &apos;code&apos; command in PATH&quot; in VS Code. Default: <code>{DEFAULT_EDITOR_COMMAND}</code>.
    </span>
  );
}

function ProbeTimeoutHint() {
  const names = agentBridgeProviders.map((provider) => provider.name);

  return (
    <span>
      How long to wait for an agent CLI ({names.slice(0, -1).join(", ")} or {names.at(-1)}) to answer{" "}
      <code>--version</code>. Raise it if the page says the probe timed out. Default: {DEFAULT_PROBE_TIMEOUT_MS} ms.
    </span>
  );
}

// Both settings in one preferences block, so the extension gets one heading
// and one separator instead of a heading per field.
export function ExtensionSettings() {
  return (
    <div className={styles.settings}>
      <ProbeTimeoutSetting />
      <EditorCommandSetting />
    </div>
  );
}
