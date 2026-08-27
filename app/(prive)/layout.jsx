"use client";
import AuthGuard from "@/components/AuthGuard";
import { Shell } from "@/components/Shell";

/**
 * Garde et cadre communs aux écrans privés.
 *
 * Chaque page montait auparavant son propre AuthGuard et son propre Shell :
 * changer d'onglet revérifiait la session et remontait tout le cadre, d'où
 * « Vérification de la connexion… » puis « Chargement… » à chaque navigation.
 * Ici, ils sont montés une fois et survivent aux changements de page.
 *
 * Le dossier entre parenthèses est un groupe de routes : il regroupe ces pages
 * sous un layout commun sans apparaître dans les URL — /dashboard reste
 * /dashboard. L'écran de connexion, lui, doit rester hors de cette garde.
 */
export default function LayoutPrive({ children }) {
  return (
    <AuthGuard>
      <Shell>{children}</Shell>
    </AuthGuard>
  );
}
