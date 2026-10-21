"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Copy,
  Eye,
  Info,
  LayoutTemplate,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { EMPTY_LAYOUT, SAMPLE_REPORT_CTX, SAMPLE_REPORT_DATA } from "@/lib/report-shared";
import type { ReportLayout } from "@/lib/report-shared";
import { ReportThumbnail } from "@/components/report/report-thumbnail";
import {
  deleteReportTemplateAction,
  duplicateReportTemplateAction,
  saveReportTemplateAction,
  setReportTemplateActiveAction,
  setReportTemplatePrimaryAction,
} from "@/app/actions/report";

/**
 * TAHFIZH V72 — Galeri Raport (rombak total).
 * Halaman raport langsung menampilkan CONTOH RAPORT-nya memakai renderer cetak
 * yang sama (`ReportCanvas` lewat `ReportThumbnail`). Layout baru:
 *   1. Sorotan "Raport Utama" — bingkai kaca besar + langkah 1-2-3 inline.
 *   2. Grid kartu tinggi dengan hover lembut dan aksi ikon.
 *   3. Katalog contoh bawaan untuk staf lembaga.
 * Semua alur & aksi (pakai, ubah, utama, duplikat, info, aktif, hapus) tidak
 * berubah — komponen ini murni penataan ulang visual.
 */

export type GalleryItem = {
  id: string;
  scope: "TENANT" | "GLOBAL";
  name: string;
  description: string | null;
  paper: string;
  orientation: string;
  version: number;
  isActive: boolean;
  isPrimary: boolean;
  layout: ReportLayout | null;
  usageCount: number;
};

type Props = {
  templates: GalleryItem[];
  /** Akar route raport untuk role ini, mis. "/admin/raport". */
  basePath: string;
  role: "DEVELOPER" | "ADMIN" | "KOORDINATOR" | "USTADZ";
};

type Msg = { kind: "ok" | "err"; text: string } | null;

export function TemplateGallery({ templates, basePath, role }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Msg>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GalleryItem | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [paper, setPaper] = useState("A4");
  const [orientation, setOrientation] = useState("PORTRAIT");

  const isDeveloper = role === "DEVELOPER";
  const canDelete = role === "ADMIN" || isDeveloper;

  const mine = useMemo(() => templates.filter((t) => t.scope === "TENANT"), [templates]);
  const catalog = useMemo(
    () => templates.filter((t) => t.scope === "GLOBAL" && t.isActive),
    [templates]
  );
  const owned = isDeveloper ? templates : mine;
  const primary = owned.find((t) => t.isPrimary) ?? null;

  function run(fn: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      try {
        const res = await fn();
        setMessage(
          res.error ? { kind: "err", text: res.error } : { kind: "ok", text: res.success ?? "Berhasil." }
        );
        if (!res.error) router.refresh();
      } catch {
        setMessage({ kind: "err", text: "Perubahan belum tersimpan. Silakan coba lagi." });
      }
    });
  }

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setPaper("A4");
    setOrientation("PORTRAIT");
    setFormOpen(true);
  }

  function openEdit(t: GalleryItem) {
    setEditing(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setPaper(t.paper);
    setOrientation(t.orientation);
    setFormOpen(true);
  }

  function submitForm() {
    const payload = {
      templateId: editing?.id ?? null,
      name,
      description,
      paper,
      orientation,
      layout: editing?.layout ?? EMPTY_LAYOUT,
    };
    startTransition(async () => {
      const res = await saveReportTemplateAction(payload);
      if (res.error) {
        setMessage({ kind: "err", text: res.error });
        return;
      }
      setFormOpen(false);
      setMessage({ kind: "ok", text: res.success ?? "Template tersimpan." });
      if (!editing && res.id) {
        router.push(`${basePath}/builder/${res.id}`);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-7">
      {message ? (
        <p
          className={cn(
            "rounded-xl px-4 py-2.5 text-sm",
            message.kind === "ok"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300"
          )}
        >
          {message.text}
        </p>
      ) : null}

      {/* ---------------- 1. Sorotan: Raport Utama ---------------- */}
      <section aria-busy={pending} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Star className="size-4.5 fill-amber-400 text-amber-400" />
              {isDeveloper ? "Contoh Utama Bawaan" : "Raport Utama Lembaga"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isDeveloper
                ? "Template yang ditawarkan lebih dulu kepada lembaga baru."
                : "Bentuk raport yang dipakai lembaga saat menerbitkan raport santri."}
            </p>
          </div>
          {isDeveloper ? (
            <Button size="sm" className="bg-primary text-white" onClick={openCreate} disabled={pending}>
              <Plus className="mr-1 size-4" /> Template Baru
            </Button>
          ) : null}
        </div>

        {primary && primary.layout ? (
          <div className="overflow-hidden rounded-2xl border border-role/25 shadow-card">
            <div
              className={cn(
                "h-1 w-full bg-gradient-brand transition-opacity",
                pending && "opacity-50"
              )}
            />
            <div className="bg-role-soft/40 relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[260px_1fr] dark:bg-slate-900/30">
              {/* Bingkai overview — thumbnail raport utama, diperbesar saat hover */}
              <Link
                href={`${basePath}/contoh/${primary.id}`}
                className="group mx-auto w-fit lg:mx-0"
                title="Lihat contoh penuh"
              >
                <div className="rounded-2xl bg-white p-2.5 shadow-card-lg ring-1 ring-slate-200 transition-transform duration-200 group-hover:-translate-y-1 dark:bg-white dark:ring-border/40">
                  <ReportThumbnail
                    layout={primary.layout}
                    ctx={SAMPLE_REPORT_CTX}
                    data={SAMPLE_REPORT_DATA}
                    paper={primary.paper}
                    orientation={primary.orientation}
                    width={232}
                  />
                </div>
              </Link>

              <div className="flex min-w-0 flex-col gap-3">
                {/* Langkah alur — digabung ke panel sorotan (V72) */}
                {!isDeveloper && mine.length > 0 && (
                  <ol className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {[
                      "Pilih / pakai contoh",
                      "Ubah di Report Builder",
                      isDeveloper ? "Jadikan utama" : "Jadikan raport utama",
                    ].map((label, i) => (
                      <li key={label} className="flex items-center gap-1.5">
                        {i > 0 && <span aria-hidden className="text-border">→</span>}
                        <span
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border border-role/20 bg-role-soft/70 px-2.5 py-1 font-medium text-role-strong"
                          )}
                        >
                          <span className="bg-role text-role-ink flex size-4 items-center justify-center rounded-full text-[9px] font-bold">
                            {i + 1}
                          </span>
                          {label}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-role text-role-ink gap-1">
                    <Star className="size-3 fill-current" /> Raport Utama
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground">
                    {primary.paper} • {primary.orientation === "LANDSCAPE" ? "Landscape" : "Portrait"} • v
                    {primary.version}
                  </Badge>
                  {primary.usageCount > 0 ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Dipakai {primary.usageCount} raport
                    </Badge>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xl font-bold text-foreground">{primary.name}</p>
                  {primary.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{primary.description}</p>
                  ) : null}
                </div>

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Link href={`${basePath}/contoh/${primary.id}`}>
                    <Button size="sm" variant="outline" className="shrink-0">
                      <Eye className="mr-1 size-4" /> Lihat Contoh Penuh
                    </Button>
                  </Link>
                  <Link href={`${basePath}/builder/${primary.id}`}>
                    <Button size="sm" className="bg-primary text-white">
                      <Pencil className="mr-1 size-4" /> Ubah Template
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        duplicateReportTemplateAction({
                          templateId: primary.id,
                          newName: `${primary.name} (salinan)`,
                        })
                      )
                    }
                  >
                    <Copy className="mr-1 size-4" /> Duplikat
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-role/30 bg-role-soft/30 p-8 text-center">
            <span
              aria-hidden
              className="bg-dots text-role/25 pointer-events-none absolute -top-2 -right-2 h-24 w-40 [mask-image:linear-gradient(to_left,black,transparent)]"
            />
            <div className="bg-role-soft text-role-strong mx-auto flex size-12 items-center justify-center rounded-2xl shadow-card">
              <LayoutTemplate className="size-6" />
            </div>
            <p className="mt-3 text-sm font-bold text-foreground">
              Belum ada raport utama {isDeveloper ? "bawaan" : "lembaga"}.
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              {isDeveloper
                ? "Buat template baru, atau tandai salah satu template global di bawah sebagai contoh utama."
                : owned.length > 0
                  ? "Template Anda sudah siap — tekan tombol bintang di kartu template untuk menjadikannya raport utama."
                  : "Pilih salah satu contoh di bawah, lalu tekan “Pakai Contoh Ini” diikuti “Jadikan Raport Utama”."}
            </p>
          </div>
        )}
      </section>

      {/* ---------------- 2. Template milik lembaga / global ---------------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {isDeveloper ? "Semua Template Global" : "Template Lembaga"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isDeveloper
                ? "Setiap lembaga memakai salinannya sendiri — perubahan di sini tidak mengubah raport yang sudah terbit."
                : "Salinan milik lembaga Anda. Bebas diubah tanpa memengaruhi lembaga lain."}
            </p>
          </div>
          {!isDeveloper ? (
            <Button size="sm" variant="outline" onClick={openCreate} disabled={pending}>
              <Plus className="mr-1 size-4" /> Template Kosong
            </Button>
          ) : null}
        </div>

        {owned.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
            <Sparkles className="mx-auto size-7 text-role" />
            <p className="mt-2 text-sm font-semibold text-foreground">Belum ada template lembaga</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Ambil salah satu contoh bawaan di bawah dengan “Pakai Contoh Ini” untuk memulai, atau buat template kosong.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {owned.map((t) => (
              <TemplateCard
                key={t.id}
                item={t}
                basePath={basePath}
                pending={pending}
                highlight={t.isPrimary}
                actions={
                  <>
                    <Link href={`${basePath}/builder/${t.id}`} className="grow">
                      <Button size="sm" className="h-8 w-full bg-primary text-xs text-white">
                        <Pencil className="mr-1 size-3.5" /> Ubah
                      </Button>
                    </Link>
                    {t.isPrimary ? (
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled>
                        <Check className="mr-1 size-3.5" /> Utama
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-500/10"
                        title={isDeveloper ? "Jadikan contoh utama" : "Jadikan raport utama"}
                        disabled={pending}
                        onClick={() => run(() => setReportTemplatePrimaryAction({ templateId: t.id }))}
                      >
                        <Star className="size-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 text-xs"
                      title="Ubah nama & ukuran kertas"
                      disabled={pending}
                      onClick={() => openEdit(t)}
                    >
                      <Info className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      title="Duplikat"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          duplicateReportTemplateAction({
                            templateId: t.id,
                            newName: `${t.name} (salinan)`,
                          })
                        )
                      }
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      title={t.isActive ? "Nonaktifkan" : "Aktifkan"}
                      disabled={pending || t.isPrimary}
                      onClick={() =>
                        run(() => setReportTemplateActiveAction({ templateId: t.id, active: !t.isActive }))
                      }
                    >
                      <Power className="size-3.5" />
                    </Button>
                    {canDelete ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-500/10"
                        title={
                          t.usageCount > 0
                            ? "Sudah dipakai raport — nonaktifkan saja."
                            : "Hapus template"
                        }
                        disabled={pending || t.usageCount > 0 || t.isPrimary}
                        onClick={() => run(() => deleteReportTemplateAction({ templateId: t.id }))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- 3. Katalog bawaan (khusus staf lembaga) ---------------- */}
      {!isDeveloper ? (
        <section className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Sparkles className="size-4 text-role" /> Contoh Raport Bawaan
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ini contoh tampilan raportnya. Tekan “Pakai Contoh Ini” untuk menyalinnya ke lembaga Anda,
              lalu ubah sesukanya di Report Builder.
            </p>
          </div>

          {catalog.length === 0 ? (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              Belum ada contoh aktif dari pengelola sistem.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.map((t) => (
                <TemplateCard
                  key={t.id}
                  item={t}
                  basePath={basePath}
                  pending={pending}
                  actions={
                    <>
                      <Button
                        size="sm"
                        className="h-8 grow bg-primary text-xs text-white"
                        disabled={pending}
                        onClick={() =>
                          run(() => duplicateReportTemplateAction({ templateId: t.id, newName: t.name }))
                        }
                      >
                        <Plus className="mr-1 size-3.5" /> Pakai Contoh Ini
                      </Button>
                      <Link href={`${basePath}/contoh/${t.id}`}>
                        <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs">
                          <Eye className="mr-1 size-3.5" /> Contoh
                        </Button>
                      </Link>
                    </>
                  }
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* ---------------- Dialog info template ---------------- */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Ubah Info Template" : "Template Baru"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Menyimpan akan membuat versi baru. Raport yang sudah final tetap memakai snapshot lamanya."
                : "Template dibuat kosong, lalu langsung dibuka di Report Builder."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama template</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Raport Semester Ganjil"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                placeholder="Dua kolom, satu halaman."
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Ukuran kertas</Label>
                <Select value={paper} onValueChange={setPaper}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="A5">A5</SelectItem>
                    <SelectItem value="LETTER">Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Orientasi</Label>
                <Select value={orientation} onValueChange={setOrientation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PORTRAIT">Portrait</SelectItem>
                    <SelectItem value="LANDSCAPE">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Batal
            </Button>
            <Button
              className="bg-primary text-white"
              disabled={pending || name.trim().length === 0}
              onClick={submitForm}
            >
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function TemplateCard({
  item,
  basePath,
  actions,
  highlight,
  pending,
}: {
  item: GalleryItem;
  basePath: string;
  pending: boolean;
  actions: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      aria-busy={pending}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-card-lg",
        highlight ? "border-role/40 ring-1 ring-role/25" : "border-border",
        pending && "pointer-events-none opacity-60"
      )}
    >
      <Link
        href={`${basePath}/contoh/${item.id}`}
        className="flex justify-center overflow-hidden border-b border-border/60 bg-gradient-to-b from-role-soft/50 to-slate-50 p-4 transition-colors group-hover:from-role-soft/70 dark:from-slate-900/50 dark:to-slate-900/30"
      >
        {item.layout ? (
          <div className="rounded-lg bg-white p-1.5 ring-1 ring-slate-200 shadow-sm transition-transform duration-200 group-hover:-translate-y-0.5 dark:bg-white dark:ring-border/40">
            <ReportThumbnail
              layout={item.layout}
              ctx={SAMPLE_REPORT_CTX}
              data={SAMPLE_REPORT_DATA}
              paper={item.paper}
              orientation={item.orientation}
              width={184}
            />
          </div>
        ) : (
          <div className="flex h-[277px] w-[184px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-400">
            Layout masih kosong
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-bold text-foreground">{item.name}</p>
            {item.isPrimary ? (
              <Badge className="bg-role text-role-ink items-center gap-1 text-[10px]">
                <Star className="size-2.5 fill-current" /> Utama
              </Badge>
            ) : null}
            {!item.isActive ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Nonaktif
              </Badge>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {item.paper} • {item.orientation === "LANDSCAPE" ? "Landscape" : "Portrait"} • v{item.version}
            {item.usageCount > 0 ? ` • ${item.usageCount} dipakai` : ""}
          </p>
          {item.description ? (
            <p className="line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>
          ) : null}
        </div>
        <div className="mt-auto flex flex-wrap gap-1.5">{actions}</div>
      </div>
    </div>
  );
}
