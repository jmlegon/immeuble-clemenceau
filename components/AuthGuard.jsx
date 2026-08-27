"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthGuard({ children }) {
  const [status, setStatus] = useState("checking"); // checking | ok | none
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStatus("ok");
      } else {
        setStatus("none");
        router.replace("/login");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setStatus("none");
        router.replace("/login");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  if (status !== "ok") {
    return (
      <div className="min-h-[300px] flex items-center justify-center text-stone-400 font-serif">
        Vérification de la connexion…
      </div>
    );
  }
  return children;
}
