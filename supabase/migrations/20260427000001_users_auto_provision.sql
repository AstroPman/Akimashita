-- ============================================================
-- Migration: 20260427000001_users_auto_provision.sql
-- Description: auth.users への INSERT 時に public.users を自動作成する。
--              email 更新時には public.users.email にも反映する。
--              既存の auth.users でまだ public.users 行が無いユーザにも
--              バックフィルする。
--              これがないと watch_settings.user_id の外部キー制約違反で
--              監視設定の作成が必ず失敗する。
-- ============================================================


-- ============================================================
-- auth.users -> public.users 同期トリガー関数
-- security definer 必須（auth スキーマへの読み取り権限のため）
-- ============================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;


-- INSERT トリガー
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- email 変更を public.users に反映
create or replace function public.handle_auth_user_email_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.users set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_auth_user_email_update();


-- ============================================================
-- 既存ユーザのバックフィル
-- public.users 側に行が無いユーザを補填する
-- ============================================================
insert into public.users (id, email)
select au.id, au.email
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null;


-- ============================================================
-- users INSERT ポリシー
-- これまでは insert ポリシーが無かったため、SECURITY DEFINER の
-- トリガー以外からは実質書き込めない状態だった。
-- 自分自身の行を作る/upsert する場合に備えて with check ポリシーを追加。
-- ============================================================
create policy "users_insert" on users
  for insert
  with check (id = auth.uid());
