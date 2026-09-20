import { Crown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { HalaqahMember, HalaqahTeacher } from "@/lib/halaqah-shared";
import { genderLabel } from "@/lib/roles";

/**
 * TAHFIZH V8 — shared member/pengampu lists for halaqah detail (rule #12).
 * Server component — zero JS shipped.
 */
export function PengampuList({ teachers }: { teachers: HalaqahTeacher[] }) {
  if (teachers.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-6 text-center text-sm">
        Belum ada guru pengampu.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {teachers.map((t) => (
        <li key={t.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
          <span className="bg-role text-role-ink flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
            {t.name?.[0]?.toUpperCase() ?? "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
            <p className="text-muted-foreground text-[11px]">{t.code}</p>
          </div>
          {t.isPrimary ? (
            <Badge variant="warning">
              <Crown /> Utama
            </Badge>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function MemberList({ students }: { students: HalaqahMember[] }) {
  if (students.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
        Belum ada santri dalam kelompok ini.
      </p>
    );
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {students.map((s, i) => (
        <li
          key={s.id}
          className="bg-card flex items-center gap-3 rounded-xl border px-3 py-2.5 shadow-card"
        >
          <span className="bg-role-soft text-role-strong tabular flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
            <p className="text-muted-foreground text-[11px]">{s.code}</p>
          </div>
          <Badge variant={s.gender === "L" ? "info" : "violet"}>{genderLabel(s.gender)}</Badge>
        </li>
      ))}
    </ul>
  );
}
