"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Field, DataTable } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur, fdate, todayISO, genererTexteFacture, genererTexteQuittance, TYPES_DOCUMENT, labelTypeDocument, ajouterMois, joursRestants } from "@/lib/helpers";

const BUCKET = "documents";

function DocumentsInner() {
  const [lots, setLots] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [bailleur, setBailleur] = useState({ nom: "", adresse: "", siret: "", tva_intra: "" });
  const [lotId, setLotId] = useState("");
  const [periode, setPeriode] = useState(todayISO().slice(0, 7));
  const [trimestriel, setTrimestriel] = useState(true);
  const [preview, setPreview] = useState(null);
  const [uploadLotId, setUploadLotId] = useState("");
  const [fichier, setFichier] = useState(null);
  const [uploadType, setUploadType] = useState("bail");
  const [uploadTitre, setUploadTitre] = useState("");
  const [uploadEmission, setUploadEmission] = useState(todayISO());
  const [uploadExpiration, setUploadExpiration] = useState("");
  const [uploadErreur, setUploadErreur] = useState("");
  const [chargement, setChargement] = useState(true);

  async function charger() {
    const { data: lotsData } = await supabase.from("lots").select("*").neq("type", "vacant").order("id");
    const { data: docsData } = await supabase.from("documents").select("*").order("date_emission", { ascending: false });
    const { data: bailleurData } = await supabase.from("bailleur").select("*").eq("id", 1).single();
    setLots(lotsData || []);
    setDocuments(docsData || []);
    if (bailleurData) setBailleur(bailleurData);
    if (lotsData && lotsData.length) { setLotId(lotsData[0].id); setUploadLotId(lotsData[0].id); }
    setChargement(false);
  }
  useEffect(() => { charger(); }, []);

  const lot = lots.find((l) => l.id === lotId);

  async function majBailleur(patch) {
    setBailleur((b) => ({ ...b, ...patch }));
    await supabase.from("bailleur").update(patch).eq("id", 1);
  }

  async function generer() {
    if (!lot) return;
    const isCommercial = lot.type === "commercial";
    const type = isCommercial ? "facture" : "quittance";
    const { data: counterRow } = await supabase.from("doc_counters").select("*").eq("type", type).single();
    const nextCompteur = (counterRow?.compteur || 0) + 1;
    await supabase.from("doc_counters").update({ compteur: nextCompteur }).eq("type", type);
    const annee = new Date().getFullYear();
    const numero = `${type === "facture" ? "FA" : "QU"}-${annee}-${String(nextCompteur).padStart(4, "0")}`;
    const texte = isCommercial
      ? genererTexteFacture(lot, periode, numero, bailleur, trimestriel)
      : genererTexteQuittance(lot, periode, bailleur);

    await supabase.from("documents").insert({ type, lot_id: lotId, periode, numero, date_emission: todayISO(), texte });
    setPreview(texte);
    charger();
  }

  // La date d'expiration se déduit du type : 10 ans pour un DPE, 6 ans pour
  // l'électricité, 6 mois pour l'ERP… tout en restant modifiable à la main.
  function changerType(cle) {
    setUploadType(cle);
    const t = TYPES_DOCUMENT.find((x) => x.cle === cle);
    setUploadExpiration(t?.validiteMois ? ajouterMois(uploadEmission, t.validiteMois) : "");
  }
  function changerEmission(d) {
    setUploadEmission(d);
    const t = TYPES_DOCUMENT.find((x) => x.cle === uploadType);
    if (t?.validiteMois) setUploadExpiration(ajouterMois(d, t.validiteMois));
  }

  async function uploaderFichier() {
    setUploadErreur("");
    if (!fichier || !uploadLotId) { setUploadErreur("Choisissez un lot et un fichier."); return; }
    const path = `${uploadLotId}/${Date.now()}-${fichier.name}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, fichier);
    if (error) { setUploadErreur("Échec de l'envoi : " + error.message); return; }

    const { error: errIns } = await supabase.from("documents").insert({
      type: uploadType,
      lot_id: uploadLotId,
      periode: "",
      numero: fichier.name,
      titre: uploadTitre || labelTypeDocument(uploadType),
      date_emission: uploadEmission || todayISO(),
      date_expiration: uploadExpiration || null,
      fichier_path: path,
    });
    if (errIns) {
      setUploadErreur(/titre|date_expiration|schema cache/i.test(errIns.message)
        ? "La migration 02 n'a pas encore été passée dans Supabase (colonnes titre / date_expiration manquantes)."
        : "Enregistrement impossible : " + errIns.message);
      return;
    }
    setFichier(null);
    setUploadTitre("");
    charger();
  }

  async function voirFichier(path) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) { alert("Impossible d'ouvrir le fichier : " + error.message); return; }
    window.open(data.signedUrl, "_blank");
  }

  if (chargement) return <p className="text-stone-400">Chargement…</p>;

  return (
    <div className="space-y-4">
      <Card className="bg-amber-50 border-amber-200">
        <p className="text-sm text-amber-900">
          Réforme de la facturation électronique : réception obligatoire pour toutes les entreprises assujetties dès le 1er septembre 2026 ; émission progressive selon la taille de l'entreprise (généralisation en septembre 2027). Vérifiez votre statut avant d'envoyer vos factures commerciales.
        </p>
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Coordonnées du bailleur</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Nom / raison sociale"><input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={bailleur.nom} onBlur={(e) => majBailleur({ nom: e.target.value })} /></Field>
          <Field label="Adresse"><input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={bailleur.adresse} onBlur={(e) => majBailleur({ adresse: e.target.value })} /></Field>
          <Field label="SIRET"><input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={bailleur.siret} onBlur={(e) => majBailleur({ siret: e.target.value })} /></Field>
          <Field label="N° TVA intracommunautaire"><input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={bailleur.tva_intra} onBlur={(e) => majBailleur({ tva_intra: e.target.value })} /></Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Générer un document</h2>
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <Field label="Lot">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={lotId} onChange={(e) => setLotId(e.target.value)}>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
          </Field>
          <Field label="Période"><input type="month" className="w-full border border-stone-300 rounded px-2 py-1" value={periode} onChange={(e) => setPeriode(e.target.value)} /></Field>
          <button onClick={generer} className="w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm md:h-fit">
            {lot?.type === "commercial" ? "Générer la facture" : "Générer la quittance"}
          </button>
        </div>
        {lot?.type === "commercial" && (
          <label className="flex items-center gap-2 text-sm mt-3 text-stone-600">
            <input type="checkbox" checked={trimestriel} onChange={(e) => setTrimestriel(e.target.checked)} />
            Facturation trimestrielle
          </label>
        )}
      </Card>

      {preview && (
        <Card>
          <h2 className="font-serif text-lg mb-2">Aperçu</h2>
          <pre className="whitespace-pre-wrap text-sm bg-stone-50 border border-stone-200 rounded p-4 font-sans">{preview}</pre>
        </Card>
      )}

      <Card>
        <h2 className="font-serif text-lg mb-3">Archiver un document</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Type de document">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={uploadType} onChange={(e) => changerType(e.target.value)}>
              {TYPES_DOCUMENT.map((t) => <option key={t.cle} value={t.cle}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Lot concerné">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={uploadLotId} onChange={(e) => setUploadLotId(e.target.value)}>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
          </Field>
          <Field label="Intitulé (facultatif)">
            <input className="w-full border border-stone-300 rounded px-2 py-1" value={uploadTitre}
              onChange={(e) => setUploadTitre(e.target.value)} placeholder={labelTypeDocument(uploadType)} />
          </Field>
          <Field label="Établi le">
            <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" value={uploadEmission}
              onChange={(e) => changerEmission(e.target.value)} />
          </Field>
          <Field label="Valable jusqu'au">
            <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" value={uploadExpiration}
              onChange={(e) => setUploadExpiration(e.target.value)} />
          </Field>
          <Field label="Fichier (PDF, image…)">
            <input type="file" className="w-full text-sm" onChange={(e) => setFichier(e.target.files?.[0] || null)} />
          </Field>
        </div>
        {uploadErreur && <p className="text-sm text-red-600 mt-2">{uploadErreur}</p>}
        <button onClick={uploaderFichier} className="mt-3 w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm">Envoyer</button>
        <p className="text-xs text-stone-500 mt-2">Stocké dans le bucket privé Supabase Storage « {BUCKET} », accessible uniquement aux comptes autorisés.</p>
      </Card>

      <Card>
        <h2 className="font-serif text-lg mb-3">Historique</h2>
        <DataTable
          empty="Aucun document pour l'instant."
          columns={[
            { key: "numero", label: "N°/Nom" },
            { key: "type", label: "Type" },
            { key: "lot", label: "Lot" },
            { key: "emis", label: "Émis le" },
            { key: "validite", label: "Validité" },
            { key: "voir", label: "", action: true },
          ]}
          rows={documents.map((d) => {
            const l = lots.find((x) => x.id === d.lot_id);
            return {
              key: d.id,
              cells: {
                numero: d.titre || d.numero,
                type: labelTypeDocument(d.type),
                lot: l?.nom || d.lot_id,
                emis: fdate(d.date_emission),
                validite: d.date_expiration
                  ? (joursRestants(d.date_expiration) < 0
                      ? <span className="text-red-600">périmé le {fdate(d.date_expiration)}</span>
                      : <span>{fdate(d.date_expiration)}</span>)
                  : "—",
                voir: d.fichier_path ? (
                  <button onClick={() => voirFichier(d.fichier_path)} className="text-emerald-700 hover:underline p-1">ouvrir</button>
                ) : (
                  <button onClick={() => setPreview(d.texte)} className="text-emerald-700 hover:underline p-1">voir</button>
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
      <Shell><DocumentsInner /></Shell>
    </AuthGuard>
  );
}
