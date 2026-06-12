import React from "react";
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  GitBranch,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  shipmentWorkflowTemplatesApi,
  type ShipmentWorkflowTemplate,
  type ShipmentWorkflowTemplatePhase,
  type ShipmentWorkflowTemplateStep,
  type ShipmentWorkflowStepCatalogItem,
} from "@/src/lib/shipmentWorkflowTemplatesApi";
import type { ShipmentTypeOption } from "@/src/lib/shipmentFormTemplatesApi";

type StepDraft = {
  labelFa: string;
  labelEn: string;
  publicLabel: string;
  sortOrder: number;
  isRequired: boolean;
  isVisible: boolean;
  isCustomerVisible: boolean;
  roleSuggestion: string;
  checklistText: string;
  expectedDocumentsText: string;
  expectedFormFieldsText: string;
};

type NewStepDraft = {
  stepKey: string;
  labelFa: string;
  labelEn: string;
  phaseId: string;
};

type StepEditorProps = {
  key?: React.Key;
  step: ShipmentWorkflowTemplateStep;
  phase: ShipmentWorkflowTemplatePhase;
  canMoveUp: boolean;
  canMoveDown: boolean;
  saving: boolean;
  onSave: (step: ShipmentWorkflowTemplateStep, patch: Record<string, unknown>) => Promise<void>;
  onMove: (step: ShipmentWorkflowTemplateStep, direction: "up" | "down") => Promise<void>;
  onArchive: (step: ShipmentWorkflowTemplateStep) => Promise<void>;
};

function stepCount(template: ShipmentWorkflowTemplate | null) {
  return template?.phases.reduce((sum, phase) => sum + phase.steps.length, 0) || 0;
}

function upsertTemplate(templates: ShipmentWorkflowTemplate[], updated: ShipmentWorkflowTemplate) {
  return [
    updated,
    ...templates.filter((template) => template.id !== updated.id),
  ].sort((a, b) => {
    if (a.organizationId && !b.organizationId) return -1;
    if (!a.organizationId && b.organizationId) return 1;
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return b.version - a.version;
  });
}

function parseList(text: string) {
  return text
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(value: unknown[] | undefined) {
  return (value || []).map((item) => String(item)).join("\n");
}

const directionLabels: Record<string, string> = {
  import: "واردات",
  export: "صادرات",
  transit: "ترانزیت",
  domestic: "داخلی",
};

const transportModeLabels: Record<string, string> = {
  sea: "دریایی",
  air: "هوایی",
  land: "زمینی",
  rail: "ریلی",
};

const catalogStageLabels: Record<string, string> = {
  intake: "ثبت اولیه پرونده",
  documents: "دریافت و بررسی اسناد",
  permits: "ثبت سفارش و مجوزها",
  declaration: "اظهار گمرکی",
  routing: "تعیین مسیر گمرکی",
  inspection: "ارزیابی و بازرسی",
  payments: "پرداخت‌ها و عوارض",
  release: "صدور پروانه و ترخیص",
  exit: "خروج و تحویل کالا",
  closure: "بستن پرونده",
};

function shipmentTypeLabel(types: ShipmentTypeOption[], code?: string | null) {
  return types.find((type) => type.code === code)?.labelFa || code || "بدون نوع محموله";
}

function ToggleBox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] font-bold text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      <span className="truncate">{label}</span>
    </label>
  );
}

function StepEditor({
  step,
  phase,
  canMoveUp,
  canMoveDown,
  saving,
  onSave,
  onMove,
  onArchive,
}: StepEditorProps) {
  const [draft, setDraft] = React.useState<StepDraft>({
    labelFa: step.labelFa,
    labelEn: step.labelEn || "",
    publicLabel: step.publicLabel || "",
    sortOrder: step.sortOrder,
    isRequired: step.isRequired,
    isVisible: step.isVisible,
    isCustomerVisible: step.isCustomerVisible,
    roleSuggestion: step.roleSuggestion || "",
    checklistText: listText(step.checklist),
    expectedDocumentsText: listText(step.expectedDocuments),
    expectedFormFieldsText: listText(step.expectedFormFields),
  });

  React.useEffect(() => {
    setDraft({
      labelFa: step.labelFa,
      labelEn: step.labelEn || "",
      publicLabel: step.publicLabel || "",
      sortOrder: step.sortOrder,
      isRequired: step.isRequired,
      isVisible: step.isVisible,
      isCustomerVisible: step.isCustomerVisible,
      roleSuggestion: step.roleSuggestion || "",
      checklistText: listText(step.checklist),
      expectedDocumentsText: listText(step.expectedDocuments),
      expectedFormFieldsText: listText(step.expectedFormFields),
    });
  }, [step]);

  const hasChanges =
    draft.labelFa !== step.labelFa ||
    draft.labelEn !== (step.labelEn || "") ||
    draft.publicLabel !== (step.publicLabel || "") ||
    Number(draft.sortOrder) !== Number(step.sortOrder) ||
    draft.isRequired !== step.isRequired ||
    draft.isVisible !== step.isVisible ||
    draft.isCustomerVisible !== step.isCustomerVisible ||
    draft.roleSuggestion !== (step.roleSuggestion || "") ||
    draft.checklistText !== listText(step.checklist) ||
    draft.expectedDocumentsText !== listText(step.expectedDocuments) ||
    draft.expectedFormFieldsText !== listText(step.expectedFormFields);

  const save = () => onSave(step, {
    labelFa: draft.labelFa.trim(),
    labelEn: draft.labelEn.trim(),
    publicLabel: draft.publicLabel.trim(),
    sortOrder: Number(draft.sortOrder) || 0,
    isRequired: draft.isRequired,
    isVisible: draft.isVisible,
    isCustomerVisible: draft.isCustomerVisible,
    roleSuggestion: draft.roleSuggestion.trim(),
    checklist: parseList(draft.checklistText),
    expectedDocuments: parseList(draft.expectedDocumentsText),
    expectedFormFields: parseList(draft.expectedFormFieldsText),
    taskPolicy: step.taskPolicy || { mode: "suggested" },
  });

  return (
    <div className="rounded-lg border border-border bg-background p-3" data-testid={`shipment-workflow-template-step-${step.stepKey}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-black">{phase.labelFa}</Badge>
            <Badge variant="outline" className="text-[10px] font-black" dir="ltr">{step.stepKey}</Badge>
            {step.catalogStepId ? (
              <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-[10px] font-black text-sky-700">از کتابخانه</Badge>
            ) : null}
            {!step.isVisible ? (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] font-black text-amber-700">مخفی</Badge>
            ) : null}
            {step.isRequired ? (
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] font-black text-primary">اجباری</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] font-black">اختیاری</Badge>
            )}
          </div>
          <p className="mt-2 text-xs font-black text-foreground">{step.labelFa}</p>
          <p className="mt-1 text-[11px] font-bold text-muted-foreground" dir="ltr">{step.labelEn}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => onMove(step, "up")} disabled={saving || !canMoveUp}>
            بالا
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => onMove(step, "down")} disabled={saving || !canMoveDown}>
            پایین
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black text-destructive" onClick={() => void onArchive(step)} disabled={saving || step.isRequired}>
            <Trash2 className="ml-1 h-3.5 w-3.5" />
            آرشیو
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_110px]">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">عنوان داخلی</Label>
          <Input value={draft.labelFa} onChange={(event) => setDraft((current) => ({ ...current, labelFa: event.target.value }))} className="h-9 rounded-lg bg-card text-xs font-bold" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">Public label</Label>
          <Input value={draft.publicLabel} onChange={(event) => setDraft((current) => ({ ...current, publicLabel: event.target.value }))} className="h-9 rounded-lg bg-card text-xs font-bold" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">ترتیب</Label>
          <Input type="number" min={0} value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))} className="h-9 rounded-lg bg-card text-xs font-bold" dir="ltr" />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">نقش پیشنهادی</Label>
          <Input value={draft.roleSuggestion} onChange={(event) => setDraft((current) => ({ ...current, roleSuggestion: event.target.value }))} className="h-9 rounded-lg bg-card text-xs font-bold" dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">English label</Label>
          <Input value={draft.labelEn} onChange={(event) => setDraft((current) => ({ ...current, labelEn: event.target.value }))} className="h-9 rounded-lg bg-card text-xs font-bold" dir="ltr" />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">چک‌لیست قالب</Label>
          <textarea value={draft.checklistText} onChange={(event) => setDraft((current) => ({ ...current, checklistText: event.target.value }))} className="min-h-16 w-full rounded-lg border border-input bg-card px-3 py-2 text-xs font-bold leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">اسناد مورد انتظار</Label>
          <textarea value={draft.expectedDocumentsText} onChange={(event) => setDraft((current) => ({ ...current, expectedDocumentsText: event.target.value }))} className="min-h-16 w-full rounded-lg border border-input bg-card px-3 py-2 text-xs font-bold leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring" dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">فیلدهای مورد انتظار</Label>
          <textarea value={draft.expectedFormFieldsText} onChange={(event) => setDraft((current) => ({ ...current, expectedFormFieldsText: event.target.value }))} className="min-h-16 w-full rounded-lg border border-input bg-card px-3 py-2 text-xs font-bold leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring" dir="ltr" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <ToggleBox label="نمایش داخلی" checked={draft.isVisible} onChange={(isVisible) => setDraft((current) => ({ ...current, isVisible }))} />
        <ToggleBox label="نمایش عمومی" checked={draft.isCustomerVisible} onChange={(isCustomerVisible) => setDraft((current) => ({ ...current, isCustomerVisible }))} />
        <ToggleBox label="اجباری" checked={draft.isRequired} onChange={(isRequired) => setDraft((current) => ({ ...current, isRequired }))} />
      </div>

      <div className="mt-3 flex justify-end">
        <Button type="button" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => void save()} disabled={saving || !hasChanges || !draft.labelFa.trim()}>
          {saving ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Save className="ml-1 h-3.5 w-3.5" />}
          ذخیره مرحله
        </Button>
      </div>
    </div>
  );
}

export default function ShipmentWorkflowTemplatesAdmin() {
  const [types, setTypes] = React.useState<ShipmentTypeOption[]>([]);
  const [templates, setTemplates] = React.useState<ShipmentWorkflowTemplate[]>([]);
  const [catalogSteps, setCatalogSteps] = React.useState<ShipmentWorkflowStepCatalogItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = React.useState("");
  const [selectedTypeCode, setSelectedTypeCode] = React.useState("IMPORT_SEA_CONTAINER");
  const [loading, setLoading] = React.useState(true);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = React.useState({ titleFa: "", titleEn: "", description: "", isActive: true });
  const [newStep, setNewStep] = React.useState<NewStepDraft>({ stepKey: "", labelFa: "", labelEn: "", phaseId: "" });
  const [catalogSearch, setCatalogSearch] = React.useState("");
  const [catalogStage, setCatalogStage] = React.useState("");
  const [includeArchivedCatalog, setIncludeArchivedCatalog] = React.useState(false);
  const [includeArchivedTemplates, setIncludeArchivedTemplates] = React.useState(false);
  const [selectedCatalogStepIds, setSelectedCatalogStepIds] = React.useState<string[]>([]);

  const selectedTemplate = React.useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || templates[0] || null,
    [selectedTemplateId, templates]
  );
  const orderedSteps = React.useMemo(
    () => selectedTemplate?.phases.flatMap((phase) => phase.steps).sort((a, b) => a.sortOrder - b.sortOrder) || [],
    [selectedTemplate]
  );
  const catalogStageOptions = React.useMemo(() => {
    const stages = new Map<string, string>();
    for (const step of catalogSteps) {
      if (step.stageKey) stages.set(step.stageKey, step.stageTitleFa || catalogStageLabels[step.stageKey] || step.stageKey);
    }
    return [...stages.entries()].map(([key, label]) => ({ key, label }));
  }, [catalogSteps]);
  const visibleCatalogSteps = React.useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    return catalogSteps.filter((step) => {
      if (!includeArchivedCatalog && step.archivedAt) return false;
      if (catalogStage && step.stageKey !== catalogStage) return false;
      if (!query) return true;
      return [step.code, step.title, step.titleFa, step.stageTitleFa]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [catalogSearch, catalogStage, catalogSteps, includeArchivedCatalog]);
  const selectedTemplateCatalogIds = React.useMemo(
    () => new Set(orderedSteps.map((step) => step.catalogStepId).filter(Boolean) as string[]),
    [orderedSteps]
  );

  React.useEffect(() => {
    if (!selectedTemplate) {
      setTemplateDraft({ titleFa: "", titleEn: "", description: "", isActive: true });
      return;
    }
    setTemplateDraft({
      titleFa: selectedTemplate.titleFa,
      titleEn: selectedTemplate.titleEn || "",
      description: selectedTemplate.description || "",
      isActive: selectedTemplate.isActive,
    });
    setNewStep((current) => ({ ...current, phaseId: selectedTemplate.phases[0]?.id || "" }));
    if (selectedTemplate.shipmentTypeHint) setSelectedTypeCode(selectedTemplate.shipmentTypeHint);
  }, [selectedTemplate]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [loadedTypes, loadedTemplates, loadedCatalogSteps] = await Promise.all([
        shipmentWorkflowTemplatesApi.listTypes(),
        shipmentWorkflowTemplatesApi.list(undefined, { includeArchived: includeArchivedTemplates }),
        shipmentWorkflowTemplatesApi.listCatalog({ includeArchived: includeArchivedCatalog }),
      ]);
      setTypes(loadedTypes);
      setTemplates(loadedTemplates);
      setCatalogSteps(loadedCatalogSteps);
      if (!selectedTemplateId && loadedTemplates[0]) setSelectedTemplateId(loadedTemplates[0].id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بارگیری قالب‌های گردش کار ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [includeArchivedCatalog, includeArchivedTemplates, selectedTemplateId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateTemplateState = (updated: ShipmentWorkflowTemplate) => {
    setTemplates((current) => upsertTemplate(current, updated));
    setSelectedTemplateId(updated.id);
  };

  const saveTemplate = async () => {
    if (!selectedTemplate || !templateDraft.titleFa.trim()) return;
    setSavingKey("template");
    try {
      const updated = await shipmentWorkflowTemplatesApi.update(selectedTemplate.id, {
        titleFa: templateDraft.titleFa.trim(),
        titleEn: templateDraft.titleEn.trim(),
        description: templateDraft.description.trim(),
        isActive: templateDraft.isActive,
      });
      updateTemplateState(updated);
      toast.success("قالب گردش کار ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره قالب ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const publishTemplate = async () => {
    if (!selectedTemplate) return;
    setSavingKey("publish");
    try {
      const updated = await shipmentWorkflowTemplatesApi.publish(selectedTemplate.id, {
        shipmentTypeCode: selectedTypeCode,
        titleFa: templateDraft.titleFa.trim(),
        titleEn: templateDraft.titleEn.trim(),
        description: templateDraft.description.trim(),
      });
      updateTemplateState(updated);
      toast.success("نسخه جدید قالب منتشر شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "انتشار قالب ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const setDefaultForType = async () => {
    if (!selectedTemplate || !selectedTypeCode) return;
    setSavingKey("mapping");
    try {
      const result = await shipmentWorkflowTemplatesApi.setShipmentTypeDefault(selectedTypeCode, selectedTemplate.id);
      updateTemplateState(result.template);
      toast.success("قالب پیش‌فرض نوع محموله ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره قالب پیش‌فرض ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const saveStep = async (step: ShipmentWorkflowTemplateStep, patch: Record<string, unknown>) => {
    if (!selectedTemplate) return;
    setSavingKey(step.id);
    try {
      const updated = await shipmentWorkflowTemplatesApi.updateStep(selectedTemplate.id, step.id, patch);
      updateTemplateState(updated);
      toast.success("مرحله ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره مرحله ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const moveStep = async (step: ShipmentWorkflowTemplateStep, direction: "up" | "down") => {
    if (!selectedTemplate) return;
    const index = orderedSteps.findIndex((item) => item.id === step.id);
    const neighbor = direction === "up" ? orderedSteps[index - 1] : orderedSteps[index + 1];
    if (!neighbor) return;
    setSavingKey(`move-${step.id}`);
    try {
      let updated = await shipmentWorkflowTemplatesApi.updateStep(selectedTemplate.id, step.id, { sortOrder: neighbor.sortOrder });
      updated = await shipmentWorkflowTemplatesApi.updateStep(updated.id, neighbor.id, { sortOrder: step.sortOrder });
      updateTemplateState(updated);
      toast.success("ترتیب مرحله تغییر کرد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر ترتیب مرحله ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const archiveStep = async (step: ShipmentWorkflowTemplateStep) => {
    if (!selectedTemplate || step.isRequired) return;
    const confirmed = window.confirm("این مرحله فقط از قالب آینده آرشیو می‌شود و سابقه محموله‌ها حذف نمی‌شود. ادامه می‌دهید؟");
    if (!confirmed) return;
    setSavingKey(`archive-${step.id}`);
    try {
      const updated = await shipmentWorkflowTemplatesApi.archiveStep(selectedTemplate.id, step.id);
      updateTemplateState(updated);
      toast.success("مرحله آرشیو شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "آرشیو مرحله ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const addStep = async () => {
    if (!selectedTemplate || !newStep.stepKey.trim() || !newStep.labelFa.trim()) return;
    setSavingKey("add-step");
    try {
      const updated = await shipmentWorkflowTemplatesApi.addStep(selectedTemplate.id, {
        phaseId: newStep.phaseId || selectedTemplate.phases[0]?.id,
        stepKey: newStep.stepKey.trim(),
        labelFa: newStep.labelFa.trim(),
        labelEn: newStep.labelEn.trim(),
        publicLabel: newStep.labelFa.trim(),
        sortOrder: stepCount(selectedTemplate) + 1,
        isRequired: false,
        isVisible: true,
        isCustomerVisible: true,
        taskPolicy: { mode: "suggested" },
        expectedDocuments: [],
        expectedFormFields: [],
      });
      updateTemplateState(updated);
      setNewStep({ stepKey: "", labelFa: "", labelEn: "", phaseId: updated.phases[0]?.id || "" });
      toast.success("مرحله اختیاری اضافه شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "افزودن مرحله ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const toggleCatalogStep = (stepId: string, checked: boolean) => {
    setSelectedCatalogStepIds((current) => (
      checked ? [...new Set([...current, stepId])] : current.filter((id) => id !== stepId)
    ));
  };

  const addCatalogStepsToTemplate = async (catalogStepIds: string[]) => {
    if (!selectedTemplate || !catalogStepIds.length) return;
    const duplicateIds = catalogStepIds.filter((id) => selectedTemplateCatalogIds.has(id));
    let allowDuplicates = false;
    if (duplicateIds.length) {
      allowDuplicates = window.confirm("برخی مراحل انتخاب‌شده قبلا در این قالب وجود دارند. دوباره اضافه شوند؟");
      if (!allowDuplicates) return;
    }
    setSavingKey("catalog-add");
    try {
      const updated = await shipmentWorkflowTemplatesApi.addStepsFromCatalog(selectedTemplate.id, {
        catalogStepIds,
        allowDuplicates,
      });
      updateTemplateState(updated);
      setSelectedCatalogStepIds((current) => current.filter((id) => !catalogStepIds.includes(id)));
      toast.success("مراحل انتخاب‌شده از کتابخانه به قالب اضافه شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "افزودن مراحل از کتابخانه ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const archiveTemplate = async () => {
    if (!selectedTemplate || selectedTemplate.isSystem || !selectedTemplate.organizationId) return;
    const confirmed = window.confirm("این قالب از انتخاب‌های عادی حذف می‌شود اما سابقه محموله‌ها حفظ می‌ماند. ادامه می‌دهید؟");
    if (!confirmed) return;
    setSavingKey("archive-template");
    try {
      const updated = await shipmentWorkflowTemplatesApi.archiveTemplate(selectedTemplate.id, {
        reason: "Archived from workflow template admin panel.",
      });
      updateTemplateState(updated);
      toast.success("قالب گردش کار بایگانی شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بایگانی قالب ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const deleteTemplate = async () => {
    if (!selectedTemplate?.canDelete) return;
    const confirmed = window.confirm("این قالب استفاده نشده برای همیشه حذف می‌شود. ادامه می‌دهید؟");
    if (!confirmed) return;
    setSavingKey("delete-template");
    try {
      await shipmentWorkflowTemplatesApi.deleteTemplate(selectedTemplate.id);
      setTemplates((current) => current.filter((template) => template.id !== selectedTemplate.id));
      setSelectedTemplateId("");
      toast.success("قالب استفاده‌نشده حذف شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف قالب ناموفق بود. اگر استفاده شده است، آن را بایگانی کنید.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="app-page max-w-full overflow-x-hidden space-y-4 text-foreground" dir="rtl" data-testid="shipment-workflow-templates-admin-page">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black md:text-2xl">
            <GitBranch className="h-5 w-5 text-primary" />
            قالب گردش کار محموله‌ها
          </h1>
          <p className="mt-1 text-xs font-bold leading-6 text-muted-foreground">
            نسخه V1 کنترل‌شده؛ تغییرات آینده از قالب‌ها ساخته می‌شود و سابقه محموله‌ها با snapshot حفظ می‌شود.
          </p>
        </div>
        <Button type="button" variant="outline" className="h-9 rounded-lg text-xs font-black" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={cn("ml-1 h-4 w-4", loading && "animate-spin")} />
          بارگیری مجدد
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm font-bold text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          در حال بارگیری قالب‌ها
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4">
            <Card className="rounded-lg border-border bg-card">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-black">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  قالب‌ها
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-[11px] font-bold text-muted-foreground">قالب فعال برای ویرایش</Label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-[10px] font-black text-muted-foreground">
                      <Checkbox checked={includeArchivedTemplates} onCheckedChange={(value) => setIncludeArchivedTemplates(Boolean(value))} />
                      بایگانی‌ها
                    </label>
                  </div>
                  <select value={selectedTemplate?.id || ""} onChange={(event) => setSelectedTemplateId(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-xs font-black outline-none focus:ring-2 focus:ring-ring" data-testid="shipment-workflow-template-select">
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.titleFa} - {shipmentTypeLabel(types, template.shipmentTypeHint)} - v{template.version} {template.organizationId ? "" : "(system)"} {template.archivedAt ? "- archived" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedTemplate ? (
                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="truncate text-xs font-black text-foreground">{selectedTemplate.code}</p>
                    <p className="mt-1 truncate text-[11px] font-bold text-muted-foreground">
                      {shipmentTypeLabel(types, selectedTemplate.shipmentTypeHint)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px] font-black">{selectedTemplate.organizationId ? "اختصاصی شرکت" : "سیستمی"}</Badge>
                      {selectedTemplate.archivedAt ? (
                        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] font-black text-amber-700">بایگانی‌شده</Badge>
                      ) : null}
                      <Badge variant="outline" className="text-[10px] font-black">
                        {directionLabels[selectedTemplate.shipmentDirection || ""] || selectedTemplate.shipmentDirection || "بدون جهت"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-black">
                        {transportModeLabels[selectedTemplate.transportMode || ""] || selectedTemplate.transportMode || "بدون روش حمل"}
                      </Badge>
                      <Badge variant="outline" className={cn("text-[10px] font-black", selectedTemplate.isActive ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-muted-foreground/30 text-muted-foreground")}>
                        {selectedTemplate.isActive ? "فعال" : "غیرفعال"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-black">نسخه {selectedTemplate.version}</Badge>
                      <Badge variant="outline" className="text-[10px] font-black">{stepCount(selectedTemplate)} مرحله</Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => void archiveTemplate()} disabled={savingKey === "archive-template" || selectedTemplate.isSystem || !selectedTemplate.organizationId || Boolean(selectedTemplate.archivedAt)}>
                        <Archive className="ml-1 h-3.5 w-3.5" />
                        بایگانی قالب
                      </Button>
                      {selectedTemplate.canDelete ? (
                        <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black text-destructive" onClick={() => void deleteTemplate()} disabled={savingKey === "delete-template"}>
                          <Trash2 className="ml-1 h-3.5 w-3.5" />
                          حذف امن
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black text-muted-foreground" disabled>
                          <Trash2 className="ml-1 h-3.5 w-3.5" />
                          حذف قفل است
                        </Button>
                      )}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-lg border-border bg-card">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-black">اطلاعات قالب</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-muted-foreground">عنوان</Label>
                  <Input value={templateDraft.titleFa} onChange={(event) => setTemplateDraft((current) => ({ ...current, titleFa: event.target.value }))} className="h-9 rounded-lg bg-background text-xs font-bold" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-muted-foreground">English title</Label>
                  <Input value={templateDraft.titleEn} onChange={(event) => setTemplateDraft((current) => ({ ...current, titleEn: event.target.value }))} className="h-9 rounded-lg bg-background text-xs font-bold" dir="ltr" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-muted-foreground">توضیح</Label>
                  <textarea value={templateDraft.description} onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))} className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-bold leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                </div>
                <ToggleBox label="قالب فعال باشد" checked={templateDraft.isActive} onChange={(isActive) => setTemplateDraft((current) => ({ ...current, isActive }))} />
                <div className="grid gap-2">
                  <Button type="button" className="h-9 rounded-lg text-xs font-black" onClick={() => void saveTemplate()} disabled={savingKey === "template" || !selectedTemplate || Boolean(selectedTemplate.archivedAt) || !templateDraft.titleFa.trim()}>
                    {savingKey === "template" ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}
                    ذخیره قالب
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-border bg-card">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-black">پیش‌فرض نوع محموله</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2">
                <select value={selectedTypeCode} onChange={(event) => setSelectedTypeCode(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-xs font-black outline-none focus:ring-2 focus:ring-ring">
                  {types.map((type) => (
                    <option key={type.code} value={type.code}>{type.labelFa}</option>
                  ))}
                </select>
                <Button type="button" variant="outline" className="h-9 w-full rounded-lg text-xs font-black" onClick={() => void setDefaultForType()} disabled={savingKey === "mapping" || !selectedTemplate || Boolean(selectedTemplate.archivedAt)}>
                  <CheckCircle2 className="ml-1 h-4 w-4" />
                  تنظیم به عنوان پیش‌فرض
                </Button>
                <Button type="button" className="h-9 w-full rounded-lg text-xs font-black" onClick={() => void publishTemplate()} disabled={savingKey === "publish" || !selectedTemplate || Boolean(selectedTemplate.archivedAt)}>
                  <GitBranch className="ml-1 h-4 w-4" />
                  انتشار نسخه جدید
                </Button>
              </CardContent>
            </Card>

            {selectedTemplate ? (
              <Card className="rounded-lg border-border bg-card">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm font-black">افزودن مرحله اختیاری</CardTitle>
                    <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => document.getElementById("workflow-step-catalog-library")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                      <Library className="ml-1 h-3.5 w-3.5" />
                      انتخاب از موجود
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 p-4 pt-2">
                  <select value={newStep.phaseId || selectedTemplate.phases[0]?.id || ""} onChange={(event) => setNewStep((current) => ({ ...current, phaseId: event.target.value }))} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-ring">
                    {selectedTemplate.phases.map((phase) => (
                      <option key={phase.id} value={phase.id}>{phase.labelFa}</option>
                    ))}
                  </select>
                  <Input value={newStep.stepKey} onChange={(event) => setNewStep((current) => ({ ...current, stepKey: event.target.value }))} placeholder="CUSTOM_001" className="h-9 rounded-lg bg-background text-xs font-bold" dir="ltr" />
                  <Input value={newStep.labelFa} onChange={(event) => setNewStep((current) => ({ ...current, labelFa: event.target.value }))} placeholder="عنوان مرحله" className="h-9 rounded-lg bg-background text-xs font-bold" />
                  <Input value={newStep.labelEn} onChange={(event) => setNewStep((current) => ({ ...current, labelEn: event.target.value }))} placeholder="English label" className="h-9 rounded-lg bg-background text-xs font-bold" dir="ltr" />
                  <Button type="button" className="h-9 w-full rounded-lg text-xs font-black" onClick={() => void addStep()} disabled={savingKey === "add-step" || Boolean(selectedTemplate.archivedAt) || !newStep.stepKey.trim() || !newStep.labelFa.trim()}>
                    <Plus className="ml-1 h-4 w-4" />
                    افزودن مرحله
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </aside>

          <section className="min-w-0 space-y-4">
            {selectedTemplate ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-bold text-muted-foreground">مراحل فعال</p>
                    <p className="mt-1 text-lg font-black">{orderedSteps.filter((step) => step.isVisible).length}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-bold text-muted-foreground">مراحل عمومی</p>
                    <p className="mt-1 text-lg font-black">{orderedSteps.filter((step) => step.isCustomerVisible).length}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-bold text-muted-foreground">اختیاری</p>
                    <p className="mt-1 text-lg font-black">{orderedSteps.filter((step) => !step.isRequired).length}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-bold text-muted-foreground">نسخه</p>
                    <p className="mt-1 text-lg font-black" dir="ltr">v{selectedTemplate.version}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs font-bold leading-6 text-amber-800 dark:text-amber-300">
                  تغییر قالب، سابقه محموله‌های شروع‌شده را بازنویسی نمی‌کند. هر instance از snapshot خودش استفاده می‌کند.
                </div>

                <Card id="workflow-step-catalog-library" className="rounded-lg border-border bg-card">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <CardTitle className="flex items-center gap-2 text-sm font-black">
                        <Library className="h-4 w-4 text-primary" />
                        کتابخانه مراحل گمرکی
                      </CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => void addCatalogStepsToTemplate(selectedCatalogStepIds)} disabled={savingKey === "catalog-add" || !selectedCatalogStepIds.length || Boolean(selectedTemplate.archivedAt)}>
                          {savingKey === "catalog-add" ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="ml-1 h-3.5 w-3.5" />}
                          افزودن از کتابخانه مراحل
                        </Button>
                        <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => setSelectedCatalogStepIds(visibleCatalogSteps.filter((step) => !step.archivedAt).map((step) => step.id))} disabled={!visibleCatalogSteps.length}>
                          انتخاب نتایج
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 p-4 pt-2">
                    <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px_150px]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="جستجوی مرحله، کد یا بخش" className="h-9 rounded-lg bg-background pr-9 text-xs font-bold" />
                      </div>
                      <select value={catalogStage} onChange={(event) => setCatalogStage(event.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-ring">
                        <option value="">همه بخش‌ها</option>
                        {catalogStageOptions.map((stage) => (
                          <option key={stage.key} value={stage.key}>{stage.label}</option>
                        ))}
                      </select>
                      <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-[11px] font-black text-muted-foreground">
                        <Checkbox checked={includeArchivedCatalog} onCheckedChange={(value) => setIncludeArchivedCatalog(Boolean(value))} />
                        بایگانی‌شده‌ها
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] font-black">{visibleCatalogSteps.length} مرحله</Badge>
                      <Badge variant="outline" className="text-[10px] font-black">{selectedCatalogStepIds.length} انتخاب‌شده</Badge>
                      <Badge variant="outline" className="text-[10px] font-black">۶۴ مرحله سیستمی گمرکی</Badge>
                    </div>

                    <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-lg border border-border bg-background p-2" data-testid="shipment-workflow-step-catalog">
                      {visibleCatalogSteps.length ? visibleCatalogSteps.map((step) => {
                        const inTemplate = selectedTemplateCatalogIds.has(step.id);
                        const checked = selectedCatalogStepIds.includes(step.id);
                        return (
                          <div key={step.id} className="grid gap-2 rounded-lg border border-border bg-card p-3 lg:grid-cols-[28px_minmax(0,1fr)_auto] lg:items-center">
                            <Checkbox checked={checked} onCheckedChange={(value) => toggleCatalogStep(step.id, Boolean(value))} disabled={Boolean(step.archivedAt) || Boolean(selectedTemplate.archivedAt)} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className="text-[10px] font-black" dir="ltr">{step.code}</Badge>
                                <Badge variant="outline" className="text-[10px] font-black">{step.stageTitleFa || catalogStageLabels[step.stageKey] || step.stageKey}</Badge>
                                {step.isSystem ? <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 text-[10px] font-black text-sky-700">سیستمی</Badge> : null}
                                {step.archivedAt ? <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] font-black text-amber-700">بایگانی‌شده</Badge> : null}
                                {inTemplate ? <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] font-black text-emerald-700">در قالب</Badge> : null}
                              </div>
                              <p className="mt-1 text-xs font-black text-foreground">{step.titleFa}</p>
                              <p className="mt-0.5 text-[11px] font-bold text-muted-foreground" dir="ltr">{step.title}</p>
                            </div>
                            <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => void addCatalogStepsToTemplate([step.id])} disabled={savingKey === "catalog-add" || Boolean(step.archivedAt) || Boolean(selectedTemplate.archivedAt)}>
                              <Plus className="ml-1 h-3.5 w-3.5" />
                              افزودن به قالب
                            </Button>
                          </div>
                        );
                      }) : (
                        <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs font-bold text-muted-foreground">
                          مرحله‌ای مطابق جستجو پیدا نشد.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-3" data-testid="shipment-workflow-template-steps">
                  {selectedTemplate.phases.map((phase) => {
                    const fields = [...phase.steps].sort((a, b) => a.sortOrder - b.sortOrder);
                    return (
                      <details key={phase.id} open className="group rounded-lg border border-border bg-card">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-black">{phase.labelFa}</span>
                            <span className="truncate text-[11px] font-bold text-muted-foreground" dir="ltr">{phase.phaseKey}</span>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px] font-black">{fields.length} مرحله</Badge>
                        </summary>
                        <div className="space-y-3 border-t border-border p-3">
                          {fields.length ? fields.map((step) => {
                            const globalIndex = orderedSteps.findIndex((item) => item.id === step.id);
                            return (
                              <StepEditor
                                key={step.id}
                                step={step}
                                phase={phase}
                                canMoveUp={globalIndex > 0}
                                canMoveDown={globalIndex >= 0 && globalIndex < orderedSteps.length - 1}
                                saving={Boolean(savingKey) || Boolean(selectedTemplate.archivedAt)}
                                onSave={saveStep}
                                onMove={moveStep}
                                onArchive={archiveStep}
                              />
                            );
                          }) : (
                            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs font-bold text-muted-foreground">
                              هنوز مرحله‌ای در این بخش نیست.
                            </div>
                          )}
                        </div>
                      </details>
                    );
                  })}
                </div>

                <Card className="rounded-lg border-border bg-card">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-black">
                      <Eye className="h-4 w-4 text-primary" />
                      پیش‌نمایش عمومی
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 p-4 pt-2 md:grid-cols-2">
                    {orderedSteps.filter((step) => step.isVisible).slice(0, 20).map((step) => (
                      <div key={step.id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                        <span className="truncate text-xs font-bold">{step.publicLabel || step.labelFa}</span>
                        {step.isCustomerVisible ? <Eye className="h-3.5 w-3.5 shrink-0 text-primary" /> : <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm font-bold text-muted-foreground">
                قالبی برای نمایش وجود ندارد.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
