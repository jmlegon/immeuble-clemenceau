"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Field, Badge, DataTable } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur, fdate, todayISO, calculRevision, prochaineOccurrence, revisionEnPeril } from "@/lib/helpers";

// Échéance de révision la plus récemment passée : la prochaine occurrence
// du jour-mois du bail, moins un an.
function derniereEcheance(lot) {
  const prochaine = prochaineOccurrence(lot.revision_jour_mois);
  if (!prochaine) return null;
  const d = new Date(prochaine + "T00:00:00");
  return `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function IndexationInner() {
  const [lots, setLots] = useState([]);
  const [historique, setHistorique] = useState([]);
  const [saisies, setSaisies] = useState({});
  const [chargement, setChargement] = useState(true);
  const [tableAbsente, setTableAbsente] = useState(false);
  const [enCours, setEnCours] = useState(null);

  async function charger() {
    const [{ data: l }, { data: h, error: hErr }] = await Promise.all([
      supabase.from("lots").select("*").neq("type", "vacant").order("id"),
      supabase.from("indexations").select("*").order("date_application", { ascending: false }),
    ]);
    if (hErr && /relation|does not exist|schema cache/i.test(hErr.message)) setTableAbsente(true);
    setLots(l || []);
    setHistorique(h || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, []);

  function saisie(lotId) {
    return saisies[lotId] || { indice: "", periode: "", note: "" };
  }
  function majSaisie(lotId, patch) {
    setSaisies((s) => ({ ...s, [lotId]: { ...saisie(lotId), ...patch } }));
  }

  function calc(lot) {
    return calculRevision(lot.loyer_mensuel_ht, lot.indice_valeur, saisie(lot.id).indice);
  }

  async function appliquer(lot) {
    const res = calc(lot);
    if (!res) return;
    const s = saisie(lot.id);
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
      note: s.note || null,
    });
    if (errHist) {
      alert("La révision n'a pas été enregistrée : " + errHist.message);
      setEnCours(null);
      return;
    }

    await supabase.from("lots").update({
      loyer_mensuel_ht: res.nouveauLoyer,
      indice_valeur: parseFloat(s.indice),
      // La période de l'indice suivait l'ancienne valeur : sans cette mise à
      // jour, la fiche affichait un indice neuf avec une période périmée.
      indice_periode: s.periode || lot.indice_periode,
    }).eq("id", lot.id);

    setSaisies((st) => ({ ...st, [lot.id]: { indice: "", periode: "", note: "" } }));
    setEnCours(null);
    charger();
  }

  if (chargement) return <p className="text-stone-400">Chargement…</p>;

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
        const s = saisie(lot.id);
        const h = historique.filter((x) => x.lot_id === lot.id);
        const echeance = derniereEcheance(lot);
        const appliquee = echeance ? h.some((x) => x.date_application >= echeance) : true;
        const peril = appliquee ? null : revisionEnPeril(echeance, todayISO());

        return (
          <Card key={lot.id}>
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

            <button disabled={!res || enCours === lot.id} onClick={() => appliquer(lot)}
              className="mt-3 w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-30">
              {enCours === lot.id ? "Enregistrement…" : "Valider la révision"}
            </button>

            {h.length > 0 && (
              <div className="mt-4 pt-4 border-t border-stone-100">
                <p className="text-xs text-stone-500 uppercase tracking-wide mb-2">Historique des révisions</p>
                <DataTable
                  columns={[
                    { key: "date", label: "Appliquée le" },
                    { key: "indice", label: "Indice" },
                    { key: "loyer", label: "Loyer" },
                    { key: "variation", label: "Variation" },
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
                      },
                    };
                  })}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <Shell><IndexationInner /></Shell>
    </AuthGuard>
  );
}
