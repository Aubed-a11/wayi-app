// Config PM2 du backend WAYI.
//
// Sur un VPS installé avec deploy/setup-vps.sh, tout est déjà démarré et réglé pour
// redémarrer automatiquement avec le serveur. Commandes utiles (en root) :
//   wayi-pm2 status               -> le process tourne-t-il ?
//   wayi-pm2 logs wayi-backend    -> logs en direct (les refus CORS y apparaissent)
//   wayi-pm2 restart wayi-backend -> relancer après une modification du .env
//
// Le port, la base de données et les clés viennent du fichier .env (jamais d'ici).

module.exports = {
  apps: [
    {
      name: 'wayi-backend',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,            // l'état est gardé en mémoire : une seule instance, pas de cluster
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      time: true,              // horodate chaque ligne de log
      // À l'arrêt (restart, reboot), le serveur sauvegarde son état complet en base avant de
      // quitter. PM2 le tue au bout de 1,6 s par défaut : on lui laisse 10 s pour finir.
      kill_timeout: 10000,
      // En cas de plantage en boucle, espace les relances au lieu de saturer le serveur.
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
