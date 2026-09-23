"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import {
  dbErrorMessage,
  isValidWaNumber,
  MAX_PAYMENT_ITEMS,
  MAX_SETTLE_ITEMS,
  WAIVER_CERTIFICATE_TYPES,
  WAIVER_MAX_AGE_DAYS,
  WAIVER_MAX_MONTHS,
} from "@/lib/v10-shared";
import { createRedirectPayment, isIpaymuConfigured } from "@/lib/ipaymu";

export type V10Result = { error?: string; success?: string; data?: Record<string, unknown> };

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PROOF_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_QRIS_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Tanggal hari ini (YYYY-MM-DD) menurut zona Asia/Jakarta. */
function todayJakarta(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

/* ------------------------------------------------------------------------ */
/* DEVELOPER — payment settings (Infak Pengembangan level platform)         */
/* ------------------------------------------------------------------------ */

const DEV_INFAK_PATHS = ["/developer/infak", "/developer/infak/pengaturan", "/developer/infak/transaksi"];

export async function savePaymentSettingsAction(
  _prev: V10Result | null,
  formData: FormData
): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "DEVELOPER") return { error: "Akses ditolak." };

  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").replace(/[^0-9]/g, "");
    return raw ? Number(raw) : null;
  };
  const defaultAmount = num("defaultAmount");
  const deadlineDays = num("deadlineDays");

  if (defaultAmount !== null && defaultAmount < 1000)
    return { error: "Nominal default minimal Rp1.000." };
  if (deadlineDays !== null && (deadlineDays < 1 || deadlineDays > 14))
    return { error: "Batas konfirmasi harus 1-14 hari." };

  const supabase = await createClient();

  const qrisFile = formData.get("qris");
  let qrisPath: string | null = null;
  if (qrisFile instanceof File && qrisFile.size > 0) {
    if (!ALLOWED_IMAGE_TYPES.includes(qrisFile.type)) return { error: "Format QRIS harus JPG, PNG, atau WebP." };
    if (qrisFile.size > MAX_QRIS_BYTES) return { error: "Ukuran QRIS maksimal 2 MB." };
    const ext = qrisFile.type === "image/png" ? "png" : qrisFile.type === "image/webp" ? "webp" : "jpg";
    qrisPath = `platform/qris.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("payment-proofs")
      .upload(qrisPath, qrisFile, { upsert: true, contentType: qrisFile.type });
    if (upErr) return { error: "Gagal mengunggah QRIS." };
  }

  // Teks dikirim apa adanya: string kosong = kosongkan field.
  const text = (key: string) => String(formData.get(key) ?? "").trim();
  const { error } = await supabase.rpc("payment_settings_save", {
    p_default_amount: defaultAmount,
    p_bank_name: text("bankName"),
    p_bank_no: text("bankNo"),
    p_bank_account: text("bankAccount"),
    p_qris_path: qrisPath,
    p_instructions: text("instructions"),
    p_confirm_note: text("confirmNote"),
    p_deadline_days: deadlineDays,
  });
  if (error) return { error: dbErrorMessage(error.message) };

  for (const path of DEV_INFAK_PATHS) revalidatePath(path);
  revalidatePath("/santri/infak");
  return { success: "Pengaturan infak tersimpan." };
}

/* ------------------------------------------------------------------------ */
/* DEVELOPER — invoices & confirmations                                     */
/* ------------------------------------------------------------------------ */

/**
 * Buat tagihan bulan ini untuk SEMUA santri aktif di SEMUA lembaga aktif.
 * Normalnya otomatis (pg_cron tiap hari 00:05 WIB + saat wali membuka
 * aplikasi); tombol ini untuk menyusul manual. Idempoten.
 */
export async function generateInvoicesAction(): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "DEVELOPER") return { error: "Akses ditolak." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invoice_ensure_month", {});
  if (error) return { error: dbErrorMessage(error.message) };

  for (const path of DEV_INFAK_PATHS) revalidatePath(path);
  revalidatePath("/santri/infak");
  return { success: `${Number(data ?? 0)} tagihan baru dibuat.` };
}

/** DEVELOPER approve/reject a WAITING_CONFIRM manual payment (semua lembaga). */
export async function confirmPaymentAction(_prev: V10Result | null, formData: FormData): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "DEVELOPER") return { error: "Akses ditolak." };

  const transactionId = String(formData.get("transactionId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!transactionId || !["APPROVE", "REJECT"].includes(decision)) return { error: "Permintaan tidak valid." };
  if (decision === "REJECT" && !reason) return { error: "Tuliskan alasan penolakan." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("payment_dev_confirm", {
    p_transaction_id: transactionId,
    p_decision: decision,
    p_reason: reason || null,
  });
  if (error) return { error: dbErrorMessage(error.message) };

  for (const path of DEV_INFAK_PATHS) revalidatePath(path);
  revalidatePath(`/developer/infak/transaksi/${transactionId}`);
  revalidatePath("/santri/infak");
  return {
    success: decision === "APPROVE" ? "Pembayaran dikonfirmasi." : "Pembayaran ditolak.",
  };
}

/* ------------------------------------------------------------------------ */
/* DEVELOPER — pelunasan langsung (pembayaran diterima di luar aplikasi)    */
/* ------------------------------------------------------------------------ */

export type SettleItem = { studentId: string; y: number; m: number; amount?: number };

/**
 * Melunasi tagihan infak sejumlah santri sekaligus dan MENCATAT SIAPA yang
 * membayarkan. Nama pembayar tampil pada riwayat infak santri terkait.
 */
export async function settleInvoicesAction(
  items: SettleItem[],
  payerName: string,
  note: string = "",
  force: boolean = false
): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "DEVELOPER") return { error: "Akses ditolak." };

  const name = String(payerName ?? "").trim();
  if (name.length < 2) return { error: "Tuliskan nama pembayar infak terlebih dahulu." };
  if (name.length > 120) return { error: "Nama pembayar maksimal 120 karakter." };
  if (!Array.isArray(items) || items.length === 0) return { error: "Pilih minimal satu tagihan." };
  if (items.length > MAX_SETTLE_ITEMS)
    return { error: `Terlalu banyak tagihan sekaligus (maksimal ${MAX_SETTLE_ITEMS}). Lunasi bertahap.` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("payment_dev_settle", {
    p_items: items.map((i) => ({
      studentId: String(i.studentId ?? ""),
      y: Math.trunc(Number(i.y)),
      m: Math.trunc(Number(i.m)),
      amount: i.amount == null ? null : Math.trunc(Number(i.amount)),
    })),
    p_payer_name: name,
    p_note: String(note ?? "").trim() || null,
    p_force: force === true,
  });
  if (error) return { error: dbErrorMessage(error.message) };

  const res = (data ?? {}) as { invoices?: number; students?: number; total?: number; cancelled?: number };
  for (const path of DEV_INFAK_PATHS) revalidatePath(path);
  revalidatePath("/developer/infak/pelunasan");
  revalidatePath("/santri/infak");
  return {
    success: `${Number(res.invoices ?? 0)} tagihan (${Number(res.students ?? 0)} santri) dilunasi atas nama ${name}.`,
    data: res as Record<string, unknown>,
  };
}

/* ------------------------------------------------------------------------ */
/* V29 — PENGAJUAN TIDAK MAMPU (keringanan infak)                           */
/* ------------------------------------------------------------------------ */

const DEV_WAIVER_PATHS = ["/developer/infak", "/developer/infak/pengajuan"];

/**
 * WALI mengajukan tidak mampu untuk anaknya: unggah Surat Keterangan Tidak
 * Mampu yang tertanggal maksimal 7 hari terakhir, lalu kirim ke Developer.
 */
export async function submitWaiverRequestAction(
  _prev: V10Result | null,
  formData: FormData
): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "WALI_SANTRI") return { error: "Akses ditolak." };

  const studentId = String(formData.get("studentId") ?? "").trim();
  const certDate = String(formData.get("certificateDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const file = formData.get("certificate");

  if (!studentId) return { error: "Pilih santri terlebih dahulu." };
  if (!(file instanceof File) || file.size === 0)
    return { error: "Unggah Surat Keterangan Tidak Mampu terlebih dahulu." };
  if (!WAIVER_CERTIFICATE_TYPES.includes(file.type))
    return { error: "Format surat harus JPG, PNG, WebP, atau PDF." };
  if (file.size > MAX_CERTIFICATE_BYTES) return { error: "Ukuran surat maksimal 5 MB." };
  if (reason.length > 1000) return { error: "Alasan maksimal 1000 karakter." };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(certDate)) return { error: "Isi tanggal surat keterangan." };
  const today = todayJakarta();
  if (certDate > today) return { error: "Tanggal surat tidak boleh di masa depan." };
  const ageDays = Math.round((Date.parse(today) - Date.parse(certDate)) / 86_400_000);
  if (ageDays > WAIVER_MAX_AGE_DAYS)
    return { error: "Surat keterangan harus tertanggal maksimal 7 hari terakhir." };

  const supabase = await createClient();
  const ext =
    file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "application/pdf" ? "pdf" : "jpg";
  const path = `${session.tenantId}/waiver-${randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("payment-proofs")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return { error: "Gagal mengunggah surat keterangan." };

  const { error: rpcErr } = await supabase.rpc("waiver_submit_request", {
    p_student_id: studentId,
    p_certificate_path: path,
    p_certificate_date: certDate,
    p_reason: reason || null,
  });
  if (rpcErr) {
    await supabase.storage.from("payment-proofs").remove([path]);
    return { error: dbErrorMessage(rpcErr.message) };
  }

  revalidatePath("/santri/infak");
  for (const p of DEV_WAIVER_PATHS) revalidatePath(p);
  return { success: "Pengajuan terkirim. Developer akan meninjau permohonan Anda." };
}

/**
 * DEVELOPER memutuskan pengajuan tidak mampu: setujui (gratis N bulan) atau
 * tolak beserta alasan.
 */
export async function decideWaiverRequestAction(
  _prev: V10Result | null,
  formData: FormData
): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "DEVELOPER") return { error: "Akses ditolak." };

  const requestId = String(formData.get("requestId") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const monthsRaw = String(formData.get("months") ?? "").replace(/[^0-9]/g, "");
  const months = monthsRaw ? Number(monthsRaw) : null;

  if (!requestId || !["APPROVE", "REJECT"].includes(decision))
    return { error: "Permintaan tidak valid." };
  if (decision === "APPROVE" && (months === null || months < 1 || months > WAIVER_MAX_MONTHS))
    return { error: `Durasi keringanan harus 1-${WAIVER_MAX_MONTHS} bulan.` };
  if (decision === "REJECT" && !reason) return { error: "Tuliskan alasan penolakan." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("waiver_dev_decide", {
    p_request_id: requestId,
    p_decision: decision,
    p_months: months,
    p_reason: reason || null,
  });
  if (error) return { error: dbErrorMessage(error.message) };

  for (const p of DEV_WAIVER_PATHS) revalidatePath(p);
  revalidatePath("/santri/infak");
  return {
    success:
      decision === "APPROVE"
        ? `Infak santri digratiskan selama ${months} bulan.`
        : "Pengajuan ditolak.",
  };
}

/* ------------------------------------------------------------------------ */
/* WALI — payments                                                          */
/* ------------------------------------------------------------------------ */

export type PaymentItem = { studentId: string; y: number; m: number; amount: number };

/** Derive the public app URL from request headers (used for iPaymu callbacks). */
async function appBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Start a payment (MANUAL or IPAYMU). Server recomputes/validates everything. */
export async function initiatePaymentAction(
  items: PaymentItem[],
  method: "MANUAL" | "IPAYMU",
  payerAlias: string = ""
): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "WALI_SANTRI") return { error: "Akses ditolak." };
  if (!Array.isArray(items) || items.length === 0) return { error: "Pilih minimal satu tagihan." };
  if (items.length > MAX_PAYMENT_ITEMS)
    return { error: `Terlalu banyak tagihan dalam satu pembayaran (maksimal ${MAX_PAYMENT_ITEMS}). Bayar bertahap.` };
  if (method !== "MANUAL" && method !== "IPAYMU") return { error: "Metode pembayaran tidak valid." };

  const alias = String(payerAlias ?? "").trim();
  if (alias.length > 60) return { error: "Nama pembayar maksimal 60 karakter." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("payment_initiate", {
    p_items: items.map((i) => ({
      studentId: String(i.studentId ?? ""),
      y: Math.trunc(Number(i.y)),
      m: Math.trunc(Number(i.m)),
      amount: Math.trunc(Number(i.amount)),
    })),
    p_method: method,
    p_payer_alias: alias || null,
  });
  if (error) return { error: dbErrorMessage(error.message) };

  const tx = (data ?? {}) as { transaction_id?: string; reference?: string; total?: number };

  // IPAYMU: create the hosted-checkout session right away; on failure cancel
  // the freshly created transaction so nothing gets stuck in PENDING.
  if (method === "IPAYMU") {
    if (!isIpaymuConfigured()) {
      await supabase.rpc("payment_cancel_transaction", { p_transaction_id: tx.transaction_id });
      return {
        error:
          "Pembayaran otomatis belum diaktifkan. Gunakan transfer manual.",
      };
    }
    const base = await appBaseUrl();
    const payment = await createRedirectPayment({
      referenceId: tx.reference ?? "",
      amount: Number(tx.total ?? 0),
      buyerName: session.fullName,
      buyerPhone: null,
      buyerEmail: session.email,
      notifyUrl: `${base}/api/webhooks/ipaymu`,
      returnUrl: `${base}/santri/infak/sukses?ref=${encodeURIComponent(tx.reference ?? "")}`,
      cancelUrl: `${base}/santri/infak`,
    });
    if (!payment.ok) {
      await supabase.rpc("payment_cancel_transaction", { p_transaction_id: tx.transaction_id });
      return {
        error:
          payment.error === "IPAYMU_NOT_CONFIGURED"
            ? "Pembayaran otomatis belum diaktifkan."
            : "Gagal membuat sesi pembayaran otomatis. Coba lagi atau gunakan transfer manual.",
      };
    }
    return {
      success: "Sesi pembayaran dibuat.",
      data: {
        transactionId: tx.transaction_id,
        reference: tx.reference,
        total: tx.total,
        paymentUrl: payment.url,
      },
    };
  }

  revalidatePath("/santri/infak");
  revalidatePath("/developer/infak/transaksi");
  return {
    success: "Transaksi berhasil dibuat.",
    data: { transactionId: tx.transaction_id, reference: tx.reference, total: tx.total },
  };
}

/** Upload the transfer proof for a PENDING MANUAL transaction (rule #16). */
export async function submitProofAction(_prev: V10Result | null, formData: FormData): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "WALI_SANTRI") return { error: "Akses ditolak." };

  const transactionId = String(formData.get("transactionId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const file = formData.get("file");
  if (!transactionId) return { error: "Transaksi tidak valid." };
  if (!(file instanceof File) || file.size === 0) return { error: "Lampirkan bukti transfer terlebih dahulu." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return { error: "Format bukti harus JPG, PNG, atau WebP." };
  if (file.size > MAX_PROOF_BYTES) return { error: "Ukuran bukti maksimal 5 MB." };

  const supabase = await createClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${session.tenantId}/proof-${transactionId}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("payment-proofs")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) return { error: "Gagal mengunggah bukti transfer." };

  const { error: rpcErr } = await supabase.rpc("payment_submit_proof", {
    p_transaction_id: transactionId,
    p_proof_path: path,
    p_note: note || null,
  });
  if (rpcErr) {
    await supabase.storage.from("payment-proofs").remove([path]);
    return { error: dbErrorMessage(rpcErr.message) };
  }

  revalidatePath("/santri/infak");
  revalidatePath("/developer/infak/transaksi");
  return { success: "Bukti pembayaran terkirim. Menunggu konfirmasi." };
}

/** Cancel a PENDING transaction owned by the wali. */
export async function cancelTransactionAction(_prev: V10Result | null, formData: FormData): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "WALI_SANTRI") return { error: "Akses ditolak." };

  const transactionId = String(formData.get("transactionId") ?? "");
  if (!transactionId) return { error: "Transaksi tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("payment_cancel_transaction", { p_transaction_id: transactionId });
  if (error) return { error: dbErrorMessage(error.message) };

  revalidatePath("/santri/infak");
  revalidatePath("/developer/infak/transaksi");
  return { success: "Transaksi dibatalkan." };
}

/* ------------------------------------------------------------------------ */
/* FEEDBACK (rule #45-#58)                                                  */
/* ------------------------------------------------------------------------ */

export async function submitFeedbackAction(_prev: V10Result | null, formData: FormData): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir. Silakan login kembali." };

  const category = String(formData.get("category") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const anonymous = formData.get("anonymous") === "on";
  const pageUrl = String(formData.get("pageUrl") ?? "").trim();

  if (title.length < 3 || title.length > 160) return { error: "Judul harus 3-160 karakter." };
  if (content.length < 5 || content.length > 4000) return { error: "Isi harus 5-4000 karakter." };
  if (target === "USTADZ" && !teacherId) return { error: "Pilih guru tujuan terlebih dahulu." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("feedback_submit", {
    p_category: category,
    p_target: target,
    p_teacher_id: teacherId || null,
    p_title: title,
    p_content: content,
    p_anonymous: anonymous,
    p_page_url: pageUrl || null,
    p_steps: null,
  });
  if (error) return { error: dbErrorMessage(error.message) };

  revalidatePath("/santri/saran");
  revalidatePath("/ustadz/saran");
  revalidatePath("/koordinator/saran");
  revalidatePath("/admin/saran");
  revalidatePath("/developer/saran");
  return { success: "Masukan berhasil dikirim. Terima kasih!" };
}

/** ADMIN/DEVELOPER update feedback status + response (rule #54). */
export async function setFeedbackStatusAction(_prev: V10Result | null, formData: FormData): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || !["ADMIN", "DEVELOPER"].includes(session.role)) return { error: "Akses ditolak." };

  const feedbackId = String(formData.get("feedbackId") ?? "");
  const status = String(formData.get("status") ?? "").trim();
  const response = String(formData.get("response") ?? "").trim();
  if (!feedbackId || !status) return { error: "Permintaan tidak valid." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("feedback_set_status", {
    p_feedback_id: feedbackId,
    p_status: status,
    p_response: response || null,
  });
  if (error) return { error: dbErrorMessage(error.message) };

  revalidatePath("/admin/saran");
  revalidatePath("/developer/saran");
  revalidatePath("/koordinator/saran");
  revalidatePath("/ustadz/saran");
  revalidatePath("/santri/saran");
  return { success: "Status masukan diperbarui." };
}

/** ADMIN forward feedback to another recipient (rule #55). */
export async function forwardFeedbackAction(_prev: V10Result | null, formData: FormData): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "ADMIN") return { error: "Akses ditolak." };

  const feedbackId = String(formData.get("feedbackId") ?? "");
  const target = String(formData.get("target") ?? "").trim();
  const teacherId = String(formData.get("teacherId") ?? "").trim();
  if (!feedbackId || !target) return { error: "Permintaan tidak valid." };
  if (target === "USTADZ" && !teacherId) return { error: "Pilih guru tujuan terlebih dahulu." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("feedback_forward", {
    p_feedback_id: feedbackId,
    p_target: target,
    p_teacher_id: teacherId || null,
  });
  if (error) return { error: dbErrorMessage(error.message) };

  revalidatePath("/admin/saran");
  return { success: "Masukan diteruskan." };
}

/* ------------------------------------------------------------------------ */
/* NOTIFICATIONS (rule #59/#60)                                             */
/* ------------------------------------------------------------------------ */

export async function markNotificationReadAction(notificationId: string): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("notification_mark_read", { p_notification_id: notificationId });
  if (error) return { error: dbErrorMessage(error.message) };
  return { success: "ok" };
}

export async function markAllNotificationsReadAction(): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session) return { error: "Sesi berakhir." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("notification_mark_all_read", {});
  if (error) return { error: dbErrorMessage(error.message) };
  return { success: "ok" };
}

/* ------------------------------------------------------------------------ */
/* USTADZ — WhatsApp grup halaqah link (rule #42/#43)                       */
/* ------------------------------------------------------------------------ */

export async function saveHalaqahWhatsappAction(_prev: V10Result | null, formData: FormData): Promise<V10Result> {
  const session = await getSessionProfile();
  if (!session || session.role !== "ADMIN" || !session.tenantId) return { error: "Akses ditolak." };

  const halaqahId = String(formData.get("halaqahId") ?? "");
  const url = String(formData.get("whatsappGroupUrl") ?? "").trim();
  if (!halaqahId) return { error: "Halaqah tidak valid." };
  if (url && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]+$/.test(url))
    return { error: "Tautan grup harus format https://chat.whatsapp.com/…" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("halaqahs")
    .update({ whatsapp_group_url: url || null })
    .eq("id", halaqahId);
  if (error) return { error: "Gagal menyimpan tautan grup." };

  revalidatePath("/admin/halaqah");
  return { success: "Tautan grup WhatsApp tersimpan." };
}
