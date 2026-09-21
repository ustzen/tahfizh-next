"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Trash2, Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CHAT_MAX_LENGTH,
  chatDayLabel,
  chatRoleLabel,
  chatRoleTone,
  chatTimeLabel,
  type ChatMessage,
  type ChatRoom,
} from "@/lib/chat-shared";

const POLL_MS = 4000;
const roomKey = (id: string | null) => id ?? "lembaga";

/** Susun pesan jadi kelompok per hari, untuk label pemisah "Hari ini" dst. */
function groupByDay(items: ChatMessage[]) {
  const out: { label: string; items: ChatMessage[] }[] = [];
  for (const m of items) {
    const label = chatDayLabel(m.createdAt);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(m);
    else out.push({ label, items: [m] });
  }
  return out;
}

export function ChatPanel({
  rooms,
  initialRoomId,
  initialMessages,
  canModerate,
}: {
  rooms: ChatRoom[];
  initialRoomId: string | null;
  initialMessages: ChatMessage[];
  canModerate: boolean;
}) {
  const [activeRoom, setActiveRoom] = useState<string | null>(initialRoomId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const activeRoomRef = useRef(activeRoom);
  const lastTsRef = useRef<string | null>(initialMessages.at(-1)?.createdAt ?? null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  // Auto-scroll ke bawah saat pesan baru masuk, tapi hanya bila pengguna
  // memang sedang berada di dasar percakapan.
  useEffect(() => {
    if (atBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Pindah ruang: muat ulang dari awal untuk ruang yang dipilih.
  function switchRoom(id: string | null) {
    if (id === activeRoom) return;
    setActiveRoom(id);
    setMessages([]);
    setError(null);
    lastTsRef.current = null;
    atBottomRef.current = true;
    setLoading(true);
    fetch(`/api/chat?room=${roomKey(id)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { messages: ChatMessage[] }) => {
        if (activeRoomRef.current !== id) return; // ruang sudah berpindah lagi
        setMessages(json.messages ?? []);
        lastTsRef.current = json.messages?.at(-1)?.createdAt ?? null;
      })
      .catch(() => {
        if (activeRoomRef.current === id) setError("Gagal memuat ruang ini.");
      })
      .finally(() => {
        if (activeRoomRef.current === id) setLoading(false);
      });
  }

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const room = activeRoomRef.current;
      try {
        const params = new URLSearchParams({ room: roomKey(room) });
        if (lastTsRef.current) params.set("since", lastTsRef.current);
        const res = await fetch(`/api/chat?${params.toString()}`, { cache: "no-store" });
        if (!res.ok || cancelled || activeRoomRef.current !== room) return;
        const json = (await res.json()) as { messages: ChatMessage[] };
        if (json.messages.length === 0) return;
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = json.messages.filter((m) => !seen.has(m.id));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
        lastTsRef.current = json.messages.at(-1)!.createdAt;
      } catch {
        // Diam saja — percobaan berikutnya akan mengulang.
      }
    }

    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function send() {
    const content = draft.trim();
    if (!content || pending) return;
    const room = activeRoom;
    setError(null);
    setDraft("");
    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, halaqahId: room }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Pesan gagal terkirim.");
          setDraft(content);
          return;
        }
        if (activeRoomRef.current !== room) return; // sudah pindah ruang
        const msg = json.message as ChatMessage;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        lastTsRef.current = msg.createdAt;
        atBottomRef.current = true;
      } catch {
        setError("Pesan gagal terkirim. Periksa koneksi Anda.");
        setDraft(content);
      }
    });
  }

  function remove(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    fetch(`/api/chat?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  const groups = groupByDay(messages);
  const remaining = CHAT_MAX_LENGTH - draft.length;

  return (
    <div className="bg-card shadow-card flex h-[calc(100vh-15rem)] min-h-[26rem] flex-col overflow-hidden rounded-2xl border">
      {/* Tab ruang: Lembaga + Halaqah yang relevan dengan peran pengguna */}
      {rooms.length > 1 && (
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto border-b px-3 py-2">
          {rooms.map((r) => (
            <button
              key={roomKey(r.id)}
              type="button"
              onClick={() => switchRoom(r.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                activeRoom === r.id
                  ? "bg-role text-role-ink"
                  : "text-muted-foreground bg-slate-100 hover:bg-slate-200 dark:bg-slate-500/10 dark:hover:bg-slate-500/20"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* Banner retensi */}
      <div className="text-muted-foreground flex items-center gap-1.5 border-b bg-slate-50 px-4 py-2 text-xs dark:bg-slate-500/5">
        <Clock3 className="size-3.5 shrink-0" />
        Pesan di sini otomatis terhapus setelah 24 jam dan hanya terlihat oleh anggota ruang ini.
      </div>

      {/* Daftar pesan */}
      <div ref={listRef} onScroll={onScroll} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">Memuat…</div>
        ) : messages.length === 0 ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-1 text-center text-sm">
            <p className="font-medium text-foreground">Belum ada obrolan</p>
            <p>Jadilah yang pertama menyapa anggota ruang ini.</p>
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="my-2 flex items-center justify-center">
                <span className="text-muted-foreground rounded-full bg-slate-100 px-2.5 py-0.5 text-[0.65rem] font-medium dark:bg-slate-500/10">
                  {g.label}
                </span>
              </div>
              <div className="space-y-2.5">
                {g.items.map((m) => (
                  <div key={m.id} className={cn("group flex", m.isSelf ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[80%] sm:max-w-[70%]", m.isSelf && "items-end")}>
                      {!m.isSelf && (
                        <p className="mb-0.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-foreground">
                          {m.senderName}
                          <span className={cn("rounded-full px-1.5 py-0 text-[0.6rem] font-bold", chatRoleTone(m.senderRole))}>
                            {chatRoleLabel(m.senderRole)}
                          </span>
                        </p>
                      )}
                      <div className="flex items-end gap-1.5">
                        <div
                          className={cn(
                            "rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words",
                            m.isSelf
                              ? "bg-role text-role-ink rounded-br-sm"
                              : "rounded-bl-sm bg-slate-100 text-foreground dark:bg-slate-500/10"
                          )}
                        >
                          {m.content}
                        </div>
                        {(m.isSelf || canModerate) && (
                          <button
                            type="button"
                            onClick={() => remove(m.id)}
                            aria-label="Hapus pesan"
                            className="text-muted-foreground shrink-0 rounded-lg p-1 opacity-0 transition-opacity hover:bg-slate-100 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-slate-500/10"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                      <p className={cn("text-muted-foreground mt-0.5 px-1 text-[0.65rem]", m.isSelf && "text-right")}>
                        {chatTimeLabel(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="border-t px-3 py-3">
        {error && <p className="mb-2 px-1 text-xs font-medium text-rose-600">{error}</p>}
        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, CHAT_MAX_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Tulis pesan… (maks 160 karakter)"
              rows={1}
              maxLength={CHAT_MAX_LENGTH}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 max-h-24 min-h-10 w-full resize-none rounded-xl border bg-transparent px-3.5 py-2.5 pr-12 text-sm outline-none focus-visible:ring-[3px]"
            />
            <span
              className={cn(
                "tabular absolute right-3 bottom-2 text-[0.65rem]",
                remaining <= 20 ? "font-semibold text-rose-600" : "text-muted-foreground"
              )}
            >
              {remaining}
            </span>
          </div>
          <Button
            type="button"
            variant="role"
            size="icon"
            disabled={!draft.trim() || pending}
            onClick={send}
            aria-label="Kirim pesan"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
