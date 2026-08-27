"use client";
import { Suspense, useMemo, useState } from "react";
import { Card, Field, DataTable, Bandeau, DialogueSuppression, Squelette, Volet, useRetour, useStatutsChamps } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { majTable, rafraichir, useTable } from "@/lib/donnees";
import { useParamUrl } from "@/lib/etat-url";
import { eur, fdate, todayISO, genererTexteFacture, genererTexteQuittance, TYPES_DOCUMENT, labelTypeDocument, ajouterMois, joursRestants, nettoyerNomFichier } from "@/lib/helpers";

const BUCKET = "documents";

// 15 Mo : au-delà, un envoi depuis un téléphone en 4G échoue plus souvent
// qu'il n'aboutit, et un scan de bail n'a aucune raison d'être si lourd.
const TAILLE_MAX = 15 * 1024 * 1024;


const BAILLEUR_VIDE = { nom: "", adresse: "", siret: "", tva_intra: "" };

function DocumentsInner() {
  const [periode, setPeriode] = useState(todayISO().slice(0, 7));
  const [trimestriel, setTrimestriel] = useState(true);
  const [preview, setPreview] = useState(null);
  const [fichier, setFichier] = useState(null);
  const [uploadType, setUploadType] = useState("bail");
  const [uploadTitre, setUploadTitre] = useState("");
  const [uploadEmission, setUploadEmission] = useState(todayISO());
  const [uploadExpiration, setUploadExpiration] = useState("");
  const [generation, setGeneration] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Filtres dans l'adresse : « diagnostic à renouveler » sur le tableau de bord
  // amène ici sur le bon lot et le bon type, la ligne cherchée à l'écran.
  const [filtreLot, setFiltreLot] = useParamUrl("lot");
  const [filtreType, setFiltreType] = useParamUrl("type");
  const [aSupprimer, setASupprimer] = useState(null);
  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const retour = useRetour();
  const champs = useStatutsChamps();

  const { donnees: tousLots, chargement } = useTable("lots");
  const { donnees: documents } = useTable("documents");
  const bailleur = useTable("bailleur").donnees[0] || BAILLEUR_VIDE;
  // On n'émet ni quittance ni bail pour un lot vacant.
  const lots = useMemo(() => tousLots.filter((l) => l.type !== "vacant"), [tousLots]);

  // Tant qu'on n'a pas choisi dans la liste, c'est le lot de l'adresse —
  // celui d'où l'on vient — plutôt que le premier de la liste : « Générer une
  // quittance » depuis une fiche vise ce lot-là.
  const [lotSaisi, setLotSaisi] = useState(null);
  const [uploadLotSaisi, setUploadLotSaisi] = useState(null);
  const lotVise = lots.some((l) => l.id === filtreLot) ? filtreLot : lots[0]?.id || "";
  const lotId = lotSaisi !== null ? lotSaisi : lotVise;
  const uploadLotId = uploadLotSaisi !== null ? uploadLotSaisi : lotVise;

  const lot = lots.find((l) => l.id === lotId);
  const typesPresents = [...new Set(documents.map((d) => d.type).filter(Boolean))].sort();
  // Une valeur d'adresse absente des listes déroulantes est ignorée : sinon
  // l'historique se vide pendant que le filtre affiche « Tous les types ».
  const filtreLotActif = lots.some((l) => l.id === filtreLot) ? filtreLot : "";
  const filtreTypeActif = typesPresents.includes(filtreType) ? filtreType : "";
  const documentsFiltres = documents.filter((d) =>
    (!filtreLotActif || d.lot_id === filtreLotActif) && (!filtreTypeActif || d.type === filtreTypeActif));

  async function majBailleur(patch, libelle) {
    const colonne = Object.keys(patch)[0];
    const avant = bailleur;
    champs.debut(colonne);
    majTable("bailleur", (liste) => liste.map((b) => ({ ...b, ...patch })));
    const { error } = await supabase.from("bailleur").update(patch).eq("id", 1);
    if (error) {
      majTable("bailleur", () => [avant]);
      champs.echec(colonne);
      retour.echec(`${libelle} : modification non enregistrée`, error);
      return;
    }
    // Le succès se dit dans le champ ; le bandeau reste pour les erreurs.
    champs.succes(colonne);
  }

  async function generer() {
    if (!lot) return;
    setGeneration(true);
    const isCommercial = lot.type === "commercial";
    const type = isCommercial ? "facture" : "quittance";

    // Un seul appel : Postgres incrémente et rend le nouveau numéro dans la
    // même opération. Deux onglets ne peuvent plus obtenir le même.
    const { data: nextCompteur, error: errCompteur } = await supabase
      .rpc("prochain_numero_document", { p_type: type });
    if (errCompteur) {
      const absente = /function|does not exist|schema cache|PGRST202/i.test(errCompteur.message || "");
      retour.echec(
        absente
          ? "La migration 04 n'a pas encore été passée dans Supabase (fonction prochain_numero_document manquante)."
          : "Le numéro de document n'a pas pu être réservé",
        absente ? undefined : errCompteur,
      );
      setGeneration(false);
      return;
    }

    const annee = new Date().getFullYear();
    const numero = `${type === "facture" ? "FA" : "QU"}-${annee}-${String(nextCompteur).padStart(4, "0")}`;
    const texte = isCommercial
      ? genererTexteFacture(lot, periode, numero, bailleur, trimestriel)
      : genererTexteQuittance(lot, periode, bailleur);

    const { error: errIns } = await supabase.from("documents")
      .insert({ type, lot_id: lotId, periode, numero, date_emission: todayISO(), texte });
    setGeneration(false);
    if (errIns) {
      retour.echec(`Le document ${numero} n'a pas été archivé — le numéro reste réservé`, errIns);
      return;
    }

    retour.succes(`${type === "facture" ? "Facture" : "Quittance"} ${numero} générée`);
    setPreview(texte);
    rafraichir("documents");
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
    if (!fichier || !uploadLotId) { retour.echec("Choisissez un lot et un fichier."); return; }
    if (fichier.size > TAILLE_MAX) {
      retour.echec(`Fichier trop volumineux (${Math.round(fichier.size / 1048576)} Mo). Maximum 15 Mo.`);
      return;
    }
    setEnvoi(true);
    // Le nom d'origine partait tel quel dans la clé de stockage : accents,
    // espaces et tirets cadratins la rendaient invalide ou illisible.
    const path = `${uploadLotId}/${Date.now()}-${nettoyerNomFichier(fichier.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, fichier);
    if (error) { retour.echec("Le fichier n'a pas pu être envoyé", error); setEnvoi(false); return; }

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
    setEnvoi(false);
    if (errIns) {
      if (/titre|date_expiration|schema cache/i.test(errIns.message)) {
        retour.echec("La migration 02 n'a pas encore été passée dans Supabase (colonnes titre / date_expiration manquantes).");
      } else {
        retour.echec("Le document n'a pas été archivé", errIns);
      }
      return;
    }
    retour.succes("Document archivé");
    setFichier(null);
    setUploadTitre("");
    rafraichir("documents");
  }

  async function confirmerSuppression() {
    setSuppressionEnCours(true);
    // Le fichier part avec la ligne : le laisser dans le bucket, c'est garder
    // une donnée personnelle qu'on croyait avoir retirée.
    if (aSupprimer.fichier_path) {
      const { error } = await supabase.storage.from(BUCKET).remove([aSupprimer.fichier_path]);
      if (error) {
        retour.echec("Le fichier n'a pas pu être supprimé — la ligne est conservée", error);
        setSuppressionEnCours(false);
        setASupprimer(null);
        return;
      }
    }
    const { error } = await supabase.from("documents").delete().eq("id", aSupprimer.id);
    setSuppressionEnCours(false);
    if (error) { retour.echec("Le document n'a pas été supprimé", error); setASupprimer(null); return; }
    retour.succes("Document supprimé");
    setASupprimer(null);
    rafraichir("documents");
  }

  async function voirFichier(path) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error) { retour.echec("Le fichier n'a pas pu être ouvert", error); return; }
    window.open(data.signedUrl, "_blank");
  }

  if (chargement) return <Squelette cartes={3} />;

  return (
    <div className="space-y-4">
      <Card className="bg-amber-50 border-amber-200">
        <p className="text-sm text-amber-900">
          Réforme de la facturation électronique : réception obligatoire pour toutes les entreprises assujetties dès le 1er septembre 2026 ; émission progressive selon la taille de l'entreprise (généralisation en septembre 2027). Vérifiez votre statut avant d'envoyer vos factures commerciales.
        </p>
      </Card>

      <Volet titre="Coordonnées du bailleur">
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Nom / raison sociale" statut={champs.statuts.nom}><input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={bailleur.nom} onBlur={(e) => majBailleur({ nom: e.target.value }, "Nom du bailleur")} /></Field>
          <Field label="Adresse" statut={champs.statuts.adresse}><input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={bailleur.adresse} onBlur={(e) => majBailleur({ adresse: e.target.value }, "Adresse")} /></Field>
          <Field label="SIRET" statut={champs.statuts.siret}><input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={bailleur.siret} onBlur={(e) => majBailleur({ siret: e.target.value }, "SIRET")} /></Field>
          <Field label="N° TVA intracommunautaire" statut={champs.statuts.tva_intra}><input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={bailleur.tva_intra} onBlur={(e) => majBailleur({ tva_intra: e.target.value }, "N° de TVA")} /></Field>
        </div>
      </Volet>

      <Volet titre="Générer une quittance ou une facture" defautOuvert>
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <Field label="Lot">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={lotId} onChange={(e) => setLotSaisi(e.target.value)}>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
          </Field>
          <Field label="Période"><input type="month" className="w-full border border-stone-300 rounded px-2 py-1" value={periode} onChange={(e) => setPeriode(e.target.value)} /></Field>
          <button onClick={generer} disabled={generation} className="w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm md:h-fit disabled:opacity-50">
            {generation ? "Génération…" : lot?.type === "commercial" ? "Générer la facture" : "Générer la quittance"}
          </button>
        </div>
        {lot?.type === "commercial" && (
          <label className="flex items-center gap-2 text-sm mt-3 text-stone-600">
            <input type="checkbox" checked={trimestriel} onChange={(e) => setTrimestriel(e.target.checked)} />
            Facturation trimestrielle
          </label>
        )}
      </Volet>

      {preview && (
        <Card data-imprimable>
          <div className="flex items-center justify-between gap-3 mb-2" data-sans-impression>
            <h2 className="font-serif text-lg">Aperçu</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => window.print()}
                className="px-3 py-2 md:py-1.5 rounded bg-slate-900 text-white text-sm">
                Imprimer / PDF
              </button>
              <button onClick={() => setPreview(null)} aria-label="Fermer l'aperçu"
                className="px-3 py-2 md:py-1.5 rounded border border-stone-300 text-stone-700 text-sm">
                Fermer
              </button>
            </div>
          </div>
          <pre className="whitespace-pre-wrap text-sm bg-stone-50 border border-stone-200 rounded p-4 font-sans">{preview}</pre>
          <p className="text-xs text-stone-500 mt-3" data-sans-impression>
            « Imprimer / PDF » ouvre la fenêtre d'impression du navigateur : choisissez
            « Enregistrer au format PDF » comme destination pour obtenir un fichier à envoyer.
          </p>
        </Card>
      )}

      <Volet titre="Archiver un document">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Type de document">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={uploadType} onChange={(e) => changerType(e.target.value)}>
              {TYPES_DOCUMENT.map((t) => <option key={t.cle} value={t.cle}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Lot concerné">
            <select className="w-full border border-stone-300 rounded px-2 py-1" value={uploadLotId} onChange={(e) => setUploadLotSaisi(e.target.value)}>
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
        <button onClick={uploaderFichier} disabled={envoi} className="mt-3 w-full md:w-auto px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50">
          {envoi ? "Envoi…" : "Envoyer"}
        </button>
        <p className="text-xs text-stone-500 mt-2">Stocké dans le bucket privé Supabase Storage « {BUCKET} », accessible uniquement aux comptes autorisés.</p>
      </Volet>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-serif text-lg">Historique</h2>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <select className="flex-1 min-w-0 md:flex-none border border-stone-300 rounded px-2 py-1 text-sm" value={filtreLotActif}
              onChange={(e) => setFiltreLot(e.target.value)} aria-label="Filtrer par lot">
              <option value="">Tous les lots</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
            </select>
            <select className="flex-1 min-w-0 md:flex-none border border-stone-300 rounded px-2 py-1 text-sm" value={filtreTypeActif}
              onChange={(e) => setFiltreType(e.target.value)} aria-label="Filtrer par type">
              <option value="">Tous les types</option>
              {typesPresents.map((t) => <option key={t} value={t}>{labelTypeDocument(t)}</option>)}
            </select>
          </div>
        </div>
        <DataTable
          empty="Aucun document pour l'instant."
          columns={[
            { key: "numero", label: "N°/Nom" },
            { key: "type", label: "Type" },
            { key: "lot", label: "Lot" },
            { key: "emis", label: "Émis le" },
            { key: "validite", label: "Validité" },
            { key: "voir", label: "", action: true },
            { key: "suppr", label: "", action: true },
          ]}
          rows={documentsFiltres.map((d) => {
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
                suppr: (
                  <button onClick={() => setASupprimer(d)} aria-label="Supprimer ce document" className="text-stone-500 hover:text-red-600 p-1">✕</button>
                ),
              },
            };
          })}
        />
      </Card>
      <DialogueSuppression
        cible={aSupprimer}
        titre="Supprimer ce document ?"
        description={aSupprimer
          ? `${aSupprimer.titre || aSupprimer.numero || labelTypeDocument(aSupprimer.type)} — ${fdate(aSupprimer.date_emission)}.${aSupprimer.fichier_path ? " Le fichier joint sera supprimé du stockage." : ""}`
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
  // useSearchParams lit l'adresse au moment du rendu : Next exige une frontière
  // de suspension autour du composant qui s'en sert.
  return (
    <Suspense fallback={<p className="text-stone-500">Chargement…</p>}>
      <DocumentsInner />
    </Suspense>
  );
}
