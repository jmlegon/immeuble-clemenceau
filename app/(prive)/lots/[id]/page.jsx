"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, Badge, Field, DataTable, Bandeau, Squelette, useRetour, useStatutsChamps } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { majTable, useTable } from "@/lib/donnees";
import {
  eur, fdate, fmois, todayISO, moisCourant, moisEntre, moisManquants, ecartVersements, montantAttendu,
  prochaineOccurrence, joursRestants, joursEntre, consommationSurPeriode, regularisationEau,
  compteurLabels, nombreOuNull, TYPES_LOT, PERIODICITES, labelTypeLot, labelPeriodicite,
  labelTypeDocument, labelCategorie,
} from "@/lib/helpers";

const I = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

function Section({ titre, action, children }) {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
        <h2 className="font-serif text-lg">{titre}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** Ligne de lecture : intitulé à gauche, valeur à droite. */
function Ligne({ label, children }) {
  const vide = children === null || children === undefined || children === "";
  return (
    <div className="flex justify-between gap-4 text-sm py-1.5 border-b border-stone-100 last:border-0">
      <dt className="text-stone-500 shrink-0">{label}</dt>
      <dd className={`text-right min-w-0 break-words ${vide ? "text-stone-400" : ""}`}>{vide ? "à renseigner" : children}</dd>
    </div>
  );
}

/** Bouton-lien vers l'écran qui porte l'action, ce lot déjà sélectionné. */
function Action({ href, children }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 md:py-1.5 rounded border border-stone-300 text-stone-700 text-sm hover:border-stone-400 hover:text-stone-900"
    >
      {children}
    </Link>
  );
}

// Couleur d'un mois dans la frise des encaissements.
const ETATS = {
  paye: { classe: "bg-emerald-500", libelle: "payé" },
  partiel: { classe: "bg-red-500", libelle: "versement incomplet" },
  avance: { classe: "bg-amber-400", libelle: "versé en trop" },
  manquant: { classe: "bg-red-200", libelle: "aucun paiement enregistré" },
  attente: { classe: "bg-stone-300", libelle: "mois en cours, pas encore échu" },
  hors: { classe: "bg-stone-100", libelle: "hors bail" },
};

function FicheLot() {
  const { id } = useParams();
  const [edition, setEdition] = useState(false);
  // Incrémenté quand une écriture est refusée : change la clé du bloc, ce qui
  // le remonte et redonne aux champs (non contrôlés) la valeur réellement en base.
  const [revision, setRevision] = useState(0);
  const [encaissementEnCours, setEncaissementEnCours] = useState(null);
  const retour = useRetour();
  const champs = useStatutsChamps();

  // Tables complètes, partagées avec les autres écrans, filtrées ici sur ce lot.
  // Elles tiennent en quelques dizaines de lignes : une requête par lot aurait
  // coûté un aller-retour de plus à chaque fiche ouverte, sans rien économiser.
  const { donnees: lots, chargement } = useTable("lots");
  const tousPaiements = useTable("paiements").donnees;
  const toutesIndexations = useTable("indexations").donnees;
  const tousDocuments = useTable("documents").donnees;
  const toutesDepenses = useTable("depenses").donnees;
  const tousReleves = useTable("releves_eau").donnees;
  const tarifs = useTable("eau_tarifs").donnees[0] || null;

  const lot = lots.find((l) => l.id === id) || null;
  const compteur = lot?.compteur_id || null;

  const paiements = useMemo(() => tousPaiements.filter((p) => p.lot_id === id), [tousPaiements, id]);
  const indexations = useMemo(() => toutesIndexations.filter((x) => x.lot_id === id), [toutesIndexations, id]);
  const documents = useMemo(() => tousDocuments.filter((d) => d.lot_id === id), [tousDocuments, id]);
  const depenses = useMemo(() => toutesDepenses.filter((d) => d.lot_id === id), [toutesDepenses, id]);
  const releves = useMemo(
    () => (compteur ? tousReleves.filter((r) => r.compteur_id === compteur) : []),
    [tousReleves, compteur],
  );

  async function updateLot(patch, libelle) {
    const colonne = Object.keys(patch)[0];
    const avant = lot;
    champs.debut(colonne);
    majTable("lots", (liste) => liste.map((l) => (l.id === id ? { ...l, ...patch } : l)));

    const { error } = await supabase.from("lots").update(patch).eq("id", id);
    if (error) {
      // L'écran ne doit pas continuer d'afficher une valeur que la base a refusée.
      majTable("lots", (liste) => liste.map((l) => (l.id === id ? avant : l)));
      champs.echec(colonne);
      setRevision((r) => r + 1);
      retour.echec(`${libelle} : modification non enregistrée`, error);
      return;
    }
    // Le succès se dit dans le champ ; le bandeau reste pour les erreurs.
    champs.succes(colonne);
  }

  async function encaisser(periode, attendu) {
    setEncaissementEnCours(periode);
    const { data, error } = await supabase.from("paiements")
      .insert({ lot_id: id, periode, attendu, montant: attendu, date_paiement: todayISO() })
      .select()
      .single();
    setEncaissementEnCours(null);
    if (error) { retour.echec(`${fmois(periode)} : le paiement n'a pas été enregistré`, error); return; }
    const ligne = data || { id: `${id}-${periode}`, lot_id: id, periode, attendu, montant: attendu };
    majTable("paiements", (prev) => [ligne, ...prev]);
    retour.succes(`${fmois(periode)} encaissé (${eur(attendu)})`);
  }

  if (chargement) return <Squelette cartes={3} />;

  if (!lot) {
    return (
      <Card>
        <h1 className="font-serif text-lg mb-2">Lot introuvable</h1>
        <p className="text-sm text-stone-600">
          Aucun lot ne porte l&apos;identifiant <code>{id}</code>. Il a peut-être été supprimé.
        </p>
        <Link href="/lots" className="inline-block mt-3 text-sm text-emerald-700 underline">Revenir à la liste des lots</Link>
      </Card>
    );
  }

  // ---- Encaissements sur douze mois glissants ----
  const courant = moisCourant();
  const [a, m] = courant.split("-").map(Number);
  const fenetre = moisEntre(`${a - 1}-${String(m).padStart(2, "0")}`, courant);
  const mensuel = (lot.periodicite_facturation || "mensuelle") !== "trimestrielle";
  const debutBail = lot.debut_bail ? lot.debut_bail.slice(0, 7) : null;
  const depart = lot.date_depart ? lot.date_depart.slice(0, 7) : null;

  const frise = fenetre.map((mo) => {
    const p = paiements.find((x) => x.periode === mo);
    if (p) {
      const ecart = (p.montant || 0) - (p.attendu || 0);
      return { mo, etat: Math.abs(ecart) < 0.01 ? "paye" : ecart > 0 ? "avance" : "partiel" };
    }
    if ((debutBail && mo < debutBail) || (depart && mo > depart)) return { mo, etat: "hors" };
    return { mo, etat: mo === courant ? "attente" : "manquant" };
  });

  const manquants = moisManquants(lot, paiements, fenetre);
  const { manque, avance } = ecartVersements(paiements, fenetre[0]);
  const encaisseFenetre = paiements
    .filter((p) => (p.periode || "") >= fenetre[0])
    .reduce((s, p) => s + (p.montant || 0), 0);

  // ---- Révision ----
  const prochaineRevision = prochaineOccurrence(lot.revision_jour_mois);
  const joursRevision = prochaineRevision ? joursRestants(prochaineRevision) : null;

  // ---- Eau ----
  const dernierReleve = releves[releves.length - 1];
  const precedent = releves[releves.length - 2];
  const consoM3 = dernierReleve && precedent ? dernierReleve.index_value - precedent.index_value : null;
  const regul = tarifs && dernierReleve && precedent
    ? regularisationEau({
        m3: consoM3,
        jours: joursEntre(precedent.date, dernierReleve.date),
        prixM3: tarifs.prix_m3,
        abonnementAnnuel: tarifs.abonnement_annuel,
        nombreParts: tarifs.nombre_parts,
        avanceMensuelle: lot.avance_eau || 0,
      })
    : null;

  // ---- Dépenses de l'année en cours ----
  const anneeCourante = String(new Date().getFullYear());
  const depensesAnnee = depenses.filter((d) => (d.date || "").startsWith(anneeCourante));
  const totalDepenses = depensesAnnee.reduce((s, d) => s + (d.montant || 0), 0);

  const vacant = lot.type === "vacant";
  const cleEdition = `edition-${revision}`;

  return (
    <div className="space-y-4">
      <Link href="/lots" className="inline-flex items-center gap-1 text-sm text-emerald-700">
        <svg viewBox="0 0 24 24" {...I} className="w-4 h-4"><path d="M15 18l-6-6 6-6" /></svg>
        Tous les lots
      </Link>

      <Card>
        {/* Sur téléphone, le loyer passe sous le titre : à droite, il réduisait
            le nom du lot à une colonne de trois mots de large. */}
        <div className="md:flex md:items-start md:justify-between md:gap-3">
          <div className="min-w-0">
            {lot.localisation && <p className="text-xs text-stone-500">{lot.localisation}</p>}
            <h1 className="font-serif text-2xl mt-0.5 break-words">{lot.nom}</h1>
            <p className="text-sm text-stone-500 mt-1">{lot.locataire || "Aucun locataire"}</p>
          </div>
          <div className="mt-2 md:mt-0 flex items-center gap-3 md:block md:text-right shrink-0">
            <p className="font-medium">{lot.loyer_mensuel_ht ? `${eur(lot.loyer_mensuel_ht)} / mois` : "—"}</p>
            <div className="md:mt-1">
              <Badge tone={vacant ? "gray" : lot.type === "commercial" ? "green" : "amber"}>{labelTypeLot(lot.type)}</Badge>
            </div>
          </div>
        </div>

        {lot.incomplet && lot.incomplet.length > 0 && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-2 text-amber-800 text-xs">
            À compléter : {lot.incomplet.join(" · ")}
          </div>
        )}

        {/* Les écrans de saisie restent les mêmes ; ils arrivent seulement avec
            ce lot déjà sélectionné, ce qui évite de le rechercher à la main. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Action href={`/paiements?lot=${lot.id}`}>Enregistrer un paiement</Action>
          <Action href={`/documents?lot=${lot.id}`}>
            {lot.type === "commercial" ? "Générer une facture" : "Générer une quittance"}
          </Action>
          <Action href={`/depenses?lot=${lot.id}`}>Ajouter une dépense</Action>
          {lot.indice_type && <Action href={`/indexation?lot=${lot.id}`}>Réviser le loyer</Action>}
        </div>
      </Card>

      <Section
        titre="Encaissements — 12 derniers mois"
        action={<span className="text-sm text-stone-500">{eur(encaisseFenetre)} encaissés</span>}
      >
        {mensuel ? (
          <>
            <div className="flex gap-0.5" role="img" aria-label={`Suivi mensuel de ${fmois(fenetre[0])} à ${fmois(courant)}`}>
              {frise.map(({ mo, etat }) => (
                <span
                  key={mo}
                  title={`${fmois(mo)} — ${ETATS[etat].libelle}`}
                  className={`h-6 flex-1 rounded-sm ${ETATS[etat].classe}`}
                />
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-1 flex justify-between">
              <span>{fmois(fenetre[0])}</span>
              <span>{fmois(courant)}</span>
            </p>
            {/* Une couleur ne se devine pas, et l'infobulle du titre n'existe
                pas au doigt : la légende ne liste que les états présents. */}
            <p className="text-xs text-stone-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {[...new Set(frise.map((f) => f.etat))].map((etat) => (
                <span key={etat} className="inline-flex items-center gap-1.5">
                  <span className={`w-3 h-3 rounded-sm ${ETATS[etat].classe}`} />
                  {ETATS[etat].libelle}
                </span>
              ))}
            </p>
          </>
        ) : (
          <p className="text-sm text-stone-500">
            Lot facturé au trimestre : le suivi mois par mois ne s&apos;applique pas, seuls les
            versements incomplets sont signalés.
          </p>
        )}

        {(manque > 0.01 || avance > 0.01) && (
          <p className="text-sm mt-3">
            {manque > 0.01 && <span className="text-red-700">{eur(manque)} manquants sur des versements partiels. </span>}
            {avance > 0.01 && <span className="text-stone-500">{eur(avance)} versés en trop sur d&apos;autres mois.</span>}
          </p>
        )}

        {manquants.length > 0 && (
          <>
            <p className="text-sm mt-3">
              {manquants.length === 1
                ? "Un terme en attente :"
                : `${manquants.length} termes en attente, du plus ancien au plus récent :`}
            </p>
            <div className="mt-1 divide-y divide-stone-100">
            {manquants.map((periode) => {
              const attendu = montantAttendu(lot, indexations, periode);
              return (
                <div key={periode} className="py-2 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <span className="text-sm">
                    {fmois(periode)}
                    {periode !== courant && <span className="text-red-700"> — en retard</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    {attendu > 0 ? (
                      <button
                        onClick={() => encaisser(periode, attendu)}
                        disabled={encaissementEnCours === periode}
                        className="px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50"
                      >
                        {encaissementEnCours === periode ? "Enregistrement…" : `Encaisser ${eur(attendu)}`}
                      </button>
                    ) : (
                      <span className="text-sm text-stone-500">loyer non renseigné</span>
                    )}
                    <Link href={`/paiements?lot=${lot.id}&periode=${periode}`} className="text-sm text-emerald-700 underline">
                      {attendu > 0 ? "Montant différent…" : "Saisir le paiement"}
                    </Link>
                  </span>
                </div>
              );
            })}
            </div>
          </>
        )}

        <div className="mt-4">
          <DataTable
            empty="Aucun paiement enregistré pour ce lot."
            columns={[
              { key: "periode", label: "Période" },
              { key: "attendu", label: "Attendu" },
              { key: "verse", label: "Versé" },
              { key: "statut", label: "Statut" },
              { key: "note", label: "Note" },
            ]}
            rows={paiements.slice(0, 12).map((p) => {
              const diff = (p.montant || 0) - (p.attendu || 0);
              const tone = Math.abs(diff) < 0.01 ? "green" : diff > 0 ? "amber" : "red";
              const label = Math.abs(diff) < 0.01 ? "payé" : diff > 0 ? "avance" : "impayé partiel";
              return {
                key: p.id,
                cells: {
                  periode: fmois(p.periode),
                  attendu: eur(p.attendu),
                  verse: eur(p.montant),
                  statut: <Badge tone={tone}>{label}</Badge>,
                  note: p.note || "—",
                },
              };
            })}
          />
          {paiements.length > 12 && (
            <Link href={`/paiements?filtre_lot=${lot.id}`} className="inline-block mt-2 text-sm text-emerald-700 underline">
              Voir les {paiements.length - 12} paiements plus anciens
            </Link>
          )}
        </div>
      </Section>

      <Section titre="Bail">
        <dl>
          <Ligne label="Type">{labelTypeLot(lot.type)}</Ligne>
          <Ligne label="Locataire">{lot.locataire}</Ligne>
          {lot.type === "commercial" && <Ligne label="SIRET du preneur">{lot.siret}</Ligne>}
          <Ligne label="Début de bail">{lot.debut_bail ? fdate(lot.debut_bail) : null}</Ligne>
          <Ligne label="Fin de bail">
            {lot.fin_bail ? (
              <span className="inline-flex items-center gap-2">
                {fdate(lot.fin_bail)}
                {joursRestants(lot.fin_bail) !== null && joursRestants(lot.fin_bail) <= 365 && (
                  <Badge tone={joursRestants(lot.fin_bail) < 0 ? "red" : "amber"}>
                    {joursRestants(lot.fin_bail) < 0 ? "échu" : `dans ${joursRestants(lot.fin_bail)} j`}
                  </Badge>
                )}
              </span>
            ) : null}
          </Ligne>
          <Ligne label="Périodicité de facturation">{labelPeriodicite(lot.periodicite_facturation)}</Ligne>
          {lot.date_depart && <Ligne label="Départ du locataire">{fdate(lot.date_depart)}</Ligne>}
          {lot.ancien_locataire && <Ligne label="Ancien locataire">{lot.ancien_locataire}</Ligne>}
        </dl>
      </Section>

      {(lot.depot_garantie || lot.date_depart) && (
        <Section titre="Dépôt de garantie">
          <dl>
            <Ligne label="Montant">{lot.depot_garantie ? eur(lot.depot_garantie) : null}</Ligne>
            {lot.date_depart && (
              <>
                <Ligne label="Restitué le">{lot.depot_restitue_le ? fdate(lot.depot_restitue_le) : null}</Ligne>
                <Ligne label="Montant restitué">{lot.depot_montant_restitue !== null && lot.depot_montant_restitue !== undefined ? eur(lot.depot_montant_restitue) : null}</Ligne>
                {lot.depot_retenues_note && <Ligne label="Retenues">{lot.depot_retenues_note}</Ligne>}
              </>
            )}
          </dl>
          {lot.date_depart && !lot.depot_restitue_le && (lot.depot_garantie || 0) > 0 && (
            <p className="text-xs text-amber-700 mt-3">
              Départ le {fdate(lot.date_depart)}, dépôt non restitué. Le délai est d&apos;un mois si
              l&apos;état des lieux de sortie est conforme, deux mois sinon ; au-delà, le dépôt est
              majoré de 10 % du loyer mensuel par mois de retard.
            </p>
          )}
        </Section>
      )}

      <Section
        titre="Loyer et indexation"
        action={lot.indice_type ? (
          <Link href={`/indexation?lot=${lot.id}`} className="text-sm text-emerald-700 underline">Appliquer une révision</Link>
        ) : null}
      >
        <dl>
          <Ligne label="Loyer mensuel HT">{lot.loyer_mensuel_ht ? eur(lot.loyer_mensuel_ht) : null}</Ligne>
          {lot.type === "commercial" && <Ligne label="Taux de TVA">{lot.tva_taux ? `${lot.tva_taux} %` : null}</Ligne>}
          <Ligne label="Avance sur charges (eau)">{eur(lot.avance_eau || 0)}</Ligne>
          <Ligne label="Indice de référence">{lot.indice_type}</Ligne>
          <Ligne label="Indice de base">
            {lot.indice_valeur ? `${lot.indice_valeur}${lot.indice_periode ? ` (${lot.indice_periode})` : ""}` : null}
          </Ligne>
          <Ligne label="Prochaine révision">
            {prochaineRevision ? (
              <span className="inline-flex items-center gap-2">
                {fdate(prochaineRevision)}
                <Badge tone={joursRevision <= 45 ? "amber" : "gray"}>dans {joursRevision} j</Badge>
              </span>
            ) : null}
          </Ligne>
        </dl>

        {indexations.length > 0 && (
          <div className="mt-4 pt-4 border-t border-stone-100">
            <p className="text-xs text-stone-500 uppercase tracking-wide mb-2">Révisions passées</p>
            <DataTable
              columns={[
                { key: "date", label: "Appliquée le" },
                { key: "indice", label: "Indice" },
                { key: "loyer", label: "Loyer" },
                { key: "rappel", label: "Rappel" },
              ]}
              rows={indexations.map((x) => ({
                key: x.id,
                cells: {
                  date: fdate(x.date_application),
                  indice: `${x.indice_ancien ?? "—"} → ${x.indice_nouveau ?? "—"}`,
                  loyer: `${eur(x.loyer_avant)} → ${eur(x.loyer_apres)}`,
                  rappel: x.rappel_montant ? eur(x.rappel_montant) : "—",
                },
              }))}
            />
          </div>
        )}
      </Section>

      {lot.compteur_id && (
        <Section
          titre="Eau"
          action={<Link href="/eau" className="text-sm text-emerald-700 underline">Relevés et tarifs</Link>}
        >
          <dl>
            <Ligne label="Compteur">{compteurLabels[lot.compteur_id] || lot.compteur_id}</Ligne>
            <Ligne label="Dernier relevé">
              {dernierReleve ? `${dernierReleve.index_value} m³ — ${fdate(dernierReleve.date)}` : null}
            </Ligne>
            <Ligne label="Consommation depuis le relevé précédent">
              {consoM3 !== null ? `${consoM3} m³ sur ${regul ? `${regul.jours} j` : "la période"}` : null}
            </Ligne>
            <Ligne label="Avance mensuelle">{eur(lot.avance_eau || 0)}</Ligne>
            {regul && (
              <Ligne label="Solde de régularisation">
                <Badge tone={regul.solde >= 0 ? "green" : "red"}>
                  {regul.solde >= 0 ? `à rembourser ${eur(regul.solde)}` : `à réclamer ${eur(-regul.solde)}`}
                </Badge>
              </Ligne>
            )}
          </dl>
          {!regul && (
            <p className="text-xs text-stone-500 mt-3">
              La régularisation demande deux relevés du compteur : elle apparaîtra dès le second.
            </p>
          )}
        </Section>
      )}

      <Section
        titre="Documents"
        action={<Link href={`/documents?lot=${lot.id}`} className="text-sm text-emerald-700 underline">Archiver un document</Link>}
      >
        <DataTable
          empty="Aucun document rattaché à ce lot."
          columns={[
            { key: "titre", label: "Document" },
            { key: "type", label: "Type" },
            { key: "emis", label: "Émis le" },
            { key: "validite", label: "Validité" },
          ]}
          rows={documents.slice(0, 10).map((d) => ({
            key: d.id,
            cells: {
              titre: d.titre || d.numero || labelTypeDocument(d.type),
              type: labelTypeDocument(d.type),
              emis: fdate(d.date_emission),
              validite: d.date_expiration
                ? (joursRestants(d.date_expiration) < 0
                    ? <span className="text-red-600">périmé le {fdate(d.date_expiration)}</span>
                    : fdate(d.date_expiration))
                : "—",
            },
          }))}
        />
      </Section>

      <Section
        titre={`Dépenses ${anneeCourante}`}
        action={<span className="text-sm text-stone-500">{eur(totalDepenses)}</span>}
      >
        <DataTable
          empty={`Aucune dépense rattachée à ce lot en ${anneeCourante}.`}
          columns={[
            { key: "libelle", label: "Libellé" },
            { key: "date", label: "Date" },
            { key: "categorie", label: "Catégorie" },
            { key: "montant", label: "Montant" },
          ]}
          rows={depensesAnnee.map((d) => ({
            key: d.id,
            cells: {
              libelle: d.libelle || labelCategorie(d.categorie),
              date: fdate(d.date),
              categorie: labelCategorie(d.categorie),
              montant: eur(d.montant),
            },
          }))}
        />
        <p className="text-xs text-stone-500 mt-3">
          Seules les dépenses rattachées à ce lot figurent ici. Les dépenses communes à
          l&apos;immeuble sont réparties au prorata des loyers dans le bilan.
        </p>
      </Section>

      <Card>
        <button
          onClick={() => setEdition((v) => !v)}
          aria-expanded={edition}
          className="w-full flex items-center justify-between gap-3 text-left"
        >
          <h2 className="font-serif text-lg">Modifier la fiche</h2>
          <svg viewBox="0 0 24 24" {...I} className={`w-5 h-5 text-stone-400 transition-transform ${edition ? "rotate-180" : ""}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {edition && (
          <div key={cleEdition} className="mt-4 pt-4 border-t border-stone-100 space-y-6">
            <p className="text-xs text-stone-500">
              Chaque champ s&apos;enregistre en le quittant. L&apos;identifiant du lot
              (<code>{lot.id}</code>) relie ses paiements, dépenses et documents : il ne change pas.
            </p>

            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wide mb-2">Identité</p>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <Field label="Nom du lot" statut={champs.statuts.nom}>
                  <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.nom || ""}
                    onBlur={(e) => updateLot({ nom: e.target.value }, "Nom du lot")} />
                </Field>
                <Field label="Localisation" statut={champs.statuts.localisation}>
                  <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.localisation || ""}
                    onBlur={(e) => updateLot({ localisation: e.target.value }, "Localisation")} />
                </Field>
                <Field label="Type de lot" statut={champs.statuts.type}>
                  <select className="w-full border border-stone-300 rounded px-2 py-1" value={lot.type || ""}
                    onChange={(e) => updateLot({ type: e.target.value }, "Type de lot")}>
                    {TYPES_LOT.map((t) => <option key={t.cle} value={t.cle}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Locataire" statut={champs.statuts.locataire}>
                  <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.locataire || ""}
                    onBlur={(e) => updateLot({ locataire: e.target.value }, "Locataire")} />
                </Field>
                <Field label="N° SIRET" statut={champs.statuts.siret}>
                  <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.siret || ""}
                    onBlur={(e) => updateLot({ siret: e.target.value }, "SIRET")} placeholder="À renseigner" />
                </Field>
                <Field label="Ancien locataire" statut={champs.statuts.ancien_locataire}>
                  <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.ancien_locataire || ""}
                    onBlur={(e) => updateLot({ ancien_locataire: e.target.value }, "Ancien locataire")} />
                </Field>
              </div>
            </div>

            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wide mb-2">Bail</p>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <Field label="Début de bail" statut={champs.statuts.debut_bail}>
                  <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.debut_bail || ""}
                    onBlur={(e) => updateLot({ debut_bail: e.target.value || null }, "Début de bail")} />
                </Field>
                <Field label="Fin de bail" statut={champs.statuts.fin_bail}>
                  <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.fin_bail || ""}
                    onBlur={(e) => updateLot({ fin_bail: e.target.value || null }, "Fin de bail")} />
                </Field>
                <Field label="Périodicité de facturation" statut={champs.statuts.periodicite_facturation}>
                  <select className="w-full border border-stone-300 rounded px-2 py-1" value={lot.periodicite_facturation || "mensuelle"}
                    onChange={(e) => updateLot({ periodicite_facturation: e.target.value }, "Périodicité")}>
                    {PERIODICITES.map((p) => <option key={p.cle} value={p.cle}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Date de départ du locataire" statut={champs.statuts.date_depart}>
                  <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.date_depart || ""}
                    onBlur={(e) => updateLot({ date_depart: e.target.value || null }, "Date de départ")} />
                </Field>
              </div>
            </div>

            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wide mb-2">Loyer et indexation</p>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <Field label="Loyer mensuel HT (€)" statut={champs.statuts.loyer_mensuel_ht}>
                  <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.loyer_mensuel_ht ?? ""}
                    onBlur={(e) => updateLot({ loyer_mensuel_ht: nombreOuNull(e.target.value) }, "Loyer mensuel")} />
                </Field>
                {lot.type === "commercial" && (
                  <Field label="Taux de TVA (%)" statut={champs.statuts.tva_taux}>
                    <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.tva_taux ?? ""}
                      onBlur={(e) => updateLot({ tva_taux: nombreOuNull(e.target.value) }, "Taux de TVA")} />
                  </Field>
                )}
                <Field label="Indice de référence" statut={champs.statuts.indice_type}>
                  <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.indice_type || ""}
                    onBlur={(e) => updateLot({ indice_type: e.target.value }, "Indice de référence")} />
                </Field>
                <Field label="Valeur de l'indice de base" statut={champs.statuts.indice_valeur}>
                  <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.indice_valeur ?? ""}
                    onBlur={(e) => updateLot({ indice_valeur: nombreOuNull(e.target.value) }, "Valeur de l'indice")} />
                </Field>
                <Field label="Période de l'indice de base" statut={champs.statuts.indice_periode}>
                  <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.indice_periode || ""}
                    onBlur={(e) => updateLot({ indice_periode: e.target.value }, "Période de l'indice")} />
                </Field>
                <Field label="Révision (JJ-MM)" statut={champs.statuts.revision_jour_mois}>
                  <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.revision_jour_mois || ""}
                    onBlur={(e) => updateLot({ revision_jour_mois: e.target.value }, "Date de révision")} />
                </Field>
              </div>
            </div>

            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wide mb-2">Charges et compteur</p>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <Field label="Avance / provision sur charges (€)" statut={champs.statuts.avance_eau}>
                  <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.avance_eau || 0}
                    onBlur={(e) => updateLot({ avance_eau: nombreOuNull(e.target.value) ?? 0 }, "Avance sur charges")} />
                </Field>
                <Field label="Compteur d'eau rattaché" statut={champs.statuts.compteur_id}>
                  <select className="w-full border border-stone-300 rounded px-2 py-1" value={lot.compteur_id || ""}
                    onChange={(e) => updateLot({ compteur_id: e.target.value || null }, "Compteur d'eau")}>
                    <option value="">Aucun</option>
                    {Object.entries(compteurLabels).map(([cle, label]) => <option key={cle} value={cle}>{label}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wide mb-2">Dépôt de garantie</p>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <Field label="Dépôt de garantie (€)" statut={champs.statuts.depot_garantie}>
                  <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.depot_garantie ?? ""}
                    onBlur={(e) => updateLot({ depot_garantie: nombreOuNull(e.target.value) }, "Dépôt de garantie")} />
                </Field>
                {lot.date_depart && (lot.depot_garantie || 0) > 0 && (
                  <>
                    <Field label="Dépôt restitué le" statut={champs.statuts.depot_restitue_le}>
                      <input type="date" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.depot_restitue_le || ""}
                        onBlur={(e) => updateLot({ depot_restitue_le: e.target.value || null }, "Date de restitution")} />
                    </Field>
                    <Field label="Montant restitué (€)" statut={champs.statuts.depot_montant_restitue}>
                      <input type="number" className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.depot_montant_restitue ?? ""}
                        onBlur={(e) => updateLot({ depot_montant_restitue: nombreOuNull(e.target.value) }, "Montant restitué")} />
                    </Field>
                    <Field label="Retenues éventuelles (motif)" statut={champs.statuts.depot_retenues_note}>
                      <input className="w-full border border-stone-300 rounded px-2 py-1" defaultValue={lot.depot_retenues_note || ""}
                        onBlur={(e) => updateLot({ depot_retenues_note: e.target.value }, "Motif des retenues")} />
                    </Field>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Bandeau retour={retour} />
    </div>
  );
}

export default function Page() {
  return <FicheLot />;
}
