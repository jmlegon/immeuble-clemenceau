"use client";
import { useEffect } from "react";

/**
 * Enregistre le service worker qui sert l'écran « hors ligne ».
 *
 * Rien n'est enregistré en développement : un service worker actif y masque les
 * rechargements à chaud et fait perdre un temps considérable à comprendre
 * pourquoi une modification ne s'affiche pas.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Un échec d'enregistrement ne doit rien casser : l'application
      // fonctionne sans, elle perd seulement son écran de repli.
    });
  }, []);
  return null;
}
