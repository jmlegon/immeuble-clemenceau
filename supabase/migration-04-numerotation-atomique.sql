-- Migration 04 — Numérotation atomique des factures et quittances
-- À exécuter dans Supabase : Project > SQL Editor > New query > coller > Run
-- Idempotente : la rejouer ne casse rien.
--
-- L'application lisait le compteur, ajoutait 1, puis le réécrivait — en trois
-- appels séparés. Deux onglets ouverts, ou un double appui sur « Générer »,
-- produisaient deux documents portant le même numéro. La numérotation continue,
-- chronologique et sans doublon est une obligation (art. 242 nonies A du CGI).
--
-- Un seul UPDATE ... RETURNING règle le cas : Postgres verrouille la ligne le
-- temps de l'opération, deux appels simultanés obtiennent donc deux numéros.

create or replace function prochain_numero_document(p_type text)
returns int
language plpgsql
as $$
declare
  v_compteur int;
begin
  -- Pas de SECURITY DEFINER : la fonction s'exécute avec les droits de
  -- l'appelant, donc le RLS de doc_counters continue de s'appliquer et seul
  -- un compte connecté peut avancer le compteur.
  update doc_counters
     set compteur = compteur + 1
   where type = p_type
  returning compteur into v_compteur;

  if v_compteur is null then
    raise exception 'Type de document inconnu ou non autorisé : %', p_type;
  end if;

  return v_compteur;
end;
$$;

revoke all on function prochain_numero_document(text) from public;
grant execute on function prochain_numero_document(text) to authenticated;

-- ---------- VÉRIFICATION ----------
-- Doit renvoyer deux entiers qui se suivent. Attention : cet appel consomme
-- deux numéros de facture — à ne lancer que sur une base de test, ou en
-- acceptant le trou dans la numérotation.
--
--   select prochain_numero_document('facture'), prochain_numero_document('facture');
