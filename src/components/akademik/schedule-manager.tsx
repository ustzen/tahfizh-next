"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  deleteScheduleAction,
  saveScheduleAction,
  type V11Result,
} from "@/app/actions/akademik";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ScheduleItem = {
  id: string;
  halaqahId: string;
  halaqahName: string;
  halaqahCode: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string | null;
};

const DAYS = ["SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU", "MINGGU"];
const DAY_LABEL: Record<string, string> = {
  SENIN: "Senin",
  SELASA: "Selasa",
  RABU: "Rabu",
  KAMIS: "Kamis",
  JUMAT: "Jumat",
  SABTU: "Sabtu",
  MINGGU: "Minggu",
};

/**
 * Jadwal per halaqah (#14/#15): guru + hari + jam + ruang. Presensi V8 keeps
 * working independently (#16) — schedule is reference data only.
 */
export function ScheduleManager({
  schedules,
  halaqahs,
  halaqahLabel,
}: {
  schedules: ScheduleItem[];
  halaqahs: { id: string; name: string; code: string }[];
  halaqahLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleItem | null>(null);
  const [state, formAction, pending] = useActionState<V11Result | null, FormData>(
    saveScheduleAction as never,
    null
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      setOpen(false);
    } else if (state?.error) toast.error(state.error);
  }, [state]);

  if (halaqahs.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed border-role/25 bg-role-soft/40 px-4 py-6 text-center text-sm">
        Belum ada {halaqahLabel.toLowerCase()}. Buat {halaqahLabel.toLowerCase()} terlebih dahulu
        pada menu {halaqahLabel}.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Jadwal {halaqahLabel}</h3>
          <p className="text-muted-foreground text-xs">
            Hari, jam, dan ruang per {halaqahLabel.toLowerCase()}. Presensi tetap berjalan sesuai
            konfigurasi lembaga.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-gradient-brand hover:opacity-90" onClick={() => setEditing(null)}>
              <Plus className="size-4" /> Jadwal
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Jadwal" : "Tambah Jadwal"}</DialogTitle>
              <DialogDescription>Pilih {halaqahLabel.toLowerCase()}, hari, dan jam pembelajaran.</DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="space-y-1.5">
                <Label>{halaqahLabel}</Label>
                <ScheduleSelect
                  name="halaqahId"
                  placeholder={`Pilih ${halaqahLabel.toLowerCase()}`}
                  options={halaqahs.map((h) => ({ value: h.id, label: `${h.code} · ${h.name}` }))}
                  defaultValue={editing?.halaqahId ?? ""}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Hari</Label>
                  <ScheduleSelect
                    name="day"
                    placeholder="Pilih hari"
                    options={DAYS.map((d) => ({ value: d, label: DAY_LABEL[d] }))}
                    defaultValue={editing?.day ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="start">Jam mulai</Label>
                  <Input id="start" name="start" type="time" defaultValue={editing?.startTime ?? ""} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end">Jam selesai</Label>
                  <Input id="end" name="end" type="time" defaultValue={editing?.endTime ?? ""} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room">Ruang (opsional)</Label>
                <Input id="room" name="room" defaultValue={editing?.room ?? ""} placeholder="Aula / R-12" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
                  {pending && <Spinner />} SIMPAN
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {schedules.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed border-role/25 bg-role-soft/40 px-4 py-6 text-center text-sm">
          Belum ada jadwal pembelajaran. Tambahkan jadwal pertama.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">{halaqahLabel}</TableHead>
              <TableHead>Hari</TableHead>
              <TableHead>Jam</TableHead>
              <TableHead>Ruang</TableHead>
              <TableHead className="px-4 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="px-4">
                  <span className="font-semibold text-foreground">{s.halaqahName}</span>
                  <span className="text-muted-foreground ml-2 font-mono text-xs">{s.halaqahCode}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{DAY_LABEL[s.day] ?? s.day}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{s.startTime}–{s.endTime}</TableCell>
                <TableCell className="text-muted-foreground">{s.room ?? "-"}</TableCell>
                <TableCell className="px-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setEditing(s)}>
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                    <DeleteScheduleButton id={s.id} label={`${s.halaqahName} ${DAY_LABEL[s.day] ?? s.day}`} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ScheduleSelect({
  name,
  placeholder,
  options,
  defaultValue,
}: {
  name: string;
  placeholder: string;
  options: { value: string; label: string }[];
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select value={value || undefined} onValueChange={setValue}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function DeleteScheduleButton({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<V11Result | null, FormData>(
    deleteScheduleAction as never,
    null
  );
  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-red-600 dark:text-red-300">
          <Trash2 className="size-3.5" /> Hapus
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={action}>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus jadwal {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Jadwal hanya sebagai referensi — data presensi tidak terpengaruh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button type="submit" disabled={pending} className="bg-red-600 hover:bg-red-700">
                {pending && <Spinner />} YA, HAPUS
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
          <input type="hidden" name="id" value={id} />
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
