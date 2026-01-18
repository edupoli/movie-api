import cron from 'node-cron';
import { syncVelox } from '../utils/velox-api';
import { syncVendaBem } from '../utils/venda-bem-api';
import { syncIngressoComAll } from '../utils/ingresso.com';

/**
 * Executa todas as sincronizações de APIs externas
 */
async function runAllSyncs() {
  console.log(
    `[CRON JOB] Iniciando sincronização automática - ${new Date().toLocaleString('pt-BR')}`,
  );

  try {
    // Velox API
    console.log('[CRON JOB] Sincronizando Velox...');
    await syncVelox();
    console.log('[CRON JOB] ✓ Velox concluída');

    // VendaBem API (Multicine)
    console.log('[CRON JOB] Sincronizando Multicine/VendaBem...');
    await syncVendaBem();
    console.log('[CRON JOB] ✓ Multicine/VendaBem concluída');

    // Ingresso.com API
    console.log('[CRON JOB] Sincronizando Ingresso.com...');
    await syncIngressoComAll();
    console.log('[CRON JOB] ✓ Ingresso.com concluída');

    console.log(
      `[CRON JOB] Sincronização automática finalizada com sucesso - ${new Date().toLocaleString('pt-BR')}`,
    );
  } catch (error) {
    console.error('[CRON JOB] Erro durante sincronização automática:', error);
  }
}

/**
 * Inicializa os jobs agendados
 */
export function startSyncJobs() {
  console.log('[CRON JOB] Inicializando jobs de sincronização...');

  // Job às 6h
  cron.schedule(
    '0 6 * * *',
    () => {
      console.log('[CRON JOB] Executando job das 6h');
      runAllSyncs();
    },
    {
      timezone: 'America/Sao_Paulo',
    },
  );

  // Job às 9h
  cron.schedule(
    '0 9 * * *',
    () => {
      console.log('[CRON JOB] Executando job das 9h');
      runAllSyncs();
    },
    {
      timezone: 'America/Sao_Paulo',
    },
  );

  // Job às 11h
  cron.schedule(
    '0 11 * * *',
    () => {
      console.log('[CRON JOB] Executando job das 11h');
      runAllSyncs();
    },
    {
      timezone: 'America/Sao_Paulo',
    },
  );

  // Job às 14h30
  cron.schedule(
    '30 14 * * *',
    () => {
      console.log('[CRON JOB] Executando job das 14h30');
      runAllSyncs();
    },
    {
      timezone: 'America/Sao_Paulo',
    },
  );

  // Job às 16h30
  cron.schedule(
    '30 16 * * *',
    () => {
      console.log('[CRON JOB] Executando job das 16h30');
      runAllSyncs();
    },
    {
      timezone: 'America/Sao_Paulo',
    },
  );

  // Job às 20h
  cron.schedule(
    '0 20 * * *',
    () => {
      console.log('[CRON JOB] Executando job das 20h');
      runAllSyncs();
    },
    {
      timezone: 'America/Sao_Paulo',
    },
  );

  console.log('[CRON JOB] Jobs agendados:');
  console.log('  - 06:00 (Brasília)');
  console.log('  - 09:00 (Brasília)');
  console.log('  - 11:00 (Brasília)');
  console.log('  - 14:30 (Brasília)');
  console.log('  - 16:30 (Brasília)');
  console.log('  - 20:00 (Brasília)');
}
