-- ============================================================================
-- Fight Radar : comptes, favoris synchronisés et pronostics entre amis
-- À coller en entier dans Supabase > SQL Editor, puis « Run ».
-- Peut être relancé sans risque (ne supprime aucune donnée).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Schéma privé : invisible depuis le site, on n'y accède que par les fonctions fr_* ci-dessous
create schema if not exists fr;
revoke all on schema fr from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then execute 'revoke all on schema fr from anon'; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then execute 'revoke all on schema fr from authenticated'; end if;
end $$;

create table if not exists fr.users(
  id uuid primary key default gen_random_uuid(),
  pseudo text not null,
  secret_hash bytea not null unique,
  favs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create table if not exists fr.groups(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  owner uuid references fr.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists fr.members(
  group_id uuid not null references fr.groups(id) on delete cascade,
  user_id uuid not null references fr.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(group_id,user_id)
);
create index if not exists members_user on fr.members(user_id);
-- Rôles : chef (créateur, décide), adjoint (un seul, nommé par le chef, choisit aussi les soirées), membre
alter table fr.members add column if not exists role text not null default 'membre';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='members_role_chk') then
    alter table fr.members add constraint members_role_chk check (role in ('chef','adjoint','membre'));
  end if;
end $$;
-- Soirées retirées des pronos par le chef ou l'adjoint (par défaut, toutes les soirées comptent)
create table if not exists fr.group_off(
  group_id uuid not null references fr.groups(id) on delete cascade,
  event_id text not null,
  added_at timestamptz not null default now(),
  primary key(group_id,event_id)
);
alter table fr.group_off enable row level security;
-- Choix du chef / de l'adjoint par événement (remplace group_off). Sans choix : ouvert par défaut
-- seulement si la soirée a une vedette, un champion, un UFC numéroté ou un francophone (colonne evdef).
create table if not exists fr.group_ev(
  group_id uuid not null references fr.groups(id) on delete cascade,
  event_id text not null,
  is_on boolean not null,
  primary key(group_id,event_id)
);
alter table fr.group_ev enable row level security;
create table if not exists fr.migrations(name text primary key, done_at timestamptz not null default now());
alter table fr.migrations enable row level security;
-- Combats ouverts aux pronos : recopiés automatiquement depuis https://fightradar.fr/data/events.json
create table if not exists fr.fights(
  event_id text not null,
  fkey text not null,
  a text not null,
  b text not null,
  lock_at timestamptz not null,
  winner text,
  method text,
  updated_at timestamptz not null default now(),
  primary key(event_id,fkey)
);
-- Barème : colonnes ajoutées (partie de soirée, bonus main event / co-main / combat vedette)
alter table fr.fights add column if not exists seg text;
alter table fr.fights add column if not exists bonus int not null default 0;
-- Grosse soirée (UFC numéroté, ou au moins un combattant vedette sur la carte) : +1 sur chaque bon vainqueur
alter table fr.fights add column if not exists evbonus int not null default 0;
alter table fr.fights add column if not exists evdef boolean not null default false;
-- Combattants « vedettes » (même liste que sur le site) : combat vedette = +1
create table if not exists fr.stars(name text primary key);
alter table fr.stars enable row level security;
insert into fr.stars(name) values ('Alexander Volkanovski'),('Petr Yan'),('Merab Dvalishvili'),('Movsar Evloev'),('Islam Makhachev'),('Ilia Topuria'),('Tom Aspinall'),('Jon Jones'),('Khamzat Chimaev'),('Sean Strickland'),('Max Holloway'),('Justin Gaethje'),('Paddy Pimblett'),('Sean O''Malley'),('Conor McGregor'),('Valentina Shevchenko'),('Zhang Weili'),('Alex Pereira'),('Jiří Procházka'),('Magomed Ankalaev'),('Dricus du Plessis'),('Charles Oliveira'),('Dustin Poirier'),('Israel Adesanya'),('Kamaru Usman'),('Leon Edwards'),('Belal Muhammad'),('Jack Della Maddalena'),('Alexandre Pantoja'),('Joshua Van'),('Brandon Moreno'),('Diego Lopes'),('Arman Tsarukyan'),('Ciryl Gane'),('Benoît Saint Denis'),('Benoît Saint-Denis'),('Manon Fiorot'),('Nassourdine Imavov'),('Amanda Nunes'),('Kayla Harrison'),('Julianna Peña'),('Robert Whittaker'),('Michael Chandler'),('Colby Covington'),('Shavkat Rakhmonov'),('Bo Nickal'),('Derrick Lewis'),('Umar Nurmagomedov'),('Aljamain Sterling'),('Francis Ngannou'),('Cris Cyborg'),('Usman Nurmagomedov'),('Patrick Habirora'),('A. J. McKee'),('Johnny Eblen'),('Cédric Doumbè'),('Canelo Álvarez'),('Tyson Fury'),('Anthony Joshua'),('Oleksandr Usyk'),('Naoya Inoue'),('Terence Crawford'),('Dmitry Bivol'),('Artur Beterbiev'),('Gervonta Davis'),('Shakur Stevenson'),('Devin Haney'),('Ryan Garcia'),('Jake Paul'),('Deontay Wilder'),('David Benavidez'),('Jaime Munguía'),('Agit Kabayel'),('Daniel Dubois'),('Jai Opetaia'),('Junto Nakatani'),('Teofimo Lopez'),('Errol Spence Jr.'),('Vasiliy Lomachenko'),('Christian M''billi'),('Tony Yoka') on conflict do nothing;

create table if not exists fr.picks(
  user_id uuid not null references fr.users(id) on delete cascade,
  event_id text not null,
  fkey text not null,
  pick text not null,
  method text check (method in ('ko','sub','dec')),
  updated_at timestamptz not null default now(),
  primary key(user_id,event_id,fkey),
  foreign key(event_id,fkey) references fr.fights(event_id,fkey) on delete cascade
);
create index if not exists picks_fight on fr.picks(event_id,fkey);
create table if not exists fr.sync_state(
  id int primary key default 1 check (id=1),
  last_req_at timestamptz,
  last_req_id bigint,
  last_ok_at timestamptz,
  last_count int
);
insert into fr.sync_state(id) values (1) on conflict do nothing;

-- Sécurité supplémentaire : RLS activé sans aucune règle = aucun accès direct aux tables
alter table fr.users enable row level security;
alter table fr.groups enable row level security;
alter table fr.members enable row level security;
alter table fr.fights enable row level security;
alter table fr.picks enable row level security;
alter table fr.sync_state enable row level security;

-- ---------------------------------------------------------------------------
-- Outils internes
-- ---------------------------------------------------------------------------

-- Code aléatoire (alphabet sans 0/O ni 1/I pour éviter les confusions)
create or replace function fr.rand_code(n int) returns text
language plpgsql volatile set search_path='' as $$
declare
  alpha constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  b bytea := extensions.gen_random_bytes(n);
  s text := '';
begin
  for i in 0..n-1 loop
    s := s || substr(alpha, (get_byte(b,i) & 31) + 1, 1);
  end loop;
  return s;
end $$;

create or replace function fr.norm_code(p text) returns text
language sql immutable set search_path='' as $$
  select upper(regexp_replace(coalesce(p,''),'[^A-Za-z0-9]','','g'))
$$;

-- Compte correspondant au code personnel (null si inconnu)
create or replace function fr.uid(p_code text) returns uuid
language sql stable set search_path='' as $$
  select id from fr.users where secret_hash = extensions.digest(fr.norm_code(p_code),'sha256')
$$;

create or replace function fr.need_uid(p_code text) returns uuid
language plpgsql set search_path='' as $$
declare v uuid;
begin
  v := fr.uid(p_code);
  if v is null then raise exception 'Compte introuvable : vérifie ton code personnel.'; end if;
  update fr.users set seen_at=now() where id=v and seen_at < now() - interval '1 hour';
  return v;
end $$;

create or replace function fr.clean_name(p text, lo int, hi int, what text) returns text
language plpgsql immutable set search_path='' as $$
declare s text := btrim(regexp_replace(coalesce(p,''),'[[:space:][:cntrl:]]+',' ','g'));
begin
  if char_length(s) < lo or char_length(s) > hi then
    raise exception '% : entre % et % caractères.', what, lo, hi;
  end if;
  if s ~ '[<>]' then raise exception '% : caractères < et > interdits.', what; end if;
  return s;
end $$;

-- Identifiant d'un combat : les deux noms dans un ordre fixe (le même calcul est fait sur le site)
create or replace function fr.fkey(a text, b text) returns text
language sql immutable set search_path='' as $$
  select case when a collate "C" < b collate "C" then a || ' | ' || b else b || ' | ' || a end
$$;

-- Méthode de victoire ramenée à 3 familles : ko, sub (soumission), dec (décision)
create or replace function fr.method_cat(m text) returns text
language sql immutable set search_path='' as $$
  select case
    when m is null then null
    when m ~* '^\s*(soumission|submission)' then 'sub'
    when m ~* '^\s*(d[ée]cision)' then 'dec'
    when m ~* '^\s*(t?ko|ko/tko|arr[eê]t|abandon|rtd|stoppage)' then 'ko'
    else null end
$$;

-- Barème d'un bon vainqueur : main card 3, préliminaires 2, early prelims 1 ;
-- + bonus (main event +2, co-main ou combat vedette +1) ; + 1 sur une grosse soirée. Bonne méthode : +1 en plus.
create or replace function fr.base_pts(seg text) returns int
language sql immutable set search_path='' as $$
  select case coalesce(seg,'main') when 'main' then 3 when 'prelims' then 2 else 1 end
$$;

create or replace function fr.ev_open(p_group uuid, p_event text) returns boolean
language sql stable set search_path='' as $$
  select coalesce((select is_on from fr.group_ev where group_id=p_group and event_id=p_event),
                  (select bool_or(evdef) from fr.fights where event_id=p_event), false)
$$;

-- ---------------------------------------------------------------------------
-- Copie des combats depuis le site (toutes les 10 min) : verrous et résultats
-- ---------------------------------------------------------------------------
create or replace function fr.load_events(j jsonb) returns int
language plpgsql set search_path='' as $$
declare n int;
begin
  with ev as (
    select e from jsonb_array_elements(coalesce(j->'events','[]'::jsonb)) e
  ), fx as (
    select e->>'id' as eid, e->'segs' as segs, x, i,
      case when e->>'name' ~ '^UFC [0-9]' or exists (
        select 1 from jsonb_array_elements(coalesce(e->'fights','[]'::jsonb)) y, (values ('a'),('b')) c(sd)
        where y->sd ? 'star' or y->sd ? 'champ' or exists (select 1 from fr.stars st where st.name = y->sd->>'n'))
      then 1 else 0 end as evb,
      exists (select 1 from jsonb_array_elements(coalesce(e->'fights','[]'::jsonb)) y, (values ('a'),('b')) c(sd)
        where y->sd ? 'fr' or y->sd->>'nat' in ('FRA','BEL')) as evfr
    from ev, jsonb_array_elements(coalesce(e->'fights','[]'::jsonb)) with ordinality t(x,i)
    where coalesce(x->'a'->>'n','') <> '' and coalesce(x->'b'->>'n','') <> ''
      and not coalesce((x->'a'->>'tbd')::boolean,false) and not coalesce((x->'b'->>'tbd')::boolean,false)
  ), rows as (
    select distinct on (eid, fr.fkey(x->'a'->>'n', x->'b'->>'n'))
      eid,
      fr.fkey(x->'a'->>'n', x->'b'->>'n') as k,
      x->'a'->>'n' as a, x->'b'->>'n' as b,
      coalesce(
        (select (s->>'t')::timestamptz from jsonb_array_elements(segs) s where s->>'k' = x->>'s' limit 1),
        (select min((s->>'t')::timestamptz) from jsonb_array_elements(segs) s)
      ) as lock_at,
      case x->'res'->>'w' when 'a' then x->'a'->>'n' when 'b' then x->'b'->>'n'
        when 'draw' then 'draw' when 'nc' then 'nc' else null end as winner,
      fr.method_cat(x->'res'->>'method') as method,
      coalesce(x->>'s','main') as seg,
      case when i=1 then 2
           when (i=2 and coalesce(x->>'s','main')='main')
             or x->'a' ? 'star' or x->'b' ? 'star' or x->'a' ? 'champ' or x->'b' ? 'champ'
             or exists (select 1 from fr.stars st where st.name in (x->'a'->>'n', x->'b'->>'n')) then 1
           else 0 end as bonus,
      evb, evfr
    from fx
  )
  insert into fr.fights(event_id,fkey,a,b,lock_at,winner,method,seg,bonus,evbonus,evdef,updated_at)
  select eid,k,a,b,lock_at,winner,method,seg,bonus,evb,(evb=1 or evfr),now() from rows where lock_at is not null
  on conflict (event_id,fkey) do update
    set a=excluded.a, b=excluded.b, lock_at=excluded.lock_at,
        winner=coalesce(excluded.winner, fr.fights.winner),
        method=coalesce(excluded.method, fr.fights.method),
        seg=excluded.seg, bonus=excluded.bonus, evbonus=excluded.evbonus, evdef=excluded.evdef,
        updated_at=now()
    where (fr.fights.a,fr.fights.b,fr.fights.lock_at,fr.fights.winner,fr.fights.method,fr.fights.seg,fr.fights.bonus,fr.fights.evbonus,fr.fights.evdef)
          is distinct from (excluded.a,excluded.b,excluded.lock_at,coalesce(excluded.winner,fr.fights.winner),coalesce(excluded.method,fr.fights.method),excluded.seg,excluded.bonus,excluded.evbonus,excluded.evdef);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function fr.sync() returns text
language plpgsql set search_path='' as $$
declare st fr.sync_state; body text; n int; rid bigint;
begin
  select * into st from fr.sync_state where id=1 for update;
  -- 1) Réponse de la requête précédente
  if st.last_req_id is not null then
    select r.content into body from net._http_response r
      where r.id = st.last_req_id and r.status_code = 200;
    if body is not null then
      n := fr.load_events(body::jsonb);
      update fr.sync_state set last_ok_at=now(), last_count=n, last_req_id=null where id=1;
    end if;
  end if;
  -- 2) Nouvelle requête (au plus une toutes les 2 minutes)
  if st.last_req_at is null or st.last_req_at < now() - interval '2 minutes' then
    select net.http_get('https://fightradar.fr/data/events.json?t=' || extract(epoch from now())::bigint) into rid;
    update fr.sync_state set last_req_at=now(), last_req_id=rid where id=1;
  end if;
  return 'ok';
end $$;

-- ---------------------------------------------------------------------------
-- Fonctions appelées par le site (préfixe fr_)
-- ---------------------------------------------------------------------------

-- Créer un compte : renvoie le code personnel (affiché une seule fois)
create or replace function public.fr_signup(p_pseudo text) returns json
language plpgsql security definer set search_path='' as $$
declare s text; v uuid; nm text;
begin
  nm := fr.clean_name(p_pseudo, 2, 20, 'Pseudo');
  -- Anti-robots : 40 comptes par heure au maximum pour tout le site
  if (select count(*) from fr.users where created_at > now() - interval '1 hour') >= 40 then
    raise exception 'Trop de comptes créés en ce moment, réessaie dans une heure.';
  end if;
  s := fr.rand_code(20);
  insert into fr.users(pseudo, secret_hash) values (nm, extensions.digest(s,'sha256')) returning id into v;
  return json_build_object('code', substr(s,1,4)||'-'||substr(s,5,4)||'-'||substr(s,9,4)||'-'||substr(s,13,4)||'-'||substr(s,17,4), 'pseudo', nm);
end $$;

create or replace function public.fr_me(p_code text) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code);
begin
  return (select json_build_object(
    'pseudo', u.pseudo,
    'favs', u.favs,
    'groups', coalesce((select json_agg(json_build_object('id',g.id,'name',g.name,'code',g.code,'role',m.role,
                 'n',(select count(*) from fr.members m2 where m2.group_id=g.id),
                 'open',coalesce((select json_agg(x.event_id) from (select distinct f.event_id from fr.fights f
                     where f.lock_at > now() - interval '120 days' and fr.ev_open(g.id,f.event_id)) x),'[]'::json)) order by m.joined_at)
               from fr.members m join fr.groups g on g.id=m.group_id where m.user_id=v), '[]'::json)
  ) from fr.users u where u.id=v);
end $$;

create or replace function public.fr_save_favs(p_code text, p_favs jsonb) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code); clean jsonb;
begin
  if jsonb_typeof(p_favs) <> 'array' then raise exception 'Favoris invalides.'; end if;
  select coalesce(jsonb_agg(x order by o),'[]'::jsonb) into clean from (
    select distinct on (x) x, o from jsonb_array_elements_text(p_favs) with ordinality t(x,o)
    where char_length(x) between 1 and 80 order by x, o) s;
  if jsonb_array_length(clean) > 300 then raise exception 'Trop de favoris (300 au maximum).'; end if;
  update fr.users set favs=clean where id=v;
  return json_build_object('ok',true);
end $$;

create or replace function public.fr_rename(p_code text, p_pseudo text) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code); nm text := fr.clean_name(p_pseudo, 2, 20, 'Pseudo');
begin
  update fr.users set pseudo=nm where id=v;
  return json_build_object('pseudo',nm);
end $$;

create or replace function public.fr_delete_account(p_code text) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code);
begin
  delete from fr.users where id=v;
  delete from fr.groups g where not exists (select 1 from fr.members m where m.group_id=g.id);
  update fr.members m set role='chef' where m.user_id=(
    select x.user_id from fr.members x where x.group_id=m.group_id order by (x.role='adjoint') desc, x.joined_at limit 1)
    and not exists (select 1 from fr.members c where c.group_id=m.group_id and c.role='chef');
  return json_build_object('ok',true);
end $$;

create or replace function public.fr_group_create(p_code text, p_name text) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code); nm text := fr.clean_name(p_name, 2, 30, 'Nom du groupe'); g uuid; c text;
begin
  if (select count(*) from fr.groups where owner=v) >= 10 then raise exception 'Tu as déjà créé 10 groupes.'; end if;
  if (select count(*) from fr.members where user_id=v) >= 20 then raise exception 'Tu es déjà dans 20 groupes.'; end if;
  loop
    c := fr.rand_code(8);
    exit when not exists (select 1 from fr.groups where code=c);
  end loop;
  insert into fr.groups(name,code,owner) values (nm,c,v) returning id into g;
  insert into fr.members(group_id,user_id,role) values (g,v,'chef');
  return json_build_object('id',g,'name',nm,'code',c);
end $$;

-- Aperçu d'un groupe avant de le rejoindre (nom et nombre de membres seulement)
create or replace function public.fr_group_peek(p_gcode text) returns json
language plpgsql security definer set search_path='' as $$
declare r record;
begin
  select g.name, (select count(*) from fr.members m where m.group_id=g.id) n into r
    from fr.groups g where g.code=fr.norm_code(p_gcode);
  if not found then raise exception 'Groupe introuvable : vérifie le code d''invitation.'; end if;
  return json_build_object('name',r.name,'n',r.n);
end $$;

create or replace function public.fr_group_join(p_code text, p_gcode text) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code); g record;
begin
  select id,name into g from fr.groups where code=fr.norm_code(p_gcode);
  if not found then raise exception 'Groupe introuvable : vérifie le code d''invitation.'; end if;
  if not exists (select 1 from fr.members where group_id=g.id and user_id=v) then
    if (select count(*) from fr.members where user_id=v) >= 20 then raise exception 'Tu es déjà dans 20 groupes.'; end if;
    if (select count(*) from fr.members where group_id=g.id) >= 50 then raise exception 'Ce groupe est complet (50 membres).'; end if;
    insert into fr.members(group_id,user_id) values (g.id,v);
  end if;
  return json_build_object('id',g.id,'name',g.name);
end $$;

create or replace function public.fr_group_leave(p_code text, p_group uuid) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code); was text;
begin
  delete from fr.members where group_id=p_group and user_id=v returning role into was;
  delete from fr.groups g where g.id=p_group and not exists (select 1 from fr.members m where m.group_id=g.id);
  if was='chef' then
    -- L'adjoint devient chef ; sinon le membre le plus ancien
    update fr.members set role='chef' where group_id=p_group and user_id=coalesce(
      (select user_id from fr.members where group_id=p_group and role='adjoint' limit 1),
      (select user_id from fr.members where group_id=p_group order by joined_at limit 1));
  end if;
  return json_build_object('ok',true);
end $$;

-- Faire (ou retirer, si p_pick est vide) un prono. Refusé une fois la partie de soirée commencée.
create or replace function public.fr_pick(p_code text, p_event text, p_fkey text, p_pick text, p_method text) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code); f fr.fights;
begin
  select * into f from fr.fights where event_id=p_event and fkey=p_fkey;
  if not found then raise exception 'Les pronos de ce combat ne sont pas encore ouverts. Réessaie dans quelques minutes.'; end if;
  if f.lock_at <= now() then raise exception 'Trop tard : les pronos de ce combat sont fermés.'; end if;
  if p_pick is null or p_pick = '' then
    delete from fr.picks where user_id=v and event_id=p_event and fkey=p_fkey;
    return json_build_object('ok',true);
  end if;
  if p_pick <> f.a and p_pick <> f.b then raise exception 'Choix invalide.'; end if;
  if p_method is not null and p_method not in ('ko','sub','dec') then raise exception 'Méthode invalide.'; end if;
  insert into fr.picks(user_id,event_id,fkey,pick,method) values (v,p_event,p_fkey,p_pick,p_method)
    on conflict (user_id,event_id,fkey) do update set pick=excluded.pick, method=excluded.method, updated_at=now();
  return json_build_object('ok',true,'lock_at',f.lock_at);
end $$;

-- Pronos d'une soirée : les miens (toujours) + ceux des membres de mes groupes (seulement une fois fermés)
create or replace function public.fr_event(p_code text, p_event text) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code);
begin
  return json_build_object(
    'open', coalesce((select json_agg(json_build_object('k',f.fkey,'lock',f.lock_at,'pts',fr.base_pts(f.seg)+f.bonus+f.evbonus)) from fr.fights f
                      where f.event_id=p_event), '[]'::json),
    'mine', coalesce((select json_agg(json_build_object('k',p.fkey,'pick',p.pick,'m',p.method)) from fr.picks p
                      where p.user_id=v and p.event_id=p_event), '[]'::json),
    'friends', coalesce((select json_agg(json_build_object('k',p.fkey,'who',u.pseudo,'pick',p.pick,'m',p.method) order by u.pseudo)
                      from fr.picks p join fr.fights f on f.event_id=p.event_id and f.fkey=p.fkey
                      join fr.users u on u.id=p.user_id
                      where p.event_id=p_event and p.user_id<>v and f.lock_at<=now()
                        and exists (select 1 from fr.members m1 join fr.members m2 on m1.group_id=m2.group_id
                                    where m1.user_id=v and m2.user_id=p.user_id)), '[]'::json),
    -- Avant la fermeture : seulement le nombre d'amis qui ont déjà pronostiqué chaque combat
    'counts', coalesce((select json_agg(json_build_object('k',c.fkey,'n',c.n)) from (
                      select p.fkey, count(*) n from fr.picks p join fr.fights f on f.event_id=p.event_id and f.fkey=p.fkey
                      where p.event_id=p_event and p.user_id<>v and f.lock_at>now()
                        and exists (select 1 from fr.members m1 join fr.members m2 on m1.group_id=m2.group_id
                                    where m1.user_id=v and m2.user_id=p.user_id)
                      group by p.fkey) c), '[]'::json)
  );
end $$;

-- Mes pronos sur plusieurs soirées (compteurs de la page Pronos)
create or replace function public.fr_my_counts(p_code text, p_events text[]) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code);
begin
  return coalesce((select json_object_agg(e, n) from (
    select p.event_id e, count(*) n from fr.picks p where p.user_id=v and p.event_id = any(p_events) group by p.event_id) s), '{}'::json);
end $$;

-- Classement d'un groupe (barème : voir fr.base_pts et la colonne bonus).
create or replace function public.fr_group_board(p_code text, p_group uuid) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code); g fr.groups;
begin
  if not exists (select 1 from fr.members where group_id=p_group and user_id=v) then
    raise exception 'Tu ne fais pas partie de ce groupe.';
  end if;
  select * into g from fr.groups where id=p_group;
  return json_build_object(
    'name', g.name, 'code', g.code,
    'rows', coalesce((select json_agg(r order by r.pts desc, r.good desc, r.pseudo) from (
      select u.pseudo, (u.id=v) as me, u.id as mid, m.role,
        coalesce(sum(case when f.winner is not null and p.pick=f.winner then fr.base_pts(f.seg) + f.bonus + f.evbonus + (case when p.method is not null and p.method=f.method then 1 else 0 end) else 0 end),0)::int as pts,
        count(*) filter (where f.winner is not null and p.pick=f.winner)::int as good,
        count(*) filter (where f.winner is not null and p.pick=f.winner and p.method is not null and p.method=f.method)::int as exact,
        count(*) filter (where f.winner is not null and f.winner not in ('draw','nc'))::int as judged
      from fr.members m join fr.users u on u.id=m.user_id
      left join fr.picks p on p.user_id=u.id
        and fr.ev_open(p_group, p.event_id)
      left join fr.fights f on f.event_id=p.event_id and f.fkey=p.fkey
      where m.group_id=p_group
      group by u.id, u.pseudo, m.role) r), '[]'::json)
  );
end $$;

-- Ouvrir / retirer une soirée des pronos du groupe (chef ou adjoint, avant le début de la soirée)
create or replace function public.fr_group_event(p_code text, p_group uuid, p_event text, p_on boolean) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code); st timestamptz;
begin
  if not exists (select 1 from fr.members where group_id=p_group and user_id=v and role in ('chef','adjoint')) then
    raise exception 'Seuls le chef et l''adjoint du groupe choisissent les soirées.';
  end if;
  select min(lock_at) into st from fr.fights where event_id=p_event;
  if st is null then raise exception 'Cette soirée n''est pas encore ouverte aux pronos. Réessaie dans quelques minutes.'; end if;
  if st <= now() then raise exception 'Cette soirée a déjà commencé : on ne peut plus la changer.'; end if;
  if (select count(*) from fr.group_ev where group_id=p_group) >= 2000 then raise exception 'Trop de choix enregistrés dans ce groupe.'; end if;
  insert into fr.group_ev(group_id,event_id,is_on) values (p_group,p_event,p_on)
    on conflict (group_id,event_id) do update set is_on=excluded.is_on;
  return json_build_object('ok',true);
end $$;

-- Nommer l'adjoint (chef seulement ; un seul adjoint, p_member vide = aucun)
create or replace function public.fr_group_deputy(p_code text, p_group uuid, p_member uuid) returns json
language plpgsql security definer set search_path='' as $$
declare v uuid := fr.need_uid(p_code);
begin
  if not exists (select 1 from fr.members where group_id=p_group and user_id=v and role='chef') then
    raise exception 'Seul le chef du groupe nomme l''adjoint.';
  end if;
  if p_member is not null and not exists (select 1 from fr.members where group_id=p_group and user_id=p_member and role<>'chef') then
    raise exception 'Ce joueur ne fait pas partie du groupe.';
  end if;
  update fr.members set role='membre' where group_id=p_group and role='adjoint';
  if p_member is not null then update fr.members set role='adjoint' where group_id=p_group and user_id=p_member; end if;
  return json_build_object('ok',true);
end $$;

-- Garde la base éveillée et déclenche une copie des combats (appelé par la mise à jour automatique du site)
create or replace function public.fr_ping() returns json
language plpgsql security definer set search_path='' as $$
begin
  perform fr.sync();
  return json_build_object('ok',true,'synced',(select last_ok_at from fr.sync_state where id=1));
end $$;

-- ---------------------------------------------------------------------------
-- Droits : le site (rôle anon) ne peut appeler que les fonctions fr_*
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema fr from public;
do $$
declare fn text;
begin
  foreach fn in array array[
    'fr_signup(text)','fr_me(text)','fr_save_favs(text,jsonb)','fr_rename(text,text)','fr_delete_account(text)',
    'fr_group_create(text,text)','fr_group_peek(text)','fr_group_join(text,text)','fr_group_leave(text,uuid)',
    'fr_pick(text,text,text,text,text)','fr_event(text,text)','fr_my_counts(text,text[])','fr_group_board(text,uuid)','fr_group_event(text,uuid,text,boolean)','fr_group_deputy(text,uuid,uuid)','fr_ping()']
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname='authenticated') then
      execute format('revoke execute on function public.%s from authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname='anon') then
      execute format('grant execute on function public.%s to anon', fn);
    end if;
  end loop;
end $$;

-- Migration unique : chef = créateur
do $$ begin
  if not exists (select 1 from fr.migrations where name='roles-v1') then
    update fr.members m set role='chef' from fr.groups g where g.id=m.group_id and g.owner=m.user_id;
    update fr.members m set role='chef' where m.role='membre' and not exists (select 1 from fr.members x where x.group_id=m.group_id and x.role='chef')
      and m.joined_at=(select min(joined_at) from fr.members y where y.group_id=m.group_id);
    insert into fr.migrations(name) values ('roles-v1');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from fr.migrations where name='group-ev-v2') then
    insert into fr.group_ev(group_id,event_id,is_on) select group_id,event_id,false from fr.group_off on conflict do nothing;
    -- Les événements où des membres ont déjà pronostiqué restent ouverts (pas de points perdus)
    insert into fr.group_ev(group_id,event_id,is_on)
      select distinct m.group_id, p.event_id, true from fr.members m join fr.picks p on p.user_id=m.user_id
      where not exists (select 1 from fr.group_off o where o.group_id=m.group_id and o.event_id=p.event_id)
      on conflict do nothing;
    insert into fr.migrations(name) values ('group-ev-v2');
  end if;
end $$;

-- Copie automatique des combats toutes les 10 minutes
select cron.unschedule(jobid) from cron.job where jobname='fr-sync';
select cron.schedule('fr-sync', '*/10 * * * *', 'select fr.sync()');
select fr.sync();
