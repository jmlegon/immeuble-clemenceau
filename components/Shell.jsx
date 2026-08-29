"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { viderCache } from "@/lib/donnees";

const I = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

const icones = {
  resume: (
    <svg viewBox="0 0 24 24" {...I}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
  ),
  lots: (
    <svg viewBox="0 0 24 24" {...I}><path d="M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16" /><path d="M15 10h4a1 1 0 011 1v10" /><path d="M8 8h3M8 12h3M8 16h3" /><path d="M2 21h20" /></svg>
  ),
  indexation: (
    <svg viewBox="0 0 24 24" {...I}><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h7v7" /></svg>
  ),
  paiements: (
    <svg viewBox="0 0 24 24" {...I}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /></svg>
  ),
  eau: (
    <svg viewBox="0 0 24 24" {...I}><path d="M12 3s6 6.5 6 10a6 6 0 11-12 0c0-3.5 6-10 6-10z" /></svg>
  ),
  documents: (
    <svg viewBox="0 0 24 24" {...I}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
  ),
  depenses: (
    <svg viewBox="0 0 24 24" {...I}><path d="M6 2h12a1 1 0 011 1v18l-3-2-3 2-3-2-3 2V3a1 1 0 011-1z" /><path d="M9 7h6M9 11h6" /></svg>
  ),
  bilan: (
    <svg viewBox="0 0 24 24" {...I}><path d="M3 21h18" /><rect x="5" y="11" width="3.6" height="7" rx="0.6" /><rect x="10.2" y="6" width="3.6" height="12" rx="0.6" /><rect x="15.4" y="14" width="3.6" height="4" rx="0.6" /></svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" {...I}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>
  ),
};

const tabs = [
  { href: "/dashboard", label: "Tableau de bord", court: "Résumé", icone: "resume", principal: true },
  { href: "/lots", label: "Lots", court: "Lots", icone: "lots" },
  { href: "/indexation", label: "Indexation", court: "Indexation", icone: "indexation" },
  { href: "/paiements", label: "Paiements", court: "Loyers", icone: "paiements", principal: true },
  { href: "/depenses", label: "Dépenses", court: "Dépenses", icone: "depenses", principal: true },
  { href: "/bilan", label: "Bilan", court: "Bilan", icone: "bilan", principal: true },
  { href: "/eau", label: "Charges & eau", court: "Eau", icone: "eau" },
  { href: "/documents", label: "Documents", court: "Docs", icone: "documents" },
];

// Sur mobile, 8 onglets ne tiennent pas : on garde les 4 plus consultés
// et le reste passe dans une feuille « Plus ».
const principaux = tabs.filter((t) => t.principal);
const secondaires = tabs.filter((t) => !t.principal);

export function Shell({ children }) {
  const pathname = usePathname();
  // La fiche d'un lot vit sous /lots/<id> : sans cette comparaison par préfixe,
  // aucun onglet ne s'allumait une fois entré dans une fiche.
  const estActif = (href) => pathname === href || pathname.startsWith(`${href}/`);
  const router = useRouter();
  const [plusOuvert, setPlusOuvert] = useState(false);

  // Referme la feuille « Plus » dès qu'on change de page
  useEffect(() => { setPlusOuvert(false); }, [pathname]);

  // Les fiches s'enregistrent champ par champ, à la sortie du champ. Or basculer
  // vers une autre application ou verrouiller l'iPhone ne déclenche pas toujours
  // ce `blur` : la saisie en cours partait alors sans être écrite. On force la
  // sortie du champ au moment où la page cesse d'être visible.
  useEffect(() => {
    const sortirDuChamp = () => {
      const actif = document.activeElement;
      if (actif && typeof actif.blur === "function") actif.blur();
    };
    const surVisibilite = () => { if (document.hidden) sortirDuChamp(); };
    window.addEventListener("pagehide", sortirDuChamp);
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      window.removeEventListener("pagehide", sortirDuChamp);
      document.removeEventListener("visibilitychange", surVisibilite);
    };
  }, []);

  async function seDeconnecter() {
    await supabase.auth.signOut();
    // Ces tables portent des noms de locataires et des montants : elles n'ont
    // rien à faire en mémoire une fois la session fermée.
    viderCache();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <header className="bg-slate-900 text-stone-100 px-4 md:px-6 py-3 md:py-5 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] md:text-xs uppercase tracking-widest text-emerald-400 font-medium">Registre de gestion locative</p>
            <h1 className="text-base md:text-2xl font-serif mt-0.5 md:mt-1 truncate">1 boulevard Clémenceau, Binic</h1>
          </div>
          <button
            onClick={seDeconnecter}
            aria-label="Se déconnecter"
            className="shrink-0 flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-200 -mr-1 p-1"
          >
            <svg viewBox="0 0 24 24" {...I} className="w-5 h-5 md:hidden"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
            <span className="hidden md:inline">Se déconnecter</span>
          </button>
        </div>
      </header>

      {/* Ordinateur : onglets sous le bandeau */}
      <nav className="hidden md:block bg-slate-800 border-b border-slate-700">
        <div className="max-w-5xl mx-auto flex overflow-x-auto">
          {tabs.map((t) => {
            const active = estActif(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                  active ? "border-emerald-400 text-emerald-300" : "border-transparent text-stone-400 hover:text-stone-200"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* pb-24 : laisse la place à la barre d'onglets fixe du mobile */}
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-4 md:py-6 pb-24 md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      {/* Mobile : feuille « Plus » pour les sections secondaires */}
      {plusOuvert && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <button
            aria-label="Fermer"
            onClick={() => setPlusOuvert(false)}
            className="absolute inset-0 bg-slate-900/50"
          />
          <div className="relative bg-white rounded-t-2xl p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-xl">
            <div className="w-10 h-1 bg-stone-300 rounded-full mx-auto my-2" />
            {secondaires.map((t) => {
              const active = estActif(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                    active ? "bg-stone-100 text-emerald-700" : "text-stone-700"
                  }`}
                >
                  <span className="w-6 h-6 shrink-0">{icones[t.icone]}</span>
                  <span className="text-base">{t.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobile : barre d'onglets fixe, à portée de pouce */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900 border-t border-slate-700 pb-[env(safe-area-inset-bottom)]">
        <div className="flex">
          {principaux.map((t) => {
            const active = estActif(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 transition-colors ${
                  active ? "text-emerald-300" : "text-stone-400"
                }`}
              >
                <span className="w-6 h-6">{icones[t.icone]}</span>
                <span className="text-[10px] leading-none truncate max-w-full px-0.5">{t.court}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setPlusOuvert((v) => !v)}
            aria-expanded={plusOuvert}
            className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 transition-colors ${
              plusOuvert || secondaires.some((t) => estActif(t.href)) ? "text-emerald-300" : "text-stone-400"
            }`}
          >
            <span className="w-6 h-6">{icones.plus}</span>
            <span className="text-[10px] leading-none">Plus</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

/**
 * Tableau sur ordinateur, fiches empilées sur mobile — évite que la page
 * entière parte en défilement latéral sur un écran étroit.
 *
 * columns : [{ key, label, action? }]  — action = colonne de boutons (sans intitulé en fiche)
 * rows    : [{ key, cells: { [key]: ReactNode } }]
 */
export function DataTable({ columns, rows, empty = "Aucune ligne pour l'instant." }) {
  if (!rows.length) return <p className="text-sm text-stone-500">{empty}</p>;

  const donnees = columns.filter((c) => !c.action);
  const actions = columns.filter((c) => c.action);
  const [titre, ...reste] = donnees;

  return (
    <>
      <table className="hidden md:table w-full text-sm">
        <thead>
          <tr className="text-left text-stone-500 border-b border-stone-200">
            {columns.map((c) => <th key={c.key} className="py-1 font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-stone-100">
              {columns.map((c) => <td key={c.key} className="py-1.5 align-top">{r.cells[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="md:hidden space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="border border-stone-200 rounded-lg p-3 bg-white">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium break-words min-w-0">{r.cells[titre.key]}</span>
              {actions.length > 0 && (
                <span className="shrink-0 flex items-center gap-1">{actions.map((c) => <span key={c.key}>{r.cells[c.key]}</span>)}</span>
              )}
            </div>
            {reste.length > 0 && (
              <dl className="mt-2 space-y-1">
                {reste.map((c) => (
                  <div key={c.key} className="flex justify-between gap-3 text-sm">
                    <dt className="text-stone-500 shrink-0">{c.label}</dt>
                    <dd className="text-right break-words min-w-0">{r.cells[c.key]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

export function Badge({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-stone-200 text-stone-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

// Les attributs supplémentaires sont transmis au <div> : c'est ce qui permet
// de marquer une carte `data-imprimable` sans l'envelopper dans un conteneur.
export function Card({ children, className = "", ...rest }) {
  return <div className={`bg-white rounded-lg border border-stone-200 p-4 ${className}`} {...rest}>{children}</div>;
}

/**
 * Libellé + champ, reliés par un identifiant.
 *
 * Le <label> était auparavant posé à côté du champ sans `htmlFor`, et aucun
 * champ n'avait d'`id` : un lecteur d'écran annonçait « champ de saisie » sans
 * dire lequel, et taper sur le libellé ne donnait pas le focus — une cible de
 * 44 px perdue à chaque ligne de chaque formulaire, sur mobile.
 *
 * L'identifiant est engendré ici et posé sur l'enfant, pour que les quelque
 * soixante appels existants n'aient rien à changer. Un `id` déjà présent sur
 * l'enfant est respecté.
 */
export function Field({ label, statut, children }) {
  const genere = useId();
  const id = isValidElement(children) && children.props.id ? children.props.id : genere;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <label htmlFor={id} className="block text-xs text-stone-500">{label}</label>
        {statut === "cours" && <span className="text-xs text-stone-400">enregistrement…</span>}
        {statut === "ok" && <span className="text-xs text-emerald-600">enregistré</span>}
      </div>
      {isValidElement(children) ? cloneElement(children, { id }) : children}
    </div>
  );
}

/**
 * Retour d'écriture par champ, pour les fiches qui s'enregistrent à la sortie
 * du champ.
 *
 * Un bandeau par champ modifié faisait défiler une vingtaine de « X enregistré »
 * pour une seule fiche remplie : le succès, banal et attendu, occupait toute la
 * place. Il se dit maintenant dans le champ lui-même, et le bandeau est rendu
 * aux erreurs, qui elles méritent qu'on s'arrête.
 */
export function useStatutsChamps() {
  const [statuts, setStatuts] = useState({});
  const minuteries = useRef({});

  useEffect(() => {
    const encours = minuteries.current;
    return () => Object.values(encours).forEach(clearTimeout);
  }, []);

  const oublier = useCallback((cle) => {
    setStatuts((s) => {
      if (!(cle in s)) return s;
      const suivant = { ...s };
      delete suivant[cle];
      return suivant;
    });
  }, []);

  const debut = useCallback((cle) => {
    clearTimeout(minuteries.current[cle]);
    setStatuts((s) => ({ ...s, [cle]: "cours" }));
  }, []);

  const succes = useCallback((cle) => {
    setStatuts((s) => ({ ...s, [cle]: "ok" }));
    minuteries.current[cle] = setTimeout(() => oublier(cle), 2500);
  }, [oublier]);

  return { statuts, debut, succes, echec: oublier };
}

/**
 * Écran d'attente à la forme du contenu attendu.
 *
 * « Chargement… » en haut d'une page vide donnait un saut de mise en page à
 * chaque arrivée de données. Ces cartes grises occupent la place à l'avance.
 */
export function Squelette({ cartes = 2 }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: cartes }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border border-stone-200 p-4">
          <div className="h-4 w-40 bg-stone-200 rounded animate-pulse" />
          <div className="mt-4 space-y-2">
            <div className="h-3 bg-stone-100 rounded animate-pulse" />
            <div className="h-3 w-5/6 bg-stone-100 rounded animate-pulse" />
            <div className="h-3 w-2/3 bg-stone-100 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Formulaire de saisie replié derrière son intitulé.
 *
 * Loyers, Dépenses, Eau et Documents s'ouvraient tous sur un formulaire déplié :
 * sur un téléphone, il fallait dépasser une à trois cartes de champs avant
 * d'atteindre l'historique — ce qu'on vient consulter neuf fois sur dix. La
 * saisie reste à un geste, mais ne prend plus l'écran par défaut.
 */
export function Volet({ titre, defautOuvert = false, children }) {
  const [ouvert, setOuvert] = useState(defautOuvert);
  return (
    <Card>
      <button
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          {/* Un « + » pour ouvrir, un chevron pour refermer : une croix aurait
              pu se lire « supprimer » au-dessus d'un formulaire de saisie. */}
          <span className="w-5 h-5 shrink-0 text-stone-400">
            {ouvert
              ? <svg viewBox="0 0 24 24" {...I}><path d="M18 15l-6-6-6 6" /></svg>
              : <svg viewBox="0 0 24 24" {...I}><path d="M12 5v14M5 12h14" /></svg>}
          </span>
          <span className="font-serif text-lg truncate">{titre}</span>
        </span>
      </button>
      {ouvert && <div className="mt-4 pt-4 border-t border-stone-100">{children}</div>}
    </Card>
  );
}

/**
 * Retour d'écriture partagé.
 *
 * Jusqu'ici, une écriture refusée par la base passait inaperçue : l'état local
 * était déjà à jour à l'écran, et rien ne distinguait une saisie enregistrée
 * d'une saisie perdue. `useRetour` porte cet état, `Bandeau` l'affiche.
 *
 *   const retour = useRetour();
 *   const { error } = await supabase.from(...).update(...);
 *   if (error) return retour.echec("Le loyer n'a pas été enregistré", error);
 *   retour.succes();
 *
 * Un succès s'efface seul au bout de quelques secondes ; une erreur reste
 * jusqu'à ce qu'on la ferme — on ne fait pas disparaître une mauvaise nouvelle.
 */
export function useRetour() {
  const [etat, setEtat] = useState(null); // null | { type: "ok" | "erreur", message, action }
  const minuterie = useRef(null);

  useEffect(() => () => clearTimeout(minuterie.current), []);

  const fermer = useCallback(() => {
    clearTimeout(minuterie.current);
    setEtat(null);
  }, []);

  /**
   * `action` ajoute un bouton au bandeau : `{ label, onClick }`.
   *
   * C'est ce qui permet d'annuler un geste en un appui — un encaissement
   * enregistré d'un clic doit pouvoir se défaire aussi vite qu'il s'est fait.
   * Le bandeau reste alors plus longtemps : deux secondes et demie suffisent à
   * lire « enregistré », pas à se rendre compte qu'on a visé la mauvaise ligne.
   */
  const succes = useCallback((message = "Enregistré", action = null) => {
    clearTimeout(minuterie.current);
    setEtat({ type: "ok", message, action });
    minuterie.current = setTimeout(() => setEtat(null), action ? 9000 : 2500);
  }, []);

  // Le détail technique de Supabase complète le message métier sans le remplacer :
  // « Le relevé n'a pas été enregistré — new row violates row-level security policy ».
  const echec = useCallback((message, erreur) => {
    clearTimeout(minuterie.current);
    const detail = erreur?.message ? ` — ${erreur.message}` : "";
    setEtat({ type: "erreur", message: message + detail });
  }, []);

  return { etat, succes, echec, fermer };
}

export function Bandeau({ retour }) {
  const etat = retour?.etat;
  if (!etat) return null;
  const ok = etat.type === "ok";
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-40 px-4 md:px-6 pointer-events-none"
    >
      <div
        className={`max-w-5xl mx-auto flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg pointer-events-auto ${
          ok ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-red-50 border-red-200 text-red-900"
        }`}
      >
        <span className="w-5 h-5 shrink-0 mt-px">
          {ok ? (
            <svg viewBox="0 0 24 24" {...I}><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" {...I}><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16.5v.01" /></svg>
          )}
        </span>
        <p className="text-sm flex-1 min-w-0 break-words">{etat.message}</p>
        {etat.action && (
          <button
            onClick={() => { retour.fermer(); etat.action.onClick(); }}
            className="shrink-0 text-sm font-medium underline underline-offset-2 text-emerald-800 px-1 py-0.5"
          >
            {etat.action.label}
          </button>
        )}
        <button
          onClick={retour.fermer}
          aria-label="Fermer le message"
          className={`shrink-0 -mr-1 -mt-0.5 p-1 ${ok ? "text-emerald-700" : "text-red-700"}`}
        >
          <svg viewBox="0 0 24 24" {...I} className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Confirmation avant une suppression définitive.
 *
 * `cible` est l'objet à supprimer (null = fermé) : le même état porte à la fois
 * l'ouverture de la fenêtre et ce sur quoi elle porte.
 */
export function DialogueSuppression({ cible, titre, description, onConfirmer, onAnnuler, enCours = false }) {
  if (!cible) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      <button aria-label="Annuler" onClick={onAnnuler} className="absolute inset-0 bg-slate-900/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titre}
        className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-lg p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-5 shadow-xl"
      >
        <h2 className="font-serif text-lg">{titre}</h2>
        {description && <p className="text-sm text-stone-600 mt-2">{description}</p>}
        <p className="text-sm text-stone-500 mt-2">Cette suppression est définitive.</p>
        <div className="flex flex-col-reverse md:flex-row md:justify-end gap-2 mt-5">
          <button
            onClick={onAnnuler}
            className="px-4 py-2.5 md:py-1.5 rounded border border-stone-300 text-stone-700 text-sm"
          >
            Annuler
          </button>
          <button
            onClick={onConfirmer}
            disabled={enCours}
            className="px-4 py-2.5 md:py-1.5 rounded bg-red-600 text-white text-sm disabled:opacity-50"
          >
            {enCours ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}
