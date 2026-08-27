"use client";
import { Suspense, useMemo, useState } from "react";
import { Card, Field, Badge, DataTable, Bandeau, DialogueSuppression, Squelette, Volet, useRetour } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { rafraichir, useTable } from "@/lib/donnees";
import { useMajParams, useParamUrl } from "@/lib/etat-url";
import { eur, fmois, todayISO, moisCourant, montantAttendu, loyerALaPeriode } from "@/lib/helpers";

function PaiementsInner() {
  const [montant, setMontant] = useState("");
  const [datePaiement, setDatePaiement] = useState(todayISO());
  const [note, setNote] = useState("");
  // Lot et période viennent de l'adresse : « Montant différent… » depuis le
  // tableau de bord arrive ici sur le bon lot et le bon mois, sans les
  // resélectionner. Les filtres de l'historique en font autant, et survivent
  // donc au retour arrière.
  const [lotUrl, setLotUrl] = useParamUrl("lot");
  const [periodeUrl] = useParamUrl("periode");
  const [periode, setPeriode] = useParamUrl("periode", moisCourant());
  const [filtreLot, setFiltreLot] = useParamUrl("filtre_lot");
  const [filtreAnnee, setFiltreAnnee] = useParamUrl("annee");
  const majParams = useMajParams();
  const [enregistrement, setEnregistrement] = useState(false);
  const [aSupprimer, setASupprimer] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const retour = useRetour();

  const { donnees: tousLots, chargement } = useTable("lots");
  const { donnees: paiements } = useTable("paiements");
  // Sert à retrouver le loyer en vigueur à la période saisie. Si la migration 02
  // n'est pas passée, la liste reste vide et c'est le loyer courant qui s'applique.
  const { donnees: indexations } = useTable("indexations");
  // On ne saisit pas de loyer sur un lot vacant : la liste s'arrête aux occupés.
  const lots = useMemo(() => tousLots.filter((l) => l.type !== "vacant"), [tousLots]);

  // Sans lot dans l'adresse, le premier de la liste — comme avant. Un
  // identifiant inconnu (adresse tapée à la main, lot supprimé depuis) est
  // ignoré : la liste déroulante afficherait le premier lot pendant que le
  // formulaire en viserait un autre, et l'enregistrement partirait à côté.
  // Arrivé par « Montant différent… », on vient pour saisir : le volet s'ouvre.
  const ouvertParLien = !!periodeUrl;
  const lotConnu = lots.some((l) => l.id === lotUrl);
  const lotId = lotConnu ? lotUrl : lots[0]?.id || "";
  const lot = lots.find((l) => l.id === lotId);
  const indexationsDuLot = indexations.filter((x) => x.lot_id === lotId);
  // Le loyer d'alors, pas celui d'aujourd'hui : sans quoi un règlement saisi
  // après une révision passait en impayé partiel.
  const attendu = lot ? montantAttendu(lot, indexationsDuLot, periode) : 0;
  const loyerPeriode = lot ? loyerALaPeriode(lot, indexationsDuLot, periode) : 0;
  const loyerRevise = lot && Math.abs(loyerPeriode - (lot.loyer_mensuel_ht || 0)) > 0.005;

  async function ajouter() {
    if (!lotId || !periode || !montant) {
      retour.echec("Renseignez le lot, la période et le montant versé.");
      return;
    }
    setEnregistrement(true);
    const { error } = await supabase.from("paiements")
      .insert({ lot_id: lotId, periode, attendu, montant: parseFloat(montant), date_paiement: datePaiement, note: note || null });
    setEnregistrement(false);
    if (error) {
      retour.echec("Le paiement n'a pas été enregistré", error);
      return;
    }
    retour.succes(`Paiement de ${fmois(periode)} enregistré`);
    setMontant("");
    setNote("");
    rafraichir("paiements");
  }

  async function confirmerSuppression() {
    setSuppressionEnCours(true);
    const { error } = await supabase.from("paiements").delete().eq("id", aSupprimer.id);
    setSuppressionEnCours(false);
    if (error) {
      retour.echec("Le paiement n'a pas été supprimé", error);
      setASupprimer(null);
      return;
    }
    retour.succes("Paiement supprimé");
    setASupprimer(null);
    rafraichir("paiements");
  }

  if (chargement) return <Squelette cartes={2} />;

  const lotSupprime = aSupprimer ? lots.find((l) => l.id === aSupprimer.lot_id) : null;
  const anneesPaiements = [...new Set(paiements.map((p) => (p.periode || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  // Même prudence pour les filtres : une valeur absente des listes déroulantes
  // viderait l'historique en affichant « Tous les lots ».
  const filtreLotActif = lots.some((l) => l.id === filtreLot) ? filtreLot : "";
  const filtreAnneeActif = anneesPaiements.includes(filtreAnnee) ? filtreAnnee : "";
  const paiementsFiltres = paiements.filter((p) =>
    (!filtreLotActif || p.lot_id === filtreLotActif)
    && (!filtreAnneeActif || (p.periode || "").startsWith(filtreAnneeActif)));

  return (
    <div className="space-y-4">
      <Volet titre="Enregistrer un paiement" defautOuvert={ouvertParLien}>
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Lot">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={lotId} onChange={(e) => setLotUrl(e.target.value)}>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
          </Field>
          <Field label="Mois (période)">
            <input type="month" className="w-full border border-stone-300 rounded px-2 py-1" value={periode} onChange={(e) => setPeriode(e.target.value)} />
          </Field>
          <Field label="Date de paiement">
            <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" value={datePaiement} onChange={(e) => setDatePaiement(e.target.value)} />
          </Field>
          <Field label="Montant versé (€)">
            <input type="number" step="0.01" className="w-full border border-stone-300 rounded px-2 py-1" value={montant} onChange={(e) => setMontant(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Note (facultatif)">
            <input className="w-full border border-stone-300 rounded px-2 py-1" value={note}
              placeholder="Ex. versement partiel, solde de TVA restant dû"
              onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <p className="text-xs text-stone-500 mt-2">
          Montant attendu : {eur(attendu)} (loyer {lot?.tva_taux ? "TTC" : "HT"} + avance/provision)
        </p>
        {loyerRevise && (
          <p className="text-xs text-amber-700 mt-1">
            Calculé sur le loyer en vigueur en {fmois(periode)} ({eur(loyerPeriode)}), et non sur le
            loyer actuel ({eur(lot.loyer_mensuel_ht)}) : une révision est intervenue depuis.
          </p>
        )}
        <button onClick={ajouter} disabled={enregistrement}
          className="mt-3 w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
          {enregistrement ? "Enregistrement…" : "Enregistrer"}
        </button>
      </Volet>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg">Historique</h2>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select className="flex-1 min-w-0 md:flex-none border border-stone-300 rounded px-2 py-1 text-sm" value={filtreLotActif}
              onChange={(e) => setFiltreLot(e.target.value)} aria-label="Filtrer par lot">
              <option value="">Tous les lots</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
            <select className="flex-1 min-w-0 md:flex-none border border-stone-300 rounded px-2 py-1 text-sm" value={filtreAnneeActif}
              onChange={(e) => setFiltreAnnee(e.target.value)} aria-label="Filtrer par année">
              <option value="">Toutes les années</option>
              {anneesPaiements.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        {(filtreLotActif || filtreAnneeActif) && (
          <p className="text-xs text-stone-500 mb-2">
            {paiementsFiltres.length} ligne(s) sur {paiements.length}.{" "}
            <button onClick={() => majParams({ filtre_lot: null, annee: null })} className="text-emerald-700 underline">
              Tout afficher
            </button>
          </p>
        )}
        <DataTable
          empty="Aucun paiement enregistré."
          columns={[
            { key: "lot", label: "Lot" },
            { key: "periode", label: "Période" },
            { key: "attendu", label: "Attendu" },
            { key: "verse", label: "Versé" },
            { key: "statut", label: "Statut" },
            { key: "note", label: "Note" },
            { key: "suppr", label: "", action: true },
          ]}
          rows={paiementsFiltres.map((p) => {
            const l = lots.find((x) => x.id === p.lot_id);
            const diff = p.montant - p.attendu;
            const tone = Math.abs(diff) < 0.01 ? "green" : diff > 0 ? "amber" : "red";
            const label = Math.abs(diff) < 0.01 ? "payé" : diff > 0 ? "avance" : "impayé partiel";
            return {
              key: p.id,
              cells: {
                lot: l?.nom || p.lot_id,
                periode: fmois(p.periode),
                attendu: eur(p.attendu),
                verse: eur(p.montant),
                statut: <Badge tone={tone}>{label}</Badge>,
                note: p.note ? <span className="text-stone-600">{p.note}</span> : "—",
                suppr: (
                  <button onClick={() => setASupprimer(p)} aria-label="Supprimer ce paiement" className="text-stone-500 hover:text-red-600 p-1">✕</button>
                ),
              },
            };
          })}
        />
      </Card>

      <DialogueSuppression
        cible={aSupprimer}
        titre="Supprimer ce paiement ?"
        description={aSupprimer
          ? `${lotSupprime?.nom || aSupprimer.lot_id} — ${fmois(aSupprimer.periode)}, ${eur(aSupprimer.montant)} versés.`
          : ""}
        enCours={suppressionEnCours}
        onConfirmer={confirmerSuppression}
        onAnnuler={() => setASupprimer(null)}
      />
      <Bandeau retour={retour} />
    </div>
  );
}

export default function Page() {
  // useSearchParams lit l'adresse au moment du rendu : Next exige une frontière
  // de suspension autour du composant qui s'en sert.
  return (
    <Suspense fallback={<p className="text-stone-500">Chargement…</p>}>
      <PaiementsInner />
    </Suspense>
  );
}
