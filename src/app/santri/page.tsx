import Link from "next/link";
import {
  Activity,
  AudioLines,
  Award,
  CalendarCheck,
  HandCoins,
  LayoutDashboard,
  Lock,
  Receipt,
  Target as TargetIcon,
} from "lucide-react";

import { StatCard } from "@/components/stat-card";
import { PageHeader, CardBox, SectionTitle } from "@/components/dashboard/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ForceChangePasswordCard } from "@/components/akun/force-change-password-card";
import { SantriTahfidzGrid, type SantriGridCell } from "@/components/santri/tahfidz-grid";
import { SetoranTerakhirCard, type SetoranTerakhirRow } from "@/components/santri/setoran-terakhir";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPaymentGate, getWaliMonthlyStatus, getWaliInvoices, getWaliHistory } from "@/lib/v10";
import { InfakHistoryCard } from "@/components/infak/infak-history-card";

import { formatDateId, rupiah } from "@/lib/v10-shared";

export const metadata = { title: "Dashboard Santri" };

export default async function SantriDashboardPage() {
  const profile = await requireRole(["WALI_SANTRI"], "/santri");
  const supabase = await createClient();

  // Semua kueri mandiri dijalankan paralel — memangkas latensi render dasbor.
  const [gate, monthly, invoices, history, guardianRes, ownProfileRes, tahfidzRpc, tartilRpc, setoranRpc] = await Promise.all([
    // V10: gate + status tagihan (rule #61/#62)
    getPaymentGate(),
    getWaliMonthlyStatus(),
    getWaliInvoices(),
    // Riwayat infak per bulan (tanggal dibayarkan + siapa pembayarnya)
    getWaliHistory(6),
    // Own guardian row (RLS guarantees this is only ourselves).
    supabase.from("guardians").select("id").eq("profile_id", profile.id).maybeSingle(),
    // V12 #25 — wajib ganti password pada login pertama (password sementara).
    supabase.from("profiles").select("must_change_password").eq("id", profile.id).single(),
    // V12.6 — blok Hafalan Tahfidz: SINKRON dengan penilaian guru (satu tabel
    // tahfidz_assessments). RPC SECURITY DEFINER hanya mengembalikan data anak
    // yang terhubung akun ini di tenant-nya sendiri.
    supabase.rpc("tahfidz_santri_grid"),
    // V12.14 — blok Jurnal Tartil: penilaian mengaji terakhir guru (sinkron).
    supabase.rpc("tartil_wali_summary"),
    // V12.11 — blok Setoran Terakhir (3 modul) per anak, sinkron dengan menu
    // Setoran guru (tahfidz_submissions + learning_assessments).
    supabase.rpc("setoran_wali_summary"),
  ]);
  const guardian = guardianRes.data;
  const mustChangePassword = ownProfileRes.data?.must_change_password === true;

  const unpaid = (monthly ?? []).filter((c) => c.status && c.status !== "PAID").length;
  const paid = (monthly ?? []).filter((c) => c.status === "PAID").length;

  const { count: childCount } = guardian
    ? await supabase
        .from("guardian_students")
        .select("id", { count: "exact", head: true })
        .eq("guardian_id", guardian.id)
    : { count: 0 };

  if (tahfidzRpc.error) console.error("[tahfidz_santri_grid]", tahfidzRpc.error.message);
  if (tartilRpc.error) console.error("[tartil_wali_summary]", tartilRpc.error.message);
  if (setoranRpc.error) console.error("[setoran_wali_summary]", setoranRpc.error.message);
  const setoranRows = (setoranRpc.data ?? []) as SetoranTerakhirRow[];
  const tartilRows = (tartilRpc.data ?? []) as {
    student_id: string;
    student_name: string;
    last_material: string | null;
    last_pages_label: string | null;
    last_score_label: string | null;
    last_score_value: number | null;
    last_assessed_at: string | null;
    teacher_name: string | null;
    note_apresiasi: string | null;
    count_dinilai: number;
  }[];
  const tahfidz = tahfidzRpc.data as
    | { children: { id: string; name: string }[]; surahs: { surahId: string; name: string; sortOrder: number }[]; cells: { surahId: string; studentId: string; status: string; scoreLabel: string | null; scoreValue: number | null }[] }
    | null;
  const tahfidzCells: Record<string, SantriGridCell> = {};
  for (const c of tahfidz?.cells ?? []) {
    tahfidzCells[`${c.surahId}:${c.studentId}`] = {
      status: c.status,
      scoreLabel: c.scoreLabel,
      scoreValue: c.scoreValue,
    };
  }

  return (
    <div>
      <PageHeader
        title={`Assalamu'alaikum, ${profile.fullName.split(" ")[0]} 👋`}
        description="Ringkasan data anak dan Infak Pengembangan bulan ini."
        icon={<LayoutDashboard className="size-6" />}
        action={
          gate?.locked ? (
            <Button asChild variant="role">
              <a href="/santri/infak">Bayar Sekarang</a>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <a href="/santri/infak">Kelola Infak</a>
            </Button>
          )
        }
      />

      {mustChangePassword && <ForceChangePasswordCard />}

      {/* V18 — pintasan menu pantauan (sinkron dengan penilaian guru) */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/santri/prestasi", label: "Kartu Prestasi", desc: "Rangkuman capaian", Icon: Award, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
          { href: "/santri/pantauan", label: "Pantauan", desc: "Semua penilaian guru", Icon: Activity, tone: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
          { href: "/santri/target", label: "Target", desc: "Progres target halaqah", Icon: TargetIcon, tone: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
          { href: "/santri/presensi", label: "Presensi", desc: "Rekap kehadiran", Icon: CalendarCheck, tone: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
        ].map(({ href, label, desc, Icon, tone }) => (
          <Link
            key={href}
            href={href}
            className="shadow-card flex items-center gap-3 rounded-2xl border bg-card px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-500/10"
          >
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">{label}</span>
              <span className="text-muted-foreground block truncate text-xs">{desc}</span>
            </span>
          </Link>
        ))}
      </div>

      {gate?.locked && (
        <CardBox className="mb-6 border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <SectionTitle
            tone="amber"
            icon={<Lock />}
            title="Infak Pengembangan bulan ini belum terkonfirmasi"
            description={`Mulai tanggal 16, akses aplikasi dibatasi hingga pembayaran infak bulan ${gate.monthLabel} terkonfirmasi. Nominal minimum ${rupiah(gate.minAmount)} per santri.`}
          />
        </CardBox>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="student" label="Jumlah Anak" value={childCount ?? 0} hint="santri terhubung dengan Anda" />
        <StatCard
          icon="paid"
          label="Lunas Bulan Ini"
          value={paid}
          hint={gate ? `Infak ${gate.monthLabel}` : undefined}
          progress={paid + unpaid > 0 ? (paid / (paid + unpaid)) * 100 : undefined}
        />
        <StatCard icon="unpaid" label="Belum Lunas" value={unpaid} hint={gate ? `min ${rupiah(gate.unpaidCount * gate.minAmount)}` : undefined} />
        <StatCard icon="tenant" label="Lembaga" value={profile.tenantName ?? "-"} hint="Data terlindung RLS" />
      </div>

      {/* Tagihan per anak */}
      {(monthly ?? []).length > 0 && (
        <CardBox className="mt-6">
          <SectionTitle
            className="mb-3"
            tone="amber"
            icon={<Receipt />}
            title="Status Tagihan Bulan Ini"
            description="Infak Pengembangan per anak"
          />
          <ul className="divide-y">
            {(monthly ?? []).map((c) => (
              <li key={c.studentId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {c.status === "PAID" && (c.paidByName || c.paidAt) && (
                    <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                      {c.paidBySelf
                        ? "Dibayar sendiri"
                        : c.paidByName
                          ? `Dibayarkan oleh ${c.paidByName}`
                          : "Sudah dibayarkan"}
                      {c.paidAt ? ` · tanggal ${formatDateId(c.paidAt)}` : ""}
                      {(c.bundleMonths ?? 0) > 1 ? ` · sekaligus ${c.bundleMonths} bulan` : ""}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="tabular text-sm font-semibold text-foreground">{rupiah(c.amount ?? 0)}</p>
                  <Badge variant={c.status === "PAID" ? "success" : c.hasInvoice ? "warning" : "neutral"}>
                    {c.status === "PAID" ? "Lunas" : c.hasInvoice ? "Belum lunas" : "Belum dibuat"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </CardBox>
      )}

      {/* Riwayat infak per bulan (termasuk yang dibayarkan santri lain / sekaligus beberapa bulan) */}
      {history.some((h) => h.items.length > 0) && (
        <InfakHistoryCard className="mt-6" history={history} limit={6} showAllHref="/santri/infak" />
      )}

      {/* V12.6 — Hafalan Tahfidz (sinkron dengan penilaian guru) */}
      {tahfidz && tahfidz.children.length > 0 && tahfidz.surahs.length > 0 && (
        <SantriTahfidzGrid children={tahfidz.children} surahs={tahfidz.surahs} cells={tahfidzCells} />
      )}

      {/* V12.11 — Setoran Terakhir (3 modul, per anak — sinkron dengan guru) */}
      {setoranRows.length > 0 && <SetoranTerakhirCard rows={setoranRows} />}

      {/* V12.14 — Jurnal Tartil (sinkron dengan penilaian guru) */}
      {tartilRows.length > 0 && (
        <CardBox className="mt-6">
          <SectionTitle
            className="mb-3"
            tone="emerald"
            icon={<AudioLines />}
            title="Jurnal Tartil (Mengaji)"
            description="Hasil bacaan ananda saat mengaji — dicatat langsung oleh ustadz/ustadzah."
          />
          <ul className="divide-y">
            {tartilRows.map((r) => (
              <li key={r.student_id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{r.student_name}</p>
                  {r.last_assessed_at ? (
                    <span className="text-muted-foreground text-xs">
                      {new Date(r.last_assessed_at).toLocaleDateString("id-ID", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </span>
                  ) : null}
                </div>
                {r.last_material ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {r.last_material}
                    {r.last_pages_label ? ` · Hal. ${r.last_pages_label}` : ""}
                    {r.teacher_name ? ` · ${r.teacher_name}` : ""}
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-0.5 text-xs italic">Belum ada penilaian.</p>
                )}
                {r.note_apresiasi && (
                  <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-yellow-500/10 dark:text-yellow-200">
                    “{r.note_apresiasi}”
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  {r.last_score_label ? (
                    <span className="inline-flex items-center rounded-lg bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                      {r.last_score_label}
                    </span>
                  ) : r.last_score_value !== null ? (
                    <span className="tabular inline-flex items-center rounded-lg bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-card">
                      {r.last_score_value}
                    </span>
                  ) : null}
                  {r.count_dinilai > 0 && (
                    <span className="text-muted-foreground text-[0.7rem]">
                      {r.count_dinilai} penilaian tercatat
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardBox>
      )}

      <CardBox className="mt-6">
        <SectionTitle
          tone="sky"
          icon={<HandCoins />}
          title="Infak Pengembangan"
          description={
            <>
              TAHFIZH gratis untuk lembaga. Platform dikembangkan melalui infak pengembangan
              mulai Rp1.000 per bulan. Kelola pembayaran di menu{" "}
              <a className="text-role-strong font-semibold hover:underline" href="/santri/infak">Infak</a>.
              {invoices && ` Tahun ajaran ${invoices.academicYear}.`}
            </>
          }
        />
      </CardBox>
    </div>
  );
}
