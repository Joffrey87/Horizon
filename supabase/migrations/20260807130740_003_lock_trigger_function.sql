-- Le trigger n'a pas besoin d'être appelable via l'API REST
revoke execute on function public.touch_project_activity() from anon, authenticated, public;
