-- Migration 02 — Historique d'indexation, documents à durée de validité
-- À exécuter dans Supabase : Project > SQL Editor > New query > coller > Run
-- Idempotente : la rejouer ne casse rien et ne touche aucune donnée existante.

-- ---------- HISTORIQUE DES RÉVISIONS DE LOYER ----------
-- Jusqu'ici, valider une révision écrasait l'indice et le loyer sans laisser
-- de trace : aucun moyen de justifier l'évolution du loyer à un locataire.
create table if not exists indexations (
  id uuid primary key default gen_random_uuid(),
  lot_id text references lots(id) on delete cascade,
  date_application date not null,
  indice_type text,
  indice_ancien numeric,
  indice_nouveau numeric,
  periode_ancienne text,
  periode_nouvelle text,
  loyer_avant numeric,
  loyer_apres numeric,
  note text,
  created_at timestamptz default now()
);

create index if not exists indexations_lot_idx on indexations (lot_id, date_application desc);

alter table indexations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'indexations' and policyname = 'authentifie_tout'
  ) then
    create policy "authentifie_tout" on indexations
      for all using (auth.uid() is not null) with check (auth.uid() is not null);
  end if;
end $$;

-- ---------- DOCUMENTS À DURÉE DE VALIDITÉ ----------
-- La table ne servait qu'aux factures et quittances. Elle accueille désormais
-- les baux, états des lieux et diagnostics, dont certains périment.
alter table documents add column if not exists titre text;
alter table documents add column if not exists date_expiration date;

create index if not exists documents_expiration_idx on documents (date_expiration)
  where date_expiration is not null;
