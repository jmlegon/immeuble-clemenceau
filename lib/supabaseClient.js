"use client";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Sans ce contrôle, une variable oubliée dans les réglages Vercel ne se
// manifestait qu'au premier appel réseau, par une erreur illisible. Le message
// nomme la variable manquante et l'endroit où la définir.
const manquantes = [
  !url && "NEXT_PUBLIC_SUPABASE_URL",
  !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
].filter(Boolean);

if (manquantes.length) {
  throw new Error(
    `Configuration Supabase incomplète : ${manquantes.join(" et ")} ${manquantes.length > 1 ? "sont absentes" : "est absente"}. ` +
    "En local, renseignez-les dans .env.local (voir .env.local.example). " +
    "Sur Vercel, dans Settings > Environment Variables, puis redéployez.",
  );
}

export const supabase = createClient(url, anonKey);
