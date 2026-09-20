"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareWarning, RefreshCw, TriangleAlert } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { reportErrorAction } from "@/app/actions/error-report";

/**
 * Halaman error ramah untuk segmen rute mana pun (menggantikan layar default
 * Next.js). Tombol "Laporkan kendala" mengirim laporan otomatis ke modul
 * Kritik & Saran (kategori LAPORAN_ERROR, tujuan DEVELOPER) bila pengguna
 * masih punya sesi — Admin/Developer melihatnya di menu Kritik & Saran.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const [reportState, setReportState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [reporting, startReport] = useTransition();

  useEffect(() => {
    console.error("[app-error]", error.digest ?? "", error.message);
  }, [error]);

  function handleReport() {
    startReport(async () => {
      const result = await reportErrorAction({
        digest: error.digest ?? null,
        message: error.message,
        page: pathname ?? null,
      });
      setReportState(result);
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/50 px-4 text-center">
      <Logo />
      <div className="mt-8 flex size-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300">
        <TriangleAlert className="size-8" />
      </div>
      <h1 className="mt-5 text-2xl font-bold text-foreground">Terjadi kendala</h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
        Maaf, terjadi kesalahan tak terduga saat memuat halaman ini. Coba muat ulang,
        atau kembali lagi beberapa saat lagi.
      </p>
      {error?.digest && (
        <p className="text-muted-foreground/70 mt-3 font-mono text-xs">Kode laporan: {error.digest}</p>
      )}
      {reportState && (
        <p
          role="status"
          className={`mt-3 max-w-sm rounded-lg px-3 py-2 text-sm ${reportState.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
        >
          {reportState.msg}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset} className="bg-gradient-brand hover:opacity-90">
          <RefreshCw className="size-4" /> Coba Lagi
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Kembali ke Beranda</Link>
        </Button>
        {!reportState?.ok && (
          <Button
            onClick={handleReport}
            disabled={reporting}
            variant="ghost"
            className="text-muted-foreground"
          >
            {reporting ? (
               "Mengirim…"
            ) : (
               <>
                <MessageSquareWarning className="size-4" /> Laporkan kendala
               </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

