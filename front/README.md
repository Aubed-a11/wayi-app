# WAYI — Livraison de repas au Bénin

WAYI est une plateforme de livraison de repas pensée différemment des applications
classiques : au lieu de choisir un restaurant puis parcourir son menu, le client
choisit directement un **plat** — chaque plat affiche le badge du restaurant
partenaire qui le prépare. WAYI se positionne comme un **curateur**, pas un
agrégateur.

Le projet est composé d'un backend unique et de trois applications front
séparées, une par rôle : client, livreur, restaurant/admin.

---

## Sommaire

- [Stack technique](#stack-technique)
- [Fonctionnalités](#fonctionnalités)
- [Flux de commande](#flux-de-commande)
- [Comptes et authentification](#comptes-et-authentification)
- [Persistance des données](#persistance-des-données)
- [Design](#design)
- [Installation locale](#installation-locale)
- [Variables d'environnement](#variables-denvironnement)
- [Déploiement en production](#déploiement-en-production)
- [Sécurité](#sécurité)
- [Limites connues](#limites-connues)

---

## Stack technique

| Couche | Techno |
|---|---|
| Frontend | React 18 + Vite 5, CSS pur (pas de Tailwind), `axios`, `socket.io-client` |
| Backend | Express 4, `jsonwebtoken`, `bcryptjs`, `helmet`, `express-rate-limit`, Socket.io |
| Base de données | PostgreSQL (conteneur Docker), sauvegarde/restauration automatique |
| Paiement | Kkiapay, MTN MoMo, Moov Money, Orange Money, cash (avec simulation si non configuré) |
| Notifications | SMTP (ou Resend) pour l'e-mail, WhatsApp Business API, Twilio SMS, Firebase FCM |
| IA | "Yivi", assistant conversationnel (Claude via API Anthropic) |

Chaque intégration externe non configurée (paiement, e-mail, SMS, IA...) bascule
automatiquement en mode simulation plutôt que de faire planter l'application —
pratique pour développer et tester sans avoir toutes les clés API.

## Fonctionnalités

**Client**
- Menu du jour organisé par période (petit-déjeuner, déjeuner, goûter, dîner)
- Panier multi-restaurants, paiement mobile money / carte / cash
- Suivi de commande en temps réel (Socket.io) jusqu'à la livraison
- Assistant IA "Yivi" pour des recommandations
- Favoris, adresses enregistrées, historique et notation des commandes

**Restaurant**
- Création de compte en self-service (comme le client) ou par l'admin
- Gestion de son propre menu (ajout/modification/suppression de plats)
- Acceptation ou rejet de chaque commande entrante
- Choix manuel du livreur à assigner une fois la commande prête
- Statistiques (commandes, chiffre d'affaires, abonnement)

**Livreur**
- Réception des courses en temps réel (ping ou assignation directe)
- Suivi de position, historique de livraisons, gains
- Capture terrain (photos/notes en tournée)

**Admin**
- Création de comptes restaurant et livreur (avec e-mail de bienvenue)
- Supervision globale : commandes, restaurants, livreurs, revenus
- Suspension/réactivation de comptes livreur
- Outil d'appels (Telemarketing) : listes de clients ou de restaurants à appeler selon un motif
  (jamais commandé, inactif, abonnement qui expire, menu vide...), script d'appel adapté,
  enregistrement du résultat de chaque appel et rappels programmés. Les appels se passent
  depuis le téléphone de l'agent (lien d'appel) : l'application n'appelle pas elle-même.

## Flux de commande

```
Client commande
      │
      ▼
  "pending"  ──────────────► Restaurant voit la commande sur son dashboard
      │                              │
      │                    ┌─────────┴─────────┐
      │                 Rejette              Accepte
      │                    │                    │
      ▼                    ▼                    ▼
 "cancelled"                              "preparing"
 (client notifié)                    (client notifié + e-mail réel envoyé
                                       pour la première fois ici)
                                              │
                                    Restaurant marque prêt
                                              │
                                              ▼
                                          "ready"
                                              │
                                Restaurant choisit un livreur
                                     dans la liste des disponibles
                                              │
                                              ▼
                                   Livreur récupère → "on_the_way"
                                              │
                                              ▼
                                        "delivered"
                        (suivi temps réel visible côté client à chaque étape)
```

Point important : **le client n'est notifié "commande confirmée" qu'au moment où
le restaurant accepte réellement** — jamais avant. C'est aussi le tout premier
moment où l'e-mail de confirmation part.

## Comptes et authentification

- Connexion **par e-mail uniquement** sur les 3 espaces (client, restaurant,
  admin/livreur) — pas de numéro de téléphone, pas de connexion Google/Facebook.
- **Inscription en self-service** pour les clients et pour les restaurants, avec
  vérification par code à 6 chiffres envoyé par e-mail (10 minutes de validité).
- Les comptes livreur et admin sont créés par l'admin (formulaire dédié, avec
  mot de passe temporaire envoyé par e-mail).
- JWT pour l'authentification API, secret généré aléatoirement au démarrage si
  `JWT_SECRET` n'est pas définie dans `.env` (voir [Sécurité](#sécurité)).

## Persistance des données

Par défaut, tout vit en mémoire (redémarrer le serveur efface tout). Avec
`DATABASE_URL` configurée (PostgreSQL), l'état complet de l'application
(utilisateurs, commandes, restaurants, plats...) est :
- **sauvegardé automatiquement toutes les 30 secondes**,
- **sauvegardé à chaque arrêt propre** du serveur (`pm2 restart`, Ctrl+C),
- **restauré au démarrage**.

Voir `backend/services/database/postgres.js` pour le détail de l'approche (un
seul objet JSON versionné plutôt que des tables relationnelles séparées — un
choix pragmatique pour la taille actuelle du projet).

## Design

Interface volontairement sobre :
- Police **Times New Roman** partout, aucune police externe chargée
- **Aucune icône** — les actions et statuts sont indiqués par du texte ou des
  caractères simples (×, +, −, ★, ✓)
- Pas de "cadre téléphone" même sur grand écran : chaque app est responsive et
  s'adapte réellement à la taille de l'écran (mobile, tablette, desktop)

## Installation locale

**Backend**
```bash
cd backend
npm install
cp .env.example .env    # renseigner au moins JWT_SECRET
npm run dev              # ou: npm start
```

**Chaque app front** (répéter pour `client`, `ops`, `driver`)
```bash
cd apps/client
npm install
npm run dev
```

Sans configuration supplémentaire, tout fonctionne en mode simulation (paiement,
e-mail, SMS...) — pratique pour développer sans clés API réelles.

## Variables d'environnement

Le fichier `backend/.env.example` documente toutes les variables disponibles,
avec des explications. Les plus importantes :

| Variable | Rôle |
|---|---|
| `JWT_SECRET` | Signature des tokens de connexion — **à définir en production** |
| `DATABASE_URL` | Active la persistance PostgreSQL (sinon tout est en mémoire) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Envoi d'e-mails réel (sinon simulation) |
| `KKIAPAY_*` | Paiement mobile money / carte (sandbox par défaut) |
| `WHATSAPP_*`, `TWILIO_*`, `FIREBASE_*` | Notifications (dégradées si absentes) |
| `ANTHROPIC_API_KEY` | Active l'assistant IA "Yivi" (sinon réponses simulées) |
| `FRONTEND_URLS` | Domaines autorisés en CORS, séparés par des virgules |

## Déploiement en production

- **Backend** : VPS avec PM2, derrière un reverse proxy Nginx (voir `deploy/`)
  qui termine le SSL. `app.set('trust proxy', 1)` est nécessaire dans ce cas
  pour que le rate-limiting fonctionne correctement.
- **Nouveau serveur** : `GUIDE-DEPLOIEMENT.md` et le dossier `deploy/` installent le backend
  automatiquement sur un VPS vierge (Node, PostgreSQL, Nginx, HTTPS, sauvegardes) et migrent
  les données de l'ancien serveur. Les origines CORS autorisées sont dans `backend/config/origins.js`.
- **Applications (Vercel)** : `deploy-front.mjs` compile, déploie ET vérifie le site en ligne.
  `node deploy-front.mjs admin` (tableau de bord), `driver` (livreur) ou `client`, ou les fichiers
  `deployer-*.bat` (double-clic sous Windows). `node deploy-front.mjs all --verify-only` (ou
  `verifier-en-ligne.bat`) dit ce que les trois sites en ligne servent réellement, sans rien déployer.
- **PostgreSQL** : conteneur Docker dédié, exposé uniquement sur `127.0.0.1`
  (jamais sur l'IP publique).
- **Fronts** : chaque app se déploie indépendamment sur Vercel
  (`vercel --prod` depuis son propre dossier), avec sa propre variable
  `VITE_API_URL` pointant vers le backend.

## Sécurité

Quelques points spécifiquement traités et à garder à l'esprit :
- Aucun mot de passe universel/de contournement — chaque connexion vérifie un
  vrai hash bcrypt.
- Les webhooks de paiement (Kkiapay) et WhatsApp (Meta) vérifient une signature
  avant de faire confiance à la requête entrante.
- `/api/payments/initiate` et `/verify` vérifient que l'appelant est bien
  propriétaire de la commande concernée.
- Le mode sandbox de paiement (`KKIAPAY_SANDBOX`) doit être explicitement
  désactivé avant tout lancement avec de vrais paiements.

## Limites connues

- Une nouvelle commande de restaurant démarre avec une position GPS par défaut
  (centre-ville par défaut) — à ajuster manuellement si besoin, pas encore de
  sélecteur de position dans le formulaire d'inscription.
- Pas de suite de tests automatisés.
- La persistance PostgreSQL utilise un seul objet JSON plutôt que de vraies
  tables relationnelles — largement suffisant à l'échelle actuelle, mais à
  revoir si le volume de données grossit significativement.
- Pas de fonctionnalité "changer mon mot de passe" pour les comptes créés avec
  un mot de passe temporaire (restaurant, livreur) — à ajouter si besoin.
