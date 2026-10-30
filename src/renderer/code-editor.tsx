import { Renderer } from "@freelensapp/extensions";
import { observer } from "mobx-react";
import { editor } from "monaco-editor";
import { useEffect, useRef } from "react";

interface CodeEditorProps {
  language: string;
  initialValue: string;
  onChange(value: string): void;
}

// A Monaco editor on the host's Monaco instance, which the build maps
// `monaco-editor` to. Being the host's instance, it has the host's languages
// and themes, its custom `clouds-midnight` included, and its workers.
//
// `Renderer.Component.MonacoEditor` would do the same, but its `language` prop
// is typed `"yaml" | "json"`, and the declared files are also Markdown, TOML
// (shown as ini) and plain text. The value is the initial one: the editor owns
// the text from then on, and the parent remounts it for another file.
export const CodeEditor = observer(function CodeEditor({ language, initialValue, onChange }: CodeEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const changeListener = useRef(onChange);
  const theme = Renderer.Theme.activeTheme.get().monacoTheme;

  changeListener.current = onChange;

  useEffect(() => {
    if (!container.current) return;

    const instance = editor.create(container.current, {
      value: initialValue,
      language,
      theme,
      wordWrap: "on",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      scrollbar: { alwaysConsumeMouseWheel: false },
    });
    const subscription = instance.onDidChangeModelContent(() => changeListener.current(instance.getValue()));

    return () => {
      subscription.dispose();
      instance.getModel()?.dispose();
      instance.dispose();
    };
  }, [language]);

  // Monaco has one theme for all its editors; the host switches it the same
  // way when the user changes the Freelens theme.
  useEffect(() => {
    editor.setTheme(theme);
  }, [theme]);

  return <div ref={container} style={{ height: "100%" }} />;
});
