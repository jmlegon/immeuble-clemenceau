// Service worker : écran « hors ligne » propre.
//
// Sans lui, ouvrir l'application sans réseau donne une page blanche, y compris
// depuis l'icône de l'écran d'accueil. Il ne met en cache que la coquille et la
// page de repli : AUCUNE donnée de gestion n'est conservée hors ligne, pour ne
// jamais afficher un loyer ou un solde périmé sans qu'on sache qu'il l'est.

const VERSION = "v1";
const CACHE = `clemenceau-${VERSION}`;
const REPLI = "/hors-ligne";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([REPLI, "/manifest.webmanifest"])));
  // La nouvelle version prend la main sans attendre la fermeture des onglets :
  // un service worker bloqué en attente est une source classique de pages figées.
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;

  // Seules les navigations sont interceptées. Les appels à Supabase passent
  // directement : hors ligne, ils échouent, et l'application le dit elle-même.
  if (req.mode !== "navigate") return;

  e.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      const cache = await caches.open(CACHE);
      return (await cache.match(REPLI)) || new Response(
        "Pas de connexion.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
  })());
});
