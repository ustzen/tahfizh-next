-- ============================================================================
-- TAHFIZH V12 — PERBAIKI TAUTAN NOTIFIKASI PEMBAYARAN OTOMATIS
-- ============================================================================
-- payment_mark_paid_auto (webhook iPaymu) mengirim notifikasi "Pembayaran
-- berhasil dikonfirmasi" dengan tautan /wali/infak/<id>. Rute itu sudah tidak
-- ada (menu wali kini /santri/infak), sehingga tautan di lonceng notifikasi
-- berujung 404. Tautan diganti ke /santri/infak (sama seperti notifikasi
-- konfirmasi manual di payment_dev_confirm).
-- Isi fungsi selain tautan TIDAK berubah. Hak eksekusi tetap hanya service_role.
-- Idempoten — aman dijalankan ulang. Tidak ada drop tabel / kolom / data.
-- ============================================================================

create or replace function public.payment_mark_paid_auto(
  p_reference text,
  p_trx_id    text,
  p_via       text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx public.payment_transactions;
begin
  select * into v_tx from public.payment_transactions where reference = p_reference for update;
  if v_tx is null then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.status = 'PAID' then return; end if;                    -- idempotent

  update public.payment_transactions
  set status = 'PAID', provider_trx_id = p_trx_id, provider_paid_via = p_via,
      confirmed_at = now(), confirmed_by = null, updated_at = now()
  where id = v_tx.id;

  -- Alokasi: setiap bulan mendapat pelunasan sendiri (rule #38).
  update public.payment_invoices i
  set status = 'PAID', paid_at = now(), paid_via = 'IPAYMU', updated_at = now()
  where exists (
    select 1 from public.payment_allocations a where a.invoice_id = i.id and a.transaction_id = v_tx.id
  );

  insert into public.notifications (user_id, tenant_id, type, title, body, link)
  values (v_tx.payer_profile_id, v_tx.tenant_id, 'PAYMENT_CONFIRMED',
          'Pembayaran berhasil dikonfirmasi',
          'Infak Pengembangan sebesar Rp' || v_tx.total_amount::text || ' telah kami terima. Terima kasih.',
          '/santri/infak');
end;
$$;

-- CREATE OR REPLACE mempertahankan hak akses, tetapi ditegaskan ulang agar
-- fungsi ini tidak pernah terbuka untuk user login (lihat migration sebelumnya).
revoke all on function public.payment_mark_paid_auto(text, text, text) from public, anon, authenticated;
grant execute on function public.payment_mark_paid_auto(text, text, text) to service_role;
