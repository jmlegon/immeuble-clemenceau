"use client";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Un état d'écran porté par l'adresse plutôt que par la mémoire du composant.
 *
 * S'utilise comme useState :
 *
 *   const [filtreLot, setFiltreLot] = useParamUrl("filtre_lot");
 *
 * Ce que cela change : un filtre, une année, un lot déplié survivent au retour
 * arrière et se transmettent par un lien. C'est ce qui permet au tableau de
 * bord de renvoyer vers l'écran qui règle le problème, déjà réglé sur le bon
 * lot — plutôt que vers un écran générique où tout est à refaire à la main.
 *
 * `replace` et non `push` : régler un filtre n'est pas une étape de navigation,
 * et empiler une entrée d'historique par frappe rendrait le bouton Retour
 * inutilisable. La valeur par défaut n'est pas écrite dans l'adresse — une
 * adresse ne porte que ce qui s'écarte de l'état ordinaire de l'écran.
 */
export function useParamUrl(nom, defaut = "") {
  const params = useSearchParams();
  const router = useRouter();
  const chemin = usePathname();

  const valeur = params.get(nom) ?? defaut;

  const definir = useCallback((suivante) => {
    const q = new URLSearchParams(params.toString());
    if (suivante === null || suivante === undefined || suivante === "" || suivante === defaut) {
      q.delete(nom);
    } else {
      q.set(nom, String(suivante));
    }
    const chaine = q.toString();
    // scroll: false — sans cela, changer un filtre en bas de page ramène en haut.
    router.replace(chaine ? `${chemin}?${chaine}` : chemin, { scroll: false });
  }, [params, router, chemin, nom, defaut]);

  return [valeur, definir];
}

/**
 * Plusieurs paramètres réglés d'un coup.
 *
 *   const majParams = useMajParams();
 *   majParams({ filtre_lot: null, annee: null });   // « Tout afficher »
 *
 * Deux appels successifs à `definir` dans le même gestionnaire partiraient tous
 * deux de l'adresse d'avant : le second réécrirait ce que le premier venait
 * d'effacer, et un filtre resterait en place. Ici, une seule écriture.
 */
export function useMajParams() {
  const params = useSearchParams();
  const router = useRouter();
  const chemin = usePathname();

  return useCallback((patch) => {
    const q = new URLSearchParams(params.toString());
    for (const [nom, valeur] of Object.entries(patch)) {
      if (valeur === null || valeur === undefined || valeur === "") q.delete(nom);
      else q.set(nom, String(valeur));
    }
    const chaine = q.toString();
    router.replace(chaine ? `${chemin}?${chaine}` : chemin, { scroll: false });
  }, [params, router, chemin]);
}
