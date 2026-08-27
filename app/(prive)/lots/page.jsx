"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge, Field, Bandeau, Squelette, useRetour } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { rafraichir, useTable } from "@/lib/donnees";
import { eur, TYPES_LOT, labelTypeLot } from "@/lib/helpers";

const I = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

// L'identifiant est la clé primaire du lot, reprise par les paiements, les
// dépenses et les documents : on le fabrique une fois, puis il ne bouge plus.
function identifiantDepuis(nom) {
  return (nom || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 24);
}

/**
 * Index des lots.
 *
 * L'écran dépliait auparavant une vingtaine de champs de saisie sous chaque
 * lot : consulter revenait à modifier, et la fiche d'un locataire restait
 * éparpillée entre cinq onglets. Le détail vit maintenant dans /lots/[id], où
 * bail, encaissements, révisions, eau, documents et dépenses se lisent d'une
 * traite. Il ne reste ici que ce qu'une liste doit faire : montrer et mener.
 */
function LotsInner() {
  const { donnees: lots, chargement } = useTable("lots");
  const [creation, setCreation] = useState(false);
  const [enCreation, setEnCreation] = useState(false);
  const [nouveau, setNouveau] = useState({ id: "", nom: "", localisation: "", type: "résidentiel-vide" });
  const router = useRouter();
  const retour = useRetour();

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

    await rafraichir("lots");
    // Droit sur la fiche : le reste des informations se renseigne là-bas.
    router.push(`/lots/${id}`);
  }

  if (chargement) return <Squelette cartes={4} />;

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
        <Link
          key={lot.id}
          href={`/lots/${lot.id}`}
          className="block bg-white rounded-lg border border-stone-200 p-4 hover:border-stone-300 active:bg-stone-50"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {lot.localisation && <p className="text-xs text-stone-500">{lot.localisation}</p>}
              <p className="font-serif text-lg break-words">{lot.nom}</p>
              <p className="text-sm text-stone-500">{lot.locataire || "Vacant"}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="font-medium">{lot.loyer_mensuel_ht ? `${eur(lot.loyer_mensuel_ht)} / mois` : "—"}</p>
                <div className="mt-1">
                  <Badge tone={lot.type === "vacant" ? "gray" : lot.type === "commercial" ? "green" : "amber"}>
                    {labelTypeLot(lot.type)}
                  </Badge>
                </div>
              </div>
              <svg viewBox="0 0 24 24" {...I} className="w-5 h-5 text-stone-300"><path d="M9 18l6-6-6-6" /></svg>
            </div>
          </div>
          {lot.incomplet && lot.incomplet.length > 0 && (
            <p className="mt-3 text-xs text-amber-700">À compléter : {lot.incomplet.join(" · ")}</p>
          )}
        </Link>
      ))}
      <Bandeau retour={retour} />
    </div>
  );
}

export default function Page() {
  return <LotsInner />;
}
