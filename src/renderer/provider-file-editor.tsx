import { observer } from "mobx-react";
import { useEffect, useRef, useState } from "react";
import { ipcChannels } from "../common/ipc-channels";
import styles from "./agentbridge-page.module.scss";
import { CodeEditor } from "./code-editor";
import { monacoLanguageFor } from "./editor-language";
import { invoke } from "./ipc";
import { fileLabel } from "./page-model";
import { createSaveLifecycle } from "./save-lifecycle";

import type { EditorDefinition } from "../common/agentbridge-providers";

const SAVE_DEBOUNCE_MS = 500;

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface ProviderFileEditorProps {
  clusterId: string;
  providerId: string;
  editor: EditorDefinition;
}

// Reads one declared file, then autosaves every change after a short pause. A
// change still waiting for its pause is written at once when the file, the
// provider or the cluster changes, so switching never drops an edit.
export const ProviderFileEditor = observer(function ProviderFileEditor({
  clusterId,
  providerId,
  editor,
}: ProviderFileEditorProps) {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  // A file that could not be read is never shown as an empty, editable one:
  // the first keystroke would overwrite it.
  const [loadError, setLoadError] = useState<string>();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingWrite = useRef<() => void>(undefined);
  const saveLifecycle = useRef(createSaveLifecycle()).current;
  const currentEditor = useRef({ clusterId, providerId, path: editor.path });

  currentEditor.current = { clusterId, providerId, path: editor.path };

  useEffect(() => {
    let cancelled = false;

    saveLifecycle.invalidate();
    setLoaded(false);
    setLoadError(undefined);
    setStatus("idle");
    setError(undefined);
    void invoke(ipcChannels.readProviderFile, clusterId, providerId, editor.path)
      .then((result) => {
        if (cancelled) return;
        setContent(result.content);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // Flush, not drop: the write targets the file it was typed into.
      pendingWrite.current?.();
      pendingWrite.current = undefined;
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
    const write = () => {
      pendingWrite.current = undefined;
      void invoke(ipcChannels.writeProviderFile, clusterId, providerId, editor.path, next)
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
    };

    setContent(next);
    setStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    pendingWrite.current = write;
    debounceRef.current = setTimeout(write, SAVE_DEBOUNCE_MS);
  }

  const statusText = { idle: "Autosaves as you type", saving: "Saving…", saved: "Saved", error: "Not saved" }[status];

  return (
    <div className={styles.files}>
      <div className={styles.fileBar}>
        <span className={styles.fileName} title={editor.path}>
          {editor.path}
        </span>
        {/* Shown, not announced: "Saving…" after every pause would talk over
            the typing. A failed save is announced on its own below. */}
        <span className={styles.fileStatus} data-status={status} aria-hidden>
          {statusText}
        </span>
      </div>
      <div className={styles.editorFrame}>
        {loaded ? (
          <CodeEditor
            key={`${clusterId}/${providerId}/${editor.path}`}
            language={monacoLanguageFor(editor.language)}
            initialValue={content}
            onChange={onChange}
            ariaLabel={editor.path}
          />
        ) : (
          <div className={styles.editorPlaceholder} role={loadError ? "alert" : undefined}>
            {loadError ? `Could not open ${editor.path}: ${loadError}` : `Opening ${fileLabel(editor.path)}…`}
          </div>
        )}
      </div>
      {status === "error" && error && (
        <div className={styles.fileError} role="alert">
          Not saved: {error}
        </div>
      )}
    </div>
  );
});
