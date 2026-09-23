"use client";

import { useActionState } from "react";
import { MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { saveHalaqahWhatsappAction } from "@/app/actions/v10";

/**
 * WhatsApp group card for a halaqah (rule #42/#43). ADMIN can set/update the
 * chat.whatsapp.com invite link; USTADZ sees a read-only "Buka Grup" button.
 */
export function WaGroupCard({
  halaqahId,
  initialUrl,
  canEdit,
}: {
  halaqahId: string;
  initialUrl: string | null;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveHalaqahWhatsappAction, null);

  return (
    <Card className="shadow-card rounded-2xl">
      <CardContent className="pt-5">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <MessageCircle className="size-4.5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Grup WhatsApp</h3>
            <p className="text-muted-foreground text-xs">
              {canEdit ? "Tautan grup untuk keluarga santri anggota halaqah." : "Tautan grup halaqah ini."}
            </p>
          </div>
        </div>

        {canEdit ? (
          <form action={formAction} className="mt-3 space-y-2">
            <input type="hidden" name="halaqahId" value={halaqahId} />
            <Input
              name="whatsappGroupUrl"
              defaultValue={initialUrl ?? ""}
              placeholder="https://chat.whatsapp.com/…"
            />
            {state?.error && <p className="text-xs text-red-600 dark:text-red-300">{state.error}</p>}
            {state?.success && <p className="text-xs text-emerald-600 dark:text-emerald-300">{state.success}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending} variant="role">
                {pending ? "Menyimpan…" : "Simpan Tautan"}
              </Button>
              {initialUrl && (
                <Button asChild size="sm" variant="outline">
                  <a href={initialUrl} target="_blank" rel="noopener noreferrer">
                    Buka Grup
                  </a>
                </Button>
              )}
            </div>
          </form>
        ) : initialUrl ? (
          <Button asChild size="sm" variant="outline" className="mt-3">
            <a href={initialUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" /> Buka Grup
            </a>
          </Button>
        ) : (
          <p className="text-muted-foreground mt-3 text-xs">Tautan grup belum diatur admin.</p>
        )}
      </CardContent>
    </Card>
  );
}

