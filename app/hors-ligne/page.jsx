"use client";

export const dynamic = "force-static";

export default function HorsLigne() {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-800 flex flex-col">
      <header className="bg-slate-900 text-stone-100 px-4 md:px-6 py-3 md:py-5 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] md:text-xs uppercase tracking-widest text-emerald-400 font-medium">Registre de gestion locative</p>
          <h1 className="text-base md:text-2xl font-serif mt-0.5 md:mt-1">1 boulevard Clémenceau, Binic</h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-lg border border-stone-200 p-8 max-w-sm w-full text-center">
          <span className="inline-block w-10 h-10 text-stone-500">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 2l20 20" />
              <path d="M5 12.5a10 10 0 015.5-2.4" />
              <path d="M1.5 9a15 15 0 016-3.6" />
              <path d="M13.5 6a15 15 0 019 3" />
              <path d="M16.5 10.6a10 10 0 012.5 1.9" />
              <path d="M8.5 16a5 5 0 016 0" />
              <path d="M12 20h.01" />
            </svg>
          </span>
          <h2 className="font-serif text-xl mt-4">Pas de connexion</h2>
          <p className="text-sm text-stone-600 mt-3">
            Les données de gestion ne peuvent pas être chargées sans réseau. Elles ne sont
            volontairement pas conservées sur l'appareil : mieux vaut pas de chiffre qu'un
            chiffre périmé.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full px-4 py-2.5 rounded bg-slate-900 text-white text-sm"
          >
            Réessayer
          </button>
        </div>
      </main>
    </div>
  );
}
