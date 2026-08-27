-- Schéma de la base de données "Gestion locative 1 bd Clémenceau, Binic"
-- À exécuter dans Supabase : Project > SQL Editor > New query > coller > Run

create extension if not exists "pgcrypto";

-- ---------- TABLES ----------

create table if not exists lots (
  id text primary key,
  type text not null,                    -- commercial | résidentiel-vide | résidentiel-meublé | vacant
  localisation text,
  nom text,
  locataire text,
  ancien_locataire text,
  date_depart date,
  siret text,
  surface numeric,
  surface_note text,
  loyer_mensuel_ht numeric,
  tva_taux numeric,
  tva_note text,
  indice_type text,
  indice_valeur numeric,
  indice_periode text,
  indice_note text,
  revision_jour_mois text,               -- format 'JJ-MM'
  periodicite_facturation text,          -- mensuelle | trimestrielle
  facturation_note text,
  debut_bail date,
  fin_bail date,
  depot_garantie numeric,
  avance_eau numeric default 0,
  compteur_id text,
  provision_note text,
  incomplet text[] default '{}',
  updated_at timestamptz default now()
);

create table if not exists releves_eau (
  id uuid primary key default gen_random_uuid(),
  compteur_id text not null,
  date date not null,
  index_value numeric not null,
  created_at timestamptz default now()
);

create table if not exists paiements (
  id uuid primary key default gen_random_uuid(),
  lot_id text references lots(id) on delete set null,
  periode text not null,                 -- format 'YYYY-MM'
  attendu numeric,
  montant numeric,
  date_paiement date,
  note text,
  created_at timestamptz default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  type text not null,                    -- facture | quittance
  lot_id text references lots(id) on delete set null,
  periode text,
  numero text,
  date_emission date,
  texte text,
  fichier_path text,                     -- chemin dans le bucket Storage "documents", si scanné/PDF joint
  created_at timestamptz default now()
);

create table if not exists doc_counters (
  type text primary key,                 -- 'facture' | 'quittance'
  compteur int default 0
);
insert into doc_counters (type, compteur) values ('facture', 3), ('quittance', 0)
  on conflict (type) do nothing;

create table if not exists taxe_fonciere (
  id int primary key default 1,
  annee int,
  montant_annuel numeric,
  quote_part text
);
insert into taxe_fonciere (id, annee, montant_annuel, quote_part)
  values (1, 2025, 2284, '1/4 par local commercial')
  on conflict (id) do nothing;

create table if not exists eau_tarifs (
  id int primary key default 1,
  prix_m3 numeric,
  abonnement_annuel numeric,
  nombre_parts int
);
insert into eau_tarifs (id, prix_m3, abonnement_annuel, nombre_parts)
  values (1, 5.5, 70, 4)
  on conflict (id) do nothing;

create table if not exists bailleur (
  id int primary key default 1,
  nom text,
  adresse text,
  siret text,
  tva_intra text
);
insert into bailleur (id, nom, adresse, siret, tva_intra)
  values (1, 'Georges Le Gonidec', '56 rue Saulnier de St Jouan, 22520 Binic-Étables-sur-Mer', '', '')
  on conflict (id) do nothing;

-- ---------- SÉCURITÉ (RLS) ----------
-- Seules les personnes connectées (vous et Baptiste, comptes créés manuellement
-- dans Supabase > Authentication) peuvent lire/écrire. Personne d'autre n'a accès,
-- et il n'y a pas d'auto-inscription publique.

alter table lots enable row level security;
alter table releves_eau enable row level security;
alter table paiements enable row level security;
alter table documents enable row level security;
alter table doc_counters enable row level security;
alter table taxe_fonciere enable row level security;
alter table eau_tarifs enable row level security;
alter table bailleur enable row level security;

create policy "authentifie_tout" on lots for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authentifie_tout" on releves_eau for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authentifie_tout" on paiements for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authentifie_tout" on documents for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authentifie_tout" on doc_counters for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authentifie_tout" on taxe_fonciere for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authentifie_tout" on eau_tarifs for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy "authentifie_tout" on bailleur for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ---------- DONNÉES INITIALES : les 5 lots ----------

insert into lots (id, type, localisation, nom, locataire, siret, surface, loyer_mensuel_ht, tva_taux, tva_note,
  indice_type, indice_valeur, indice_periode, indice_note, revision_jour_mois, periodicite_facturation, facturation_note,
  debut_bail, fin_bail, depot_garantie, avance_eau, compteur_id, provision_note, incomplet) values
('commerce1', 'commercial', 'Rez-de-chaussée — local 1', 'CFR Auto École', 'Mme Feuvrier', '', 56,
  681, 20, 'Assujetti 20% — statut à réexaminer au 1/2/2027',
  'ICC', 2056, 'T3 2025', 'Le prochain bail (renouvellement) devra être indexé sur l''ILC', '01-02', 'trimestrielle',
  'Facturé par trimestre (2043€ HT + 409€ TVA = 2452€ TTC), encaissé en 3 mensualités de 817€ TTC',
  '2021-02-01', '2027-01-31', 1170, 0, 'commerce1',
  '1/4 de la taxe foncière (571€/an) + eau — à instaurer, pas encore facturé',
  array['SIRET à demander']),
('commerce2', 'commercial', 'Rez-de-chaussée — local 2', 'Funambule', 'Mme Bousselin Mélanie', '', 60,
  800, 0, 'Non assujetti à la TVA depuis le 1/1/2026 — solde de 160€ de TVA encore dû sur décembre 2025',
  'ILC', 128.68, 'T1 2023', '', '01-04', 'trimestrielle',
  'Facturé par trimestre (800×3 = 2400€), encaissé en 3 mensualités de 800€',
  '2025-04-01', null, null, 0, 'commerce2',
  '1/4 taxe foncière déjà facturé pour 2025 (428€ prorata) — 571€/an en année pleine',
  array['SIRET à demander', 'Encaisser le solde de TVA de 160€ dû sur décembre 2025']),
('vide1', 'résidentiel-vide', '1er étage', 'Location vide — 1 bd Clémenceau, Binic', 'Mme Laudrin Annie', '', 75,
  809, null, '',
  'IRL', 146.6, 'T1 2026', '', '01-05', 'mensuelle', null,
  null, null, null, 18, 'vide1',
  'Rappel dû : révision du 1/5/2026 notifiée le 28/7/2026 seulement — 3 à 4 mois de rappel à régulariser',
  array['Avance eau confirmée à 18€ (une mention antérieure indiquait 7€)']),
('meuble1', 'résidentiel-meublé', '2ème étage — appartement B20', 'Location meublée (25 m²)', 'Mme Marion Dazord (B20)', '', 25,
  530, null, '',
  'IRL', null, 'T3 2025', 'Valeur de l''IRL T3 2025 non renseignée — à compléter', '01-09', 'mensuelle', null,
  null, null, null, 30, 'b20',
  'Avances mensuelles historiquement variables (13€ à 30,5€ selon les mois) plutôt qu''un forfait fixe',
  array['Valeur IRL T3 2025 à renseigner']),
('vacant1', 'vacant', '2ème étage — appartement B19', 'Logement vacant (10 m²) — ex-B19', null, '', 10,
  null, null, '',
  null, null, '', '', null, null, null,
  null, null, null, 0, 'b19',
  'M. Nouar a cessé de payer et a quitté les lieux le 1/2/2026, logement dégradé — remise en état nécessaire',
  array['Chiffrer la remise en état', 'Décider du financement (père usufruitier ou fils nu-propriétaire)', 'Recouvrement des loyers impayés auprès de M. Nouar'])
on conflict (id) do nothing;

-- Ancien locataire de B19
update lots set ancien_locataire = 'M. Mohamed Nouar', date_depart = '2026-02-01' where id = 'vacant1';

-- ---------- RELEVÉS D'EAU CONNUS ----------

insert into releves_eau (compteur_id, date, index_value) values
('vide1', '2024-12-25', 1798), ('vide1', '2025-12-29', 1825),
('b19', '2024-12-25', 1428), ('b19', '2025-12-29', 1461),
('b20', '2024-12-25', 1259), ('b20', '2025-12-29', 1276),
('commerce1', '2024-12-25', 1051), ('commerce1', '2025-12-29', 1069),
('commerce2', '2024-12-25', 437), ('commerce2', '2025-04-01', 459), ('commerce2', '2025-12-29', 467),
('general', '2024-12-25', 2347), ('general', '2025-12-29', 2463);

-- ---------- HISTORIQUE DE PAIEMENTS / DOCUMENTS CONNUS ----------

insert into paiements (lot_id, periode, attendu, montant, date_paiement, note) values
('commerce2', '2025-12', 960, 800, '2025-12-01', 'Solde de TVA de 160€ (décembre 2025, avant changement de régime au 1/1/2026) resté impayé');

insert into documents (type, lot_id, periode, numero, date_emission, texte) values
('facture', 'commerce2', '2025 (quote-part taxe foncière)', 'F101025', '2025-10-10',
 'FACTURE F101025 (historique)\n\nMme BOUSSELIN « Funambule »\nRemboursement quote-part taxe foncière 2025 : 2284€ × 1/4 × 9/12ème = 428,00€'),
('facture', 'commerce2', '2026-T1', '010126', '2026-01-01',
 'FACTURE 01 01 26 (historique)\n\nLoyer du 1er trimestre 2026 : 800€ × 3 = 2400€. Solde de TVA de 160€ sur décembre 2025 encore dû.'),
('facture', 'commerce1', '2026-T2', '010426', '2026-04-01',
 'FACTURE 01 04 26 (historique)\n\nLoyer du 2ème trimestre 2026 : 681€ × 3 = 2043€ HT + TVA 20% = 409€, total 2452€ TTC.');
