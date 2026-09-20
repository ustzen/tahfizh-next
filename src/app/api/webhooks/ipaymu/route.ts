import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { ipaymuConfig } from "@/lib/ipaymu";

export const dynamic = "force-dynamic";

/**
 * iPaymu callback webhook (rule #18-#21).
 *
 * 1. Stores EVERY callback in payment_webhooks (idempotent by provider+trx+sid).
 * 2. Validates the HMAC signature when IPAYMU_API_KEY is configured.
 *    (Without a configured key — e.g. early sandbox testing — the callback is
 *    still stored but only status transitions that are safe are applied.)
 * 3. status_code 1  → payment_mark_paid_auto (atomic, idempotent).
 *    status_code -2 → payment_expire_auto.
 * 4. Always answers 200 OK (iPaymu retries non-200s aggressively).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 200 });
  }

  const { apiKey } = ipaymuConfig();

  // ---- signature verification ------------------------------------------------
  let signatureValid = false;
  if (apiKey) {
    const provided =
      request.headers.get("x-signature") ??
      (typeof payload.signature === "string" ? payload.signature : null);
    if (provided) {
      const withoutSig: Record<string, unknown> = { ...payload };
      delete withoutSig.signature;
      const candidate = createHmac("sha256", apiKey)
        .update(JSON.stringify(withoutSig))
        .digest("hex");
      signatureValid = candidate.toLowerCase() === provided.toLowerCase();
    }
  }

  const admin = createAdminClient();

  // ---- idempotent webhook log ------------------------------------------------
  const providerTrxId = String(payload.trx_id ?? "");
  const sid = typeof payload.sid === "string" ? payload.sid : null;
  const referenceId = typeof payload.reference_id === "string" ? payload.reference_id : null;
  const statusCode = typeof payload.status_code === "number" ? payload.status_code : null;

  if (!providerTrxId) {
    return NextResponse.json({ ok: false, error: "NO_TRX_ID" }, { status: 200 });
  }

  const { data: inserted, error: logErr } = await admin
    .from("payment_webhooks")
    .insert({
      provider: "IPAYMU",
      provider_trx_id: providerTrxId,
      sid,
      reference_id: referenceId,
      status_code: statusCode,
      payload,
      processed: false,
      note: signatureValid ? null : apiKey ? "SIGNATURE_INVALID" : "SIGNATURE_NOT_CONFIGURED",
    })
    .select("id")
    .single();

  // Unique violation → duplicate delivery, already handled before.
  if (logErr || !inserted) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  // Only act on verified callbacks (or when no key is configured yet).
  if (apiKey && !signatureValid) {
    await admin.from("payment_webhooks").update({ processed: true, note: "REJECTED_SIGNATURE" }).eq("id", inserted.id);
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 200 });
  }

  // ---- status transitions ----------------------------------------------------
  let action = "IGNORED";
  if (referenceId && statusCode === 1) {
    const { error } = await admin.rpc("payment_mark_paid_auto", {
      p_reference: referenceId,
      p_trx_id: providerTrxId,
      p_via: typeof payload.via === "string" ? payload.via : null,
    });
    action = error ? `ERROR:${error.message}` : "MARKED_PAID";
  } else if (referenceId && statusCode === -2) {
    const { error } = await admin.rpc("payment_expire_auto", { p_reference: referenceId });
    action = error ? `ERROR:${error.message}` : "EXPIRED";
  }

  await admin
    .from("payment_webhooks")
    .update({ processed: true, note: action })
    .eq("id", inserted.id);

  // Always 200 so iPaymu does not retry forever.
  return NextResponse.json({ ok: true, action }, { status: 200 });
}
