-- ============================================================
-- EcoGestión · Réplica SQLite: cuentas, solicitudes y pedidos
-- Versión del esquema: 5 (gestión municipal)
-- ============================================================
-- Complementa a esquema.sql. Las reglas de negocio (permisos,
-- estados, stock) se validan en Supabase; aquí solo se guardan
-- copias de datos ya validados para consultarlos con SQL.
-- Copia embebida en js/datos_sql.js.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- Roles (tipos de cuenta) y permisos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id_rol       INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT NOT NULL UNIQUE
                 CHECK (codigo IN ('administrador', 'ciudadano', 'repartidor', 'empresa')),
    nombre       TEXT NOT NULL UNIQUE,
    descripcion  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permisos (
    id_permiso   INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT NOT NULL UNIQUE,
    descripcion  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles_permisos (
    id_rol       INTEGER NOT NULL,
    id_permiso   INTEGER NOT NULL,
    PRIMARY KEY (id_rol, id_permiso),
    CONSTRAINT fk_rp_rol FOREIGN KEY (id_rol) REFERENCES roles (id_rol)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_rp_permiso FOREIGN KEY (id_permiso) REFERENCES permisos (id_permiso)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Perfiles: amplía usuarios (1 a 1) con el tipo de cuenta y el
-- municipio (código DANE de 5 dígitos; el nombre está en js/lugares.js).
-- pendiente = 1: repartidor que espera aprobación del administrador.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfiles (
    id_usuario        INTEGER PRIMARY KEY,
    id_rol            INTEGER NOT NULL,
    codigo_municipio  TEXT NOT NULL CHECK (length(codigo_municipio) = 5),
    google_sub        TEXT UNIQUE,
    foto_url          TEXT,
    telefono          TEXT CHECK (telefono IS NULL OR length(telefono) <= 30),
    direccion         TEXT CHECK (direccion IS NULL OR length(direccion) <= 150),
    activo            INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    pendiente         INTEGER NOT NULL DEFAULT 0 CHECK (pendiente IN (0, 1)),
    metodo_registro   TEXT NOT NULL DEFAULT 'google' CHECK (metodo_registro = 'google'),
    fecha_creacion    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    ultimo_acceso     TEXT,
    CONSTRAINT fk_perfil_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_perfil_rol FOREIGN KEY (id_rol) REFERENCES roles (id_rol)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_correo
    ON usuarios (lower(correo)) WHERE correo IS NOT NULL;

-- ------------------------------------------------------------
-- Solicitudes de recolección de los ciudadanos
-- Pendiente → Asignada → Recolectada   (o Cancelada / Rechazada)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitudes_recoleccion (
    id_solicitud        INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_municipio    TEXT NOT NULL,
    id_ciudadano        INTEGER NOT NULL,
    direccion           TEXT NOT NULL,
    tipos_residuo       TEXT NOT NULL,
    descripcion         TEXT,
    cantidad_estimada   REAL,
    fecha_preferida     TEXT NOT NULL,
    franja              TEXT NOT NULL DEFAULT 'Cualquier hora'
                        CHECK (franja IN ('Mañana', 'Tarde', 'Cualquier hora')),
    estado              TEXT NOT NULL DEFAULT 'Pendiente'
                        CHECK (estado IN ('Pendiente', 'Asignada', 'Recolectada', 'Cancelada', 'Rechazada')),
    id_repartidor       INTEGER,
    nota                TEXT,
    kilos_recolectados  REAL,
    fecha_solicitud     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_asignacion    TEXT,
    fecha_cierre        TEXT,
    CONSTRAINT fk_solicitud_ciudadano FOREIGN KEY (id_ciudadano) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_solicitud_repartidor FOREIGN KEY (id_repartidor) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_solicitud_asignada
        CHECK (estado NOT IN ('Asignada', 'Recolectada') OR id_repartidor IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado     ON solicitudes_recoleccion (estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_ciudadano  ON solicitudes_recoleccion (id_ciudadano);
CREATE INDEX IF NOT EXISTS idx_solicitudes_repartidor ON solicitudes_recoleccion (id_repartidor);

-- ------------------------------------------------------------
-- Empresas recicladoras y sus pedidos de material al municipio
-- Pendiente → Aprobado → Entregado   (o Rechazado / Cancelado)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
    id_empresa       INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario       INTEGER NOT NULL UNIQUE,
    razon_social     TEXT NOT NULL CHECK (length(trim(razon_social)) BETWEEN 2 AND 120),
    nit              TEXT,
    telefono         TEXT,
    correo_contacto  TEXT,
    direccion        TEXT,
    descripcion      TEXT,
    fecha_registro   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CONSTRAINT fk_empresa_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS pedidos_empresa (
    id_pedido         INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_municipio  TEXT NOT NULL,
    id_empresa        INTEGER NOT NULL,
    id_material       INTEGER NOT NULL,
    cantidad          REAL NOT NULL CHECK (cantidad > 0),
    precio_unitario   REAL NOT NULL CHECK (precio_unitario > 0),
    mensaje           TEXT,
    estado            TEXT NOT NULL DEFAULT 'Pendiente'
                      CHECK (estado IN ('Pendiente', 'Aprobado', 'Entregado', 'Rechazado', 'Cancelado')),
    respuesta         TEXT,
    fecha_pedido      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_respuesta   TEXT,
    fecha_entrega     TEXT,
    CONSTRAINT fk_pedido_empresa FOREIGN KEY (id_empresa) REFERENCES empresas (id_empresa)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_pedido_material FOREIGN KEY (id_material) REFERENCES materiales (id_material)
        ON UPDATE CASCADE ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado  ON pedidos_empresa (estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa ON pedidos_empresa (id_empresa);

-- ------------------------------------------------------------
-- Existencias del municipio (copia de la vista del servidor).
-- Las empresas no ven los movimientos, solo cuánto hay disponible.
-- comprometido = aprobado a empresas y aún no entregado.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS existencias_municipio (
    id_material       INTEGER PRIMARY KEY,
    codigo_municipio  TEXT NOT NULL,
    nombre            TEXT NOT NULL,
    categoria         TEXT NOT NULL,
    unidad_medida     TEXT NOT NULL,
    existencia        REAL NOT NULL DEFAULT 0,
    comprometido      REAL NOT NULL DEFAULT 0
);

PRAGMA user_version = 5;
