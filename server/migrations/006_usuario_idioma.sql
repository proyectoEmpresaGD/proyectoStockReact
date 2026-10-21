-- Spanish remains the default for every existing and new account.
ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS idioma VARCHAR(2) NOT NULL DEFAULT 'es';
UPDATE public.usuarios SET idioma = 'es' WHERE idioma IS NULL OR idioma NOT IN ('es', 'en');
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_idioma_check;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_idioma_check CHECK (idioma IN ('es', 'en'));
