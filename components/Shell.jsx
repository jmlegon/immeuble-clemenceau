"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  const router = useRouter();
  const [plusOuvert, setPlusOuvert] = useState(false);

  // Referme la feuille « Plus » dès qu'on change de page
  useEffect(() => { setPlusOuvert(false); }, [pathname]);

  async function seDeconnecter() {
    await supabase.auth.signOut();
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
            const active = pathname === t.href;
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
              const active = pathname === t.href;
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
            const active = pathname === t.href;
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
              plusOuvert || secondaires.some((t) => t.href === pathname) ? "text-emerald-300" : "text-stone-400"
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
  if (!rows.length) return <p className="text-sm text-stone-400">{empty}</p>;

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

export function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-lg border border-stone-200 p-4 ${className}`}>{children}</div>;
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-stone-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
