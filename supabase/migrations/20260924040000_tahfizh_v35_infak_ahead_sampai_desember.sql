-- ============================================================================
-- TAHFIZH V35 — INFAK: "bayar di muka" tampil sampai Desember tahun berjalan
-- ============================================================================
-- Sebelumnya payment_wali_invoices() membangun daftar "ahead" (bayar di muka)
-- dengan generate_series(1, 11) — jendela BERGULIR 11 bulan ke depan dari
-- bulan berjalan, yang bisa melewati akhir tahun (mis. bulan berjalan Maret
-- → tampil sampai Februari tahun depan).
--
-- Permintaan: daftar bayar di muka berhenti di BULAN DESEMBER tahun berjalan
-- (bukan bergulir 11 bulan). Begitu memasuki Januari, daftar otomatis mulai
-- lagi dari Februari s.d. Desember tahun itu — karena dihitung dari
-- (12 - bulan_berjalan), ini terjadi otomatis setiap tahun tanpa perlu
-- konfigurasi ulang.
--
-- Catatan: validasi sisi payment_initiate (BULAN_DI_LUAR_BATAS, batas 11
-- bulan) tidak perlu diubah — Desember tahun berjalan selalu berada dalam
-- batas 11 bulan itu, jadi tetap kompatibel.
-- Idempoten, tidak mengubah data.
-- ============================================================================

create or replace function public.payment_wali_invoices(p_year integer default null, p_month integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_guardian public.guardians;
  v_today record;
  v_settings public.platform_payment_settings;
  v_default integer;
  v_cur integer;
  v_children jsonb;
  v_others jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile is null or v_profile.role <> 'WALI_SANTRI' then raise exception 'AKSES_DITOLAK'; end if;
  select * into v_today from public.jakarta_today();
  p_year := coalesce(p_year, v_today.y); p_month := coalesce(p_month, v_today.m);
  v_cur := v_today.y * 12 + v_today.m;
  select * into v_settings from public.platform_payment_settings where id;
  v_default := greatest(coalesce(v_settings.default_amount, 1000), 1000);

  select * into v_guardian from public.guardians where profile_id = v_profile.id;
  if v_guardian is not null then
    perform public.invoice_ensure_for_guardian(v_guardian.id);
  end if;

  -- Anak sendiri: tagihan belum lunas s.d. bulan berjalan (terlama dulu) +
  -- bayar di muka SAMPAI DESEMBER tahun berjalan (status NONE = belum ada
  -- tagihan, dibuat saat dibayar). (12 - v_today.m) bulan tersisa setelah
  -- bulan berjalan; bila bulan berjalan Desember, tidak ada sisa (kosong).
  select coalesce(jsonb_agg(x.j order by x.n), '[]'::jsonb) into v_children
  from (
    select s.full_name as n,
      jsonb_build_object(
        'studentId', s.id, 'name', s.full_name, 'code', s.business_code,
        'invoices', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'id', i.id, 'y', i.year, 'm', i.month,
                   'amount', i.amount, 'status', i.status,
                   'paidAt', i.paid_at, 'paidVia', i.paid_via
                 ) order by i.year, i.month), '[]'::jsonb)
          from public.payment_invoices i
          where i.student_id = s.id and i.status <> 'PAID'
            and i.year * 12 + i.month <= v_cur
        ),
        'ahead', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'id', i.id, 'y', g.y, 'm', g.m,
                   'amount', coalesce(i.amount, v_default),
                   'status', coalesce(i.status, 'NONE')
                 ) order by g.k), '[]'::jsonb)
          from (
            select k, v_today.y as y, (v_today.m + k) as m
            from generate_series(1, greatest(12 - v_today.m, 0)) k
          ) g
          left join public.payment_invoices i
            on i.student_id = s.id and i.year = g.y and i.month = g.m
        )
      ) as j
    from public.guardian_students gs
    join public.students s on s.id = gs.student_id and s.status = 'ACTIVE'
    where v_guardian is not null and gs.guardian_id = v_guardian.id
  ) x;

  -- Santri lain di lembaga yang sama yang punya tunggakan (status UNPAID s.d.
  -- bulan berjalan). Urutan: bulan tunggakan tertua, jumlah bulan terbanyak, nama.
  select coalesce(jsonb_agg(jsonb_build_object(
           'studentId', q.id, 'name', q.name, 'code', q.code,
           'oldestY', (q.oldest_idx - 1) / 12, 'oldestM', ((q.oldest_idx - 1) % 12) + 1,
           'unpaidCount', q.cnt, 'unpaidTotal', q.total, 'invoices', q.invs
         ) order by q.oldest_idx, q.cnt desc, q.name), '[]'::jsonb) into v_others
  from (
    select s.id, s.full_name as name, s.business_code as code,
           min(i.year * 12 + i.month) filter (where i.status = 'UNPAID') as oldest_idx,
           count(*) filter (where i.status = 'UNPAID') as cnt,
           coalesce(sum(i.amount) filter (where i.status = 'UNPAID'), 0) as total,
           jsonb_agg(jsonb_build_object(
             'id', i.id, 'y', i.year, 'm', i.month, 'amount', i.amount, 'status', i.status
           ) order by i.year, i.month) as invs
    from public.students s
    join public.payment_invoices i on i.student_id = s.id
    where s.tenant_id = v_profile.tenant_id
      and s.status = 'ACTIVE'
      and i.status <> 'PAID'
      and i.year * 12 + i.month <= v_cur
      and (v_guardian is null or s.id not in (
            select gs.student_id from public.guardian_students gs where gs.guardian_id = v_guardian.id))
    group by s.id, s.full_name, s.business_code
    having count(*) filter (where i.status = 'UNPAID') > 0
    order by min(i.year * 12 + i.month) filter (where i.status = 'UNPAID'),
             count(*) filter (where i.status = 'UNPAID') desc, s.full_name
    limit 300
  ) q;

  return jsonb_build_object(
    'children', v_children,
    'others', v_others,
    'defaultAmount', v_default,
    'y', p_year, 'm', p_month, 'academicYear', v_today.ay,
    'bank', jsonb_build_object(
      'bankName', v_settings.bank_name, 'bankNo', v_settings.bank_account_no,
      'bankAccount', v_settings.bank_account_name, 'instructions', v_settings.instructions,
      'confirmNote', v_settings.confirm_note, 'qrisPath', v_settings.qris_path
    )
  );
end;
$$;
