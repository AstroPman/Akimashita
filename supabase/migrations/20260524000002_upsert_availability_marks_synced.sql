-- ============================================================
-- Migration: 20260524000002_upsert_availability_marks_synced.sql
-- Description:
--   upsert_availability RPC の最後で therapists.last_synced_at を併せて
--   更新するようにする。
--
--   背景:
--     旧実装は scraper が成功パスで毎回別途
--       UPDATE therapists SET last_synced_at = now() WHERE id = $1
--     を PostgREST 経由で打っており、Stage 3 (1 分間隔) では
--     pg_stat_statements 観測で 433,565 calls / 414 sec / shared_blks_dirtied
--     135,339 と全 UPDATE 系の最大頻度を占めていた。HOT update であっても
--     WAL 書き込みは発生するため Disk IO Budget を圧迫する。
--
--   解決:
--     upsert_availability と同一トランザクションに last_synced_at の
--     UPDATE を畳む。RPC 呼び出し数 / RTT も併せて削減できる。
--
--   後方互換:
--     - シグネチャは変更しない (uuid, jsonb, date[] default null) のまま。
--     - 既存呼び出し元は引数を変えずにそのまま動く。
--     - 旧コードに残っている独立 UPDATE 経路は scraper 側で順次撤去するが、
--       仮に残っていても二重 UPDATE になるだけで動作上の害は無い。
-- ============================================================

create or replace function upsert_availability(
  p_therapist_id    uuid,
  p_rows            jsonb,
  p_observed_dates  date[] default null
) returns void as $$
declare
  v_now timestamptz := now();
begin
  -- ============================================================
  -- 1. 通常の upsert (従来挙動)
  --    INSERT 行は discovered_*、UPDATE で is_available が変化した行は
  --    opened / closed として availability_events に追記する。
  -- ============================================================
  with upserted as (
    insert into availability (
      therapist_id, date, start_time, is_available, previous_is_available
    )
    select
      p_therapist_id,
      (r->>'date')::date,
      (r->>'start_time')::time,
      (r->>'is_available')::boolean,
      null
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    on conflict (therapist_id, date, start_time) do update
      set previous_is_available = availability.is_available,
          is_available          = excluded.is_available,
          last_state_change_at  = case
            when availability.is_available is distinct from excluded.is_available
              then v_now
            else availability.last_state_change_at
          end,
          updated_at            = v_now
    returning
      therapist_id,
      date,
      start_time,
      is_available,
      previous_is_available,
      -- xmax = 0 のときが INSERT、それ以外は ON CONFLICT による UPDATE。
      (xmax = 0) as is_inserted
  )
  insert into availability_events (
    therapist_id, date, start_time, event_type, occurred_at
  )
  select
    therapist_id,
    date,
    start_time,
    case
      when is_inserted and is_available     then 'discovered_open'
      when is_inserted and not is_available then 'discovered_closed'
      when is_available                     then 'opened'
      else                                       'closed'
    end,
    v_now
  from upserted
  where is_inserted
     or previous_is_available is distinct from is_available;

  -- ============================================================
  -- 2. 観測範囲内で「records に含まれない既存 is_available=true 行」を
  --    false に倒して closed イベントを追記する。
  --
  --    p_observed_dates が NULL または空のときは何もしない (後方互換)。
  --
  --    対象は「過去日も含めて」観測範囲に入っているすべての日。
  --    scraper 側が「fetch に成功した日」だけを渡すルールにすることで、
  --    HTTP エラーで取れなかった日の既存行を誤って閉じない安全弁とする。
  -- ============================================================
  if p_observed_dates is not null and array_length(p_observed_dates, 1) > 0 then
    with submitted as (
      select
        (r->>'date')::date as date,
        (r->>'start_time')::time as start_time
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
    ),
    disappeared as (
      update availability a
      set previous_is_available = a.is_available,
          is_available          = false,
          last_state_change_at  = v_now,
          updated_at            = v_now
      where a.therapist_id = p_therapist_id
        and a.date = any(p_observed_dates)
        and a.is_available = true
        and not exists (
          select 1 from submitted s
          where s.date = a.date
            and s.start_time = a.start_time
        )
      returning a.therapist_id, a.date, a.start_time
    )
    insert into availability_events (
      therapist_id, date, start_time, event_type, occurred_at
    )
    select therapist_id, date, start_time, 'closed', v_now
    from disappeared;
  end if;

  -- ============================================================
  -- 3. therapists.last_synced_at の更新を同一トランザクションに畳む。
  --    旧 scraper の独立 UPDATE 経路 (markTherapistSynced) を吸収する。
  --
  --    therapists.deleted_at が立っているケースは更新しない:
  --      Stage 3 と並行する soft-delete (404/410) との競合を避けつつ、
  --      論理削除済みセラピストの last_synced_at を進めない設計を維持する。
  --
  --    therapists.updated_at は trg_therapists_updated_at trigger で
  --    自動更新されるため、ここでは last_synced_at のみ書く。
  -- ============================================================
  update therapists
  set last_synced_at = v_now
  where id = p_therapist_id
    and deleted_at is null;
end;
$$ language plpgsql;
