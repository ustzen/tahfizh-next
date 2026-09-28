-- ============================================================================
-- TAHFIZH V50 — Status "terakhir online" akun wali santri
-- ============================================================================
-- Menu Data Santri (admin/koordinator/guru) menampilkan kolom "Online":
-- kapan terakhir akun wali yang tertaut ke santri itu aktif membuka aplikasi.
--
-- Sumber data: profiles.last_seen_at — diperbarui setiap kali profil dimuat
-- (RPC touch_last_seen dipanggil dari getSessionProfile; fire-and-forget).
-- Akun santri tidak login; yang login adalah akun wali (guardians → profiles),
-- jadi status online santri = aktivitas akun walinya.
--
-- Idempoten: add column if not exists + create or replace.
-- ============================================================================

alter table public.profiles add column if not exists last_seen_at timestamptz;
create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at);

-- Dipanggil aplikasi pada setiap muatan halaman ber-autentikasi. Update hanya
-- kolom ringan; nilainya tidak pernah mundur (least) bila dua request balapan.
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set last_seen_at = now()
  where id = auth.uid()
    and (last_seen_at is null or last_seen_at < now() - interval '60 seconds');
$$;

grant execute on function public.touch_last_seen() to authenticated;
