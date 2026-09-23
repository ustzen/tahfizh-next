"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { submitFeedbackAction } from "@/app/actions/v10";
import { FEEDBACK_CATEGORY_LABEL, FEEDBACK_TARGET_LABEL } from "@/lib/v10-shared";

const CATEGORIES = ["KRITIK", "SARAN", "LAPORAN_ERROR", "PERMINTAAN_FITUR", "PENGEMBANGAN", "LAINNYA"];
const TARGETS = ["USTADZ", "KOORDINATOR", "ADMIN", "LEMBAGA", "DEVELOPER"];

/**
 * Feedback submission form (rule #46-#49): category, target, optional teacher,
 * anonymous option, and auto-detected page URL for error reports.
 */
export function FeedbackForm({
  teacherOptions,
  pageUrl,
  compact,
}: {
  teacherOptions: { id: string; name: string }[];
  pageUrl: string;
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState(submitFeedbackAction, null);
  const [target, setTarget] = useState("USTADZ");
  const [category, setCategory] = useState("SARAN");
  const [anonymous, setAnonymous] = useState(false);

  return (
    <Card className="shadow-card rounded-2xl">
      <CardContent className={compact ? "pt-5" : "pt-6"}>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="pageUrl" value={pageUrl} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Jenis masukan</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {FEEDBACK_CATEGORY_LABEL[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ditujukan kepada</Label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGETS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {FEEDBACK_TARGET_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {target === "USTADZ" && (
            <div className="space-y-1.5">
              <Label htmlFor="teacherId">Pilih guru</Label>
              <select
                id="teacherId"
                name="teacherId"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                defaultValue=""
              >
                <option value="" disabled>
                  — Pilih guru —
                </option>
                {teacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {category === "LAPORAN_ERROR" && (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
              Laporan error otomatis menyertakan halaman: <span className="font-mono">{pageUrl}</span>
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="fb-title">Judul</Label>
            <Input id="fb-title" name="title" required minLength={3} maxLength={160} placeholder="Ringkasan masukan Anda" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fb-content">Isi</Label>
            <Textarea
              id="fb-content"
              name="content"
              rows={5}
              required
              minLength={5}
              maxLength={4000}
              placeholder="Tuliskan kritik, saran, atau laporan Anda sedetail mungkin…"
            />
          </div>

          {/* Radix Checkbox tidak mengirim nilai form — pakai hidden input + state. */}
          <input type="hidden" name="anonymous" value={anonymous ? "on" : ""} />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <Checkbox checked={anonymous} onCheckedChange={(v) => setAnonymous(v === true)} />
            Kirim sebagai anonim
            <span className="text-muted-foreground">(identitas hanya dapat dilihat Developer untuk masukan ke Developer)</span>
          </label>

          {state?.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{state.error}</p>
          )}
          {state?.success && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{state.success}</p>
          )}

          <Button type="submit" disabled={pending} className="bg-gradient-brand hover:opacity-90">
            {pending ? "Mengirim…" : "Kirim Masukan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
