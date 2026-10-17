export type ProviderKind = "service" | "equipment";
export type ProviderReviewState = "draft" | "pending" | "approved" | "rejected";

export interface EquipmentItem {
  id?: string;
  name: string;
  quantityAvailable: number;
}

export interface ProviderProfile {
  id: string;
  ownerId: string;
  kind: ProviderKind;
  businessName: string;
  category: string;
  serviceArea: string;
  summary: string;
  offerings: string[];
  startingPrice: number;
  sampleUrls: string[];
  deliveryDetails: string;
  setupDetails: string;
  pickupDetails: string;
  reviewState: ProviderReviewState;
  reviewNote: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  inventory: EquipmentItem[];
}

export interface ProviderProfileDraft {
  kind: ProviderKind;
  businessName: string;
  category: string;
  serviceArea: string;
  summary: string;
  offerings: string[];
  startingPrice: number;
  sampleUrls: string[];
  deliveryDetails: string;
  setupDetails: string;
  pickupDetails: string;
  inventory: EquipmentItem[];
}

export const PROVIDER_PROFILE_SELECT = "id,owner_id,kind,business_name,category,service_area,summary,offerings,starting_price,sample_urls,delivery_details,setup_details,pickup_details,review_state,submitted_at,reviewed_at,provider_inventory_items(id,name,quantity_available)";

export function mapProviderProfile(row: Record<string, unknown>): ProviderProfile {
  const inventoryRows = Array.isArray(row.provider_inventory_items) ? row.provider_inventory_items : [];
  return {
    id: String(row.id ?? ""),
    ownerId: String(row.owner_id ?? ""),
    kind: row.kind === "equipment" ? "equipment" : "service",
    businessName: String(row.business_name ?? ""),
    category: String(row.category ?? ""),
    serviceArea: String(row.service_area ?? ""),
    summary: String(row.summary ?? ""),
    offerings: stringList(row.offerings),
    startingPrice: Number(row.starting_price ?? 0),
    sampleUrls: stringList(row.sample_urls),
    deliveryDetails: String(row.delivery_details ?? ""),
    setupDetails: String(row.setup_details ?? ""),
    pickupDetails: String(row.pickup_details ?? ""),
    reviewState: reviewState(row.review_state),
    reviewNote: String(row.review_note ?? ""),
    submittedAt: optionalString(row.submitted_at),
    reviewedAt: optionalString(row.reviewed_at),
    inventory: inventoryRows.map((item) => {
      const value = item as Record<string, unknown>;
      return { id: String(value.id ?? ""), name: String(value.name ?? ""), quantityAvailable: Number(value.quantity_available ?? 0) };
    }),
  };
}

export function validateProviderDraft(draft: ProviderProfileDraft): string[] {
  const errors: string[] = [];
  if (draft.businessName.trim().length < 2) errors.push("Enter a business name.");
  if (draft.category.trim().length < 2) errors.push("Enter a service category.");
  if (draft.serviceArea.trim().length < 2) errors.push("Enter the area you serve.");
  if (draft.summary.trim().length < 40) errors.push("Describe the business in at least 40 characters.");
  if (!draft.offerings.some((item) => item.trim())) errors.push("Add at least one offering.");
  if (!Number.isFinite(draft.startingPrice) || draft.startingPrice < 0) errors.push("Enter a valid starting price.");
  if (!draft.sampleUrls.length) errors.push("Add at least one HTTPS work-sample URL.");
  if (draft.sampleUrls.some((url) => !isHttpsUrl(url))) errors.push("Work samples must use valid HTTPS URLs.");
  if (draft.kind === "equipment") {
    if (!draft.inventory.length || draft.inventory.some((item) => !item.name.trim() || !Number.isInteger(item.quantityAvailable) || item.quantityAvailable < 1)) {
      errors.push("Add equipment with a whole-number available quantity.");
    }
    if (!draft.deliveryDetails.trim() || !draft.setupDetails.trim() || !draft.pickupDetails.trim()) {
      errors.push("Describe delivery, setup, and pickup for equipment rentals.");
    }
  }
  return errors;
}

export function providerUpdatePayload(draft: ProviderProfileDraft) {
  return {
    kind: draft.kind,
    business_name: draft.businessName.trim(),
    category: draft.category.trim(),
    service_area: draft.serviceArea.trim(),
    summary: draft.summary.trim(),
    offerings: cleanList(draft.offerings),
    starting_price: draft.startingPrice,
    sample_urls: cleanList(draft.sampleUrls),
    delivery_details: draft.kind === "equipment" ? draft.deliveryDetails.trim() : "",
    setup_details: draft.kind === "equipment" ? draft.setupDetails.trim() : "",
    pickup_details: draft.kind === "equipment" ? draft.pickupDetails.trim() : "",
  };
}

export function providerInsertPayload(ownerId: string, draft: ProviderProfileDraft) {
  return { owner_id: ownerId, ...providerUpdatePayload(draft) };
}

export function commaList(value: string): string[] {
  return cleanList(value.split(","));
}

function cleanList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function reviewState(value: unknown): ProviderReviewState {
  return value === "pending" || value === "approved" || value === "rejected" ? value : "draft";
}

function isHttpsUrl(value: string): boolean {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}
