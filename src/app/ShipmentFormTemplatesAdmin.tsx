import React from "react";
import {
  ChevronDown,
  ClipboardList,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Star,
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
  shipmentFormTemplatesApi,
  type CanonicalShipmentFormField,
  type ShipmentFormTemplate,
  type ShipmentFormTemplateField,
  type ShipmentFormTemplateSection,
  type ShipmentTypeOption,
} from "@/src/lib/shipmentFormTemplatesApi";

const CUSTOM_FIELD_TYPES = [
  { value: "text", label: "متن کوتاه" },
  { value: "textarea", label: "متن بلند" },
  { value: "number", label: "عدد" },
  { value: "date", label: "تاریخ" },
  { value: "select", label: "لیست انتخابی" },
] as const;

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "متن",
  textarea: "متن بلند",
  number: "عدد",
  date: "تاریخ",
  select: "انتخابی",
  commercialCard: "کارت بازرگانی",
  readonly: "خودکار",
};

type CustomDraft = {
  fieldKey: string;
  labelFa: string;
  fieldType: (typeof CUSTOM_FIELD_TYPES)[number]["value"];
  optionsText: string;
};

function fieldCount(template: ShipmentFormTemplate | null) {
  return template?.sections.reduce((sum, section) => sum + section.fields.length, 0) || 0;
}

function parseSelectOptions(text: string) {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value, ...labelParts] = line.split("|");
      const cleanValue = value.trim();
      return {
        value: cleanValue,
        label: (labelParts.join("|").trim() || cleanValue).trim(),
      };
    });
}

function replaceTemplate(templates: ShipmentFormTemplate[], updated: ShipmentFormTemplate) {
  return [
    updated,
    ...templates.filter((template) => template.shipmentTypeCode !== updated.shipmentTypeCode),
  ];
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

function FieldEditor({
  field,
  section,
  canMoveUp,
  canMoveDown,
  saving,
  onSave,
  onMove,
  onArchive,
}: {
  field: ShipmentFormTemplateField;
  section: ShipmentFormTemplateSection;
  canMoveUp: boolean;
  canMoveDown: boolean;
  saving: boolean;
  onSave: (field: ShipmentFormTemplateField, patch: Record<string, unknown>) => Promise<void>;
  onMove: (field: ShipmentFormTemplateField, direction: "up" | "down") => Promise<void>;
  onArchive: (field: ShipmentFormTemplateField) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState({
    labelFa: field.labelFa,
    helperText: field.helperText || "",
    sortOrder: field.sortOrder,
    isVisible: field.isVisible,
    isRequired: field.isRequired,
    isImportant: field.isImportant,
    showInShipmentDetail: field.showInShipmentDetail,
    showInDailyStatus: field.showInDailyStatus,
    showInCreateForm: field.showInCreateForm,
  });

  React.useEffect(() => {
    setDraft({
      labelFa: field.labelFa,
      helperText: field.helperText || "",
      sortOrder: field.sortOrder,
      isVisible: field.isVisible,
      isRequired: field.isRequired,
      isImportant: field.isImportant,
      showInShipmentDetail: field.showInShipmentDetail,
      showInDailyStatus: field.showInDailyStatus,
      showInCreateForm: field.showInCreateForm,
    });
  }, [field]);

  const hasChanges =
    draft.labelFa !== field.labelFa ||
    draft.helperText !== (field.helperText || "") ||
    Number(draft.sortOrder) !== Number(field.sortOrder) ||
    draft.isVisible !== field.isVisible ||
    draft.isRequired !== field.isRequired ||
    draft.isImportant !== field.isImportant ||
    draft.showInShipmentDetail !== field.showInShipmentDetail ||
    draft.showInDailyStatus !== field.showInDailyStatus ||
    draft.showInCreateForm !== field.showInCreateForm;

  return (
    <div className="rounded-lg border border-border bg-background p-3" data-testid={`shipment-form-field-${field.fieldKey}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-black">{FIELD_TYPE_LABELS[field.fieldType] || field.fieldType}</Badge>
            <Badge variant="outline" className="text-[10px] font-black">{field.fieldSource === "canonical" ? "فیلد اصلی" : "فیلد اختصاصی"}</Badge>
            <Badge variant="outline" className="text-[10px] font-black">{section.titleFa}</Badge>
            {!field.isVisible ? <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] font-black text-amber-700">مخفی</Badge> : null}
            {field.isImportant ? <Badge variant="outline" className="border-primary/30 bg-primary/10 text-[10px] font-black text-primary">مهم</Badge> : null}
          </div>
          <p className="mt-2 truncate text-xs font-black text-foreground" dir="ltr">{field.fieldKey}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => onMove(field, "up")} disabled={saving || !canMoveUp}>
            بالا
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black" onClick={() => onMove(field, "down")} disabled={saving || !canMoveDown}>
            پایین
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg text-[11px] font-black text-destructive" onClick={() => void onArchive(field)} disabled={saving}>
            <Trash2 className="ml-1 h-3.5 w-3.5" />
            حذف از فرم
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_110px]">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">عنوان نمایشی</Label>
          <Input
            value={draft.labelFa}
            onChange={(event) => setDraft((current) => ({ ...current, labelFa: event.target.value }))}
            className="h-9 rounded-lg bg-card text-xs font-bold"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-bold text-muted-foreground">ترتیب</Label>
          <Input
            type="number"
            min={0}
            value={draft.sortOrder}
            onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) || 0 }))}
            className="h-9 rounded-lg bg-card text-xs font-bold"
            dir="ltr"
          />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <Label className="text-[11px] font-bold text-muted-foreground">راهنمای فیلد</Label>
        <Input
          value={draft.helperText}
          onChange={(event) => setDraft((current) => ({ ...current, helperText: event.target.value }))}
          className="h-9 rounded-lg bg-card text-xs font-bold"
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <ToggleBox label="نمایش داده شود" checked={draft.isVisible} onChange={(isVisible) => setDraft((current) => ({ ...current, isVisible }))} />
        <ToggleBox label="اجباری" checked={draft.isRequired} onChange={(isRequired) => setDraft((current) => ({ ...current, isRequired }))} />
        <ToggleBox label="مهم" checked={draft.isImportant} onChange={(isImportant) => setDraft((current) => ({ ...current, isImportant }))} />
        <ToggleBox label="جزئیات محموله" checked={draft.showInShipmentDetail} onChange={(showInShipmentDetail) => setDraft((current) => ({ ...current, showInShipmentDetail }))} />
        <ToggleBox label="وضعیت روزانه" checked={draft.showInDailyStatus} onChange={(showInDailyStatus) => setDraft((current) => ({ ...current, showInDailyStatus }))} />
        <ToggleBox label="فرم ثبت محموله" checked={draft.showInCreateForm} onChange={(showInCreateForm) => setDraft((current) => ({ ...current, showInCreateForm }))} />
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg text-[11px] font-black"
          onClick={() => onSave(field, draft)}
          disabled={saving || !hasChanges || !draft.labelFa.trim()}
        >
          {saving ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : <Save className="ml-1 h-3.5 w-3.5" />}
          ذخیره فیلد
        </Button>
      </div>
    </div>
  );
}

export default function ShipmentFormTemplatesAdmin() {
  const [types, setTypes] = React.useState<ShipmentTypeOption[]>([]);
  const [templates, setTemplates] = React.useState<ShipmentFormTemplate[]>([]);
  const [canonicalFields, setCanonicalFields] = React.useState<CanonicalShipmentFormField[]>([]);
  const [selectedTypeCode, setSelectedTypeCode] = React.useState("IMPORT_SEA_CONTAINER");
  const [loading, setLoading] = React.useState(true);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = React.useState({ titleFa: "", description: "", isActive: true });
  const [canonicalDraft, setCanonicalDraft] = React.useState({ fieldKey: "", sectionId: "" });
  const [customDraft, setCustomDraft] = React.useState<CustomDraft>({
    fieldKey: "",
    labelFa: "",
    fieldType: "text",
    optionsText: "",
  });

  const selectedType = React.useMemo(
    () => types.find((item) => item.code === selectedTypeCode) || types[0] || null,
    [selectedTypeCode, types]
  );
  const activeTemplate = React.useMemo(
    () => templates.find((template) => template.shipmentTypeCode === selectedTypeCode) || null,
    [selectedTypeCode, templates]
  );
  const firstSection = activeTemplate?.sections[0] || null;

  React.useEffect(() => {
    if (!types.length) return;
    if (!types.some((type) => type.code === selectedTypeCode)) setSelectedTypeCode(types[0].code);
  }, [selectedTypeCode, types]);

  React.useEffect(() => {
    if (!activeTemplate) {
      setTemplateDraft({ titleFa: "", description: "", isActive: true });
      return;
    }
    setTemplateDraft({
      titleFa: activeTemplate.titleFa,
      description: activeTemplate.description || "",
      isActive: activeTemplate.isActive,
    });
    const sectionId = activeTemplate.sections[0]?.id || "";
    setCanonicalDraft((current) => ({ ...current, sectionId }));
  }, [activeTemplate]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [loadedTypes, loadedTemplates, loadedCanonical] = await Promise.all([
        shipmentFormTemplatesApi.listTypes(),
        shipmentFormTemplatesApi.list(),
        shipmentFormTemplatesApi.listCanonicalFields(),
      ]);
      setTypes(loadedTypes);
      setTemplates(loadedTemplates);
      setCanonicalFields(loadedCanonical);
      if (loadedTypes.length && !loadedTypes.some((type) => type.code === selectedTypeCode)) {
        setSelectedTypeCode(loadedTypes[0].code);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بارگیری قالب‌های فرم ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [selectedTypeCode]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateTemplateState = (updated: ShipmentFormTemplate) => {
    setTemplates((current) => replaceTemplate(current, updated));
    setSelectedTypeCode(updated.shipmentTypeCode);
  };

  const saveTemplate = async () => {
    if (!activeTemplate || !templateDraft.titleFa.trim()) return;
    setSavingKey("template");
    try {
      const updated = await shipmentFormTemplatesApi.update(activeTemplate.id, {
        titleFa: templateDraft.titleFa.trim(),
        description: templateDraft.description.trim(),
        isActive: templateDraft.isActive,
      });
      updateTemplateState(updated);
      toast.success("قالب فرم ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره قالب فرم ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const createTemplate = async () => {
    if (!selectedType) return;
    setSavingKey("template-create");
    try {
      const updated = await shipmentFormTemplatesApi.create({
        shipmentTypeCode: selectedType.code,
        titleFa: selectedType.labelFa,
        description: selectedType.description || "",
        isActive: true,
      });
      updateTemplateState(updated);
      toast.success("قالب اختصاصی ساخته شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ساخت قالب اختصاصی ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const saveField = async (field: ShipmentFormTemplateField, patch: Record<string, unknown>) => {
    if (!activeTemplate) return;
    setSavingKey(field.id);
    try {
      const updated = await shipmentFormTemplatesApi.updateField(activeTemplate.id, field.id, patch);
      updateTemplateState(updated);
      toast.success("فیلد فرم ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره فیلد فرم ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const moveField = async (field: ShipmentFormTemplateField, direction: "up" | "down") => {
    if (!activeTemplate) return;
    const ordered = activeTemplate.sections.flatMap((section) => section.fields).sort((a, b) => a.sortOrder - b.sortOrder);
    const index = ordered.findIndex((item) => item.id === field.id);
    const neighbor = direction === "up" ? ordered[index - 1] : ordered[index + 1];
    if (!neighbor) return;
    setSavingKey(`move-${field.id}`);
    try {
      let updated = await shipmentFormTemplatesApi.updateField(activeTemplate.id, field.id, { sortOrder: neighbor.sortOrder });
      updated = await shipmentFormTemplatesApi.updateField(updated.id, neighbor.id, { sortOrder: field.sortOrder });
      updateTemplateState(updated);
      toast.success("ترتیب فیلد تغییر کرد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر ترتیب فیلد ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const archiveField = async (field: ShipmentFormTemplateField) => {
    if (!activeTemplate) return;
    const confirmed = window.confirm("این فیلد فقط از فرم حذف می‌شود و داده‌های قبلی محموله‌ها پاک نمی‌شود. ادامه می‌دهید؟");
    if (!confirmed) return;
    setSavingKey(`archive-${field.id}`);
    try {
      const updated = await shipmentFormTemplatesApi.archiveField(activeTemplate.id, field.id);
      updateTemplateState(updated);
      toast.success("فیلد از قالب فرم حذف شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف فیلد از قالب ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const addCanonicalField = async () => {
    if (!activeTemplate || !canonicalDraft.fieldKey) return;
    const canonical = canonicalFields.find((field) => field.key === canonicalDraft.fieldKey);
    if (!canonical) return;
    setSavingKey("add-canonical");
    try {
      const updated = await shipmentFormTemplatesApi.addField(activeTemplate.id, {
        sectionId: canonicalDraft.sectionId || firstSection?.id,
        fieldKey: canonical.key,
        fieldSource: "canonical",
        labelFa: canonical.labelFa,
        fieldType: canonical.fieldType,
        isVisible: true,
        showInShipmentDetail: true,
        showInDailyStatus: true,
        showInCreateForm: false,
        sortOrder: fieldCount(activeTemplate) + 1,
      });
      updateTemplateState(updated);
      setCanonicalDraft((current) => ({ ...current, fieldKey: "" }));
      toast.success("فیلد اصلی به قالب اضافه شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "افزودن فیلد اصلی ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const addCustomField = async () => {
    if (!activeTemplate || !customDraft.fieldKey.trim() || !customDraft.labelFa.trim()) return;
    const optionsJson = customDraft.fieldType === "select" ? parseSelectOptions(customDraft.optionsText) : [];
    if (customDraft.fieldType === "select" && optionsJson.length === 0) {
      toast.error("برای فیلد انتخابی حداقل یک گزینه وارد کنید.");
      return;
    }
    setSavingKey("add-custom");
    try {
      const updated = await shipmentFormTemplatesApi.addField(activeTemplate.id, {
        sectionId: canonicalDraft.sectionId || firstSection?.id,
        fieldKey: customDraft.fieldKey.trim(),
        fieldSource: "custom",
        fieldType: customDraft.fieldType,
        labelFa: customDraft.labelFa.trim(),
        optionsJson,
        validationJson: {},
        isVisible: true,
        isRequired: false,
        isImportant: false,
        showInShipmentDetail: true,
        showInDailyStatus: true,
        showInCreateForm: false,
        sortOrder: fieldCount(activeTemplate) + 1,
      });
      updateTemplateState(updated);
      setCustomDraft({ fieldKey: "", labelFa: "", fieldType: "text", optionsText: "" });
      toast.success("فیلد اختصاصی اضافه شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "افزودن فیلد اختصاصی ناموفق بود.");
    } finally {
      setSavingKey(null);
    }
  };

  const unusedCanonicalFields = React.useMemo(() => {
    const used = new Set(activeTemplate?.sections.flatMap((section) => section.fields.map((field) => field.fieldKey)) || []);
    return canonicalFields.filter((field) => !used.has(field.key));
  }, [activeTemplate, canonicalFields]);

  const orderedFields = React.useMemo(
    () => activeTemplate?.sections.flatMap((section) => section.fields).sort((a, b) => a.sortOrder - b.sortOrder) || [],
    [activeTemplate]
  );

  return (
    <div className="app-page max-w-full overflow-x-hidden space-y-4 text-foreground" dir="rtl" data-testid="shipment-form-templates-admin-page">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Settings2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black tracking-normal">مدیریت فرم‌های نوع محموله</h1>
              <p className="mt-1 text-xs font-bold text-muted-foreground">قالب‌های قابل کنترل برای جزئیات محموله و وضعیت روزانه</p>
            </div>
          </div>
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
                  نوع محموله
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-4 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-muted-foreground">انتخاب قالب</Label>
                  <select
                    value={selectedTypeCode}
                    onChange={(event) => setSelectedTypeCode(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-xs font-black outline-none focus:ring-2 focus:ring-ring"
                    data-testid="shipment-form-template-type-select"
                  >
                    {types.map((type) => (
                      <option key={type.code} value={type.code}>{type.labelFa}</option>
                    ))}
                  </select>
                </div>
                {selectedType ? (
                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs font-black text-foreground">{selectedType.labelFa}</p>
                    <p className="mt-1 text-[11px] font-bold leading-5 text-muted-foreground">{selectedType.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px] font-black">{selectedType.direction}</Badge>
                      <Badge variant="outline" className="text-[10px] font-black">{selectedType.transportMode}</Badge>
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
                {activeTemplate ? (
                  <>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px] font-black">{activeTemplate.organizationId ? "اختصاصی شرکت" : "قالب سیستمی"}</Badge>
                      <Badge variant="outline" className="text-[10px] font-black">نسخه {activeTemplate.version}</Badge>
                      <Badge variant="outline" className="text-[10px] font-black">{fieldCount(activeTemplate)} فیلد</Badge>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-muted-foreground">عنوان قالب</Label>
                      <Input
                        value={templateDraft.titleFa}
                        onChange={(event) => setTemplateDraft((current) => ({ ...current, titleFa: event.target.value }))}
                        className="h-9 rounded-lg bg-background text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-muted-foreground">توضیح</Label>
                      <textarea
                        value={templateDraft.description}
                        onChange={(event) => setTemplateDraft((current) => ({ ...current, description: event.target.value }))}
                        className="min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs font-bold leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </div>
                    <ToggleBox label="قالب فعال باشد" checked={templateDraft.isActive} onChange={(isActive) => setTemplateDraft((current) => ({ ...current, isActive }))} />
                    <Button type="button" className="h-9 w-full rounded-lg text-xs font-black" onClick={() => void saveTemplate()} disabled={savingKey === "template" || !templateDraft.titleFa.trim()}>
                      {savingKey === "template" ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Save className="ml-1 h-4 w-4" />}
                      ذخیره قالب
                    </Button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-bold leading-6 text-muted-foreground">برای این نوع محموله هنوز قالبی در دسترس نیست.</p>
                    <Button type="button" className="h-9 w-full rounded-lg text-xs font-black" onClick={() => void createTemplate()} disabled={savingKey === "template-create"}>
                      <Plus className="ml-1 h-4 w-4" />
                      ساخت قالب
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {activeTemplate ? (
              <Card className="rounded-lg border-border bg-card">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-black">افزودن فیلد</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-4 pt-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-muted-foreground">بخش مقصد</Label>
                    <select
                      value={canonicalDraft.sectionId || firstSection?.id || ""}
                      onChange={(event) => setCanonicalDraft((current) => ({ ...current, sectionId: event.target.value }))}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-ring"
                    >
                      {activeTemplate.sections.map((section) => (
                        <option key={section.id} value={section.id}>{section.titleFa}</option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="mb-2 text-xs font-black text-foreground">فیلد اصلی موجود</p>
                    <select
                      value={canonicalDraft.fieldKey}
                      onChange={(event) => setCanonicalDraft((current) => ({ ...current, fieldKey: event.target.value }))}
                      className="h-9 w-full rounded-lg border border-input bg-card px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">انتخاب فیلد...</option>
                      {unusedCanonicalFields.map((field) => (
                        <option key={field.key} value={field.key}>{field.labelFa} ({field.key})</option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" className="mt-2 h-8 w-full rounded-lg text-[11px] font-black" onClick={() => void addCanonicalField()} disabled={savingKey === "add-canonical" || !canonicalDraft.fieldKey}>
                      <Plus className="ml-1 h-3.5 w-3.5" />
                      افزودن فیلد اصلی
                    </Button>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="mb-2 text-xs font-black text-foreground">فیلد اختصاصی جدید</p>
                    <div className="grid gap-2">
                      <Input
                        value={customDraft.fieldKey}
                        onChange={(event) => setCustomDraft((current) => ({ ...current, fieldKey: event.target.value }))}
                        placeholder="customClearanceNote"
                        className="h-9 rounded-lg bg-card text-xs font-bold"
                        dir="ltr"
                      />
                      <Input
                        value={customDraft.labelFa}
                        onChange={(event) => setCustomDraft((current) => ({ ...current, labelFa: event.target.value }))}
                        placeholder="عنوان فارسی فیلد"
                        className="h-9 rounded-lg bg-card text-xs font-bold"
                      />
                      <select
                        value={customDraft.fieldType}
                        onChange={(event) => setCustomDraft((current) => ({ ...current, fieldType: event.target.value as CustomDraft["fieldType"] }))}
                        className="h-9 w-full rounded-lg border border-input bg-card px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-ring"
                      >
                        {CUSTOM_FIELD_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>{type.label}</option>
                        ))}
                      </select>
                      {customDraft.fieldType === "select" ? (
                        <textarea
                          value={customDraft.optionsText}
                          onChange={(event) => setCustomDraft((current) => ({ ...current, optionsText: event.target.value }))}
                          placeholder={"pending|در انتظار\ncompleted|تکمیل شده"}
                          className="min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-xs font-bold leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          dir="ltr"
                        />
                      ) : null}
                    </div>
                    <Button type="button" className="mt-2 h-8 w-full rounded-lg text-[11px] font-black" onClick={() => void addCustomField()} disabled={savingKey === "add-custom" || !customDraft.fieldKey.trim() || !customDraft.labelFa.trim()}>
                      <Plus className="ml-1 h-3.5 w-3.5" />
                      افزودن فیلد اختصاصی
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </aside>

          <section className="min-w-0 space-y-4">
            {activeTemplate ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-bold text-muted-foreground">فیلدهای فعال</p>
                    <p className="mt-1 text-lg font-black">{orderedFields.filter((field) => field.isVisible).length}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-bold text-muted-foreground">فیلدهای مهم</p>
                    <p className="mt-1 text-lg font-black">{orderedFields.filter((field) => field.isImportant).length}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-bold text-muted-foreground">جزئیات محموله</p>
                    <p className="mt-1 text-lg font-black">{orderedFields.filter((field) => field.showInShipmentDetail).length}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <p className="text-[11px] font-bold text-muted-foreground">وضعیت روزانه</p>
                    <p className="mt-1 text-lg font-black">{orderedFields.filter((field) => field.showInDailyStatus).length}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs font-bold leading-6 text-amber-800 dark:text-amber-300">
                  حذف فیلد از قالب، داده‌های قبلی ذخیره‌شده روی محموله‌ها را پاک نمی‌کند. برای پنهان‌سازی موقت، گزینه «نمایش داده شود» را خاموش کنید.
                </div>

                <div className="space-y-3" data-testid="shipment-form-template-fields">
                  {activeTemplate.sections.map((section) => {
                    const fields = [...section.fields].sort((a, b) => a.sortOrder - b.sortOrder);
                    return (
                      <details key={section.id} open={!section.isCollapsedByDefault} className="group rounded-lg border border-border bg-card">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
                            <span className="truncate text-sm font-black">{section.titleFa}</span>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px] font-black">{fields.length} فیلد</Badge>
                        </summary>
                        <div className="space-y-3 border-t border-border p-3">
                          {fields.length ? fields.map((field) => {
                            const globalIndex = orderedFields.findIndex((item) => item.id === field.id);
                            return (
                              <React.Fragment key={field.id}>
                                <FieldEditor
                                  field={field}
                                  section={section}
                                  canMoveUp={globalIndex > 0}
                                  canMoveDown={globalIndex >= 0 && globalIndex < orderedFields.length - 1}
                                  saving={Boolean(savingKey)}
                                  onSave={saveField}
                                  onMove={moveField}
                                  onArchive={archiveField}
                                />
                              </React.Fragment>
                            );
                          }) : (
                            <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs font-bold text-muted-foreground">
                              هنوز فیلدی در این بخش نیست.
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
                      پیش‌نمایش سطح نمایش
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 p-4 pt-2 md:grid-cols-3">
                    <PreviewColumn title="جزئیات محموله" fields={orderedFields.filter((field) => field.isVisible && field.showInShipmentDetail)} />
                    <PreviewColumn title="وضعیت روزانه" fields={orderedFields.filter((field) => field.isVisible && field.showInDailyStatus)} />
                    <PreviewColumn title="ثبت محموله" fields={orderedFields.filter((field) => field.isVisible && field.showInCreateForm)} />
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm font-bold text-muted-foreground">
                یک نوع محموله را انتخاب کنید یا قالب جدید بسازید.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function PreviewColumn({ title, fields }: { title: string; fields: ShipmentFormTemplateField[] }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3">
      <p className="mb-2 text-xs font-black text-foreground">{title}</p>
      <div className="space-y-1.5">
        {fields.length ? fields.slice(0, 12).map((field) => (
          <div key={field.id} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-card px-2 py-1.5">
            <span className="truncate text-[11px] font-bold">{field.labelFa}</span>
            {field.isImportant ? <Star className="h-3.5 w-3.5 shrink-0 text-primary" /> : field.isVisible ? <Eye className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          </div>
        )) : (
          <div className="rounded-md border border-dashed border-border p-3 text-center text-[11px] font-bold text-muted-foreground">
            فیلدی فعال نیست.
          </div>
        )}
        {fields.length > 12 ? (
          <div className="rounded-md bg-muted px-2 py-1 text-center text-[11px] font-black text-muted-foreground">
            +{fields.length - 12} فیلد دیگر
          </div>
        ) : null}
      </div>
    </div>
  );
}
