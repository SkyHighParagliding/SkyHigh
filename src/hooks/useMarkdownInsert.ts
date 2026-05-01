import { RefObject } from "react";

export function insertMarkdownAtCursor(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  currentContent: string,
  markdown: string
): string {
  const textarea = textareaRef.current;
  if (textarea) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = currentContent.substring(0, start);
    const after = currentContent.substring(end);
    const newContent =
      before +
      (before.endsWith("\n") || before === "" ? "" : "\n") +
      markdown +
      "\n" +
      after;

    setTimeout(() => {
      textarea.focus();
      const pos = (
        before +
        (before.endsWith("\n") || before === "" ? "" : "\n") +
        markdown +
        "\n"
      ).length;
      textarea.setSelectionRange(pos, pos);
    }, 0);

    return newContent;
  }

  return currentContent + (currentContent ? "\n" : "") + markdown + "\n";
}
