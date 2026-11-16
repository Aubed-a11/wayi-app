# Déployer le backend WAYI sur un nouveau serveur (VPS)

Ce paquet contient le backend complet et des scripts qui installent tout automatiquement :
Node.js, la base PostgreSQL, Nginx, le pare-feu, le HTTPS et les sauvegardes quotidiennes.

```
wayi-backend-vps/
  backend/     le code du serveur (API + temps réel)
  deploy/      les scripts d'installation, de migration et de test
  GUIDE-DEPLOIEMENT.md
```

## Ce qui est déjà réglé : le CORS

Le backend accepte uniquement ces sites (API et suivi en direct), et refuse tous les autres :

| Application | Adresse autorisée |
|---|---|
| Client | https://www.wayibenin.com (et https://wayibenin.com sans « www ») |
| Livreur | https://driver.wayibenin.com |
| Restaurant et administration | https://admin.wayibenin.com |

Ces adresses sont écrites dans le code (`backend/config/origins.js`) ET dans le `.env` généré,
donc un nouveau serveur ne peut pas les oublier. Les adresses `localhost` ne sont acceptées
qu'en développement, jamais en production.

## Avant de commencer

1. Un nouveau VPS sous **Ubuntu 22.04 ou 24.04** (recommandé), Debian 12 ou AlmaLinux/Rocky 9 et plus,
   avec au moins 1 Go de mémoire et un accès SSH en root.
2. L'accès à la gestion DNS du domaine `wayibenin.com`.
3. Facultatif mais utile : la veille, baisser la durée de vie (TTL) de l'enregistrement `api` à 300
   secondes, pour que la bascule soit rapide.

L'ancien serveur reste intact et en service jusqu'à l'étape 3 : tant que vous n'y avez pas touché, vos
utilisateurs ne voient aucune différence, et vous pouvez tout vérifier tranquillement.

## Étape 0 : si le serveur contient déjà une installation WAYI

Une ancienne installation (même ratée) peut gêner la nouvelle : elle occupe des ports, garde un
service actif ou une ancienne base. Le script de nettoyage la supprime :
```bash
cd /root/wayi-backend-vps
bash deploy/reset-vps.sh
```
Il **affiche d'abord tout ce qu'il va supprimer** (processus PM2, services, conteneurs et volumes
Docker, configurations Nginx, dossiers) et attend que vous tapiez `OUI`. Il ne touche qu'à ce dont le
nom contient « wayi », jamais au paquet d'installation, à `/root/wayi-migration.tgz` ni à vos
archives `.zip`. Les données de l'ancienne installation sont perdues. Si le serveur est neuf, le
script répond « Rien à supprimer » et vous pouvez passer à l'étape 1.

## Si le serveur héberge déjà d'autres projets

L'installateur est conçu pour cohabiter avec d'autres applications, et ne touche qu'à ce qui est à lui :

| Sujet | Ce qu'il fait |
|---|---|
| Nginx | Ajoute **ses propres fichiers** (`api.wayibenin.com.conf`, `wayi-ws-map.conf`) dans `/etc/nginx/conf.d/`. Vos autres sites ne sont pas modifiés. |
| Port du backend | Le backend écoute **uniquement sur ce serveur** (`HOST=127.0.0.1`), il n'est joignable que par Nginx, jamais directement depuis Internet. |
| Pare-feu | Il **n'active jamais** un pare-feu qui ne l'est pas déjà si d'autres programmes écoutent sur des ports publics : ils deviendraient injoignables. Il affiche alors la liste de ces ports. Si le pare-feu est déjà actif, il ajoute seulement SSH, 80 et 443. |
| Docker | Crée son propre conteneur `wayi-postgres`, lié à `127.0.0.1:5433`. |
| Routeur TCP (nginx `stream`) | Si un routeur tient déjà le port 443 pour plusieurs sites (cas de nombreux serveurs partagés), le bloc HTTPS de WAYI écoute sur **la voie interne du routeur** (par exemple `127.0.0.1:8444`), exactement comme vos autres sites. Le routeur lui-même n'est jamais modifié. |
| Filet de sécurité | `nginx -t` ne détecte pas les conflits de port. Après chaque modification, le script vérifie que Nginx a vraiment accepté la configuration ; sinon il **remet l'ancienne version du fichier** et s'arrête. Sans cela, un redémarrage du serveur aurait pu empêcher Nginx de démarrer, donc tous les sites. |
| Adresse des visiteurs | Un routeur TCP ne transmet pas l'adresse du visiteur : le backend voit toujours `127.0.0.1`. Les limites anti-abus se font alors **par identifiant (e-mail visé) ou par jeton de connexion** au lieu de l'être par adresse, pour ne pas bloquer tout le monde avec la limite d'une seule personne. Avec une vraie adresse, le comportement est inchangé (une limite par adresse). |
| Mémoire | Pas de module PM2 supplémentaire : la rotation des logs passe par `logrotate`, qui ne consomme rien en permanence. |

`deploy/reset-vps.sh` ne supprime que ce dont le nom contient « wayi », mais comme il supprime aussi
l'installation en cours, ne le lancez **pas** après une installation réussie.
Si une ancienne installation WAYI traîne sur un serveur partagé, retirez-la à la main :
```bash
pm2 describe wayi-backend | grep -E "script path|exec cwd"    # vérifier que c'est bien l'ancien
pm2 delete wayi-backend && pm2 save                          # le PM2 de root : vos autres applications restent
```
Le PM2 de l'installation actuelle est celui de l'utilisateur `wayi` (`wayi-pm2 status`).

## Étape 1 : installer sur le nouveau serveur

Depuis votre PC Windows (dossier du zip) :
```cmd
scp wayi-backend-vps.zip root@IP_NOUVEAU_SERVEUR:/root/
ssh root@IP_NOUVEAU_SERVEUR
```
Puis, sur le nouveau serveur :
```bash
(command -v unzip >/dev/null || apt-get install -y unzip || dnf install -y unzip)
cd /root && unzip -q wayi-backend-vps.zip && cd wayi-backend-vps
bash deploy/setup-vps.sh
```
Le script affiche chaque étape (1/9 à 9/9) et peut être relancé sans danger.

## Étape 2 : tester avant toute bascule

```bash
bash deploy/smoke-test.sh http://127.0.0.1 api.wayibenin.com
```
Il doit se terminer par « Tout est bon » : serveur en ligne, base de données connectée, et les trois
applications acceptées par le CORS (API et temps réel). La base est vierge à ce stade.

## Étape 3 : migrer les données de l'ancien serveur

C'est le moment où l'ancien serveur s'arrête (comptez une dizaine de minutes de coupure).

**Sur l'ancien serveur** (en root) : récupérer le script puis l'exécuter.
```bash
scp root@IP_NOUVEAU_SERVEUR:/root/wayi-backend-vps/deploy/export-from-old-vps.sh /root/
bash /root/export-from-old-vps.sh
scp /root/wayi-migration.tgz root@IP_NOUVEAU_SERVEUR:/root/
```
Le script arrête le backend, exporte la base, copie le `.env` (clés de paiement, e-mail...) et prépare
`/root/wayi-migration.tgz`. Le backend de l'ancien serveur reste arrêté pour ne pas créer de données
qui ne seraient pas migrées.

**Sur le nouveau serveur** : relancer l'installation, qui détecte le paquet.
```bash
cd /root/wayi-backend-vps && bash deploy/setup-vps.sh
bash deploy/smoke-test.sh http://127.0.0.1 api.wayibenin.com
```
Le `.env` de l'ancien serveur est repris (le secret de connexion est conservé : personne n'est
déconnecté), seuls la base de données, le CORS et l'adresse publique sont corrigés. Les données sont
importées une seule fois : relancer le script plus tard n'écrasera jamais des données plus récentes.

## Étape 4 : basculer le DNS

Chez le gestionnaire du domaine, modifier l'enregistrement **A** de `api.wayibenin.com` pour qu'il
pointe vers l'adresse du nouveau serveur. Vérifier :
```bash
nslookup api.wayibenin.com
```
Si le domaine passe par Cloudflare avec le nuage orange, le passer en gris le temps d'obtenir le certificat.

## Étape 5 : activer le HTTPS

Dès que le DNS répond avec la nouvelle adresse :
```bash
bash deploy/enable-ssl.sh votre@email.com
```
Si le script dit que le domaine pointe encore ailleurs, patientez quelques minutes et relancez.
Le certificat est gratuit (Let's Encrypt) et se renouvelle tout seul.

## Étape 6 : vérifications finales

```bash
bash deploy/smoke-test.sh https://api.wayibenin.com
```
Puis, dans les trois applications : se connecter, passer une commande, la suivre en direct depuis
l'écran de suivi client (c'est le temps réel), l'accepter côté restaurant, l'assigner à un livreur.
Les webhooks de paiement (Kkiapay, WhatsApp) n'ont rien à changer : l'adresse `api.wayibenin.com`
est la même.

## Étape 7 : nettoyage

Après quelques jours de fonctionnement stable : supprimer `/root/wayi-migration*` sur les deux
serveurs (ils contiennent vos clés secrètes et les données), arrêter définitivement le backend de
l'ancien serveur, puis résilier l'ancien VPS.

## Retour en arrière

Si quelque chose se passe mal juste après la bascule : repointer le DNS vers l'ancienne adresse et
relancer l'ancien backend (`pm2 start wayi-backend`). Faites-le vite : les commandes passées entre
temps sur le nouveau serveur ne seront pas sur l'ancien.

## Compte administrateur

Sans réglage, le compte administrateur de démonstration (`admin@wayi.bj`) a un mot de passe connu de
tous. `setup-vps.sh` en **génère donc un** à la première installation, l'affiche **une seule fois** à
l'écran dès l'étape 6/9 (notez-le) et l'écrit dans `/home/wayi/wayi-backend/.env` sous `ADMIN_PASSWORD`.

Pour le relire si vous l'avez manqué :
```bash
grep '^ADMIN_PASSWORD=' /home/wayi/wayi-backend/.env
```

Pour le changer à tout moment : modifier cette ligne (10 caractères minimum, sans espace ni `#`), puis
`wayi-pm2 restart wayi-backend`. Le nouveau mot de passe est appliqué au redémarrage. Deux réglages
facultatifs dans le même fichier : `ADMIN_EMAIL` (e-mail de connexion) et `DEMO_PASSWORD` (mot de passe
des comptes de démonstration client et livreurs).

## Les applications (Vercel)

Rien à changer tant que la variable `VITE_API_URL` de chacun des trois projets Vercel vaut
exactement `https://api.wayibenin.com` (sans « / » à la fin et sans `/api`) : le domaine ne change pas.

## Ajouter un site autorisé (CORS)

Éditer `/home/wayi/wayi-backend/.env`, ajouter l'adresse (sans « / » final) :
```
FRONTEND_URLS=https://autre-site.exemple.com
```
puis `wayi-pm2 restart wayi-backend`.

## Au quotidien

| Besoin | Commande (en root) |
|---|---|
| Voir si le serveur tourne | `wayi-pm2 status` |
| Voir les logs en direct | `wayi-pm2 logs wayi-backend` |
| Redémarrer (après un changement du `.env`) | `wayi-pm2 restart wayi-backend` |
| Vérifier la santé et le CORS | `bash deploy/smoke-test.sh https://api.wayibenin.com` |
| Déployer une nouvelle version du code | dézipper le nouveau paquet, puis `bash deploy/setup-vps.sh` |
| Changer le mot de passe administrateur | modifier `ADMIN_PASSWORD` dans `/home/wayi/wayi-backend/.env`, puis `wayi-pm2 restart wayi-backend` |
| Restaurer une sauvegarde | `bash deploy/restore-db.sh /var/backups/wayi/wayi-AAAAMMJJ-HHMMSS.sql.gz` |

Les sauvegardes de la base sont faites chaque nuit à 3 h dans `/var/backups/wayi` (14 jours conservés).
Elles sont sur le même serveur : copiez-les régulièrement ailleurs (par exemple `scp` vers votre PC).
Toutes les données de l'application sont dans cette base.

## Dépannage

| Symptôme | Où regarder |
|---|---|
| Erreur CORS dans le navigateur | `wayi-pm2 logs wayi-backend --lines 50` : un refus s'écrit `[CORS] Origine refusée : ...` avec l'origine exacte (https, « www », pas de « / » final). |
| Nginx affiche « 502 Bad Gateway » | Le backend est arrêté : `wayi-pm2 status`, puis les logs. |
| `https://api.wayibenin.com` donne une erreur de certificat (« mauvais nom ») | Le bloc HTTPS de WAYI n'est pas actif et le serveur présente le certificat d'un autre site. Relancez `bash deploy/setup-vps.sh`, qui détecte le type de serveur, puis contrôlez avec `nginx -T 2>/dev/null \| grep -n "listen"`. |
| Le certificat échoue | Le DNS ne pointe pas encore vers ce serveur : `nslookup api.wayibenin.com`. |
| « base de données injoignable » | `docker ps` et `docker logs wayi-postgres`. Le mot de passe est dans `/var/lib/wayi/db-password`. |
| Voir l'état de santé de l'application | `curl http://127.0.0.1:3010/health` |
| « Le port 80 est déjà utilisé » à l'installation | Une ancienne installation ou un autre serveur web tourne : `bash deploy/reset-vps.sh` (affiche qui occupe le port), ou arrêtez ce programme. |
| « Le backend ne démarre pas correctement » | Souvent un ancien processus sur le port 3010 : `bash deploy/reset-vps.sh`, puis relancer `bash deploy/setup-vps.sh`. |
