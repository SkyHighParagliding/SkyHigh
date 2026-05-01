import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";

const MarkdownRenderer = lazy(() => import("./MarkdownRenderer"));

type RendererProps = ComponentProps<typeof MarkdownRenderer>;

export type LazyMarkdownProps = Omit<RendererProps, "variant"> & {
  variant?: "sanitized" | "raw" | "plain";
};

export default function LazyMarkdown({ variant = "plain", ...props }: LazyMarkdownProps) {
  return (
    <Suspense fallback={<div className="animate-pulse h-4 bg-muted rounded w-3/4" />}>
      <MarkdownRenderer variant={variant} {...props} />
    </Suspense>
  );
}
