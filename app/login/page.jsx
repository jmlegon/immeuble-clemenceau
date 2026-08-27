"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const router = useRouter();

  async function connecter(e) {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setChargement(false);
    if (error) {
      setErreur("Identifiants incorrects, ou compte pas encore créé dans Supabase.");
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg border border-stone-200 p-8 max-w-sm w-full">
        <p className="text-xs uppercase tracking-widest text-emerald-700 font-medium">Registre privé</p>
        <h1 className="text-xl font-serif mt-1 mb-6">1 bd Clémenceau, Binic</h1>
        <form onSubmit={connecter} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs text-stone-500 mb-1">Email</label>
            <input
              id="email" type="email" required autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs text-stone-500 mb-1">Mot de passe</label>
            <input
              id="password" type="password" required autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
            />
          </div>
          {erreur && <p className="text-sm text-red-600">{erreur}</p>}
          <button
            type="submit" disabled={chargement}
            className="w-full bg-slate-900 text-white rounded py-2 text-sm disabled:opacity-50"
          >
            {chargement ? "Connexion…" : "Se connecter"}
          </button>
        </form>
        <p className="text-xs text-stone-500 mt-4">
          Les comptes (vous et Baptiste) se créent depuis Supabase &gt; Authentication &gt; Users — il n'y a pas d'inscription publique ici.
        </p>
      </div>
    </div>
  );
}
