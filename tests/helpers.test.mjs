import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  prochaineOccurrence, ajouterMois, moisEntre, moisManquants,
  ecartVersements, calculRevision, tvaSurPaiement,
  loyerALaPeriode, montantAttendu, revisionEnPeril,
} from "../lib/helpers.js";

// Ces fonctions décident de montants portés sur une quittance ou une
// déclaration. Chaque cas ci-dessous correspond à une situation réelle de
// l'immeuble, pas à un cas d'école.

describe("prochaineOccurrence", () => {
  test("rend le jour exact du bail, sans décalage de fuseau", () => {
    // Le bug d'origine : minuit local repassé en UTC reculait d'un jour.
    // On vérifie que la sortie porte bien le jour et le mois demandés.
    for (const [jourMois, jourAttendu, moisAttendu] of [
      ["01-05", "01", "05"], ["01-02", "01", "02"],
      ["01-09", "01", "09"], ["01-04", "01", "04"],
    ]) {
      const [, mois, jour] = prochaineOccurrence(jourMois).split("-");
      assert.equal(jour, jourAttendu, `jour pour ${jourMois}`);
      assert.equal(mois, moisAttendu, `mois pour ${jourMois}`);
    }
  });

  test("tombe toujours dans le futur, au plus un an devant", () => {
    const aujourdhui = new Date();
    for (const jourMois of ["01-01", "15-06", "31-12", "01-09"]) {
      const d = new Date(prochaineOccurrence(jourMois) + "T12:00:00Z");
      const jours = (d - aujourdhui) / 86400000;
      assert.ok(jours > -1 && jours <= 366, `${jourMois} -> ${jours.toFixed(1)} j`);
    }
  });

  test("rend null sur une entrée vide ou malformée", () => {
    assert.equal(prochaineOccurrence(""), null);
    assert.equal(prochaineOccurrence(null), null);
    assert.equal(prochaineOccurrence(undefined), null);
    assert.equal(prochaineOccurrence("abc"), null);
  });
});

describe("ajouterMois", () => {
  test("décale d'un nombre de mois donné", () => {
    assert.equal(ajouterMois("2026-01-15", 12), "2027-01-15");  // assurance : 1 an
    assert.equal(ajouterMois("2026-03-10", 6), "2026-09-10");   // ERP : 6 mois
    assert.equal(ajouterMois("2026-01-20", 120), "2036-01-20"); // DPE : 10 ans
  });

  test("recale sur le dernier jour quand le mois cible est plus court", () => {
    assert.equal(ajouterMois("2026-01-31", 1), "2026-02-28");
    assert.equal(ajouterMois("2026-08-31", 6), "2027-02-28");
  });

  test("ne recule pas d'un jour depuis la France", () => {
    // Le piège que prochaineOccurrence avait, et qu'ajouterMois évitait déjà.
    assert.equal(ajouterMois("2026-06-01", 12), "2027-06-01");
  });

  test("rend une chaîne vide sur une entrée inutilisable", () => {
    assert.equal(ajouterMois("", 12), "");
    assert.equal(ajouterMois("2026-01-01", 0), "");
  });
});

describe("moisEntre", () => {
  test("liste les mois bornes incluses", () => {
    assert.deepEqual(moisEntre("2026-01", "2026-04"), ["2026-01", "2026-02", "2026-03", "2026-04"]);
  });
  test("franchit le changement d'année", () => {
    assert.deepEqual(moisEntre("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  test("un seul mois quand les bornes sont égales", () => {
    assert.deepEqual(moisEntre("2026-05", "2026-05"), ["2026-05"]);
  });
  test("liste vide si les bornes sont inversées ou absentes", () => {
    assert.deepEqual(moisEntre("2026-05", "2026-01"), []);
    assert.deepEqual(moisEntre(null, "2026-01"), []);
  });
  test("une fenêtre de 12 mois glissants en compte 13, bornes incluses", () => {
    assert.equal(moisEntre("2025-08", "2026-08").length, 13);
  });
});

describe("moisManquants", () => {
  const fenetre = ["2026-01", "2026-02", "2026-03"];

  test("signale les mois sans paiement enregistré", () => {
    const lot = { debut_bail: "2025-01-01" };
    const payes = [{ periode: "2026-02" }];
    assert.deepEqual(moisManquants(lot, payes, fenetre), ["2026-01", "2026-03"]);
  });

  test("ne remonte pas avant le début du bail", () => {
    const lot = { debut_bail: "2026-03-01" };
    assert.deepEqual(moisManquants(lot, [], fenetre), ["2026-03"]);
  });

  test("sans début de bail, toute la fenêtre est contrôlée", () => {
    // C'est le comportement actuel, et la raison pour laquelle debut_bail
    // doit pouvoir se renseigner depuis la fiche du lot.
    assert.deepEqual(moisManquants({}, [], fenetre), fenetre);
  });

  test("s'arrête au mois du départ du locataire", () => {
    // Au-delà du départ, plus aucun loyer n'est dû : le tableau de bord
    // proposerait sinon d'encaisser des mois qui n'existent pas.
    const lot = { debut_bail: "2025-01-01", date_depart: "2026-02-14" };
    assert.deepEqual(moisManquants(lot, [], fenetre), ["2026-01", "2026-02"]);
  });

  test("laisse de côté les lots facturés au trimestre", () => {
    // Sans connaître le mois de départ du trimestre, un contrôle mensuel
    // produirait de fausses alertes sur les deux baux commerciaux.
    const lot = { periodicite_facturation: "trimestrielle", debut_bail: "2025-01-01" };
    assert.deepEqual(moisManquants(lot, [], fenetre), []);
  });
});

describe("ecartVersements", () => {
  test("additionne les versements incomplets", () => {
    const p = [
      { periode: "2026-01", attendu: 800, montant: 700 },
      { periode: "2026-02", attendu: 800, montant: 750 },
    ];
    assert.deepEqual(ecartVersements(p, "2026-01"), { manque: 150, avance: 0 });
  });

  test("un trop-perçu n'efface pas un impayé", () => {
    // Le défaut corrigé : ces deux lignes se compensaient et le total tombait
    // à zéro, donc aucune alerte alors qu'un terme restait dû.
    const p = [
      { periode: "2026-03", attendu: 800, montant: 900 },
      { periode: "2026-06", attendu: 800, montant: 700 },
    ];
    assert.deepEqual(ecartVersements(p, "2026-01"), { manque: 100, avance: 100 });
  });

  test("ignore les périodes antérieures à la borne", () => {
    const p = [
      { periode: "2025-01", attendu: 800, montant: 0 },
      { periode: "2026-01", attendu: 800, montant: 800 },
    ];
    assert.deepEqual(ecartVersements(p, "2026-01"), { manque: 0, avance: 0 });
  });

  test("rien à signaler quand tout est payé au centime", () => {
    const p = [{ periode: "2026-01", attendu: 827, montant: 827 }];
    assert.deepEqual(ecartVersements(p, "2026-01"), { manque: 0, avance: 0 });
  });
});

describe("calculRevision", () => {
  test("applique la formule loyer × (nouvel indice ÷ indice de base)", () => {
    // Cas du 1er étage : IRL 146,6 -> 148,1 sur un loyer de 809 €.
    const r = calculRevision(809, 146.6, 148.1);
    assert.equal(r.nouveauLoyer, 817.28);
    assert.ok(Math.abs(r.variation - 1.0232) < 0.001);
  });

  test("arrondit au centime", () => {
    const r = calculRevision(681, 2056, 2103);
    assert.equal(Math.round(r.nouveauLoyer * 100), r.nouveauLoyer * 100);
  });

  test("gère une révision à la baisse", () => {
    const r = calculRevision(800, 130, 128);
    assert.ok(r.nouveauLoyer < 800);
    assert.ok(r.variation < 0);
  });

  test("rend null tant qu'une valeur manque", () => {
    assert.equal(calculRevision(809, null, 148.1), null);
    assert.equal(calculRevision(809, 146.6, null), null);
    assert.equal(calculRevision(null, 146.6, 148.1), null);
    assert.equal(calculRevision(809, 0, 148.1), null);
  });
});

describe("tvaSurPaiement", () => {
  const commercial = { tva_taux: 20, avance_eau: 0 };

  test("extrait la TVA d'un versement TTC", () => {
    // 817,20 TTC à 20 % => 136,20 de TVA.
    const tva = tvaSurPaiement(commercial, { montant: 817.2, attendu: 817.2 });
    assert.ok(Math.abs(tva - 136.2) < 0.01);
  });

  test("rien à collecter sur un lot non assujetti", () => {
    assert.equal(tvaSurPaiement({ tva_taux: 0 }, { montant: 800, attendu: 800 }), 0);
    assert.equal(tvaSurPaiement({}, { montant: 800, attendu: 800 }), 0);
  });

  test("sort l'avance sur eau de la base : ce n'est pas du loyer", () => {
    const lot = { tva_taux: 20, avance_eau: 18 };
    const avec = tvaSurPaiement(lot, { montant: 818, attendu: 818 });
    const sans = tvaSurPaiement({ tva_taux: 20, avance_eau: 0 }, { montant: 800, attendu: 800 });
    assert.ok(Math.abs(avec - sans) < 0.001);
  });

  test("un trop-perçu n'est pas encore exigible", () => {
    const trop = tvaSurPaiement(commercial, { montant: 1000, attendu: 817.2 });
    const juste = tvaSurPaiement(commercial, { montant: 817.2, attendu: 817.2 });
    assert.equal(trop, juste);
  });

  test("un versement partiel ne doit que sa part", () => {
    const partiel = tvaSurPaiement(commercial, { montant: 400, attendu: 817.2 });
    assert.ok(partiel > 0 && partiel < 136.2);
  });
});

describe("loyerALaPeriode", () => {
  const lot = { loyer_mensuel_ht: 850 };
  const historique = [
    { date_application: "2026-05-03", loyer_avant: 809, loyer_apres: 830 },
    { date_application: "2027-05-02", loyer_avant: 830, loyer_apres: 850 },
  ];

  test("rend le loyer d'alors pour une période ancienne", () => {
    assert.equal(loyerALaPeriode(lot, historique, "2026-04"), 809);
    assert.equal(loyerALaPeriode(lot, historique, "2026-12"), 830);
  });

  test("une révision appliquée pendant le mois vaut pour ce mois", () => {
    assert.equal(loyerALaPeriode(lot, historique, "2026-05"), 830);
  });

  test("rend le loyer courant après la dernière révision", () => {
    assert.equal(loyerALaPeriode(lot, historique, "2027-08"), 850);
  });

  test("sans historique, le loyer courant s'applique partout", () => {
    assert.equal(loyerALaPeriode(lot, [], "2020-01"), 850);
    assert.equal(loyerALaPeriode(lot, null, "2020-01"), 850);
  });
});

describe("montantAttendu", () => {
  test("compose loyer de la période, TVA puis avance sur charges", () => {
    const lot = { loyer_mensuel_ht: 681, tva_taux: 20, avance_eau: 0 };
    assert.ok(Math.abs(montantAttendu(lot, [], "2026-06") - 817.2) < 0.01);
  });

  test("ajoute l'avance hors TVA", () => {
    const lot = { loyer_mensuel_ht: 809, tva_taux: 0, avance_eau: 18 };
    assert.equal(montantAttendu(lot, [], "2026-06"), 827);
  });

  test("utilise le loyer d'avant révision pour une période antérieure", () => {
    const lot = { loyer_mensuel_ht: 830, tva_taux: 0, avance_eau: 18 };
    const h = [{ date_application: "2026-05-03", loyer_avant: 809, loyer_apres: 830 }];
    assert.equal(montantAttendu(lot, h, "2026-04"), 827);
    assert.equal(montantAttendu(lot, h, "2026-06"), 848);
  });
});

describe("revisionEnPeril", () => {
  test("rien à signaler dans les premiers mois", () => {
    assert.equal(revisionEnPeril("2026-06-01", "2026-08-27"), null);
  });
  test("alerte à partir de neuf mois", () => {
    assert.equal(revisionEnPeril("2025-11-01", "2026-08-27"), "bientot");
  });
  test("perdue au-delà d'un an", () => {
    assert.equal(revisionEnPeril("2025-06-01", "2026-08-27"), "perdue");
  });
  test("rien à dire sans date de référence", () => {
    assert.equal(revisionEnPeril(null, "2026-08-27"), null);
  });
});
