-- Migration 03 — Politiques d'accès au bucket « documents »
-- À exécuter dans Supabase : Project > SQL Editor > New query > coller > Run
-- Idempotente : la rejouer ne casse rien et ne touche aucun fichier.
--
-- Le schéma initial activait le RLS et écrivait une politique pour chacune des
-- dix tables, mais aucune pour storage.objects. Sur un bucket privé, tant que
-- ces politiques n'existent pas, un compte authentifié ne peut ni téléverser ni
-- relire un fichier : les écrans « Dépenses » (justificatif) et « Documents »
-- (archivage, ouverture d'un PDF) échouent sur une erreur RLS.

-- ---------- LE BUCKET ----------
-- Créé ici s'il ne l'a pas été à la main. public = false : aucun fichier n'est
-- accessible par URL publique, seulement via une URL signée à durée limitée.
insert into storage.buckets (id, name, public)
  values ('documents', 'documents', false)
  on conflict (id) do nothing;

-- Si le bucket avait été créé public par erreur, on le repasse en privé.
update storage.buckets set public = false where id = 'documents' and public;

-- ---------- POLITIQUES ----------
-- Même règle que pour les tables : toute personne connectée (vous et Baptiste)
-- a accès, personne d'autre. Il n'y a pas d'inscription publique.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'documents_authentifie_lecture'
  ) then
    create policy "documents_authentifie_lecture" on storage.objects
      for select using (bucket_id = 'documents' and auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'documents_authentifie_ajout'
  ) then
    create policy "documents_authentifie_ajout" on storage.objects
      for insert with check (bucket_id = 'documents' and auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'documents_authentifie_maj'
  ) then
    create policy "documents_authentifie_maj" on storage.objects
      for update using (bucket_id = 'documents' and auth.uid() is not null)
      with check (bucket_id = 'documents' and auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'documents_authentifie_suppression'
  ) then
    create policy "documents_authentifie_suppression" on storage.objects
      for delete using (bucket_id = 'documents' and auth.uid() is not null);
  end if;
end $$;

-- ---------- VÉRIFICATION ----------
-- Doit renvoyer 4 lignes. Si elle en renvoie 0, la migration n'a pas été jouée ;
-- si elle en renvoie moins de 4, une politique a été supprimée entre-temps.
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'documents_authentifie_%'
order by policyname;
