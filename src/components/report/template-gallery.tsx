"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Check,
  Copy,
  Eye,
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
 * TAHFIZH V13 — Galeri Raport.
 * Halaman raport tidak lagi menampilkan daftar nama template: setiap template
 * langsung dirender sebagai CONTOH RAPORT memakai renderer cetak yang sama,
 * dengan data contoh. Dari sini pengguna memilih, menyunting, dan menetapkan
 * raport utama lembaga.
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
    <div className="space-y-8">
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

      {/* ---------------- Raport utama ---------------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {isDeveloper ? "Contoh Utama Bawaan" : "Raport Utama Lembaga"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isDeveloper
                ? "Template yang ditawarkan lebih dulu kepada lembaga baru."
                : "Bentuk raport yang dipakai lembaga saat menerbitkan raport santri."}
            </p>
          </div>
          {isDeveloper ? (
            <Button size="sm" className="bg-primary text-white" onClick={openCreate} disabled={pending}>
              <Plus className="mr-1 h-4 w-4" /> Template Baru
            </Button>
          ) : null}
        </div>

        {primary && primary.layout ? (
          <div className="overflow-hidden rounded-2xl border border-role/20 bg-role-soft/40 shadow-card">
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
              <Link
                href={`${basePath}/contoh/${primary.id}`}
                className="mx-auto shrink-0 transition hover:opacity-90 sm:mx-0"
              >
                <ReportThumbnail
                  layout={primary.layout}
                  ctx={SAMPLE_REPORT_CTX}
                  data={SAMPLE_REPORT_DATA}
                  paper={primary.paper}
                  orientation={primary.orientation}
                  width={230}
                  className="shadow-card"
                />
              </Link>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-role text-role-ink">
                    <Star className="mr-1 h-3 w-3" /> Raport Utama
                  </Badge>
                  <Badge variant="outline" className="text-muted-foreground">
                    {primary.paper} • {primary.orientation === "LANDSCAPE" ? "Landscape" : "Portrait"} • v
                    {primary.version}
                  </Badge>
                </div>
                <div>
                  <p className="text-xl font-bold text-foreground">{primary.name}</p>
                  {primary.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{primary.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`${basePath}/contoh/${primary.id}`}>
                    <Button size="sm" variant="outline">
                      <Eye className="mr-1 h-4 w-4" /> Lihat Contoh Penuh
                    </Button>
                  </Link>
                  <Link href={`${basePath}/builder/${primary.id}`}>
                    <Button size="sm" className="bg-primary text-white">
                      <Pencil className="mr-1 h-4 w-4" /> Ubah Template
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
                    <Copy className="mr-1 h-4 w-4" /> Duplikat
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-role/30 bg-role-soft/30 p-6 text-center">
            <LayoutTemplate className="mx-auto h-8 w-8 text-role" />
            <p className="mt-2 text-sm font-semibold text-foreground">
              Belum ada raport utama {isDeveloper ? "bawaan" : "lembaga"}.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isDeveloper
                ? "Tandai salah satu template global di bawah sebagai contoh utama."
                : "Pilih salah satu contoh di bawah, lalu tekan “Jadikan Raport Utama”."}
            </p>
          </div>
        )}
      </section>

      {/* ---------------- Template milik lembaga / global ---------------- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {isDeveloper ? "Semua Template Global" : "Template Lembaga"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {isDeveloper
                ? "Setiap lembaga memakai salinannya sendiri — perubahan di sini tidak mengubah raport yang sudah terbit."
                : "Salinan milik lembaga Anda. Bebas diubah tanpa memengaruhi lembaga lain."}
            </p>
          </div>
          {!isDeveloper ? (
            <Button size="sm" variant="outline" onClick={openCreate} disabled={pending}>
              <Plus className="mr-1 h-4 w-4" /> Template Kosong
            </Button>
          ) : null}
        </div>

        {owned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-muted-foreground">
            Belum ada template. Ambil salah satu contoh bawaan di bawah untuk memulai.
          </p>
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
                      <Button size="sm" variant="outline" className="h-8 w-full text-xs">
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Ubah
                      </Button>
                    </Link>
                    {t.isPrimary ? (
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled>
                        <Check className="mr-1 h-3.5 w-3.5" /> Utama
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 bg-primary text-xs text-white"
                        disabled={pending}
                        onClick={() => run(() => setReportTemplatePrimaryAction({ templateId: t.id }))}
                      >
                        <Star className="mr-1 h-3.5 w-3.5" />
                        {isDeveloper ? "Jadikan Contoh Utama" : "Jadikan Raport Utama"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      title="Ubah nama & ukuran kertas"
                      disabled={pending}
                      onClick={() => openEdit(t)}
                    >
                      Info
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
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
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      title={t.isActive ? "Nonaktifkan" : "Aktifkan"}
                      disabled={pending || t.isPrimary}
                      onClick={() =>
                        run(() => setReportTemplateActiveAction({ templateId: t.id, active: !t.isActive }))
                      }
                    >
                      <Power className="h-3.5 w-3.5" />
                    </Button>
                    {canDelete ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-600 dark:text-red-300"
                        title={
                          t.usageCount > 0
                            ? "Sudah dipakai raport — nonaktifkan saja."
                            : "Hapus template"
                        }
                        disabled={pending || t.usageCount > 0 || t.isPrimary}
                        onClick={() => run(() => deleteReportTemplateAction({ templateId: t.id }))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Katalog bawaan (khusus staf lembaga) ---------------- */}
      {!isDeveloper ? (
        <section className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Sparkles className="h-4 w-4 text-role" /> Contoh Raport Bawaan
            </h2>
            <p className="text-xs text-muted-foreground">
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
                        <Plus className="mr-1 h-3.5 w-3.5" /> Pakai Contoh Ini
                      </Button>
                      <Link href={`${basePath}/contoh/${t.id}`}>
                        <Button size="sm" variant="outline" className="h-8 text-xs">
                          <Eye className="mr-1 h-3.5 w-3.5" /> Contoh
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
        "flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card transition",
        highlight ? "border-role/40 ring-1 ring-role/20" : "border-border",
        pending && "opacity-70"
      )}
    >
      <Link
        href={`${basePath}/contoh/${item.id}`}
        className="flex justify-center bg-slate-100 p-4 transition hover:bg-slate-200/70 dark:bg-slate-800/40"
      >
        {item.layout ? (
          <ReportThumbnail
            layout={item.layout}
            ctx={SAMPLE_REPORT_CTX}
            data={SAMPLE_REPORT_DATA}
            paper={item.paper}
            orientation={item.orientation}
            width={196}
          />
        ) : (
          <div className="flex h-[277px] w-[196px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-400">
            Layout masih kosong
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-sm font-bold text-foreground">{item.name}</p>
            {item.isPrimary ? (
              <Badge className="bg-role text-role-ink text-[10px]">Utama</Badge>
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
