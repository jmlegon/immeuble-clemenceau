-- Migration 01 — Dépenses, suivi des dépôts de garantie
-- À exécuter dans Supabase : Project > SQL Editor > New query > coller > Run
-- Sans effet si elle a déjà été passée : tout est idempotent, aucune donnée existante n'est touchée.

-- ---------- DÉPENSES ----------
-- lot_id null = dépense commune à l'immeuble (assurance, copropriété, taxe foncière…)
create table if not exists depenses (
  id uuid primary key default gen_random_uuid(),
  lot_id text references lots(id) on delete set null,
  date date not null,
  categorie text not null,
  libelle text,
  montant numeric not null,              -- TTC payé
  tva numeric default 0,                 -- TVA déductible incluse dans le montant, 0 si non récupérable
  deductible boolean default true,       -- déductible du résultat foncier / BIC
  fichier_path text,                     -- justificatif dans le bucket Storage "documents"
  note text,
  created_at timestamptz default now()
);

create index if not exists depenses_date_idx on depenses (date);
create index if not exists depenses_lot_idx on depenses (lot_id);

-- ---------- SUIVI DES DÉPÔTS DE GARANTIE ----------
-- Les colonnes depot_garantie / date_depart existaient déjà mais rien ne suivait
-- la restitution, dont le délai est légalement d'un à deux mois après le départ.
alter table lots add column if not exists depot_restitue_le date;
alter table lots add column if not exists depot_montant_restitue numeric;
alter table lots add column if not exists depot_retenues_note text;

-- ---------- SÉCURITÉ (RLS) ----------
alter table depenses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'depenses' and policyname = 'authentifie_tout'
  ) then
    create policy "authentifie_tout" on depenses
      for all using (auth.uid() is not null) with check (auth.uid() is not null);
  end if;
end $$;

-- ---------- REPRISE DE LA TAXE FONCIÈRE EXISTANTE ----------
-- La taxe foncière 2025 était figée dans sa propre table : on la bascule en
-- dépense commune pour qu'elle entre dans le calcul du résultat, sans doublon
-- si la migration est rejouée.
insert into depenses (lot_id, date, categorie, libelle, montant, tva, deductible, note)
select null,
       make_date(t.annee, 10, 15),
       'taxe_fonciere',
       'Taxe foncière ' || t.annee || ' — immeuble',
       t.montant_annuel,
       0,
       true,
       'Reprise automatique depuis la table taxe_fonciere (' || coalesce(t.quote_part, '') || ')'
from taxe_fonciere t
where t.montant_annuel is not null
  and not exists (
    select 1 from depenses d
    where d.categorie = 'taxe_fonciere'
      and extract(year from d.date) = t.annee
  );
