"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Badge } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur, fdate, fmois, prochaineOccurrence, joursRestants, moisEntre, moisCourant, moisManquants, ecartVersements } from "@/lib/helpers";

function DashboardInner() {
  const [lots, setLots] = useState([]);
  const [paiements, setPaiements] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: l }, { data: p }] = await Promise.all([
        supabase.from("lots").select("*").order("id"),
        supabase.from("paiements").select("*"),
      ]);
      setLots(l || []);
      setPaiements(p || []);
      setChargement(false);
    })();
  }, []);

  if (chargement) return <p className="text-stone-400">Chargement…</p>;

  const lotsOccupes = lots.filter((l) => l.type !== "vacant");
  const totalMensuelHT = lotsOccupes.reduce((s, l) => s + (l.loyer_mensuel_ht || 0), 0);
  const incomplets = lots.filter((l) => l.incomplet && l.incomplet.length > 0);
  const nbCommerciaux = lots.filter((l) => l.type === "commercial").length;

  // ---- Encaissements : 12 derniers mois ----
  const courant = moisCourant();
  const [a, m] = courant.split("-").map(Number);
  const debutFenetre = `${a - 1}-${String(m).padStart(2, "0")}`;
  const fenetre = moisEntre(debutFenetre, courant);

  const suivi = lotsOccupes.map((lot) => {
    const ps = paiements.filter((p) => p.lot_id === lot.id);
    return {
      lot,
      mensuel: (lot.periodicite_facturation || "mensuelle") !== "trimestrielle",
      manquants: moisManquants(lot, ps, fenetre),
      ecart: ecartVersements(ps, debutFenetre),
      dernier: ps.map((p) => p.periode).sort().slice(-1)[0] || null,
    };
  });

  const enRetard = suivi.filter((s) => s.manquants.filter((mo) => mo !== courant).length > 0 || s.ecart > 0.01);

  // ---- Fins de bail dans les 12 mois ----
  const finsBail = lotsOccupes
    .filter((l) => l.fin_bail)
    .map((l) => ({ lot: l, jours: joursRestants(l.fin_bail) }))
    .filter((x) => x.jours !== null && x.jours <= 365)
    .sort((x, y) => x.jours - y.jours);

  // ---- Dépôts de garantie à restituer ----
  const depotsARestituer = lots
    .filter((l) => l.date_depart && (l.depot_garantie || 0) > 0 && !l.depot_restitue_le)
    .map((l) => ({ lot: l, joursEcoules: -joursRestants(l.date_depart) }))
    .sort((x, y) => y.joursEcoules - x.joursEcoules);

  const alertesRevision = lotsOccupes
    .filter((l) => l.revision_jour_mois)
    .map((l) => {
      const date = prochaineOccurrence(l.revision_jour_mois);
      return { lot: l, date, jours: joursRestants(date) };
    })
    .sort((x, y) => x.jours - y.jours);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <p className="text-xs text-stone-500 uppercase tracking-wide">Lots occupés</p>
          <p className="text-2xl font-serif mt-1">{lotsOccupes.length} / {lots.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-stone-500 uppercase tracking-wide">Loyers mensuels HT</p>
          <p className="text-2xl font-serif mt-1">{eur(totalMensuelHT)}</p>
        </Card>
        <Card className={enRetard.length ? "border-red-200" : ""}>
          <p className="text-xs text-stone-500 uppercase tracking-wide">Lots en retard</p>
          <p className={`text-2xl font-serif mt-1 ${enRetard.length ? "text-red-600" : ""}`}>{enRetard.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-stone-500 uppercase tracking-wide">Baux commerciaux</p>
          <p className="text-2xl font-serif mt-1">{nbCommerciaux}</p>
        </Card>
      </div>

      <Card className={enRetard.length ? "border-red-200" : ""}>
        <h2 className="font-serif text-lg mb-3">Encaissements — 12 derniers mois</h2>
        {enRetard.length === 0 ? (
          <p className="text-sm text-emerald-700">Aucun retard détecté : tous les loyers attendus sont enregistrés.</p>
        ) : (
          <div className="space-y-3">
            {enRetard.map(({ lot, manquants, ecart, dernier }) => {
              const vraimentManquants = manquants.filter((mo) => mo !== courant);
              return (
                <div key={lot.id} className="text-sm border-b border-stone-100 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium">{lot.nom}</span>
                      <span className="text-stone-500"> — {lot.locataire}</span>
                    </div>
                    <Badge tone="red">{vraimentManquants.length ? `${vraimentManquants.length} mois` : "partiel"}</Badge>
                  </div>
                  {vraimentManquants.length > 0 && (
                    <p className="text-stone-600 mt-1">
                      Aucun paiement enregistré pour : {vraimentManquants.map(fmois).join(", ")}
                    </p>
                  )}
                  {ecart > 0.01 && (
                    <p className="text-stone-600 mt-1">Versements incomplets : {eur(ecart)} manquants au total.</p>
                  )}
                  <p className="text-stone-400 text-xs mt-1">
                    Dernier encaissement enregistré : {dernier ? fmois(dernier) : "aucun"}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {suivi.some((s) => !s.mensuel) && (
          <p className="text-xs text-stone-500 mt-3">
            Les lots facturés trimestriellement ne sont pas contrôlés mois par mois : seuls leurs
            versements incomplets sont signalés.
          </p>
        )}
      </Card>

      {depotsARestituer.length > 0 && (
        <Card className="border-amber-200">
          <h2 className="font-serif text-lg mb-3">Dépôts de garantie à restituer</h2>
          <div className="space-y-2">
            {depotsARestituer.map(({ lot, joursEcoules }) => (
              <div key={lot.id} className="flex items-start justify-between gap-2 text-sm border-b border-stone-100 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <span className="font-medium">{lot.ancien_locataire || lot.locataire || lot.nom}</span>
                  <p className="text-stone-500">Départ le {fdate(lot.date_depart)} — {eur(lot.depot_garantie)}</p>
                </div>
                <Badge tone={joursEcoules > 60 ? "red" : joursEcoules > 30 ? "amber" : "gray"}>
                  {joursEcoules > 60 ? "délai dépassé" : `${joursEcoules} j`}
                </Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Le dépôt se restitue sous un mois si l'état des lieux de sortie est conforme, deux mois
            sinon. Passé ce délai, il est majoré de 10 % du loyer mensuel par mois de retard.
          </p>
        </Card>
      )}

      {finsBail.length > 0 && (
        <Card>
          <h2 className="font-serif text-lg mb-3">Fins de bail dans les 12 mois</h2>
          <div className="space-y-2">
            {finsBail.map(({ lot, jours }) => (
              <div key={lot.id} className="flex items-center justify-between gap-2 text-sm border-b border-stone-100 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <span className="font-medium">{lot.nom}</span>
                  <span className="text-stone-500"> — {lot.locataire}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-stone-500">{fdate(lot.fin_bail)}</span>
                  <Badge tone={jours < 0 ? "red" : jours <= 180 ? "amber" : "gray"}>
                    {jours < 0 ? "échu" : `dans ${jours} j`}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="font-serif text-lg mb-3">Prochaines révisions de loyer</h2>
        <div className="space-y-2">
          {alertesRevision.map(({ lot, date, jours }) => (
            <div key={lot.id} className="flex items-center justify-between gap-2 text-sm border-b border-stone-100 pb-2 last:border-0 last:pb-0">
              <div className="min-w-0">
                <span className="font-medium">{lot.nom}</span>
                <span className="text-stone-500"> — {lot.locataire}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-stone-500">{fdate(date)}</span>
                <Badge tone={jours <= 45 ? "amber" : "gray"}>{jours >= 0 ? `dans ${jours} j` : "échue"}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {incomplets.length > 0 && (
        <Card className="border-amber-200">
          <h2 className="font-serif text-lg mb-3">À compléter</h2>
          <div className="space-y-3">
            {incomplets.map((l) => (
              <div key={l.id} className="text-sm">
                <p className="font-medium">{l.nom}</p>
                <ul className="list-disc list-inside text-stone-600 ml-1">
                  {l.incomplet.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard>
      <Shell>
        <DashboardInner />
      </Shell>
    </AuthGuard>
  );
}
