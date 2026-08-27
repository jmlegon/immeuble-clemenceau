"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Field, Badge, DataTable } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur, todayISO } from "@/lib/helpers";

function PaiementsInner() {
  const [lots, setLots] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [lotId, setLotId] = useState("");
  const [periode, setPeriode] = useState(todayISO().slice(0, 7));
  const [montant, setMontant] = useState("");
  const [datePaiement, setDatePaiement] = useState(todayISO());
  const [chargement, setChargement] = useState(true);

  async function charger() {
    const { data: lotsData } = await supabase.from("lots").select("*").neq("type", "vacant").order("id");
    const { data: paiementsData } = await supabase.from("paiements").select("*").order("periode", { ascending: false });
    setLots(lotsData || []);
    setPaiements(paiementsData || []);
    if (lotsData && lotsData.length && !lotId) setLotId(lotsData[0].id);
    setChargement(false);
  }
  useEffect(() => { charger(); }, []);

  const lot = lots.find((l) => l.id === lotId);
  const attendu = lot ? (lot.loyer_mensuel_ht || 0) * (1 + (lot.tva_taux || 0) / 100) + (lot.avance_eau || 0) : 0;

  async function ajouter() {
    if (!lotId || !periode || !montant) return;
    await supabase.from("paiements").insert({ lot_id: lotId, periode, attendu, montant: parseFloat(montant), date_paiement: datePaiement });
    setMontant("");
    charger();
  }

  async function supprimer(id) {
    await supabase.from("paiements").delete().eq("id", id);
    charger();
  }

  if (chargement) return <p className="text-stone-400">Chargement…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-serif text-lg mb-3">Enregistrer un paiement</h2>
        <div className="grid md:grid-cols-4 gap-3">
          <Field label="Lot">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={lotId} onChange={(e) => setLotId(e.target.value)}>
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
        <p className="text-xs text-stone-500 mt-2">Montant attendu : {eur(attendu)} (loyer {lot?.tva_taux ? "TTC" : "HT"} + avance/provision)</p>
        <button onClick={ajouter} className="mt-3 w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm">Enregistrer</button>
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Historique</h2>
        <DataTable
          empty="Aucun paiement enregistré."
          columns={[
            { key: "lot", label: "Lot" },
            { key: "periode", label: "Période" },
            { key: "attendu", label: "Attendu" },
            { key: "verse", label: "Versé" },
            { key: "statut", label: "Statut" },
            { key: "suppr", label: "", action: true },
          ]}
          rows={paiements.map((p) => {
            const l = lots.find((x) => x.id === p.lot_id);
            const diff = p.montant - p.attendu;
            const tone = Math.abs(diff) < 0.01 ? "green" : diff > 0 ? "amber" : "red";
            const label = Math.abs(diff) < 0.01 ? "payé" : diff > 0 ? "avance" : "impayé partiel";
            return {
              key: p.id,
              cells: {
                lot: l?.nom || p.lot_id,
                periode: p.periode,
                attendu: eur(p.attendu),
                verse: eur(p.montant),
                statut: <Badge tone={tone}>{label}</Badge>,
                suppr: (
                  <button onClick={() => supprimer(p.id)} aria-label="Supprimer ce paiement" className="text-stone-400 hover:text-red-600 p-1">✕</button>
                ),
              },
            };
          })}
        />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <Shell><PaiementsInner /></Shell>
    </AuthGuard>
  );
}
