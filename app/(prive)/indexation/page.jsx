"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Card, Field, Badge, DataTable, Bandeau, Squelette, useRetour } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { rafraichir, useTable } from "@/lib/donnees";
import { useParamUrl } from "@/lib/etat-url";
import { eur, fdate, fmois, todayISO, calculRevision, prochaineOccurrence, revisionEnPeril, joursEntre, nombreOuNull, tableManquante } from "@/lib/helpers";

// Échéance de révision la plus récemment passée : la prochaine occurrence
// du jour-mois du bail, moins un an. Calcul sur la chaîne « AAAA-MM-JJ » :
// repasser par un objet Date rouvrirait la question du fuseau.
function derniereEcheance(lot) {
  const prochaine = prochaineOccurrence(lot.revision_jour_mois);
  if (!prochaine) return null;
  const [annee, mois, jour] = prochaine.split("-");
  return `${Number(annee) - 1}-${mois}-${jour}`;
}

// Les colonnes date_effet / rappel_montant arrivent avec la migration 05.
// Tant qu'elle n'est pas passée, Postgres refuse l'insertion sur une colonne
// inconnue : autant le dire en clair plutôt que de relayer son message.
function messageMigration(erreur) {
  return /date_effet|rappel_montant|schema cache/i.test(erreur?.message || "")
    ? "La migration 05 n'a pas encore été passée dans Supabase (colonnes date_effet / rappel_montant manquantes)."
    : null;
}

function IndexationInner() {
  const [saisies, setSaisies] = useState({});
  const [enCours, setEnCours] = useState(null);
  const { donnees: tousLots, chargement } = useTable("lots");
  const { donnees: historique, erreur } = useTable("indexations");
  const tableAbsente = tableManquante(erreur);
  // Un lot vacant n'a pas de loyer à réviser.
  const lots = useMemo(() => tousLots.filter((l) => l.type !== "vacant"), [tousLots]);
  // Lot visé par un lien du tableau de bord : on va le chercher dans la page
  // et on l'entoure, plutôt que de laisser retrouver la bonne carte à l'œil.
  const [cible] = useParamUrl("lot");
  const dejaDefile = useRef(false);
  const retour = useRetour();

  useEffect(() => {
    if (chargement || !cible || dejaDefile.current) return;
    dejaDefile.current = true;
    document.getElementById(`lot-${cible}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [chargement, cible]);

  function saisie(lotId) {
    return saisies[lotId] || { indice: "", periode: "", note: "", dateEffet: "", declarer: false, ancienLoyer: "" };
  }
  function majSaisie(lotId, patch) {
    setSaisies((s) => ({ ...s, [lotId]: { ...saisie(lotId), ...patch } }));
  }

  function calc(lot) {
    return calculRevision(lot.loyer_mensuel_ht, lot.indice_valeur, saisie(lot.id).indice);
  }

  // Rappel dû lorsque la révision prend effet avant d'être appliquée.
  //
  // Le loyer révisé court à partir de sa date d'effet, pas de la date à laquelle
  // on y pense : chaque mois écoulé entre les deux doit être régularisé.
  function rappel(lot) {
    const res = calc(lot);
    const dateEffet = saisie(lot.id).dateEffet;
    if (!res || !dateEffet) return null;
    const jours = joursEntre(dateEffet, todayISO());
    if (jours === null || jours <= 0) return null;
    const mois = Math.floor(jours / 30.44);
    if (mois < 1) return null;
    const parMois = res.nouveauLoyer - (lot.loyer_mensuel_ht || 0);
    if (parMois <= 0) return null;
    return { mois, parMois, total: Math.round(parMois * mois * 100) / 100 };
  }

  async function appliquer(lot) {
    const res = calc(lot);
    if (!res) return;
    const s = saisie(lot.id);
    const r = rappel(lot);
    setEnCours(lot.id);

    // On archive l'état d'avant AVANT d'écraser la fiche du lot.
    const { error: errHist } = await supabase.from("indexations").insert({
      lot_id: lot.id,
      date_application: todayISO(),
      indice_type: lot.indice_type,
      indice_ancien: lot.indice_valeur,
      indice_nouveau: parseFloat(s.indice),
      periode_ancienne: lot.indice_periode,
      periode_nouvelle: s.periode || null,
      loyer_avant: lot.loyer_mensuel_ht,
      loyer_apres: res.nouveauLoyer,
      date_effet: s.dateEffet || todayISO(),
      rappel_montant: r ? r.total : null,
      note: s.note || null,
    });
    if (errHist) {
      const mig = messageMigration(errHist);
      if (mig) retour.echec(mig); else retour.echec("La révision n'a pas été enregistrée", errHist);
      setEnCours(null);
      return;
    }

    const { error: errLot } = await supabase.from("lots").update({
      loyer_mensuel_ht: res.nouveauLoyer,
      indice_valeur: parseFloat(s.indice),
      // La période de l'indice suivait l'ancienne valeur : sans cette mise à
      // jour, la fiche affichait un indice neuf avec une période périmée.
      indice_periode: s.periode || lot.indice_periode,
    }).eq("id", lot.id);

    // L'historique est écrit mais le loyer n'a pas suivi : le dire, sinon la
    // révision paraît appliquée alors que la fiche du lot est restée en arrière.
    if (errLot) {
      retour.echec(
        `Révision archivée, mais le loyer de ${lot.nom} n'a pas été mis à jour — à reprendre depuis la fiche du lot`,
        errLot,
      );
      setEnCours(null);
      rafraichir("indexations");
      return;
    }

    retour.succes(`${lot.nom} — loyer porté à ${eur(res.nouveauLoyer)}`);
    setSaisies((st) => ({ ...st, [lot.id]: { indice: "", periode: "", note: "", dateEffet: "", declarer: false, ancienLoyer: "" } }));
    setEnCours(null);
    rafraichir("indexations", "lots");
  }

  // Archive une révision faite avant l'existence de cet écran : elle fait taire
  // l'alerte « révision perdue » sans toucher au loyer, qui est déjà à jour.
  async function declarerRevisionPassee(lot) {
    const s = saisie(lot.id);
    if (!s.dateEffet) { retour.echec("Indiquez la date à laquelle la révision a été appliquée."); return; }
    setEnCours(lot.id);
    const ancien = nombreOuNull(s.ancienLoyer);
    const { error } = await supabase.from("indexations").insert({
      lot_id: lot.id,
      date_application: s.dateEffet,
      date_effet: s.dateEffet,
      indice_type: lot.indice_type,
      indice_ancien: ancien !== null ? null : lot.indice_valeur,
      indice_nouveau: lot.indice_valeur,
      periode_ancienne: null,
      periode_nouvelle: lot.indice_periode,
      loyer_avant: ancien,
      loyer_apres: lot.loyer_mensuel_ht,
      note: s.note ? `Déclarée a posteriori — ${s.note}` : "Révision déclarée a posteriori, loyer déjà à jour",
    });
    setEnCours(null);
    if (error) {
      const mig = messageMigration(error);
      if (mig) retour.echec(mig); else retour.echec("La déclaration n'a pas été enregistrée", error);
      return;
    }
    retour.succes(`${lot.nom} — révision du ${fdate(s.dateEffet)} déclarée`);
    setSaisies((st) => ({ ...st, [lot.id]: { indice: "", periode: "", note: "", dateEffet: "", declarer: false, ancienLoyer: "" } }));
    rafraichir("indexations");
  }

  if (chargement) return <Squelette cartes={3} />;

  if (tableAbsente) {
    return (
      <Card className="border-amber-200">
        <h2 className="font-serif text-lg mb-2">Migration à exécuter</h2>
        <p className="text-sm text-amber-900">
          La table <code>indexations</code> n'existe pas encore. Ouvrez Supabase &gt; SQL Editor &gt;
          New query, collez le contenu de <code>supabase/migration-02-indexations-et-documents.sql</code>,
          puis cliquez sur Run et rechargez cette page.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-emerald-50 border-emerald-200">
        <p className="text-sm text-emerald-900">
          Formule : nouveau loyer = loyer actuel × (nouvel indice publié ÷ indice de base du bail).
          Chaque révision validée est archivée : vous gardez la trace de l'évolution du loyer, et de
          quoi la justifier en cas de contestation.
        </p>
      </Card>

      {lots.map((lot) => {
        const res = calc(lot);
        const rap = rappel(lot);
        const s = saisie(lot.id);
        const h = historique.filter((x) => x.lot_id === lot.id);
        const echeance = derniereEcheance(lot);
        const appliquee = echeance ? h.some((x) => x.date_application >= echeance) : true;
        const peril = appliquee ? null : revisionEnPeril(echeance, todayISO());

        return (
          <Card
            key={lot.id}
            id={`lot-${lot.id}`}
            className={`scroll-mt-4 ${cible === lot.id ? "ring-2 ring-emerald-300" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-serif text-lg">{lot.nom}</p>
                <p className="text-sm text-stone-500">
                  Indice {lot.indice_type || "—"} de base : {lot.indice_valeur ?? "à renseigner"} ({lot.indice_periode || "—"})
                </p>
                {lot.indice_note && <p className="text-xs text-amber-700 mt-1">{lot.indice_note}</p>}
              </div>
              <p className="text-right font-medium shrink-0">{eur(lot.loyer_mensuel_ht)} / mois</p>
            </div>

            {peril && (
              <div className={`mt-3 rounded p-2 text-sm ${peril === "perdue" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                {peril === "perdue"
                  ? `Révision du ${fdate(echeance)} jamais appliquée : passé un an, elle ne peut plus être réclamée.`
                  : `Révision du ${fdate(echeance)} non appliquée. Elle sera définitivement perdue un an après cette date.`}
              </div>
            )}

            <div className="mt-3 grid md:grid-cols-3 gap-3">
              <Field label={`Nouvel indice ${lot.indice_type || ""} publié`}>
                <input type="number" step="0.01" className="w-full border border-stone-300 rounded px-2 py-1"
                  value={s.indice} onChange={(e) => majSaisie(lot.id, { indice: e.target.value })} />
              </Field>
              <Field label="Période du nouvel indice">
                <input className="w-full border border-stone-300 rounded px-2 py-1" placeholder="Ex. T2 2025"
                  value={s.periode} onChange={(e) => majSaisie(lot.id, { periode: e.target.value })} />
              </Field>
              <Field label="Date d'effet">
                <input type="date" className="w-full border border-stone-300 rounded px-2 py-1"
                  value={s.dateEffet} onChange={(e) => majSaisie(lot.id, { dateEffet: e.target.value })} />
              </Field>
              <Field label="Note (facultatif)">
                <input className="w-full border border-stone-300 rounded px-2 py-1"
                  value={s.note} onChange={(e) => majSaisie(lot.id, { note: e.target.value })} />
              </Field>
            </div>

            {res && (
              <div className="mt-3 text-sm flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>Nouveau loyer : <span className="font-medium">{eur(res.nouveauLoyer)}</span></span>
                <span className={res.variation >= 0 ? "text-emerald-700" : "text-red-700"}>
                  {res.variation >= 0 ? "+" : ""}{res.variation.toFixed(2)} %
                </span>
                <span className="text-stone-500">soit {eur(res.nouveauLoyer - lot.loyer_mensuel_ht)} / mois</span>
              </div>
            )}

            {rap && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-900">
                <p className="font-medium">Rappel à régulariser : {eur(rap.total)}</p>
                <p className="mt-1">
                  La révision prend effet le {fdate(s.dateEffet)}, soit {rap.mois} mois écoulés à
                  {" "}{eur(rap.parMois)} d'écart. Ce montant est archivé avec la révision ; il reste à
                  l'encaisser, par exemple en l'ajoutant au prochain appel de loyer.
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-col md:flex-row md:items-center gap-2">
              <button disabled={!res || enCours === lot.id} onClick={() => appliquer(lot)}
                className="w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-30">
                {enCours === lot.id ? "Enregistrement…" : "Valider la révision"}
              </button>
              <button onClick={() => majSaisie(lot.id, { declarer: !s.declarer })}
                className="w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded border border-stone-300 text-stone-700 text-sm">
                {s.declarer ? "Annuler la déclaration" : "Déclarer une révision déjà appliquée"}
              </button>
            </div>

            {s.declarer && (
              <div className="mt-3 border border-stone-200 rounded p-3 bg-stone-50">
                <p className="text-sm text-stone-600">
                  À utiliser pour une révision faite avant l'existence de cet écran : elle est
                  archivée à la date indiquée, et le loyer du lot n'est pas touché — il est déjà à jour.
                  Renseignez la <span className="font-medium">date d'effet</span> ci-dessus.
                </p>
                <div className="mt-3 grid md:grid-cols-2 gap-3">
                  <Field label="Loyer avant cette révision (facultatif)">
                    <input type="number" step="0.01" className="w-full border border-stone-300 rounded px-2 py-1"
                      placeholder="laisser vide si inconnu"
                      value={s.ancienLoyer} onChange={(e) => majSaisie(lot.id, { ancienLoyer: e.target.value })} />
                  </Field>
                </div>
                <button disabled={!s.dateEffet || enCours === lot.id} onClick={() => declarerRevisionPassee(lot)}
                  className="mt-3 w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-stone-700 text-white text-sm disabled:opacity-30">
                  {enCours === lot.id ? "Enregistrement…" : "Archiver cette révision"}
                </button>
              </div>
            )}

            {h.length > 0 && (
              <div className="mt-4 pt-4 border-t border-stone-100">
                <p className="text-xs text-stone-500 uppercase tracking-wide mb-2">Historique des révisions</p>
                <DataTable
                  columns={[
                    { key: "date", label: "Appliquée le" },
                    { key: "indice", label: "Indice" },
                    { key: "loyer", label: "Loyer" },
                    { key: "variation", label: "Variation" },
                    { key: "rappel", label: "Rappel" },
                  ]}
                  rows={h.map((x) => {
                    const v = x.loyer_avant ? ((x.loyer_apres - x.loyer_avant) / x.loyer_avant) * 100 : null;
                    return {
                      key: x.id,
                      cells: {
                        date: fdate(x.date_application),
                        indice: `${x.indice_ancien ?? "—"} → ${x.indice_nouveau ?? "—"}${x.periode_nouvelle ? ` (${x.periode_nouvelle})` : ""}`,
                        loyer: `${eur(x.loyer_avant)} → ${eur(x.loyer_apres)}`,
                        variation: v === null ? "—" : (
                          <Badge tone={v >= 0 ? "green" : "red"}>{v >= 0 ? "+" : ""}{v.toFixed(2)} %</Badge>
                        ),
                        rappel: x.rappel_montant ? eur(x.rappel_montant) : "—",
                      },
                    };
                  })}
                />
              </div>
            )}
          </Card>
        );
      })}
      <Bandeau retour={retour} />
    </div>
  );
}

export default function Page() {
  // useSearchParams lit l'adresse au moment du rendu : Next exige une frontière
  // de suspension autour du composant qui s'en sert.
  return (
    <Suspense fallback={<p className="text-stone-500">Chargement…</p>}>
      <IndexationInner />
    </Suspense>
  );
}
