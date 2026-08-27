#!/usr/bin/env node
// Restauration d'un export vers un projet Supabase.
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run import -- export/2026-08-24
//
// Sans --confirmer, le script se contente de décrire ce qu'il ferait. C'est
// volontaire : on restaure rarement, et rarement au calme.
//
// Une sauvegarde dont on n'a jamais essayé la restauration n'est pas encore une
// sauvegarde. Essayez-la une fois sur un projet Supabase jetable — c'est le seul
// moyen de savoir que la chaîne tient.

import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const url = process.env.SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
const args = process.argv.slice(2);
const dossier = args.find((a) => !a.startsWith("--"));
const confirme = args.includes("--confirmer");
const avecFichiers = process.env.EXPORT_FICHIERS !== "0";

if (!url || !cle) {
  console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis.");
  process.exit(1);
}
if (!dossier) {
  console.error("Indiquez le dossier d'export à restaurer, par exemple : npm run import -- export/2026-08-24");
  process.exit(1);
}

// Ordre imposé par les clés étrangères : les lots d'abord, ce qui s'y rattache
// ensuite. Restaurer un paiement avant son lot le ferait rejeter.
const TABLES = [
  "lots", "bailleur", "doc_counters", "taxe_fonciere", "eau_tarifs",
  "releves_eau", "paiements", "documents", "depenses", "indexations",
];
const BUCKET = "documents";

const sb = createClient(url, cle, { auth: { persistSession: false } });

async function lireJSON(chemin) {
  try {
    return JSON.parse(await readFile(chemin, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const resume = await lireJSON(join(dossier, "resume.json"));
  if (!resume) {
    console.error(`Aucun resume.json dans ${dossier} — est-ce bien un dossier d'export ?`);
    process.exit(1);
  }

  console.log(`Export du ${resume.date?.slice(0, 10) || "?"} — ${dossier}`);
  if (!confirme) {
    console.log("\nMODE APERÇU : rien ne sera écrit. Ajoutez --confirmer pour restaurer.\n");
  }

  const erreurs = [];
  let lignesEcrites = 0;

  for (const table of TABLES) {
    const lignes = await lireJSON(join(dossier, `${table}.json`));
    if (!lignes) { console.log(`  · ${table.padEnd(15)} absent de l'export, ignoré`); continue; }
    if (!lignes.length) { console.log(`  · ${table.padEnd(15)} vide`); continue; }

    if (!confirme) {
      console.log(`  → ${table.padEnd(15)} ${lignes.length} ligne(s) seraient restaurées`);
      continue;
    }

    // upsert : rejouer la restauration deux fois donne le même résultat, et une
    // restauration partielle peut se reprendre sans tout casser.
    const { error } = await sb.from(table).upsert(lignes);
    if (error) {
      console.error(`  ✗ ${table.padEnd(15)} ${error.message}`);
      erreurs.push(`${table} : ${error.message}`);
      continue;
    }
    lignesEcrites += lignes.length;
    console.log(`  ✓ ${table.padEnd(15)} ${lignes.length} ligne(s)`);
  }

  if (avecFichiers) {
    // Les archives récentes portent la correspondance exacte ; pour les plus
    // anciennes, on retombe sur la convention « __ » utilisée à l'export.
    let correspondances = resume.correspondances;
    if (!correspondances) {
      try {
        const noms = await readdir(join(dossier, "fichiers"));
        correspondances = noms.map((nom) => ({ nom, chemin: nom.replace(/__/g, "/") }));
        if (noms.length) console.log("  ! archive sans correspondances : chemins reconstruits par convention");
      } catch {
        correspondances = [];
      }
    }

    for (const { chemin, nom } of correspondances) {
      if (!confirme) continue;
      try {
        const contenu = await readFile(join(dossier, "fichiers", nom));
        const { error } = await sb.storage.from(BUCKET).upload(chemin, contenu, { upsert: true });
        if (error) { erreurs.push(`fichier ${chemin} : ${error.message}`); continue; }
      } catch (e) {
        erreurs.push(`fichier ${chemin} : ${e.message}`);
      }
    }
    const n = correspondances.length;
    console.log(confirme ? `  ✓ ${n} fichier(s) restauré(s)` : `  → ${n} fichier(s) seraient restaurés`);
  }

  if (!confirme) {
    console.log("\nAperçu terminé. Relancez avec --confirmer pour écrire réellement.");
    return;
  }

  console.log(`\nRestauration terminée — ${lignesEcrites} ligne(s) écrite(s).`);
  if (erreurs.length) {
    console.error(`${erreurs.length} erreur(s) — restauration incomplète :`);
    erreurs.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
