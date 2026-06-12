import { apiDelete, apiGet, apiPatch, apiPost } from "@/src/lib/api";
import type { BusinessEntityContact, BusinessEntityContactType, MalvaniProfile } from "@/src/types";

export type MalvaniProfileInput = {
  displayName: string;
  captainName: string;
  lenjName: string;
  lenjRegistrationNumber: string;
  lenjType?: string | null;
  homePort?: string | null;
  activeStatus?: MalvaniProfile["activeStatus"];
  note?: string;
};

export type BusinessEntityContactInput = {
  entityType: BusinessEntityContactType;
  entityId: string;
  contactName: string;
  roleTitle: string;
  phoneNumber: string;
  phoneLabel?: string | null;
  note?: string | null;
  isPrimary?: boolean;
  sortOrder?: number | null;
};

export type BusinessEntityContactUpdate = Partial<Omit<BusinessEntityContactInput, "entityType" | "entityId">>;

const encode = encodeURIComponent;

export const businessEntitiesApi = {
  listMalvaniProfiles: () => apiGet<MalvaniProfile[]>("/api/malvani-profiles"),
  createMalvaniProfile: (body: MalvaniProfileInput) =>
    apiPost<MalvaniProfile>("/api/malvani-profiles", body),
  updateMalvaniProfile: (id: string, body: Partial<MalvaniProfileInput>) =>
    apiPatch<MalvaniProfile>(`/api/malvani-profiles/${encode(id)}`, body),
  archiveMalvaniProfile: (id: string) =>
    apiDelete<MalvaniProfile>(`/api/malvani-profiles/${encode(id)}`),
  listContacts: (entityType: BusinessEntityContactType, entityId: string) =>
    apiGet<BusinessEntityContact[]>(
      `/api/business-entity-contacts?entityType=${encode(entityType)}&entityId=${encode(entityId)}`
    ),
  createContact: (body: BusinessEntityContactInput) =>
    apiPost<BusinessEntityContact>("/api/business-entity-contacts", body),
  updateContact: (id: string, body: BusinessEntityContactUpdate) =>
    apiPatch<BusinessEntityContact>(`/api/business-entity-contacts/${encode(id)}`, body),
  archiveContact: (id: string) =>
    apiDelete<BusinessEntityContact>(`/api/business-entity-contacts/${encode(id)}`),
};
