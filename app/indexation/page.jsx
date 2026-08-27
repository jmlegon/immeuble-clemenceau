"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Field } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/helpers";

function IndexationInner() {
  const [lots, setLots] = useState([]);
  const [nouvIndices, setNouvIndices] = useState({});
  const [chargement, setChargement] = useState(true);

  async function charger() {
    const { data } = await supabase.from("lots").select("*").neq("type", "vacant").order("id");
    setLots(data || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, []);

  function calc(lot) {
    const nv = parseFloat(nouvIndices[lot.id]);
    if (!nv || !lot.indice_valeur) return null;
    const nouveauLoyer = (lot.loyer_mensuel_ht * nv) / lot.indice_valeur;
    return { nouveauLoyer, variation: ((nouveauLoyer - lot.loyer_mensuel_ht) / lot.loyer_mensuel_ht) * 100 };
  }

  async function appliquer(lot) {
    const res = calc(lot);
    if (!res) return;
    const nv = parseFloat(nouvIndices[lot.id]);
    const patch = { loyer_mensuel_ht: Math.round(res.nouveauLoyer * 100) / 100, indice_valeur: nv };
    await supabase.from("lots").update(patch).eq("id", lot.id);
    setNouvIndices((s) => ({ ...s, [lot.id]: "" }));
    charger();
  }

  if (chargement) return <p className="text-stone-400">Chargement…</p>;

  return (
    <div className="space-y-4">
      <Card className="bg-emerald-50 border-emerald-200">
        <p className="text-sm text-emerald-900">
          Formule : nouveau loyer = loyer actuel × (nouvel indice publié ÷ indice de base du bail). Renseignez la valeur du nouvel indice (ILC, ILAT, IRL ou ICC selon le lot) pour calculer la révision.
        </p>
      </Card>

      {lots.map((lot) => {
        const res = calc(lot);
        return (
          <Card key={lot.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-serif text-lg">{lot.nom}</p>
                <p className="text-sm text-stone-500">
                  Indice {lot.indice_type || "—"} de base : {lot.indice_valeur ?? "à renseigner"} ({lot.indice_periode || "—"})
                </p>
                {lot.indice_note && <p className="text-xs text-amber-700 mt-1">{lot.indice_note}</p>}
              </div>
              <p className="text-right font-medium">{eur(lot.loyer_mensuel_ht)} / mois</p>
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <Field label={`Nouvel indice ${lot.indice_type || ""} publié`}>
                <input type="number" step="0.01" className="w-40 border border-stone-300 rounded px-2 py-1"
                  value={nouvIndices[lot.id] || ""} onChange={(e) => setNouvIndices((s) => ({ ...s, [lot.id]: e.target.value }))} />
              </Field>
              {res && (
                <div className="text-sm">
                  <p>Nouveau loyer : <span className="font-medium">{eur(res.nouveauLoyer)}</span></p>
                  <p className={res.variation >= 0 ? "text-emerald-700" : "text-red-700"}>
                    {res.variation >= 0 ? "+" : ""}{res.variation.toFixed(2)} %
                  </p>
                </div>
              )}
              <button disabled={!res} onClick={() => appliquer(lot)} className="w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-30">
                Valider la révision
              </button>
            </div>
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
