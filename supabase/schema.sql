-- Foreman portal database
--
-- Run this in Supabase: SQL Editor > New query > paste this file > Run.
-- It is safe to run again after an update: it changes what exists and keeps your data.
--
-- Who can see what. All of it is enforced here, in the database, not in the browser.
--   Anyone with an account   their own profile and their own application
--   Clients                  the engagements they were invited to: requests, files,
--                            updates, deliverables and the team
--   Members                  the engagements they are on, the library and announcements
--   Recruiting team          members marked "runs recruiting" on the team page: info sessions,
--                            their sign-ups and the notify list
--   Administrators           everything, including applications, reviews, inquiries, cycles
--                            and the team page
--   Website visitors         can send an inquiry, register for an info session, ask to be told
--                            when applications open, and read the team, dates and sessions
--
-- After you first sign in to the portal, make yourself an administrator here:
--   update public.profiles set role = 'admin' where email = 'you@example.com';


-- ============================================================== tables

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text not null default '' check (char_length(full_name) <= 200),
  role text not null default 'user' check (role in ('user', 'member', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'interview_1', 'interview_2', 'accepted', 'declined')),
  full_name text not null default '' check (char_length(full_name) <= 200),
  email text not null default '',
  answers jsonb not null default '{}'::jsonb check (pg_column_size(answers) < 60000),
  resume_path text,
  resume_name text,
  message text not null default '' check (char_length(message) <= 4000),
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.application_reviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewer_name text not null default '',
  score int check (score between 1 and 5),
  recommendation text not null check (recommendation in ('advance', 'hold', 'decline')),
  note text not null default '' check (char_length(note) <= 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.engagements (
  id uuid primary key default gen_random_uuid(),
  company text not null check (char_length(company) between 1 and 200),
  title text not null default 'Engagement' check (char_length(title) <= 200),
  practice text not null default 'succession' check (practice in ('succession', 'operations')),
  stage text not null default 'intro'
    check (stage in ('intro', 'scope', 'records', 'analysis', 'presentation', 'complete')),
  summary text not null default '' check (char_length(summary) <= 4000),
  started_on date,
  target_on date,
  created_at timestamptz not null default now()
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'general' check (kind in ('consultation', 'general')),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  company text not null default '' check (char_length(company) <= 200),
  phone text not null default '' check (char_length(phone) <= 60),
  sector text not null default '' check (char_length(sector) <= 120),
  employees text not null default '' check (char_length(employees) <= 60),
  interest text not null default '' check (char_length(interest) <= 120),
  role text not null default '' check (char_length(role) <= 120),
  message text not null default '' check (char_length(message) <= 5000),
  status text not null default 'new' check (status in ('new', 'contacted', 'engaged', 'closed')),
  engagement_id uuid references public.engagements (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.engagement_people (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('client', 'team')),
  name text not null default '' check (char_length(name) <= 200),
  email text not null default '' check (char_length(email) <= 320),
  title text not null default '' check (char_length(title) <= 120),
  invite_code text unique,
  created_at timestamptz not null default now(),
  unique (engagement_id, user_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  kind text not null check (kind in ('request', 'upload', 'deliverable')),
  title text not null default '' check (char_length(title) <= 300),
  note text not null default '' check (char_length(note) <= 2000),
  request_id uuid references public.documents (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'received', 'waived')),
  -- Files live in the engagement's own folder of the private "engagements" bucket.
  path text check (path is null or path like (engagement_id::text || '/%')),
  file_name text,
  size bigint,
  created_by uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.updates (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  author_id uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 300),
  category text not null default 'Guides' check (char_length(category) <= 60),
  description text not null default '' check (char_length(description) <= 2000),
  url text check (url is null or url ~* '^https?://'),
  path text,
  file_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 300),
  body text not null default '' check (char_length(body) <= 10000),
  author_name text not null default '',
  created_at timestamptz not null default now()
);

-- Recruiting. Applications are accepted only while a cycle is open.
create table if not exists public.cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  decisions_by date,
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

alter table public.applications add column if not exists cycle_id uuid references public.cycles (id) on delete set null;

-- The public team page. A card can be linked to a portal account, so its owner can edit it.
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  title text not null default '' check (char_length(title) <= 120),
  teams text[] not null default '{}' check (cardinality(teams) <= 8 and char_length(array_to_string(teams, '|')) <= 400),
  bio text not null default '' check (char_length(bio) <= 1500),
  class_year text not null default '' check (char_length(class_year) <= 40),
  major text not null default '' check (char_length(major) <= 120),
  photo_path text check (photo_path is null or photo_path like (id::text || '/%')),
  linkedin_url text check (linkedin_url is null or (linkedin_url ~* '^https://' and char_length(linkedin_url) <= 300)),
  email text not null default '' check (char_length(email) <= 320),
  booking_url text check (booking_url is null or (booking_url ~* '^https://' and char_length(booking_url) <= 500)),
  chat_topics text not null default '' check (char_length(chat_topics) <= 200),
  hosts_chats boolean not null default false,
  runs_recruiting boolean not null default false,
  profile_id uuid unique references public.profiles (id) on delete set null,
  visible boolean not null default true,
  sort_order int not null default 100 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.info_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Information session' check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 200),
  meeting_url text check (meeting_url is null or (meeting_url ~* '^https://' and char_length(meeting_url) <= 500)),
  capacity int check (capacity is null or capacity between 1 and 5000),
  details text not null default '' check (char_length(details) <= 2000),
  cycle_id uuid references public.cycles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.session_registrations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.info_sessions (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  year text not null default '' check (char_length(year) <= 40),
  created_at timestamptz not null default now(),
  unique (session_id, email)
);

-- Students who asked to hear when the next cycle opens.
create table if not exists public.notify_list (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) between 3 and 320),
  name text not null default '' check (char_length(name) <= 200),
  created_at timestamptz not null default now()
);

create index if not exists engagement_people_user_idx on public.engagement_people (user_id);
create index if not exists engagement_people_engagement_idx on public.engagement_people (engagement_id);
create index if not exists documents_engagement_idx on public.documents (engagement_id);
create index if not exists updates_engagement_idx on public.updates (engagement_id);
create index if not exists application_reviews_application_idx on public.application_reviews (application_id);
create index if not exists inquiries_created_idx on public.inquiries (created_at desc);
create index if not exists applications_cycle_idx on public.applications (cycle_id);
create index if not exists cycles_dates_idx on public.cycles (opens_at, closes_at);
create index if not exists info_sessions_start_idx on public.info_sessions (starts_at);
create index if not exists session_registrations_session_idx on public.session_registrations (session_id);

insert into public.settings (key, value) values ('applications_open', 'true')
on conflict (key) do nothing;


-- ============================================================== access checks
-- These run with the owner's rights so policies can consult other tables without
-- recursion. Each answers one question about the person making the request.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('member', 'admin'));
$$;

create or replace function public.on_engagement(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.engagement_people where engagement_id = eid and user_id = auth.uid());
$$;

create or replace function public.on_team(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engagement_people
    where engagement_id = eid and user_id = auth.uid() and kind = 'team'
  );
$$;

-- Storage folders are compared as text, so an odd folder name can never raise an error.
create or replace function public.on_engagement_folder(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.engagement_people where engagement_id::text = folder and user_id = auth.uid());
$$;

create or replace function public.on_team_folder(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.engagement_people
    where engagement_id::text = folder and user_id = auth.uid() and kind = 'team'
  );
$$;

-- The cycle accepting applications at this moment, if there is one.
create or replace function public.open_cycle_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.cycles where opens_at <= now() and closes_at > now() order by closes_at limit 1;
$$;

create or replace function public.applications_open() returns boolean
language sql stable security definer set search_path = public as $$
  select public.open_cycle_id() is not null;
$$;

-- Students can start a draft once a cycle is scheduled, and submit it while the cycle is open.
create or replace function public.cycle_ahead() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cycles where closes_at > now());
$$;

-- Administrators, and members whose team card says they run recruiting.
create or replace function public.is_recruiter() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (
    public.is_member()
    and exists (select 1 from public.team_members where profile_id = auth.uid() and runs_recruiting)
  );
$$;

-- Team photos live in a folder named after the card's id.
create or replace function public.owns_team_folder(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where id::text = folder and profile_id = auth.uid());
$$;


-- ============================================================== automatic steps

-- Every new account gets a profile. New accounts have no special access.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(coalesce(new.email, '')), left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = lower(coalesce(new.email, '')) where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email on auth.users;
create trigger on_auth_user_email
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email();

-- Applicants write and submit their own application. Status changes after
-- submission, decisions and notes to the applicant come only from administrators.
create or replace function public.guard_application() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null then
    return new; -- the SQL editor and server-side tools
  end if;
  if public.is_admin() then
    if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('accepted', 'declined') then
      new.decided_at := now();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    new.email := coalesce((select email from public.profiles where id = auth.uid()), new.email);
    new.status := 'draft';
    new.message := '';
    new.submitted_at := null;
    new.decided_at := null;
    new.cycle_id := null;
  else
    new.user_id := old.user_id;
    new.email := old.email;
    new.message := old.message;
    new.decided_at := old.decided_at;
    new.submitted_at := old.submitted_at;
    new.cycle_id := old.cycle_id;
    if new.status is distinct from old.status then
      if old.status = 'draft' and new.status = 'submitted' then
        -- A first submission joins the open cycle. One returned for edits keeps its cycle.
        if old.cycle_id is null then
          new.cycle_id := public.open_cycle_id();
          if new.cycle_id is null then
            raise exception 'Applications are closed right now. You can submit once the next cycle opens.';
          end if;
        end if;
        new.submitted_at := now();
      else
        raise exception 'Only Foreman can change the status of an application.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_application on public.applications;
create trigger guard_application
  before insert or update on public.applications
  for each row execute function public.guard_application();

-- Accepting an applicant gives them member access.
create or replace function public.grant_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    update public.profiles set role = 'member' where id = new.user_id and role = 'user';
  end if;
  return new;
end;
$$;

drop trigger if exists application_accepted on public.applications;
create trigger application_accepted
  after update of status on public.applications
  for each row execute function public.grant_membership();

-- Cycles never overlap, so there is never doubt about which one an application belongs to.
create or replace function public.guard_cycle() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  clash text;
begin
  select name into clash from public.cycles
  where id is distinct from new.id and tstzrange(opens_at, closes_at) && tstzrange(new.opens_at, new.closes_at)
  limit 1;
  if clash is not null then
    raise exception 'These dates overlap the % cycle. Cycles can''t overlap.', clash;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_cycle on public.cycles;
create trigger guard_cycle
  before insert or update on public.cycles
  for each row execute function public.guard_cycle();

-- People editing their own team card can change how they present themselves,
-- not their name, title, teams or place on the page.
create or replace function public.guard_team_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.id := old.id;
  new.name := old.name;
  new.title := old.title;
  new.teams := old.teams;
  new.runs_recruiting := old.runs_recruiting;
  new.profile_id := old.profile_id;
  new.visible := old.visible;
  new.sort_order := old.sort_order;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists guard_team_member on public.team_members;
create trigger guard_team_member
  before update on public.team_members
  for each row execute function public.guard_team_member();

-- Names on reviews, updates, files and announcements come from the author's profile.
create or replace function public.stamp_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who text;
begin
  if auth.uid() is null then
    return new;
  end if;
  select coalesce(nullif(full_name, ''), email) into who from public.profiles where id = auth.uid();
  case tg_table_name
    when 'updates' then
      new.author_id := auth.uid();
      new.author_name := coalesce(who, '');
    when 'application_reviews' then
      new.reviewer_id := auth.uid();
      new.reviewer_name := coalesce(who, '');
    when 'documents' then
      new.created_by := auth.uid();
      new.created_by_name := coalesce(who, '');
    when 'announcements' then
      new.author_name := coalesce(who, '');
    else
      null;
  end case;
  return new;
end;
$$;

drop trigger if exists stamp_author on public.updates;
create trigger stamp_author before insert on public.updates for each row execute function public.stamp_author();
drop trigger if exists stamp_author on public.application_reviews;
create trigger stamp_author before insert on public.application_reviews for each row execute function public.stamp_author();
drop trigger if exists stamp_author on public.documents;
create trigger stamp_author before insert on public.documents for each row execute function public.stamp_author();
drop trigger if exists stamp_author on public.announcements;
create trigger stamp_author before insert on public.announcements for each row execute function public.stamp_author();

-- A file uploaded against a request marks that request as received.
create or replace function public.mark_request_received() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'upload' and new.request_id is not null then
    update public.documents
    set status = 'received'
    where id = new.request_id and engagement_id = new.engagement_id and kind = 'request' and status = 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists document_received on public.documents;
create trigger document_received
  after insert on public.documents
  for each row execute function public.mark_request_received();


-- ============================================================== actions

-- A client opens their engagement with the code in their invitation link.
create or replace function public.claim_invite(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  wanted text := regexp_replace(upper(coalesce(code, '')), '[^A-Z0-9]', '', 'g');
  invite public.engagement_people;
  who text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.';
  end if;
  select * into invite
  from public.engagement_people
  where invite_code is not null and replace(invite_code, '-', '') = wanted
  for update;
  if length(wanted) < 8 or not found or (invite.user_id is not null and invite.user_id <> auth.uid()) then
    raise exception 'This invitation code isn''t valid, or it has already been used. Check the code, or ask your engagement manager for a new one.';
  end if;
  if invite.user_id is null and not exists (
    select 1 from public.engagement_people where engagement_id = invite.engagement_id and user_id = auth.uid()
  ) then
    select full_name into who from public.profiles where id = auth.uid();
    update public.engagement_people
    set user_id = auth.uid(), name = coalesce(nullif(invite.name, ''), who, '')
    where id = invite.id;
  end if;
  return invite.engagement_id;
end;
$$;

-- Everything the public recruiting pages show, in one call: the open, next and last
-- cycles, upcoming info sessions (without their meeting links) and the team.
-- Contact details appear only for people who host coffee chats.
create or replace function public.recruiting_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'now', now(),
    'cycle', (select to_jsonb(c) - 'note' - 'created_at' from public.cycles c
              where c.opens_at <= now() and c.closes_at > now() order by c.closes_at limit 1),
    'next', (select to_jsonb(c) - 'note' - 'created_at' from public.cycles c
             where c.opens_at > now() order by c.opens_at limit 1),
    'last', (select to_jsonb(c) - 'note' - 'created_at' from public.cycles c
             where c.closes_at <= now() order by c.closes_at desc limit 1),
    'sessions', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.starts_at) from (
        select i.id, i.title, i.starts_at, i.ends_at, i.location, i.details, i.capacity,
               (i.meeting_url is not null) as online,
               (select count(*) from public.session_registrations r where r.session_id = i.id) as registered
        from public.info_sessions i
        where i.ends_at > now()
        order by i.starts_at
        limit 20
      ) s), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.sort_order, t.name) from (
        select m.id, m.name, m.title, m.teams, m.bio, m.class_year, m.major, m.photo_path, m.linkedin_url,
               m.hosts_chats, m.sort_order,
               case when m.hosts_chats then m.booking_url end as booking_url,
               case when m.hosts_chats then nullif(m.email, '') end as email,
               case when m.hosts_chats then m.chat_topics else '' end as chat_topics
        from public.team_members m
        where m.visible
      ) t), '[]'::jsonb)
  );
$$;

-- A visitor registers for an info session. Registering twice is harmless, and the
-- meeting link comes back only to people who have registered.
create or replace function public.register_for_session(p_session uuid, p_name text, p_email text, p_year text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s public.info_sessions;
  clean_email text := lower(trim(coalesce(p_email, '')));
  clean_name text := left(trim(coalesce(p_name, '')), 200);
  taken int;
  fresh boolean := false;
begin
  if clean_name = '' then
    raise exception 'Please add your name.';
  end if;
  if char_length(clean_email) > 320 or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Please check your email address.';
  end if;
  select * into s from public.info_sessions where id = p_session for update;
  if not found then
    raise exception 'This session is no longer on the calendar.';
  end if;
  if s.ends_at <= now() then
    raise exception 'This session has already taken place.';
  end if;
  if not exists (select 1 from public.session_registrations where session_id = s.id and email = clean_email) then
    select count(*) into taken from public.session_registrations where session_id = s.id;
    if s.capacity is not null and taken >= s.capacity then
      raise exception 'This session is full. Please choose another one.';
    end if;
    insert into public.session_registrations (session_id, name, email, year)
    values (s.id, clean_name, clean_email, left(trim(coalesce(p_year, '')), 40));
    fresh := true;
  end if;
  return jsonb_build_object(
    'id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'ends_at', s.ends_at, 'location', s.location,
    'details', s.details, 'meeting_url', s.meeting_url, 'already', not fresh);
end;
$$;

-- A visitor asks to hear when applications open.
create or replace function public.join_notify_list(p_email text, p_name text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  clean_email text := lower(trim(coalesce(p_email, '')));
begin
  if char_length(clean_email) > 320 or clean_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Please check your email address.';
  end if;
  insert into public.notify_list (email, name)
  values (clean_email, left(trim(coalesce(p_name, '')), 200))
  on conflict (email) do update set name = coalesce(nullif(excluded.name, ''), public.notify_list.name);
end;
$$;

-- Administrators set each person's access. No one can remove their own.
create or replace function public.set_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change access.';
  end if;
  if new_role not in ('user', 'member', 'admin') then
    raise exception 'Unknown access level.';
  end if;
  if target = auth.uid() and new_role <> 'admin' then
    raise exception 'You can''t remove your own administrator access.';
  end if;
  update public.profiles set role = new_role where id = target;
end;
$$;


-- ============================================================== row-level security

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.applications enable row level security;
alter table public.application_reviews enable row level security;
alter table public.engagements enable row level security;
alter table public.inquiries enable row level security;
alter table public.engagement_people enable row level security;
alter table public.documents enable row level security;
alter table public.updates enable row level security;
alter table public.resources enable row level security;
alter table public.announcements enable row level security;
alter table public.cycles enable row level security;
alter table public.team_members enable row level security;
alter table public.info_sessions enable row level security;
alter table public.session_registrations enable row level security;
alter table public.notify_list enable row level security;

-- profiles
drop policy if exists "profiles: read own, admins read all" on public.profiles;
create policy "profiles: read own, admins read all" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_admin());
drop policy if exists "profiles: change own name" on public.profiles;
create policy "profiles: change own name" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- settings
drop policy if exists "settings: anyone reads" on public.settings;
create policy "settings: anyone reads" on public.settings
  for select to anon, authenticated using (true);
drop policy if exists "settings: admins write" on public.settings;
create policy "settings: admins write" on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- applications
drop policy if exists "applications: read own, admins read all" on public.applications;
create policy "applications: read own, admins read all" on public.applications
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
drop policy if exists "applications: start own while open" on public.applications;
create policy "applications: start own while open" on public.applications
  for insert to authenticated with check (user_id = (select auth.uid()) and public.cycle_ahead());
drop policy if exists "applications: edit own draft" on public.applications;
create policy "applications: edit own draft" on public.applications
  for update to authenticated
  using (user_id = (select auth.uid()) and status = 'draft')
  with check (user_id = (select auth.uid()));
drop policy if exists "applications: admins update" on public.applications;
create policy "applications: admins update" on public.applications
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "applications: admins delete" on public.applications;
create policy "applications: admins delete" on public.applications
  for delete to authenticated using (public.is_admin());

-- application reviews
drop policy if exists "reviews: admins only" on public.application_reviews;
create policy "reviews: admins only" on public.application_reviews
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- inquiries: the website's forms can add one; only administrators can read them
drop policy if exists "inquiries: anyone can send" on public.inquiries;
create policy "inquiries: anyone can send" on public.inquiries
  for insert to anon, authenticated with check (status = 'new' and engagement_id is null);
drop policy if exists "inquiries: admins read" on public.inquiries;
create policy "inquiries: admins read" on public.inquiries
  for select to authenticated using (public.is_admin());
drop policy if exists "inquiries: admins update" on public.inquiries;
create policy "inquiries: admins update" on public.inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "inquiries: admins delete" on public.inquiries;
create policy "inquiries: admins delete" on public.inquiries
  for delete to authenticated using (public.is_admin());

-- engagements
drop policy if exists "engagements: people on it read" on public.engagements;
create policy "engagements: people on it read" on public.engagements
  for select to authenticated using (public.is_admin() or public.on_engagement(id));
drop policy if exists "engagements: admins create" on public.engagements;
create policy "engagements: admins create" on public.engagements
  for insert to authenticated with check (public.is_admin());
drop policy if exists "engagements: team updates" on public.engagements;
create policy "engagements: team updates" on public.engagements
  for update to authenticated using (public.is_admin() or public.on_team(id)) with check (public.is_admin() or public.on_team(id));
drop policy if exists "engagements: admins delete" on public.engagements;
create policy "engagements: admins delete" on public.engagements
  for delete to authenticated using (public.is_admin());

-- engagement people
drop policy if exists "people: people on it read" on public.engagement_people;
create policy "people: people on it read" on public.engagement_people
  for select to authenticated using (public.is_admin() or public.on_engagement(engagement_id));
drop policy if exists "people: admins manage" on public.engagement_people;
create policy "people: admins manage" on public.engagement_people
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- documents: requests, client uploads and deliverables
drop policy if exists "documents: people on it read" on public.documents;
create policy "documents: people on it read" on public.documents
  for select to authenticated using (public.is_admin() or public.on_engagement(engagement_id));
drop policy if exists "documents: team adds, clients upload" on public.documents;
create policy "documents: team adds, clients upload" on public.documents
  for insert to authenticated with check (
    public.is_admin() or public.on_team(engagement_id) or (kind = 'upload' and public.on_engagement(engagement_id))
  );
drop policy if exists "documents: team updates" on public.documents;
create policy "documents: team updates" on public.documents
  for update to authenticated
  using (public.is_admin() or public.on_team(engagement_id))
  with check (public.is_admin() or public.on_team(engagement_id));
drop policy if exists "documents: team or uploader deletes" on public.documents;
create policy "documents: team or uploader deletes" on public.documents
  for delete to authenticated using (
    public.is_admin() or public.on_team(engagement_id)
    or (kind = 'upload' and created_by = (select auth.uid()) and public.on_engagement(engagement_id))
  );

-- updates
drop policy if exists "updates: people on it read" on public.updates;
create policy "updates: people on it read" on public.updates
  for select to authenticated using (public.is_admin() or public.on_engagement(engagement_id));
drop policy if exists "updates: team posts" on public.updates;
create policy "updates: team posts" on public.updates
  for insert to authenticated with check (public.is_admin() or public.on_team(engagement_id));
drop policy if exists "updates: author or admin deletes" on public.updates;
create policy "updates: author or admin deletes" on public.updates
  for delete to authenticated using (public.is_admin() or author_id = (select auth.uid()));

-- library and announcements
drop policy if exists "resources: members read" on public.resources;
create policy "resources: members read" on public.resources
  for select to authenticated using (public.is_member());
drop policy if exists "resources: admins manage" on public.resources;
create policy "resources: admins manage" on public.resources
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "announcements: members read" on public.announcements;
create policy "announcements: members read" on public.announcements
  for select to authenticated using (public.is_member());
drop policy if exists "announcements: admins manage" on public.announcements;
create policy "announcements: admins manage" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- recruiting: visitors read through recruiting_public() and sign up through its two companions
drop policy if exists "cycles: recruiters read" on public.cycles;
create policy "cycles: recruiters read" on public.cycles
  for select to authenticated using (public.is_recruiter());
drop policy if exists "cycles: admins manage" on public.cycles;
create policy "cycles: admins manage" on public.cycles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "team: recruiters and the person read" on public.team_members;
create policy "team: recruiters and the person read" on public.team_members
  for select to authenticated using (public.is_recruiter() or profile_id = (select auth.uid()));
drop policy if exists "team: admins add" on public.team_members;
create policy "team: admins add" on public.team_members
  for insert to authenticated with check (public.is_admin());
drop policy if exists "team: admins or the person update" on public.team_members;
create policy "team: admins or the person update" on public.team_members
  for update to authenticated
  using (public.is_admin() or profile_id = (select auth.uid()))
  with check (public.is_admin() or profile_id = (select auth.uid()));
drop policy if exists "team: admins remove" on public.team_members;
create policy "team: admins remove" on public.team_members
  for delete to authenticated using (public.is_admin());

drop policy if exists "sessions: recruiters manage" on public.info_sessions;
create policy "sessions: recruiters manage" on public.info_sessions
  for all to authenticated using (public.is_recruiter()) with check (public.is_recruiter());
drop policy if exists "registrations: recruiters read" on public.session_registrations;
create policy "registrations: recruiters read" on public.session_registrations
  for select to authenticated using (public.is_recruiter());
drop policy if exists "registrations: recruiters remove" on public.session_registrations;
create policy "registrations: recruiters remove" on public.session_registrations
  for delete to authenticated using (public.is_recruiter());
drop policy if exists "notify: recruiters read" on public.notify_list;
create policy "notify: recruiters read" on public.notify_list
  for select to authenticated using (public.is_recruiter());
drop policy if exists "notify: recruiters remove" on public.notify_list;
create policy "notify: recruiters remove" on public.notify_list
  for delete to authenticated using (public.is_recruiter());


-- ============================================================== table privileges
-- Row-level security decides which rows; these grants decide which operations.

revoke all on public.profiles, public.settings, public.applications, public.application_reviews,
  public.engagements, public.inquiries, public.engagement_people, public.documents, public.updates,
  public.resources, public.announcements, public.cycles, public.team_members, public.info_sessions,
  public.session_registrations, public.notify_list from anon;
grant select on public.settings to anon;
grant insert on public.inquiries to anon;

grant select, insert, update, delete on public.settings, public.applications, public.application_reviews,
  public.engagements, public.inquiries, public.engagement_people, public.documents, public.updates,
  public.resources, public.announcements to authenticated;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.cycles, public.team_members, public.info_sessions to authenticated;
-- Sign-ups arrive only through register_for_session() and join_notify_list().
revoke insert, update on public.session_registrations, public.notify_list from authenticated;
grant select, delete on public.session_registrations, public.notify_list to authenticated;

revoke execute on function public.claim_invite(text) from public, anon;
revoke execute on function public.set_role(uuid, text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;
grant execute on function public.set_role(uuid, text) to authenticated;
grant execute on function public.recruiting_public() to anon, authenticated;
grant execute on function public.register_for_session(uuid, text, text, text) to anon, authenticated;
grant execute on function public.join_notify_list(text, text) to anon, authenticated;


-- ============================================================== file storage
-- Three private buckets, whose files are only ever reached through short-lived signed links,
-- and one public bucket for the portraits on the team page.
--   resumes       <user id>/<file>          the applicant and administrators
--   engagements   <engagement id>/<file>    the client, the team and administrators
--   library       <file>                    members read, administrators manage
--   team          <team card id>/<file>     anyone sees; administrators and the person manage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('resumes', 'resumes', false, 10485760, array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('engagements', 'engagements', false, 52428800, null),
  ('library', 'library', false, 52428800, null)
on conflict (id) do update set public = false;

drop policy if exists "foreman resumes: owner uploads" on storage.objects;
create policy "foreman resumes: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "foreman resumes: owner or admin reads" on storage.objects;
create policy "foreman resumes: owner or admin reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'resumes' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
drop policy if exists "foreman resumes: owner or admin deletes" on storage.objects;
create policy "foreman resumes: owner or admin deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'resumes' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));

drop policy if exists "foreman engagements: people on it read" on storage.objects;
create policy "foreman engagements: people on it read" on storage.objects
  for select to authenticated
  using (bucket_id = 'engagements' and (public.is_admin() or public.on_engagement_folder((storage.foldername(name))[1])));
drop policy if exists "foreman engagements: people on it upload" on storage.objects;
create policy "foreman engagements: people on it upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'engagements' and (public.is_admin() or public.on_engagement_folder((storage.foldername(name))[1])));
drop policy if exists "foreman engagements: team or uploader deletes" on storage.objects;
create policy "foreman engagements: team or uploader deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'engagements'
    and (public.is_admin() or public.on_team_folder((storage.foldername(name))[1]) or owner_id = (select auth.uid())::text)
  );

drop policy if exists "foreman library: members read" on storage.objects;
create policy "foreman library: members read" on storage.objects
  for select to authenticated using (bucket_id = 'library' and public.is_member());
drop policy if exists "foreman library: admins upload" on storage.objects;
create policy "foreman library: admins upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'library' and public.is_admin());
drop policy if exists "foreman library: admins delete" on storage.objects;
create policy "foreman library: admins delete" on storage.objects
  for delete to authenticated using (bucket_id = 'library' and public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team', 'team', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "foreman team: admins or the person read" on storage.objects;
create policy "foreman team: admins or the person read" on storage.objects
  for select to authenticated
  using (bucket_id = 'team' and (public.is_admin() or public.owns_team_folder((storage.foldername(name))[1])));
drop policy if exists "foreman team: admins or the person upload" on storage.objects;
create policy "foreman team: admins or the person upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team' and (public.is_admin() or public.owns_team_folder((storage.foldername(name))[1])));
drop policy if exists "foreman team: admins or the person delete" on storage.objects;
create policy "foreman team: admins or the person delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team' and (public.is_admin() or public.owns_team_folder((storage.foldername(name))[1])));
