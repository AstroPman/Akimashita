-- ============================================================
-- Migration: 20260523000000_upsert_availability_observed_range.sql
-- Description:
--   upsert_availability RPC を「観測範囲」付きに拡張する。
--
--   背景:
--     estama (および一部のサイト) では、サロン側の設定により
--     「予約済み枠」が `×` ではなく `─` (出勤外) として HTML から消える挙動がある。
--     既存の Stage 3 スクレイパは `─` セルを行として吐かないので、
--     一度 `is_available=true` で DB に乗った行が永遠に `true` のまま放置され、
--     `closed` イベントが発火せず瞬殺時間集計が機能しなかった。
--
--   解決:
--     スクレイパ側で「今回のスクレイプで自分が観測した日付の集合」を
--     `p_observed_dates date[]` として渡せるようにする。
--     RPC は通常の upsert を済ませた後、「観測範囲内で records に含まれない
--     既存 is_available=true 行」を `is_available=false` に倒し、
--     `availability_events` に `closed` イベントを追記する。
--
--   後方互換:
--     - 引数 `p_observed_dates` は default null。
--     - NULL または空配列のときは disappearance 検知をスキップ
--       (= 旧呼び出し元と完全に同じ挙動)。
--     - 既存呼び出し元 (旧 scraper) は引数を渡さなければ従来どおり動作する。
-- ============================================================


-- 旧シグネチャ (uuid, jsonb) を残したまま新シグネチャを add すると
-- PostgREST 側で過剰なオーバーロード曖昧性が出る可能性があるため、旧を drop して張り替える。
drop function if exists upsert_availability(uuid, jsonb);


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
end;
$$ language plpgsql;
