"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const tabs = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/lots", label: "Lots" },
  { href: "/indexation", label: "Indexation" },
  { href: "/paiements", label: "Paiements" },
  { href: "/eau", label: "Charges & eau" },
  { href: "/documents", label: "Documents" },
];

export function Shell({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  async function seDeconnecter() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-stone-100 text-stone-800">
      <header className="bg-slate-900 text-stone-100 px-6 py-5 pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-medium">Registre de gestion locative</p>
            <h1 className="text-2xl font-serif mt-1">1 boulevard Clémenceau, Binic</h1>
          </div>
          <button onClick={seDeconnecter} className="text-sm text-stone-400 hover:text-stone-200">
            Se déconnecter
          </button>
        </div>
      </header>
      <nav className="bg-slate-800 border-b border-slate-700">
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
      <main className="max-w-5xl mx-auto px-6 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</main>
    </div>
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
