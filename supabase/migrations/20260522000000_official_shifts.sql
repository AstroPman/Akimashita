-- ============================================================
-- Migration: 20260522000000_official_shifts.sql
-- Description:
--   公式サロンサイト（個別セラピストページ）から取得した「シフト時間範囲」を
--   保持する Layer 2 を追加する。
--
--   Layer 1（予約サイト = availability）はスロット粒度の真実であり、これまで通り
--   `slot_opened` 通知を発火する。
--   Layer 2（公式サイト = external_therapist_shifts）は「シフト範囲の存在」という
--   別の質問に対して authoritative であり、`availability` テーブルには書き込まない。
--
--   通知ロジック:
--     Rule A (shift_announced 発火):
--       公式サイトで新シフトを観測し、その (therapist, date) に availability 行が
--       まだ無いとき → 新通知タイプ 'shift_announced' を発火する。
--     Rule B (slot_opened 抑制):
--       後から Layer 1 が slot_opened を出すとき、同 (user, therapist, date) で
--       既に shift_announced の notification_logs があり、shift_start <= slot_start
--       <= shift_end の範囲に入る場合は重複なので抑制する。
--
--   付帯変更:
--     - external_therapist_shifts: 新規テーブル（external_therapists に親リンク）
--     - notification_logs.kind / shift_end: 通知タイプの分離と shift_announced 行で
--       使う shift_end カラム
--     - notification_logs の unique 制約を kind を含めた形に張り替え
--     - upsert_external_therapist_shifts RPC: jsonb 配列を一括 upsert し、
--       first_seen_at / last_seen_at を「初観測時のみ」or「更新時のみ」で分離管理
--     - enqueue_shift_notifications RPC: Rule A を実装
--     - enqueue_notifications RPC: Rule B 抑制を追加（plan_tier 版を上書き）
-- ============================================================


-- ============================================================
-- external_therapist_shifts
--   公式サイトから取得したシフト範囲を 1 行 = (therapist, date, start, end) で持つ。
--   跨ぎ深夜 (例: 22:00-04:00) はパーサ側で 2 行に分割保存し、`time` 型の範囲内に閉じる。
--
--   - first_seen_at: 初めて観測した時刻。upsert で行が新規 INSERT されたときだけ now() を入れ、
--                    既存行の UPDATE では保持する。enqueue_shift_notifications の候補絞り込みに使う。
--   - last_seen_at:  最後にスクレイパが「まだあるよ」と確認した時刻。毎回の upsert で now() に進む。
--   - deleted_at:    公式から消えたシフト用の論理削除カラム。再出現時は first_seen_at を更新して
--                    新規通知扱いに乗せる。
-- ============================================================
create table external_therapist_shifts (
  id                    uuid primary key default gen_random_uuid(),
  external_therapist_id uuid not null references external_therapists(id) on delete cascade,
  date                  date not null,
  shift_start           time not null,
  shift_end             time not null,
  source                text not null default 'official_homepage',
  first_seen_at         timestamptz default now() not null,
  last_seen_at          timestamptz default now() not null,
  deleted_at            timestamptz,
  created_at            timestamptz default now() not null,
  updated_at            timestamptz default now() not null,
  unique (external_therapist_id, date, shift_start, shift_end)
);

create index idx_external_therapist_shifts_external_therapist_date
  on external_therapist_shifts(external_therapist_id, date)
  where deleted_at is null;

create index idx_external_therapist_shifts_first_seen_at
  on external_therapist_shifts(first_seen_at)
  where deleted_at is null;

create trigger trg_external_therapist_shifts_updated_at
  before update on external_therapist_shifts
  for each row execute function update_updated_at();


-- ============================================================
-- RLS
-- 参照テーブルなので誰でも select 可、書き込みは service_role のみ。
-- ============================================================
alter table external_therapist_shifts enable row level security;

create policy "external_therapist_shifts_select"
  on external_therapist_shifts for select using (true);


-- ============================================================
-- notification_logs に kind / shift_end カラムを追加
--   - kind: 通知タイプ。既存行は全て 'slot_opened'（default）。
--   - shift_end: 'shift_announced' 行で使うシフト終了時刻。'slot_opened' は null。
--   既存行は `kind = 'slot_opened'`, `shift_end = null` で整合する。
-- ============================================================
alter table notification_logs
  add column if not exists kind      text not null default 'slot_opened',
  add column if not exists shift_end time;

-- kind は 2 種類のみ許可。新タイプを増やしたい時はここを拡張する。
alter table notification_logs
  add constraint notification_logs_kind_check
  check (kind in ('slot_opened', 'shift_announced'));

-- shift_announced のときだけ shift_end が必須、slot_opened のときは null。
-- 不整合な行の混入を防ぐためのガード制約。
alter table notification_logs
  add constraint notification_logs_shift_end_required
  check (
    (kind = 'shift_announced' and shift_end is not null)
    or (kind = 'slot_opened'  and shift_end is null)
  );


-- ============================================================
-- notification_logs の unique 制約を kind 込みに張り替え
-- 同一 (watch, therapist, date, start_time, channel) でも kind が違えば共存させる。
-- 例: shift_announced (start_time=12:00) と slot_opened (start_time=12:00) を別々に enqueue 可能。
-- ============================================================
alter table notification_logs
  drop constraint notification_logs_unique_target;

alter table notification_logs
  add constraint notification_logs_unique_target
  unique (watch_setting_id, therapist_id, date, start_time, kind, channel);


-- ============================================================
-- upsert_external_therapist_shifts
--   jsonb 配列 [{ date, shift_start, shift_end }] を一括 upsert する。
--
--   first_seen_at / last_seen_at の挙動:
--     - INSERT 時: 両方 now()。enqueue_shift_notifications の候補条件
--       `first_seen_at = last_seen_at` にヒットして通知パスに乗る。
--     - UPDATE 時 (既存行と同一範囲): last_seen_at だけ now() に進める。
--       first_seen_at は保持し、再通知を防ぐ。
--     - 論理削除復活時 (既存行が deleted_at セット済み): deleted_at を null に戻し、
--       first_seen_at = last_seen_at = now() で新規通知扱いに乗せる。
--
--   呼び出し側: apps/scraper/src/jobs/official_shifts.ts
-- ============================================================
create or replace function upsert_external_therapist_shifts(
  p_external_therapist_id uuid,
  p_rows jsonb
) returns void as $$
begin
  insert into external_therapist_shifts (
    external_therapist_id, date, shift_start, shift_end, source,
    first_seen_at, last_seen_at, deleted_at
  )
  select
    p_external_therapist_id,
    (r->>'date')::date,
    (r->>'shift_start')::time,
    (r->>'shift_end')::time,
    coalesce(r->>'source', 'official_homepage'),
    now(),
    now(),
    null
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  on conflict (external_therapist_id, date, shift_start, shift_end) do update
    set last_seen_at = now(),
        -- 論理削除されていた行が再出現したケースのみ first_seen_at をリセットして
        -- 新規通知扱いに乗せる。生存中の行では first_seen_at は保持する。
        first_seen_at = case
          when external_therapist_shifts.deleted_at is not null then now()
          else external_therapist_shifts.first_seen_at
        end,
        deleted_at    = null,
        updated_at    = now();
end;
$$ language plpgsql;

revoke all on function upsert_external_therapist_shifts(uuid, jsonb) from public;
grant execute on function upsert_external_therapist_shifts(uuid, jsonb) to service_role;


-- ============================================================
-- enqueue_shift_notifications (Rule A)
--   公式サイト由来の新シフトを検知して 'shift_announced' を発火する。
--
--   候補:
--     external_therapist_shifts のうち、今回の upsert で初観測 (first_seen_at = last_seen_at)
--     かつ deleted_at が null のもの。
--
--   絞り込み (= 抑止条件):
--     1. その (therapist, date) に availability 行が 1 件でもあれば skip
--        → 予約サイト側が先行しているので Layer 1 の slot_opened に任せる。
--     2. c.first_seen_at > w.baseline_at で baseline ガード。
--     3. watch_schedules があれば [shift_start, shift_end] と [time_from, time_to] の overlap 必須。
--     4. 同 (watch, therapist, date, kind='shift_announced', channel) で既に
--        notification_logs が存在すれば skip（同日 1 通の縛り）。
--
--   send_after: plan_tier に応じた遅延 (enqueue_notifications と同じポリシー)
--     premium  : now()
--     standard : now() + 5 minutes
--     free     : now() + 10 minutes
--
--   挿入する notification_logs 行:
--     kind = 'shift_announced'
--     start_time = shift_start, shift_end = shift_end （Rule B の範囲判定で参照する）
--
--   戻り値: 追加された通知件数
-- ============================================================
create or replace function enqueue_shift_notifications()
returns integer as $$
declare
  inserted_count integer;
begin
  with
  -- 今回 upsert で初観測されたシフトだけを候補とする
  candidates as (
    select
      ets.id,
      ets.external_therapist_id,
      ets.date,
      ets.shift_start,
      ets.shift_end,
      ets.first_seen_at
    from external_therapist_shifts ets
    where ets.deleted_at is null
      and ets.first_seen_at = ets.last_seen_at
  ),
  -- 監視中セラピスト × channel 展開
  watches as (
    select
      ws.id                       as watch_setting_id,
      ws.therapist_id             as internal_therapist_id,
      ws.baseline_at,
      t.external_therapist_id,
      u.plan_tier,
      ch.channel
    from watch_settings ws
    join therapists t on t.id = ws.therapist_id and t.deleted_at is null
    join users u      on u.id = ws.user_id
    cross join lateral (
      values
        ('line',  ws.notify_line),
        ('email', ws.notify_email)
    ) as ch(channel, enabled)
    where ws.is_active = true
      and ws.deleted_at is null
      and ch.enabled is true
      and u.deleted_at is null
      and t.external_therapist_id is not null
  ),
  targets as (
    select
      w.watch_setting_id,
      w.internal_therapist_id as therapist_id,
      c.date,
      c.shift_start,
      c.shift_end,
      w.channel,
      case w.plan_tier
        when 'premium'  then now()
        when 'standard' then now() + interval '5 minutes'
        when 'free'     then now() + interval '10 minutes'
      end as send_after
    from candidates c
    join watches w
      on w.external_therapist_id = c.external_therapist_id
     -- baseline 以前から見えていたシフトは黙らせる。
     -- 「監視を始めた以降に公開された新シフト」だけを通知対象にする。
     and c.first_seen_at > w.baseline_at
    where
      -- 1. 予約サイトに既に該当日の availability があるなら Layer 1 に任せる
      not exists (
        select 1 from availability a
        where a.therapist_id = w.internal_therapist_id
          and a.date         = c.date
      )
      -- 2. watch_schedules による日時絞り込み（slot_opened と同じポリシー）
      and (
        not exists (
          select 1 from watch_schedules wsc
          where wsc.watch_setting_id = w.watch_setting_id
            and wsc.deleted_at is null
        )
        or exists (
          select 1 from watch_schedules wsc
          where wsc.watch_setting_id = w.watch_setting_id
            and wsc.deleted_at is null
            and (wsc.target_date is null or wsc.target_date = c.date)
            -- shift range [shift_start, shift_end] と
            -- watch range [time_from, time_to] の overlap 判定
            and (wsc.time_from is null or wsc.time_from <= c.shift_end)
            and (wsc.time_to   is null or wsc.time_to   >= c.shift_start)
        )
      )
      -- 3. 同日に既に shift_announced を出していれば抑制
      and not exists (
        select 1 from notification_logs nl
        where nl.watch_setting_id = w.watch_setting_id
          and nl.therapist_id     = w.internal_therapist_id
          and nl.date             = c.date
          and nl.kind             = 'shift_announced'
          and nl.channel          = w.channel
      )
  ),
  ins as (
    insert into notification_logs (
      watch_setting_id, therapist_id, date, start_time, shift_end, kind, channel, send_after
    )
    select
      watch_setting_id, therapist_id, date, shift_start, shift_end,
      'shift_announced', channel, send_after
    from targets
    returning 1
  )
  select count(*) into inserted_count from ins;

  return coalesce(inserted_count, 0);
end;
$$ language plpgsql;

revoke all on function enqueue_shift_notifications() from public;
grant execute on function enqueue_shift_notifications() to service_role;


-- ============================================================
-- enqueue_notifications (Rule B 追加)
--   plan_tier 版 (20260514000000_plan_tier_introduction.sql) を上書きする。
--   追加点: targets CTE の末尾の not exists 群に「shift_announced で範囲が
--   覆われている slot_opened を抑止する」条件を追加する。
--   それ以外のロジック (candidates, send_after 計算, baseline / first_availability_synced_at
--   ガード, watch_schedules) は完全に維持する。
-- ============================================================
create or replace function enqueue_notifications()
returns integer as $$
declare
  inserted_count integer;
begin
  with
  candidates as (
    select
      a.therapist_id,
      a.date,
      a.start_time,
      a.first_seen_at,
      a.last_state_change_at
    from availability a
    where a.is_available = true
      and (
        a.previous_is_available is false
        or a.first_seen_at = a.updated_at
      )
  ),
  watches as (
    select
      ws.id           as watch_setting_id,
      ws.therapist_id,
      ws.baseline_at,
      ws.first_availability_synced_at,
      u.plan_tier,
      ch.channel
    from watch_settings ws
    join users u on u.id = ws.user_id
    cross join lateral (
      values
        ('line',  ws.notify_line),
        ('email', ws.notify_email)
    ) as ch(channel, enabled)
    where ws.is_active = true
      and ws.deleted_at is null
      and ch.enabled is true
      and u.deleted_at is null
  ),
  targets as (
    select
      w.watch_setting_id,
      c.therapist_id,
      c.date,
      c.start_time,
      w.channel,
      case w.plan_tier
        when 'premium'  then now()
        when 'standard' then now() + interval '5 minutes'
        when 'free'     then now() + interval '10 minutes'
      end as send_after
    from candidates c
    join watches w
      on w.therapist_id           = c.therapist_id
     and c.last_state_change_at  > w.baseline_at
     and (
       c.first_seen_at < w.baseline_at
       or (
         w.first_availability_synced_at is not null
         and c.first_seen_at > w.first_availability_synced_at
       )
     )
    where (
      not exists (
        select 1 from watch_schedules wsc
        where wsc.watch_setting_id = w.watch_setting_id
          and wsc.deleted_at is null
      )
      or exists (
        select 1 from watch_schedules wsc
        where wsc.watch_setting_id = w.watch_setting_id
          and wsc.deleted_at is null
          and (wsc.target_date is null or wsc.target_date = c.date)
          and (wsc.time_from   is null or wsc.time_from   <= c.start_time)
          and (wsc.time_to     is null or wsc.time_to     >= c.start_time)
      )
    )
    -- 既存の slot_opened 重複防止（kind 込み unique 制約に合わせて kind 条件を明示）
    and not exists (
      select 1 from notification_logs nl
      where nl.watch_setting_id = w.watch_setting_id
        and nl.therapist_id     = c.therapist_id
        and nl.date             = c.date
        and nl.start_time       = c.start_time
        and nl.kind             = 'slot_opened'
        and nl.channel          = w.channel
    )
    -- Rule B: 同 (watch, therapist, date) で既に shift_announced を送っており、
    -- そのシフト範囲 [shift_start, shift_end] が当該スロット start_time を覆っている
    -- 場合は重複通知として抑止する。
    and not exists (
      select 1 from notification_logs nl
      where nl.watch_setting_id = w.watch_setting_id
        and nl.therapist_id     = c.therapist_id
        and nl.date             = c.date
        and nl.kind             = 'shift_announced'
        and nl.channel          = w.channel
        and nl.start_time       <= c.start_time
        and nl.shift_end        >= c.start_time
    )
  ),
  ins as (
    insert into notification_logs (
      watch_setting_id, therapist_id, date, start_time, kind, channel, send_after
    )
    select
      watch_setting_id, therapist_id, date, start_time,
      'slot_opened', channel, send_after
    from targets
    returning 1
  )
  select count(*) into inserted_count from ins;

  return coalesce(inserted_count, 0);
end;
$$ language plpgsql;
