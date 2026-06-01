import type { Shipment, ShipmentStep } from "@/src/types";

export type DefaultShipmentStep = {
  id?: string;
  name: string;
  order: number;
};

export const DEFAULT_SHIPMENT_STEP_NAMES = [
  "ثبت سفارش در سامانه جامع تجارت",
  "دریافت مجوزهای لازم از سازمان‌های مربوطه",
  "عقد قرارداد حمل‌ونقل بین‌المللی",
  "رزرو وسیله حمل",
  "بارگیری کالا در مبدأ",
  "ارسال اسناد حمل به واردکننده",
  "اظهار کالا در سامانه گمرکی",
  "ارائه و بررسی اسناد توسط کارشناس گمرک",
  "ارزیابی و بازرسی فیزیکی کالا (در صورت نیاز)",
  "پرداخت حقوق و عوارض گمرکی",
  "دریافت پروانه سبز گمرکی",
  "هماهنگی و انجام حمل داخلی",
  "خروج کالا از گمرک و تحویل در مقصد",
];

export function canonicalDefaultShipmentSteps(defaultSteps: DefaultShipmentStep[] = []) {
  const usable = defaultSteps
    .filter((step) => step?.name)
    .map((step, index) => ({
      name: String(step.name),
      order: Number.isFinite(Number(step.order)) ? Number(step.order) : index,
    }))
    .sort((a, b) => a.order - b.order);

  return usable.length
    ? usable
    : DEFAULT_SHIPMENT_STEP_NAMES.map((name, order) => ({ name, order }));
}

export function buildShipmentWorkflowSteps(
  shipmentId: string,
  defaultSteps: DefaultShipmentStep[] = [],
  options: { initialStatus?: ShipmentStep["status"]; completedThrough?: number } = {}
): ShipmentStep[] {
  const completedThrough = Number.isFinite(Number(options.completedThrough))
    ? Number(options.completedThrough)
    : -1;
  return canonicalDefaultShipmentSteps(defaultSteps).map((step, index) => ({
    id: `step-${shipmentId}-${index}`,
    shipmentId,
    name: step.name,
    order: index,
    status:
      index <= completedThrough
        ? "COMPLETED"
        : index === 0
          ? options.initialStatus || "IN_PROGRESS"
          : "PENDING",
  }));
}

export function ensureShipmentWorkflowSteps(
  shipments: Shipment[] = [],
  shipmentSteps: ShipmentStep[] = [],
  defaultSteps: DefaultShipmentStep[] = []
) {
  const existingIds = new Set(shipmentSteps.map((step) => step.shipmentId));
  const repaired = [...shipmentSteps];
  let repairedCount = 0;

  for (const shipment of shipments) {
    if (!shipment?.id || existingIds.has(shipment.id)) continue;
    repaired.push(...buildShipmentWorkflowSteps(shipment.id, defaultSteps));
    existingIds.add(shipment.id);
    repairedCount += 1;
  }

  return { shipmentSteps: repaired, repairedCount };
}

export function getShipmentProgress(
  shipment: Pick<Shipment, "status"> | null | undefined,
  shipmentSteps: Pick<ShipmentStep, "status">[] = []
) {
  const totalSteps = shipmentSteps.length;
  const completedSteps = shipmentSteps.filter((step) => step.status === "COMPLETED").length;
  let value = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  if (shipment?.status === "DELIVERED" || shipment?.status === "CLOSED") value = 100;
  else if (shipment?.status === "CLEARED" && value < 80) value = 85;
  else if (shipment?.status === "ARRIVED" && value < 50) value = 60;

  const percent = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
  return {
    totalSteps,
    completedSteps,
    percent,
    value: percent,
    isMissingSteps: totalSteps === 0,
  };
}
