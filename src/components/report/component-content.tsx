"use client";

import { cn } from "@/lib/utils";
import type { ReportComponent, ReportData, ReportStyle } from "@/lib/report-shared";
import { DEFAULT_GRADE_LEGEND, MODULE_LABELS } from "@/lib/report-shared";

/**
 * TAHFIZH V9 — renders the CONTENT of a single report component.
 * Pure/presentational: positioning (x/y/w/h) is handled by the canvas or the
 * builder; this only turns (type, style, props, data) into JSX.
 */

export type CanvasContext = {
  title: string;
  academicYear: string;
  semesterLabel: string;
  periodLabel: string | null;
  periodStart: string;
  periodEnd: string;
};

const MONTHS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatDateID(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function periodText(ctx: CanvasContext): string {
  if (ctx.periodLabel) return ctx.periodLabel;
  return `${formatDateID(ctx.periodStart)} — ${formatDateID(ctx.periodEnd)}`;
}

/** Apply the builder's style knobs (rule #53 subset). */
export function styleToCss(style: ReportStyle): React.CSSProperties {
  return {
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    textAlign: style.align,
    color: style.color ?? undefined,
    background: style.background ?? undefined,
    opacity: style.opacity !== undefined ? style.opacity / 100 : undefined,
  };
}

type ContentProps = {
  comp: ReportComponent;
  ctx: CanvasContext;
  data: ReportData | null;
  logoUrl: string | null;
  watermarkUrl: string | null;
};

/** Score label per V3 mode (rule #26/#27 — no second scoring system). */
function scoreText(
  mode: string | undefined,
  avg: number | null | undefined,
  label: string | null | undefined
): string {
  if (mode === "ANGKA") return avg != null ? String(avg) : "—";
  if (mode === "HURUF") return label || (avg != null ? String(avg) : "—");
  if (mode === "CENTANG") return label === "✓" || (avg != null && avg > 0) ? "✓" : "—";
  return label || (avg != null ? String(avg) : "—");
}

export function ReportComponentContent({ comp, ctx, data, logoUrl, watermarkUrl }: ContentProps) {
  const s = data ?? {};
  const inst = s.institution ?? {};
  const scores = s.scores ?? {};
  const css = styleToCss(comp.style);
  const base = "w-full h-full overflow-hidden";

  switch (comp.type) {
    case "LOGO":
      return (
        <div className={cn(base, "flex items-center justify-center")}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo lembaga" className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">
              LOGO
            </div>
          )}
        </div>
      );

    case "SECTION_HEADING": {
      const accent = comp.style.color ?? "#1d4ed8";
      return (
        <div className={cn(base, "flex items-center gap-2")} style={{ ...css, color: undefined }}>
          <span aria-hidden className="h-full w-1.5 shrink-0 rounded-full" style={{ background: accent }} />
          <span
            className="truncate font-bold uppercase tracking-wide"
            style={{ color: accent, fontSize: comp.style.fontSize ? `${comp.style.fontSize}px` : "11px" }}
          >
            {String(comp.props?.text ?? "") || "Judul Bagian"}
          </span>
          <span aria-hidden className="h-px flex-1" style={{ background: comp.style.borderColor ?? "#dbeafe" }} />
        </div>
      );
    }

    case "DIVIDER": {
      const thickness = Number(comp.props?.thickness ?? 2);
      return (
        <div className={cn(base, "flex items-center")}>
          <span
            aria-hidden
            className="w-full rounded-full"
            style={{ height: thickness, background: comp.style.borderColor ?? comp.style.color ?? "#1d4ed8" }}
          />
        </div>
      );
    }

    case "BOX":
      return (
        <div
          className={cn(base, "border")}
          style={{
            background: comp.style.background ?? "#f8fafc",
            borderColor: comp.style.borderColor ?? "#e2e8f0",
            borderRadius: comp.style.radius ?? 12,
            opacity: comp.style.opacity !== undefined ? comp.style.opacity / 100 : undefined,
          }}
        />
      );

    case "STUDENT_PHOTO":
      return (
        <div
          className={cn(base, "flex flex-col items-center justify-center border border-dashed text-center")}
          style={{ borderColor: comp.style.borderColor ?? "#cbd5e1", borderRadius: comp.style.radius ?? 8 }}
        >
          <span className="text-[10px] font-medium text-slate-400">FOTO</span>
          <span className="text-[9px] text-slate-400">{String(comp.props?.size ?? "3 x 4")}</span>
        </div>
      );

    case "GRADE_LEGEND": {
      const items: { range?: string; label?: string }[] = Array.isArray(comp.props?.items)
        ? (comp.props.items as { range?: string; label?: string }[])
        : DEFAULT_GRADE_LEGEND;
      return (
        <div className={cn(base, "text-slate-700")} style={css}>
          <table className="w-full border-collapse">
            <tbody>
              {items.map((it, i) => (
                <tr key={`${it.range ?? i}`}>
                  <td className="border border-slate-200 px-2 py-1 font-semibold whitespace-nowrap">
                    {it.range ?? "-"}
                  </td>
                  <td className="border border-slate-200 px-2 py-1">{it.label ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "INSTITUTION_NAME":
      return (
        <div className={cn(base, "flex items-center justify-center font-bold text-blue-950")} style={css}>
          {inst.name || "Nama Lembaga"}
        </div>
      );

    case "INSTITUTION_ADDRESS":
      return (
        <div className={cn(base, "flex items-center justify-center text-slate-600")} style={css}>
          {inst.address ? inst.address : <span className="hidden">.</span>}
        </div>
      );

    case "INSTITUTION_CONTACT":
      return (
        <div className={cn(base, "flex items-center justify-center text-slate-500")} style={css}>
          {inst.contact ? inst.contact : <span className="hidden">.</span>}
        </div>
      );

    case "REPORT_TITLE":
      return (
        <div className={cn(base, "flex items-center justify-center text-center font-bold uppercase tracking-wide text-blue-900")} style={css}>
          {String(comp.props?.text ?? "") || ctx.title}
        </div>
      );

    case "PERIOD":
      return (
        <div className={cn(base, "flex items-center justify-center text-slate-700")} style={css}>
          Periode: {periodText(ctx)}
        </div>
      );

    case "ACADEMIC_YEAR":
      return (
        <div className={cn(base, "flex items-center justify-center text-slate-700")} style={css}>
          Tahun Ajaran {ctx.academicYear || "-"}
        </div>
      );

    case "SEMESTER":
      return (
        <div className={cn(base, "flex items-center justify-center text-slate-700")} style={css}>
          {ctx.semesterLabel || "-"}
        </div>
      );

    case "STUDENT_IDENTITY": {
      const rows: [string, string][] = [];
      if (s.student?.name) rows.push(["Nama", s.student.name]);
      if (s.student?.id) rows.push(["ID", s.student.id]);
      if (s.student?.gender === "L") rows.push(["Jenis Kelamin", "Laki-laki"]);
      if (s.student?.gender === "P") rows.push(["Jenis Kelamin", "Perempuan"]);
      return (
        <div className={cn(base, "space-y-1 text-slate-800")} style={css}>
          {rows.length === 0 ? (
            <p className="text-xs text-slate-400">Data santri belum tersedia.</p>
          ) : (
            rows.map(([k, v]) => (
              <p key={k} className="flex gap-2 text-sm">
                <span className="w-24 shrink-0 text-slate-500">{k}</span>
                <span className="font-medium">: {v}</span>
              </p>
            ))
          )}
        </div>
      );
    }

    case "TEACHER_IDENTITY": {
      const t = s.teacher;
      return (
        <div className={cn(base, "space-y-1 text-slate-800")} style={css}>
          <p className="text-sm font-medium">{t?.name || "-"}</p>
          {/* rule #62: hide the ID line when empty or disabled */}
          {t?.id ? (
            <p className="text-xs text-slate-500">
              {t.identityLabel || "ID"}: {t.id}
            </p>
          ) : null}
          <p className="text-xs text-slate-500">Guru / Pembina</p>
        </div>
      );
    }

    case "HEAD_IDENTITY": {
      const h = s.head;
      return (
        <div className={cn(base, "space-y-1 text-slate-800")} style={css}>
          <p className="text-sm font-medium">{h?.name || "-"}</p>
          {h?.id ? (
            <p className="text-xs text-slate-500">
              {h.identityLabel || "ID"}: {h.id}
            </p>
          ) : null}
          <p className="text-xs text-slate-500">Kepala Lembaga</p>
        </div>
      );
    }

    case "SCORE_TABLE": {
      type Row = { key: string; materi: string; nilai: string; ket: string };
      const mode = s.mode;
      const rows: Row[] = [];
      const t = scores.tahfidz;
      if (t && (t.count ?? 0) > 0)
        rows.push({
          key: "tahfidz",
          materi: MODULE_LABELS.TAHFIDZ,
          nilai: scoreText(mode, t.avgValue, t.lastLabel),
          ket: `${t.count}/${t.activeTotal ?? 0} surat`,
        });
      const tr = scores.tartil;
      if (tr && (tr.count ?? 0) > 0)
        rows.push({ key: "tartil", materi: MODULE_LABELS.TARTIL, nilai: scoreText(mode, tr.avgValue, tr.lastLabel), ket: `${tr.count} penilaian` });
      const se = scores.setoran;
      if (se && (se.total ?? 0) > 0)
        rows.push({ key: "setoran", materi: MODULE_LABELS.SETORAN, nilai: "✓", ket: `${se.total} setoran (${se.lulus ?? 0} lulus)` });
      for (const [key, mod] of [["hadits", MODULE_LABELS.HADITS], ["doa", MODULE_LABELS.DOA], ["tajwid", MODULE_LABELS.TAJWID]] as const) {
        const m = scores[key];
        if (m && (m.total ?? 0) > 0)
          rows.push({ key, materi: mod, nilai: scoreText(mode, m.avgValue, m.lastLabel), ket: `${m.count}/${m.total} materi` });
      }
      const tg = scores.target;
      if (tg && (tg.active ?? 0) > 0)
        rows.push({ key: "target", materi: MODULE_LABELS.TARGET, nilai: `${tg.avgProgress ?? 0}%`, ket: `${tg.active} target aktif` });
      const tk = scores.tugas;
      if (tk && (tk.total ?? 0) > 0)
        rows.push({ key: "tugas", materi: MODULE_LABELS.TUGAS, nilai: scoreText(mode, tk.avgValue, null), ket: `${tk.dinilai}/${tk.total} dinilai` });

      return (
        <div className={cn(base, "text-slate-800")} style={css}>
          {rows.length === 0 ? (
            <p className="pt-2 text-center text-xs text-slate-400">Belum ada data penilaian pada periode ini.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-blue-50 text-left text-blue-950">
                  <th className="border border-blue-200 px-2 py-1.5 font-semibold">Materi</th>
                  <th className="border border-blue-200 px-2 py-1.5 font-semibold text-center">Nilai</th>
                  <th className="border border-blue-200 px-2 py-1.5 font-semibold">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="border border-blue-100 px-2 py-1.5">{r.materi}</td>
                    <td className="border border-blue-100 px-2 py-1.5 text-center font-semibold">{r.nilai}</td>
                    <td className="border border-blue-100 px-2 py-1.5 text-xs text-slate-500">{r.ket}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      );
    }

    case "ACHIEVEMENT_SUMMARY": {
      const se = scores.setoran;
      const items: [string, string][] = [];
      if (se?.total) items.push(["Jumlah setoran", String(se.total)]);
      if (scores.tahfidz?.lastLabel) items.push(["Capaian Tahfidz", scoreText(s.mode, scores.tahfidz.avgValue, scores.tahfidz.lastLabel)]);
      if (scores.tartil?.lastLabel) items.push(["Capaian Tartil", scoreText(s.mode, scores.tartil.avgValue, scores.tartil.lastLabel)]);
      if (typeof scores.jurnal === "number" && scores.jurnal > 0) items.push(["Catatan jurnal", String(scores.jurnal)]);
      return (
        <div className={cn(base, "rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-slate-800")} style={css}>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-blue-800">Kartu Prestasi</p>
          {items.length === 0 ? (
            <p className="text-xs text-slate-400">Belum ada capaian pada periode ini.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {items.map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-semibold">{v}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    case "ATTENDANCE": {
      // V8 — real H/I/S/A rekap from attendance_records (no dummy numbers).
      const att = (s.attendance ?? null) as
        | { hadir?: number; izin?: number; sakit?: number; alpa?: number; persen?: number }
        | null;
      const hasAtt = !!att && (att.hadir ?? 0) + (att.izin ?? 0) + (att.sakit ?? 0) + (att.alpa ?? 0) > 0;
      return (
        <div className={cn(base, "rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-slate-800")} style={css}>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-blue-800">Presensi</p>
          {!hasAtt ? (
            <p className="text-[11px] text-slate-400">Belum ada data presensi pada periode ini.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              <li className="flex justify-between gap-2"><span className="text-slate-500">Hadir</span><span className="font-semibold">{att.hadir}</span></li>
              <li className="flex justify-between gap-2"><span className="text-slate-500">Izin</span><span className="font-semibold">{att.izin}</span></li>
              <li className="flex justify-between gap-2"><span className="text-slate-500">Sakit</span><span className="font-semibold">{att.sakit}</span></li>
              <li className="flex justify-between gap-2"><span className="text-slate-500">Alpa</span><span className="font-semibold">{att.alpa}</span></li>
              <li className="flex justify-between gap-2 border-t border-blue-100 pt-1"><span className="text-slate-500">Persentase</span><span className="font-bold text-blue-700">{att.persen}%</span></li>
            </ul>
          )}
        </div>
      );
    }

    case "NOTES":
      return (
        <div className={cn(base, "text-slate-800")} style={css}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
            {String(comp.props?.label ?? "") || "Catatan"}
          </p>
          <p className="whitespace-pre-line text-sm">{String(comp.props?.text ?? "") || "-"}</p>
        </div>
      );

    case "CUSTOM_TEXT":
      return (
        <div className={cn(base, "whitespace-pre-line text-slate-800")} style={css}>
          {String(comp.props?.text ?? "")}
        </div>
      );

    case "SIGNATURES": {
      const showTeacher = comp.props?.showTeacher !== false;
      const showHead = comp.props?.showHead !== false;
      const teacher = s.teacher;
      const head = s.head;
      return (
        <div className={cn(base, "flex items-end justify-between gap-6 text-center text-slate-800")} style={css}>
          {showTeacher ? (
            <div className="w-1/2">
              <p className="text-xs text-slate-500">Guru / Pembina</p>
              <div className="h-12" />
              <p className="text-sm font-medium">{teacher?.name || "—"}</p>
              {teacher?.id ? <p className="text-xs text-slate-500">{teacher.identityLabel || "ID"}: {teacher.id}</p> : null}
            </div>
          ) : (
            <div className="w-1/2" />
          )}
          {showHead ? (
            <div className="w-1/2">
              <p className="text-xs text-slate-500">Kepala Lembaga</p>
              <div className="h-12" />
              <p className="text-sm font-medium">{head?.name || "—"}</p>
              {head?.id ? <p className="text-xs text-slate-500">{head.identityLabel || "ID"}: {head.id}</p> : null}
            </div>
          ) : (
            <div className="w-1/2" />
          )}
        </div>
      );
    }

    case "FOOTER":
      return (
        <div className={cn(base, "flex items-center justify-center text-[11px] text-slate-400")} style={css}>
          {String(comp.props?.text ?? "") || inst.footer || ""}
        </div>
      );

    default:
      return (
        <div className={cn(base, "flex items-center justify-center text-[10px] text-slate-400")}>
          [{comp.type}]
        </div>
      );
  }
}

/** Watermark layer — low opacity, behind content, never interactive (rule #21/#22). */
export function WatermarkLayer({
  watermarkUrl,
  opacity,
  scale,
  canvasW,
  canvasH,
}: {
  watermarkUrl: string | null;
  opacity: number;
  scale: number;
  canvasW: number;
  canvasH: number;
}) {
  if (!watermarkUrl) return null;
  const w = (canvasW * scale) / 100;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={watermarkUrl}
      alt=""
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
      style={{ width: w, maxWidth: "80%", opacity: opacity / 100 }}
    />
  );
}
