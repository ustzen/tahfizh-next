"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, Repeat } from "lucide-react";

import { convertModeAction, setModeAction } from "@/app/actions/tahfidz-admin";
import type { ActionResult } from "@/app/actions/crud";
import type { TahfidzMode } from "@/lib/tahfidz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MODES: { value: TahfidzMode; label: string; desc: string }[] = [
  { value: "CENTANG", label: "Centang", desc: "✓ untuk hafalan lancar, tanpa nilai" },
  { value: "HURUF", label: "Huruf", desc: "Grade A+, A, B… dengan rentang nilai" },
  { value: "ANGKA", label: "Angka", desc: "Nilai angka 1–100" },
];

type Grade = { label: string; minValue: number; maxValue: number };
type Method = "LOWER" | "MIDDLE" | "UPPER" | "CUSTOM";

/**
 * Rules #12-#22: switching mode with existing data NEVER changes values
 * silently — a conversion dialog shows the mapping and a preview, and the
 * server applies everything in ONE transaction (rule #50).
 */
export function ModeSwitcher({
  currentMode,
  hasAssessments,
}: {
  currentMode: TahfidzMode;
  hasAssessments: boolean;
}) {
  const [selected, setSelected] = useState<TahfidzMode>(currentMode);
  const [pending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [grades, setGrades] = useState<Grade[] | null>(null);
  const [method, setMethod] = useState<Method>("MIDDLE");
  const [customMap, setCustomMap] = useState<Record<string, string>>({});
  const [checkValue, setCheckValue] = useState<string>("100");
  const [checkLabel, setCheckLabel] = useState<string>("");

  const dirty = selected !== currentMode;

  const mapping = useMemo(() => {
    if (!grades) return {};
    const out: Record<string, unknown> = {};
    if (currentMode === "HURUF" && selected === "ANGKA") {
      for (const g of grades) {
        if (method === "CUSTOM") {
          const v = Number(customMap[g.label]);
          if (Number.isInteger(v)) out[g.label] = v;
        } else {
          out[g.label] = method === "LOWER" ? g.minValue : method === "UPPER" ? g.maxValue : Math.round((g.minValue + g.maxValue) / 2);
        }
      }
      return out;
    }
    if (currentMode === "CENTANG" && selected === "ANGKA") {
      const v = Number(customMap["CHECK"] ?? checkValue);
      if (Number.isInteger(v)) out["CHECK"] = v;
      return out;
    }
    if (currentMode === "CENTANG" && selected === "HURUF") {
      const label = method === "CUSTOM" ? customMap["CHECK"] ?? "" : checkLabel || grades[0]?.label || "";
      if (label) out["CHECK"] = label;
      return out;
    }
    // ANGKA→HURUF uses grade ranges; ANGKA/HURUF→CENTANG needs no mapping.
    return out;
  }, [grades, currentMode, selected, method, customMap, checkValue, checkLabel]);

  function openConversion() {
    // Load current grades for the mapping table (server action, cheap).
    import("@/app/actions/tahfidz-admin").then(async ({ loadTahfidzConfigAction }) => {
      const cfg = await loadTahfidzConfigAction();
      setGrades(cfg.grades);
      setDialogOpen(true);
    });
  }

  function proceed() {
    if (dirty && hasAssessments && !dialogOpen) {
      openConversion();
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      let res: ActionResult;
      if (hasAssessments && dirty) {
        fd.set("toMode", selected);
        fd.set("method", method);
        fd.set("mapping", JSON.stringify(mapping));
        res = await convertModeAction(null, fd);
      } else {
        fd.set("mode", selected);
        res = await setModeAction(null, fd);
      }
      if (res.success) {
        toast.success(res.success);
        setDialogOpen(false);
        window.location.reload();
      } else if (res.error) {
        toast.error(res.error);
      }
    });
  }

  const needsCheckMap = currentMode === "CENTANG" && selected !== "CENTANG";
  const needsGradeMap = currentMode === "HURUF" && selected === "ANGKA";
  const usesRanges = currentMode === "ANGKA" && selected === "HURUF";

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setSelected(m.value)}
            className={cn(
              "rounded-xl border px-4 py-3.5 text-left transition-all",
              selected === m.value
                ? "border-blue-300 bg-blue-50 ring-1 ring-blue-300"
                : "hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            <p className={cn("text-sm font-bold", selected === m.value ? "text-blue-800" : "text-slate-800")}>
              {m.label}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{m.desc}</p>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          onClick={proceed}
          disabled={pending || !dirty}
          className="bg-gradient-brand hover:opacity-90"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Repeat className="size-4" />}
          Simpan Mode
        </Button>
        {!dirty && <span className="text-muted-foreground text-xs">Mode aktif saat ini.</span>}
        {dirty && hasAssessments && (
          <span className="text-amber-700 dark:text-amber-300 rounded-lg bg-amber-50 dark:bg-amber-500/15 px-3 py-1.5 text-xs font-medium">
            Sudah ada penilaian tersimpan — dialog konversi akan dibuka.
          </span>
        )}
      </div>

      {/* Conversion dialog (rules #16-#22) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Konversi Nilai Diperlukan
              <span className="text-muted-foreground text-sm font-normal">
                {currentMode} <ArrowRight className="inline size-3.5" /> {selected}
              </span>
            </DialogTitle>
            <DialogDescription>
              Data penilaian lama tidak diubah tanpa persetujuan Anda. Pilih metode konversi untuk
              setiap nilai, lalu tinjau preview.
            </DialogDescription>
          </DialogHeader>

          {needsGradeMap && grades && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { v: "LOWER", l: "Nilai bawah" },
                    { v: "MIDDLE", l: "Nilai tengah" },
                    { v: "UPPER", l: "Nilai atas" },
                    { v: "CUSTOM", l: "Custom" },
                  ] as { v: Method; l: string }[]
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setMethod(o.v)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                      method === o.v
                        ? "border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-300"
                        : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="py-2">Grade</th>
                    <th className="py-2">Rentang</th>
                    <th className="py-2">Konversi</th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g) => {
                    const converted =
                      method === "CUSTOM"
                        ? customMap[g.label] ?? ""
                        : String(
                            method === "LOWER" ? g.minValue : method === "UPPER" ? g.maxValue : Math.round((g.minValue + g.maxValue) / 2)
                          );
                    return (
                      <tr key={g.label} className="border-b last:border-0">
                        <td className="py-2 font-bold text-foreground">{g.label}</td>
                        <td className="text-muted-foreground py-2">{g.minValue}–{g.maxValue}</td>
                        <td className="py-2">
                          {method === "CUSTOM" ? (
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              value={customMap[g.label] ?? ""}
                              onChange={(e) =>
                                setCustomMap((m) => ({ ...m, [g.label]: e.target.value }))
                              }
                              className="h-8 w-20"
                            />
                          ) : (
                            <span className="font-semibold text-role-strong">{converted}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {needsCheckMap && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Bagaimana status <span className="text-lg font-bold text-emerald-600 dark:text-emerald-300">✓</span> dikonversi?
              </p>
              <div className="flex flex-wrap gap-2">
                {selected === "ANGKA" ? (
                  <>
                    {["100", "95"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => {
                          setMethod("MIDDLE");
                          setCheckValue(v);
                          setCustomMap({});
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                          method !== "CUSTOM" && checkValue === v
                            ? "border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-300"
                            : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        ✓ → {v}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMethod("CUSTOM")}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                        method === "CUSTOM"
                          ? "border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-300"
                          : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Custom
                    </button>
                    {method === "CUSTOM" && (
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        placeholder="1-100"
                        value={customMap["CHECK"] ?? ""}
                        onChange={(e) => setCustomMap((m) => ({ ...m, CHECK: e.target.value }))}
                        className="h-8 w-24"
                      />
                    )}
                  </>
                ) : (
                  <>
                    {(grades ?? []).map((g) => (
                      <button
                        key={g.label}
                        type="button"
                        onClick={() => {
                          setMethod("MIDDLE");
                          setCheckLabel(g.label);
                          setCustomMap({});
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                          method !== "CUSTOM" && checkLabel === g.label
                            ? "border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-300"
                            : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        ✓ → {g.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setMethod("CUSTOM")}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold",
                        method === "CUSTOM"
                          ? "border-blue-300 bg-blue-50 text-blue-800 ring-1 ring-blue-300"
                          : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      Custom
                    </button>
                    {method === "CUSTOM" && (
                      <Input
                        value={customMap["CHECK"] ?? ""}
                        onChange={(e) => setCustomMap((m) => ({ ...m, CHECK: e.target.value }))}
                        placeholder="Label grade"
                        className="h-8 w-28"
                      />
                    )}
                  </>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                Status kosong / belum dinilai tetap kosong — tidak diberi nilai otomatis.
              </p>
            </div>
          )}

          {usesRanges && (
            <p className="text-muted-foreground text-sm">
              Nilai angka akan dikonversi ke grade berdasarkan rentang yang sudah dikonfigurasi
              (konfigurasikan terlebih dahulu di bagian Grade setelah mode HURUF aktif).
            </p>
          )}

          {currentMode !== "CENTANG" && selected === "CENTANG" && (
            <p className="text-muted-foreground text-sm">
              Semua nilai lama akan menjadi status ✓ (centang). Riwayat tetap menyimpan nilai aslinya.
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={proceed} disabled={pending} className="bg-gradient-brand hover:opacity-90">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Terapkan Konversi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
