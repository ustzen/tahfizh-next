"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Plus,
  Redo2,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  COMPONENT_META,
  GRID,
  REPORT_COMPONENT_TYPES,
  canvasSize,
  newComponentId,
  snap,
} from "@/lib/report-shared";
import type { ReportComponent, ReportLayout, ReportStyle } from "@/lib/report-shared";
import { ReportCanvas } from "@/components/report/report-canvas";
import type { CanvasContext } from "@/components/report/component-content";
import type { ReportData } from "@/lib/report-shared";

/**
 * TAHFIZH V9 — Report Builder (rule #7-#12, #52-#59).
 * Desktop-first editor; drag/resize/snap on the canvas, property panel,
 * undo/redo, page management. Saves only on [Simpan] (rule #54/#55) —
 * never a request per drag pixel.
 */

type BuilderProps = {
  templateId: string;
  initialName: string;
  paper: string;
  orientation: string;
  initialLayout: ReportLayout;
  ctx: CanvasContext;
  data: ReportData | null;
  logoUrl: string | null;
  watermarkUrl: string | null;
  saveAction: (layout: ReportLayout) => Promise<{ error?: string; success?: string }>;
};

type DragState =
  | { kind: "move"; id: string; startX: number; startY: number; origX: number; origY: number }
  | { kind: "resize"; id: string; startX: number; startY: number; origW: number; origH: number }
  | null;

const STYLE_PRESETS: { label: string; size: number; bold?: boolean }[] = [
  { label: "Kecil", size: 10 },
  { label: "Normal", size: 13 },
  { label: "Judul", size: 20, bold: true },
  { label: "Besar", size: 26, bold: true },
];

export function ReportBuilder({
  templateId,
  initialName,
  paper,
  orientation,
  initialLayout,
  ctx,
  data,
  logoUrl,
  watermarkUrl,
  saveAction,
}: BuilderProps) {
  const [layout, setLayout] = useState<ReportLayout>(initialLayout);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Undo/redo history of layout snapshots (rule #54) — layout is small JSON.
  const history = useRef<ReportLayout[]>([initialLayout]);
  const historyIdx = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const drag = useRef<DragState>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const { w: canvasW, h: canvasH } = useMemo(() => canvasSize(paper, orientation), [paper, orientation]);
  const page = layout.pages[pageIndex] ?? { components: [] };
  const selected = page.components.find((c) => c.id === selectedId) ?? null;

  const commit = useCallback((next: ReportLayout) => {
    setLayout(next);
    // push snapshot for undo
    const trimmed = history.current.slice(0, historyIdx.current + 1);
    trimmed.push(next);
    history.current = trimmed.slice(-60);
    historyIdx.current = trimmed.length - 1;
    setCanUndo(historyIdx.current > 0);
    setCanRedo(false);
  }, []);

  const undo = useCallback(() => {
    if (historyIdx.current <= 0) return;
    historyIdx.current -= 1;
    setLayout(history.current[historyIdx.current]);
    setCanUndo(historyIdx.current > 0);
    setCanRedo(true);
  }, []);

  const redo = useCallback(() => {
    if (historyIdx.current >= history.current.length - 1) return;
    historyIdx.current += 1;
    setLayout(history.current[historyIdx.current]);
    setCanUndo(true);
    setCanRedo(historyIdx.current < history.current.length - 1);
  }, []);

  // Keyboard shortcuts (rule #87)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
      if (e.key === "Delete" && selectedId) {
        removeComponent(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, selectedId, layout]);

  /* ----------------------------- mutations ------------------------------- */

  const updateComponent = useCallback(
    (id: string, patch: Partial<ReportComponent>, record = true) => {
      setLayout((prev) => {
        const pages = prev.pages.map((p, i) =>
          i !== pageIndex
            ? p
            : { ...p, components: p.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
        );
        const next = { pages };
        if (record) commit(next);
        return next;
      });
    },
    [pageIndex, commit]
  );

  const updateStyle = (id: string, patch: Partial<ReportStyle>) => {
    setLayout((prev) => {
      const pages = prev.pages.map((p, i) =>
        i !== pageIndex
          ? p
          : {
              ...p,
              components: p.components.map((c) =>
                c.id === id ? { ...c, style: { ...c.style, ...patch } } : c
              ),
            }
      );
      commit({ pages });
      return { pages };
    });
  };

  const updateProps = (id: string, patch: Record<string, unknown>) => {
    setLayout((prev) => {
      const pages = prev.pages.map((p, i) =>
        i !== pageIndex
          ? p
          : {
              ...p,
              components: p.components.map((c) =>
                c.id === id ? { ...c, props: { ...c.props, ...patch } } : c
              ),
            }
      );
      commit({ pages });
      return { pages };
    });
  };

  const addComponent = (type: string) => {
    const meta = COMPONENT_META[type];
    if (!meta) return;
    const maxZ = Math.max(0, ...page.components.map((c) => c.z));
    const comp: ReportComponent = {
      id: newComponentId(),
      type,
      x: snap(40 + page.components.length * 8),
      y: snap(40 + page.components.length * 8),
      w: Math.min(meta.w, canvasW - 32),
      h: meta.h,
      z: maxZ + 1,
      locked: false,
      hidden: false,
      style: {},
      props: type === "CUSTOM_TEXT" || type === "NOTES" ? { text: "" } : {},
    };
    const pages = layout.pages.map((p, i) =>
      i === pageIndex ? { ...p, components: [...p.components, comp] } : p
    );
    commit({ pages });
    setSelectedId(comp.id);
  };

  const removeComponent = (id: string) => {
    const pages = layout.pages.map((p, i) =>
      i === pageIndex ? { ...p, components: p.components.filter((c) => c.id !== id) } : p
    );
    commit({ pages });
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateComponent = (id: string) => {
    const src = page.components.find((c) => c.id === id);
    if (!src) return;
    const maxZ = Math.max(0, ...page.components.map((c) => c.z));
    const copy: ReportComponent = { ...src, id: newComponentId(), x: snap(src.x + 16), y: snap(src.y + 16), z: maxZ + 1, locked: false };
    const pages = layout.pages.map((p, i) =>
      i === pageIndex ? { ...p, components: [...p.components, copy] } : p
    );
    commit({ pages });
    setSelectedId(copy.id);
  };

  const addPage = () => commit({ pages: [...layout.pages, { components: [] }] });
  const duplicatePage = () => {
    const src = layout.pages[pageIndex];
    const copies = src.components.map((c) => ({ ...c, id: newComponentId() }));
    const pages = [...layout.pages];
    pages.splice(pageIndex + 1, 0, { components: copies });
    commit({ pages });
    setPageIndex(pageIndex + 1);
  };
  const removePage = () => {
    if (layout.pages.length <= 1) return;
    const pages = layout.pages.filter((_, i) => i !== pageIndex);
    commit({ pages });
    setPageIndex(Math.max(0, pageIndex - 1));
    setSelectedId(null);
  };
  const movePage = (dir: -1 | 1) => {
    const target = pageIndex + dir;
    if (target < 0 || target >= layout.pages.length) return;
    const pages = [...layout.pages];
    [pages[pageIndex], pages[target]] = [pages[target], pages[pageIndex]];
    commit({ pages });
    setPageIndex(target);
  };

  /* ---------------------------- drag & resize ----------------------------- */

  const onPointerDown = (e: React.PointerEvent, comp: ReportComponent, kind: "move" | "resize") => {
    if (comp.locked && kind === "move") return; // rule #11
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSelectedId(comp.id);
    drag.current =
      kind === "move"
        ? { kind, id: comp.id, startX: e.clientX, startY: e.clientY, origX: comp.x, origY: comp.y }
        : { kind, id: comp.id, startX: e.clientX, startY: e.clientY, origW: comp.w, origH: comp.h };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (d.kind === "move") {
        const x = Math.min(Math.max(0, snap(d.origX + dx)), canvasW - 40);
        const y = Math.min(Math.max(0, snap(d.origY + dy)), canvasH - 24);
        updateComponent(d.id, { x, y }, false); // no history spam while dragging
      } else {
        const w = Math.min(Math.max(48, snap(d.origW + dx)), canvasW);
        const h = Math.min(Math.max(24, snap(d.origH + dy)), canvasH);
        updateComponent(d.id, { w, h }, false);
      }
    };
    const onUp = () => {
      const d = drag.current;
      if (d) {
        drag.current = null;
        // Record final position as one undo step.
        setLayout((prev) => {
          commit(prev);
          return prev;
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [canvasW, canvasH, updateComponent, commit]);

  /* -------------------------------- save --------------------------------- */

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await saveAction(layout);
      setMessage(
        res.error
          ? { kind: "err", text: res.error }
          : { kind: "ok", text: res.success || "Layout tersimpan." }
      );
    } catch {
      setMessage({ kind: "err", text: "Raport belum berhasil disimpan. Silakan coba lagi." });
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => {
    const groups: Record<string, string[]> = {};
    for (const t of REPORT_COMPONENT_TYPES) {
      const g = COMPONENT_META[t].group;
      (groups[g] ??= []).push(t);
    }
    return groups;
  }, []);

  return (
    <div className="space-y-3">
      {/* Toolbar (rule #52) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white/80 p-2 shadow-card backdrop-blur">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} aria-label="Urungkan">
            <Undo2 className="h-4 w-4" /> Undo
          </Button>
          <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} aria-label="Ulangi">
            <Redo2 className="h-4 w-4" /> Redo
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{initialName}</span>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
            Halaman {pageIndex + 1}/{layout.pages.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (typeof window !== "undefined") window.open(`${window.location.pathname}/preview`, "_blank");
            }}
          >
            Preview
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving}
            className="bg-primary text-white"
          >
            <Save className="mr-1 h-4 w-4" />
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
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

      <div className="no-print grid gap-3 lg:grid-cols-[220px_1fr_280px]">
        {/* Component palette (rule #13/#14) */}
        <Card className="order-2 h-fit shadow-card lg:order-1">
          <CardContent className="space-y-3 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-blue-800">Komponen</p>
            {Object.entries(grouped).map(([group, types]) => (
              <div key={group} className="space-y-1">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground/80">{group}</p>
                {types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => addComponent(t)}
                    className="flex w-full items-center justify-between rounded-lg border border-border/60 px-2.5 py-1.5 text-left text-xs font-medium text-foreground/85 transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    {COMPONENT_META[t].label}
                    <Plus className="h-3 w-3 text-blue-500" />
                  </button>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Canvas (rule #7/#8/#9/#10) */}
        <div className="order-1 flex flex-col items-center gap-3 lg:order-2">
          <div
            ref={canvasRef}
            className="relative overflow-auto rounded-xl bg-muted p-4"
            style={{ maxHeight: "78vh" }}
          >
            <ReportCanvas
              layout={layout}
              ctx={ctx}
              data={data}
              logoUrl={logoUrl}
              watermarkUrl={watermarkUrl}
              paper={paper}
              orientation={orientation}
              selectedId={selectedId}
              onSelectComponent={setSelectedId}
              renderComponentWrapper={(comp, children) => (
                <div
                  className={cn(
                    "group h-full w-full",
                    comp.hidden && "opacity-30",
                    comp.locked ? "cursor-not-allowed" : "cursor-move"
                  )}
                  onPointerDown={(e) => onPointerDown(e, comp, "move")}
                >
                  {children}
                  {/* Resize handle (rule #9) */}
                  {!comp.locked ? (
                    <span
                      aria-hidden
                      onPointerDown={(e) => onPointerDown(e, comp, "resize")}
                      className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-blue-400 bg-white/70 opacity-0 transition group-hover:opacity-100"
                    />
                  ) : (
                    <Lock className="absolute right-1 top-1 h-3 w-3 text-amber-500" />
                  )}
                </div>
              )}
            />
          </div>

          {/* Page management (rule #58/#59) */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs">
            <Button variant="outline" size="sm" onClick={() => movePage(-1)} disabled={pageIndex === 0}>
              ←
            </Button>
            {layout.pages.map((_, i) => (
              <Button
                key={i}
                variant={i === pageIndex ? "default" : "outline"}
                size="sm"
                className={cn(i === pageIndex && "bg-blue-600 text-white")}
                onClick={() => {
                  setPageIndex(i);
                  setSelectedId(null);
                }}
              >
                {i + 1}
              </Button>
            ))}
            <Button variant="outline" size="sm" onClick={() => movePage(1)} disabled={pageIndex === layout.pages.length - 1}>
              →
            </Button>
            <Button variant="outline" size="sm" onClick={addPage}>
              <Plus className="mr-1 h-3 w-3" /> Halaman
            </Button>
            <Button variant="outline" size="sm" onClick={duplicatePage}>
              <Copy className="mr-1 h-3 w-3" /> Duplikat
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-red-600"
              onClick={removePage}
              disabled={layout.pages.length <= 1}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Property panel (rule #11/#12/#53) */}
        <Card className="order-3 h-fit shadow-card">
          <CardContent className="space-y-3 p-3">
            {selected ? (
              <>
                <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
                  {COMPONENT_META[selected.type]?.label ?? selected.type}
                </p>

                <div className="flex items-center justify-between">
                  <Label htmlFor="lock" className="text-xs text-muted-foreground">Kunci posisi</Label>
                  <Switch
                    id="lock"
                    checked={selected.locked}
                    onCheckedChange={(v) => updateComponent(selected.id, { locked: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="vis" className="text-xs text-muted-foreground">Tampilkan</Label>
                  <Switch
                    id="vis"
                    checked={!selected.hidden}
                    onCheckedChange={(v) => updateComponent(selected.id, { hidden: !v })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/80">X</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={selected.x}
                      onChange={(e) => updateComponent(selected.id, { x: snap(Number(e.target.value) || 0) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/80">Y</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={selected.y}
                      onChange={(e) => updateComponent(selected.id, { y: snap(Number(e.target.value) || 0) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/80">Lebar</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={selected.w}
                      onChange={(e) => updateComponent(selected.id, { w: Math.max(48, snap(Number(e.target.value) || 48)) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/80">Tinggi</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={selected.h}
                      onChange={(e) => updateComponent(selected.id, { h: Math.max(24, snap(Number(e.target.value) || 24)) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/80">Ukuran font</Label>
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={selected.style.fontSize ?? ""}
                      placeholder="13"
                      onChange={(e) => updateStyle(selected.id, { fontSize: Number(e.target.value) || undefined })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/80">Perataan</Label>
                    <div className="flex gap-1">
                      {(["left", "center", "right"] as const).map((a) => (
                        <Button
                          key={a}
                          variant={selected.style.align === a ? "default" : "outline"}
                          size="sm"
                          className={cn("h-8 flex-1 px-0 text-[10px]", selected.style.align === a && "bg-blue-600 text-white")}
                          onClick={() => updateStyle(selected.id, { align: a })}
                        >
                          {a === "left" ? "Kiri" : a === "center" ? "Tengah" : "Kanan"}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {STYLE_PRESETS.map((p) => (
                    <Button
                      key={p.label}
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => updateStyle(selected.id, { fontSize: p.size, bold: p.bold ?? selected.style.bold })}
                    >
                      {p.label}
                    </Button>
                  ))}
                  <Button
                    variant={selected.style.bold ? "default" : "outline"}
                    size="sm"
                    className={cn("h-7 px-2 text-[10px] font-bold", selected.style.bold && "bg-blue-600 text-white")}
                    onClick={() => updateStyle(selected.id, { bold: !selected.style.bold })}
                  >
                    B
                  </Button>
                  <Button
                    variant={selected.style.italic ? "default" : "outline"}
                    size="sm"
                    className={cn("h-7 px-2 text-[10px] italic", selected.style.italic && "bg-blue-600 text-white")}
                    onClick={() => updateStyle(selected.id, { italic: !selected.style.italic })}
                  >
                    I
                  </Button>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground/80">Opasitas (%)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={100}
                    className="h-8 text-xs"
                    value={selected.style.opacity ?? 100}
                    onChange={(e) => updateStyle(selected.id, { opacity: Math.min(100, Math.max(10, Number(e.target.value) || 100)) })}
                  />
                </div>

                {(selected.type === "CUSTOM_TEXT" || selected.type === "NOTES" || selected.type === "FOOTER" || selected.type === "REPORT_TITLE") && (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground/80">Teks (mendukung binding)</Label>
                    <textarea
                      className="min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs"
                      value={String(selected.props?.text ?? "")}
                      onChange={(e) => updateProps(selected.id, { text: e.target.value })}
                    />
                  </div>
                )}

                {selected.type === "SIGNATURES" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Tanda tangan guru</Label>
                      <Switch
                        checked={selected.props?.showTeacher !== false}
                        onCheckedChange={(v) => updateProps(selected.id, { showTeacher: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Tanda tangan kepala</Label>
                      <Switch
                        checked={selected.props?.showHead !== false}
                        onCheckedChange={(v) => updateProps(selected.id, { showHead: v })}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-1.5 border-t pt-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => duplicateComponent(selected.id)}>
                    <Copy className="mr-1 h-3 w-3" /> Duplikat
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs text-red-600"
                    onClick={() => removeComponent(selected.id)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Hapus
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/80">
                  Grid snap {GRID}px • Ctrl+Z undo • Ctrl+S simpan • drag titik kanan-bawah untuk resize
                </p>
              </>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground/80">
                <ArrowDownToLine className="mx-auto mb-2 h-6 w-6 text-blue-300" />
                Pilih komponen di kanvas untuk mengatur posisi, ukuran, dan gaya.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live mini-preview under the builder for small screens (rule #56) */}
      <div className="lg:hidden">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Pratinjau cepat (mobile)</p>
        <div className="max-h-[50vh] overflow-auto rounded-xl bg-muted p-3">
          <ReportCanvas
            layout={layout}
            ctx={ctx}
            data={data}
            logoUrl={logoUrl}
            watermarkUrl={watermarkUrl}
            paper={paper}
            orientation={orientation}
          />
        </div>
      </div>
    </div>
  );
}
