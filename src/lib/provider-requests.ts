export type ProviderRequestStatus = "waiting_for_reply" | "quoted" | "confirmed" | "declined" | "closed";

export interface ProviderRequestItem { id: string; inventoryItemId: string; name: string; quantity: number; options: string; }
export interface ProviderQuote {
  fullPrice: number; depositAmount: number; cancellationTerms: string; inclusions: string;
  revision: number; quotedAt: string; acceptedAt: string | null; paymentAcknowledgedAt: string | null; confirmedAt: string | null;
}
export interface ProviderRequestMessage { id: string; senderId: string; body: string; createdAt: string; }
export interface ProviderRequest {
  id: string; providerId: string; customerId: string; providerOwnerId: string; providerName: string; providerKind: "service" | "equipment";
  eventDate: string; startTime: string; endTime: string; location: string; guestCount: number; needs: string; status: ProviderRequestStatus;
  items: ProviderRequestItem[]; quote: ProviderQuote | null; messages: ProviderRequestMessage[]; updatedAt: string;
}

export const PROVIDER_REQUEST_SELECT = "id,provider_id,customer_id,event_date,start_time,end_time,event_location,guest_count,needs,status,updated_at,provider_profiles(business_name,owner_id,kind),provider_request_items(id,inventory_item_id,item_name,quantity,options),provider_quotes(full_price,deposit_amount,cancellation_terms,inclusions,revision,quoted_at,accepted_at,direct_payment_acknowledged_at,confirmed_at),provider_request_messages(id,sender_id,body,created_at)";
export const REQUEST_STATUS_LABELS: Record<ProviderRequestStatus, string> = {
  waiting_for_reply: "Waiting for a reply", quoted: "Quoted", confirmed: "Confirmed", declined: "Declined", closed: "Closed",
};

export function mapProviderRequest(row: Record<string, unknown>): ProviderRequest {
  const provider = one(row.provider_profiles);
  const quoteRow = one(row.provider_quotes);
  return {
    id: String(row.id ?? ""), providerId: String(row.provider_id ?? ""), customerId: String(row.customer_id ?? ""),
    providerOwnerId: String(provider?.owner_id ?? ""), providerName: String(provider?.business_name ?? "Provider"),
    providerKind: provider?.kind === "equipment" ? "equipment" : "service", eventDate: String(row.event_date ?? ""),
    startTime: String(row.start_time ?? "").slice(0, 5), endTime: String(row.end_time ?? "").slice(0, 5), location: String(row.event_location ?? ""),
    guestCount: Number(row.guest_count ?? 0), needs: String(row.needs ?? ""), status: requestStatus(row.status), updatedAt: String(row.updated_at ?? ""),
    items: many(row.provider_request_items).map((item) => ({ id: String(item.id ?? ""), inventoryItemId: String(item.inventory_item_id ?? ""), name: String(item.item_name ?? ""), quantity: Number(item.quantity ?? 0), options: String(item.options ?? "") })),
    quote: quoteRow ? { fullPrice: Number(quoteRow.full_price ?? 0), depositAmount: Number(quoteRow.deposit_amount ?? 0), cancellationTerms: String(quoteRow.cancellation_terms ?? ""), inclusions: String(quoteRow.inclusions ?? ""), revision: Number(quoteRow.revision ?? 0), quotedAt: String(quoteRow.quoted_at ?? ""), acceptedAt: optional(quoteRow.accepted_at), paymentAcknowledgedAt: optional(quoteRow.direct_payment_acknowledged_at), confirmedAt: optional(quoteRow.confirmed_at) } : null,
    messages: many(row.provider_request_messages).map((message) => ({ id: String(message.id ?? ""), senderId: String(message.sender_id ?? ""), body: String(message.body ?? ""), createdAt: String(message.created_at ?? "") })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function validateRequestedItems(items: Array<{ inventory_item_id: string; quantity: number }>): boolean {
  return items.length > 0 && items.every((item) => item.inventory_item_id.length > 0 && Number.isInteger(item.quantity) && item.quantity > 0);
}

function one(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}
function many(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value as Record<string, unknown>[] : []; }
function optional(value: unknown): string | null { return typeof value === "string" && value ? value : null; }
function requestStatus(value: unknown): ProviderRequestStatus { return value === "quoted" || value === "confirmed" || value === "declined" || value === "closed" ? value : "waiting_for_reply"; }
