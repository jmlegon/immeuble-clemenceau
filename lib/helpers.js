export const todayISO = () => new Date().toISOString().slice(0, 10);

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
export function prochaineOccurrence(jourMois) {
  if (!jourMois) return null;
  const [j, m] = jourMois.split("-").map(Number);
  const now = new Date();
  let annee = now.getFullYear();
  let candidate = new Date(annee, m - 1, j);
  if (candidate < new Date(now.toDateString())) {
    candidate = new Date(annee + 1, m - 1, j);
  }
  return candidate.toISOString().slice(0, 10);
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

// Somme des versements incomplets sur les paiements enregistrés depuis `depuis`.
export function ecartVersements(paiementsDuLot, depuis) {
  return paiementsDuLot
    .filter((p) => (p.periode || "") >= depuis)
    .reduce((s, p) => s + ((p.attendu || 0) - (p.montant || 0)), 0);
}
