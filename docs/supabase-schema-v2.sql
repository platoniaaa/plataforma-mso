-- ============================================
-- ESQUEMA DE BASE DE DATOS - PLATAFORMA MSO v2
-- Ejecutar en Supabase SQL Editor
-- SIN RLS para maqueta demo
-- ============================================

-- 1. CLIENTES
create table if not exists clientes (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  razon_social text,
  rubro text,
  pais text default 'Chile',
  contacto_nombre text,
  contacto_email text,
  estado text default 'Activo' check (estado in ('Activo', 'Inactivo')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. PROGRAMAS
create table if not exists programas (
  id uuid default gen_random_uuid() primary key,
  nombre text not null,
  cliente_id uuid references clientes(id) on delete set null,
  tipo text check (tipo in ('piloto', 'programa_completo', 'intervencion')),
  estado text default 'diseno' check (estado in ('diseno', 'activo', 'finalizado', 'suspendido')),
  objetivo text,
  fecha_inicio date,
  fecha_termino date,
  fecha_medicion_pre date,
  fecha_medicion_post date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. USUARIOS
create table if not exists usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique,
  nombre text not null,
  email text unique not null,
  rol text default 'participante' check (rol in ('admin', 'jefatura', 'participante')),
  cargo text,
  cliente_id uuid references clientes(id) on delete set null,
  estado text default 'Activo' check (estado in ('Activo', 'Inactivo')),
  password_visible text,
  created_at timestamptz default now()
);

-- 4. PARTICIPANTES POR PROGRAMA
create table if not exists participantes_programa (
  id uuid default gen_random_uuid() primary key,
  programa_id uuid not null references programas(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  rol_programa text default 'lider' check (rol_programa in ('lider', 'colaborador')),
  lider_id uuid references usuarios(id) on delete set null,
  created_at timestamptz default now(),
  unique(programa_id, usuario_id)
);

-- 5. COMPETENCIAS
create table if not exists competencias (
  id uuid default gen_random_uuid() primary key,
  programa_id uuid not null references programas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  foco_desarrollo text,
  nivel_1_texto text default 'Conoce el concepto',
  nivel_2_texto text default 'Aplica con guia',
  nivel_3_texto text default 'Aplica consistentemente',
  nivel_4_texto text default 'Es referente',
  interpretacion_nivel_1 text,
  interpretacion_nivel_2 text,
  interpretacion_nivel_3 text,
  interpretacion_nivel_4 text,
  orden int default 1,
  estado text default 'activa'
);

-- 6. ENCUESTAS
create table if not exists encuestas (
  id uuid default gen_random_uuid() primary key,
  programa_id uuid not null references programas(id) on delete cascade,
  nombre text not null,
  tipo text check (tipo in ('pre', 'post')),
  tipo_cuestionario text default 'autoevaluacion' check (tipo_cuestionario in ('autoevaluacion', 'coevaluacion')),
  estado text default 'borrador' check (estado in ('borrador', 'activa', 'cerrada')),
  instrucciones text,
  fecha_cierre date,
  created_at timestamptz default now()
);

-- 7. PREGUNTAS
create table if not exists preguntas (
  id uuid default gen_random_uuid() primary key,
  encuesta_id uuid not null references encuestas(id) on delete cascade,
  texto_pregunta text,
  tipo_respuesta text default 'niveles_competencia',
  competencia_id uuid references competencias(id) on delete set null,
  foco_desarrollo text,
  opcion_nivel_1 text,
  opcion_nivel_2 text,
  opcion_nivel_3 text,
  opcion_nivel_4 text,
  obligatoria boolean default true,
  orden int default 1
);

-- 8. RESPUESTAS
create table if not exists respuestas (
  id uuid default gen_random_uuid() primary key,
  encuesta_id uuid not null references encuestas(id) on delete cascade,
  pregunta_id uuid not null references preguntas(id) on delete cascade,
  evaluador_id uuid not null references usuarios(id),
  evaluado_id uuid references usuarios(id),
  valor text,
  created_at timestamptz default now(),
  unique(encuesta_id, pregunta_id, evaluador_id, evaluado_id)
);

-- 9. ARCHIVOS DE PROGRAMA
create table if not exists archivos_programa (
  id uuid default gen_random_uuid() primary key,
  programa_id uuid not null references programas(id) on delete cascade,
  nombre_archivo text not null,
  tipo text default 'material',
  mensaje text,
  storage_path text,
  drive_url text,
  visible_participantes boolean default true,
  subido_por uuid references usuarios(id),
  created_at timestamptz default now()
);

-- 10. NOTIFICACIONES
create table if not exists notificaciones (
  id uuid default gen_random_uuid() primary key,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  mensaje text not null,
  tipo text,
  leida boolean default false,
  created_at timestamptz default now()
);

-- ============================================
-- INDICES para performance
-- ============================================
create index if not exists idx_programas_cliente on programas(cliente_id);
create index if not exists idx_participantes_programa on participantes_programa(programa_id);
create index if not exists idx_participantes_usuario on participantes_programa(usuario_id);
create index if not exists idx_competencias_programa on competencias(programa_id);
create index if not exists idx_encuestas_programa on encuestas(programa_id);
create index if not exists idx_preguntas_encuesta on preguntas(encuesta_id);
create index if not exists idx_respuestas_encuesta on respuestas(encuesta_id);
create index if not exists idx_respuestas_evaluador on respuestas(evaluador_id);
create index if not exists idx_archivos_programa on archivos_programa(programa_id);
create index if not exists idx_notificaciones_usuario on notificaciones(usuario_id);

-- ============================================
-- TRIGGER para updated_at automatico
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger clientes_updated_at before update on clientes
  for each row execute function update_updated_at();

create trigger programas_updated_at before update on programas
  for each row execute function update_updated_at();

-- ============================================
-- DATOS INICIALES - USUARIOS DEMO
-- ============================================

-- Admin
insert into usuarios (nombre, email, rol, cargo, estado, password_visible)
values ('Admin Demo', 'admin@mso.cl', 'admin', 'Administrador', 'Activo', '123456');

-- Jefatura
insert into usuarios (nombre, email, rol, cargo, estado, password_visible)
values ('Javier Rodriguez', 'jrodriguez@losandes.cl', 'jefatura', 'Superintendente Mina', 'Activo', '123456');

-- Participante
insert into usuarios (nombre, email, rol, cargo, estado, password_visible)
values ('Laura Martinez', 'lmartinez@losandes.cl', 'participante', 'Supervisora Planta', 'Activo', '123456');
