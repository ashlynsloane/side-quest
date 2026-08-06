-- Side Quest V18.11.3
-- Allow the sport-environment theme IDs stored by athlete profiles.

alter table public.profiles drop constraint if exists profiles_theme_id_check;
alter table public.profiles add constraint profiles_theme_id_check
  check (
    theme_id in (
      'forest',
      'trail',
      'summit',
      'race_day',
      'ocean',
      'ember',
      'indigo',
      'alpine',
      'slate'
    )
  );
