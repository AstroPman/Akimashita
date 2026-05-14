-- ============================================================
-- Migration: 20260514000001_drop_seats_and_waitlist.sql
-- Description: 席数上限 / ウェイトリスト制度を全面的に廃止する。
--              3 段階課金プランの導入に伴い、無料ユーザを含めて
--              全員が登録できる構成へ変更する。
--
--   - 関連 RPC を drop
--   - waitlist テーブルを drop
--   - get_watcher_count_ranking から無料ユーザの監視を除外
--     （課金ユーザの監視のみをカウント対象とする）
-- ============================================================


-- ============================================================
-- 席予約・解放系の関数を破棄
-- ============================================================
drop function if exists public.try_reserve_seat(uuid, int);
drop function if exists public.count_occupied_seats();
drop function if exists public.release_stale_incomplete_seats(int);


-- ============================================================
-- waitlist テーブルを破棄
-- ============================================================
drop table if exists waitlist cascade;


-- ============================================================
-- 監視者数ランキング: 課金ユーザ（standard / premium）のみカウント
-- 無料プランは「実際に予約を狙っているユーザの密度」とは性質が異なるため
-- ランキングの母集団から除外する。
-- ============================================================
create or replace function get_watcher_count_ranking(
  p_limit int default 20
)
returns table (
  therapist_id   uuid,
  name           text,
  image_url      text,
  profile_url    text,
  salon_id       uuid,
  salon_name     text,
  watcher_count  int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  with aggregated as (
    select
      ws.therapist_id,
      count(distinct ws.user_id)::int as watcher_count
    from watch_settings ws
    join users u on u.id = ws.user_id
    where ws.is_active = true
      and ws.deleted_at is null
      and u.deleted_at is null
      and u.plan_tier in ('standard', 'premium')
    group by ws.therapist_id
    having count(distinct ws.user_id) > 0
  )
  select
    t.id          as therapist_id,
    t.name        as name,
    t.image_url   as image_url,
    t.profile_url as profile_url,
    s.id          as salon_id,
    s.name        as salon_name,
    a.watcher_count
  from aggregated a
  join therapists t on t.id = a.therapist_id
  join salons     s on s.id = t.salon_id
  where t.deleted_at is null
    and s.deleted_at is null
  order by a.watcher_count desc, t.name asc
  limit p_limit;
end;
$$;


grant execute on function get_watcher_count_ranking(int)
  to anon, authenticated, service_role;
