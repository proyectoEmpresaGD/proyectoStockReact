-- Run after migration 006; theme is stored per user in PostgreSQL.
ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS tema VARCHAR(5) NOT NULL DEFAULT 'light';
UPDATE public.usuarios SET tema = 'light' WHERE tema IS NULL OR tema NOT IN ('light', 'dark');
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_tema_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_tema_check CHECK (tema IN ('light', 'dark'));
