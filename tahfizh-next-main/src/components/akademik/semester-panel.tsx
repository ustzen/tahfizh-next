"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck2, CircleSlash, CheckCircle2 } from "lucide-react";

import {
  activateSemesterAction,
  setSemesterStatusAction,
  type V11Result,
} from "@/app/actions/akademik";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatTanggal } from "./year-manager";

export type SemesterItem = {
  id: string;
  sequence: 1 | 2;
  name: string;
  startDate: string;
  endDate: string;
  status: "AKTIF" | "SELESAI" | "BELUM";
};

const STATUS_BADGE: Record<SemesterItem["status"], string> = {
  AKTIF: "bg-emerald-100 text-emerald-700",
  SELESAI: "bg-slate-100 text-slate-600",
  BELUM: "bg-blue-50 text-blue-700",
};

const STATUS_LABEL: Record<SemesterItem["status"], string> = {
  AKTIF: "Aktif",
  SELESAI: "Selesai",
  BELUM: "Belum Aktif",
};

/**
 * Semester panel (#6/#8): exactly one ACTIVE semester inside the active year —
 * switching marks the previous one SELESAI (handled by the DB RPC).
 */
export function SemesterPanel({ semesters }: { semesters: SemesterItem[] }) {
  if (semesters.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Belum ada semester pada tahun ajaran ini. Tanggal semester dapat diatur saat membuat atau
        mengedit tahun ajaran.
      </p>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {semesters.map((s) => (
        <div
          key={s.id}
          className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-500/10"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground">{s.name}</p>
            <Badge className={`${STATUS_BADGE[s.status]} border-0 hover:${STATUS_BADGE[s.status]}`}>
              {STATUS_LABEL[s.status]}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {formatTanggal(s.startDate)} – {formatTanggal(s.endDate)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.status !== "AKTIF" && (
              <ConfirmAction
                label="Aktifkan"
                icon={<CalendarCheck2 className="size-3.5" />}
                title={`Aktifkan ${s.name}?`}
                description="Semester lain pada tahun ajaran aktif otomatis ditandai selesai."
                hidden={{ semesterId: s.id }}
                action={activateSemesterAction}
              />
            )}
            {s.status !== "SELESAI" && (
              <ConfirmAction
                label="Tandai Selesai"
                icon={<CheckCircle2 className="size-3.5" />}
                title={`Tandai ${s.name} selesai?`}
                description="Status semester akan menjadi Selesai. Data akademik tetap tersimpan."
                hidden={{ semesterId: s.id, status: "SELESAI" }}
                action={setSemesterStatusAction}
              />
            )}
            {s.status === "SELESAI" && (
              <ConfirmAction
                label="Jadikan Belum Aktif"
                icon={<CircleSlash className="size-3.5" />}
                title={`Ubah ${s.name} menjadi Belum Aktif?`}
                description="Gunakan bila semester diaktifkan tanpa sengaja."
                hidden={{ semesterId: s.id, status: "BELUM" }}
                action={setSemesterStatusAction}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfirmAction({
  label,
  icon,
  title,
  description,
  hidden,
  action,
}: {
  label: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  hidden: Record<string, string>;
  action: (prev: V11Result | null, formData: FormData) => Promise<V11Result>;
}) {
  const [state, formAction, pending] = useActionState<V11Result | null, FormData>(
    action as never,
    null
  );
  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          {icon} {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction}>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
                {pending && <Spinner />} YA, LANJUTKAN
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
