import type { ElementType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EmptyStateAction = {
  label: string;
  onClick?: () => void;
  to?: string;
  icon?: ElementType;
  variant?: "default" | "outline" | "ghost";
};

type EmptyStateProps = {
  icon: ElementType;
  title: string;
  description: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
  compact?: boolean;
  children?: ReactNode;
};

function EmptyStateButton({ action }: { action: EmptyStateAction }) {
  const Icon = action.icon || ArrowLeft;
  const content = (
    <>
      {action.label}
      <Icon className="h-4 w-4" />
    </>
  );

  if (action.to) {
    return (
      <Button asChild variant={action.variant || "default"} className="h-10 rounded-xl text-xs font-black">
        <Link to={action.to}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant={action.variant || "default"}
      onClick={action.onClick}
      className="h-10 rounded-xl text-xs font-black"
    >
      {content}
    </Button>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
  compact = false,
  children,
}: EmptyStateProps) {
  return (
    <div
      data-empty-state
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/25 px-4 text-center",
        compact ? "py-8" : "py-12 md:py-14",
        className
      )}
      dir="rtl"
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="text-sm font-black text-foreground md:text-base">{title}</h3>
      <p className="mt-2 max-w-xl text-xs font-bold leading-6 text-muted-foreground md:text-sm">{description}</p>
      {children ? <div className="mt-4 w-full max-w-2xl">{children}</div> : null}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
          {primaryAction ? <EmptyStateButton action={primaryAction} /> : null}
          {secondaryAction ? <EmptyStateButton action={secondaryAction} /> : null}
        </div>
      )}
    </div>
  );
}

export function EmptyTableRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-6">
        {children}
      </td>
    </tr>
  );
}

export type SetupChecklistItem = {
  label: string;
  description: string;
  done: boolean;
  to: string;
  icon: ElementType;
};

export function SetupChecklist({ items }: { items: SetupChecklistItem[] }) {
  const completed = items.filter((item) => item.done).length;

  return (
    <Card className="rounded-xl border-border bg-card shadow-sm" data-empty-state="setup-checklist">
      <CardContent className="p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-foreground">راه‌اندازی اولیه عملیات</h2>
            <p className="mt-1 text-xs font-bold leading-6 text-muted-foreground">
              این مسیر کوتاه، پنل تمیز شما را به اولین جریان واقعی لجستیکی وصل می‌کند.
            </p>
          </div>
          <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
            {completed.toLocaleString("fa-IR")} از {items.length.toLocaleString("fa-IR")}
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.to}
                className={cn(
                  "flex min-w-0 items-center gap-3 rounded-xl border p-3 text-right transition-colors",
                  item.done
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-border bg-background hover:border-primary/30 hover:bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-black",
                    item.done ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"
                  )}
                >
                  {item.done ? "✓" : (index + 1).toLocaleString("fa-IR")}
                </span>
                <Icon className={cn("h-4 w-4 shrink-0", item.done ? "text-emerald-600" : "text-primary")} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-black text-foreground">{item.label}</span>
                  <span className="mt-1 block truncate text-[11px] font-bold text-muted-foreground">{item.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export const resetFiltersAction = (onClick: () => void): EmptyStateAction => ({
  label: "پاک کردن فیلترها",
  onClick,
  icon: RotateCcw,
  variant: "outline",
});
