"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { WATERMARK_OPACITY_OPTIONS } from "@/lib/report-shared";
import type { ReportSettingsDto } from "@/lib/report-shared";
import {
  clearReportAssetAction,
  saveReportSettingsAction,
  uploadReportAssetAction,
} from "@/app/actions/report";

/**
 * TAHFIZH V9 — settings form (rule #20-#24). Watermark opacity defaults low
 * (rule #21/#22); logo/watermark upload goes through tenant-scoped storage.
 */
export function ReportSettingsForm({
  settings,
  logoUrl,
  watermarkUrl,
}: {
  settings: ReportSettingsDto;
  logoUrl: string | null;
  watermarkUrl: string | null;
}) {
  const router = useRouter();
  const logoInput = useRef<HTMLInputElement>(null);
  const wmInput = useRef<HTMLInputElement>(null);

  const [address, setAddress] = useState(settings.address);
  const [contact, setContact] = useState(settings.contact);
  const [footerText, setFooterText] = useState(settings.footerText);
  const [showPageNumbers, setShowPageNumbers] = useState(settings.showPageNumbers);
  const [wmEnabled, setWmEnabled] = useState(settings.watermarkEnabled);
  const [wmOpacity, setWmOpacity] = useState(String(settings.watermarkOpacity));
  const [wmScale, setWmScale] = useState(String(settings.watermarkScale));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"LOGO" | "WATERMARK" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function note(res: { error?: string; success?: string }) {
    setMessage(res.error ? { kind: "err", text: res.error } : { kind: "ok", text: res.success || "Berhasil." });
    if (!res.error) router.refresh();
  }

  async function save() {
    setSaving(true);
    const res = await saveReportSettingsAction({
      address,
      contact,
      footerText,
      showPageNumbers,
      watermarkEnabled: wmEnabled,
      watermarkOpacity: Number(wmOpacity) || 15,
      watermarkScale: Number(wmScale) || 60,
    }).catch(() => ({ error: "Raport belum berhasil disimpan. Silakan coba lagi." }));
    setSaving(false);
    note(res);
  }

  async function upload(kind: "LOGO" | "WATERMARK", file: File | undefined) {
    if (!file) return;
    setUploading(kind);
    const res = await uploadReportAssetAction({ kind, file }).catch(() => ({
      error: "Gagal mengunggah gambar. Silakan coba lagi.",
    }));
    setUploading(null);
    note(res);
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-2">
      <Card className="shadow-card">
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-foreground">Identitas Lembaga</h2>

          <div className="space-y-1.5">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-muted/50">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <span className="text-[10px] text-muted-foreground/80">Belum ada</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => void upload("LOGO", e.target.files?.[0])}
                />
                <Button size="sm" variant="outline" disabled={uploading !== null} onClick={() => logoInput.current?.click()}>
                  <ImageUp className="mr-1 h-3.5 w-3.5" /> {uploading === "LOGO" ? "Mengunggah..." : "Unggah"}
                </Button>
                {logoUrl ? (
                  <Button size="sm" variant="outline" className="text-red-600 dark:text-red-300" onClick={() => void clearReportAssetAction({ kind: "LOGO" }).then(note)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Alamat</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} placeholder="Jl. Merdeka No. 10, Bandung" />
          </div>
          <div className="space-y-1.5">
            <Label>Kontak</Label>
            <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} placeholder="0812-3456-7890 • info@lembaga.sch.id" />
          </div>
          <div className="space-y-1.5">
            <Label>Teks footer</Label>
            <Input value={footerText} onChange={(e) => setFooterText(e.target.value)} maxLength={200} placeholder="Dicetak dari TAHFIZH" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Nomor halaman (multi-page)</Label>
            <Switch checked={showPageNumbers} onCheckedChange={setShowPageNumbers} />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-bold text-foreground">Watermark</h2>
          <div className="flex items-center justify-between">
            <Label className="text-sm text-muted-foreground">Aktifkan watermark</Label>
            <Switch checked={wmEnabled} onCheckedChange={setWmEnabled} />
          </div>

          <div className="space-y-1.5">
            <Label>Gambar watermark</Label>
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-muted/50">
                {watermarkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={watermarkUrl} alt="Watermark" className="h-full w-full object-contain opacity-40" />
                ) : (
                  <span className="text-[10px] text-muted-foreground/80">Belum ada</span>
                )}
              </div>
              <div className="flex gap-1.5">
                <input
                  ref={wmInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => void upload("WATERMARK", e.target.files?.[0])}
                />
                <Button size="sm" variant="outline" disabled={uploading !== null} onClick={() => wmInput.current?.click()}>
                  <ImageUp className="mr-1 h-3.5 w-3.5" /> {uploading === "WATERMARK" ? "Mengunggah..." : "Unggah"}
                </Button>
                {watermarkUrl ? (
                  <Button size="sm" variant="outline" className="text-red-600 dark:text-red-300" onClick={() => void clearReportAssetAction({ kind: "WATERMARK" }).then(note)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Opasitas</Label>
              <Select value={wmOpacity} onValueChange={setWmOpacity} disabled={!wmEnabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WATERMARK_OPACITY_OPTIONS.map((o) => (
                    <SelectItem key={o} value={String(o)}>
                      {o}% (halus)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ukuran (%) lebar halaman</Label>
              <Input
                type="number"
                min={10}
                max={100}
                value={wmScale}
                disabled={!wmEnabled}
                onChange={(e) => setWmScale(e.target.value)}
              />
            </div>
          </div>

          {message ? (
            <p
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                message.kind === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              )}
            >
              {message.text}
            </p>
          ) : null}

          <Button
            className="w-full bg-primary text-white"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Menyimpan..." : "Simpan Pengaturan"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
