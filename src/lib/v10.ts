import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, type SessionProfile } from "@/lib/auth";
import { dbErrorMessage } from "@/lib/v10-shared";

/* ------------------------------------------------------------------------ */
/* Types                                                                    */
/* ------------------------------------------------------------------------ */

export type PaymentSettingsData = {
  default_amount: number;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  qris_path: string | null;
  instructions: string | null;
  confirm_note: string | null;
  confirm_deadline_days: number;
};

/**
 * Satu bulan tagihan. `id` null + status "NONE" = belum ada tagihan (bulan di
 * muka); tagihannya dibuat server saat dibayar.
 */
export type WaliInvoiceItem = {
  id: string | null;
  y: number;
  m: number;
  amount: number;
  status: string; // UNPAID | PENDING | WAITING_CONFIRM | PAID | NONE
  paidAt?: string | null;
  paidVia?: string | null;
};

export type WaliChild = {
  studentId: string;
  name: string;
  code: string;
  /** Belum lunas s.d. bulan berjalan, terlama dulu (tunggakan + bulan ini). */
  invoices: WaliInvoiceItem[];
  /** 11 bulan setelah bulan berjalan (bayar di muka). */
  ahead: WaliInvoiceItem[];
};

/** Santri lain di lembaga yang menunggak (urut: paling lama menunggak dulu). */
export type WaliOtherStudent = {
  studentId: string;
  name: string;
  code: string;
  oldestY: number;
  oldestM: number;
  unpaidCount: number;
  unpaidTotal: number;
  invoices: WaliInvoiceItem[];
};

export type WaliBankInfo = {
  bankName: string | null;
  bankNo: string | null;
  bankAccount: string | null;
  instructions: string | null;
  confirmNote: string | null;
  qrisPath: string | null;
};

export type WaliInvoicesData = {
  children: WaliChild[];
  others: WaliOtherStudent[];
  defaultAmount: number;
  y: number;
  m: number;
  academicYear: string;
  bank: WaliBankInfo;
};

export type PaymentGate = {
  locked: boolean;
  applicable: boolean;
  day: number;
  unpaidCount: number;
  minAmount: number;
  month: number;
  year: number;
  monthLabel: string;
  academicYear: string;
};

export type WaliTxRow = {
  id: string;
  reference: string;
  method: string;
  status: string;
  total_amount: number;
  payer_name: string;
  proof_path: string | null;
  reject_reason: string | null;
  created_at: string;
  confirmed_at: string | null;
  allocations: {
    student: string;
    code: string;
    y: number;
    m: number;
    amount: number;
    invoiceStatus: string;
  }[];
};

/** Satu baris riwayat infak PER BULAN untuk seorang santri. */
export type WaliHistoryItem = {
  id: string;
  y: number;
  m: number;
  status: string;
  amount: number;
  paidAt: string | null;
  paidByName: string | null;
  paidBySelf: boolean;
  paidVia: string | null;
  reference: string | null;
  bundleMonths: number | null;
  paidInAdvance: boolean;
};

export type WaliHistoryChild = {
  studentId: string;
  name: string;
  code: string;
  items: WaliHistoryItem[];
};

/** V29 — satu pengajuan tidak mampu (keringanan infak). */
export type WaiverRequestRow = {
  id: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  certificateDate: string;
  reason: string | null;
  status: string; // PENDING | APPROVED | REJECTED
  months: number | null;
  fromYear: number | null;
  fromMonth: number | null;
  decidedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  // Khusus daftar Developer
  tenantName?: string;
  tenantCode?: string;
  guardianName?: string | null;
  requestedByName?: string | null;
  certificatePath?: string;
  certificateUrl?: string;
};

/** Satu santri menunggak (sudut pandang Developer, lintas lembaga). */
export type DevArrearStudent = {
  studentId: string;
  name: string;
  code: string;
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  oldestY: number;
  oldestM: number;
  monthsBehind: number;
  unpaidCount: number;
  unpaidTotal: number;
  invoices: WaliInvoiceItem[];
};

export type DevArrearsData = {
  y: number;
  m: number;
  defaultAmount: number;
  tenants: { id: string; name: string; code: string }[];
  students: DevArrearStudent[];
};

export type WaliMonthlyStatus = {
  studentId: string;
  name: string;
  code: string;
  status: string | null;
  amount: number | null;
  hasInvoice: boolean;
  paidAt: string | null;
  paidByName: string | null;
  paidBySelf: boolean;
  paidVia?: string | null;
  bundleMonths: number | null;
};

export type DevTxRow = {
  id: string;
  reference: string;
  payer_name: string;
  method: string;
  status: string;
  total_amount: number;
  proof_path: string | null;
  has_proof: boolean;
  student_summary: string | null;
  tenant_name: string;
  tenant_code: string;
  created_at: string;
  confirmed_at: string | null;
};

export type TxAllocation = {
  student: string;
  code: string;
  y: number;
  m: number;
  amount: number;
  invoiceStatus: string;
};

export type TxDistribution = {
  id: string;
  reference: string;
  payerName: string;
  /** "Dibayarkan atas nama" — yang ditampilkan ke santri bila diisi. */
  payerAlias?: string | null;
  tenantName?: string;
  tenantCode?: string;
  method: string;
  status: string;
  total: number;
  proofPath: string | null;
  payerNote: string | null;
  rejectReason: string | null;
  providerTrxId: string | null;
  providerPaidVia: string | null;
  createdAt: string;
  confirmedAt: string | null;
  allocations: TxAllocation[];
};

export type DevSummary = {
  monthLabel: string;
  day: number;
  tenantCount: number;
  totalInvoices: number;
  paidCount: number;
  unpaidCount: number;
  waitingCount: number;
  collectedTotal: number;
  manualTotal: number;
  autoTotal: number;
  pendingConfirm: number;
};

export type DevTenantInvoiceRow = {
  id: string;
  code: string;
  name: string;
  total: number;
  paid: number;
  unpaid: number;
  waiting: number;
};

export type FeedbackRow = {
  id: string;
  category: string;
  target_type: string;
  target_teacher: string | null;
  title: string;
  content: string;
  page_url: string | null;
  steps: string | null;
  display_name: string;
  status: string;
  response: string | null;
  created_at: string;
  is_own: boolean;
  can_moderate: boolean;
};

export type DevFeedbackRow = {
  id: string;
  tenant_code: string | null;
  tenant_name: string | null;
  category: string;
  sender_name: string;
  sender_email: string | null;
  target_type: string;
  title: string;
  content: string;
  page_url: string | null;
  steps: string | null;
  status: string;
  response: string | null;
  created_at: string;
  is_anonymous: boolean;
};

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type WaDirectoryRow = {
  student_id: string;
  student_name: string;
  student_code: string;
  guardian_name: string | null;
  guardian_whatsapp: string | null;
};

/* ------------------------------------------------------------------------ */
/* RPC invocation helper — maps Postgres errors to friendly messages         */
/* ------------------------------------------------------------------------ */

export class RpcError extends Error {
  constructor(message: string) {
    super(message);
  }
}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new RpcError(dbErrorMessage(error.message));
  return data as T;
}

/** Safe variant: returns fallback instead of throwing (for dashboards). */
async function callRpcSafe<T>(fn: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  try {
    return await callRpc<T>(fn, args);
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------------ */
/* PAYMENTS — gate (rule #7/#8)                                             */
/* ------------------------------------------------------------------------ */

/**
 * Wali access gate: locked from day 16 when the current month's infak is
 * unpaid. Non-wali roles are never locked. Request-cached via React cache().
 */
export const getPaymentGate = cache(async (): Promise<PaymentGate | null> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "WALI_SANTRI") return null;
  try {
    return await callRpc<PaymentGate>("wali_payment_gate", {});
  } catch {
    return null; // fail-open on gate read errors; page-level data still guarded by RLS
  }
});

/** True when the signed-in wali is access-locked (day ≥ 16 & unpaid). */
export async function isWaliLocked(): Promise<boolean> {
  const gate = await getPaymentGate();
  return gate?.locked === true;
}

/* ------------------------------------------------------------------------ */
/* PAYMENTS — wali                                                          */
/* ------------------------------------------------------------------------ */

export const getWaliInvoices = cache(async (): Promise<WaliInvoicesData | null> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "WALI_SANTRI") return null;
  try {
    return await callRpc<WaliInvoicesData>("payment_wali_invoices", {});
  } catch {
    return null;
  }
});

export const getWaliTransactions = cache(async (): Promise<WaliTxRow[]> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "WALI_SANTRI") return [];
  return callRpcSafe<WaliTxRow[]>("payment_wali_transactions", {}, []);
});

export async function getWaliTransactionDetail(id: string): Promise<TxDistribution | null> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "WALI_SANTRI") return null;
  try {
    return await callRpc<TxDistribution>("payment_wali_detail", { p_transaction_id: id });
  } catch {
    return null;
  }
}

/** Per-child invoice status for the wali dashboard card. */
export const getWaliMonthlyStatus = cache(async () => {
  return callRpcSafe<WaliMonthlyStatus[]>("payment_wali_status", {}, []);
});

/** Riwayat infak per bulan tiap anak (tanggal dibayarkan + siapa pembayarnya). */
export const getWaliHistory = cache(async (limit: number = 12): Promise<WaliHistoryChild[]> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "WALI_SANTRI") return [];
  return callRpcSafe<WaliHistoryChild[]>("payment_wali_history", { p_limit: limit }, []);
});

/** V29 — pengajuan tidak mampu milik wali yang login. */
export const getWaliWaiverRequests = cache(async (): Promise<WaiverRequestRow[]> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "WALI_SANTRI") return [];
  return callRpcSafe<WaiverRequestRow[]>("waiver_wali_list", {}, []);
});

/* ------------------------------------------------------------------------ */
/* PAYMENTS — developer (platform)                                          */
/* Infak Pengembangan dikelola Developer untuk SEMUA lembaga, bukan Admin.  */
/* ------------------------------------------------------------------------ */

export const getDevSummary = cache(async (): Promise<DevSummary | null> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "DEVELOPER") return null;
  return callRpcSafe<DevSummary>("payment_dev_summary", {}, null as unknown as DevSummary);
});

export const getDevTenantInvoices = cache(async (): Promise<DevTenantInvoiceRow[]> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "DEVELOPER") return [];
  return callRpcSafe<DevTenantInvoiceRow[]>("payment_dev_tenants", {}, []);
});

export async function getDevTransactions(status: string, query: string): Promise<DevTxRow[]> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "DEVELOPER") return [];
  return callRpcSafe<DevTxRow[]>(
    "payment_dev_list",
    { p_status: status || "ALL", p_query: query || null },
    []
  );
}

export async function getDevTransactionDetail(id: string): Promise<TxDistribution | null> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "DEVELOPER") return null;
  try {
    return await callRpc<TxDistribution>("payment_dev_detail", { p_transaction_id: id });
  } catch {
    return null;
  }
}

/**
 * Daftar santri menunggak untuk layar pelunasan Developer — seluruh lembaga,
 * diurutkan dari tunggakan paling lama.
 */
export async function getDevArrears(
  query: string = "",
  tenantId: string = ""
): Promise<DevArrearsData | null> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "DEVELOPER") return null;
  try {
    return await callRpc<DevArrearsData>("payment_dev_arrears", {
      p_query: query || null,
      p_tenant_id: tenantId || null,
      p_limit: 200,
    });
  } catch {
    return null;
  }
}

/** V29 — daftar pengajuan tidak mampu untuk Developer (+ tautan surat). */
export async function getDevWaiverRequests(
  status: string = "PENDING",
  query: string = ""
): Promise<WaiverRequestRow[]> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "DEVELOPER") return [];
  const rows = await callRpcSafe<WaiverRequestRow[]>(
    "waiver_dev_list",
    { p_status: status || "ALL", p_query: query || null },
    []
  );
  if (rows.length > 0) {
    const supabase = await createClient();
    await Promise.all(
      rows.map(async (r) => {
        if (!r.certificatePath) return;
        const { data } = await supabase.storage
          .from("payment-proofs")
          .createSignedUrl(r.certificatePath, 60 * 60);
        if (data?.signedUrl) r.certificateUrl = data.signedUrl;
      })
    );
  }
  return rows;
}

/** Pengaturan infak level platform (nominal min Rp1.000, rekening, QRIS). */
export const getPaymentSettings = cache(async (): Promise<PaymentSettingsData | null> => {
  const profile = await getSessionProfile();
  if (!profile) return null;
  return callRpcSafe<PaymentSettingsData>("payment_settings_get", {}, null as unknown as PaymentSettingsData);
});

/* ------------------------------------------------------------------------ */
/* FEEDBACK                                                                 */
/* ------------------------------------------------------------------------ */

export const getFeedbackList = cache(async (): Promise<FeedbackRow[]> => {
  const profile = await getSessionProfile();
  if (!profile) return [];
  return callRpcSafe<FeedbackRow[]>("feedback_recipient_list", {}, []);
});

export const getDevFeedbackList = cache(async (): Promise<DevFeedbackRow[]> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "DEVELOPER") return [];
  return callRpcSafe<DevFeedbackRow[]>("feedback_dev_list", {}, []);
});

export const getFeedbackTeacherOptions = cache(async (): Promise<{ id: string; name: string }[]> => {
  return callRpcSafe<{ id: string; name: string }[]>("feedback_teacher_options", {}, []);
});

/* ------------------------------------------------------------------------ */
/* NOTIFICATIONS                                                            */
/* ------------------------------------------------------------------------ */

export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const profile = await getSessionProfile();
  if (!profile) return 0;
  const { data } = await (await createClient()).rpc("notification_unread_count");
  return typeof data === "number" ? data : 0;
});

export const getNotificationList = cache(async (): Promise<NotificationRow[]> => {
  const profile = await getSessionProfile();
  if (!profile) return [];
  return callRpcSafe<NotificationRow[]>("notification_list", { p_limit: 30 }, []);
});

/* ------------------------------------------------------------------------ */
/* WHATSAPP DIRECTORY (rule #40/#41)                                        */
/* ------------------------------------------------------------------------ */

export async function getTeacherWhatsappDirectory(): Promise<WaDirectoryRow[]> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "USTADZ") return [];
  return callRpcSafe<WaDirectoryRow[]>("v10_teacher_whatsapp_directory", {}, []);
}

/* ------------------------------------------------------------------------ */
/* DEVELOPER dashboard                                                      */
/* ------------------------------------------------------------------------ */

export type DevV10Stats = {
  tenants: number;
  transactions: number;
  paidTotal: number;
  feedbackNew: number;
  feedbackAll: number;
  invoices: number;
  paidInvoices: number;
};

export const getDevV10Stats = cache(async (): Promise<DevV10Stats | null> => {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "DEVELOPER") return null;
  return callRpcSafe<DevV10Stats>("v10_dev_dashboard", {}, null as unknown as DevV10Stats);
});

/** Require the signed-in wali; used by every wali infak action/page. */
export async function requireWali(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "WALI_SANTRI") {
    throw new RpcError("AKSES_DITOLAK");
  }
  return profile;
}
