-- Run in the hosted Supabase SQL editor after Edge Functions are deployed.
-- Replace the three placeholders before execution. Store secrets in Vault only.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://REPLACE_WITH_PROJECT_REF.supabase.co',
  'ieumlog_project_url',
  'Base URL used by scheduled Edge Function invocations'
);
select vault.create_secret(
  'REPLACE_WITH_PROCESS_RETRY_CRON_SECRET',
  'ieumlog_process_retry_cron_secret',
  'Header secret for retry-failed-jobs'
);
select vault.create_secret(
  'REPLACE_WITH_PURGE_CRON_SECRET',
  'ieumlog_purge_cron_secret',
  'Header secret for purge-deleted'
);

select cron.schedule(
  'ieumlog-retry-failed-jobs',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ieumlog_project_url')
      || '/functions/v1/retry-failed-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ieumlog_process_retry_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'ieumlog-purge-deleted',
  '17 3 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'ieumlog_project_url')
      || '/functions/v1/purge-deleted',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ieumlog_purge_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select jobid, jobname, schedule from cron.job
where jobname in ('ieumlog-retry-failed-jobs', 'ieumlog-purge-deleted')
order by jobname;
