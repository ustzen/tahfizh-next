"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";

import { createTeacherAction, updateTeacherAction, type ActionResult } from "@/app/actions/crud";
import { PasswordInput } from "@/components/password-input"; // not used here; keeps import graph simple
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
import { genderLabel } from "@/lib/roles";

type Teacher = {
  id: string;
  full_name: string;
  nickname?: string | null;
  gender: "L" | "P";
  whatsapp: string | null;
  status: "ACTIVE" | "INACTIVE";
  login_username?: string | null;
};

export function TeacherDialog({ teacher }: { teacher?: Teacher }) {
  const [open, setOpen] = useState(false);
  const editing = Boolean(teacher);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (editing ? updateTeacherAction : createTeacherAction) as never,
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
            <Plus className="size-4" /> Tambah Guru
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Guru" : "Tambah Guru"}</DialogTitle>
          <DialogDescription>
            ID guru (A-1, A-2, …) dibuat otomatis oleh sistem dan berlanjut antar lembaga.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {editing && <input type="hidden" name="id" value={teacher!.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-name">Nama Guru / Ustadz(ah)</Label>
              <Input id="t-name" name="fullName" required minLength={2} maxLength={120} defaultValue={teacher?.full_name} placeholder="Ustadz Ahmad" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-nickname">Nama Panggilan</Label>
              <Input id="t-nickname" name="nickname" maxLength={60} defaultValue={teacher?.nickname ?? ""} placeholder="Ahmad" />
            </div>
          </div>

          {!editing && (
            <>
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 p-3">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Akun Login Guru (otomatis)</p>
                <p className="mt-0.5 text-xs text-emerald-700/80">
                  Username &amp; password dibuat otomatis dari nama panggilan:
                  username = panggilan (mis. <b>ahmad</b>; bila sudah dipakai menjadi
                  ahmad2, ahmad3, …), password = panggilan + 1234 (<b>ahmad1234</b>).
                  Guru wajib mengganti password saat login pertama.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="t-username">Username (opsional — kosongkan = otomatis)</Label>
                  <Input id="t-username" name="loginUsername" autoComplete="off" maxLength={30} defaultValue="" placeholder="mis. ahmad" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t-password">Password (opsional — kosongkan = otomatis)</Label>
                  <Input id="t-password" name="loginPassword" type="password" autoComplete="new-password" minLength={8} defaultValue="" placeholder="min. 8 karakter" />
                </div>
              </div>
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="t-gender">Gender</Label>
              <Select name="gender" defaultValue={teacher?.gender ?? "L"} required>
                <SelectTrigger id="t-gender" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L">Laki-laki (Ustadz)</SelectItem>
                  <SelectItem value="P">Perempuan (Ustadzah)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-wa">Nomor WhatsApp</Label>
              <Input id="t-wa" name="whatsapp" type="tel" defaultValue={teacher?.whatsapp ?? ""} placeholder="081234567890" />
            </div>
          </div>

          {editing && (
            <div className="space-y-1.5">
              <Label htmlFor="t-status">Status</Label>
              <Select name="status" defaultValue={teacher?.status ?? "ACTIVE"} required>
                <SelectTrigger id="t-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="INACTIVE">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {editing && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 p-3">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Keamanan Akun</p>
              <p className="mt-0.5 mb-2 text-xs text-amber-700/80">
                Lupa sandi guru? Tetapkan password baru di sini — pemilik akun
                wajib menggantinya saat login berikutnya.
              </p>
              <ResetPasswordButton
                kind="teacher"
                personId={teacher!.id}
                name={teacher!.full_name}
                hasAccount={Boolean(teacher?.login_username)}
              />
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

export { genderLabel };
