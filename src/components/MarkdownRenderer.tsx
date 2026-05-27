import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { ComponentProps } from "react";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames || []), "div", "span"],
  attributes: {
    ...defaultSchema.attributes,
    // style intentionally omitted — rehype-raw + inline styles allow CSS overlay attacks.
  },
};

type MarkdownProps = ComponentProps<typeof Markdown>;

interface RendererProps extends MarkdownProps {
  variant?: "sanitized" | "raw" | "plain";
}

export default function MarkdownRenderer({ variant = "plain", rehypePlugins, ...props }: RendererProps) {
  const plugins = rehypePlugins ?? (
    variant === "sanitized"
      ? [rehypeRaw, [rehypeSanitize, sanitizeSchema]]
      : variant === "raw"
        ? [rehypeRaw, rehypeSanitize]
        : undefined
  );

  return <Markdown rehypePlugins={plugins as any} {...props} />;
}
