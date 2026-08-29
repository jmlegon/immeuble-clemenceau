"use client";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";

/**
 * Les tables de gestion, chargées une fois pour toutes les pages.
 *
 * Chaque écran refaisait ses propres requêtes à chaque montage : passer de
 * Loyers à Dépenses relisait la table des lots, et l'écran affichait
 * « Chargement… » sur fond vide le temps de l'aller-retour — plusieurs fois par
 * minute, en 4G, pour des données qui n'avaient pas bougé.
 *
 * Ici, la donnée déjà connue s'affiche immédiatement et la requête repart en
 * arrière-plan : on ne regarde plus un écran vide, et une donnée modifiée
 * ailleurs finit toujours par arriver.
 *
 * Les tables sont chargées entières, sans filtre : elles comptent quelques
 * dizaines de lignes, et un cache par requête aurait empêché deux écrans de
 * partager la même table parce que l'un exclut les lots vacants et l'autre non.
 * Filtres et tris d'affichage restent dans les écrans.
 */

// Tri appliqué à la lecture. Stable d'un écran à l'autre, donc une même liste
// ne s'affiche pas dans deux ordres différents selon la page qui l'a demandée.
const TRIS = {
  lots: { colonne: "id", croissant: true },
  paiements: { colonne: "periode", croissant: false },
  depenses: { colonne: "date", croissant: false },
  documents: { colonne: "date_emission", croissant: false },
  indexations: { colonne: "date_application", croissant: false },
  releves_eau: { colonne: "date", croissant: true },
  eau_tarifs: { colonne: "id", croissant: true },
  bailleur: { colonne: "id", croissant: true },
};

const VIDE = Object.freeze({ donnees: [], erreur: null, chargement: true });

const etat = new Map();    // nom -> { donnees, erreur, chargement }
const abonnes = new Map(); // nom -> Set<() => void>
const enVol = new Map();   // nom -> Promise, pour ne pas lancer deux fois la même requête
const generations = new Map(); // nom -> numéro de la lecture la plus récente

function notifier(nom) {
  const liste = abonnes.get(nom);
  if (liste) liste.forEach((fn) => fn());
}

async function chargerTable(nom) {
  if (enVol.has(nom)) return enVol.get(nom);
  const tri = TRIS[nom] || { colonne: "id", croissant: true };
  // `rafraichir` peut relancer une lecture alors qu'une autre est encore en
  // vol, et rien ne garantit l'ordre d'arrivée des réponses : sans ce numéro
  // d'ordre, la plus ancienne pouvait écraser la plus récente et réafficher
  // la ligne qu'on venait de supprimer.
  const generation = (generations.get(nom) || 0) + 1;
  generations.set(nom, generation);
  const promesse = (async () => {
    const { data, error } = await supabase.from(nom).select("*")
      .order(tri.colonne, { ascending: tri.croissant });
    // Réponse dépassée : on la laisse tomber. Surtout, on ne touche pas à
    // `enVol`, dont l'entrée appartient désormais à la lecture suivante.
    if (generations.get(nom) !== generation) return;
    const precedent = etat.get(nom);
    etat.set(nom, {
      // Une requête refusée ne doit pas effacer ce qu'on affichait déjà :
      // l'écran garde sa dernière vue connue, l'erreur reste lisible à côté.
      donnees: data || precedent?.donnees || [],
      erreur: error || null,
      chargement: false,
    });
    enVol.delete(nom);
    notifier(nom);
  })();
  enVol.set(nom, promesse);
  return promesse;
}

/** Relit les tables nommées depuis la base — après une écriture, par exemple. */
export function rafraichir(...noms) {
  return Promise.all(noms.map((nom) => { enVol.delete(nom); return chargerTable(nom); }));
}

/**
 * Modifie le cache sans passer par le réseau, pour refléter tout de suite une
 * écriture qui vient d'aboutir : la ligne encaissée disparaît de la liste au
 * moment du clic, et non après un aller-retour.
 */
export function majTable(nom, transformer) {
  const courant = etat.get(nom) || { donnees: [], erreur: null, chargement: false };
  etat.set(nom, { ...courant, donnees: transformer(courant.donnees) });
  notifier(nom);
}

/**
 * Vide tout. Appelé à la déconnexion : ces tables portent des noms de
 * locataires et des montants, elles n'ont rien à faire en mémoire une fois la
 * session fermée — a fortiori sur un poste partagé.
 */
export function viderCache() {
  etat.clear();
  enVol.clear();
  // Les lectures en vol au moment de la purge portent des générations devenues
  // caduques : les invalider empêche leur réponse de repeupler le cache qu'on
  // vient de vider.
  [...generations.keys()].forEach((nom) => generations.set(nom, (generations.get(nom) || 0) + 1));
  [...abonnes.keys()].forEach(notifier);
}

/**
 * Une table, avec son état de chargement.
 *
 *   const { donnees: lots, chargement } = useTable("lots");
 */
export function useTable(nom) {
  const souscrire = useCallback((fn) => {
    if (!abonnes.has(nom)) abonnes.set(nom, new Set());
    abonnes.get(nom).add(fn);
    return () => abonnes.get(nom)?.delete(fn);
  }, [nom]);

  const lire = useCallback(() => etat.get(nom) || VIDE, [nom]);

  const instantane = useSyncExternalStore(souscrire, lire, () => VIDE);

  // Revalidation à chaque montage : on affiche le connu, on vérifie derrière.
  useEffect(() => { chargerTable(nom); }, [nom]);

  return instantane;
}
