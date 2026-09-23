import { MessageSquareText } from "lucide-react";

import { PageHeader, CardBox } from "@/components/dashboard/section";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { requireRole } from "@/lib/auth";
import { getDevFeedbackList, getFeedbackList } from "@/lib/v10";
import {
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_STATUS_LABEL,
  statusTone,
} from "@/lib/v10-shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Kritik & Saran" };

/**
 * Developer feedback console (rule #51/#52/#58): global list of all feedback
 * addressed to DEVELOPER with REAL identities (even when submitted anonymous),
 * plus tenant origin. Moderation uses the shared list view for DEV-targeted
 * rows via feedback_set_status.
 */
export default async function DeveloperSaranPage() {
  await requireRole(["DEVELOPER"], "/developer/saran");
  const [rows, ownList] = await Promise.all([getDevFeedbackList(), getFeedbackList()]);

  const ownDevRows = ownList.filter((r) => r.can_moderate);

  return (
    <div>
      <PageHeader
        title="Kritik & Saran"
        description="Masukan dari seluruh lembaga yang ditujukan ke Developer."
      />

      {rows.length === 0 ? (
        <Card className="shadow-card rounded-2xl">
          <CardContent className="py-2">
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareText />
                </EmptyMedia>
                <EmptyTitle>Belum ada masukan untuk Developer.</EmptyTitle>
                <EmptyDescription>
                  Masukan dari pengguna platform (termasuk anonim) akan tampil di sini.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((f) => (
            <Card key={f.id} className="shadow-card rounded-2xl">
              <CardContent className="pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-border bg-muted/50 text-muted-foreground">
                    {FEEDBACK_CATEGORY_LABEL[f.category] ?? f.category}
                  </Badge>
                  <Badge variant="outline" className={statusTone(f.status)}>
                    {FEEDBACK_STATUS_LABEL[f.status] ?? f.status}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {f.tenant_name ? `${f.tenant_name} (${f.tenant_code})` : "Platform"}
                  </span>
                </div>
                <p className="mt-2 font-semibold text-foreground">{f.title}</p>
                <p className="text-muted-foreground text-xs">
                  {f.is_anonymous ? "Dikirim anonim — identitas asli: " : ""}
                  {f.sender_name}
                  {f.sender_email ? ` · ${f.sender_email}` : ""} · {formatDate(f.created_at)}
                </p>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {f.content}
                </p>
                {f.page_url && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Halaman: <span className="font-mono">{f.page_url}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Developer's own submissions (e.g. feedback to other targets). */}
      {ownDevRows.length > 0 && (
        <CardBox className="mt-8">
          <h3 className="mb-1 font-semibold text-foreground">Masukan Anda</h3>
          <p className="text-muted-foreground mb-2 text-xs">Masukan yang pernah Anda kirim ke pihak lain.</p>
          <ul className="divide-y">
            {ownDevRows
              .filter((r) => r.is_own)
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                    <p className="text-muted-foreground text-xs">{formatDate(r.created_at)}</p>
                  </div>
                  <Badge variant="outline" className={statusTone(r.status)}>
                    {FEEDBACK_STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </li>
              ))}
          </ul>
        </CardBox>
      )}
    </div>
  );
}
