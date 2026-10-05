"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { resetLoginAssetAction, uploadLoginAssetAction } from "@/app/actions/branding";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function AssetCard({
  kind,
  title,
  description,
  currentUrl,
  previewAspect,
}: {
  kind: "LOGO" | "HERO";
  title: string;
  description: string;
  currentUrl: string | null;
  previewAspect: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);

  const shown = preview ?? currentUrl;

  function onPick(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      toast.error("Format harus PNG, JPG, WebP, atau SVG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Ukuran gambar maksimal 2 MB.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.set("kind", kind);
    fd.set("file", file);
    startTransition(async () => {
      const res = await uploadLoginAssetAction({ kind, file });
      if (res.success) toast.success(res.success);
      else if (res.error) toast.error(res.error);
      setPreview(null);
      router.refresh();
    });
  }

  function onReset() {
    startTransition(async () => {
      const res = await resetLoginAssetAction({ kind });
      if (res.success) toast.success(res.success);
      else if (res.error) toast.error(res.error);
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Preview */}
        <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-50", previewAspect)}>
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt={title} className="h-full w-full object-contain" />
          ) : (
            <span className="text-muted-foreground px-3 text-center text-xs">Bawaan (SVG)</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                onPick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button type="button" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
              <ImageUp className="size-4" />
              {pending ? "Mengunggah…" : "Unggah gambar"}
            </Button>
            {currentUrl && (
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onReset}>
                <RotateCcw className="size-4" />
                Kembali ke bawaan
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandingForm({
  logoUrl,
  heroUrl,
}: {
  logoUrl: string | null;
  heroUrl: string | null;
}) {
  return (
    <div className="space-y-4">
      <AssetCard
        kind="LOGO"
        title="Logo"
        description="Tampil di panel kiri dan kartu login. Disarankan PNG transparan, rasio mendatar."
        currentUrl={logoUrl}
        previewAspect="h-20 w-32"
      />
      <AssetCard
        kind="HERO"
        title="Gambar Hero"
        description="Ilustrasi besar di panel kiri (desktop) layar login. Disarankan PNG/JPG transparan atau latar langit, rasio memanjang."
        currentUrl={heroUrl}
        previewAspect="h-28 w-full sm:w-64"
      />
      <p className="text-muted-foreground text-sm leading-relaxed">
        Perubahan berlaku platform-wide (semua lembaga) dan langsung tampil di halaman{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/masuk</code> setelah diunggah.
      </p>
    </div>
  );
}
