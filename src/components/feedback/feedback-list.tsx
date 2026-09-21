"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownRight, MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  setFeedbackStatusAction,
  forwardFeedbackAction,
} from "@/app/actions/v10";
import {
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_TARGET_LABEL,
  statusTone,
} from "@/lib/v10-shared";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import type { FeedbackRow } from "@/lib/v10";

const STATUS_OPTIONS = ["BARU", "DIBACA", "DIPROSES", "SELESAI", "DITOLAK"];
const FORWARD_TARGETS = ["USTADZ", "KOORDINATOR", "ADMIN", "LEMBAGA", "DEVELOPER"];

/** V12 — warna strip aksen tepi kiri kartu per kategori. */
const CATEGORY_ACCENT: Record<string, string> = {
  KRITIK: "bg-red-500",
  SARAN: "bg-emerald-500",
  LAPORAN_ERROR: "bg-rose-500",
  PERMINTAAN_FITUR: "bg-violet-500",
  PENGEMBANGAN: "bg-amber-500",
  LAINNYA: "bg-slate-400",
};

/**
 * V12 — Warna per kategori masukan (badge + filter tab).
 * Kritik = merah/oranye, Saran = emerald/hijau, Error = rose,
 * Permintaan Fitur = violet, Infak = amber, Lainnya = slate.
 */
export const CATEGORY_TONE: Record<string, { badge: string; dot: string }> = {
  KRITIK: {
    badge: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
    dot: "bg-red-500",
  },
  SARAN: {
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  LAPORAN_ERROR: {
    badge: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
    dot: "bg-rose-500",
  },
  PERMINTAAN_FITUR: {
    badge: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300",
    dot: "bg-violet-500",
  },
  PENGEMBANGAN: {
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  LAINNYA: {
    badge: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-300",
    dot: "bg-slate-400",
  },
};

function categoryTone(category: string) {
  return CATEGORY_TONE[category] ?? CATEGORY_TONE.LAINNYA;
}

/** Tab filter kategori — bukan dropdown: chip berwarna, klik untuk memilih. */
export function FeedbackFilterTabs({
  value,
  onChange,
  counts,
}: {
  value: string;
  onChange: (v: string) => void;
  counts: Record<string, number>;
}) {
  const tabs: { key: string; label: string; activeCls: string; dot: string }[] = [
    { key: "SEMUA", label: "Semua", activeCls: "bg-role text-role-ink shadow-card", dot: "bg-role" },
    { key: "KRITIK", label: "Kritik", activeCls: "bg-red-500 text-white shadow-card", dot: "bg-red-500" },
    { key: "SARAN", label: "Saran", activeCls: "bg-emerald-600 text-white shadow-card", dot: "bg-emerald-500" },
    { key: "LAPORAN_ERROR", label: "Laporan Error", activeCls: "bg-rose-600 text-white shadow-card", dot: "bg-rose-500" },
    { key: "PERMINTAAN_FITUR", label: "Permintaan Fitur", activeCls: "bg-violet-600 text-white shadow-card", dot: "bg-violet-500" },
    { key: "PENGEMBANGAN", label: "Infak Pengembangan", activeCls: "bg-amber-500 text-white shadow-card", dot: "bg-amber-500" },
    { key: "LAINNYA", label: "Lainnya", activeCls: "bg-slate-600 text-white shadow-card", dot: "bg-slate-400" },
  ];
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="Filter kategori kritik & saran"
    >
      {tabs.map((t) => {
        const active = value === t.key;
        const count = counts[t.key] ?? 0;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
              active
                ? t.activeCls
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-500/20 dark:bg-slate-500/5 dark:text-slate-300 dark:hover:bg-slate-500/10"
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-[0.7rem] font-semibold",
                active ? "bg-white/20" : "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400"
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function FeedbackList({
  rows,
  teacherOptions,
  showForward,
}: {
  rows: FeedbackRow[];
  teacherOptions: { id: string; name: string }[];
  showForward: boolean;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  // V12: filter kategori via tab chip berwarna (bukan dropdown).
  const [filter, setFilter] = useState("SEMUA");

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    acc.SEMUA = (acc.SEMUA ?? 0) + 1;
    return acc;
  }, {});
  const filtered = filter === "SEMUA" ? rows : rows.filter((r) => r.category === filter);

  if (rows.length === 0) {
    return (
      <Card className="shadow-card rounded-2xl">
        <CardContent className="py-2">
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageSquareText />
              </EmptyMedia>
              <EmptyTitle>Belum ada masukan.</EmptyTitle>
              <EmptyDescription>
                Masukan yang relevan dengan peran Anda akan tampil di sini.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <FeedbackFilterTabs value={filter} onChange={setFilter} counts={counts} />
      {filtered.length === 0 ? (
        <Card className="shadow-card rounded-2xl">
          <CardContent className="py-2">
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareText />
                </EmptyMedia>
                <EmptyTitle>
                  Tidak ada {filter === "SEMUA" ? "masukan" : (FEEDBACK_CATEGORY_LABEL[filter] ?? "masukan").toLowerCase()}.
                </EmptyTitle>
                <EmptyDescription>
                  Coba pilih kategori lain, atau kirim masukan baru dari menu Kritik &amp; Saran.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        filtered.map((f) => (
          <FeedbackCard
            key={f.id}
            row={f}
            open={openId === f.id}
            onToggle={() => setOpenId((id) => (id === f.id ? null : f.id))}
            teacherOptions={teacherOptions}
            showForward={showForward}
            onChanged={() => router.refresh()}
          />
        ))
      )}
    </div>
  );
}

function FeedbackCard({
  row,
  open,
  onToggle,
  teacherOptions,
  showForward,
  onChanged,
}: {
  row: FeedbackRow;
  open: boolean;
  onToggle: () => void;
  teacherOptions: { id: string; name: string }[];
  showForward: boolean;
  onChanged: () => void;
}) {
  const [statusState, statusAction, statusPending] = useActionState(setFeedbackStatusAction, null);
  const [forwardState, forwardAction, forwardPending] = useActionState(forwardFeedbackAction, null);
  const [forwardTarget, setForwardTarget] = useState("KOORDINATOR");

  // V12 — strip aksen warna kategori di tepi kiri kartu (Kritik merah,
  // Saran hijau, dst.) supaya jenis masukan terlihat sekali lirik.
  const accent = CATEGORY_ACCENT[row.category] ?? CATEGORY_ACCENT.LAINNYA;

  return (
    <Card className="shadow-card relative overflow-hidden rounded-2xl">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${accent}`} aria-hidden />
      <CardContent className="pt-5 pl-6">
        <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-3 text-left">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("gap-1.5", categoryTone(row.category).badge)}>
                {FEEDBACK_CATEGORY_LABEL[row.category] ?? row.category}
              </Badge>
              <Badge variant="outline" className={statusTone(row.status)}>
                {FEEDBACK_STATUS_LABEL[row.status] ?? row.status}
              </Badge>
              <span className="text-muted-foreground text-xs">
                untuk {FEEDBACK_TARGET_LABEL[row.target_type] ?? row.target_type}
                {row.target_teacher ? ` (${row.target_teacher})` : ""}
              </span>
            </div>
            <p className="mt-1.5 truncate font-semibold text-foreground">{row.title}</p>
            <p className="text-muted-foreground text-xs">
              {row.display_name} · {formatDate(row.created_at)}
              {row.is_own ? " · masukan Anda" : ""}
            </p>
          </div>
          <span className="text-muted-foreground shrink-0 text-xs">{open ? "Tutup" : "Buka"}</span>
        </button>

        {open && (
          <div className="mt-4 space-y-4 border-t pt-4">
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">{row.content}</p>
            {row.page_url && (
              <p className="text-muted-foreground text-xs">
                Halaman: <span className="font-mono">{row.page_url}</span>
              </p>
            )}
            {row.steps && (
              <p className="text-muted-foreground text-xs">Langkah: {row.steps}</p>
            )}

            {row.response && (
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                <span className="font-semibold">Tanggapan:</span> {row.response}
              </div>
            )}

            {row.can_moderate && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-500/5">
                <form action={statusAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="feedbackId" value={row.id} />
                  <div className="space-y-1">
                    <Label className="text-xs">Status &amp; tanggapan</Label>
                    <select
                      name="status"
                      defaultValue="DIBACA"
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {FEEDBACK_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Textarea name="response" rows={2} placeholder="Tanggapan (opsional)…" className="min-w-48 flex-1" />
                  <Button type="submit" size="sm" disabled={statusPending} className="bg-gradient-brand hover:opacity-90">
                    {statusPending ? "…" : "Simpan"}
                  </Button>
                </form>

                {showForward && (
                  <form action={forwardAction} className="flex flex-wrap items-end gap-2 border-t pt-3">
                    <input type="hidden" name="feedbackId" value={row.id} />
                    <div className="space-y-1">
                      <Label className="text-xs">
                        <CornerDownRight className="mr-1 inline size-3" /> Teruskan ke
                      </Label>
                      <select
                        name="target"
                        value={forwardTarget}
                        onChange={(e) => setForwardTarget(e.target.value)}
                        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        {FORWARD_TARGETS.map((t) => (
                          <option key={t} value={t}>
                            {FEEDBACK_TARGET_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    </div>
                    {forwardTarget === "USTADZ" && (
                      <select
                        name="teacherId"
                        defaultValue=""
                        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="" disabled>
                          — Pilih guru —
                        </option>
                        {teacherOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <Button type="submit" size="sm" variant="outline" disabled={forwardPending}>
                      {forwardPending ? "…" : "Teruskan"}
                    </Button>
                  </form>
                )}

                {(statusState?.error || forwardState?.error) && (
                  <p className="text-xs text-red-600 dark:text-red-300">{statusState?.error ?? forwardState?.error}</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
