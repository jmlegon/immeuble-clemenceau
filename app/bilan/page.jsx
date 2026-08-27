"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Badge, DataTable } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur, fdate, labelCategorie, telechargerCSV, nombreFR, tvaSurPaiement } from "@/lib/helpers";

// Location nue (habitation ou commerciale) => revenus fonciers.
// Location meublée => BIC. C'est ce qui sépare les deux déclarations.
function regime(lot) {
  return lot.type === "résidentiel-meublé" ? "bic" : "foncier";
}

function BilanInner() {
  const [lots, setLots] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [depenses, setDepenses] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [tableAbsente, setTableAbsente] = useState(false);
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));

  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: p }, { data: d, error: dErr }] = await Promise.all([
        supabase.from("lots").select("*").order("id"),
        supabase.from("paiements").select("*"),
        supabase.from("depenses").select("*"),
      ]);
      // La table n'existe pas tant que la migration 01 n'a pas été passée.
      if (dErr && /relation|does not exist|schema cache/i.test(dErr.message)) setTableAbsente(true);
      setLots(l || []);
      setPaiements(p || []);
      setDepenses(d || []);
      setChargement(false);
    })();
  }, []);

  if (chargement) return <p className="text-stone-400">Chargement…</p>;

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


  const annees = [...new Set([
    ...paiements.map((p) => (p.periode || "").slice(0, 4)),
    ...depenses.map((d) => (d.date || "").slice(0, 4)),
    String(new Date().getFullYear()),
  ])].filter(Boolean).sort().reverse();

  const paiementsAnnee = paiements.filter((p) => (p.periode || "").startsWith(annee));
  const depensesAnnee = depenses.filter((d) => (d.date || "").startsWith(annee));

  // --- Loyers encaissés et TVA collectée, par lot ---
  const parLot = lots.map((lot) => {
    const ps = paiementsAnnee.filter((p) => p.lot_id === lot.id);
    const encaisse = ps.reduce((s, p) => s + (p.montant || 0), 0);

    const tvaCollectee = ps.reduce((s, p) => s + tvaSurPaiement(lot, p), 0);

    const directes = depensesAnnee.filter((d) => d.lot_id === lot.id && d.deductible)
      .reduce((s, d) => s + (d.montant || 0), 0);

    return { lot, encaisse, tvaCollectee, directes };
  });

  const totalEncaisse = parLot.reduce((s, r) => s + r.encaisse, 0);

  // --- Dépenses communes, réparties au prorata des loyers encaissés ---
  const communes = depensesAnnee.filter((d) => !d.lot_id && d.deductible)
    .reduce((s, d) => s + (d.montant || 0), 0);

  const lignes = parLot.map((r) => {
    const quotePart = totalEncaisse > 0 ? communes * (r.encaisse / totalEncaisse) : 0;
    const chargesTotal = r.directes + quotePart;
    return { ...r, quotePart, chargesTotal, resultat: r.encaisse - chargesTotal };
  });

  const totalCharges = lignes.reduce((s, r) => s + r.chargesTotal, 0);
  const resultatNet = totalEncaisse - totalCharges;

  const totaux = (cle) => lignes.filter((r) => regime(r.lot) === cle)
    .reduce((acc, r) => ({
      encaisse: acc.encaisse + r.encaisse,
      charges: acc.charges + r.chargesTotal,
      resultat: acc.resultat + r.resultat,
    }), { encaisse: 0, charges: 0, resultat: 0 });

  const foncier = totaux("foncier");
  const bic = totaux("bic");

  // --- TVA ---
  const tvaCollectee = lignes.reduce((s, r) => s + r.tvaCollectee, 0);
  const tvaDeductible = depensesAnnee.reduce((s, d) => s + (d.tva || 0), 0);
  const tvaAReverser = tvaCollectee - tvaDeductible;

  function exporter() {
    const l = [];
    l.push([`Bilan ${annee} — 1 bd Clémenceau, Binic`]);
    l.push([`Édité le ${fdate(new Date().toISOString().slice(0, 10))}`]);
    l.push([]);
    l.push(["RÉCAPITULATIF PAR LOT"]);
    l.push(["Lot", "Locataire", "Régime", "Loyers encaissés", "Dépenses directes", "Quote-part communes", "Résultat net"]);
    lignes.forEach((r) => l.push([
      r.lot.nom, r.lot.locataire || "", regime(r.lot) === "bic" ? "BIC (meublé)" : "Revenus fonciers",
      nombreFR(r.encaisse), nombreFR(r.directes), nombreFR(r.quotePart), nombreFR(r.resultat),
    ]));
    l.push(["TOTAL", "", "", nombreFR(totalEncaisse), "", "", nombreFR(resultatNet)]);
    l.push([]);
    l.push(["PAR RÉGIME FISCAL"]);
    l.push(["Régime", "Recettes", "Charges", "Résultat"]);
    l.push(["Revenus fonciers (déclaration 2044)", nombreFR(foncier.encaisse), nombreFR(foncier.charges), nombreFR(foncier.resultat)]);
    l.push(["BIC meublé (déclaration 2031)", nombreFR(bic.encaisse), nombreFR(bic.charges), nombreFR(bic.resultat)]);
    l.push([]);
    l.push(["TVA"]);
    l.push(["TVA collectée (estimée sur encaissements)", nombreFR(tvaCollectee)]);
    l.push(["TVA déductible sur dépenses", nombreFR(tvaDeductible)]);
    l.push(["Solde à reverser", nombreFR(tvaAReverser)]);
    l.push([]);
    l.push(["DÉTAIL DES DÉPENSES"]);
    l.push(["Date", "Catégorie", "Libellé", "Lot", "Montant TTC", "dont TVA", "Déductible"]);
    depensesAnnee.forEach((d) => {
      const lot = lots.find((x) => x.id === d.lot_id);
      l.push([d.date, labelCategorie(d.categorie), d.libelle || "", lot?.nom || "Commune",
        nombreFR(d.montant), nombreFR(d.tva), d.deductible ? "oui" : "non"]);
    });
    l.push([]);
    l.push(["DÉTAIL DES ENCAISSEMENTS"]);
    l.push(["Période", "Lot", "Attendu", "Versé", "Date de paiement"]);
    paiementsAnnee.slice().sort((a, b) => (a.periode || "").localeCompare(b.periode || "")).forEach((p) => {
      const lot = lots.find((x) => x.id === p.lot_id);
      l.push([p.periode, lot?.nom || p.lot_id, nombreFR(p.attendu), nombreFR(p.montant), p.date_paiement || ""]);
    });
    telechargerCSV(`bilan-clemenceau-${annee}.csv`, l);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg">Bilan {annee}</h2>
          <select className="border border-stone-300 rounded px-2 py-1 text-sm" value={annee} onChange={(e) => setAnnee(e.target.value)}>
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wide">Encaissé</p>
            <p className="text-lg md:text-2xl font-serif mt-1">{eur(totalEncaisse)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wide">Charges</p>
            <p className="text-lg md:text-2xl font-serif mt-1">{eur(totalCharges)}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500 uppercase tracking-wide">Résultat net</p>
            <p className={`text-lg md:text-2xl font-serif mt-1 ${resultatNet < 0 ? "text-red-600" : "text-emerald-700"}`}>{eur(resultatNet)}</p>
          </div>
        </div>
        <button onClick={exporter} className="mt-4 w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm">
          Exporter le bilan {annee} (CSV)
        </button>
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Résultat par lot</h2>
        <DataTable
          empty={`Aucun mouvement en ${annee}.`}
          columns={[
            { key: "lot", label: "Lot" },
            { key: "regime", label: "Régime" },
            { key: "encaisse", label: "Encaissé" },
            { key: "directes", label: "Dép. directes" },
            { key: "quote", label: "Quote-part" },
            { key: "resultat", label: "Résultat" },
          ]}
          rows={lignes.map((r) => ({
            key: r.lot.id,
            cells: {
              lot: r.lot.nom,
              regime: <Badge tone={regime(r.lot) === "bic" ? "amber" : "gray"}>{regime(r.lot) === "bic" ? "BIC" : "foncier"}</Badge>,
              encaisse: eur(r.encaisse),
              directes: eur(r.directes),
              quote: eur(r.quotePart),
              resultat: <span className={r.resultat < 0 ? "text-red-600" : ""}>{eur(r.resultat)}</span>,
            },
          }))}
        />
        <p className="text-xs text-stone-500 mt-3">
          Les dépenses communes ({eur(communes)}) sont réparties entre les lots au prorata des loyers encaissés.
        </p>
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Par régime fiscal</h2>
        <DataTable
          columns={[
            { key: "regime", label: "Régime" },
            { key: "recettes", label: "Recettes" },
            { key: "charges", label: "Charges" },
            { key: "resultat", label: "Résultat" },
          ]}
          rows={[
            { key: "foncier", cells: { regime: "Revenus fonciers — déclaration 2044", recettes: eur(foncier.encaisse), charges: eur(foncier.charges), resultat: eur(foncier.resultat) } },
            { key: "bic", cells: { regime: "BIC meublé — déclaration 2031", recettes: eur(bic.encaisse), charges: eur(bic.charges), resultat: eur(bic.resultat) } },
          ]}
        />
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">TVA {annee}</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-stone-100 pb-2">
            <span className="text-stone-600">TVA collectée sur les loyers commerciaux</span>
            <span className="tabular-nums">{eur(tvaCollectee)}</span>
          </div>
          <div className="flex justify-between border-b border-stone-100 pb-2">
            <span className="text-stone-600">TVA déductible sur les dépenses</span>
            <span className="tabular-nums">− {eur(tvaDeductible)}</span>
          </div>
          <div className="flex justify-between font-medium pt-1">
            <span>{tvaAReverser >= 0 ? "À reverser au Trésor" : "Crédit de TVA"}</span>
            <span className="tabular-nums">{eur(Math.abs(tvaAReverser))}</span>
          </div>
        </div>
        <p className="text-xs text-stone-500 mt-3">
          Estimation. La TVA sur les loyers est exigible à l'encaissement : elle est calculée sur les
          sommes réellement reçues, hors avance sur eau, au taux enregistré pour chaque lot. Elle ne
          remplace pas votre déclaration CA3 ou CA12.
        </p>
      </Card>

      <Card className="border-amber-200">
        <p className="text-sm text-amber-900">
          Ces montants sont une aide à la préparation, pas un document comptable. Vérifiez-les avec
          votre comptable avant toute déclaration — en particulier la distinction entre travaux
          d'entretien (déductibles immédiatement) et travaux d'amélioration.
        </p>
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <Shell><BilanInner /></Shell>
    </AuthGuard>
  );
}
