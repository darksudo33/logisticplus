import React from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  GitBranch,
  ListTodo,
  LockKeyhole,
  Plus,
  Route,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type {
  ShipmentWorkflowBlocker,
  ShipmentWorkflowProgress,
  ShipmentWorkflowRoute,
  ShipmentWorkflowStep,
} from "@/src/types";

const routeLabels: Record<ShipmentWorkflowRoute, string> = {
  green: "سبز",
  yellow: "زرد",
  red: "قرمز",
};

const stepStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "در انتظار", className: "border-border bg-muted text-muted-foreground" },
  active: { label: "فعال", className: "border-primary/30 bg-primary/10 text-primary" },
  completed: { label: "انجام شده", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" },
  skipped: { label: "رد شده", className: "border-slate-300 bg-slate-100 text-slate-500" },
};

function isRouteStep(stepCode?: string | null) {
  return stepCode === "039";
}

function groupVisibleSteps(progress: ShipmentWorkflowProgress) {
  return progress.phases.map((phase) => ({
    ...phase,
    steps: progress.steps.filter((step) => step.phaseId === phase.id && step.isVisible),
  })).filter((phase) => phase.steps.length > 0);
}

const HIDDEN_STEPS_SECTION_ID = "__hidden_steps__";

function storageKeyForProgress(progress: ShipmentWorkflowProgress | null | undefined) {
  const workflowId = progress?.workflow?.id || "new";
  return progress?.shipmentId ? `logisticplus.workflow.${progress.shipmentId}.${workflowId}.openPhases` : null;
}

function readOpenPhases(key: string | null, allowedIds: Set<string>) {
  if (!key || typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((item) => typeof item === "string" && allowedIds.has(item));
    if (ids.length) return new Set<string>(ids);
    return parsed.length === 0 ? new Set<string>() : null;
  } catch {
    return null;
  }
}

function writeOpenPhases(key: string | null, ids: Set<string>) {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Collapse preferences are client-only convenience state.
  }
}

function StepStatusIcon({ status, blocked }: { status: string; blocked: boolean }) {
  if (blocked) return <ShieldAlert className="h-4 w-4" />;
  if (status === "completed") return <CheckCircle2 className="h-4 w-4" />;
  if (status === "active") return <Clock className="h-4 w-4" />;
  return <ChevronDown className="h-4 w-4" />;
}

type IranImportProgressTimelineProps = {
  progress: ShipmentWorkflowProgress | null | undefined;
  isLoading?: boolean;
  onStart: () => void | Promise<void>;
  onMarkComplete: (step: ShipmentWorkflowStep) => void | Promise<void>;
  onSetCurrent: (step: ShipmentWorkflowStep) => void | Promise<void>;
  onRouteSelect: (route: ShipmentWorkflowRoute) => void | Promise<void>;
  onRevealStep: (step: ShipmentWorkflowStep) => void | Promise<void>;
  onAddBlocker: (step?: ShipmentWorkflowStep) => void;
  onResolveBlocker: (blocker: ShipmentWorkflowBlocker) => void | Promise<void>;
  onAssignTask: (context: { step?: ShipmentWorkflowStep; blocker?: ShipmentWorkflowBlocker }) => void;
};

export function IranImportProgressTimeline({
  progress,
  isLoading = false,
  onStart,
  onMarkComplete,
  onSetCurrent,
  onRouteSelect,
  onRevealStep,
  onAddBlocker,
  onResolveBlocker,
  onAssignTask,
}: IranImportProgressTimelineProps) {
  const workflow = progress?.workflow;
  const visibleGroups = React.useMemo(() => progress ? groupVisibleSteps(progress) : [], [progress]);
  const hiddenSteps = React.useMemo(() => progress?.steps.filter((step) => !step.isVisible) || [], [progress]);
  const completed = progress?.summary?.completedStepsCount || 0;
  const total = progress?.summary?.totalStepsCount || 0;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const currentStep = progress?.steps.find((step) => step.code === workflow?.currentStepCode);
  const routePending = Boolean(workflow && !workflow.customsRoute && isRouteStep(workflow.currentStepCode));
  const phaseSummaries = React.useMemo(() => {
    return visibleGroups.map((phase) => {
      const openBlockers = phase.steps.reduce(
        (count, step) => count + (step.blockers || []).filter((blocker) => blocker.status === "open").length,
        0
      );
      const completedSteps = phase.steps.filter((step) => step.status === "completed").length;
      const hasCurrent = Boolean(currentStep && phase.steps.some((step) => step.code === currentStep.code));
      const hasActive = phase.steps.some((step) => step.status === "active");
      return {
        ...phase,
        completedSteps,
        totalSteps: phase.steps.length,
        openBlockers,
        hasCurrent,
        hasActive,
        shouldOpenByDefault: hasCurrent || hasActive || openBlockers > 0,
      };
    });
  }, [visibleGroups, currentStep]);
  const openStorageKey = storageKeyForProgress(progress);
  const defaultOpenPhaseIds = React.useMemo(() => {
    const important = phaseSummaries
      .filter((phase) => phase.shouldOpenByDefault)
      .map((phase) => phase.id);
    return important.length ? important : phaseSummaries[0]?.id ? [phaseSummaries[0].id] : [];
  }, [phaseSummaries]);
  const sectionSignature = React.useMemo(() => {
    return [
      workflow?.id || "",
      workflow?.currentStepCode || "",
      phaseSummaries
        .map((phase) => `${phase.id}:${phase.completedSteps}:${phase.totalSteps}:${phase.openBlockers}:${phase.hasCurrent ? 1 : 0}`)
        .join("|"),
      hiddenSteps.map((step) => step.code).join(","),
    ].join("::");
  }, [workflow?.id, workflow?.currentStepCode, phaseSummaries, hiddenSteps]);
  const [openPhaseIds, setOpenPhaseIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const allowedIds = new Set([
      ...phaseSummaries.map((phase) => phase.id),
      ...(hiddenSteps.length ? [HIDDEN_STEPS_SECTION_ID] : []),
    ]);
    const stored = readOpenPhases(openStorageKey, allowedIds);
    setOpenPhaseIds(stored || new Set(defaultOpenPhaseIds));
  }, [openStorageKey, sectionSignature, defaultOpenPhaseIds, phaseSummaries, hiddenSteps.length]);

  const updateOpenPhases = React.useCallback((producer: (previous: Set<string>) => Set<string>) => {
    setOpenPhaseIds((previous) => {
      const next = producer(previous);
      writeOpenPhases(openStorageKey, next);
      return next;
    });
  }, [openStorageKey]);

  const toggleSection = React.useCallback((sectionId: string) => {
    updateOpenPhases((previous) => {
      const next = new Set(previous);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, [updateOpenPhases]);

  const openAllSections = React.useCallback(() => {
    updateOpenPhases(() => new Set([
      ...phaseSummaries.map((phase) => phase.id),
      ...(hiddenSteps.length ? [HIDDEN_STEPS_SECTION_ID] : []),
    ]));
  }, [updateOpenPhases, phaseSummaries, hiddenSteps.length]);

  const closeAllSections = React.useCallback(() => {
    updateOpenPhases(() => new Set());
  }, [updateOpenPhases]);

  const openActiveSections = React.useCallback(() => {
    updateOpenPhases(() => new Set(defaultOpenPhaseIds));
  }, [updateOpenPhases, defaultOpenPhaseIds]);

  if (!workflow) {
    return (
      <Card className="rounded-2xl border-primary/10 bg-card shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-black text-foreground">گردش کار واردات ایران</p>
            <p className="text-xs font-medium leading-6 text-muted-foreground">
              برای این محموله هنوز مسیر ثبت سفارش تا خروج از گمرک شروع نشده است.
            </p>
          </div>
          <Button data-testid="workflow-start" onClick={onStart} disabled={isLoading} className="h-10 gap-2 rounded-xl px-5 font-black shadow-sm shadow-primary/10">
            <Plus className="h-4 w-4" />
            شروع گردش کار
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-primary/10 bg-card shadow-sm">
      <CardHeader className="gap-5 border-b border-border/60 bg-muted/15 p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-black md:text-xl">
              <Route className="h-5 w-5 text-primary" />
              مسیر واردات ایران
            </CardTitle>
            <p className="mt-1 text-xs font-bold leading-6 text-muted-foreground">
              {currentStep ? `${currentStep.labelFa} / ${currentStep.labelEn}` : "مرحله فعال انتخاب نشده است"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-6 border-primary/20 bg-primary/10 px-2.5 text-primary">
              {completed} از {total} مرحله
            </Badge>
            <Badge variant="outline" className={cn("h-6 px-2.5", progress?.summary?.isBlocked ? "border-amber-500/30 bg-amber-500/10 text-amber-600" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600")}>
              {progress?.summary?.isBlocked ? `${progress.summary.openBlockersCount} مانع باز` : "بدون مانع باز"}
            </Badge>
            {workflow.customsRoute && (
              <Badge variant="outline" className="h-6 gap-1 border-slate-300 bg-background px-2.5 text-foreground">
                <GitBranch className="h-3 w-3" />
                مسیر {routeLabels[workflow.customsRoute]}
              </Badge>
            )}
          </div>
        </div>
        <div className="rounded-xl bg-background/70 p-3 ring-1 ring-border/50">
          <div className="mb-2 flex items-center justify-between text-xs font-bold text-muted-foreground">
            <span>پیشرفت داخلی</span>
            <span dir="ltr">{percent}%</span>
          </div>
          <Progress value={percent} className="h-2" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px] font-bold" data-testid="workflow-expand-all" onClick={openAllSections}>
            باز کردن همه
          </Button>
          <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px] font-bold" data-testid="workflow-collapse-all" onClick={closeAllSections}>
            بستن همه
          </Button>
          <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px] font-bold" data-testid="workflow-active-phase" onClick={openActiveSections}>
            مرحله فعال
          </Button>
        </div>
        {routePending && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-amber-700">
              <GitBranch className="h-4 w-4" />
              تعیین مسیر گمرکی
            </div>
            <div className="flex flex-wrap gap-2">
              {(["green", "yellow", "red"] as ShipmentWorkflowRoute[]).map((route) => (
                <Button key={route} size="sm" variant="outline" className="rounded-lg" onClick={() => onRouteSelect(route)}>
                  مسیر {routeLabels[route]}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-5 p-4">
        {phaseSummaries.map((phase) => {
          const isOpen = openPhaseIds.has(phase.id);
          return (
          <section
            key={phase.id}
            className={cn(
              "overflow-hidden rounded-xl border bg-background/45 transition-all",
              (phase.hasCurrent || phase.hasActive) ? "border-primary/40 bg-primary/5 shadow-sm shadow-primary/10" : "border-border",
              phase.openBlockers > 0 && "border-amber-500/30 bg-amber-500/10"
            )}
            data-testid={`workflow-phase-${phase.id}`}
          >
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between gap-3 p-3 text-right transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                (phase.hasCurrent || phase.hasActive) && "bg-primary/5",
                phase.openBlockers > 0 && "bg-amber-500/10"
              )}
              data-testid={`workflow-phase-toggle-${phase.id}`}
              aria-expanded={isOpen}
              aria-controls={`workflow-phase-body-${phase.id}`}
              onClick={() => toggleSection(phase.id)}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-black text-foreground">{phase.labelFa}</h3>
                  {(phase.hasCurrent || phase.hasActive) && (
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] text-primary">
                      فعال
                    </Badge>
                  )}
                  {phase.openBlockers > 0 && (
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700">
                      {phase.openBlockers} مانع
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[11px] font-medium text-muted-foreground" dir="ltr">{phase.labelEn}</p>
                <p className="mt-2 text-[11px] font-bold text-muted-foreground">
                  {phase.completedSteps} مورد تکمیل شده، {Math.max(phase.totalSteps - phase.completedSteps, 0)} مورد باقی مانده
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-card text-[10px]">
                  {phase.completedSteps}/{phase.totalSteps}
                </Badge>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen ? "rotate-180" : "")} />
              </div>
            </button>
            {phase.openBlockers > 0 && (
              <div className="border-t border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-800">
                مانع باز در این بخش وجود دارد؛ برای پیگیری، بخش را باز کنید.
              </div>
            )}
            {isOpen && (
            <div
              id={`workflow-phase-body-${phase.id}`}
              className="space-y-2 border-t border-border/60 p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1"
              data-testid={`workflow-phase-body-${phase.id}`}
            >
              {phase.steps.map((step) => {
                const openBlockers = (step.blockers || []).filter((blocker) => blocker.status === "open");
                const statusConfig = stepStatusConfig[step.status] || stepStatusConfig.pending;
                const blocked = openBlockers.length > 0;
                return (
                  <div
                    key={step.code}
                    data-testid={`workflow-step-${step.code}`}
                    className={cn(
                      "rounded-xl border p-3 transition-all",
                      step.status === "active" ? "border-primary/50 bg-blue-50/70 shadow-sm shadow-primary/10 ring-1 ring-primary/10 dark:bg-primary/10" : "border-border bg-background/50",
                      blocked && "border-amber-500/30 bg-amber-500/10"
                    )}
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start gap-2">
                          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", statusConfig.className)}>
                            <StepStatusIcon status={step.status} blocked={blocked} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-black text-muted-foreground">{step.code}</span>
                              <h4 className={cn("text-sm font-black text-foreground", step.status === "active" && "text-primary")}>{step.labelFa}</h4>
                              <Badge variant="outline" className={cn("text-[10px]", statusConfig.className)}>
                                {statusConfig.label}
                              </Badge>
                            </div>
                            <p className="mt-1 text-[11px] font-medium text-muted-foreground" dir="ltr">{step.labelEn}</p>
                          </div>
                        </div>
                        {(step.internalNote || step.publicNote || openBlockers.length > 0) && (
                          <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                            {step.internalNote && (
                              <p className="rounded-lg bg-muted/60 p-2 font-medium leading-6 text-muted-foreground">
                                یادداشت داخلی: {step.internalNote}
                              </p>
                            )}
                            {step.publicNote && (
                              <p className="rounded-lg bg-emerald-500/10 p-2 font-medium leading-6 text-emerald-700">
                                یادداشت عمومی: {step.publicNote}
                              </p>
                            )}
                            {openBlockers.map((blocker) => (
                              <div key={blocker.id} className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2" data-testid={`workflow-blocker-${blocker.id}`}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-black text-amber-700">{blocker.blockerCode} - {blocker.labelFa}</span>
                                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onResolveBlocker(blocker)}>
                                    رفع مانع
                                  </Button>
                                </div>
                                {blocker.internalNote && <p className="mt-1 leading-5 text-amber-800">{blocker.internalNote}</p>}
                                <Button size="sm" variant="outline" className="mt-2 h-7 gap-1 text-[11px]" data-testid={`workflow-blocker-assign-${blocker.id}`} onClick={() => onAssignTask({ step, blocker })}>
                                  <ListTodo className="h-3 w-3" />
                                  ارجاع از مانع
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button size="sm" variant="outline" className="h-8 rounded-lg gap-1 text-[11px] font-bold" data-testid={`workflow-step-current-${step.code}`} onClick={() => onSetCurrent(step)}>
                          <Clock className="h-3 w-3" />
                          فعال
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-lg gap-1 text-[11px] font-bold" data-testid={`workflow-step-complete-${step.code}`} onClick={() => onMarkComplete(step)}>
                          <CheckCircle2 className="h-3 w-3" />
                          تکمیل
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-lg gap-1 text-[11px] font-bold" data-testid={`workflow-step-blocker-${step.code}`} onClick={() => onAddBlocker(step)}>
                          <AlertCircle className="h-3 w-3" />
                          مانع
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 rounded-lg gap-1 text-[11px] font-bold" data-testid={`workflow-step-assign-${step.code}`} onClick={() => onAssignTask({ step })}>
                          <ListTodo className="h-3 w-3" />
                          ارجاع
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </section>
          );
        })}

        {hiddenSteps.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-dashed border-border bg-muted/20" data-testid="workflow-hidden-section">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 p-3 text-right hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              data-testid="workflow-hidden-toggle"
              aria-expanded={openPhaseIds.has(HIDDEN_STEPS_SECTION_ID)}
              aria-controls="workflow-hidden-body"
              onClick={() => toggleSection(HIDDEN_STEPS_SECTION_ID)}
            >
            <div className="flex items-center gap-2 text-sm font-black text-muted-foreground">
              <LockKeyhole className="h-4 w-4" />
              مراحل پنهان / استثنایی
            </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-card text-[10px]">{hiddenSteps.length}</Badge>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", openPhaseIds.has(HIDDEN_STEPS_SECTION_ID) ? "rotate-180" : "")} />
              </div>
            </button>
            {openPhaseIds.has(HIDDEN_STEPS_SECTION_ID) && (
            <div id="workflow-hidden-body" className="grid gap-2 border-t border-border/60 p-3 md:grid-cols-2" data-testid="workflow-hidden-body">
              {hiddenSteps.map((step) => (
                <div key={step.code} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-foreground">{step.code} - {step.labelFa}</p>
                    <p className="truncate text-[11px] text-muted-foreground" dir="ltr">{step.labelEn}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1 text-[11px]" onClick={() => onRevealStep(step)}>
                    <Eye className="h-3 w-3" />
                    نمایش
                  </Button>
                </div>
              ))}
            </div>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
