"use client";

import Link from "next/link";

import { SUBMISSION_FILTERS, SUBMISSION_FILTER_LABELS, type SubmissionFilter } from "@/lib/setoran-shared";
import { cn } from "@/lib/utils";

/** Rule #24 filter chips — client-side navigation preserves the shell. */
export function SetoranFilterBar({
  studentId,
  activeFilter,
}: {
  studentId: string;
  activeFilter: SubmissionFilter;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground mr-1 text-xs font-semibold">Filter:</span>
      {SUBMISSION_FILTERS.map((f) => (
        <Link
          key={f}
          href={`/ustadz/setoran/${studentId}${f === "ALL" ? "" : `?filter=${f}`}`}
          prefetch
          className={cn(
            "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",
            activeFilter === f
              ? "border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-300"
              : "text-slate-600 hover:bg-slate-50"
          )}
        >
          {SUBMISSION_FILTER_LABELS[f]}
        </Link>
      ))}
    </div>
  );
}
