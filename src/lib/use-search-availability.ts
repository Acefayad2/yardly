"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import { listingToday } from "./booking";
import { flexibleDates, type FlexibleSearch, searchDates } from "./search-dates";
import type { Space } from "./types";

export function useSearchAvailability(spaces: Space[], date: string, flexibility: number, flexible?: FlexibleSearch) {
  const month = flexible?.month;
  const days = flexible?.days;
  const enabled = !!date || !!month;
  const key = JSON.stringify([spaces.map((space) => [space.id, space.timezone, space.isDemo]), date, flexibility, month, days]);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; dates: Record<string, string>; error: boolean }>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const dates: Record<string, string> = {};
    const queue = spaces.filter((space) => !space.isDemo);
    let cancelled = false;
    async function worker() {
      while (queue.length) {
        const space = queue.shift()!;
        const today = listingToday(space.timezone);
        for (const candidate of month && days ? flexibleDates({ month, days }, today) : searchDates(date, flexibility, today)) {
          if (controller.signal.aborted) throw new Error("Search cancelled");
          const { data, error } = await getSupabase().rpc("get_booking_slots", { p_listing_id: space.id, p_booking_date: candidate }).abortSignal(controller.signal);
          if (error) throw error;
          if (data?.length) { dates[space.id] = candidate; break; }
        }
      }
    }
    Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
      .then(() => { if (!cancelled) setResult({ key, attempt, dates, error: false }); })
      .catch(() => { controller.abort(); if (!cancelled) setResult({ key, attempt, dates: {}, error: true }); })
      .finally(() => clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); };
  }, [spaces, date, flexibility, month, days, enabled, key, attempt]);
  const current = result?.key === key && result.attempt === attempt ? result : undefined;
  return { dates: current?.dates ?? {}, loading: enabled && !current, error: enabled && !!current?.error, retry: () => setAttempt((value) => value + 1) };
}
