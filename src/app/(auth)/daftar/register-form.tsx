"use client";

import { useActionState } from "react";

import { registerLembagaAction } from "@/app/actions/register";
import { PasswordInput } from "@/components/password-input";
import { Spinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TENANT_KINDS } from "@/lib/roles";

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerLembagaAction, null);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nama Lembaga</Label>
        <Input id="name" name="name" required minLength={3} maxLength={120} placeholder="TPQ Al-Hikmah" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="kind">Jenis Lembaga</Label>
        <Select name="kind" required defaultValue="TPQ">
          <SelectTrigger id="kind" className="w-full">
            <SelectValue placeholder="Pilih jenis lembaga" />
          </SelectTrigger>
          <SelectContent>
            {TENANT_KINDS.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Nama Penanggung Jawab</Label>
          <Input id="fullName" name="fullName" required minLength={2} maxLength={120} placeholder="Ahmad Fauzi" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp">Nomor WhatsApp</Label>
          <Input id="whatsapp" name="whatsapp" type="tel" placeholder="081234567890" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required placeholder="ahmad@example.com" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" name="password" required minLength={8} placeholder="Minimal 8 karakter" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
          <PasswordInput id="confirmPassword" name="confirmPassword" required minLength={8} placeholder="Ulangi password" />
        </div>
      </div>

      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.success && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-semibold">{state.success}</p>
          <p className="mt-1 text-xs text-blue-700">
            Belum menerima email? Periksa folder spam, atau{" "}
            <a href="/verifikasi-email" className="font-semibold underline">
              kirim ulang di sini
            </a>
            .
          </p>
        </div>
      )}

      <Button type="submit" disabled={pending} className="bg-gradient-brand w-full hover:opacity-90">
        {pending && <Spinner />} Daftarkan Lembaga
      </Button>

      <p className="text-muted-foreground text-center text-xs leading-relaxed">
        Dengan mendaftar, akun Anda otomatis menjadi <strong>Admin</strong> lembaga. Pendaftaran gratis,
        tanpa biaya langganan.
      </p>
    </form>
  );
}
