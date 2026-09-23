"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/app/actions/v10";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/v10-shared";
import { formatDate } from "@/lib/utils";
import type { NotificationRow } from "@/lib/v10";
import { cn } from "@/lib/utils";

/**
 * Notification bell (rule #59/#60). The unread count + list are rendered as
 * props from the server shell; mark-read actions revalidate via router.refresh().
 */
export function NotificationBell({
  items,
  unread,
}: {
  items: NotificationRow[];
  unread: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function openItem(n: NotificationRow) {
    startTransition(async () => {
      if (!n.read_at) await markNotificationReadAction(n.id);
      router.refresh();
      setOpen(false);
      if (n.link) router.push(n.link);
    });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifikasi"
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted"
      >
        {unread > 0 ? <BellRing className="size-5 text-role" /> : <Bell className="size-5" />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[0.6rem] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-500/20 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <p className="text-sm font-semibold text-foreground">Notifikasi</p>
            {unread > 0 && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await markAllNotificationsReadAction();
                    router.refresh();
                  })
                }
                className="h-7 text-xs text-role-strong"
              >
                <CheckCheck className="size-3.5" /> Tandai dibaca
              </Button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">Belum ada notifikasi.</p>
            ) : (
              <ul className="divide-y">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => openItem(n)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 dark:hover:bg-slate-500/5",
                        !n.read_at && "bg-blue-50/60 dark:bg-blue-500/5"
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-role-strong">
                          {NOTIFICATION_TYPE_LABEL[n.type] ?? "Info"}
                        </span>
                        <span className="text-muted-foreground text-[0.65rem]">{formatDate(n.created_at)}</span>
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">{n.title}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
