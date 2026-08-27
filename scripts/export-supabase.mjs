#!/usr/bin/env node
// Export complet de la base et du stockage vers un dossier daté.
//
// Usage local :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run export
//
// La clé service_role contourne le RLS : c'est le seul moyen de tout lire sans
// session utilisateur. Elle ne doit JAMAIS être commitée ni collée ailleurs que
// dans les secrets GitHub ou votre terminal.

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const url = process.env.SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
const avecFichiers = process.env.EXPORT_FICHIERS !== "0";

if (!url || !cle) {
  console.error("SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis.");
  process.exit(1);
}

const TABLES = [
  "lots", "releves_eau", "paiements", "documents", "depenses", "indexations",
  "doc_counters", "taxe_fonciere", "eau_tarifs", "bailleur",
];
const BUCKET = "documents";

const sb = createClient(url, cle, { auth: { persistSession: false } });
const horodatage = new Date().toISOString().slice(0, 10);
const dossier = join("export", horodatage);

function versCSV(lignes) {
  if (!lignes.length) return "";
  const colonnes = [...new Set(lignes.flatMap((l) => Object.keys(l)))];
  const echappe = (v) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [colonnes.join(";"), ...lignes.map((l) => colonnes.map((c) => echappe(l[c])).join(";"))].join("\r\n");
}

// Parcourt le bucket en profondeur : les justificatifs sont rangés par lot.
async function listerFichiers(prefixe = "") {
  const { data, error } = await sb.storage.from(BUCKET).list(prefixe, { limit: 1000 });
  if (error) throw new Error(`listing ${prefixe || "/"} : ${error.message}`);
  const out = [];
  for (const e of data || []) {
    const chemin = prefixe ? `${prefixe}/${e.name}` : e.name;
    if (e.id === null) out.push(...await listerFichiers(chemin)); // dossier
    else out.push(chemin);
  }
  return out;
}

async function main() {
  await mkdir(dossier, { recursive: true });
  const resume = { date: new Date().toISOString(), tables: {}, fichiers: 0, erreurs: [] };

  for (const table of TABLES) {
    const { data, error } = await sb.from(table).select("*");
    if (error) {
      console.error(`  ✗ ${table} : ${error.message}`);
      resume.erreurs.push(`${table} : ${error.message}`);
      continue;
    }
    await writeFile(join(dossier, `${table}.json`), JSON.stringify(data, null, 2), "utf8");
    await writeFile(join(dossier, `${table}.csv`), "﻿" + versCSV(data), "utf8");
    resume.tables[table] = data.length;
    console.log(`  ✓ ${table.padEnd(15)} ${data.length} ligne(s)`);
  }

  if (avecFichiers) {
    try {
      const fichiers = await listerFichiers();
      if (fichiers.length) await mkdir(join(dossier, "fichiers"), { recursive: true });
      for (const chemin of fichiers) {
        const { data, error } = await sb.storage.from(BUCKET).download(chemin);
        if (error) { resume.erreurs.push(`fichier ${chemin} : ${error.message}`); continue; }
        const dest = join(dossier, "fichiers", chemin.replace(/[/\\]/g, "__"));
        await writeFile(dest, Buffer.from(await data.arrayBuffer()));
        resume.fichiers += 1;
      }
      console.log(`  ✓ ${resume.fichiers} fichier(s) du bucket « ${BUCKET} »`);
    } catch (e) {
      console.error(`  ✗ stockage : ${e.message}`);
      resume.erreurs.push(`stockage : ${e.message}`);
    }
  }

  await writeFile(join(dossier, "resume.json"), JSON.stringify(resume, null, 2), "utf8");
  console.log(`\nExport terminé dans ${dossier}`);
  if (resume.erreurs.length) {
    console.error(`${resume.erreurs.length} erreur(s) — export incomplet.`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
