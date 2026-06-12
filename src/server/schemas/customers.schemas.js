import { z } from "../validation.js";

const blankToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalTrimmedText = (max = 180) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max).optional()
  );

const blankToNull = (value) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const normalizeLocalizedNumberInput = (value) => {
  const normalizedValue = blankToNull(value);
  if (normalizedValue === undefined || normalizedValue === null) return normalizedValue;
  if (typeof normalizedValue === "number") return normalizedValue;
  const persianDigits = "\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9";
  const arabicDigits = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669";
  return String(normalizedValue)
    .replace(/[\u06f0-\u06f9\u0660-\u0669]/g, (digit) => {
      const persianIndex = persianDigits.indexOf(digit);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = arabicDigits.indexOf(digit);
      return arabicIndex >= 0 ? String(arabicIndex) : digit;
    })
    .replace(/[\u066c,]/g, "")
    .replace(/\u066b/g, ".")
    .trim();
};

const optionalNonNegativeNumber = z.preprocess((value) => {
  const normalizedValue = normalizeLocalizedNumberInput(value);
  if (normalizedValue === "" || normalizedValue === undefined || normalizedValue === null) return undefined;
  const numberValue = Number(normalizedValue);
  return Number.isFinite(numberValue) ? numberValue : value;
}, z.number().min(0).optional());

const requiredId = z.string().trim().min(1, "Identifier is required.").max(128);

const customerPhoneNumberMutationSchema = z.object({
  id: optionalTrimmedText(120),
  phoneNumber: z.string().trim().min(1, "Phone number is required.").max(80),
  phoneLabel: optionalTrimmedText(120),
  note: optionalTrimmedText(500),
  isPrimary: z.boolean().optional(),
  sortOrder: optionalNonNegativeNumber,
}).strict();

const customerMutationBaseSchema = z.object({
  customerCode: optionalTrimmedText(80),
  code: optionalTrimmedText(80),
  name: optionalTrimmedText(180),
  contactName: optionalTrimmedText(180),
  company: optionalTrimmedText(180),
  companyName: optionalTrimmedText(180),
  email: optionalTrimmedText(254),
  phone: optionalTrimmedText(80),
  phoneNumbers: z.array(customerPhoneNumberMutationSchema).max(20).optional(),
  address: optionalTrimmedText(500),
  referrer: optionalTrimmedText(180),
  notes: optionalTrimmedText(2000),
  status: optionalTrimmedText(40),
}).passthrough();

export const customerParamsSchema = z.object({
  id: requiredId,
});

export const customerRelatedParamsSchema = customerParamsSchema.extend({
  related: z.enum(["shipments", "documents", "quotations", "cheques"]),
});

export const customerCreateBodySchema = customerMutationBaseSchema.refine(
  (value) => value.name || value.contactName || value.company || value.companyName,
  {
    message: "Customer name or company is required.",
    path: ["name"],
  }
);

export const customerUpdateBodySchema = customerMutationBaseSchema;
