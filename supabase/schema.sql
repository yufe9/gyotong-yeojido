-- ============================================================
--  교통여지도 · 교통대 명소 + 학생 제보 · Supabase 스키마
--  Supabase 대시보드 → SQL Editor → New query 에 전체를 붙여넣고 Run
--  (여러 번 다시 실행해도 안전합니다)
--
--  운영자 이메일은 이 파일에 쓰지 않습니다(공개 저장소).
--  맨 아래 "운영자 등록" 한 줄만 SQL Editor 에서 따로 실행하세요.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. 운영자 명단: API 로는 아무도 읽거나 쓸 수 없다(정책 없음). SQL Editor 에서만 넣는다
-- ------------------------------------------------------------
create table if not exists public.admins (
  email      text primary key check (email = lower(btrim(email))),
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- 로그인한 사람의 이메일(매직링크로 확인된 것)이 명단에 있으면 운영자
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ------------------------------------------------------------
-- 2. 명소. 글자 수·종류·좌표 범위는 logic.js 의 REPORT_LIMITS·SPOT_KINDS·limitBox() 와 같은 값
--    photos 에는 사진 보관함 안의 경로(u/<uuid>.webp)만 담는다
-- ------------------------------------------------------------
create table if not exists public.landmarks (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  name        text not null check (char_length(btrim(name)) between 2 and 40),
  kind        text not null check (kind in ('photo', 'season', 'study', 'tip', 'outing')),
  lat         double precision not null check (lat between 36.93496 and 37.0251),
  lng         double precision not null check (lng between 127.78365 and 127.9559),
  summary     text not null check (char_length(btrim(summary)) between 5 and 60),
  body        text not null check (char_length(btrim(body)) between 20 and 500),
  best_time   text check (best_time is null or char_length(best_time) <= 40),
  nickname    text check (nickname is null or char_length(nickname) <= 20),
  photos      text[] not null default '{}' check (cardinality(photos) <= 3),
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists landmarks_status_idx on public.landmarks (status, created_at desc);

-- 등록일은 서버 시각으로 고정하고, 상태가 바뀌면 검토 시각을 남긴다.
-- 짧은 시간에 제보가 몰리면(10분 동안 대기 30건 이상) 잠시 받지 않는다(봇 막기).
create or replace function public.landmarks_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    if new.status = 'pending' then
      new.reviewed_at := null;
      if not public.is_admin() and (
        select count(*) from public.landmarks
        where status = 'pending' and created_at > now() - interval '10 minutes'
      ) >= 30 then
        raise exception '제보가 너무 많이 몰렸어요. 잠시 뒤에 다시 보내 주세요.' using errcode = 'P0001';
      end if;
    else
      new.reviewed_at := now();
    end if;
  elsif new.status is distinct from old.status then
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists landmarks_guard on public.landmarks;
create trigger landmarks_guard
  before insert or update on public.landmarks
  for each row execute function public.landmarks_guard();

-- ------------------------------------------------------------
-- 3. RLS
--    익명: 승인된 것 읽기 + "대기" 상태로 추가만. 대기 목록은 못 읽고, 수정·삭제 못 함
--    운영자: 전부 읽기·추가(바로 승인 가능)·수정·삭제
-- ------------------------------------------------------------
alter table public.landmarks enable row level security;

grant select, insert on public.landmarks to anon;
grant select, insert, update, delete on public.landmarks to authenticated;

drop policy if exists "명소 읽기" on public.landmarks;
create policy "명소 읽기" on public.landmarks
  for select to anon, authenticated
  using (status = 'approved' or public.is_admin());

drop policy if exists "학생 제보" on public.landmarks;
create policy "학생 제보" on public.landmarks
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and cardinality(photos) between 1 and 3
    and (select bool_and(p ~ '^u/[0-9a-f-]{36}\.(webp|jpg)$') from unnest(photos) as p)
  );

drop policy if exists "운영자 추가" on public.landmarks;
create policy "운영자 추가" on public.landmarks
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "운영자 수정" on public.landmarks;
create policy "운영자 수정" on public.landmarks
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "운영자 삭제" on public.landmarks;
create policy "운영자 삭제" on public.landmarks
  for delete to authenticated
  using (public.is_admin());

-- ------------------------------------------------------------
-- 4. 사진 보관함(Storage). 공개 버킷: 주소를 아는 사람은 내려받을 수 있다(목록은 못 봄).
--    파일 이름은 앱이 무작위(uuid)로 정하고, 승인해도 같은 경로를 그대로 쓴다.
--    올리기: 누구나 u/<uuid>.webp|jpg 만, 2MB·webp/jpeg 만.  목록 보기·지우기: 운영자만
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('landmark-photos', 'landmark-photos', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "명소 사진 올리기" on storage.objects;
create policy "명소 사진 올리기" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'landmark-photos'
    and (storage.foldername(name))[1] = 'u'
    and name ~ '^u/[0-9a-f-]{36}\.(webp|jpg)$'
  );

drop policy if exists "명소 사진 운영자 보기" on storage.objects;
create policy "명소 사진 운영자 보기" on storage.objects
  for select to authenticated
  using (bucket_id = 'landmark-photos' and public.is_admin());

drop policy if exists "명소 사진 운영자 지우기" on storage.objects;
create policy "명소 사진 운영자 지우기" on storage.objects
  for delete to authenticated
  using (bucket_id = 'landmark-photos' and public.is_admin());

-- ============================================================
--  운영자 등록 (이 줄은 파일에 그대로 두고, 복사해서 내 이메일로 바꾼 뒤 따로 Run)
--    insert into public.admins (email) values ('내이메일@example.com') on conflict do nothing;
-- ============================================================
