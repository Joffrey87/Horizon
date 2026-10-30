-- Le cron ne s'authentifie plus par la seule clé anon (publique).
-- On ajoute l'en-tête x-cron-secret, lu dans le Vault (même secret que bank-sync),
-- sans retirer l'Authorization déjà enregistrée : la passerelle peut encore
-- exiger un JWT le temps du déploiement.
-- Les fonctions n'agissent que si ce secret correspond, ou si l'appelant est
-- l'utilisateur connecté. Un appel avec seulement la clé anon est refusé.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  r record;
  cmd text;
  secret text := '''x-cron-secret'', (select decrypted_secret from vault.decrypted_secrets where name = ''bank_sync_cron_secret''), ''Authorization''';
begin
  select command into cmd from cron.job where jobname = 'celeste-scan';
  if cmd is null then
    raise exception 'cron celeste-scan introuvable';
  end if;
  if position('x-cron-secret' in cmd) = 0 then
    if position('''Authorization''' in cmd) = 0 then
      raise exception 'celeste-scan : en-tête Authorization introuvable, cron laissé intact';
    end if;
    cmd := replace(cmd, '''Authorization''', secret);
    update cron.job set command = cmd where jobname = 'celeste-scan';
  end if;

  for r in
    select jobid, command from cron.job
    where command ilike '%/functions/v1/refresh-masses%'
      and position('x-cron-secret' in command) = 0
  loop
    if position('''Authorization''' in r.command) = 0 then
      raise exception 'refresh-masses : en-tête Authorization introuvable, cron laissé intact';
    end if;
    update cron.job set command = replace(r.command, '''Authorization''', secret) where jobid = r.jobid;
  end loop;
end $$;
