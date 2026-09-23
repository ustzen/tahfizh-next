"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BookMarked, Loader2, Pencil, Plus, Power, Trash2, X } from "lucide-react";

import type { TartilMethod } from "@/lib/tartil";
import {
  createTartilMethodAction,
  deleteTartilMethodAction,
  setTartilMethodActiveAction,
  updateTartilMethodAction,
} from "@/app/actions/tartil-methods";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * V12.14 — Manajer METODE baca Tartil (Pengaturan → Tartil).
 * Metode (Iqro/Ummi/Tartili/Tilawati/Qiro'ati/Wafa/Yanbua/isi sendiri) +
 * jumlah jilid. Jilid per metode di-generate guru otomatis saat memilih
 * metode di Jurnal Mengaji.
 */

type Draft = { id: string | null; name: string; jilidCount: string };
const EMPTY: Draft = { id: null, name: "", jilidCount: "0" };

export function TartilMethodManager({ methods: initial }: { methods: TartilMethod[] }) {
  const [items, setItems] = useState<TartilMethod[]>(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  function saveDraft() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return toast.error("Nama metode wajib diisi.");
    startTransition(async () => {
      const res = draft.id
        ? await updateTartilMethodAction({ id: draft.id, name, jilidCount: Number(draft.jilidCount) })
        : await createTartilMethodAction({ name, jilidCount: Number(draft.jilidCount) });
      if (res.success) {
        toast.success(res.success);
        setItems((prev) =>
          draft.id
            ? prev.map((m) =>
                m.id === draft.id
                  ? { ...m, name, jilidCount: Number(draft.jilidCount) }
                  : m
              )
            : [
                ...prev,
                {
                  id: crypto.randomUUID(),
                  name,
                  jilidCount: Number(draft.jilidCount),
                  sortOrder: prev.length + 1,
                  isActive: true,
                },
              ]
        );
        setDraft(null);
      } else if (res.error) toast.error(res.error);
    });
  }

  function toggleActive(m: TartilMethod) {
    startTransition(async () => {
      const res = await setTartilMethodActiveAction(m.id, !m.isActive);
      if (res.success) {
        toast.success(res.success);
        setItems((prev) => prev.map((x) => (x.id === m.id ? { ...x, isActive: !m.isActive } : x)));
      } else if (res.error) toast.error(res.error);
    });
  }

  function remove(m: TartilMethod) {
    startTransition(async () => {
      const res = await deleteTartilMethodAction(m.id);
      if (res.success) {
        toast.success(res.success);
        setItems((prev) => prev.filter((x) => x.id !== m.id));
      } else if (res.error) toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Metode Baca ({items.length})</p>
        {!draft && (
          <Button size="sm" variant="outline" onClick={() => setDraft(EMPTY)}>
            <Plus className="size-3.5" /> Tambah Metode
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Metode = seri buku baca yang dipakai lembaga (Iqro, Ummi, Tartili, Tilawati, Qiro&apos;ati,
        Wafa, Yanbua, atau isi sendiri). Jumlah jilid menentukan daftar jilid yang di-generate
        untuk Jurnal Mengaji guru.
      </p>

      {draft && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-yellow-500/30 dark:bg-yellow-500/10">
          <div className="min-w-40 flex-1 space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Nama Metode</label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="mis. Ummi / Iqro / Yanbua…"
              maxLength={60}
            />
          </div>
          <div className="w-28 space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Jumlah Jilid</label>
            <Input
              type="number"
              min={0}
              max={30}
              value={draft.jilidCount}
              onChange={(e) => setDraft({ ...draft, jilidCount: e.target.value })}
            />
          </div>
          <Button size="sm" onClick={saveDraft} disabled={pending} className="bg-gradient-brand">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : draft.id ? "Simpan" : "Tambah"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
            <X className="size-3.5" /> Batal
          </Button>
        </div>
      )}

      <ul className="divide-y rounded-xl border">
        {items.length === 0 && (
          <li className="text-muted-foreground px-4 py-6 text-center text-sm">
            Belum ada metode — tambahkan pertama Anda.
          </li>
        )}
        {items.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300 flex size-8 shrink-0 items-center justify-center rounded-lg">
                <BookMarked className="size-4" />
              </span>
              <div className="min-w-0">
                <p className={`truncate text-sm font-medium ${m.isActive ? "text-foreground" : "text-slate-400 line-through"}`}>
                  {m.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {m.jilidCount > 0 ? `${m.jilidCount} jilid` : "tanpa jilid"}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Edit metode"
                onClick={() => setDraft({ id: m.id, name: m.name, jilidCount: String(m.jilidCount) })}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={m.isActive ? "Nonaktifkan" : "Aktifkan"}
                onClick={() => toggleActive(m)}
              >
                <Power className={`size-3.5 ${m.isActive ? "text-emerald-600" : "text-slate-400"}`} />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label="Hapus metode" className="text-red-600 dark:text-red-300 hover:bg-red-50">
                    <Trash2 className="size-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Hapus metode "{m.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Daftar jilid yang sudah ada dan seluruh penilaian tetap tersimpan — hanya
                      entri metode ini yang dihapus.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Batal</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 text-white hover:bg-red-700"
                      onClick={() => remove(m)}
                    >
                      Hapus
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
