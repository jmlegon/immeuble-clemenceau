"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Badge, Field } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur } from "@/lib/helpers";

function LotsInner() {
  const [lots, setLots] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [chargement, setChargement] = useState(true);

  async function charger() {
    const { data } = await supabase.from("lots").select("*").order("id");
    setLots(data || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, []);

  async function updateLot(id, patch) {
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await supabase.from("lots").update(patch).eq("id", id);
  }

  if (chargement) return <p className="text-stone-400">Chargement…</p>;

  return (
    <div className="space-y-4">
      {lots.map((lot) => (
        <Card key={lot.id}>
          <button className="w-full flex items-center justify-between text-left" onClick={() => setOpenId(openId === lot.id ? null : lot.id)}>
            <div>
              <p className="text-xs text-stone-500">{lot.localisation}</p>
              <p className="font-serif text-lg">{lot.nom}</p>
              <p className="text-sm text-stone-500">{lot.locataire || "Vacant"}</p>
            </div>
            <div className="text-right">
              <p className="font-medium">{lot.loyer_mensuel_ht ? eur(lot.loyer_mensuel_ht) + " / mois" : "—"}</p>
              <Badge tone={lot.type === "vacant" ? "gray" : lot.type === "commercial" ? "green" : "amber"}>{lot.type}</Badge>
            </div>
          </button>

          {openId === lot.id && (
            <div className="mt-4 pt-4 border-t border-stone-100 grid md:grid-cols-2 gap-4 text-sm">
              <Field label="Locataire">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.locataire || ""}
                  onBlur={(e) => updateLot(lot.id, { locataire: e.target.value })} />
              </Field>
              <Field label="N° SIRET">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.siret || ""}
                  onBlur={(e) => updateLot(lot.id, { siret: e.target.value })} placeholder="À renseigner" />
              </Field>
              <Field label="Loyer mensuel HT (€)">
                <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.loyer_mensuel_ht ?? ""}
                  onBlur={(e) => updateLot(lot.id, { loyer_mensuel_ht: parseFloat(e.target.value) || 0 })} />
              </Field>
              {lot.type === "commercial" && (
                <Field label="Taux de TVA (%)">
                  <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.tva_taux ?? ""}
                    onBlur={(e) => updateLot(lot.id, { tva_taux: parseFloat(e.target.value) || 0 })} />
                </Field>
              )}
              <Field label="Indice de référence">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.indice_type || ""}
                  onBlur={(e) => updateLot(lot.id, { indice_type: e.target.value })} />
              </Field>
              <Field label="Valeur de l'indice de base">
                <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.indice_valeur ?? ""}
                  onBlur={(e) => updateLot(lot.id, { indice_valeur: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Période de l'indice de base">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.indice_periode || ""}
                  onBlur={(e) => updateLot(lot.id, { indice_periode: e.target.value })} />
              </Field>
              <Field label="Révision (JJ-MM)">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.revision_jour_mois || ""}
                  onBlur={(e) => updateLot(lot.id, { revision_jour_mois: e.target.value })} />
              </Field>
              <Field label="Avance / provision sur charges (€)">
                <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.avance_eau || 0}
                  onBlur={(e) => updateLot(lot.id, { avance_eau: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Dépôt de garantie (€)">
                <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.depot_garantie ?? ""}
                  onBlur={(e) => updateLot(lot.id, { depot_garantie: parseFloat(e.target.value) || 0 })} />
              </Field>
              <Field label="Fin de bail">
                <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.fin_bail || ""}
                  onBlur={(e) => updateLot(lot.id, { fin_bail: e.target.value })} />
              </Field>
              {lot.incomplet && lot.incomplet.length > 0 && (
                <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 text-xs">
                  {lot.incomplet.join(" · ")}
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <Shell><LotsInner /></Shell>
    </AuthGuard>
  );
}
