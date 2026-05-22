-- ============================================================
-- Migration: 20260522000007_dashboard_stats_perf.sql
-- Description:
--   apps/dashboard が呼び出す stats_* RPC のパフォーマンス改善。
--   本番テーブル (external_salons / external_therapists 等) の行数増加に
--   伴い、PostgREST のデフォルト statement_timeout (8s) を超えて
--   500 (57014 canceling statement due to statement timeout) になる
--   事象が出ているため、以下の 3 点をまとめて適用する。
--
--   (1) stats_*_daily の per_day 集計に「窓 (start_day 以降)」の
--       WHERE 句を追加。これまで毎リクエスト全行 scan していたのを
--       直近 N 日に作成・削除された行だけに限定する。
--       同様に baseline_total / baseline_deleted の date 比較を
--       sargable な timestamptz 比較に書き換える (将来的に
--       created_at / deleted_at にインデックスを張ったとき効くように)。
--
--   (2) stats_tables_overview / stats_scraper_freshness を
--       「テーブルごとに 1 scan」へ畳む (count(*) filter (...) で集約)。
--       これまで同じテーブルを 2〜6 回 scan していたのを 1 回に圧縮する。
--
--   (3) 応急処置として service_role の statement_timeout を 60s に
--       延長する。PostgREST 経由のクエリも service_role に switch して
--       実行されるため、これでダッシュボード経由の全 RPC に効く。
--       通常クライアント (anon / authenticated) はそのまま 8s 据え置き。
--
--   全関数とも language sql / stable / set search_path = public を維持し、
--   grant / revoke は 20260518000000 の状態をそのまま引き継ぐ
--   (create or replace は権限を変更しない)。
-- ============================================================


-- ============================================================
-- (3) service_role の statement_timeout を伸ばす
--   ダッシュボード経由の重い集計が 8s で打ち切られないようにする。
--   恒久対策ではないが、(1)(2) と組み合わせて当面の余裕を確保する。
-- ============================================================
alter role service_role set statement_timeout = '60s';


-- ============================================================
-- (1a) stats_users_daily
--   per_day 集計を「窓内に created_at / deleted_at された行」に限定。
--   baseline は created_at < 窓開始 (JST midnight 換算の timestamptz) に
--   書き換えて、将来 created_at に index を張ったときに効くようにする。
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
  cutoffs as (
    -- JST midnight の timestamptz を作っておき、テーブル側の
    -- created_at / deleted_at と sargable に比較できるようにする。
    select (start_day::timestamp at time zone 'Asia/Tokyo') as start_ts
    from bounds
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
      where created_at >= (select start_ts from cutoffs)
      group by 1
      union all
      select
        (deleted_at at time zone 'Asia/Tokyo')::date as day,
        0 as new_users,
        count(*) as deleted_users
      from public.users
      where deleted_at is not null
        and deleted_at >= (select start_ts from cutoffs)
      group by 1
    ) c on c.day = d.day
    group by d.day
  ),
  baseline as (
    select count(*)::int as base
    from public.users
    where created_at < (select start_ts from cutoffs)
      and (
        deleted_at is null
        or deleted_at >= (select start_ts from cutoffs)
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
-- (1b) stats_external_salons_daily
--   per_day を窓内に限定し、baseline_* も sargable な書き方に。
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
  cutoffs as (
    select (start_day::timestamp at time zone 'Asia/Tokyo') as start_ts
    from bounds
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
      where created_at >= (select start_ts from cutoffs)
      group by 1
      union all
      select
        (deleted_at at time zone 'Asia/Tokyo')::date as day,
        0 as new_rows,
        count(*) as deleted_rows
      from public.external_salons
      where deleted_at is not null
        and deleted_at >= (select start_ts from cutoffs)
      group by 1
    ) c on c.day = d.day
    group by d.day
  ),
  baseline_total as (
    select count(*)::int as base
    from public.external_salons
    where created_at < (select start_ts from cutoffs)
  ),
  baseline_deleted as (
    select count(*)::int as base
    from public.external_salons
    where deleted_at is not null
      and deleted_at < (select start_ts from cutoffs)
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
-- (1c) stats_external_therapists_daily
--   stats_external_salons_daily と同形の書き換え。
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
  cutoffs as (
    select (start_day::timestamp at time zone 'Asia/Tokyo') as start_ts
    from bounds
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
      where created_at >= (select start_ts from cutoffs)
      group by 1
      union all
      select
        (deleted_at at time zone 'Asia/Tokyo')::date as day,
        0 as new_rows,
        count(*) as deleted_rows
      from public.external_therapists
      where deleted_at is not null
        and deleted_at >= (select start_ts from cutoffs)
      group by 1
    ) c on c.day = d.day
    group by d.day
  ),
  baseline_total as (
    select count(*)::int as base
    from public.external_therapists
    where created_at < (select start_ts from cutoffs)
  ),
  baseline_deleted as (
    select count(*)::int as base
    from public.external_therapists
    where deleted_at is not null
      and deleted_at < (select start_ts from cutoffs)
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
-- (2a) stats_tables_overview
--   旧実装は同じテーブルを最大 3 回 scan していた (例: salons を
--   total / active / linked で 3 回)。count(*) filter (...) で
--   1 テーブル 1 scan に圧縮する。
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
  with es as (
    select
      count(*)::int                                       as total,
      count(*) filter (where deleted_at is null)::int     as active
    from public.external_salons
  ),
  et as (
    select
      count(*)::int                                       as total,
      count(*) filter (where deleted_at is null)::int     as active
    from public.external_therapists
  ),
  s as (
    select
      count(*)::int                                       as total,
      count(*) filter (where deleted_at is null)::int     as active,
      count(*) filter (
        where deleted_at is null and external_salon_id is not null
      )::int                                              as linked
    from public.salons
  ),
  t as (
    select
      count(*)::int                                       as total,
      count(*) filter (where deleted_at is null)::int     as active,
      count(*) filter (
        where deleted_at is null and external_therapist_id is not null
      )::int                                              as linked
    from public.therapists
  )
  select
    es.total, es.active,
    et.total, et.active,
    s.total,  s.active,  s.linked,
    t.total,  t.active,  t.linked
  from es, et, s, t;
$$;


-- ============================================================
-- (2b) stats_scraper_freshness
--   external_salons を 6 回・salons を 3 回・therapists を 3 回
--   scan していたのを、各テーブル 1 scan に圧縮する。
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
  ),
  es as (
    select
      count(*) filter (where deleted_at is null)::int as total,
      count(*) filter (
        where deleted_at is null and details_synced_at is null
      )::int as details_never,
      count(*) filter (
        where deleted_at is null
          and details_synced_at is not null
          and details_synced_at < (select cutoff from threshold)
      )::int as details_stale,
      count(*) filter (
        where deleted_at is null and bookings_synced_at is null
      )::int as bookings_never,
      count(*) filter (
        where deleted_at is null
          and bookings_synced_at is not null
          and bookings_synced_at < (select cutoff from threshold)
      )::int as bookings_stale,
      count(*) filter (
        where deleted_at is null and homepage_url is null
      )::int as homepage_missing
    from public.external_salons
  ),
  s as (
    select
      count(*) filter (where deleted_at is null)::int as active,
      count(*) filter (
        where deleted_at is null and last_synced_at is null
      )::int as never_synced,
      count(*) filter (
        where deleted_at is null
          and last_synced_at is not null
          and last_synced_at < (select cutoff from threshold)
      )::int as stale
    from public.salons
  ),
  t as (
    select
      count(*) filter (where deleted_at is null)::int as active,
      count(*) filter (
        where deleted_at is null and last_synced_at is null
      )::int as never_synced,
      count(*) filter (
        where deleted_at is null
          and last_synced_at is not null
          and last_synced_at < (select cutoff from threshold)
      )::int as stale
    from public.therapists
  )
  select
    es.total,
    es.details_never,  es.details_stale,
    es.bookings_never, es.bookings_stale,
    es.homepage_missing,
    s.active, s.never_synced, s.stale,
    t.active, t.never_synced, t.stale
  from es, s, t;
$$;


-- ============================================================
-- 補足:
--   - create or replace は権限を上書きしないので、20260518000000 の
--     revoke ... from public / grant execute ... to service_role は
--     そのまま引き継がれる (改めて grant し直す必要なし)。
--   - インデックスや materialized view 化は本 migration では行わない。
--     行数がさらに増えて再度 timeout するようなら、別 migration で
--     external_salons(created_at) / external_salons(deleted_at) などへの
--     index 追加、もしくはスナップショットテーブル化を検討する。
-- ============================================================
