"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Field, Badge, DataTable } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur, fdate, todayISO, compteurLabels } from "@/lib/helpers";

function EauInner() {
  const [lots, setLots] = useState([]);
  const [releves, setReleves] = useState({});
  const [tarifs, setTarifs] = useState({ prix_m3: 5.5, abonnement_annuel: 70, nombre_parts: 4 });
  const [taxeFonciere, setTaxeFonciere] = useState({ annee: 2025, montant_annuel: 2284 });
  const [compteur, setCompteur] = useState("vide1");
  const [date, setDate] = useState(todayISO());
  const [index, setIndex] = useState("");
  const [chargement, setChargement] = useState(true);

  async function charger() {
    const { data: lotsData } = await supabase.from("lots").select("*").neq("type", "vacant").order("id");
    const { data: relevesData } = await supabase.from("releves_eau").select("*").order("date");
    const { data: tarifsData } = await supabase.from("eau_tarifs").select("*").eq("id", 1).single();
    const { data: tfData } = await supabase.from("taxe_fonciere").select("*").eq("id", 1).single();
    setLots(lotsData || []);
    const grouped = {};
    (relevesData || []).forEach((r) => {
      grouped[r.compteur_id] = grouped[r.compteur_id] || [];
      grouped[r.compteur_id].push(r);
    });
    setReleves(grouped);
    if (tarifsData) setTarifs(tarifsData);
    if (tfData) setTaxeFonciere(tfData);
    setChargement(false);
  }
  useEffect(() => { charger(); }, []);

  function consommation(id) {
    const rel = releves[id] || [];
    if (rel.length < 2) return null;
    const last = rel[rel.length - 1];
    const prev = rel[rel.length - 2];
    return { periode: `${fdate(prev.date)} → ${fdate(last.date)}`, m3: last.index_value - prev.index_value };
  }

  async function ajouterReleve() {
    if (!index) return;
    await supabase.from("releves_eau").insert({ compteur_id: compteur, date, index_value: parseFloat(index) });
    setIndex("");
    charger();
  }

  async function maj_tarifs(patch) {
    const next = { ...tarifs, ...patch };
    setTarifs(next);
    await supabase.from("eau_tarifs").update(patch).eq("id", 1);
  }

  async function maj_taxe(patch) {
    const next = { ...taxeFonciere, ...patch };
    setTaxeFonciere(next);
    await supabase.from("taxe_fonciere").update(patch).eq("id", 1);
  }

  if (chargement) return <p className="text-stone-400">Chargement…</p>;

  const consoGeneral = consommation("general");
  const sommeIndiv = Object.keys(compteurLabels).filter((id) => id !== "general").reduce((s, id) => {
    const c = consommation(id);
    return s + (c ? c.m3 : 0);
  }, 0);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-serif text-lg mb-3">Ajouter un relevé</h2>
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
          <button onClick={ajouterReleve} className="w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm md:h-fit">Ajouter</button>
        </div>
      </Card>

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
        {consoGeneral && Math.abs(sommeIndiv - consoGeneral.m3) > 5 && (
          <p className="text-xs text-amber-700 mt-3">
            Écart notable : somme individuelle {sommeIndiv} m³ vs général {consoGeneral.m3} m³ — à vérifier.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Régularisation des charges d'eau</h2>
        <div className="flex flex-wrap gap-4">
          <Field label="Prix du m³ (€)">
            <input type="number" step="0.01" className="w-32 border border-stone-300 rounded px-2 py-1" value={tarifs.prix_m3}
              onChange={(e) => maj_tarifs({ prix_m3: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Abonnement annuel (€)">
            <input type="number" step="0.01" className="w-32 border border-stone-300 rounded px-2 py-1" value={tarifs.abonnement_annuel}
              onChange={(e) => maj_tarifs({ abonnement_annuel: parseFloat(e.target.value) || 0 })} />
          </Field>
          <Field label="Nombre de parts">
            <input type="number" className="w-32 border border-stone-300 rounded px-2 py-1" value={tarifs.nombre_parts}
              onChange={(e) => maj_tarifs({ nombre_parts: parseFloat(e.target.value) || 1 })} />
          </Field>
        </div>
        <div className="mt-3">
          <DataTable
            empty="Aucun lot."
            columns={[
              { key: "lot", label: "Lot" },
              { key: "conso", label: "Conso" },
              { key: "cout", label: "Coût total" },
              { key: "avance", label: "Avance/an" },
              { key: "solde", label: "Solde" },
            ]}
            rows={lots.map((l) => {
              const conso = l.compteur_id ? consommation(l.compteur_id) : null;
              const coutEau = conso ? conso.m3 * tarifs.prix_m3 : null;
              const part = tarifs.abonnement_annuel / (tarifs.nombre_parts || 1);
              const coutTotal = coutEau !== null ? coutEau + part : null;
              const avance = (l.avance_eau || 0) * 12;
              const solde = coutTotal !== null ? avance - coutTotal : null;
              return {
                key: l.id,
                cells: {
                  lot: l.nom,
                  conso: conso ? `${conso.m3} m³` : "—",
                  cout: coutTotal !== null ? eur(coutTotal) : "—",
                  avance: eur(avance),
                  solde: solde !== null
                    ? <Badge tone={solde >= 0 ? "green" : "red"}>{solde >= 0 ? `à rembourser ${eur(solde)}` : `à réclamer ${eur(-solde)}`}</Badge>
                    : "—",
                },
              };
            })}
          />
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Quote-part de taxe foncière</h2>
        <div className="flex flex-wrap gap-4 mb-3">
          <Field label="Année"><input type="number" className="w-28 border border-stone-300 rounded px-2 py-1" value={taxeFonciere.annee} onChange={(e) => maj_taxe({ annee: parseInt(e.target.value) || 0 })} /></Field>
          <Field label="Montant annuel immeuble (€)"><input type="number" className="w-40 border border-stone-300 rounded px-2 py-1" value={taxeFonciere.montant_annuel} onChange={(e) => maj_taxe({ montant_annuel: parseFloat(e.target.value) || 0 })} /></Field>
        </div>
        <DataTable
          empty="Aucun local commercial."
          columns={[
            { key: "local", label: "Local commercial" },
            { key: "part", label: "Quote-part (1/4)" },
          ]}
          rows={lots.filter((l) => l.type === "commercial").map((l) => ({
            key: l.id,
            cells: { local: l.nom, part: eur(taxeFonciere.montant_annuel / 4) },
          }))}
        />
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <Shell><EauInner /></Shell>
    </AuthGuard>
  );
}
