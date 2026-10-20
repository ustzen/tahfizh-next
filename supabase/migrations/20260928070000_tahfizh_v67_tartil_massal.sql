-- ============================================================================
-- TAHFIZH V67 — INPUT NILAI TARTIL SECARA MASSAL (guru)
-- ============================================================================
-- Kebutuhan: lembaga baru yang sudah terlanjur mencatat nilai Tartil di kertas
-- perlu memasukkan data banyak santri sekaligus tanpa buka form satu per satu.
--
-- RPC baru `tartil_save_assessments_bulk(p_items jsonb)` mengeksekusi
-- `tartil_save_assessment` untuk tiap item dalam SATU panggilan, sehingga semua
-- aturan lama tetap berlaku per item (session→role→guru→binaan→materi aktif→
-- mode/grade lembaga, max 5 slot catatan) dan validasi tidak diwariskan siapa
-- pun dari klien. Gagal di satu item = seluruh batch dibatalkan (satu transaksi).
--
-- Idempoten: drop/create ulang fungsi (aman rerun).
-- ============================================================================

drop function if exists public.tartil_save_assessments_bulk(jsonb);

create or replace function public.tartil_save_assessments_bulk(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_count integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'BATCH_KOSONG';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count > 200 then
    raise exception 'BATCH_TERLALU_BESAR';
  end if;

  foreach v_item in array p_items loop
    perform public.tartil_save_assessment(
      (v_item->>'student_id')::uuid,
      (v_item->>'material_id')::uuid,
      v_item->>'pages_label',
      v_item->>'status',
      (v_item->>'score_value')::integer,
      v_item->>'score_label',
      v_item->>'free_note',
      coalesce(v_item->'notes', '{}'::jsonb),
      (v_item->>'assessment_id')::uuid
    );
  end loop;
end;
$$;

revoke execute on function public.tartil_save_assessments_bulk(jsonb) from public;
grant execute on function public.tartil_save_assessments_bulk(jsonb) to authenticated;
