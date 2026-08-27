"use client";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import { Shell, Card, Badge } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { eur, fdate, prochaineOccurrence, joursRestants } from "@/lib/helpers";

function DashboardInner() {
  const [lots, setLots] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("lots").select("*").order("id");
      setLots(data || []);
      setChargement(false);
    })();
  }, []);

  if (chargement) return <p className="text-stone-400">Chargement…</p>;

  const lotsOccupes = lots.filter((l) => l.type !== "vacant");
  const totalMensuelHT = lotsOccupes.reduce((s, l) => s + (l.loyer_mensuel_ht || 0), 0);
  const incomplets = lots.filter((l) => l.incomplet && l.incomplet.length > 0);

  const alertesRevision = lotsOccupes
    .filter((l) => l.revision_jour_mois)
    .map((l) => {
      const date = prochaineOccurrence(l.revision_jour_mois);
      return { lot: l, date, jours: joursRestants(date) };
    })
    .sort((a, b) => a.jours - b.jours);

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
        <Card>
          <p className="text-xs text-stone-500 uppercase tracking-wide">Baux commerciaux</p>
          <p className="text-2xl font-serif mt-1">2</p>
        </Card>
        <Card>
          <p className="text-xs text-stone-500 uppercase tracking-wide">Éléments à compléter</p>
          <p className="text-2xl font-serif mt-1">{incomplets.reduce((s, l) => s + (l.incomplet?.length || 0), 0)}</p>
        </Card>
      </div>

      <Card>
        <h2 className="font-serif text-lg mb-3">Prochaines révisions de loyer</h2>
        <div className="space-y-2">
          {alertesRevision.map(({ lot, date, jours }) => (
            <div key={lot.id} className="flex items-center justify-between text-sm border-b border-stone-100 pb-2 last:border-0 last:pb-0">
              <div>
                <span className="font-medium">{lot.nom}</span>
                <span className="text-stone-500"> — {lot.locataire}</span>
              </div>
              <div className="flex items-center gap-2">
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
