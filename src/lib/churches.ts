export type ChurchReviewState = "draft" | "pending" | "approved" | "rejected";
export type ChurchRequestStatus = "waiting_for_reply" | "accepted" | "declined" | "closed";

export interface ChurchListing {
  id: string; ownerId: string; churchName: string; spaceName: string; location: string; description: string;
  capacity: number; publishedPrice: string; amenities: string[]; rules: string; bookingContactName: string;
  photoUrls: string[]; ownerApprovedAt: string | null; reviewState: ChurchReviewState; photoPermissionGranted: boolean; photoPermissionStatement: string; reviewNote: string;
}

export interface ChurchEventRequest {
  id: string; churchId: string; customerId: string; churchOwnerId: string; churchName: string; spaceName: string;
  eventDate: string; startTime: string; endTime: string; guestCount: number; eventType: string; details: string; status: ChurchRequestStatus;
}

export const CHURCH_SELECT = "id,owner_id,church_name,space_name,location,description,capacity,published_price,amenities,rules,booking_contact_name,photo_urls,photo_permission_granted,owner_approved_at,review_state";
export const CHURCH_REQUEST_SELECT = "id,church_id,customer_id,event_date,start_time,end_time,guest_count,event_type,details,status,church_listings(church_name,space_name,owner_id)";

export function mapChurchListing(row: Record<string, unknown>): ChurchListing {
  return {
    id: String(row.id ?? ""), ownerId: String(row.owner_id ?? ""), churchName: String(row.church_name ?? ""),
    spaceName: String(row.space_name ?? ""), location: String(row.location ?? ""), description: String(row.description ?? ""),
    capacity: Number(row.capacity ?? 0), publishedPrice: String(row.published_price ?? ""), amenities: strings(row.amenities),
    rules: String(row.rules ?? ""), bookingContactName: String(row.booking_contact_name ?? ""), photoUrls: strings(row.photo_urls),
    ownerApprovedAt: optional(row.owner_approved_at), reviewState: reviewState(row.review_state),
    photoPermissionGranted: row.photo_permission_granted === true, photoPermissionStatement: String(row.photo_permission_statement ?? ""), reviewNote: String(row.review_note ?? ""),
  };
}

export function mapChurchRequest(row: Record<string, unknown>): ChurchEventRequest {
  const church = one(row.church_listings);
  return {
    id: String(row.id ?? ""), churchId: String(row.church_id ?? ""), customerId: String(row.customer_id ?? ""),
    churchOwnerId: String(church?.owner_id ?? ""), churchName: String(church?.church_name ?? "Church"), spaceName: String(church?.space_name ?? "Space"),
    eventDate: String(row.event_date ?? ""), startTime: String(row.start_time ?? "").slice(0, 5), endTime: String(row.end_time ?? "").slice(0, 5),
    guestCount: Number(row.guest_count ?? 0), eventType: String(row.event_type ?? ""), details: String(row.details ?? ""), status: requestState(row.status),
  };
}

export function churchListingPayload(ownerId: string, form: FormData) {
  return { owner_id: ownerId, ...churchListingUpdatePayload(form) };
}

export function churchListingUpdatePayload(form: FormData) {
  return {
    church_name: text(form, "churchName"), space_name: text(form, "spaceName"), location: text(form, "location"),
    description: text(form, "description"), capacity: Number(form.get("capacity")), published_price: text(form, "price"),
    amenities: list(text(form, "amenities")), rules: text(form, "rules"), booking_contact_name: text(form, "contact"),
    photo_urls: text(form, "photos").split(/\n/).map((item) => item.trim()).filter(Boolean),
  };
}

export function validateChurchListing(payload: ReturnType<typeof churchListingPayload>, permission: string): string[] {
  const errors: string[] = [];
  if (payload.church_name.length < 2 || payload.space_name.length < 2 || payload.location.length < 3) errors.push("Complete the church, space, and location names.");
  if (payload.description.length < 40) errors.push("Describe the space in at least 40 characters.");
  if (!Number.isInteger(payload.capacity) || payload.capacity < 1) errors.push("Enter a valid capacity.");
  if (!payload.amenities.length || payload.rules.length < 10 || payload.booking_contact_name.length < 2) errors.push("Add amenities, rules, and a booking contact.");
  if (!payload.photo_urls.length || payload.photo_urls.some((url) => !isHttps(url))) errors.push("Add at least one HTTPS church photo URL.");
  if (permission.trim().length < 10) errors.push("Record how the church granted photo permission.");
  return errors;
}

function text(form: FormData, name: string) { return String(form.get(name) ?? "").trim(); }
function list(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function strings(value: unknown) { return Array.isArray(value) ? value.map(String).filter(Boolean) : []; }
function optional(value: unknown) { return typeof value === "string" && value ? value : null; }
function one(value: unknown): Record<string, unknown> | null { return Array.isArray(value) ? (value[0] as Record<string, unknown> | undefined) ?? null : value && typeof value === "object" ? value as Record<string, unknown> : null; }
function reviewState(value: unknown): ChurchReviewState { return value === "pending" || value === "approved" || value === "rejected" ? value : "draft"; }
function requestState(value: unknown): ChurchRequestStatus { return value === "accepted" || value === "declined" || value === "closed" ? value : "waiting_for_reply"; }
function isHttps(value: string) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
