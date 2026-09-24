"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Archive, CheckCircle2, Pencil, Plus } from "lucide-react";

import {
  activateAcademicYearAction,
  archiveAcademicYearAction,
  saveAcademicYearAction,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDMY } from "@/lib/date-format";

export type YearItem = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "ACTIVE" | "ARCHIVE";
};

/**
 * Tahun Ajaran manager (#4-#9, #60-#61): create/edit dialog, activate &
 * archive with confirmation dialogs. One ACTIVE year per tenant is enforced
 * by the DB RPC — activating another archives the previous one automatically.
 */
export function YearManager({ years }: { years: YearItem[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<YearItem | null>(null);

  const [state, formAction, pending] = useActionState<V11Result | null, FormData>(
    saveAcademicYearAction as never,
    null
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      setOpen(false);
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Daftar Tahun Ajaran</h3>
          <p className="text-muted-foreground text-xs">
            Hanya satu tahun ajaran yang aktif. Tahun lama otomatis menjadi arsip.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              className="bg-gradient-brand hover:opacity-90"
              onClick={() => setEditing(null)}
            >
              <Plus className="size-4" /> Tahun Ajaran
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Tahun Ajaran" : "Tambah Tahun Ajaran"}</DialogTitle>
              <DialogDescription>
                Contoh: nama 2026/2027, mulai 01-07-2026, selesai 30-06-2027.
              </DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-4">
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nama</Label>
                  <Input id="name" name="name" defaultValue={editing?.name ?? ""} placeholder="2026/2027" required />
                </div>
                <div className="flex items-end space-x-2 pb-2">
                  <input
                    id="activate"
                    name="activate"
                    type="checkbox"
                    defaultChecked={editing ? editing.status === "ACTIVE" : years.length === 0}
                    className="accent-role size-4"
                  />
                  <Label htmlFor="activate" className="font-normal">Jadikan aktif</Label>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="startDate">Tanggal mulai</Label>
                  <Input id="startDate" name="startDate" type="date" defaultValue={editing?.startDate ?? ""} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="endDate">Tanggal selesai</Label>
                  <Input id="endDate" name="endDate" type="date" defaultValue={editing?.endDate ?? ""} required />
                </div>
              </div>
              <details className="rounded-lg border border-role/15 bg-role-soft/50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-role-strong">
                  Tanggal semester (opsional — bisa diatur nanti)
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="s1Start" className="text-xs">Semester 1 mulai</Label>
                    <Input id="s1Start" name="s1Start" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s1End" className="text-xs">Semester 1 selesai</Label>
                    <Input id="s1End" name="s1End" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s2Start" className="text-xs">Semester 2 mulai</Label>
                    <Input id="s2Start" name="s2Start" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s2End" className="text-xs">Semester 2 selesai</Label>
                    <Input id="s2End" name="s2End" type="date" />
                  </div>
                </div>
              </details>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
                  {pending && <Spinner />} SIMPAN
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {years.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed border-role/25 bg-role-soft/40 px-4 py-6 text-center text-sm">
          Belum ada tahun ajaran. Buat tahun ajaran pertama Anda.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">Nama</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="px-4 text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {years.map((y) => (
              <YearRow key={y.id} year={y} onEdit={() => setEditing(y)} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function YearRow({ year, onEdit }: { year: YearItem; onEdit: () => void }) {
  const active = year.status === "ACTIVE";
  return (
    <TableRow>
      <TableCell className="px-4 font-semibold text-foreground">
        {year.name}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatTanggal(year.startDate)} – {formatTanggal(year.endDate)}
      </TableCell>
      <TableCell>
        {active ? (
          <Badge variant="success"><CheckCircle2 /> Aktif</Badge>
        ) : (
          <Badge variant="neutral">
            <Archive /> Arsip
          </Badge>
        )}
      </TableCell>
      <TableCell className="px-4">
        <div className="flex items-center justify-end gap-1.5">
          {!active && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                  <CheckCircle2 className="size-3.5" /> Aktifkan
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <ActivateForm yearId={year.id} yearName={year.name} />
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          {active && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-amber-700 dark:text-amber-300">
                  <Archive className="size-3.5" /> Arsipkan
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <ArchiveForm yearId={year.id} yearName={year.name} />
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function ActivateForm({ yearId, yearName }: { yearId: string; yearName: string }) {
  const [state, action, pending] = useActionState<V11Result | null, FormData>(
    activateAcademicYearAction as never,
    null
  );
  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action}>
      <AlertDialogHeader>
        <AlertDialogTitle>Aktifkan tahun ajaran {yearName}?</AlertDialogTitle>
        <AlertDialogDescription>
          Tahun ajaran yang aktif saat ini akan otomatis menjadi arsip. Data historis tidak berubah.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Batal</AlertDialogCancel>
        <AlertDialogAction asChild>
          <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
            {pending && <Spinner />} YA, AKTIFKAN
          </Button>
        </AlertDialogAction>
      </AlertDialogFooter>
      <input type="hidden" name="yearId" value={yearId} />
    </form>
  );
}

function ArchiveForm({ yearId, yearName }: { yearId: string; yearName: string }) {
  const [state, action, pending] = useActionState<V11Result | null, FormData>(
    archiveAcademicYearAction as never,
    null
  );
  useEffect(() => {
    if (state?.success) toast.success(state.success);
    else if (state?.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action}>
      <AlertDialogHeader>
        <AlertDialogTitle>Arsipkan tahun ajaran {yearName}?</AlertDialogTitle>
        <AlertDialogDescription>
          Tahun ajaran tidak dapat dihapus jika masih memiliki data akademik. Mengarsipkan menjaga
          seluruh data tetap dapat dilihat kembali.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Batal</AlertDialogCancel>
        <AlertDialogAction asChild>
          <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
            {pending && <Spinner />} YA, ARSIPKAN
          </Button>
        </AlertDialogAction>
      </AlertDialogFooter>
      <input type="hidden" name="yearId" value={yearId} />
    </form>
  );
}

export function formatTanggal(iso: string) {
  return fmtDMY(iso);
}
