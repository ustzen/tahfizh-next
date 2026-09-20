"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";

import { createStudentAction, updateStudentAction, type ActionResult } from "@/app/actions/crud";
import { Spinner } from "@/components/loading";
import { ResetPasswordButton } from "./reset-password-button";
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

type Student = {
  id: string;
  full_name: string;
  nickname?: string | null;
  gender: "L" | "P";
  status: "ACTIVE" | "INACTIVE";
  nis?: string | null;
  nisn?: string | null;
  guardian_name?: string | null;
  guardian_whatsapp?: string | null;
  login_username?: string | null;
};

export function StudentDialog({ student }: { student?: Student }) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(student);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (editing ? updateStudentAction : createStudentAction) as never,
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm">
            <Pencil className="size-4" /> Edit
          </Button>
        ) : (
          <Button className="bg-gradient-brand hover:opacity-90">
            <Plus className="size-4" /> Tambah Santri
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Santri" : "Tambah Santri"}</DialogTitle>
          <DialogDescription>
            Kolom NIS, NISN, nama wali, dan No. WhatsApp wali mengikuti format import Excel.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {editing && <input type="hidden" name="id" value={student!.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-nis">NIS</Label>
              <Input
                id="s-nis"
                name="nis"
                maxLength={30}
                defaultValue={student?.nis ?? ""}
                placeholder="20260001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-nisn">NISN</Label>
              <Input
                id="s-nisn"
                name="nisn"
                inputMode="numeric"
                maxLength={10}
                defaultValue={student?.nisn ?? ""}
                placeholder="10 digit angka"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="s-name">Nama Santri</Label>
            <Input id="s-name" name="fullName" required minLength={2} maxLength={120} defaultValue={student?.full_name} placeholder="Muhammad Rizki" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-nickname">Nama Panggilan</Label>
              <Input
                id="s-nickname"
                name="nickname"
                maxLength={60}
                defaultValue={student?.nickname ?? ""}
                placeholder="Rizki"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-gender">Jenis Kelamin</Label>
              <Select name="gender" defaultValue={student?.gender ?? "L"} required>
                <SelectTrigger id="s-gender" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">Laki-laki</SelectItem>
                  <SelectItem value="P">Perempuan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="s-guardian-name">Nama Wali</Label>
              <Input
                id="s-guardian-name"
                name="guardianName"
                maxLength={120}
                defaultValue={student?.guardian_name ?? ""}
                placeholder="Bapak Ahmad"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-guardian-wa">No. WhatsApp Wali</Label>
              <Input
                id="s-guardian-wa"
                name="guardianWhatsapp"
                inputMode="tel"
                defaultValue={student?.guardian_whatsapp ?? ""}
                placeholder="081234567890"
              />
            </div>
          </div>

          {!editing && (
            <>
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 p-3">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Akun Login Santri (otomatis)</p>
                <p className="mt-0.5 text-xs text-emerald-700/80">
                  Username &amp; password dibuat otomatis dari nama panggilan:
                  username = panggilan (mis. <b>rizki</b>; bila sudah dipakai menjadi
                  rizki2, rizki3, …), password = panggilan + 1234 (<b>rizki1234</b>).
                  Isi manual di bawah bila ingin menentukan sendiri. Santri wajib
                  mengganti password pada login pertama.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="s-username">Username (opsional — kosongkan = otomatis)</Label>
                  <Input
                    id="s-username"
                    name="loginUsername"
                    autoComplete="off"
                    maxLength={30}
                    defaultValue=""
                    placeholder="mis. rizki"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-password">Password (opsional — kosongkan = otomatis)</Label>
                  <Input
                    id="s-password"
                    name="loginPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    defaultValue=""
                    placeholder="min. 8 karakter bila diisi"
                  />
                </div>
              </div>
            </>
          )}
          {editing && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Keamanan Akun</p>
              <p className="mt-0.5 mb-2 text-xs text-amber-700/80">
                Lupa sandi santri? Tetapkan password baru di sini — pemilik akun
                wajib menggantinya saat login berikutnya.
              </p>
              <ResetPasswordButton
                kind="student"
                personId={student!.id}
                name={student!.full_name}
                hasAccount={Boolean(student?.login_username)}
              />
            </div>
          )}
          {editing && (
            <div className="space-y-1.5">
              <Label htmlFor="s-status">Status</Label>
              <Select name="status" defaultValue={student?.status ?? "ACTIVE"} required>
                <SelectTrigger id="s-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="INACTIVE">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
              {pending && <Spinner />} {editing ? "Simpan" : "Tambah"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
