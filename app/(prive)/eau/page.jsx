"use client";
import { useMemo, useState } from "react";
import { Card, Field, Badge, DataTable, Bandeau, Squelette, Volet, useRetour, useStatutsChamps } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { rafraichir, useTable } from "@/lib/donnees";
import { eur, fdate, todayISO, compteurLabels, consommationSurPeriode, regularisationEau, joursEntre, labelCategorie } from "@/lib/helpers";

const TARIFS_DEFAUT = { prix_m3: 5.5, abonnement_annuel: 70, nombre_parts: 4 };

function EauInner() {
  const [anneeTF, setAnneeTF] = useState(String(new Date().getFullYear()));
  const [compteur, setCompteur] = useState("vide1");
  const [date, setDate] = useState(todayISO());
  const [index, setIndex] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const retour = useRetour();
  const champs = useStatutsChamps();

  const { donnees: tousLots, chargement } = useTable("lots");
  const { donnees: tousReleves } = useTable("releves_eau");
  const tarifsBase = useTable("eau_tarifs").donnees[0] || null;
  // La taxe foncière est une dépense commune depuis la migration 01 : c'est
  // là qu'on la lit, pour que l'écran et le bilan parlent du même montant.
  const { donnees: depenses } = useTable("depenses");

  const lots = useMemo(() => tousLots.filter((l) => l.type !== "vacant"), [tousLots]);
  const depensesTF = useMemo(() => depenses.filter((d) => d.categorie === "taxe_fonciere"), [depenses]);
  const releves = useMemo(() => {
    const parCompteur = {};
    tousReleves.forEach((r) => {
      parCompteur[r.compteur_id] = parCompteur[r.compteur_id] || [];
      parCompteur[r.compteur_id].push(r);
    });
    return parCompteur;
  }, [tousReleves]);

  // Les tarifs s'éditent au clavier : la frappe en cours reste locale, la base
  // n'est écrite qu'à la sortie du champ. Tant qu'on n'a rien tapé, c'est la
  // valeur enregistrée qui s'affiche.
  const [saisieTarifs, setSaisieTarifs] = useState(null);
  const tarifs = saisieTarifs || tarifsBase || TARIFS_DEFAUT;

  function consommation(id) {
    const rel = releves[id] || [];
    if (rel.length < 2) return null;
    const last = rel[rel.length - 1];
    const prev = rel[rel.length - 2];
    return { periode: `${fdate(prev.date)} → ${fdate(last.date)}`, m3: last.index_value - prev.index_value };
  }

  async function ajouterReleve() {
    if (!index) { retour.echec("Saisissez un index avant d'ajouter le relevé."); return; }
    setEnregistrement(true);
    const { error } = await supabase.from("releves_eau")
      .insert({ compteur_id: compteur, date, index_value: parseFloat(index) });
    setEnregistrement(false);
    if (error) { retour.echec("Le relevé n'a pas été enregistré", error); return; }
    retour.succes(`Relevé ajouté — ${compteurLabels[compteur]}`);
    setIndex("");
    rafraichir("releves_eau");
  }

  function saisirTarifs(patch) { setSaisieTarifs({ ...tarifs, ...patch }); }

  async function enregistrerTarifs(colonne) {
    const { prix_m3, abonnement_annuel, nombre_parts } = tarifs;
    champs.debut(colonne);
    const { error } = await supabase.from("eau_tarifs")
      .update({ prix_m3, abonnement_annuel, nombre_parts }).eq("id", 1);
    if (error) {
      champs.echec(colonne);
      setSaisieTarifs(null);
      retour.echec("Les tarifs d'eau n'ont pas été enregistrés", error);
      return;
    }
    // Le succès se dit dans le champ ; le bandeau reste pour les erreurs.
    champs.succes(colonne);
    rafraichir("eau_tarifs");
  }



  if (chargement) return <Squelette cartes={3} />;

  // Le contrôle d'écart n'a de sens qu'à période commune : additionner des
  // consommations mesurées sur des intervalles différents, puis les comparer au
  // général mesuré sur un autre encore, déclenchait l'alerte au hasard.
  const consoGeneral = consommation("general");
  const fenetre = (() => {
    const rel = releves.general || [];
    if (rel.length < 2) return null;
    return { debut: rel[rel.length - 2].date, fin: rel[rel.length - 1].date };
  })();

  const individuels = Object.keys(compteurLabels).filter((id) => id !== "general");
  const alignes = fenetre
    ? individuels.map((id) => ({ id, m3: consommationSurPeriode(releves[id], fenetre.debut, fenetre.fin) }))
    : [];
  const mesurables = alignes.filter((x) => x.m3 !== null);
  const nonAlignes = alignes.filter((x) => x.m3 === null);
  const sommeIndiv = mesurables.reduce((s, x) => s + x.m3, 0);
  const comparaisonPossible = fenetre && consoGeneral && nonAlignes.length === 0;
  const ecart = comparaisonPossible ? sommeIndiv - consoGeneral.m3 : null;

  const anneesTF = [...new Set([
    ...depensesTF.map((d) => (d.date || "").slice(0, 4)).filter(Boolean),
    String(new Date().getFullYear()),
  ])].sort().reverse();
  const lignesTF = depensesTF.filter((d) => (d.date || "").startsWith(anneeTF));
  const montantTF = lignesTF.length ? lignesTF.reduce((s, d) => s + (d.montant || 0), 0) : null;

  return (
    <div className="space-y-4">
      <Volet titre="Ajouter un relevé">
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <Field label="Compteur">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={compteur} onChange={(e) => setCompteur(e.target.value)}>
              {Object.entries(compteurLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field label="Date du relevé">
            <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Index (m³)">
            <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" value={index} onChange={(e) => setIndex(e.target.value)} />
          </Field>
          <button onClick={ajouterReleve} disabled={enregistrement} className="w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm md:h-fit disabled:opacity-50">{enregistrement ? "Ajout…" : "Ajouter"}</button>
        </div>
      </Volet>

      <Card>
        <h2 className="font-serif text-lg mb-3">Relevés et consommations</h2>
        <DataTable
          empty="Aucun compteur."
          columns={[
            { key: "compteur", label: "Compteur" },
            { key: "dernier", label: "Dernier relevé" },
            { key: "conso", label: "Consommation" },
          ]}
          rows={Object.entries(compteurLabels).map(([id, label]) => {
            const rel = releves[id] || [];
            const last = rel[rel.length - 1];
            const conso = consommation(id);
            return {
              key: id,
              cells: {
                compteur: label,
                dernier: last ? `${last.index_value} m³ (${fdate(last.date)})` : "—",
                conso: conso ? `${conso.m3} m³ (${conso.periode})` : "en attente d'un 2ème relevé",
              },
            };
          })}
        />
        {comparaisonPossible && Math.abs(ecart) > 5 && (
          <p className="text-xs text-amber-700 mt-3">
            Écart notable sur la période du {fdate(fenetre.debut)} au {fdate(fenetre.fin)} :
            somme des compteurs individuels {sommeIndiv} m³ contre {consoGeneral.m3} m³ au général,
            soit {ecart > 0 ? "+" : ""}{ecart} m³ — à vérifier (fuite, compteur défaillant).
          </p>
        )}
        {comparaisonPossible && Math.abs(ecart) <= 5 && (
          <p className="text-xs text-emerald-700 mt-3">
            Compteurs cohérents sur la période du {fdate(fenetre.debut)} au {fdate(fenetre.fin)} :
            {" "}{sommeIndiv} m³ au total contre {consoGeneral.m3} m³ au général.
          </p>
        )}
        {fenetre && nonAlignes.length > 0 && (
          <p className="text-xs text-stone-500 mt-3">
            Comparaison au compteur général impossible : {nonAlignes.map((x) => compteurLabels[x.id]).join(", ")}
            {nonAlignes.length > 1 ? " n'ont pas" : " n'a pas"} de relevé encadrant la période du
            {" "}{fdate(fenetre.debut)} au {fdate(fenetre.fin)}. Relevez ces compteurs aux mêmes dates que le général.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Régularisation des charges d'eau</h2>
        <div className="flex flex-wrap gap-4">
          <Field label="Prix du m³ (€)" statut={champs.statuts.prix_m3}>
            <input type="number" step="0.01" className="w-32 border border-stone-300 rounded px-2 py-1" value={tarifs.prix_m3}
              onChange={(e) => saisirTarifs({ prix_m3: parseFloat(e.target.value) || 0 })} onBlur={() => enregistrerTarifs("prix_m3")} />
          </Field>
          <Field label="Abonnement annuel (€)" statut={champs.statuts.abonnement_annuel}>
            <input type="number" step="0.01" className="w-32 border border-stone-300 rounded px-2 py-1" value={tarifs.abonnement_annuel}
              onChange={(e) => saisirTarifs({ abonnement_annuel: parseFloat(e.target.value) || 0 })} onBlur={() => enregistrerTarifs("abonnement_annuel")} />
          </Field>
          <Field label="Nombre de parts" statut={champs.statuts.nombre_parts}>
            <input type="number" className="w-32 border border-stone-300 rounded px-2 py-1" value={tarifs.nombre_parts}
              onChange={(e) => saisirTarifs({ nombre_parts: parseFloat(e.target.value) || 1 })} onBlur={() => enregistrerTarifs("nombre_parts")} />
          </Field>
        </div>
        <p className="text-xs text-stone-500 mt-3">
          Coût et avance sont calculés sur la durée réellement écoulée entre les deux derniers
          relevés du lot, pas sur une année pleine : un intervalle de neuf mois donne neuf mois
          d'avance, pas douze.
        </p>
        <div className="mt-3">
          <DataTable
            empty="Aucun lot."
            columns={[
              { key: "lot", label: "Lot" },
              { key: "periode", label: "Durée mesurée" },
              { key: "conso", label: "Conso" },
              { key: "cout", label: "Coût sur la période" },
              { key: "avance", label: "Avance sur la période" },
              { key: "solde", label: "Solde" },
            ]}
            rows={lots.map((l) => {
              const rel = l.compteur_id ? (releves[l.compteur_id] || []) : [];
              const conso = l.compteur_id ? consommation(l.compteur_id) : null;
              const jours = rel.length >= 2
                ? joursEntre(rel[rel.length - 2].date, rel[rel.length - 1].date)
                : null;
              // Avance et coût ramenés à la même durée : sans cela, neuf mois de
              // consommation étaient opposés à douze mois d'avance.
              const r = regularisationEau({
                m3: conso ? conso.m3 : null,
                jours,
                prixM3: tarifs.prix_m3,
                abonnementAnnuel: tarifs.abonnement_annuel,
                nombreParts: tarifs.nombre_parts,
                avanceMensuelle: l.avance_eau || 0,
              });
              return {
                key: l.id,
                cells: {
                  lot: l.nom,
                  periode: r ? `${r.jours} j` : "—",
                  conso: conso ? `${conso.m3} m³` : "—",
                  cout: r ? eur(r.coutTotal) : "—",
                  avance: r ? eur(r.avance) : "—",
                  solde: r
                    ? <Badge tone={r.solde >= 0 ? "green" : "red"}>{r.solde >= 0 ? `à rembourser ${eur(r.solde)}` : `à réclamer ${eur(-r.solde)}`}</Badge>
                    : "—",
                },
              };
            })}
          />
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg">Quote-part de taxe foncière</h2>
          <select className="border border-stone-300 rounded px-2 py-1 text-sm" value={anneeTF}
            onChange={(e) => setAnneeTF(e.target.value)}>
            {anneesTF.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {montantTF === null ? (
          <p className="text-sm text-stone-500">
            Aucune taxe foncière enregistrée pour {anneeTF}. Elle se saisit dans l'onglet
            « Dépenses », catégorie « {labelCategorie("taxe_fonciere")} » — c'est de là que la
            quote-part et le bilan la lisent.
          </p>
        ) : (
          <>
            <p className="text-sm text-stone-600 mb-3">
              Taxe foncière {anneeTF} : <span className="font-medium">{eur(montantTF)}</span>
              {lignesTF.length > 1 && ` (${lignesTF.length} lignes cumulées)`}
            </p>
            <DataTable
              empty="Aucun local commercial."
              columns={[
                { key: "local", label: "Local commercial" },
                { key: "part", label: `Quote-part (1/${tarifs.nombre_parts || 1})` },
              ]}
              rows={lots.filter((l) => l.type === "commercial").map((l) => ({
                key: l.id,
                cells: { local: l.nom, part: eur(montantTF / (tarifs.nombre_parts || 1)) },
              }))}
            />
          </>
        )}

        <p className="text-xs text-stone-500 mt-3">
          Le montant vient des dépenses de l'immeuble, où il alimente aussi le bilan. Il ne se
          modifie donc qu'à un seul endroit : l'onglet « Dépenses ». Le nombre de parts est celui
          réglé plus haut, dans la régularisation d'eau.
        </p>
      </Card>

      <Bandeau retour={retour} />
    </div>
  );
}

export default function Page() {
  return <EauInner />;
}
