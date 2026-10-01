"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Shapes, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CustomModuleItem } from "@/lib/custom-module";
import {
  deleteCustomModuleAction,
  saveCustomModuleAction,
} from "@/app/actions/custom-module";
import {
  CUSTOM_MODULE_ICON_OPTIONS,
  CUSTOM_MODULE_TONES,
  customModuleIconFor,
} from "@/components/akademik/custom-module-shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * TAHFIZH V58 — Kelola modul kustom lembaga (ADMIN/KOORDINATOR).
 * Modul yang ditambahkan langsung tampil sebagai tile di dasbor santri;
 * guru mencatat poin kemajuannya lewat menu Modul di role guru.
 */

type FormState = {
  id: string | null;
  label: string;
  icon: string;
  tone: string;
  poinTarget: string;
  /** V59 — catatan disertai nilai 0–100. */
  graded: boolean;
  /** V59 — menu tersendiri di dasbor santri. */
  showAsMenu: boolean;
  /** V59 — ikut Tabel Nilai raport (butuh graded). */
  inRaport: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  label: "",
  icon: "star",
  tone: "emerald",
  poinTarget: "",
  graded: false,
  showAsMenu: false,
  inRaport: false,
};

export function CustomModuleManager({ modules }: { modules: CustomModuleItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pending, startTransition] = useTransition();

  function reset() {
    setForm(EMPTY_FORM);
  }

  function submit() {
    const label = form.label.trim();
    if (label.length < 2 || label.length > 40) {
      toast.error("Nama modul harus 2–40 karakter.");
      return;
    }
    const poinTarget = form.poinTarget.trim() === "" ? 0 : Number(form.poinTarget);
    if (!Number.isFinite(poinTarget) || poinTarget < 0 || poinTarget > 10000) {
      toast.error("Target poin harus angka 0–10000.");
      return;
    }
    startTransition(async () => {
      const res = await saveCustomModuleAction({
        id: form.id,
        label,
        icon: form.icon,
        tone: form.tone,
        poinTarget,
        sortOrder: 100,
        graded: form.graded,
        showAsMenu: form.showAsMenu,
        inRaport: form.graded && form.inRaport,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(res.success ?? "Tersimpan.");
      reset();
      router.refresh();
    });
  }

  function edit(m: CustomModuleItem) {
    setForm({
      id: m.id,
      label: m.label,
      icon: m.icon,
      tone: m.tone,
      poinTarget: m.poinTarget > 0 ? String(m.poinTarget) : "",
      graded: m.graded,
      showAsMenu: m.showAsMenu,
      inRaport: m.inRaport,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function remove(m: CustomModuleItem) {
    if (!confirm(`Hapus modul "${m.label}"? Seluruh catatan poinnya juga terhapus.`)) return;
    startTransition(async () => {
      const res = await deleteCustomModuleAction({ id: m.id });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (form.id === m.id) reset();
      toast.success("Modul dihapus.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Form tambah / ubah */}
      <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-500/20 dark:bg-card sm:p-5">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <span className="bg-role text-role-ink flex size-6 items-center justify-center rounded-lg">
            <Shapes className="size-3.5" />
          </span>
          {form.id ? "Ubah Modul" : "Tambah Modul Baru"}
        </p>
        <p className="text-muted-foreground mt-0.5 mb-3 text-[0.7rem]">
          Modul muncul sebagai tile di dasbor santri. Target poin = jumlah kegiatan yang
          dituju tiap santri (0 = tampil jumlah kegiatan saja).
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cm-label">Nama modul</Label>
            <Input
              id="cm-label"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="mis. Kaligrafi"
              maxLength={40}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-poin">Target poin (opsional)</Label>
            <Input
              id="cm-poin"
              type="number"
              min={0}
              max={10000}
              value={form.poinTarget}
              onChange={(e) => setForm((f) => ({ ...f, poinTarget: e.target.value }))}
              placeholder="mis. 18"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-icon">Ikon</Label>
            <select
              id="cm-icon"
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              className="h-9 w-full rounded-lg border px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 dark:bg-card"
            >
              {CUSTOM_MODULE_ICON_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Warna</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CUSTOM_MODULE_TONES).map(([key, t]) => (
                <button
                  key={key}
                  type="button"
                  aria-label={`Warna ${key}`}
                  aria-pressed={form.tone === key}
                  onClick={() => setForm((f) => ({ ...f, tone: key }))}
                  className={cn(
                    "size-8 rounded-lg border-2 transition-transform",
                    t.bar,
                    form.tone === key ? "scale-110 border-foreground/60" : "border-transparent"
                  )}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-500/20 dark:bg-transparent">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Beri nilai saat mencatat</Label>
              <p className="text-muted-foreground text-[0.62rem]">
                Guru mengisi nilai 0–100 tiap catatan (selain hitungan poin).
              </p>
            </div>
            <Switch
              checked={form.graded}
              onCheckedChange={(v) =>
                setForm((f) => ({ ...f, graded: v, inRaport: v ? f.inRaport : false }))
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Tampilkan sebagai menu tersendiri</Label>
              <p className="text-muted-foreground text-[0.62rem]">
                Menu khusus modul ini muncul di dasbor santri (riwayat & rincian).
              </p>
            </div>
            <Switch
              checked={form.showAsMenu}
              onCheckedChange={(v) => setForm((f) => ({ ...f, showAsMenu: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs">Masukkan ke raport</Label>
              <p className="text-muted-foreground text-[0.62rem]">
                Rata-rata nilai modul dicetak di Tabel Nilai raport
                {form.graded ? "." : " — butuh pilihan beri nilai aktif."}
              </p>
            </div>
            <Switch
              checked={form.graded && form.inRaport}
              disabled={!form.graded}
              onCheckedChange={(v) => setForm((f) => ({ ...f, inRaport: v }))}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button onClick={submit} disabled={pending} className="bg-role text-role-ink hover:brightness-95">
            <Plus className="size-4" />
            {form.id ? "Simpan Perubahan" : "Tambah Modul"}
          </Button>
          {form.id && (
            <Button variant="outline" onClick={reset} disabled={pending}>
              Batal
            </Button>
          )}
        </div>
      </div>

      {/* Daftar modul */}
      <div className="shadow-card rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-500/20 dark:bg-card sm:p-5">
        <p className="mb-3 text-sm font-bold">
          Modul Lembaga <span className="text-muted-foreground font-normal">({modules.length})</span>
        </p>
        {modules.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Belum ada modul kustom. Tambahkan modul pertama lewat form di atas.
          </p>
        ) : (
          <ul className="space-y-2">
            {modules.map((m) => {
              const IconC = customModuleIconFor(m.icon);
              const tone = CUSTOM_MODULE_TONES[m.tone] ?? CUSTOM_MODULE_TONES.emerald;
              return (
                <li
                  key={m.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-500/20",
                    !m.isActive && "opacity-50"
                  )}
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone.chip)}>
                    <IconC className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{m.label}</p>
                    <p className="text-muted-foreground text-[0.65rem] font-semibold">
                      {m.poinTarget > 0 ? `Target ${m.poinTarget} poin` : "Tanpa target poin"}
                      {m.graded && " · dinilai"}
                      {m.showAsMenu && " · menu"}
                      {m.graded && m.inRaport && " · raport"}
                      {!m.isActive && " · nonaktif"}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => edit(m)}
                      aria-label={`Ubah ${m.label}`}
                      title="Ubah"
                      className="text-muted-foreground/70 hover:bg-muted hover:text-foreground rounded-md p-1.5"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      aria-label={`Hapus ${m.label}`}
                      title="Hapus"
                      className="rounded-md p-1.5 text-muted-foreground/70 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
