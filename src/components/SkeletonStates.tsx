import React from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function SkeletonRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid gap-3 border-b border-border bg-muted/45 p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(120px, 1fr))` }}>
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-20 max-w-full" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${columns}, minmax(120px, 1fr))` }}>
            {Array.from({ length: columns }).map((__, column) => (
              <Skeleton key={column} className={cn("h-4", column === 0 ? "w-28" : "w-20", column === columns - 1 && "w-16")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatSkeleton() {
  return (
    <Card className="rounded-xl border-border bg-card shadow-sm">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-14" />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" />
      </CardContent>
    </Card>
  );
}

export function ProtectedContentSkeleton({ className }: { className?: string }) {
  return (
    <div data-testid="protected-content-skeleton" className={cn("app-page space-y-5", className)}>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <div className="space-y-3">
              <Skeleton className="h-6 w-48 max-w-[65vw]" />
              <Skeleton className="h-3 w-72 max-w-[75vw]" />
            </div>
          </div>
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <StatSkeleton key={index} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SkeletonRows rows={6} columns={4} />
        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardHeader className="space-y-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-3 w-56 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-28 max-w-full" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ProtectedShellSkeleton() {
  return (
    <div className="dashboard-theme app-shell flex h-screen overflow-hidden bg-background text-foreground" dir="rtl">
      <aside className="hidden h-screen w-[224px] flex-col border-l border-border/80 bg-card/95 p-3 lg:flex">
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-xl px-2 py-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border/80 bg-card/80 px-4 md:px-5">
          <Skeleton className="h-9 w-64 max-w-[45vw] rounded-lg" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-9 rounded-xl" />
            <Skeleton className="hidden h-9 w-40 rounded-xl sm:block" />
          </div>
        </header>
        <main className="app-main flex-1 overflow-hidden pb-16 lg:pb-0">
          <ProtectedContentSkeleton />
        </main>
      </div>
    </div>
  );
}

export function PublicRouteSkeleton() {
  return (
    <div className="dashboard-theme app-shell min-h-screen overflow-hidden bg-background text-foreground" dir="rtl">
      <header className="border-b border-border bg-card/90 px-4 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="hidden h-10 w-24 rounded-xl sm:block" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
        </div>
      </header>
      <main className="mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[1fr_440px] lg:items-center">
        <section className="space-y-5">
          <Skeleton className="h-7 w-40 rounded-full" />
          <Skeleton className="h-10 w-full max-w-2xl" />
          <Skeleton className="h-10 w-5/6 max-w-xl" />
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <StatSkeleton key={index} />
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mx-auto mb-5 flex flex-col items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-xl" />
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-3 w-52 max-w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </section>
      </main>
    </div>
  );
}

export function AdminPanelSkeleton() {
  return (
    <div data-testid="admin-panel-skeleton" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <StatSkeleton key={index} />
        ))}
      </div>
      <SkeletonRows rows={6} columns={5} />
    </div>
  );
}

export function PublicTrackingSkeleton() {
  return (
    <div data-testid="public-tracking-skeleton" className="space-y-5">
      <Card className="rounded-2xl border-blue-100 bg-white shadow-sm">
        <CardContent className="space-y-5 p-5 md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <Skeleton className="h-6 w-32 bg-blue-100" />
              <Skeleton className="h-9 w-52 bg-slate-200" />
              <Skeleton className="h-4 w-64 max-w-full bg-slate-200" />
            </div>
            <div className="w-full space-y-3 rounded-xl border border-blue-100 p-4 md:max-w-xs">
              <Skeleton className="h-4 w-36 bg-blue-100" />
              <Skeleton className="h-6 w-44 bg-slate-200" />
              <Skeleton className="h-4 w-full bg-slate-200" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-36 rounded-xl bg-slate-200" />
            <Skeleton className="h-36 rounded-xl bg-slate-200" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl bg-slate-200" />
        ))}
      </div>
      <Card className="rounded-2xl border-blue-100 bg-white shadow-sm">
        <CardContent className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <Skeleton className="h-8 w-8 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-44 max-w-full bg-slate-200" />
                <Skeleton className="h-3 w-28 bg-slate-200" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
