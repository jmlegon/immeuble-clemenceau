"use client";
import { useEffect, useState } from "react";
import { Card, Badge, Field, Bandeau, useRetour } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur, compteurLabels, nombreOuNull } from "@/lib/helpers";

const TYPES_LOT = [
  { cle: "commercial", label: "Bail commercial" },
  { cle: "résidentiel-vide", label: "Location vide" },
  { cle: "résidentiel-meublé", label: "Location meublée" },
  { cle: "vacant", label: "Vacant" },
];

const PERIODICITES = [
  { cle: "mensuelle", label: "Mensuelle" },
  { cle: "trimestrielle", label: "Trimestrielle" },
];

// L'identifiant est la clé primaire du lot, reprise par les paiements, les
// dépenses et les documents : on le fabrique une fois, puis il ne bouge plus.
function identifiantDepuis(nom) {
  return (nom || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 24);
}

function LotsInner() {
  const [lots, setLots] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [chargement, setChargement] = useState(true);
  // Incrémenté quand une écriture est refusée : change la clé du panneau, ce qui
  // le remonte et redonne aux champs (non contrôlés) la valeur réellement en base.
  const [revisions, setRevisions] = useState({});
  const [creation, setCreation] = useState(false);
  const [enCreation, setEnCreation] = useState(false);
  const [nouveau, setNouveau] = useState({ id: "", nom: "", localisation: "", type: "résidentiel-vide" });
  const retour = useRetour();

  async function charger() {
    const { data } = await supabase.from("lots").select("*").order("id");
    setLots(data || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, []);

  async function updateLot(id, patch, libelle) {
    const avant = lots.find((l) => l.id === id);
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

    const { error } = await supabase.from("lots").update(patch).eq("id", id);
    if (error) {
      // L'écran ne doit pas continuer d'afficher une valeur que la base a refusée.
      setLots((prev) => prev.map((l) => (l.id === id ? avant : l)));
      setRevisions((r) => ({ ...r, [id]: (r[id] || 0) + 1 }));
      retour.echec(`${libelle} : modification non enregistrée`, error);
      return;
    }
    retour.succes(`${libelle} enregistré`);
  }

  function majNouveau(patch) {
    setNouveau((n) => {
      const suivant = { ...n, ...patch };
      // L'identifiant suit le nom tant qu'on ne l'a pas modifié à la main.
      if (patch.nom !== undefined && n.id === identifiantDepuis(n.nom)) {
        suivant.id = identifiantDepuis(patch.nom);
      }
      return suivant;
    });
  }

  async function creerLot() {
    const id = (nouveau.id || identifiantDepuis(nouveau.nom)).trim();
    if (!nouveau.nom.trim() || !id) {
      retour.echec("Donnez au moins un nom au lot.");
      return;
    }
    if (lots.some((l) => l.id === id)) {
      retour.echec(`L'identifiant « ${id} » est déjà pris par un autre lot.`);
      return;
    }
    setEnCreation(true);
    const { error } = await supabase.from("lots").insert({
      id,
      nom: nouveau.nom.trim(),
      localisation: nouveau.localisation.trim() || null,
      type: nouveau.type,
      avance_eau: 0,
      incomplet: [],
    });
    setEnCreation(false);
    if (error) { retour.echec("Le lot n'a pas été créé", error); return; }

    retour.succes(`Lot « ${nouveau.nom.trim()} » créé`);
    setNouveau({ id: "", nom: "", localisation: "", type: "résidentiel-vide" });
    setCreation(false);
    await charger();
    setOpenId(id);
  }

  if (chargement) return <p className="text-stone-500">Chargement…</p>;

  return (
    <div className="space-y-4">
      {creation ? (
        <Card>
          <h2 className="font-serif text-lg mb-3">Nouveau lot</h2>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <Field label="Nom du lot">
              <input className="w-full border border-stone-300 rounded px-2 py-1" value={nouveau.nom}
                placeholder="Ex. Location vide — 3ème étage"
                onChange={(e) => majNouveau({ nom: e.target.value })} />
            </Field>
            <Field label="Localisation">
              <input className="w-full border border-stone-300 rounded px-2 py-1" value={nouveau.localisation}
                placeholder="Ex. 3ème étage" onChange={(e) => majNouveau({ localisation: e.target.value })} />
            </Field>
            <Field label="Type">
              <select className="w-full border border-stone-300 rounded px-2 py-1" value={nouveau.type}
                onChange={(e) => majNouveau({ type: e.target.value })}>
                {TYPES_LOT.map((t) => <option key={t.cle} value={t.cle}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Identifiant (définitif)">
              <input className="w-full border border-stone-300 rounded px-2 py-1 font-mono text-xs" value={nouveau.id}
                placeholder={identifiantDepuis(nouveau.nom) || "identifiant"}
                onChange={(e) => setNouveau((n) => ({ ...n, id: identifiantDepuis(e.target.value) }))} />
            </Field>
          </div>
          <p className="text-xs text-stone-500 mt-2">
            L'identifiant relie le lot à ses paiements, dépenses et documents. Il ne pourra plus
            changer ensuite — le reste des informations se renseigne juste après, dans la fiche.
          </p>
          <div className="flex flex-col-reverse md:flex-row gap-2 mt-3">
            <button onClick={() => setCreation(false)}
              className="px-4 py-2.5 md:py-1.5 rounded border border-stone-300 text-stone-700 text-sm">
              Annuler
            </button>
            <button onClick={creerLot} disabled={enCreation}
              className="px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
              {enCreation ? "Création…" : "Créer le lot"}
            </button>
          </div>
        </Card>
      ) : (
        <button onClick={() => setCreation(true)}
          className="w-full border border-dashed border-stone-300 rounded-lg py-3 text-sm text-stone-600 hover:border-stone-400 hover:text-stone-800">
          + Ajouter un lot
        </button>
      )}

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
            <div key={`${lot.id}-${revisions[lot.id] || 0}`} className="mt-4 pt-4 border-t border-stone-100 grid md:grid-cols-2 gap-4 text-sm">
              <Field label="Type de lot">
                <select className="w-full border border-stone-300 rounded px-2 py-1" value={lot.type || ""}
                  onChange={(e) => updateLot(lot.id, { type: e.target.value }, "Type de lot")}>
                  {TYPES_LOT.map((t) => <option key={t.cle} value={t.cle}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Nom du lot">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.nom || ""}
                  onBlur={(e) => updateLot(lot.id, { nom: e.target.value }, "Nom du lot")} />
              </Field>
              <Field label="Localisation">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.localisation || ""}
                  onBlur={(e) => updateLot(lot.id, { localisation: e.target.value }, "Localisation")} />
              </Field>
              <Field label="Locataire">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.locataire || ""}
                  onBlur={(e) => updateLot(lot.id, { locataire: e.target.value }, "Locataire")} />
              </Field>
              <Field label="N° SIRET">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.siret || ""}
                  onBlur={(e) => updateLot(lot.id, { siret: e.target.value }, "SIRET")} placeholder="À renseigner" />
              </Field>
              <Field label="Loyer mensuel HT (€)">
                <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.loyer_mensuel_ht ?? ""}
                  onBlur={(e) => updateLot(lot.id, { loyer_mensuel_ht: nombreOuNull(e.target.value) }, "Loyer mensuel")} />
              </Field>
              {lot.type === "commercial" && (
                <Field label="Taux de TVA (%)">
                  <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.tva_taux ?? ""}
                    onBlur={(e) => updateLot(lot.id, { tva_taux: nombreOuNull(e.target.value) }, "Taux de TVA")} />
                </Field>
              )}
              <Field label="Indice de référence">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.indice_type || ""}
                  onBlur={(e) => updateLot(lot.id, { indice_type: e.target.value }, "Indice de référence")} />
              </Field>
              <Field label="Valeur de l'indice de base">
                <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.indice_valeur ?? ""}
                  onBlur={(e) => updateLot(lot.id, { indice_valeur: nombreOuNull(e.target.value) }, "Valeur de l'indice")} />
              </Field>
              <Field label="Période de l'indice de base">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.indice_periode || ""}
                  onBlur={(e) => updateLot(lot.id, { indice_periode: e.target.value }, "Période de l'indice")} />
              </Field>
              <Field label="Révision (JJ-MM)">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.revision_jour_mois || ""}
                  onBlur={(e) => updateLot(lot.id, { revision_jour_mois: e.target.value }, "Date de révision")} />
              </Field>
              <Field label="Avance / provision sur charges (€)">
                <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.avance_eau || 0}
                  onBlur={(e) => updateLot(lot.id, { avance_eau: nombreOuNull(e.target.value) ?? 0 }, "Avance sur charges")} />
              </Field>
              <Field label="Dépôt de garantie (€)">
                <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.depot_garantie ?? ""}
                  onBlur={(e) => updateLot(lot.id, { depot_garantie: nombreOuNull(e.target.value) }, "Dépôt de garantie")} />
              </Field>
              <Field label="Début de bail">
                <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.debut_bail || ""}
                  onBlur={(e) => updateLot(lot.id, { debut_bail: e.target.value || null }, "Début de bail")} />
              </Field>
              <Field label="Fin de bail">
                <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.fin_bail || ""}
                  onBlur={(e) => updateLot(lot.id, { fin_bail: e.target.value }, "Fin de bail")} />
              </Field>
              <Field label="Date de départ du locataire">
                <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.date_depart || ""}
                  onBlur={(e) => updateLot(lot.id, { date_depart: e.target.value || null }, "Date de départ")} />
              </Field>
              <Field label="Périodicité de facturation">
                <select className="w-full border border-stone-300 rounded px-2 py-1" value={lot.periodicite_facturation || "mensuelle"}
                  onChange={(e) => updateLot(lot.id, { periodicite_facturation: e.target.value }, "Périodicité")}>
                  {PERIODICITES.map((p) => <option key={p.cle} value={p.cle}>{p.label}</option>)}
                </select>
              </Field>
              <Field label="Compteur d'eau rattaché">
                <select className="w-full border border-stone-300 rounded px-2 py-1" value={lot.compteur_id || ""}
                  onChange={(e) => updateLot(lot.id, { compteur_id: e.target.value || null }, "Compteur d'eau")}>
                  <option value="">Aucun</option>
                  {Object.entries(compteurLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              </Field>
              <Field label="Ancien locataire">
                <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.ancien_locataire || ""}
                  onBlur={(e) => updateLot(lot.id, { ancien_locataire: e.target.value }, "Ancien locataire")} />
              </Field>
              {lot.date_depart && (lot.depot_garantie || 0) > 0 && (
                <>
                  <Field label="Dépôt restitué le">
                    <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.depot_restitue_le || ""}
                      onBlur={(e) => updateLot(lot.id, { depot_restitue_le: e.target.value || null }, "Date de restitution")} />
                  </Field>
                  <Field label="Montant restitué (€)">
                    <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.depot_montant_restitue ?? ""}
                      onBlur={(e) => updateLot(lot.id, { depot_montant_restitue: nombreOuNull(e.target.value) }, "Montant restitué")} />
                  </Field>
                  <Field label="Retenues éventuelles (motif)">
                    <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.depot_retenues_note || ""}
                      onBlur={(e) => updateLot(lot.id, { depot_retenues_note: e.target.value }, "Motif des retenues")} />
                  </Field>
                </>
              )}
              {lot.incomplet && lot.incomplet.length > 0 && (
                <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 text-xs">
                  {lot.incomplet.join(" · ")}
                </div>
              )}
            </div>
          )}
        </Card>
      ))}
      <Bandeau retour={retour} />
    </div>
  );
}

export default function Page() {
  return <LotsInner />;
}
