import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { CHAT_MAX_LENGTH } from "@/lib/chat-shared";

/**
 * TAHFIZH V20/V21 — Obrolan. Endpoint polling ringan (dipanggil client tiap
 * beberapa detik). Tenant + identitas SELALU diambil dari sesi server, tidak
 * pernah dari klien. `room` = id Halaqah, atau kosong/"lembaga" untuk ruang
 * satu-lembaga. Akses ruang Halaqah divalidasi lagi di RPC + RLS.
 */

function roomParam(request: NextRequest): string | null {
  const room = request.nextUrl.searchParams.get("room");
  return room && room !== "lembaga" ? room : null;
}

export async function GET(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const since = request.nextUrl.searchParams.get("since");
  const halaqahId = roomParam(request);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_list", {
    p_since: since || null,
    p_halaqah_id: halaqahId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ messages: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  const halaqahId = typeof body?.halaqahId === "string" && body.halaqahId ? body.halaqahId : null;

  if (!content) {
    return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
  }
  if (content.length > CHAT_MAX_LENGTH) {
    return NextResponse.json({ error: `Pesan maksimal ${CHAT_MAX_LENGTH} karakter.` }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_send", {
    p_content: content,
    p_halaqah_id: halaqahId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ message: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: NextRequest) {
  const profile = await getSessionProfile();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID pesan wajib diisi." }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_delete", { p_message_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ deleted: data === true });
}
