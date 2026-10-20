import { QUOTE_STATUS_LABELS } from "@/lib/providers";
import type { QuoteRequestStatus } from "@/lib/types";

const STATUS_STYLES: Record<QuoteRequestStatus, string> = {
  awaiting_reply: "bg-slate-100 text-slate-600",
  quoted: "bg-sky-50 text-sky-700",
  accepted: "bg-amber-50 text-amber-800",
  confirmed: "bg-emerald-50 text-emerald-700",
  declined: "bg-red-50 text-red-700",
  closed: "bg-slate-100 text-slate-500",
};

export default function QuoteStatusBadge({ status }: { status: QuoteRequestStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.08em] ${STATUS_STYLES[status]}`}
    >
      {QUOTE_STATUS_LABELS[status]}
    </span>
  );
}
