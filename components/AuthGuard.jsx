"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { viderCache } from "@/lib/donnees";

export default function AuthGuard({ children }) {
  const [status, setStatus] = useState("checking"); // checking | ok | none
  const router = useRouter();

  useEffect(() => {
    // Le bouton « Se déconnecter » vide le cache, mais ce n'est pas le seul
    // chemin : une session qui expire, ou une déconnexion depuis un autre
    // onglet, laissaient en mémoire des noms de locataires et des montants.
    // La perte de session est traitée ici, quelle qu'en soit la cause.
    const perdreSession = () => {
      viderCache();
      setStatus("none");
      router.replace("/login");
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus("ok");
      else perdreSession();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) perdreSession();
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (status !== "ok") {
    return (
      <div className="min-h-[300px] flex items-center justify-center text-stone-500 font-serif">
        Vérification de la connexion…
      </div>
    );
  }
  return children;
}
