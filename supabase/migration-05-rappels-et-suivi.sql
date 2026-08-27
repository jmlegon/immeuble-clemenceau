-- Migration 05 — Rappel rétroactif d'indexation, suivi des migrations
-- À exécuter dans Supabase : Project > SQL Editor > New query > coller > Run
-- Idempotente : la rejouer ne casse rien.

-- ---------- RAPPEL RÉTROACTIF ----------
-- Une révision notifiée en retard produit presque toujours un rappel : le loyer
-- révisé s'applique à partir de sa date d'effet, pas de la date de notification.
-- Le cas figurait dans les données d'installation du 1er étage (révision du
-- 1/5/2026 notifiée le 28/7/2026) sans que rien ne le chiffre ni ne le suive.
alter table indexations add column if not exists date_effet date;
alter table indexations add column if not exists rappel_montant numeric;
alter table indexations add column if not exists rappel_regle boolean default false;

-- Pour les révisions déjà archivées, la date d'effet vaut la date d'application.
update indexations set date_effet = date_application where date_effet is null;

-- ---------- SUIVI DES MIGRATIONS ----------
-- Jusqu'ici, « laquelle ai-je déjà passée ? » n'avait pas de réponse : chaque
-- écran devinait en testant la présence d'une table ou d'une colonne.
create table if not exists migrations (
  nom text primary key,
  applique_le timestamptz default now()
);

alter table migrations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'migrations' and policyname = 'authentifie_tout'
  ) then
    create policy "authentifie_tout" on migrations
      for all using (auth.uid() is not null) with check (auth.uid() is not null);
  end if;
end $$;

-- Reprise de l'historique : plutôt que de supposer, on constate. Chaque
-- migration antérieure n'est inscrite que si l'objet qu'elle crée est là.
insert into migrations (nom)
select '01-depenses-et-suivi'
where to_regclass('public.depenses') is not null
on conflict (nom) do nothing;

insert into migrations (nom)
select '02-indexations-et-documents'
where to_regclass('public.indexations') is not null
on conflict (nom) do nothing;

insert into migrations (nom)
select '03-politiques-stockage'
where exists (
  select 1 from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname = 'documents_authentifie_ajout'
)
on conflict (nom) do nothing;

insert into migrations (nom)
select '04-numerotation-atomique'
where exists (
  select 1 from pg_proc where proname = 'prochain_numero_document'
)
on conflict (nom) do nothing;

insert into migrations (nom) values ('05-rappels-et-suivi')
on conflict (nom) do nothing;

-- ---------- VÉRIFICATION ----------
-- Liste ce qui est réellement en place sur cette base :
--
--   select * from migrations order by nom;
