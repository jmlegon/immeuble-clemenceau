# Gestion locative — 1 bd Clémenceau, Binic

Application Next.js déployée sur **Vercel**, données et authentification sur **Supabase**.

## 1. Créer le projet Supabase

1. Allez sur https://supabase.com, créez un compte, puis **New project**.
2. Choisissez une **région européenne** (Frankfurt ou Ireland selon la disponibilité) pour rester conforme au RGPD.
3. Notez le mot de passe de la base — vous n'en aurez pas besoin au quotidien mais gardez-le de côté.
4. Une fois le projet créé, allez dans **SQL Editor > New query**, collez tout le contenu du fichier
   `supabase/schema.sql` fourni, et cliquez sur **Run**. Cela crée les tables, la sécurité (RLS),
   et charge vos 5 lots + les données déjà connues (relevés d'eau, factures historiques…).
5. Allez dans **Storage**, créez un bucket nommé `documents`, et laissez-le **privé** (pas de case "Public").
6. Allez dans **Authentication > Users > Add user**, et créez **deux comptes** :
   - le vôtre (email + mot de passe)
   - celui de Baptiste (email + mot de passe), à activer quand il sera prêt à participer
   Cochez « Auto Confirm User » pour éviter l'étape de confirmation par email.
7. Allez dans **Project Settings > API**. Notez `Project URL` et la clé `anon public`.

## 2. Configurer le projet

1. Copiez `.env.local.example` en `.env.local`.
2. Remplissez `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` avec les valeurs de l'étape 1.7.

## 3. Tester en local (optionnel mais recommandé)

```bash
npm install
npm run dev
```

Ouvrez http://localhost:3000 — vous devriez arriver sur l'écran de connexion, vous connecter avec le
compte créé à l'étape 1.6, et voir le tableau de bord avec vos 5 lots déjà chargés.

## 4. Déployer sur Vercel

1. Créez un dépôt Git (GitHub, GitLab…) et poussez ce dossier dedans — le plus simple pour que Vercel
   redéploie automatiquement à chaque modification.
2. Sur https://vercel.com, **Add New Project**, importez ce dépôt.
3. Dans les paramètres du projet Vercel, section **Environment Variables**, ajoutez les deux mêmes
   variables que dans `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
4. Cliquez sur **Deploy**. Au bout de quelques minutes, vous obtenez une URL du type
   `https://immeuble-clemenceau.vercel.app` — c'est votre application, accessible depuis n'importe où.

## 4 bis. Migrations de la base

Le fichier `supabase/schema.sql` correspond à l'installation initiale. Les évolutions
ultérieures arrivent sous forme de fichiers `supabase/migration-XX-*.sql`, à passer **dans
l'ordre**, une seule fois chacun : SQL Editor > New query > coller > Run. Ils sont
idempotents, les rejouer ne casse rien.

| Migration | Ce qu'elle apporte |
|---|---|
| `migration-01-depenses-et-suivi.sql` | Table `depenses`, suivi de restitution des dépôts de garantie, reprise de la taxe foncière existante en dépense commune |
| `migration-02-indexations-et-documents.sql` | Table `indexations` (historique des révisions de loyer), colonnes `titre` et `date_expiration` sur `documents` |

Tant qu'une migration n'est pas passée, les écrans qui en dépendent affichent un message
le signalant plutôt qu'une page vide.

## 5. Quand Baptiste rejoint

Il lui suffit de se rendre sur l'URL Vercel et de se connecter avec le compte que vous aurez créé pour
lui dans Supabase (étape 1.6). Aucune réinstallation, aucune donnée à migrer.

## 6. Sauvegardes automatiques

Une action GitHub (`.github/workflows/sauvegarde.yml`) exporte chaque **lundi à 4 h** toutes
les tables (JSON + CSV) et tous les fichiers du bucket Storage. L'archive est déposée dans les
artefacts du dépôt, conservés 90 jours.

### Activation — à faire une fois

1. Sur GitHub : **Settings > Secrets and variables > Actions > New repository secret**
2. Créez deux secrets :
   - `SUPABASE_URL` = `https://suigvsergpjfoljdtgrr.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = la clé **secrète** (Supabase > Project Settings > API Keys,
     `sb_secret_…`)
3. Onglet **Actions > Sauvegarde Supabase > Run workflow** pour vérifier tout de suite.

La clé `service_role` contourne le RLS : c'est indispensable pour lire l'ensemble des données
sans session utilisateur. Elle ne doit exister qu'à deux endroits : le tableau de bord Supabase
et les secrets GitHub. Ne la collez jamais dans un message, un fichier du dépôt ou `.env.local`.

### Export manuel

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run export
```

Produit `export/AAAA-MM-JJ/` (dossier ignoré par Git). À copier sur un disque externe ou dans
votre Drive pour une conservation longue durée.

### Pourquoi les sauvegardes ne sont pas commitées

Elles contiennent des données personnelles de locataires. Dans l'historique Git, elles seraient
répliquées chez quiconque clone le dépôt et quasi impossibles à effacer en cas de demande de
suppression. Les artefacts GitHub expirent d'eux-mêmes, ce qui est plus sain.

## Notes sur les données préchargées

Trois points restent à trancher, déjà signalés dans l'application (onglet Tableau de bord, section
« À compléter ») :
- Les deux N° SIRET des locataires commerciaux
- La valeur exacte de l'IRL T3 2025 pour le bail meublé (Mme Dazord)
- Le financement de la remise en état du logement B19 (ex-M. Nouar)
