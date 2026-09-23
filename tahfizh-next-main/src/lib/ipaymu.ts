import "server-only";

import { createHmac, createHash } from "node:crypto";

/**
 * iPaymu API v2 integration (server only).
 *
 * Env vars (set via the project's Keys/API keys UI):
 *   IPAYMU_VA       — Virtual Account number from the iPaymu dashboard
 *   IPAYMU_API_KEY  — API key (sandbox and production keys differ!)
 *   IPAYMU_ENV      — "sandbox" (default) | "production"
 *   NEXT_PUBLIC_APP_URL — public base URL used for callback/return URLs
 *
 * Signature (per iPaymu v2 docs):
 *   bodyHash = SHA256(bodyJson) hex (lowercase)
 *   stringToSign = "POST:" + VA + ":" + bodyHash + ":" + timestamp
 *   signature = HMAC_SHA256(stringToSign, API_KEY) hex
 */

export function ipaymuConfig() {
  const va = process.env.IPAYMU_VA ?? "";
  const apiKey = process.env.IPAYMU_API_KEY ?? "";
  const env = process.env.IPAYMU_ENV === "production" ? "production" : "sandbox";
  return { va, apiKey, env, configured: Boolean(va && apiKey) };
}

export function isIpaymuConfigured(): boolean {
  return ipaymuConfig().configured;
}

function baseUrl(env: string) {
  return env === "production" ? "https://my.ipaymu.com" : "https://sandbox.ipaymu.com";
}

/** Build iPaymu v2 auth headers for a JSON body. */
function buildHeaders(va: string, apiKey: string, bodyJson: string) {
  const timestamp = Date.now().toString();
  const bodyHash = createHash("sha256").update(bodyJson).digest("hex").toLowerCase();
  const stringToSign = `POST:${va}:${bodyHash}:${timestamp}`;
  const signature = createHmac("sha256", apiKey).update(stringToSign).digest("hex");
  return {
    "Content-Type": "application/json",
    va,
    signature,
    timestamp,
  };
}

export type RedirectPaymentResult =
  | { ok: true; sessionId: string; url: string }
  | { ok: false; error: string };

/**
 * Create a hosted-checkout (redirect) payment. The buyer pays on iPaymu's
 * page; completion arrives via our webhook (notifyUrl).
 */
export async function createRedirectPayment(params: {
  referenceId: string;
  amount: number;
  buyerName: string;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  notifyUrl: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<RedirectPaymentResult> {
  const { va, apiKey, env, configured } = ipaymuConfig();
  if (!configured) return { ok: false, error: "IPAYMU_NOT_CONFIGURED" };

  const body = {
    product: ["Infak Pengembangan TAHFIZH"],
    qty: [1],
    price: [params.amount],
    description: `Infak Pengembangan TAHFIZH (${params.referenceId})`,
    referenceId: params.referenceId,
    notifyUrl: params.notifyUrl,
    returnUrl: params.returnUrl,
    cancelUrl: params.cancelUrl,
    buyerName: params.buyerName,
    buyerPhone: params.buyerPhone ?? "",
    buyerEmail: params.buyerEmail ?? "",
  };
  const bodyJson = JSON.stringify(body);

  try {
    const res = await fetch(`${baseUrl(env)}/api/v2/payment`, {
      method: "POST",
      headers: buildHeaders(va, apiKey, bodyJson),
      body: bodyJson,
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { Status?: number; Message?: string; Data?: { SessionID?: string; Url?: string } }
      | null;

    if (!res.ok || !json?.Data?.Url) {
      return { ok: false, error: json?.Message || `IPAYMU_HTTP_${res.status}` };
    }
    return { ok: true, sessionId: json.Data.SessionID ?? "", url: json.Data.Url };
  } catch {
    return { ok: false, error: "IPAYMU_NETWORK_ERROR" };
  }
}
