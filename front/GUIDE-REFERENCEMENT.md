# Référencer WAYI sur Google (« wayi bénin »)

## Ce qui est déjà fait dans ce paquet
- **Titre et description** du site : « WAYI Bénin – Livraison de repas au Bénin » + une phrase de description.
- **Logo/icône** aux bonnes tailles (48, 96, 192, 512 px + favicon.ico) : c'est la petite image affichée à côté du nom du site dans Google.
- **Image de partage** (og-image.png, 1200×630) : aperçu quand on partage le lien sur WhatsApp, Facebook, LinkedIn.
- **Données structurées** (JSON-LD) : disent à Google que « WAYI », « WAYI Bénin » et « Wayi Benin » désignent ce site.
- `robots.txt` et `sitemap.xml` pour www.wayibenin.com.
- Le **tableau de bord (admin)** et l'**application livreur** sont marqués « ne pas référencer » : ils ne doivent pas apparaître sur Google.

## Étape 1 : mettre en ligne (3 commandes, dans le dossier du projet)
1. Dézippez `wayi-referencement.zip` PAR-DESSUS le projet (acceptez de remplacer les fichiers).
2. Lancez :
```
node deploy-front.mjs client
node deploy-front.mjs admin
node deploy-front.mjs driver
```
3. Vérifiez dans le navigateur : https://www.wayibenin.com/robots.txt et https://www.wayibenin.com/sitemap.xml doivent afficher du texte (pas l'application).

## Étape 2 : prévenir Google (Search Console) — c'est vous qui devez le faire
1. Allez sur https://search.google.com/search-console et connectez-vous avec votre compte Google.
2. « Ajouter une propriété » > **Domaine** > tapez `wayibenin.com`.
3. Google donne une ligne **TXT**. Chez Hostinger (hPanel > Domaines > DNS) : ajoutez un enregistrement **TXT**, Nom `@`, Valeur = la ligne donnée par Google. Puis « Valider » dans Search Console (peut prendre quelques minutes à quelques heures).
4. Menu **Sitemaps** : ajoutez `sitemap.xml` > Envoyer.
5. Menu **Inspection de l'URL** : collez `https://www.wayibenin.com/` > **Demander une indexation**.

## Étape 3 : donner à Google des raisons de vous faire confiance
- Créez/complétez les pages **Facebook, Instagram, LinkedIn, WhatsApp Business** « WAYI Bénin » avec le lien https://www.wayibenin.com dans la bio. Plus il y a de sites sérieux qui pointent vers le vôtre, plus Google l'affiche haut.
- Créez une fiche **Google Business Profile** (entreprise de services, zone : votre ville au Bénin) : c'est ce qui donne la carte avec téléphone/horaires à droite des résultats.
- Inscrivez le site sur **Bing Webmaster Tools** (https://www.bing.com/webmasters, bouton « Importer depuis Google Search Console »).
- Quand ces profils existent, envoyez-moi les liens : je les ajoute dans les données structurées (`sameAs`).

## À savoir (pour ne pas être déçu)
- L'indexation prend **de quelques jours à quelques semaines**. Test : tapez `site:www.wayibenin.com` dans Google.
- Google décide seul de l'affichage final (icône, titre, description). Nous lui donnons tout ce qu'il faut, mais personne ne peut le garantir ni choisir la position.
- La **fiche Play Store** et le **résumé IA** vus sur votre capture ne se contrôlent pas : la fiche Play Store n'existera qu'une fois l'application publiée sur Google Play.
- Dans Vercel (projet `wayi-client` > Domains), vérifiez que `wayibenin.com` redirige bien vers `www.wayibenin.com`, pour ne pas avoir deux adresses concurrentes.
