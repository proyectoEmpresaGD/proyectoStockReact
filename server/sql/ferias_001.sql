-- Fase Ferias 001: ejecutar sobre PostgreSQL de Stock+ (nunca sobre CDI Gest).
-- Aditiva, sin borrados ni cambios en tablas existentes.
BEGIN;
CREATE TABLE IF NOT EXISTS ferias_solicitudes (
  id UUID PRIMARY KEY,
  request_key UUID NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('CONTACTO','PEDIDO')),
  feria TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  comercial TEXT NOT NULL,
  cliente_tipo TEXT NOT NULL CHECK (cliente_tipo IN ('NUEVO','EXISTENTE')),
  cliente_codigo TEXT,
  cliente JSONB NOT NULL,
  lineas JSONB NOT NULL DEFAULT '[]'::jsonb,
  observaciones TEXT NOT NULL DEFAULT '',
  entrega_solicitada TEXT NOT NULL DEFAULT '',
  direccion_entrega TEXT NOT NULL DEFAULT '',
  erp_referencia TEXT,
  registrado_erp_at TIMESTAMPTZ,
  enviar_agradecimiento BOOLEAN NOT NULL DEFAULT FALSE,
  idioma_correo TEXT NOT NULL DEFAULT 'es',
  estado TEXT NOT NULL DEFAULT 'PENDIENTE_EMAIL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ferias_solicitudes_estado_idx ON ferias_solicitudes (estado,created_at DESC);
CREATE INDEX IF NOT EXISTS ferias_solicitudes_usuario_idx ON ferias_solicitudes (usuario_id,created_at DESC);
CREATE TABLE IF NOT EXISTS ferias_correos (
  id UUID PRIMARY KEY,
  solicitud_id UUID NOT NULL REFERENCES ferias_solicitudes(id) ON DELETE RESTRICT,
  destino_tipo TEXT NOT NULL CHECK (destino_tipo IN ('INTERNO','CLIENTE')),
  destinatario TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ENVIANDO','ENVIADO','REVISAR')),
  message_id TEXT NOT NULL,
  error_codigo TEXT,
  enviado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(solicitud_id,destino_tipo)
);
COMMIT;
