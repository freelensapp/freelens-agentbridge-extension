import { loader, Editor as Monaco } from "@monaco-editor/react";
import { ipcRenderer } from "electron";
import { observer } from "mobx-react";
import * as monacoEditor from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { useEffect, useRef, useState } from "react";
import { monacoLanguageFor } from "./editor-language";
import { createSaveLifecycle } from "./save-lifecycle";
import { resolveHostMonacoTheme } from "./section-theme";

import type { EditorDefinition } from "../common/agentbridge-providers";

// Monaco asks for a worker by language label. Everything the extension seeds is
// happy with the generic editor worker except Pi's `.pi/extensions/*.ts`, whose
// diagnostics live in Monaco's own TypeScript worker — and without it the
// language service silently reports nothing.
(self as any).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    return label === "typescript" || label === "javascript" ? new tsWorker() : new editorWorker();
  },
};

// Syntax errors in the seeded Pi guard are not cosmetic: a `.pi/extensions/*.ts`
// that does not parse makes Pi exit 1 at startup, so a red squiggle here is the
// difference between an editable mistake and a session that will not open.
//
// Semantic diagnostics are off, and would be pure noise: the guard's only import
// is an `import type` from `@earendil-works/pi-coding-agent`, which is installed
// on the user's machine and never in the seeded workspace, so every type in the
// file would resolve to an error the user cannot fix.
// Optional call on purpose: `languages.typescript` comes from Monaco's
// TypeScript `monaco.contribution`, which the bundled `editor.main` includes
// today. This runs at module scope, so if a future Monaco build ever drops it a
// throw here would take the whole page down for every provider — losing
// diagnostics on one file is the better failure.
monacoEditor.languages.typescript?.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
  noSuggestionDiagnostics: true,
});

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
    <div
      style={{
        border: "1px solid var(--borderColor)",
        borderRadius: "4px",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>{editor.title}</strong>
        {badge.text && <span style={{ color: badge.color, fontSize: "0.85em" }}>{badge.text}</span>}
      </div>
      <div style={{ border: "1px solid var(--borderColor)", height: "360px", resize: "vertical", overflow: "hidden" }}>
        {loaded ? (
          <Monaco
            language={monacoLanguageFor(editor.language)}
            value={content}
            theme={resolveHostMonacoTheme()}
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
