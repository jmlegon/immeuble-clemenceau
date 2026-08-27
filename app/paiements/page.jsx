"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Field, Badge } from "@/components/Shell";
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
        <button onClick={ajouter} className="mt-3 px-3 py-1.5 rounded bg-slate-900 text-white text-sm">Enregistrer</button>
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Historique</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-stone-500 border-b border-stone-200">
              <th className="py-1">Lot</th><th>Période</th><th>Attendu</th><th>Versé</th><th>Statut</th><th></th>
            </tr>
          </thead>
          <tbody>
            {paiements.map((p) => {
              const l = lots.find((x) => x.id === p.lot_id);
              const diff = p.montant - p.attendu;
              const tone = Math.abs(diff) < 0.01 ? "green" : diff > 0 ? "amber" : "red";
              const label = Math.abs(diff) < 0.01 ? "payé" : diff > 0 ? "avance" : "impayé partiel";
              return (
                <tr key={p.id} className="border-b border-stone-100">
                  <td className="py-1.5">{l?.nom || p.lot_id}</td>
                  <td>{p.periode}</td>
                  <td>{eur(p.attendu)}</td>
                  <td>{eur(p.montant)}</td>
                  <td><Badge tone={tone}>{label}</Badge></td>
                  <td><button onClick={() => supprimer(p.id)} className="text-stone-400 hover:text-red-600">✕</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
