import type { Metadata } from "next";
import Link from "next/link";
import { Activity, Inbox } from "lucide-react";

import { CardBox, PageHeader, SectionTitle } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth";
import { getPantauanFeed, getPrestasiCards } from "@/lib/santri-pantauan";
import { cn } from "@/lib/utils";
import {
  moduleLabel,
  moduleTone,
  tanggalId,
  type PantauanItem,
} from "@/lib/santri-pantauan-shared";

export const metadata: Metadata = { title: "Pantauan Pembelajaran" };

/** Kelompokkan item per tanggal penilaian agar terbaca seperti linimasa. */
function groupByDate(items: PantauanItem[]) {
  const map = new Map<string, PantauanItem[]>();
  for (const it of items) {
    const key = it.assessedDate ?? "-";
    (map.get(key) ?? map.set(key, []).get(key)!).push(it);
  }
  return [...map.entries()];
}

export default async function SantriPantauanPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  await requireRole(["WALI_SANTRI"], "/santri/pantauan");
  const sp = await searchParams;
  const selected = sp.student ?? null;

  const [cards, feed] = await Promise.all([
    getPrestasiCards(),
    getPantauanFeed(selected, 80),
  ]);

  const grouped = groupByDate(feed);

  return (
    <div>
      <PageHeader
        title="Pantauan Pembelajaran"
        description="Linimasa seluruh penilaian guru — tahfidz, setoran, tartil, hadits, doa, tajwid, dan tugas."
        icon={<Activity className="size-6" />}
      />

      {/* Filter anak */}
      {cards.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-2">
          <Link
            href="/santri/pantauan"
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              !selected
                ? "bg-role text-role-ink border-transparent"
                : "hover:bg-slate-100 dark:hover:bg-slate-500/10"
            )}
          >
            Semua anak
          </Link>
          {cards.map((c) => (
            <Link
              key={c.studentId}
              href={`/santri/pantauan?student=${c.studentId}`}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                selected === c.studentId
                  ? "bg-role text-role-ink border-transparent"
                  : "hover:bg-slate-100 dark:hover:bg-slate-500/10"
              )}
            >
              {c.studentName}
            </Link>
          ))}
        </div>
      )}

      {feed.length === 0 ? (
        <CardBox>
          <SectionTitle
            tone="sky"
            icon={<Inbox />}
            title="Belum ada penilaian"
            description="Setiap penilaian yang dicatat guru akan langsung muncul di sini tanpa perlu sinkronisasi manual."
          />
        </CardBox>
      ) : (
        <div className="space-y-5">
          {grouped.map(([tanggal, items]) => (
            <CardBox key={tanggal}>
              <p className="text-role-strong mb-3 text-sm font-bold">{tanggalId(tanggal)}</p>
              <ul className="divide-y">
                {items.map((it, idx) => (
                  <li key={`${it.studentId}-${it.module}-${it.title}-${idx}`} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-lg px-2 py-0.5 text-[0.7rem] font-bold", moduleTone(it.module))}>
                        {moduleLabel(it.module)}
                      </span>
                      {!selected && (
                        <span className="text-muted-foreground text-xs font-medium">{it.studentName}</span>
                      )}
                      {(it.scoreLabel || it.scoreValue !== null) && (
                        <span className="shadow-card tabular ml-auto inline-flex items-center rounded-lg bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">
                          {it.scoreLabel ?? it.scoreValue}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-foreground">{it.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {[it.detail, it.teacherName ? `Dinilai oleh ${it.teacherName}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {it.freeNote && (
                      <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-yellow-500/10 dark:text-yellow-200">
                        “{it.freeNote}”
                      </p>
                    )}
                    {it.status && (
                      <Badge className="mt-2" variant={/LULUS|MENGUASAI|DINILAI/.test(it.status) ? "success" : "warning"}>
                        {it.status.replaceAll("_", " ")}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </CardBox>
          ))}
        </div>
      )}
    </div>
  );
}
