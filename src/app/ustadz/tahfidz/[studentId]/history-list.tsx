import { Badge } from "@/components/ui/badge";

type HistoryItem = {
  id: string;
  surahName: string;
  scoreLabel: string | null;
  scoreValue: number | null;
  status: "BELUM" | "DIPELAJARI" | "DINILAI";
  changeKind: string;
  createdAt: string;
};

const KIND_LABEL: Record<string, { label: string; className: string }> = {
  CREATE: { label: "Baru", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  UPDATE: { label: "Edit", className: "border-blue-200 bg-blue-50 text-blue-700" },
  CONVERT: { label: "Konversi", className: "border-amber-200 bg-amber-50 text-amber-700" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function scoreText(item: HistoryItem) {
  if (item.status !== "DINILAI") {
    return item.status === "DIPELAJARI" ? "Dipelajari" : "Belum mulai";
  }
  if (item.scoreLabel) return item.scoreLabel;
  if (item.scoreValue !== null) return String(item.scoreValue);
  return "✓";
}

export function HistoryList({ items }: { items: HistoryItem[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">Belum ada riwayat.</p>;
  }

  return (
    <ol className="space-y-3">
      {items.map((h) => {
        const kind = KIND_LABEL[h.changeKind] ?? KIND_LABEL.UPDATE;
        return (
          <li key={h.id} className="flex items-start gap-3">
            <span className="bg-blue-100 dark:bg-blue-500/15 mt-1.5 size-2 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{h.surahName}</p>
                <span className="inline-flex items-center rounded-lg bg-gradient-brand px-2 py-0.5 text-[0.7rem] font-bold text-white shadow-card">
                  {scoreText(h)}
                </span>
                <Badge variant="outline" className={`text-[0.7rem] ${kind.className}`}>
                  {kind.label}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">{formatDate(h.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
