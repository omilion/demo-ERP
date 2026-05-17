-- RRHH schema creation
CREATE SCHEMA IF NOT EXISTS rrhh;

CREATE TABLE IF NOT EXISTS rrhh.trabajadores (
  id SERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  apellido_paterno TEXT NOT NULL,
  apellido_materno TEXT NOT NULL,
  nombres TEXT NOT NULL,
  rut TEXT NOT NULL,
  fecha_nacimiento TEXT,
  estado_civil TEXT,
  cargas_familiares TEXT,
  direccion TEXT,
  comuna TEXT,
  nacionalidad TEXT,
  afp TEXT,
  salud TEXT,
  telefono TEXT,
  contacto_emergencia TEXT,
  numero_emergencia TEXT,
  email TEXT,
  banco TEXT,
  tipo_cuenta TEXT,
  numero_cuenta TEXT,
  cargo TEXT,
  fecha_ingreso TEXT,
  fecha_termino DATE,
  tipo_contrato TEXT,
  sueldo_liquido TEXT,
  observacion TEXT,
  "user" TEXT,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  foto TEXT,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS trabajadores_empresa_idx ON rrhh.trabajadores(empresa);
CREATE INDEX IF NOT EXISTS trabajadores_rut_idx ON rrhh.trabajadores(rut);

CREATE TABLE IF NOT EXISTS rrhh.contratos (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  contrato TEXT NOT NULL,
  plazo TEXT,
  inicio DATE,
  termino DATE,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  imagen TEXT,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS contratos_trabajador_idx ON rrhh.contratos(trabajador_id);

CREATE TABLE IF NOT EXISTS rrhh.liquidaciones (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  anio TEXT,
  mes TEXT,
  sueldo_base INT,
  total_imponible INT,
  total_haberes INT,
  total_descuentos INT,
  liquido_pagar INT,
  horas_extras DOUBLE PRECISION,
  total_extras INT,
  imagen TEXT,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS liquidaciones_trabajador_idx ON rrhh.liquidaciones(trabajador_id);
CREATE INDEX IF NOT EXISTS liquidaciones_periodo_idx ON rrhh.liquidaciones(anio, mes);

CREATE TABLE IF NOT EXISTS rrhh.anticipos (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  anio TEXT,
  mes TEXT,
  banco TEXT,
  tipo_cuenta TEXT,
  cuenta TEXT,
  fecha DATE,
  monto INT,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS anticipos_trabajador_idx ON rrhh.anticipos(trabajador_id);

CREATE TABLE IF NOT EXISTS rrhh.jornadas (
  id SERIAL PRIMARY KEY,
  jornada TEXT NOT NULL,
  ingreso TIME NOT NULL,
  salida TIME NOT NULL,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS rrhh.dias (
  id SERIAL PRIMARY KEY,
  dia TEXT NOT NULL,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS rrhh.tipodias (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS rrhh.asistencias (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  anio TEXT NOT NULL,
  mes TEXT NOT NULL,
  dia TEXT NOT NULL,
  tipo_dia_id INT REFERENCES rrhh.tipodias(id),
  jornada_id INT NOT NULL REFERENCES rrhh.jornadas(id),
  hora_ingreso_am TIME NOT NULL,
  hora_salida_am TIME NOT NULL,
  hora_ingreso_pm TIME NOT NULL,
  hora_salida_pm TIME NOT NULL,
  total_horas DOUBLE PRECISION,
  horas_extras DOUBLE PRECISION,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS asistencias_trabajador_idx ON rrhh.asistencias(trabajador_id);
CREATE INDEX IF NOT EXISTS asistencias_periodo_idx ON rrhh.asistencias(anio, mes);

CREATE TABLE IF NOT EXISTS rrhh.horas_extras (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  contrato TEXT,
  plazo TEXT,
  inicio DATE,
  termino DATE,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  imagen TEXT,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS horas_extras_trabajador_idx ON rrhh.horas_extras(trabajador_id);

CREATE TABLE IF NOT EXISTS rrhh.licencias (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  fecha DATE,
  inicio DATE,
  termino DATE,
  dias INT,
  tipo TEXT,
  reposo TEXT,
  imagen TEXT,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS licencias_trabajador_idx ON rrhh.licencias(trabajador_id);

CREATE TABLE IF NOT EXISTS rrhh.vacaciones (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  inicio_contrato DATE,
  dias_pendientes TEXT,
  periodo TEXT,
  dias INT,
  saldo INT,
  fecha_inicio DATE NOT NULL,
  fecha_termino DATE NOT NULL,
  imagen TEXT,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS vacaciones_trabajador_idx ON rrhh.vacaciones(trabajador_id);

CREATE TABLE IF NOT EXISTS rrhh.epps (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  epp TEXT NOT NULL,
  marca TEXT,
  cantidad INT NOT NULL,
  fecha_entrega DATE NOT NULL,
  documento TEXT,
  observacion TEXT,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS epps_trabajador_idx ON rrhh.epps(trabajador_id);

CREATE TABLE IF NOT EXISTS rrhh.hojas_vida (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  fecha DATE,
  documento TEXT,
  imagen TEXT,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS hojas_vida_trabajador_idx ON rrhh.hojas_vida(trabajador_id);

CREATE TABLE IF NOT EXISTS rrhh.registros (
  id SERIAL PRIMARY KEY,
  empresa TEXT NOT NULL,
  anio TEXT,
  mes TEXT,
  imagen TEXT,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS registros_empresa_idx ON rrhh.registros(empresa);
CREATE INDEX IF NOT EXISTS registros_periodo_idx ON rrhh.registros(anio, mes);

CREATE TABLE IF NOT EXISTS rrhh.reglamentos (
  id SERIAL PRIMARY KEY,
  trabajador_id INT NOT NULL REFERENCES rrhh.trabajadores(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  documento TEXT,
  link TEXT,
  fecha_entrega TEXT,
  estado BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS reglamentos_trabajador_idx ON rrhh.reglamentos(trabajador_id);

CREATE TABLE IF NOT EXISTS rrhh.libros_remuneracion (
  id SERIAL PRIMARY KEY,
  documento TEXT NOT NULL,
  empresa TEXT,
  anio TEXT,
  mes TEXT,
  total_imponible INT,
  total_no_imponible INT,
  total_descuentos INT,
  anticipos INT,
  liquido_pagar INT,
  total_horas_extras INT,
  cantidad_trabajadores INT,
  imagen TEXT,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS libros_empresa_idx ON rrhh.libros_remuneracion(empresa);
CREATE INDEX IF NOT EXISTS libros_periodo_idx ON rrhh.libros_remuneracion(anio, mes);
