// Date du jour au calendrier de l'utilisateur.
//
// Un toISOString() rend la date UTC : entre minuit et 2 h en France, il donnait
// la veille — donc une quittance datée d'hier, et des formulaires pré-remplis
// à la mauvaise date.
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function eur(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);
}

export function fdate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// jourMois format "JJ-MM" -> prochaine occurrence a partir d'aujourd'hui
//
// Tout en UTC, comme ajouterMois plus bas : un minuit LOCAL repassé par
// toISOString reculait d'un jour depuis la France, et toutes les dates de
// révision s'affichaient la veille (01-05 -> 30 avril).
export function prochaineOccurrence(jourMois) {
  if (!jourMois) return null;
  const [j, m] = jourMois.split("-").map(Number);
  if (!j || !m) return null;
  const now = new Date();
  // Composantes locales : « aujourd'hui » au sens du calendrier de l'utilisateur,
  // puis comparaison dans un repère UTC unique.
  const aujourdhui = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  let candidate = Date.UTC(now.getFullYear(), m - 1, j);
  if (candidate < aujourdhui) candidate = Date.UTC(now.getFullYear() + 1, m - 1, j);
  return new Date(candidate).toISOString().slice(0, 10);
}

export function joursRestants(dateISO) {
  if (!dateISO) return null;
  const diff = new Date(dateISO) - new Date(todayISO());
  return Math.round(diff / 86400000);
}

export const compteurLabels = {
  vide1: "1er étage — Mme Laudrin",
  b19: "2ème ét. B19 — vacant (ex-M. Nouar)",
  b20: "2ème ét. B20 — Mme Dazord",
  commerce1: "Commerce 1 — CFR",
  commerce2: "Commerce 2 — Funambule",
  general: "Compteur général (Véolia)",
};

export function genererTexteQuittance(lot, periode, bailleur) {
  const total = (lot.loyer_mensuel_ht || 0) + (lot.avance_eau || 0);
  return `QUITTANCE DE LOYER

Bailleur : ${bailleur.nom}
${bailleur.adresse}

Locataire : ${lot.locataire}
Logement : ${lot.nom} (${lot.localisation})

Période concernée : ${periode}

Loyer : ${eur(lot.loyer_mensuel_ht)}
Avance/provision sur charges (eau) : ${eur(lot.avance_eau || 0)}
Total versé : ${eur(total)}

Je soussigné(e) ${bailleur.nom}, bailleur, déclare avoir reçu de ${lot.locataire} la somme de ${eur(total)} au titre du paiement du loyer et des charges du logement désigné ci-dessus pour la période de ${periode}, et lui en donne quittance, sous réserve de tous mes droits.

Cette quittance annule tous les reçus qui auraient pu être établis précédemment en cas de paiement partiel du même terme.

Fait à Binic, le ${fdate(todayISO())}
Signature du bailleur`;
}

export function genererTexteFacture(lot, periode, numero, bailleur, trimestriel) {
  const base = trimestriel ? (lot.loyer_mensuel_ht || 0) * 3 : (lot.loyer_mensuel_ht || 0);
  const ht = base;
  const tauxTva = lot.tva_taux || 0;
  const tva = (ht * tauxTva) / 100;
  const ttc = ht + tva;
  const mentionTva = tauxTva > 0
    ? `TVA (${tauxTva} %) : ${eur(tva)}`
    : `TVA non applicable, art. 293 B du CGI (franchise en base) — ${lot.tva_note || ""}`;
  const echeancier = trimestriel ? `Payable en 3 mensualités de ${eur(ttc / 3)}` : `Payable en une fois`;
  return `FACTURE DE LOYER N° ${numero}${trimestriel ? " (trimestrielle)" : ""}

Émetteur (bailleur) : ${bailleur.nom}
${bailleur.adresse}
${bailleur.siret ? "SIRET : " + bailleur.siret : "SIRET : à compléter"}
${bailleur.tva_intra ? "N° TVA intracommunautaire : " + bailleur.tva_intra : ""}

Client (preneur) : ${lot.locataire}
${lot.siret ? "SIRET : " + lot.siret : "SIRET : à compléter"}
Local loué : ${lot.nom} (${lot.localisation})

Date d'émission : ${fdate(todayISO())}
Désignation : Loyer commercial — période ${periode}

Montant HT : ${eur(ht)}
${mentionTva}
Montant TTC : ${eur(ttc)}

Conditions de paiement : ${echeancier}
Pénalités de retard : taux légal en vigueur, indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 C. com.)

Note de conformité : à compter du 1er septembre 2026, toute entreprise assujettie à la TVA doit être en mesure de recevoir des factures électroniques structurées via une Plateforme Agréée ; l'obligation d'émission sous ce format s'applique progressivement selon la taille de l'entreprise (généralisée en septembre 2027 pour les plus petites structures).`;
}

// ---------- SAISIE ----------

// « Vide » et « zéro » ne veulent pas dire la même chose : un indice de base à 0
// rend la révision incalculable, alors qu'un indice absent se voit et se réclame.
export function nombreOuNull(valeur) {
  if (valeur === null || valeur === undefined) return null;
  const t = String(valeur).trim();
  if (t === "") return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Nom de fichier utilisable comme clé de stockage : le nom d'origine partait
// tel quel dans le chemin, accents et espaces compris, et la clé était refusée
// ou le fichier devenait illisible.
export function nettoyerNomFichier(nom) {
  const brut = String(nom || "").trim();
  const point = brut.lastIndexOf(".");
  const base = point > 0 ? brut.slice(0, point) : brut;
  const ext = point > 0 ? brut.slice(point + 1) : "";
  const propre = (t) => t
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const baseP = propre(base).slice(0, 80) || "fichier";
  const extP = propre(ext).toLowerCase().slice(0, 10);
  return extP ? `${baseP}.${extP}` : baseP;
}

// ---------- EAU ----------

// Consommation entre deux dates, à partir des relevés d'un compteur.
//
// On cherche un relevé proche de chaque borne plutôt qu'une correspondance
// exacte : les relevés se font « vers Noël », pas à date fixe.
export function consommationSurPeriode(relevesDuCompteur, debut, fin, toleranceJours = 20) {
  const releves = (relevesDuCompteur || []).filter((r) => r && r.date);
  const proche = (cible) => {
    let meilleur = null;
    let ecartMin = Infinity;
    for (const r of releves) {
      const ecart = Math.abs((new Date(r.date) - new Date(cible)) / 86400000);
      if (ecart <= toleranceJours && ecart < ecartMin) { ecartMin = ecart; meilleur = r; }
    }
    return meilleur;
  };
  const a = proche(debut);
  const b = proche(fin);
  if (!a || !b || a === b) return null;
  return b.index_value - a.index_value;
}

// Régularisation des charges d'eau sur la période réellement mesurée.
//
// L'avance annuelle était comparée à une consommation relevée sur un intervalle
// quelconque : neuf mois de consommation face à douze mois d'avance donnaient un
// solde faux, et c'est ce solde qu'on facture au locataire. Tout est désormais
// ramené à la durée réelle entre les deux relevés.
export function regularisationEau({ m3, jours, prixM3, abonnementAnnuel, nombreParts, avanceMensuelle }) {
  if (m3 === null || m3 === undefined || !jours || jours <= 0) return null;
  const part = jours / 365;
  const coutEau = m3 * (prixM3 || 0);
  const coutAbonnement = ((abonnementAnnuel || 0) / (nombreParts || 1)) * part;
  const coutTotal = coutEau + coutAbonnement;
  const avance = (avanceMensuelle || 0) * 12 * part;
  return {
    jours,
    coutEau,
    coutAbonnement,
    coutTotal,
    avance,
    // Positif : le locataire a trop avancé, on lui rend. Négatif : il reste dû.
    solde: avance - coutTotal,
  };
}

export function joursEntre(debut, fin) {
  if (!debut || !fin) return null;
  return Math.round((new Date(fin) - new Date(debut)) / 86400000);
}

// ---------- DÉPENSES ----------

export const CATEGORIES_DEPENSE = [
  { cle: "travaux_entretien", label: "Travaux d'entretien / réparation" },
  { cle: "travaux_amelioration", label: "Travaux d'amélioration" },
  { cle: "assurance", label: "Assurance (PNO, GLI…)" },
  { cle: "taxe_fonciere", label: "Taxe foncière" },
  { cle: "copropriete", label: "Charges de copropriété" },
  { cle: "interets_emprunt", label: "Intérêts d'emprunt" },
  { cle: "assurance_emprunt", label: "Assurance emprunt" },
  { cle: "honoraires", label: "Honoraires (gestion, comptable)" },
  { cle: "frais_procedure", label: "Frais de procédure" },
  { cle: "eau_energie", label: "Eau / énergie" },
  { cle: "autre", label: "Autre" },
];

export function labelCategorie(cle) {
  return CATEGORIES_DEPENSE.find((c) => c.cle === cle)?.label || cle;
}

// ---------- PÉRIODES ----------

export const moisCourant = () => todayISO().slice(0, 7);

// Liste des "YYYY-MM" de debut à fin inclus (bornes au format "YYYY-MM")
export function moisEntre(debut, fin) {
  const out = [];
  if (!debut || !fin || debut > fin) return out;
  let [a, m] = debut.split("-").map(Number);
  const [af, mf] = fin.split("-").map(Number);
  while (a < af || (a === af && m <= mf)) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return out;
}

export function fmois(periode) {
  if (!periode) return "—";
  const [a, m] = periode.split("-");
  const noms = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return `${noms[Number(m) - 1] || m} ${a}`;
}

// ---------- EXPORT ----------

// Point-virgule + BOM : Excel en configuration française ouvre le fichier
// directement, sans passer par l'assistant d'importation.
export function telechargerCSV(nomFichier, lignes) {
  const csv = lignes
    .map((l) => l.map((c) => {
      const v = c === null || c === undefined ? "" : String(c);
      return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(";"))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Nombre brut pour tableur français (virgule décimale, pas de symbole)
export function nombreFR(n) {
  if (n === null || n === undefined || isNaN(n)) return "";
  return Number(n).toFixed(2).replace(".", ",");
}

// ---------- CALCULS DE GESTION ----------

// TVA exigible à l'encaissement sur un versement de loyer.
// L'avance sur eau n'est pas du loyer : on la retire de la base. Le versement
// est plafonné au montant facturé — un trop-perçu n'est pas encore exigible.
export function tvaSurPaiement(lot, paiement) {
  const taux = lot?.tva_taux || 0;
  if (taux <= 0) return 0;
  const base = Math.max(0, Math.min(paiement.montant ?? 0, paiement.attendu ?? 0) - (lot.avance_eau || 0));
  return (base * taux) / (100 + taux);
}

// Mois de la fenêtre pour lesquels aucun paiement n'est enregistré.
// Les lots facturés trimestriellement sont exclus : sans connaître le mois de
// départ du trimestre, un contrôle mensuel produirait de fausses alertes.
export function moisManquants(lot, paiementsDuLot, fenetre) {
  if ((lot.periodicite_facturation || "mensuelle") === "trimestrielle") return [];
  const debutBail = lot.debut_bail ? lot.debut_bail.slice(0, 7) : null;
  const payes = new Set(paiementsDuLot.map((p) => p.periode));
  return fenetre.filter((mo) => (!debutBail || mo >= debutBail) && !payes.has(mo));
}

// Écarts entre attendu et versé depuis `depuis`, comptés séparément.
//
// Additionner les écarts signés laissait un trop-perçu de mars annuler un
// impayé de juin : le total tombait à zéro et aucune alerte ne se déclenchait,
// alors qu'un terme restait dû. Manques et avances ne se compensent pas —
// ce sont deux situations différentes, chacune avec sa suite à donner.
export function ecartVersements(paiementsDuLot, depuis) {
  let manque = 0;
  let avance = 0;
  for (const p of paiementsDuLot) {
    if ((p.periode || "") < depuis) continue;
    const ecart = (p.attendu || 0) - (p.montant || 0);
    if (ecart > 0) manque += ecart;
    else avance -= ecart;
  }
  return { manque, avance };
}

// Loyer en vigueur pour une période "AAAA-MM", d'après l'historique d'indexation.
//
// Sans cela, saisir un règlement d'avril après avoir appliqué la révision de mai
// l'enregistrait au nouveau loyer : le paiement passait en impayé partiel et le
// bilan de l'année s'en trouvait faussé rétroactivement.
//
// On cherche la première révision postérieure à la période : le loyer d'alors
// est son `loyer_avant`. Une révision appliquée PENDANT la période compte comme
// déjà en vigueur — c'est le mois où elle prend effet.
export function loyerALaPeriode(lot, indexationsDuLot, periode) {
  const courant = lot?.loyer_mensuel_ht || 0;
  if (!periode) return courant;
  const posterieures = (indexationsDuLot || [])
    .filter((x) => x.date_application && x.date_application.slice(0, 7) > periode)
    .sort((a, b) => a.date_application.localeCompare(b.date_application));
  const premiere = posterieures[0];
  return premiere && premiere.loyer_avant !== null && premiere.loyer_avant !== undefined
    ? premiere.loyer_avant
    : courant;
}

// Montant attendu pour une période : loyer d'alors, TVA, puis avance sur charges.
//
// Le taux de TVA et l'avance ne sont pas historisés : on applique ceux
// d'aujourd'hui. C'est une approximation assumée, et de loin la plus petite —
// le loyer est ce qui bouge à chaque révision.
export function montantAttendu(lot, indexationsDuLot, periode) {
  const loyer = loyerALaPeriode(lot, indexationsDuLot, periode);
  return loyer * (1 + (lot?.tva_taux || 0) / 100) + (lot?.avance_eau || 0);
}

// ---------- DOCUMENTS À DURÉE DE VALIDITÉ ----------

// Durées de validité en location (mois). null = pas de péremption.
// L'amiante est illimité lorsque le constat est négatif ; le DPE court sur
// 10 ans ; électricité, gaz et plomb sur 6 ans ; l'ERP sur 6 mois seulement.
export const TYPES_DOCUMENT = [
  { cle: "bail", label: "Bail", validiteMois: null },
  { cle: "etat_des_lieux", label: "État des lieux", validiteMois: null },
  { cle: "dpe", label: "Diagnostic — DPE", validiteMois: 120 },
  { cle: "electricite", label: "Diagnostic — électricité", validiteMois: 72 },
  { cle: "gaz", label: "Diagnostic — gaz", validiteMois: 72 },
  { cle: "plomb", label: "Diagnostic — plomb (CREP)", validiteMois: 72 },
  { cle: "amiante", label: "Diagnostic — amiante", validiteMois: null },
  { cle: "erp", label: "État des risques (ERP)", validiteMois: 6 },
  { cle: "assurance", label: "Attestation d'assurance", validiteMois: 12 },
  { cle: "autre", label: "Autre document", validiteMois: null },
];

export function labelTypeDocument(cle) {
  return TYPES_DOCUMENT.find((t) => t.cle === cle)?.label
    || { facture: "Facture", quittance: "Quittance", scan: "Document scanné" }[cle]
    || cle;
}

export function ajouterMois(dateISO, mois) {
  if (!dateISO || !mois) return "";
  const [a, m, j] = dateISO.split("-").map(Number);
  if (!a || !m || !j) return "";
  // Tout en UTC : un minuit local reconverti par toISOString reculerait d'un
  // jour depuis la France.
  const d = new Date(Date.UTC(a, m - 1 + mois, j));
  // Le 31 reporté sur un mois plus court déborde : on recale sur le dernier jour.
  if (d.getUTCDate() !== j) d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

// ---------- INDEXATION ----------

// Nouveau loyer = loyer actuel × (nouvel indice ÷ indice de base)
export function calculRevision(loyerActuel, indiceBase, indiceNouveau) {
  const base = Number(indiceBase);
  const nouveau = Number(indiceNouveau);
  const loyer = Number(loyerActuel);
  if (!base || !nouveau || !loyer) return null;
  const nouveauLoyer = (loyer * nouveau) / base;
  return {
    nouveauLoyer: Math.round(nouveauLoyer * 100) / 100,
    variation: ((nouveauLoyer - loyer) / loyer) * 100,
  };
}

// Une révision non appliquée dans l'année qui suit sa date d'effet est perdue.
// On alerte à partir de 9 mois pour laisser le temps d'agir.
export function revisionEnPeril(derniereRevisionISO, aujourdhuiISO) {
  if (!derniereRevisionISO) return null;
  const jours = Math.round((new Date(aujourdhuiISO) - new Date(derniereRevisionISO)) / 86400000);
  if (jours >= 365) return "perdue";
  if (jours >= 274) return "bientot";
  return null;
}
