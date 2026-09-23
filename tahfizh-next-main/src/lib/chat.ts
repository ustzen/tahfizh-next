import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, ChatRoom } from "@/lib/chat-shared";

/** Daftar ruang yang boleh dibuka pengguna ini — "Lembaga" + Halaqah relevan. */
export async function getChatRooms(): Promise<ChatRoom[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_rooms");
  if (error) {
    console.error("[chat_rooms]", error.message);
    return [{ id: null, label: "Lembaga", kind: "tenant" }];
  }
  return (data ?? []) as ChatRoom[];
}

/** Muat awal ruang "Lembaga" — dipakai server component agar render pertama tidak kosong. */
export async function getInitialChatMessages(halaqahId: string | null = null): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_list", { p_since: null, p_halaqah_id: halaqahId });
  if (error) {
    console.error("[chat_list]", error.message);
    return [];
  }
  return (data ?? []) as ChatMessage[];
}
