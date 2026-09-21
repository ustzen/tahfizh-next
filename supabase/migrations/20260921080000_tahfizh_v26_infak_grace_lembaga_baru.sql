-- ============================================================================
-- TAHFIZH V26 — INFAK PENGEMBANGAN: MASA TENGGANG LEMBAGA BARU
-- ============================================================================
-- Aturan baru:
--   Jika sebuah lembaga (tenant) baru mendaftar SETELAH tanggal 15 pada suatu
--   bulan, maka tagihan infak pengembangan pertamanya BUKAN untuk bulan itu,
--   melainkan baru muncul tanggal 1 bulan berikutnya. Dengan begitu akun wali
--   lembaga tersebut TIDAK langsung terkunci hanya karena baru mendaftar di
--   akhir bulan (jatuh temponya sudah lewat tanggal 15 saat tagihan dibuat).
--
--   Jika lembaga mendaftar pada tanggal 1-15, tidak ada perubahan perilaku:
--   tagihan bulan berjalan tetap dibuat seperti biasa, jatuh tempo tanggal 15,
--   dan akun terkunci mulai tanggal 16 bila belum lunas (gate lama, tetap).
--
--   Untuk lembaga yang mendaftar setelah tanggal 15:
--     - Bulan pendaftaran: TIDAK ada tagihan (tidak dihitung, tidak dikunci).
--     - Tagihan pertama muncul tanggal 1 bulan berikutnya, jatuh tempo
--       tanggal 15 bulan itu, dan akun terkunci mulai tanggal 16 bila belum
--       lunas — sama seperti lembaga lain.
--
-- Implementasi: public.tenant_billing_start_month(created_at) menghitung
-- bulan pertama lembaga itu wajib ditagih (berdasarkan tanggal 15, zona
-- waktu Asia/Jakarta). invoice_generate_all() dan invoice_ensure_for_guardian()
-- memakainya sebagai syarat tambahan sebelum membuat tagihan.
--
-- Perbaikan data: menghapus tagihan bulan berjalan yang SUDAH TERLANJUR
-- dibuat (dan belum dibayar) untuk lembaga yang baru mendaftar setelah
-- tanggal 15 pada bulan yang sama, supaya akunnya tidak terkunci karena
-- tagihan yang seharusnya belum boleh terbit.
-- Aman dijalankan ulang (idempoten). Tidak ada drop tabel / kolom.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fungsi: bulan pertama lembaga wajib ditagih infak pengembangan.
--    Daftar tanggal 1-15  -> bulan yang sama.
--    Daftar tanggal 16-31 -> bulan berikutnya.
-- ---------------------------------------------------------------------------
create or replace function public.tenant_billing_start_month(p_created_at timestamptz)
returns date language sql stable as $$
  select case
    when extract(day from (p_created_at at time zone 'Asia/Jakarta')) > 15
      then (date_trunc('month', (p_created_at at time zone 'Asia/Jakarta')) + interval '1 month')::date
    else date_trunc('month', (p_created_at at time zone 'Asia/Jakarta'))::date
  end
$$;

revoke all on function public.tenant_billing_start_month(timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. invoice_generate_all — tambahkan syarat masa tenggang lembaga baru.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_generate_all(
  p_year  integer default null,
  p_month integer default null
)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_today record;
  v_amount integer;
  v_count integer := 0;
begin
  select * into v_today from public.jakarta_today();
  p_year  := coalesce(p_year, v_today.y);
  p_month := coalesce(p_month, v_today.m);

  select default_amount into v_amount from public.platform_payment_settings where id;
  v_amount := greatest(coalesce(v_amount, 1000), 1000);

  with ins as (
    insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount)
    select s.tenant_id, s.id,
           case when p_month >= 7 then p_year::text || '/' || (p_year + 1)::text
                else (p_year - 1)::text || '/' || p_year::text end,
           p_year, p_month, v_amount
    from public.students s
    join public.tenants t on t.id = s.tenant_id and t.status = 'ACTIVE'
    where s.status = 'ACTIVE'
      and make_date(p_year, p_month, 1) >= public.tenant_billing_start_month(t.created_at)
      and not exists (
        select 1 from public.payment_invoices i
        where i.student_id = s.id and i.year = p_year and i.month = p_month
      )
    on conflict (tenant_id, student_id, academic_year, year, month) do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. invoice_ensure_for_guardian — syarat yang sama untuk fallback per-wali.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_ensure_for_guardian(p_guardian_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_today record;
  v_amount integer;
begin
  select * into v_today from public.jakarta_today();
  select default_amount into v_amount from public.platform_payment_settings where id;
  v_amount := greatest(coalesce(v_amount, 1000), 1000);

  insert into public.payment_invoices (tenant_id, student_id, academic_year, year, month, amount)
  select s.tenant_id, s.id,
         case when v_today.m >= 7 then v_today.y::text || '/' || (v_today.y + 1)::text
              else (v_today.y - 1)::text || '/' || v_today.y::text end,
         v_today.y, v_today.m, v_amount
  from public.guardian_students gs
  join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
  join public.tenants t on t.id = s.tenant_id and t.status = 'ACTIVE'
  where gs.guardian_id = p_guardian_id
    and make_date(v_today.y, v_today.m, 1) >= public.tenant_billing_start_month(t.created_at)
    and not exists (
      select 1 from public.payment_invoices i
      where i.student_id = s.id and i.year = v_today.y and i.month = v_today.m
    )
  on conflict (tenant_id, student_id, academic_year, year, month) do nothing;
end;
$$;

revoke all on function public.invoice_generate_all(integer, integer) from public, anon, authenticated;
revoke all on function public.invoice_ensure_for_guardian(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Perbaikan data: hapus tagihan yang terlanjur terbit di luar masa
--    tenggang (belum lunas) — hanya menyentuh tagihan UNPAID/PENDING milik
--    lembaga yang mendaftar setelah tanggal 15 pada bulan tagihan itu sendiri.
--    Tagihan yang sudah PAID/WAITING_CONFIRM tidak disentuh.
-- ---------------------------------------------------------------------------
delete from public.payment_invoices i
using public.tenants t
where i.tenant_id = t.id
  and i.status in ('UNPAID', 'PENDING')
  and make_date(i.year, i.month, 1) < public.tenant_billing_start_month(t.created_at);
