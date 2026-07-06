// ecosystem.config.cjs — pm2 конфиг для CourtFlow
// Использование:
//   pm2 start ecosystem.config.cjs
//   pm2 save
//   pm2 startup   (выполнить команду которую выдаст pm2)
//
// Расписание:
//   courtflow-parser       — основной прогон (все URL), cron из config.json: schedule
//   courtflow-parser-retry — retry-прогон (только stale URL), cron из config.json: scheduleRetry
//
// Retry-прогон передаёт --retry флаг оркестратору. Оркестратор сам фильтрует stale URL.

module.exports = {
  apps: [
    {
      name: 'courtflow-viewer',
      script: 'npx',
      args: 'tsx packages/viewer/server.ts',
      cwd: '/opt/courtflow',
      interpreter: 'none',
      autorestart: true,
      watch: false,
      env: { NODE_ENV: 'production' },
      out_file: '/opt/courtflow/logs/pm2-viewer-out.log',
      error_file: '/opt/courtflow/logs/pm2-viewer-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'courtflow-parser',
      script: 'npx',
      args: 'tsx packages/scheduler/orchestrator.ts',
      cwd: '/opt/courtflow',
      interpreter: 'none',
      autorestart: false,
      cron_restart: '0 8 * * 1,3,5',  // основной прогон — из config.json schedule
      watch: false,
      env: { NODE_ENV: 'production' },
      out_file: '/opt/courtflow/logs/pm2-parser-out.log',
      error_file: '/opt/courtflow/logs/pm2-parser-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'courtflow-parser-retry',
      script: 'npx',
      args: 'tsx packages/scheduler/orchestrator.ts --retry',
      cwd: '/opt/courtflow',
      interpreter: 'none',
      autorestart: false,
      cron_restart: '0 11,14 * * 1,3,5', // retry-прогон — из config.json scheduleRetry
      watch: false,
      env: { NODE_ENV: 'production' },
      out_file: '/opt/courtflow/logs/pm2-parser-retry-out.log',
      error_file: '/opt/courtflow/logs/pm2-parser-retry-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
