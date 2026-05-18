-- ============================================================
-- Migration: 20260518000000_admin_dashboard_stats.sql
-- Description:
--   管理者向けダッシュボード (apps/dashboard, ローカル限定運用) が
--   呼び出す read-only な集計 RPC をまとめて定義する。
--
--   全関数とも:
--     - language sql / stable / set search_path = public
--     - service_role にのみ grant（anon / authenticated には公開しない）
--     - 戻り値は集計済みテーブルで、アプリ側で更にループしないで済む形
--
--   関数一覧:
--     stats_users_daily(p_days)
--     stats_user_plan_breakdown()
--     stats_external_salons_daily(p_days)
--     stats_external_therapists_daily(p_days)
--     stats_tables_overview()
--     stats_sites_breakdown()
--     stats_notifications_status_daily(p_days)
--     stats_notifications_summary(p_hours)
--     stats_notifications_delay(p_hours)
--     stats_notifications_failed_top(p_hours, p_limit)
--     stats_scraper_freshness(p_threshold_hours)
--     stats_availability_events_recent(p_hours)
-- ============================================================


-- ============================================================
-- generate_series ベースで日付軸を作るヘルパー関数。
-- p_days が 30 のとき today 含めて直近 30 日。タイムゾーンは Asia/Tokyo。
-- inline で使えるよう関数化はせず、各統計関数の WITH 句に書き下す方針。
-- ============================================================


-- ============================================================
-- ユーザ累積推移
--   - day: JST の日付
--   - new_users: その日に作られた public.users 行数
--   - deleted_users: その日に論理削除された行数
--   - cumulative_users: 累積（deleted 除外）
-- ============================================================
create or replace function public.stats_users_daily(p_days int default 30)
returns table (
  day               date,
  new_users         int,
  deleted_users     int,
  cumulative_users  int
)
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      ((now() at time zone 'Asia/Tokyo')::date - (p_days - 1)) as start_day,
      (now() at time zone 'Asia/Tokyo')::date                  as end_day
  ),
  days as (
    select gs::date as day
    from bounds, generate_series(bounds.start_day, bounds.end_day, interval '1 day') gs
  ),
  per_day as (
    select
      d.day,
      coalesce(sum(c.new_users), 0)::int as new_users,
      coalesce(sum(c.deleted_users), 0)::int as deleted_users
    from days d
    left join (
      select
        (created_at at time zone 'Asia/Tokyo')::date as day,
        count(*) as new_users,
        0 as deleted_users
      from public.users
      group by 1
      union all
      select
        (deleted_at at time zone 'Asia/Tokyo')::date as day,
        0 as new_users,
        count(*) as deleted_users
      from public.users
      where deleted_at is not null
      group by 1
    ) c on c.day = d.day
    group by d.day
  ),
  baseline as (
    select count(*)::int as base
    from public.users
    where (created_at at time zone 'Asia/Tokyo')::date < (select start_day from bounds)
      and (
        deleted_at is null
        or (deleted_at at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
      )
  )
  select
    pd.day,
    pd.new_users,
    pd.deleted_users,
    (
      (select base from baseline)
      + sum(pd.new_users) over (order by pd.day rows between unbounded preceding and current row)
      - sum(pd.deleted_users) over (order by pd.day rows between unbounded preceding and current row)
    )::int as cumulative_users
  from per_day pd
  order by pd.day;
$$;


-- ============================================================
-- プラン別ユーザ数（free / standard / premium）
-- deleted_at is null の現役ユーザのみ。
-- ============================================================
create or replace function public.stats_user_plan_breakdown()
returns table (
  plan_tier plan_tier,
  user_count int
)
language sql
stable
set search_path = public
as $$
  with tiers as (
    select unnest(enum_range(null::plan_tier)) as plan_tier
  )
  select
    t.plan_tier,
    coalesce(u.cnt, 0)::int as user_count
  from tiers t
  left join (
    select plan_tier, count(*)::int as cnt
    from public.users
    where deleted_at is null
    group by plan_tier
  ) u on u.plan_tier = t.plan_tier
  order by t.plan_tier;
$$;


-- ============================================================
-- external_salons の日次累積推移
--   - new_rows: その日に created_at された件数
--   - deleted_rows: その日に deleted_at された件数
--   - cumulative_total: 累積総数（削除込み）
--   - cumulative_active: 累積アクティブ（deleted を引いたもの）
-- ============================================================
create or replace function public.stats_external_salons_daily(p_days int default 30)
returns table (
  day                 date,
  new_rows            int,
  deleted_rows        int,
  cumulative_total    int,
  cumulative_active   int
)
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      ((now() at time zone 'Asia/Tokyo')::date - (p_days - 1)) as start_day,
      (now() at time zone 'Asia/Tokyo')::date                  as end_day
  ),
  days as (
    select gs::date as day
    from bounds, generate_series(bounds.start_day, bounds.end_day, interval '1 day') gs
  ),
  per_day as (
    select
      d.day,
      coalesce(sum(c.new_rows), 0)::int as new_rows,
      coalesce(sum(c.deleted_rows), 0)::int as deleted_rows
    from days d
    left join (
      select
        (created_at at time zone 'Asia/Tokyo')::date as day,
        count(*) as new_rows,
        0 as deleted_rows
      from public.external_salons
      group by 1
      union all
      select
        (deleted_at at time zone 'Asia/Tokyo')::date as day,
        0 as new_rows,
        count(*) as deleted_rows
      from public.external_salons
      where deleted_at is not null
      group by 1
    ) c on c.day = d.day
    group by d.day
  ),
  baseline_total as (
    select count(*)::int as base
    from public.external_salons
    where (created_at at time zone 'Asia/Tokyo')::date < (select start_day from bounds)
  ),
  baseline_deleted as (
    select count(*)::int as base
    from public.external_salons
    where deleted_at is not null
      and (deleted_at at time zone 'Asia/Tokyo')::date < (select start_day from bounds)
  )
  select
    pd.day,
    pd.new_rows,
    pd.deleted_rows,
    (
      (select base from baseline_total)
      + sum(pd.new_rows) over (order by pd.day rows between unbounded preceding and current row)
    )::int as cumulative_total,
    (
      (select base from baseline_total)
      - (select base from baseline_deleted)
      + sum(pd.new_rows - pd.deleted_rows) over (order by pd.day rows between unbounded preceding and current row)
    )::int as cumulative_active
  from per_day pd
  order by pd.day;
$$;


-- ============================================================
-- external_therapists の日次累積推移
-- 構造は stats_external_salons_daily と同じ。
-- ============================================================
create or replace function public.stats_external_therapists_daily(p_days int default 30)
returns table (
  day                 date,
  new_rows            int,
  deleted_rows        int,
  cumulative_total    int,
  cumulative_active   int
)
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      ((now() at time zone 'Asia/Tokyo')::date - (p_days - 1)) as start_day,
      (now() at time zone 'Asia/Tokyo')::date                  as end_day
  ),
  days as (
    select gs::date as day
    from bounds, generate_series(bounds.start_day, bounds.end_day, interval '1 day') gs
  ),
  per_day as (
    select
      d.day,
      coalesce(sum(c.new_rows), 0)::int as new_rows,
      coalesce(sum(c.deleted_rows), 0)::int as deleted_rows
    from days d
    left join (
      select
        (created_at at time zone 'Asia/Tokyo')::date as day,
        count(*) as new_rows,
        0 as deleted_rows
      from public.external_therapists
      group by 1
      union all
      select
        (deleted_at at time zone 'Asia/Tokyo')::date as day,
        0 as new_rows,
        count(*) as deleted_rows
      from public.external_therapists
      where deleted_at is not null
      group by 1
    ) c on c.day = d.day
    group by d.day
  ),
  baseline_total as (
    select count(*)::int as base
    from public.external_therapists
    where (created_at at time zone 'Asia/Tokyo')::date < (select start_day from bounds)
  ),
  baseline_deleted as (
    select count(*)::int as base
    from public.external_therapists
    where deleted_at is not null
      and (deleted_at at time zone 'Asia/Tokyo')::date < (select start_day from bounds)
  )
  select
    pd.day,
    pd.new_rows,
    pd.deleted_rows,
    (
      (select base from baseline_total)
      + sum(pd.new_rows) over (order by pd.day rows between unbounded preceding and current row)
    )::int as cumulative_total,
    (
      (select base from baseline_total)
      - (select base from baseline_deleted)
      + sum(pd.new_rows - pd.deleted_rows) over (order by pd.day rows between unbounded preceding and current row)
    )::int as cumulative_active
  from per_day pd
  order by pd.day;
$$;


-- ============================================================
-- テーブル現在値の総覧
--   各テーブルの行数・アクティブ数・リンク済み数を 1 行で返す。
-- ============================================================
create or replace function public.stats_tables_overview()
returns table (
  external_salons_total         int,
  external_salons_active        int,
  external_therapists_total     int,
  external_therapists_active    int,
  salons_total                  int,
  salons_active                 int,
  salons_linked                 int,
  therapists_total              int,
  therapists_active             int,
  therapists_linked             int
)
language sql
stable
set search_path = public
as $$
  select
    (select count(*)::int from external_salons),
    (select count(*)::int from external_salons where deleted_at is null),
    (select count(*)::int from external_therapists),
    (select count(*)::int from external_therapists where deleted_at is null),
    (select count(*)::int from salons),
    (select count(*)::int from salons where deleted_at is null),
    (select count(*)::int from salons where deleted_at is null and external_salon_id is not null),
    (select count(*)::int from therapists),
    (select count(*)::int from therapists where deleted_at is null),
    (select count(*)::int from therapists where deleted_at is null and external_therapist_id is not null);
$$;


-- ============================================================
-- サイト別 salons / therapists 件数
-- ============================================================
create or replace function public.stats_sites_breakdown()
returns table (
  site_name         text,
  salons_active     int,
  salons_linked     int,
  therapists_active int,
  therapists_linked int
)
language sql
stable
set search_path = public
as $$
  -- 同名 site が複数登録されているケースに備えて site.name で集約する
  select
    s.name as site_name,
    coalesce(sum(sa.active_cnt), 0)::int as salons_active,
    coalesce(sum(sa.linked_cnt), 0)::int as salons_linked,
    coalesce(sum(th.active_cnt), 0)::int as therapists_active,
    coalesce(sum(th.linked_cnt), 0)::int as therapists_linked
  from sites s
  left join (
    select
      salons.site_id,
      count(*) filter (where salons.deleted_at is null) as active_cnt,
      count(*) filter (where salons.deleted_at is null and salons.external_salon_id is not null) as linked_cnt
    from salons
    group by salons.site_id
  ) sa on sa.site_id = s.id
  left join (
    select
      salons.site_id,
      count(t.*) filter (where t.deleted_at is null) as active_cnt,
      count(t.*) filter (where t.deleted_at is null and t.external_therapist_id is not null) as linked_cnt
    from therapists t
    join salons on salons.id = t.salon_id
    group by salons.site_id
  ) th on th.site_id = s.id
  where s.deleted_at is null
  group by s.name
  order by s.name;
$$;


-- ============================================================
-- notification_logs の日次ステータス内訳
-- ============================================================
create or replace function public.stats_notifications_status_daily(p_days int default 7)
returns table (
  day      date,
  status   text,
  cnt      int
)
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      ((now() at time zone 'Asia/Tokyo')::date - (p_days - 1)) as start_day,
      (now() at time zone 'Asia/Tokyo')::date                  as end_day
  ),
  days as (
    select gs::date as day
    from bounds, generate_series(bounds.start_day, bounds.end_day, interval '1 day') gs
  ),
  statuses(status) as (
    values ('pending'), ('sending'), ('sent'), ('failed')
  ),
  grid as (
    select d.day, s.status from days d cross join statuses s
  ),
  aggregated as (
    select
      (created_at at time zone 'Asia/Tokyo')::date as day,
      status,
      count(*) as cnt
    from public.notification_logs
    where (created_at at time zone 'Asia/Tokyo')::date >= (select start_day from bounds)
    group by 1, 2
  )
  select
    g.day,
    g.status,
    coalesce(a.cnt, 0)::int as cnt
  from grid g
  left join aggregated a on a.day = g.day and a.status = g.status
  order by g.day, g.status;
$$;


-- ============================================================
-- notification_logs サマリ
--   - 直近 p_hours の sent / failed / pending / sending 件数
--   - 成功率（sent / (sent + failed)）
--   - 最も古い pending（scraper 停滞検知）
-- ============================================================
create or replace function public.stats_notifications_summary(p_hours int default 24)
returns table (
  sent_count           int,
  failed_count         int,
  pending_count        int,
  sending_count        int,
  success_rate         double precision,
  oldest_pending_at    timestamptz
)
language sql
stable
set search_path = public
as $$
  with windowed as (
    select status
    from public.notification_logs
    where created_at >= now() - make_interval(hours => p_hours)
  ),
  s as (
    select
      count(*) filter (where status = 'sent')::int    as sent_count,
      count(*) filter (where status = 'failed')::int  as failed_count,
      count(*) filter (where status = 'pending')::int as pending_count,
      count(*) filter (where status = 'sending')::int as sending_count
    from windowed
  ),
  oldest as (
    select min(created_at) as oldest_pending_at
    from public.notification_logs
    where status in ('pending', 'sending')
  )
  select
    s.sent_count,
    s.failed_count,
    s.pending_count,
    s.sending_count,
    case
      when s.sent_count + s.failed_count = 0 then null
      else (round(s.sent_count::numeric / (s.sent_count + s.failed_count) * 100, 1))::double precision
    end as success_rate,
    oldest.oldest_pending_at
  from s, oldest;
$$;


-- ============================================================
-- notification_logs の送信遅延
--   - 直近 p_hours で sent_at と send_after の差 (秒) の p50 / p95 / 平均
-- ============================================================
create or replace function public.stats_notifications_delay(p_hours int default 24)
returns table (
  sample_count int,
  p50_seconds  double precision,
  p95_seconds  double precision,
  avg_seconds  double precision,
  max_seconds  double precision
)
language sql
stable
set search_path = public
as $$
  with samples as (
    select extract(epoch from (sent_at - send_after)) as delay_seconds
    from public.notification_logs
    where status = 'sent'
      and sent_at is not null
      and send_after is not null
      and sent_at >= now() - make_interval(hours => p_hours)
  )
  select
    count(*)::int as sample_count,
    percentile_cont(0.5) within group (order by delay_seconds) as p50_seconds,
    percentile_cont(0.95) within group (order by delay_seconds) as p95_seconds,
    avg(delay_seconds) as avg_seconds,
    max(delay_seconds) as max_seconds
  from samples;
$$;


-- ============================================================
-- 失敗した通知の error 文言 TOP N
-- ============================================================
create or replace function public.stats_notifications_failed_top(
  p_hours int default 24,
  p_limit int default 5
)
returns table (
  error_text text,
  cnt        int
)
language sql
stable
set search_path = public
as $$
  select
    coalesce(error, '(error 列が NULL)') as error_text,
    count(*)::int as cnt
  from public.notification_logs
  where status = 'failed'
    and created_at >= now() - make_interval(hours => p_hours)
  group by 1
  order by cnt desc
  limit greatest(p_limit, 1);
$$;


-- ============================================================
-- スクレイパ健全性: 同期 timestamp が古い件数
--   p_threshold_hours より古いものを stale 扱い。
--   NULL（未同期）は stale 扱いに含める。
-- ============================================================
create or replace function public.stats_scraper_freshness(p_threshold_hours int default 24)
returns table (
  external_salons_total                  int,
  external_salons_details_never          int,
  external_salons_details_stale          int,
  external_salons_bookings_never         int,
  external_salons_bookings_stale         int,
  external_salons_homepage_missing       int,
  salons_active                          int,
  salons_last_synced_never               int,
  salons_last_synced_stale               int,
  therapists_active                      int,
  therapists_last_synced_never           int,
  therapists_last_synced_stale           int
)
language sql
stable
set search_path = public
as $$
  with threshold as (
    select now() - make_interval(hours => p_threshold_hours) as cutoff
  )
  select
    (select count(*)::int from external_salons where deleted_at is null),
    (select count(*)::int from external_salons
       where deleted_at is null and details_synced_at is null),
    (select count(*)::int from external_salons
       where deleted_at is null and details_synced_at is not null
         and details_synced_at < (select cutoff from threshold)),
    (select count(*)::int from external_salons
       where deleted_at is null and bookings_synced_at is null),
    (select count(*)::int from external_salons
       where deleted_at is null and bookings_synced_at is not null
         and bookings_synced_at < (select cutoff from threshold)),
    (select count(*)::int from external_salons
       where deleted_at is null and homepage_url is null),
    (select count(*)::int from salons where deleted_at is null),
    (select count(*)::int from salons
       where deleted_at is null and last_synced_at is null),
    (select count(*)::int from salons
       where deleted_at is null and last_synced_at is not null
         and last_synced_at < (select cutoff from threshold)),
    (select count(*)::int from therapists where deleted_at is null),
    (select count(*)::int from therapists
       where deleted_at is null and last_synced_at is null),
    (select count(*)::int from therapists
       where deleted_at is null and last_synced_at is not null
         and last_synced_at < (select cutoff from threshold));
$$;


-- ============================================================
-- availability_events 直近 p_hours の event_type 別件数
-- ============================================================
create or replace function public.stats_availability_events_recent(p_hours int default 24)
returns table (
  event_type text,
  cnt        int
)
language sql
stable
set search_path = public
as $$
  with types(event_type) as (
    values ('opened'), ('closed'), ('discovered_open'), ('discovered_closed')
  )
  select
    t.event_type,
    coalesce(a.cnt, 0)::int as cnt
  from types t
  left join (
    select event_type, count(*) as cnt
    from public.availability_events
    where occurred_at >= now() - make_interval(hours => p_hours)
    group by event_type
  ) a on a.event_type = t.event_type
  order by t.event_type;
$$;


-- ============================================================
-- grant: service_role のみ。anon / authenticated には公開しない。
-- ============================================================
revoke all on function public.stats_users_daily(int)                       from public;
revoke all on function public.stats_user_plan_breakdown()                  from public;
revoke all on function public.stats_external_salons_daily(int)             from public;
revoke all on function public.stats_external_therapists_daily(int)         from public;
revoke all on function public.stats_tables_overview()                      from public;
revoke all on function public.stats_sites_breakdown()                      from public;
revoke all on function public.stats_notifications_status_daily(int)        from public;
revoke all on function public.stats_notifications_summary(int)             from public;
revoke all on function public.stats_notifications_delay(int)               from public;
revoke all on function public.stats_notifications_failed_top(int, int)     from public;
revoke all on function public.stats_scraper_freshness(int)                 from public;
revoke all on function public.stats_availability_events_recent(int)        from public;

grant execute on function public.stats_users_daily(int)                    to service_role;
grant execute on function public.stats_user_plan_breakdown()               to service_role;
grant execute on function public.stats_external_salons_daily(int)          to service_role;
grant execute on function public.stats_external_therapists_daily(int)      to service_role;
grant execute on function public.stats_tables_overview()                   to service_role;
grant execute on function public.stats_sites_breakdown()                   to service_role;
grant execute on function public.stats_notifications_status_daily(int)     to service_role;
grant execute on function public.stats_notifications_summary(int)          to service_role;
grant execute on function public.stats_notifications_delay(int)            to service_role;
grant execute on function public.stats_notifications_failed_top(int, int)  to service_role;
grant execute on function public.stats_scraper_freshness(int)              to service_role;
grant execute on function public.stats_availability_events_recent(int)     to service_role;
