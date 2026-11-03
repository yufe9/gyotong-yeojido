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
--    익명: 승인된 것 읽기만. 제보는 회원 함수(spot_submit)로만, 대기 목록은 못 읽고, 수정·삭제 못 함
--    운영자: 전부 읽기·추가(바로 승인 가능)·수정·삭제
-- ------------------------------------------------------------
alter table public.landmarks enable row level security;

grant select on public.landmarks to anon;
revoke insert on public.landmarks from anon;
grant select, insert, update, delete on public.landmarks to authenticated;

drop policy if exists "명소 읽기" on public.landmarks;
create policy "명소 읽기" on public.landmarks
  for select to anon, authenticated
  using (status = 'approved' or public.is_admin());

drop policy if exists "학생 제보" on public.landmarks; -- 제보는 이제 회원 함수 spot_submit 으로만 받는다

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

-- ------------------------------------------------------------
-- 5. 회원: 학번 + 이름으로 들어온다(수업용). 비밀번호가 없어 학번과 이름을 아는 사람은 그 계정으로 들어올 수 있다.
--    shortcut: 본인 확인이 없다. 수업 밖으로 넓히면 학교 메일 인증을 붙인다.
--    표는 API 로 읽을 수 없고, 앱은 아래 함수만 부른다. 화면에는 닉네임만 보인다.
-- ------------------------------------------------------------
create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  student_no text not null unique check (student_no ~ '^[0-9]{7,10}$'),
  name       text not null check (char_length(name) between 2 and 20),
  nickname   text not null check (char_length(nickname) between 2 and 12),
  token      uuid not null unique default gen_random_uuid(),
  suspended  boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists members_nickname_idx on public.members (lower(nickname));
alter table public.members enable row level security;
revoke all on public.members from anon, authenticated;
grant select (id, student_no, name, nickname, suspended, created_at), update (suspended) on public.members to authenticated;

drop policy if exists "운영자 회원 보기" on public.members;
create policy "운영자 회원 보기" on public.members
  for select to authenticated using (public.is_admin());
drop policy if exists "운영자 회원 정지" on public.members;
create policy "운영자 회원 정지" on public.members
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

alter table public.landmarks add column if not exists member_id uuid references public.members (id) on delete set null;

-- 금칙어: SQL Editor 에서 insert into public.banned_words values ('낱말') 로 늘린다
create table if not exists public.banned_words (word text primary key);
alter table public.banned_words enable row level security;
revoke all on public.banned_words from anon, authenticated;
insert into public.banned_words (word) values
  ('시발'),('씨발'),('씨빨'),('시팔'),('씨팔'),('시벌'),('씨벌'),('ㅅㅂ'),('ㅆㅂ'),('ㅅㅣㅂㅏㄹ'),('tlqkf'),
  ('병신'),('병쉰'),('븅신'),('ㅂㅅ'),('ㅄ'),('qudtls'),('좆'),('좃'),('졷'),('존나'),('ㅈㄴ'),('지랄'),('ㅈㄹ'),('썅'),
  ('개새끼'),('개색끼'),('개쌔끼'),('십새끼'),('씹새'),('씹년'),('씹놈'),('씹할'),('니애미'),('느금'),('느그매'),
  ('걸레년'),('창녀'),('미친놈'),('미친년'),('또라이'),('fuck'),('shit'),('bitch')
on conflict do nothing;

-- 띄어쓰기·숫자·기호를 지우고 찾아 '시1발', 'ㅅ ㅂ' 도 잡는다. 지운 탓에 멀쩡한 말이 걸리는 경우는 먼저 뺀다('다시 발견', '시발점')
create or replace function public.has_profanity(t text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.banned_words w
    where position(w.word in regexp_replace(
      regexp_replace(lower(coalesce(t, '')), '[^가-힣ㄱ-ㅎㅏ-ㅣa-z]', '', 'g'),
      '시발(견|표|달|생|전|점|역|매|송)', '', 'g')) > 0
  );
$$;
revoke all on function public.has_profanity(text) from public, anon, authenticated;

-- 토큰으로 회원을 찾는다. 글을 쓰는 함수는 정지된 회원을 막는다
create or replace function public.member_writer(p_token uuid)
returns public.members
language plpgsql
stable
security definer
set search_path = ''
as $$
declare m public.members;
begin
  select * into m from public.members where token = p_token;
  if m.id is null then raise exception '다시 로그인해 주세요.' using errcode = 'P0001'; end if;
  if m.suspended then raise exception '운영자가 글쓰기를 정지한 계정이에요.' using errcode = 'P0001'; end if;
  return m;
end;
$$;
revoke all on function public.member_writer(uuid) from public, anon, authenticated;

-- 처음이면 가입, 있으면 로그인. 이름이 다르면 들어올 수 없다
create or replace function public.member_enter(p_student_no text, p_name text, p_nickname text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.members;
  v_no text := btrim(coalesce(p_student_no, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_nick text := btrim(coalesce(p_nickname, ''));
begin
  if v_no !~ '^[0-9]{7,10}$' then raise exception '학번은 숫자 7~10자리로 적어 주세요.' using errcode = 'P0001'; end if;
  if char_length(v_name) not between 2 and 20 then raise exception '이름을 적어 주세요.' using errcode = 'P0001'; end if;
  select * into m from public.members where student_no = v_no;
  if m.id is not null then
    if m.name <> v_name then raise exception '학번과 이름이 맞지 않아요.' using errcode = 'P0001'; end if;
    return json_build_object('token', m.token, 'nickname', m.nickname);
  end if;
  if v_nick = '' then raise exception '처음 오셨네요. 닉네임도 적어 주세요.' using errcode = 'P0001'; end if;
  if char_length(v_nick) not between 2 and 12 then raise exception '닉네임은 2~12자로 적어 주세요.' using errcode = 'P0001'; end if;
  if public.has_profanity(v_nick) then raise exception '닉네임에 쓸 수 없는 말이 있어요.' using errcode = 'P0001'; end if;
  if (select count(*) from public.members where created_at > now() - interval '10 minutes') >= 100 then
    raise exception '가입이 너무 많이 몰렸어요. 잠시 뒤에 다시 해 주세요.' using errcode = 'P0001';
  end if;
  begin
    insert into public.members (student_no, name, nickname) values (v_no, v_name, v_nick) returning * into m;
  exception when unique_violation then
    raise exception '이미 쓰고 있는 닉네임이에요.' using errcode = 'P0001';
  end;
  return json_build_object('token', m.token, 'nickname', m.nickname);
end;
$$;

-- 탈퇴: 학번·이름과 별점·댓글을 지우고, 승인된 제보에서는 닉네임만 뺀다
create or replace function public.member_delete(p_token uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from public.members where token = p_token;
  if v_id is null then raise exception '다시 로그인해 주세요.' using errcode = 'P0001'; end if;
  update public.landmarks set nickname = null where member_id = v_id;
  delete from public.members where id = v_id;
end;
$$;

-- 명소 제보: 대기 상태로만 들어가고, 제보자는 계정 닉네임으로 적힌다
create or replace function public.spot_submit(p_token uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.members := public.member_writer(p_token);
  v_photos text[] := array(select jsonb_array_elements_text(p -> 'photos'));
begin
  if cardinality(v_photos) not between 1 and 3
     or exists (select 1 from unnest(v_photos) x where x !~ '^u/[0-9a-f-]{36}\.(webp|jpg)$') then
    raise exception '사진을 다시 골라 주세요.' using errcode = 'P0001';
  end if;
  insert into public.landmarks (member_id, nickname, name, kind, lat, lng, summary, body, best_time, photos)
  values (m.id, m.nickname, p ->> 'name', p ->> 'kind', (p ->> 'lat')::double precision, (p ->> 'lng')::double precision,
          p ->> 'summary', p ->> 'body', p ->> 'best_time', v_photos);
end;
$$;

create or replace function public.my_spots(p_token uuid)
returns table (name text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.name, l.status, l.created_at from public.landmarks l
  join public.members m on m.id = l.member_id
  where m.token = p_token order by l.created_at desc;
$$;

-- ------------------------------------------------------------
-- 6. 별점·댓글: 회원 한 명이 가게(명소)마다 하나. 다시 쓰면 고쳐진다. 쓰기는 함수로만
--    익명도 숨겨지지 않은 글을 읽을 수 있지만 member_id 는 볼 수 없다
-- ------------------------------------------------------------
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id) on delete cascade,
  nickname     text not null,
  kind         text not null check (kind in ('place', 'spot')),
  target_id    text not null check (char_length(target_id) between 1 and 100),
  rating       int not null check (rating between 1 and 5),
  body         text check (body is null or char_length(body) <= 200),
  hidden       boolean not null default false,
  report_count int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (member_id, kind, target_id)
);
create index if not exists reviews_target_idx on public.reviews (kind, target_id, created_at desc);

create table if not exists public.review_reports (
  review_id uuid not null references public.reviews (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  primary key (review_id, member_id)
);
alter table public.review_reports enable row level security;
revoke all on public.review_reports from anon, authenticated;

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select (id, nickname, kind, target_id, rating, body, hidden, created_at) on public.reviews to anon;
grant select on public.reviews to authenticated;
grant update (hidden), delete on public.reviews to authenticated;

drop policy if exists "별점 읽기" on public.reviews;
create policy "별점 읽기" on public.reviews
  for select to anon, authenticated using (not hidden or public.is_admin());
drop policy if exists "운영자 글 수정" on public.reviews;
create policy "운영자 글 수정" on public.reviews
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "운영자 글 삭제" on public.reviews;
create policy "운영자 글 삭제" on public.reviews
  for delete to authenticated using (public.is_admin());

-- 가게별 집계. 호출한 사람의 권한으로 읽어 숨긴 글은 빠진다
create or replace view public.review_stats with (security_invoker = true) as
  select kind, target_id, count(*)::int as n, sum(rating)::int as total
  from public.reviews where not hidden group by kind, target_id;
grant select on public.review_stats to anon, authenticated;

create or replace function public.review_save(p_token uuid, p_kind text, p_target text, p_rating int, p_body text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.members := public.member_writer(p_token);
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
begin
  if public.has_profanity(v_body) then raise exception '쓸 수 없는 말이 들어 있어요. 고쳐서 다시 보내 주세요.' using errcode = 'P0001'; end if;
  if p_kind = 'spot' and not exists (select 1 from public.landmarks where id::text = p_target and status = 'approved') then
    raise exception '승인된 명소에만 남길 수 있어요.' using errcode = 'P0001';
  end if;
  -- 숨겨진 글은 고쳐도 그대로 숨겨 둔다(운영자가 복구한다)
  insert into public.reviews (member_id, nickname, kind, target_id, rating, body)
  values (m.id, m.nickname, p_kind, p_target, p_rating, v_body)
  on conflict (member_id, kind, target_id) do update
    set rating = excluded.rating, body = excluded.body, updated_at = now();
end;
$$;

create or replace function public.review_delete(p_token uuid, p_kind text, p_target text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.reviews r using public.members m
  where m.token = p_token and r.member_id = m.id and r.kind = p_kind and r.target_id = p_target;
$$;

-- 서로 다른 3명이 신고하면 숨기고 운영자 화면으로 넘긴다
create or replace function public.review_report(p_token uuid, p_review uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.members := public.member_writer(p_token);
  v_owner uuid;
begin
  select member_id into v_owner from public.reviews where id = p_review;
  if v_owner is null or v_owner = m.id then return; end if;
  insert into public.review_reports (review_id, member_id) values (p_review, m.id) on conflict do nothing;
  if found then
    update public.reviews
      set report_count = report_count + 1, hidden = hidden or report_count + 1 >= 3
      where id = p_review;
  end if;
end;
$$;

revoke all on function public.member_enter(text, text, text), public.member_delete(uuid), public.spot_submit(uuid, jsonb), public.my_spots(uuid),
  public.review_save(uuid, text, text, int, text), public.review_delete(uuid, text, text), public.review_report(uuid, uuid) from public;
grant execute on function public.member_enter(text, text, text), public.member_delete(uuid), public.spot_submit(uuid, jsonb), public.my_spots(uuid),
  public.review_save(uuid, text, text, int, text), public.review_delete(uuid, text, text), public.review_report(uuid, uuid) to anon, authenticated;

-- ============================================================
--  운영자 등록 (이 줄은 파일에 그대로 두고, 복사해서 내 이메일로 바꾼 뒤 따로 Run)
--    insert into public.admins (email) values ('내이메일@example.com') on conflict do nothing;
-- ============================================================
