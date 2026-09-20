import { ShieldCheck } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { roleLabel } from "@/lib/roles";
import type { AuditRow } from "@/app/actions/audit-log";

/** Judul ramah untuk kode aksi audit (mis. terminology.update → "Terminologi diperbarui"). */
const ACTION_LABELS: Record<string, string> = {
  "terminology.update": "Terminologi diperbarui",
  "identity.update": "Identitas lembaga diperbarui",
  "identity_types.update": "Jenis identitas diperbarui",
  "leader.update": "Data pimpinan diperbarui",
  "halaqah.create": "Halaqah dibuat",
  "halaqah.update": "Halaqah diperbarui",
  "halaqah.delete": "Halaqah dihapus",
  "tenant_settings.update": "Pengaturan lembaga diperbarui",
};

function formatDetail(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => {
      const key = k
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const val = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${key}: ${val}`;
    })
    .join(" · ");
}

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function AuditLogList({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldCheck />
          </EmptyMedia>
          <EmptyTitle>Belum ada aktivitas tercatat.</EmptyTitle>
          <EmptyDescription>
            Perubahan pengaturan lembaga (terminologi, identitas, pimpinan) dan aksi halaqah akan
            tercatat di sini secara otomatis.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ol className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {ACTION_LABELS[r.action] ?? r.action}
            </p>
            {Object.keys(r.detail ?? {}).length > 0 && (
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {formatDetail(r.detail)}
              </p>
            )}
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="text-xs font-medium text-foreground/85">
              {r.actor_name ?? "Sistem"}
              {r.actor_role ? ` · ${roleLabel(r.actor_role)}` : ""}
            </p>
            <p className="text-muted-foreground text-xs">{dateFormatter.format(new Date(r.created_at))}</p>
          </div>
          <span className="sr-only">{r.action}</span>
        </li>
      ))}
    </ol>
  );
}
