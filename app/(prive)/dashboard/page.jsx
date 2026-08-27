"use client";
import { useState } from "react";
import Link from "next/link";
import { Card, Badge, Bandeau, Squelette, useRetour } from "@/components/Shell";
import { supabase } from "@/lib/supabaseClient";
import { majTable, useTable } from "@/lib/donnees";
import { eur, fdate, fmois, todayISO, prochaineOccurrence, joursRestants, moisEntre, moisCourant, moisManquants, ecartVersements, montantAttendu, labelTypeDocument } from "@/lib/helpers";

const I = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };

// Combien de termes à encaisser sont montrés avant de replier le reste. Une
// base jamais renseignée en produit une soixantaine : la carte qui doit dire
// « voilà ce qu'il y a à faire aujourd'hui » deviendrait un mur.
const TERMES_VISIBLES = 5;

/**
 * Ligne d'alerte cliquable, menant à l'écran qui règle le cas.
 *
 * Le tableau de bord constatait sans permettre d'agir : lire « dépôt à
 * restituer », puis retrouver le lot à la main dans un autre onglet. Chaque
 * ligne porte désormais son propre lien, lot déjà sélectionné à l'arrivée.
 */
function LigneLien({ href, children }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-2 text-sm border-b border-stone-100 py-2 first:pt-0 last:border-0 last:pb-0 -mx-2 px-2 rounded hover:bg-stone-50 active:bg-stone-100"
    >
      <span className="flex-1 min-w-0 flex items-start justify-between gap-2">{children}</span>
      <svg viewBox="0 0 24 24" {...I} className="w-4 h-4 mt-0.5 shrink-0 text-stone-300"><path d="M9 18l6-6-6-6" /></svg>
    </Link>
  );
}

function DashboardInner() {
  const [encaissementEnCours, setEncaissementEnCours] = useState(null);
  const [toutMontrer, setToutMontrer] = useState(false);
  const retour = useRetour();

  // Tables partagées avec les autres écrans : au retour sur le tableau de bord,
  // elles s'affichent aussitôt et se revalident derrière.
  const { donnees: lots, chargement } = useTable("lots");
  const { donnees: paiements } = useTable("paiements");
  const { donnees: documents } = useTable("documents");
  // La table des indexations est absente tant que la migration 02 n'est pas
  // passée : le montant attendu retombe alors sur le loyer courant.
  const { donnees: indexations } = useTable("indexations");

  /**
   * Enregistre le terme attendu, tel quel, en un geste.
   *
   * C'est le geste le plus fréquent de l'application, et il coûtait cinq
   * interactions dans l'onglet Loyers alors que le montant attendu était déjà
   * calculé ici. Le formulaire complet reste à portée d'un lien, pour le cas
   * où le versement diffère.
   */
  async function encaisser({ lot, periode, attendu }) {
    setEncaissementEnCours(`${lot.id}-${periode}`);
    const { data, error } = await supabase.from("paiements")
      .insert({ lot_id: lot.id, periode, attendu, montant: attendu, date_paiement: todayISO() })
      .select()
      .single();
    setEncaissementEnCours(null);
    if (error) {
      retour.echec(`${lot.nom} — ${fmois(periode)} : le paiement n'a pas été enregistré`, error);
      return;
    }
    // La ligne disparaît de la liste parce que la donnée locale est à jour, sans
    // recharger les quatre tables de l'écran. `data` peut manquer si la lecture
    // qui suit l'écriture est refusée : la ligne enregistrée est alors
    // reconstituée ici, faute de quoi le calcul suivant butterait sur un null.
    const ligne = data || { id: `${lot.id}-${periode}`, lot_id: lot.id, periode, attendu, montant: attendu };
    majTable("paiements", (prev) => [ligne, ...prev]);
    retour.succes(`${lot.nom} — ${fmois(periode)} encaissé (${eur(attendu)})`);
  }

  if (chargement) return <Squelette cartes={3} />;

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
      ...ecartVersements(ps, debutFenetre),
      dernier: ps.map((p) => p.periode).sort().slice(-1)[0] || null,
    };
  });

  // Un terme par ligne, du plus ancien au plus récent : c'est l'ordre dans
  // lequel on les réclame.
  const aEncaisser = suivi
    .flatMap(({ lot, manquants }) => manquants.map((periode) => ({
      lot,
      periode,
      attendu: montantAttendu(lot, indexations.filter((x) => x.lot_id === lot.id), periode),
    })))
    .sort((x, y) => x.periode.localeCompare(y.periode) || x.lot.nom.localeCompare(y.lot.nom));

  const termesMontres = toutMontrer ? aEncaisser : aEncaisser.slice(0, TERMES_VISIBLES);

  // Le mois en cours n'est pas un retard : il n'est pas encore échu.
  const enRetard = suivi.filter((s) => s.manquants.filter((mo) => mo !== courant).length > 0 || s.manque > 0.01);
  const versementsIncomplets = suivi.filter((s) => s.manque > 0.01 || s.avance > 0.01);

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

  // ---- Diagnostics et attestations qui périment ----
  // On alerte trois mois avant : de quoi faire intervenir un diagnostiqueur.
  const docsAExpirer = documents
    .filter((d) => d.date_expiration)
    .map((d) => ({ doc: d, jours: joursRestants(d.date_expiration) }))
    .filter((x) => x.jours !== null && x.jours <= 90)
    .sort((x, y) => x.jours - y.jours);

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
        <h2 className="font-serif text-lg mb-3">À encaisser</h2>
        {aEncaisser.length === 0 ? (
          <p className="text-sm text-emerald-700">
            Rien à encaisser : tous les termes attendus des douze derniers mois sont enregistrés.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {termesMontres.map(({ lot, periode, attendu }) => {
              const cle = `${lot.id}-${periode}`;
              const echu = periode !== courant;
              return (
                <div key={cle} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{lot.nom}</p>
                      <p className="text-sm text-stone-500">
                        {fmois(periode)}{lot.locataire ? ` — ${lot.locataire}` : ""}
                      </p>
                    </div>
                    {/* Le nom du lot est long : sans cette réserve, le badge le
                        rognait plutôt que de tenir sur une ligne. */}
                    <span className="shrink-0 whitespace-nowrap">
                      {echu && <Badge tone="red">en retard</Badge>}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {attendu > 0 ? (
                      <>
                        <button
                          onClick={() => encaisser({ lot, periode, attendu })}
                          disabled={encaissementEnCours === cle}
                          className="px-4 py-2.5 md:py-1.5 rounded bg-slate-900 text-white text-sm disabled:opacity-50"
                        >
                          {encaissementEnCours === cle ? "Enregistrement…" : `Encaisser ${eur(attendu)}`}
                        </button>
                        <Link href={`/paiements?lot=${lot.id}&periode=${periode}`} className="text-sm text-emerald-700 underline">
                          Montant différent…
                        </Link>
                      </>
                    ) : (
                      <Link href={`/lots/${lot.id}`} className="text-sm text-emerald-700 underline">
                        Loyer non renseigné — compléter la fiche du lot
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {aEncaisser.length > TERMES_VISIBLES && (
          <button
            onClick={() => setToutMontrer((v) => !v)}
            className="mt-3 text-sm text-emerald-700 underline"
          >
            {toutMontrer
              ? `Ne montrer que les ${TERMES_VISIBLES} plus anciens`
              : `Voir les ${aEncaisser.length - TERMES_VISIBLES} autres termes en attente`}
          </button>
        )}
        {suivi.some((s) => !s.mensuel) && (
          <p className="text-xs text-stone-500 mt-3">
            Les lots facturés trimestriellement ne sont pas contrôlés mois par mois : leurs termes se
            saisissent depuis l'onglet Loyers, et seuls leurs versements incomplets sont signalés.
          </p>
        )}
      </Card>

      {versementsIncomplets.length > 0 && (
        <Card className="border-red-200">
          <h2 className="font-serif text-lg mb-3">Versements incomplets</h2>
          <div className="space-y-3">
            {versementsIncomplets.map(({ lot, manque, avance, dernier }) => (
              <Link
                key={lot.id}
                href={`/paiements?filtre_lot=${lot.id}`}
                className="block text-sm border-b border-stone-100 pb-3 last:border-0 last:pb-0 -mx-2 px-2 rounded hover:bg-stone-50 active:bg-stone-100"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">{lot.nom}</span>
                    <span className="text-stone-500"> — {lot.locataire}</span>
                  </div>
                  {manque > 0.01 && <Badge tone="red">{eur(manque)} dus</Badge>}
                </div>
                {manque > 0.01 && (
                  <p className="text-stone-600 mt-1">Versements incomplets : {eur(manque)} manquants au total.</p>
                )}
                {avance > 0.01 && (
                  <p className="text-stone-500 mt-1">
                    {eur(avance)} versés en trop sur d'autres mois — les deux ne se compensent pas
                    d'eux-mêmes.
                  </p>
                )}
                <p className="text-stone-500 text-xs mt-1">
                  Dernier encaissement enregistré : {dernier ? fmois(dernier) : "aucun"}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {depotsARestituer.length > 0 && (
        <Card className="border-amber-200">
          <h2 className="font-serif text-lg mb-3">Dépôts de garantie à restituer</h2>
          <div>
            {depotsARestituer.map(({ lot, joursEcoules }) => (
              <LigneLien key={lot.id} href={`/lots/${lot.id}`}>
                <span className="min-w-0">
                  <span className="font-medium">{lot.ancien_locataire || lot.locataire || lot.nom}</span>
                  <span className="block text-stone-500">Départ le {fdate(lot.date_depart)} — {eur(lot.depot_garantie)}</span>
                </span>
                <Badge tone={joursEcoules > 60 ? "red" : joursEcoules > 30 ? "amber" : "gray"}>
                  {joursEcoules > 60 ? "délai dépassé" : `${joursEcoules} j`}
                </Badge>
              </LigneLien>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-3">
            Le dépôt se restitue sous un mois si l'état des lieux de sortie est conforme, deux mois
            sinon. Passé ce délai, il est majoré de 10 % du loyer mensuel par mois de retard.
          </p>
        </Card>
      )}

      {docsAExpirer.length > 0 && (
        <Card className="border-amber-200">
          <h2 className="font-serif text-lg mb-3">Diagnostics et attestations à renouveler</h2>
          <div>
            {docsAExpirer.map(({ doc, jours }) => {
              const l = lots.find((x) => x.id === doc.lot_id);
              return (
                <LigneLien key={doc.id} href={`/documents?lot=${doc.lot_id || ""}&type=${doc.type || ""}`}>
                  <span className="min-w-0">
                    <span className="font-medium">{doc.titre || labelTypeDocument(doc.type)}</span>
                    <span className="block text-stone-500">{l?.nom || "Immeuble"}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-stone-500">{fdate(doc.date_expiration)}</span>
                    <Badge tone={jours < 0 ? "red" : jours <= 30 ? "amber" : "gray"}>
                      {jours < 0 ? "périmé" : `dans ${jours} j`}
                    </Badge>
                  </span>
                </LigneLien>
              );
            })}
          </div>
        </Card>
      )}

      {finsBail.length > 0 && (
        <Card>
          <h2 className="font-serif text-lg mb-3">Fins de bail dans les 12 mois</h2>
          <div>
            {finsBail.map(({ lot, jours }) => (
              <LigneLien key={lot.id} href={`/lots/${lot.id}`}>
                <span className="min-w-0">
                  <span className="font-medium">{lot.nom}</span>
                  <span className="text-stone-500"> — {lot.locataire}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-stone-500">{fdate(lot.fin_bail)}</span>
                  <Badge tone={jours < 0 ? "red" : jours <= 180 ? "amber" : "gray"}>
                    {jours < 0 ? "échu" : `dans ${jours} j`}
                  </Badge>
                </span>
              </LigneLien>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="font-serif text-lg mb-3">Prochaines révisions de loyer</h2>
        <div>
          {alertesRevision.map(({ lot, date, jours }) => (
            <LigneLien key={lot.id} href={`/indexation?lot=${lot.id}`}>
              <span className="min-w-0">
                <span className="font-medium">{lot.nom}</span>
                <span className="text-stone-500"> — {lot.locataire}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="text-stone-500">{fdate(date)}</span>
                <Badge tone={jours <= 45 ? "amber" : "gray"}>{jours >= 0 ? `dans ${jours} j` : "échue"}</Badge>
              </span>
            </LigneLien>
          ))}
        </div>
      </Card>

      {incomplets.length > 0 && (
        <Card className="border-amber-200">
          <h2 className="font-serif text-lg mb-3">À compléter</h2>
          <div>
            {incomplets.map((l) => (
              <LigneLien key={l.id} href={`/lots/${l.id}`}>
                <span className="min-w-0">
                  <span className="font-medium">{l.nom}</span>
                  <span className="block text-stone-600">{l.incomplet.join(" · ")}</span>
                </span>
              </LigneLien>
            ))}
          </div>
        </Card>
      )}

      <Bandeau retour={retour} />
    </div>
  );
}

export default function Page() {
  return <DashboardInner />;
}
