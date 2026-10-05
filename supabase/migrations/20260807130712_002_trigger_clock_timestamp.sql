create or replace function public.touch_project_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE') then
    if old.project_id is not null then
      update public.projects set last_activity_at = clock_timestamp() where id = old.project_id;
    end if;
    return old;
  else
    if new.project_id is not null then
      update public.projects set last_activity_at = clock_timestamp() where id = new.project_id;
    end if;
    return new;
  end if;
end $$;
