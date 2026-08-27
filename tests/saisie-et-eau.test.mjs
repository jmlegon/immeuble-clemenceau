import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  todayISO, nombreOuNull, nettoyerNomFichier,
  consommationSurPeriode, regularisationEau, joursEntre,
} from "../lib/helpers.js";

describe("todayISO", () => {
  test("suit le calendrier local, pas UTC", () => {
    const d = new Date();
    const attendu = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    assert.equal(todayISO(), attendu);
  });
  test("rend bien une date au format AAAA-MM-JJ", () => {
    assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("nombreOuNull", () => {
  test("un champ vidé vaut null, pas zéro", () => {
    assert.equal(nombreOuNull(""), null);
    assert.equal(nombreOuNull("   "), null);
    assert.equal(nombreOuNull(null), null);
    assert.equal(nombreOuNull(undefined), null);
  });
  test("un vrai zéro reste zéro", () => {
    assert.equal(nombreOuNull("0"), 0);
    assert.equal(nombreOuNull(0), 0);
  });
  test("lit les décimales, virgule comprise", () => {
    assert.equal(nombreOuNull("146.6"), 146.6);
    assert.equal(nombreOuNull("146,6"), 146.6);
  });
  test("rend null sur une saisie non numérique", () => {
    assert.equal(nombreOuNull("abc"), null);
  });
});

describe("nettoyerNomFichier", () => {
  test("retire accents et espaces, garde l'extension", () => {
    assert.equal(nettoyerNomFichier("Bail Mme Laudrin — état des lieux.pdf"), "Bail-Mme-Laudrin-etat-des-lieux.pdf");
  });
  test("laisse tranquille un nom déjà propre", () => {
    assert.equal(nettoyerNomFichier("dpe-2026.pdf"), "dpe-2026.pdf");
  });
  test("met l'extension en minuscules", () => {
    assert.equal(nettoyerNomFichier("SCAN.PDF"), "SCAN.pdf");
  });
  test("ne rend jamais un nom vide", () => {
    assert.equal(nettoyerNomFichier("—— .pdf"), "fichier.pdf");
    assert.equal(nettoyerNomFichier(""), "fichier");
  });
  test("ne produit pas de séparateur de chemin", () => {
    const n = nettoyerNomFichier("dossier/sous dossier/bail.pdf");
    assert.ok(!n.includes("/"), n);
  });
});

describe("consommationSurPeriode", () => {
  const releves = [
    { date: "2024-12-25", index_value: 1798 },
    { date: "2025-12-29", index_value: 1825 },
  ];

  test("mesure entre deux relevés proches des bornes demandées", () => {
    assert.equal(consommationSurPeriode(releves, "2024-12-25", "2025-12-29"), 27);
  });
  test("tolère quelques jours d'écart sur la date de relevé", () => {
    assert.equal(consommationSurPeriode(releves, "2024-12-31", "2026-01-02"), 27);
  });
  test("rend null si aucun relevé n'approche une borne", () => {
    assert.equal(consommationSurPeriode(releves, "2023-06-01", "2025-12-29"), null);
  });
  test("rend null quand une seule mesure encadre les deux bornes", () => {
    // Le compteur du local Funambule, relevé en avril puis en décembre :
    // sur la fenêtre du compteur général, il n'a pas de point de départ.
    const partiel = [{ date: "2025-04-01", index_value: 459 }, { date: "2025-12-29", index_value: 467 }];
    assert.equal(consommationSurPeriode(partiel, "2024-12-25", "2025-12-29"), null);
  });
});

describe("regularisationEau", () => {
  const tarifs = { prixM3: 5.5, abonnementAnnuel: 70, nombreParts: 4 };

  test("sur une année pleine, avance et coût se comparent directement", () => {
    const r = regularisationEau({ m3: 27, jours: 365, ...tarifs, avanceMensuelle: 18 });
    assert.equal(r.coutEau, 148.5);
    assert.equal(r.coutAbonnement, 17.5);
    assert.equal(r.coutTotal, 166);
    assert.equal(r.avance, 216);
    assert.equal(r.solde, 50);
  });

  test("sur neuf mois, l'avance est ramenée à la même durée", () => {
    // Le défaut corrigé : 9 mois de consommation étaient comparés à 12 mois
    // d'avance, ce qui gonflait artificiellement le solde à rembourser.
    const neufMois = regularisationEau({ m3: 8, jours: 272, ...tarifs, avanceMensuelle: 18 });
    assert.ok(Math.abs(neufMois.avance - 216 * (272 / 365)) < 0.01);
    assert.ok(neufMois.avance < 216);
  });

  test("un solde négatif signale ce qui reste dû", () => {
    const r = regularisationEau({ m3: 100, jours: 365, ...tarifs, avanceMensuelle: 5 });
    assert.ok(r.solde < 0);
  });

  test("rend null sans consommation ou sans durée", () => {
    assert.equal(regularisationEau({ m3: null, jours: 365, ...tarifs, avanceMensuelle: 18 }), null);
    assert.equal(regularisationEau({ m3: 27, jours: 0, ...tarifs, avanceMensuelle: 18 }), null);
  });
});

describe("joursEntre", () => {
  test("compte les jours entre deux dates", () => {
    assert.equal(joursEntre("2024-12-25", "2025-12-29"), 369);
    assert.equal(joursEntre("2025-04-01", "2025-12-29"), 272);
  });
  test("rend null si une borne manque", () => {
    assert.equal(joursEntre(null, "2025-12-29"), null);
  });
});
