-- ============================================================
-- Migration: 20260508000000_availability_events.sql
-- Description: 空き枠の状態遷移を append-only で蓄積する
--              availability_events テーブルを新設。
--              upsert_availability RPC を改修し、状態が変化した行と
--              新規観測された行に対してイベントを 1 行 INSERT する。
--
--   イベント種別:
--     opened             : 既存スロットが false → true に切り替わった
--     closed             : 既存スロットが true  → false に切り替わった
--     discovered_open    : 新規観測で is_available = true
--     discovered_closed  : 新規観測で is_available = false
--
--   このログは集計（瞬殺時間・出現回数・時間帯ヒストグラム等）専用。
--   通知判定は従来どおり availability テーブル + enqueue_notifications で行う。
-- ============================================================


-- ============================================================
-- availability_events
-- ============================================================
create table availability_events (
  id            uuid primary key default gen_random_uuid(),
  therapist_id  uuid not null references therapists(id) on delete cascade,
  date          date not null,
  start_time    time not null,
  event_type    text not null check (
    event_type in ('opened', 'closed', 'discovered_open', 'discovered_closed')
  ),
  occurred_at   timestamptz not null default now()
);


-- セラピスト × スロット単位の時系列クエリ用（瞬殺時間ペアリング等）
create index idx_availability_events_slot_time
  on availability_events(therapist_id, date, start_time, occurred_at);

-- 直近イベント抽出用（時間帯/曜日ヒートマップ等）
create index idx_availability_events_recent
  on availability_events(therapist_id, occurred_at desc);


-- ============================================================
-- RLS: 既存 availability と同様、誰でも SELECT 可、書き込みは service_role のみ
-- ============================================================
alter table availability_events enable row level security;

create policy "availability_events_select"
  on availability_events for select
  using (true);


-- ============================================================
-- upsert_availability の改修
--   - 既存の availability への upsert は従来どおり。
--   - RETURNING 句で xmax = 0 を判定し INSERT / UPDATE を区別する。
--     INSERT 行は discovered_*、UPDATE で is_available が変化した行は
--     opened / closed として availability_events に追記する。
--   - 同一トランザクション内で `now()` は同一値を返すため、
--     availability の last_state_change_at と event の occurred_at は揃う。
-- ============================================================
create or replace function upsert_availability(
  p_therapist_id uuid,
  p_rows jsonb
) returns void as $$
declare
  v_now timestamptz := now();
begin
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
end;
$$ language plpgsql;
