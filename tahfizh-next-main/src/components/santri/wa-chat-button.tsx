import { MessageCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { waLink } from "@/lib/v10-shared";

/**
 * V12.13 — Tombol chat WhatsApp per baris di tabel Data Santri.
 * Membuka wa.me ke nomor wali santri (tanpa API — pengguna yang menekan).
 * Nomor kosong/tidak valid → badge "Nomor belum tersedia".
 */
export function WaChatButton({
  number,
  studentName,
  senderLabel,
  size = "icon",
}: {
  number: string | null | undefined;
  studentName: string;
  senderLabel: string;
  size?: "icon" | "sm";
}) {
  const link = waLink(
    number,
    `Assalamu'alaikum, saya ${senderLabel} dari TAHFIZH, terkait ${studentName}.`
  );

  if (!link) {
    return (
      <Badge
        variant="outline"
        title="Nomor WhatsApp wali belum tersedia"
        className="border-border bg-muted/50 text-muted-foreground/80"
      >
        <MessageCircle className="size-3.5" />
      </Badge>
    );
  }

  if (size === "sm") {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        title={`Chat WhatsApp wali ${studentName}`}
        className="bg-emerald-600 hover:bg-emerald-700 inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-white transition-colors"
      >
        <MessageCircle className="size-3.5" /> Chat
      </a>
    );
  }

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title={`Chat WhatsApp wali ${studentName}`}
      aria-label={`Chat WhatsApp wali ${studentName}`}
      className="bg-emerald-600 hover:bg-emerald-700 inline-flex size-8 items-center justify-center rounded-lg text-white transition-colors"
    >
      <MessageCircle className="size-4" />
    </a>
  );
}
