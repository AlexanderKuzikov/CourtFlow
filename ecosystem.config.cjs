// ecosystem.config.cjs — pm2 конфиг для CourtFlow
// Использование:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup   (выполнить команду которую выдаст pm2)

module.exports = {
  apps: [
    {
      // --- Viewer (постоянный веб-сервер) ---
      name: 'courtflow-viewer',
      script: 'npx',
      args: 'tsx packages/viewer/server.ts',
      cwd: '/opt/courtflow',          // путь к проекту на сервере
      interpreter: 'none',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      // Логи
      out_file: '/opt/courtflow/logs/pm2-viewer-out.log',
      error_file: '/opt/courtflow/logs/pm2-viewer-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      // --- Parser (по расписанию, не демон) ---
      name: 'courtflow-parser',
      script: 'npx',
      args: 'tsx packages/scheduler/orchestrator.ts',
      cwd: '/opt/courtflow',
      interpreter: 'none',
      autorestart: false,            // однократный запуск — не перезапускать
      cron_restart: '0 */6 * * *',  // каждые 6 часов: 00:00, 06:00, 12:00, 18:00
      watch: false,
      env: {
        NODE_ENV: 'production',
        // RUCAPTCHA_API_KEY берётся из .env через dotenv внутри приложения
      },
      out_file: '/opt/courtflow/logs/pm2-parser-out.log',
      error_file: '/opt/courtflow/logs/pm2-parser-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
