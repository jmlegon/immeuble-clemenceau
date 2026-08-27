"use client";
import { useEffect, useState } from "react";
import { Card, Field, Badge, DataTable, Bandeau, DialogueSuppression, useRetour } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur, fdate, todayISO, CATEGORIES_DEPENSE, labelCategorie, nettoyerNomFichier } from "@/lib/helpers";

const BUCKET = "documents";

// 15 Mo : au-delà, un envoi depuis un téléphone en 4G échoue plus souvent
// qu'il n'aboutit, et un scan de bail n'a aucune raison d'être si lourd.
const TAILLE_MAX = 15 * 1024 * 1024;


function DepensesInner() {
  const [lots, setLots] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [tableAbsente, setTableAbsente] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [aSupprimer, setASupprimer] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [filtreLot, setFiltreLot] = useState("");
  const retour = useRetour();

  const [annee, setAnnee] = useState(String(new Date().getFullYear()));
  const [date, setDate] = useState(todayISO());
  const [categorie, setCategorie] = useState(CATEGORIES_DEPENSE[0].cle);
  const [lotId, setLotId] = useState("");
  const [libelle, setLibelle] = useState("");
  const [montant, setMontant] = useState("");
  const [tva, setTva] = useState("");
  const [deductible, setDeductible] = useState(true);
  const [fichier, setFichier] = useState(null);

  async function charger() {
    const [{ data: lotsData }, { data: depData, error: depErr }] = await Promise.all([
      supabase.from("lots").select("*").order("id"),
      supabase.from("depenses").select("*").order("date", { ascending: false }),
    ]);
    // La table n'existe pas tant que la migration 01 n'a pas été passée.
    if (depErr && /relation|does not exist|schema cache/i.test(depErr.message)) setTableAbsente(true);
    setLots(lotsData || []);
    setDepenses(depData || []);
    setChargement(false);
  }
  useEffect(() => { charger(); }, []);

  async function ajouter() {
    if (!date || !montant) { retour.echec("La date et le montant sont obligatoires."); return; }
    setEnregistrement(true);

    let fichier_path = null;
    if (fichier) {
      if (fichier.size > TAILLE_MAX) {
        retour.echec(`Justificatif trop volumineux (${Math.round(fichier.size / 1048576)} Mo). Maximum 15 Mo.`);
        setEnregistrement(false);
        return;
      }
      const path = `depenses/${Date.now()}-${nettoyerNomFichier(fichier.name)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, fichier);
      if (error) { retour.echec("Le justificatif n'a pas pu être envoyé", error); setEnregistrement(false); return; }
      fichier_path = path;
    }

    const { error } = await supabase.from("depenses").insert({
      lot_id: lotId || null,
      date,
      categorie,
      libelle: libelle || null,
      montant: parseFloat(montant),
      tva: parseFloat(tva) || 0,
      deductible,
      fichier_path,
    });
    setEnregistrement(false);
    if (error) { retour.echec("La dépense n'a pas été enregistrée", error); return; }

    retour.succes("Dépense enregistrée");
    setLibelle(""); setMontant(""); setTva(""); setFichier(null);
    charger();
  }

  async function confirmerSuppression() {
    setSuppressionEnCours(true);
    // Le justificatif part avec la dépense, sinon il reste orphelin dans le bucket.
    if (aSupprimer.fichier_path) {
      const { error } = await supabase.storage.from(BUCKET).remove([aSupprimer.fichier_path]);
      if (error) {
        retour.echec("Le justificatif n'a pas pu être supprimé — la dépense est conservée", error);
        setSuppressionEnCours(false);
        setASupprimer(null);
        return;
      }
    }
    const { error } = await supabase.from("depenses").delete().eq("id", aSupprimer.id);
    setSuppressionEnCours(false);
    if (error) {
      retour.echec("La dépense n'a pas été supprimée", error);
      setASupprimer(null);
      return;
    }
    retour.succes("Dépense supprimée");
    setASupprimer(null);
    charger();
  }

  async function voirFichier(path) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) { retour.echec("Le justificatif n'a pas pu être ouvert", error); return; }
    window.open(data.signedUrl, "_blank");
  }

  if (chargement) return <p className="text-stone-500">Chargement…</p>;

  if (tableAbsente) {
    return (
      <Card className="border-amber-200">
        <h2 className="font-serif text-lg mb-2">Migration à exécuter</h2>
        <p className="text-sm text-amber-900">
          La table <code>depenses</code> n'existe pas encore dans votre base. Ouvrez Supabase &gt;
          SQL Editor &gt; New query, collez le contenu du fichier
          <code> supabase/migration-01-depenses-et-suivi.sql</code> du projet, puis cliquez sur Run.
          Rechargez ensuite cette page.
        </p>
      </Card>
    );
  }


  const annees = [...new Set(depenses.map((d) => d.date.slice(0, 4)))].sort().reverse();
  if (annees.length && !annees.includes(annee)) annees.push(annee);
  const filtrees = depenses.filter((d) => d.date.startsWith(annee)
    && (!filtreLot || (filtreLot === "commune" ? !d.lot_id : d.lot_id === filtreLot)));

  const total = filtrees.reduce((s, d) => s + (d.montant || 0), 0);
  const totalDeductible = filtrees.filter((d) => d.deductible).reduce((s, d) => s + (d.montant || 0), 0);
  const totalTva = filtrees.reduce((s, d) => s + (d.tva || 0), 0);

  const parCategorie = CATEGORIES_DEPENSE
    .map((c) => ({ ...c, total: filtrees.filter((d) => d.categorie === c.cle).reduce((s, d) => s + (d.montant || 0), 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-serif text-lg mb-3">Enregistrer une dépense</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Date">
            <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Catégorie">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
              {CATEGORIES_DEPENSE.map((c) => <option key={c.cle} value={c.cle}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Lot concerné">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={lotId} onChange={(e) => setLotId(e.target.value)}>
              <option value="">Commune à l'immeuble</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
          </Field>
          <Field label="Libellé">
            <input className="w-full border border-stone-300 rounded px-2 py-1" placeholder="Ex. remplacement chaudière" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
          </Field>
          <Field label="Montant TTC (€)">
            <input type="number" step="0.01" className="w-full border border-stone-300 rounded px-2 py-1" value={montant} onChange={(e) => setMontant(e.target.value)} />
          </Field>
          <Field label="dont TVA récupérable (€)">
            <input type="number" step="0.01" className="w-full border border-stone-300 rounded px-2 py-1" value={tva} onChange={(e) => setTva(e.target.value)} />
          </Field>
        </div>

        <div className="mt-3 flex flex-col md:flex-row md:items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="w-4 h-4" checked={deductible} onChange={(e) => setDeductible(e.target.checked)} />
            Déductible du résultat
          </label>
          <label className="text-sm text-stone-600">
            <span className="block text-xs text-stone-500 mb-1 md:hidden">Justificatif (facultatif)</span>
            <input type="file" accept="application/pdf,image/*" className="text-sm" onChange={(e) => setFichier(e.target.files?.[0] || null)} />
          </label>
        </div>

        <button onClick={ajouter} disabled={enregistrement}
          className="mt-3 w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
          {enregistrement ? "Enregistrement…" : "Enregistrer la dépense"}
        </button>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg">Dépenses {annee}</h2>
          <div className="flex items-center gap-2">
            <select className="border border-stone-300 rounded px-2 py-1 text-sm" value={filtreLot}
              onChange={(e) => setFiltreLot(e.target.value)} aria-label="Filtrer par lot">
              <option value="">Tous les lots</option>
              <option value="commune">Immeuble (commune)</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
            <select className="border border-stone-300 rounded px-2 py-1 text-sm" value={annee}
              onChange={(e) => setAnnee(e.target.value)} aria-label="Filtrer par année">
              {annees.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wide">Total</p>
            <p className="text-lg md:text-2xl font-serif mt-1">{eur(total)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wide">Déductible</p>
            <p className="text-lg md:text-2xl font-serif mt-1">{eur(totalDeductible)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wide">TVA récup.</p>
            <p className="text-lg md:text-2xl font-serif mt-1">{eur(totalTva)}</p>
          </div>
        </div>

        {parCategorie.length > 0 && (
          <div className="mb-4 space-y-1">
            {parCategorie.map((c) => (
              <div key={c.cle} className="flex items-center gap-2 text-sm">
                <span className="text-stone-600 flex-1 min-w-0 truncate">{c.label}</span>
                <div className="hidden md:block w-40 h-2 bg-stone-100 rounded overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: `${total ? (c.total / total) * 100 : 0}%` }} />
                </div>
                <span className="tabular-nums shrink-0">{eur(c.total)}</span>
              </div>
            ))}
          </div>
        )}

        <DataTable
          empty={`Aucune dépense enregistrée en ${annee}.`}
          columns={[
            { key: "libelle", label: "Libellé" },
            { key: "date", label: "Date" },
            { key: "categorie", label: "Catégorie" },
            { key: "lot", label: "Lot" },
            { key: "montant", label: "Montant" },
            { key: "statut", label: "Déductible" },
            { key: "actions", label: "", action: true },
          ]}
          rows={filtrees.map((d) => {
            const l = lots.find((x) => x.id === d.lot_id);
            return {
              key: d.id,
              cells: {
                libelle: d.libelle || labelCategorie(d.categorie),
                date: fdate(d.date),
                categorie: labelCategorie(d.categorie),
                lot: l?.nom || "Immeuble (commune)",
                montant: eur(d.montant),
                statut: d.deductible ? <Badge tone="green">oui</Badge> : <Badge tone="gray">non</Badge>,
                actions: (
                  <span className="flex items-center gap-2">
                    {d.fichier_path && (
                      <button onClick={() => voirFichier(d.fichier_path)} className="text-emerald-700 hover:underline p-1">justif.</button>
                    )}
                    <button onClick={() => setASupprimer(d)} aria-label="Supprimer cette dépense" className="text-stone-500 hover:text-red-600 p-1">✕</button>
                  </span>
                ),
              },
            };
          })}
        />
      </Card>

      <DialogueSuppression
        cible={aSupprimer}
        titre="Supprimer cette dépense ?"
        description={aSupprimer
          ? `${aSupprimer.libelle || labelCategorie(aSupprimer.categorie)} — ${fdate(aSupprimer.date)}, ${eur(aSupprimer.montant)}.`
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
  return <DepensesInner />;
}
