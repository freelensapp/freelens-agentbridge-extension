import { loader, Editor as Monaco } from "@monaco-editor/react";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import * as monacoEditor from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { useEffect, useRef, useState } from "react";
import { createSaveLifecycle } from "./save-lifecycle";
import { sectionThemeStore } from "./section-theme";

import type { EditorDefinition } from "../common/agentbridge-providers";

(self as any).MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

loader.config({ monaco: monacoEditor as any });

const CHANNEL_PREFIX = "agentbridge-extension:";
const SAVE_DEBOUNCE_MS = 500;

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ProviderFileEditorProps {
  clusterId: string;
  providerId: string;
  editor: EditorDefinition;
}

export const ProviderFileEditor = observer(function ProviderFileEditor({
  clusterId,
  providerId,
  editor,
}: ProviderFileEditorProps) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const saveLifecycle = useRef(createSaveLifecycle()).current;
  const currentEditor = useRef({ clusterId, providerId, path: editor.path });

  currentEditor.current = { clusterId, providerId, path: editor.path };

  useEffect(() => {
    let cancelled = false;

    saveLifecycle.invalidate();
    setLoaded(false);
    setStatus("idle");
    setError(undefined);
    void ipcRenderer
      .invoke(`${CHANNEL_PREFIX}read-provider-file`, clusterId, providerId, editor.path)
      .then((result: { content: string }) => {
        if (cancelled) return;
        setContent(result.content);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
        setLoaded(true);
      });

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveLifecycle.invalidate();
    };
  }, [clusterId, providerId, editor.path]);

  function onChange(value: string | undefined) {
    const next = value ?? "";
    const isCurrentSave = saveLifecycle.begin();
    const isCurrentEditor = () =>
      isCurrentSave() &&
      currentEditor.current.clusterId === clusterId &&
      currentEditor.current.providerId === providerId &&
      currentEditor.current.path === editor.path;

    setContent(next);
    setStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void ipcRenderer
        .invoke(`${CHANNEL_PREFIX}write-provider-file`, clusterId, providerId, editor.path, next)
        .then(() => {
          if (!isCurrentEditor()) return;
          setStatus("saved");
          setError(undefined);
          saveLifecycle.setBadgeTimer(() => {
            if (isCurrentEditor()) setStatus((current) => (current === "saved" ? "idle" : current));
          });
        })
        .catch((err: unknown) => {
          if (!isCurrentEditor()) return;
          setStatus("error");
          setError(err instanceof Error ? err.message : String(err));
        });
    }, SAVE_DEBOUNCE_MS);
  }

  const badge =
    status === "saving"
      ? { text: "Saving...", color: "var(--colorWarning)" }
      : status === "saved"
        ? { text: "Saved", color: "var(--colorOk)" }
        : status === "error"
          ? { text: `Save failed: ${error ?? "unknown"}`, color: "var(--colorError)" }
          : { text: "", color: "#888" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
        <strong>{editor.title}</strong>
        {badge.text && <span style={{ color: badge.color, fontSize: "0.85em" }}>{badge.text}</span>}
      </div>
      <div style={{ border: "1px solid var(--borderColor)", height: "360px", resize: "vertical", overflow: "hidden" }}>
        {loaded ? (
          <Monaco
            language={editor.language}
            value={content}
            theme={sectionThemeStore.monacoTheme}
            onChange={onChange}
            options={{
              wordWrap: "on",
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              scrollbar: { alwaysConsumeMouseWheel: false },
            }}
            loading={<p style={{ padding: "0.5rem" }}>Loading editor...</p>}
          />
        ) : (
          <p style={{ padding: "0.5rem" }}>Loading {editor.title}...</p>
        )}
      </div>
    </div>
  );
});
