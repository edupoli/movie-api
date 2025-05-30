SELECT cron.schedule(
    'update_programacao_status_daily',
    '1 0 * * *',
    $$SELECT update_all_programacao_status()$$
);