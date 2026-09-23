"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  CalendarClock,
  DoorOpen,
  GraduationCap,
  PauseCircle,
  PartyPopper,
  PlaneTakeoff,
  Users,
} from "lucide-react";

import {
  setStudentStatusAction,
  promoteStudentsAction,
  transferStudentAction,
  type V11Result,
} from "@/app/actions/santri-v11";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTanggal } from "./year-manager";

type StudentRow = {
  id: string;
  code: string;
  name: string;
  status: string;
  halaqahId: string | null;
  halaqahName: string | null;
  level: string | null;
};

type HalaqahOption = { id: string; name: string; code: string };

const STATUS_META: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  ACTIVE: { label: "Aktif", badge: "bg-emerald-100 text-emerald-700", icon: <Users className="size-3.5" /> },
  LULUS: { label: "Lulus", badge: "bg-violet-100 text-violet-700", icon: <PartyPopper className="size-3.5" /> },
  PINDAH: { label: "Pindah", badge: "bg-cyan-100 text-cyan-700", icon: <PlaneTakeoff className="size-3.5" /> },
  KELUAR: { label: "Keluar", badge: "bg-red-100 text-red-700", icon: <DoorOpen className="size-3.5" /> },
  NONAKTIF: { label: "Nonaktif", badge: "bg-amber-100 text-amber-700", icon: <PauseCircle className="size-3.5" /> },
};

/**
 * Mutasi & Naik Level (#29-#42, #61/#62). Server authorization lives in the
 * RPCs; this UI additionally hides ops for non-ACTIVE students and uses
 * confirmation dialogs for every important operation.
 */
export function MutationManager({
  students,
  halaqahs,
  halaqahLabel,
  semesterOptions,
  canMutate,
}: {
  students: StudentRow[];
  halaqahs: HalaqahOption[];
  halaqahLabel: string;
  semesterOptions: { id: string; name: string }[];
  canMutate: boolean;
}) {
  return (
    <div className="space-y-8">
      <PromoteSection students={students} canMutate={canMutate} />
      <StatusSection students={students} canMutate={canMutate} />
      <TransferSection students={students} halaqahs={halaqahs} halaqahLabel={halaqahLabel} semesterOptions={semesterOptions} canMutate={canMutate} />
    </div>
  );
}

/* ------------------------------ Promotions ------------------------------ */

function PromoteSection({ students, canMutate }: { students: StudentRow[]; canMutate: boolean }) {
  const active = students.filter((s) => s.status === "ACTIVE");
  const [selected, setSelected] = useState<string[]>([]);
  const [level, setLevel] = useState("");

  const [state, formAction, pending] = useActionState<V11Result | null, FormData>(
    promoteStudentsAction as never,
    null
  );
  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      setSelected([]);
      setLevel("");
    } else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-foreground">Naik Kelas / Level</h3>
          <p className="text-muted-foreground text-xs">
            Pilih beberapa santri lalu naikkan level sekaligus. Riwayat level lama tetap tersimpan (#34).
          </p>
        </div>
      </div>

      {active.length === 0 ? (
        <p className="text-muted-foreground text-sm">Belum ada santri aktif.</p>
      ) : (
        <form action={formAction} className="rounded-2xl border border-role/15 bg-role-soft/40 p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2.5 rounded-xl border border-role/15 bg-card px-3 py-2 text-sm shadow-sm"
              >
                <input
                  type="checkbox"
                  name="studentIds"
                  value={s.id}
                  checked={selected.includes(s.id)}
                  onChange={(e) =>
                    setSelected((prev) =>
                      e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)
                    )
                  }
                  className="size-4 accent-blue-600"
                />
                <span className="font-mono text-xs text-role-strong">{s.code}</span>
                <span className="truncate font-medium text-foreground">{s.name}</span>
                {s.level && <span className="text-muted-foreground ml-auto text-xs">{s.level}</span>}
              </label>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[240px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="toLevel">Level tujuan</Label>
              <Input
                id="toLevel"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="Contoh: Level 2"
                required
              />
            </div>
            <div className="flex items-end gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" disabled={pending || selected.length === 0 || !level} className="bg-gradient-brand hover:opacity-90">
                    <GraduationCap className="size-4" /> Naikkan ({selected.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Naikkan {selected.length} santri ke “{level}”?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Enrolmen tahun ajaran aktif akan diperbarui. Data tahun sebelumnya tidak berubah.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <input type="hidden" name="toLevel" value={level} />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction asChild>
                      <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
                        {pending && <Spinner />} YA, NAIKKAN
                      </Button>
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {/* keep semester/note optional fields inside the same form */}
          <input type="hidden" name="semesterId" value="" />
          <input type="hidden" name="note" value="" />
        </form>
      )}
    </section>
  );
}

/* ---------------------------- Status changes ---------------------------- */

function StatusSection({ students, canMutate }: { students: StudentRow[]; canMutate: boolean }) {
  const active = students.filter((s) => s.status === "ACTIVE" || s.status === "NONAKTIF");
  return (
    <section>
      <div className="mb-3">
        <h3 className="font-semibold text-foreground">Status Santri</h3>
        <p className="text-muted-foreground text-xs">
          Aktif, Lulus, Pindah, Keluar, Nonaktif. Perubahan tercatat di riwayat status (#39/#40).
        </p>
      </div>
      {active.length === 0 ? (
        <p className="text-muted-foreground text-sm">Belum ada santri yang dapat diubah statusnya.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">Nama</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="px-4 text-right">Ubah Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="px-4 font-medium text-foreground">{s.name}</TableCell>
                <TableCell>
                  {STATUS_META[s.status] ? (
                    <Badge className={`${STATUS_META[s.status].badge} border-0`}>
                      {STATUS_META[s.status].label}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{s.status}</Badge>
                  )}
                </TableCell>
                <TableCell className="px-4 text-right">
                  <StatusDialog student={s} canMutate={canMutate} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function StatusDialog({ student, canMutate }: { student: StudentRow; canMutate: boolean }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [state, formAction, pending] = useActionState<V11Result | null, FormData>(
    setStudentStatusAction as never,
    null
  );
  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      setOpen(false);
      setStatus("");
    } else if (state?.error) toast.error(state.error);
  }, [state]);

  const needTarget = status === "PINDAH";

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setStatus(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!canMutate}>
          Ubah
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ubah Status — {student.name}</DialogTitle>
          <DialogDescription>
            {student.code} · saat ini: {STATUS_META[student.status]?.label ?? student.status}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="studentId" value={student.id} />
          <div className="space-y-1.5">
            <Label>Status baru</Label>
            <StatusSelect value={status} onChange={setStatus} />
          </div>
          {needTarget && (
            <div className="space-y-1.5">
              <Label htmlFor="targetName">Lembaga tujuan</Label>
              <Input id="targetName" name="targetName" placeholder="Nama lembaga tujuan" required />
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="effectiveDate">Tanggal efektif</Label>
              <Input id="effectiveDate" name="effectiveDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Alasan</Label>
              <Input id="reason" name="reason" placeholder="Opsional" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Keterangan</Label>
            <Textarea id="note" name="note" rows={2} placeholder="Opsional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending || !status} className="bg-gradient-brand hover:opacity-90">
              {pending && <Spinner />} SIMPAN STATUS
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <input type="hidden" name="status" value={value} />
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Pilih status" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_META).map(([v, m]) => (
            <SelectItem key={v} value={v}>
              <span className="flex items-center gap-2">{m.icon} {m.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

/* ------------------------------ Transfer ------------------------------- */

function TransferSection({
  students,
  halaqahs,
  halaqahLabel,
  semesterOptions,
  canMutate,
}: {
  students: StudentRow[];
  halaqahs: HalaqahOption[];
  halaqahLabel: string;
  semesterOptions: { id: string; name: string }[];
  canMutate: boolean;
}) {
  const active = students.filter((s) => s.status === "ACTIVE");
  return (
    <section>
      <div className="mb-3">
        <h3 className="font-semibold text-foreground">Mutasi Antar {halaqahLabel}</h3>
        <p className="text-muted-foreground text-xs">
          ID santri tetap. Histori {halaqahLabel.toLowerCase()} lama tersimpan (#30) dan mutasi
          terjadwal didukung (#31).
        </p>
      </div>
      {active.length === 0 ? (
        <p className="text-muted-foreground text-sm">Belum ada santri aktif.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4">Nama</TableHead>
              <TableHead>{halaqahLabel} Sekarang</TableHead>
              <TableHead className="px-4 text-right">Mutasi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {active.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="px-4 font-medium text-foreground">{s.name}</TableCell>
                <TableCell>
                  {s.halaqahName ? (
                    <Badge variant="secondary">{s.halaqahName}</Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">Belum ada</span>
                  )}
                </TableCell>
                <TableCell className="px-4 text-right">
                  <TransferDialog student={s} halaqahs={halaqahs} halaqahLabel={halaqahLabel} semesterOptions={semesterOptions} canMutate={canMutate} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function TransferDialog({
  student,
  halaqahs,
  halaqahLabel,
  semesterOptions,
  canMutate,
}: {
  student: StudentRow;
  halaqahs: HalaqahOption[];
  halaqahLabel: string;
  semesterOptions: { id: string; name: string }[];
  canMutate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [toHalaqahId, setToHalaqahId] = useState("");
  const [state, formAction, pending] = useActionState<V11Result | null, FormData>(
    transferStudentAction as never,
    null
  );
  useEffect(() => {
    if (state?.success) {
      toast.success(state.success);
      setOpen(false);
      setToHalaqahId("");
    } else if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setToHalaqahId(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={!canMutate}>
          <ArrowRightLeft className="size-3.5" /> Pindah
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mutasi {student.name}</DialogTitle>
          <DialogDescription>
            {student.code} · {student.halaqahName ?? "belum punya halaqah"} → {halaqahLabel.toLowerCase()} tujuan.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="studentId" value={student.id} />
          <div className="space-y-1.5">
            <Label>{halaqahLabel} tujuan</Label>
            <input type="hidden" name="toHalaqahId" value={toHalaqahId} />
            <Select value={toHalaqahId || undefined} onValueChange={setToHalaqahId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={`Pilih ${halaqahLabel.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {halaqahs
                  .filter((h) => h.id !== student.halaqahId)
                  .map((h) => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.code} · {h.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`eff-${student.id}`}>Tanggal efektif (#31)</Label>
              <Input id={`eff-${student.id}`} name="effectiveDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label>Semester</Label>
              <SemesterSelect options={semesterOptions} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`reason-${student.id}`}>Alasan</Label>
            <Input id={`reason-${student.id}`} name="reason" placeholder="Opsional" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending || !toHalaqahId} className="bg-gradient-brand hover:opacity-90">
              {pending && <Spinner />} PROSESMUTASI
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SemesterSelect({ options }: { options: { id: string; name: string }[] }) {
  const [value, setValue] = useState("");
  return (
    <>
      <input type="hidden" name="semesterId" value={value} />
      <Select value={value || undefined} onValueChange={setValue}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Opsional" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
