/* ============================================================
   EcoGestión · Esquema de la réplica SQLite (copia embebida)
   Copia de database/esquema.sql y database/esquema_municipal.sql.
   Se usa para crear la réplica local (sql.js) donde se cargan
   los datos que vienen de Supabase. Está embebida porque el
   navegador no deja leer archivos .sql con fetch() desde file://.
   NO lo edites a mano: ejecuta node herramientas/generar_datos_sql.js
   ============================================================ */
(function () {
    'use strict';
    const Eco = window.Eco = window.Eco || {};
    Eco.SQL = {
        ESQUEMA: `-- ============================================================
-- EcoGestión · Sistema de Gestión de Residuos Aprovechables
-- Réplica SQLite: centro de acopio del municipio
-- ============================================================
-- La base central está en Supabase (supabase/esquema_supabase.sql).
-- Cada navegador crea con este esquema una réplica SQLite en
-- memoria (sql.js) y la llena con lo que su cuenta puede leer.
-- La réplica solo trae datos del municipio de la cuenta.
-- Copia embebida en js/datos_sql.js (node herramientas/generar_datos_sql.js).
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- Usuarios (nombre y correo de Google)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario     INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre         TEXT NOT NULL COLLATE NOCASE UNIQUE,
    rol            TEXT NOT NULL DEFAULT 'Operador'
                   CHECK (rol IN ('Administrador', 'Operador')),
    correo         TEXT,
    fecha_registro TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (length(trim(nombre)) BETWEEN 2 AND 80)
);

-- ------------------------------------------------------------
-- Catálogo de materiales del centro de acopio
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materiales (
    id_material       INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_municipio  TEXT NOT NULL,
    nombre            TEXT NOT NULL COLLATE NOCASE,
    categoria         TEXT NOT NULL
                      CHECK (categoria IN ('Plástico', 'Papel y cartón', 'Vidrio', 'Metal', 'Otros')),
    unidad_medida     TEXT NOT NULL
                      CHECK (unidad_medida IN ('kg', 'unidades', 'litros')),
    descripcion       TEXT,
    fecha_registro    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    UNIQUE (codigo_municipio, nombre),
    CHECK (length(trim(nombre)) BETWEEN 2 AND 80)
);

-- ------------------------------------------------------------
-- Recolecciones: material que entra al centro de acopio.
-- id_solicitud indica de qué solicitud ciudadana salió (si aplica).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recolecciones (
    id_recoleccion    INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_municipio  TEXT NOT NULL,
    id_material       INTEGER NOT NULL,
    id_usuario        INTEGER NOT NULL,
    id_solicitud      INTEGER,
    cantidad          REAL NOT NULL CHECK (cantidad > 0),
    unidad_medida     TEXT NOT NULL
                      CHECK (unidad_medida IN ('kg', 'unidades', 'litros')),
    fecha             TEXT NOT NULL,
    observaciones     TEXT,
    fecha_registro    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CONSTRAINT fk_recoleccion_material
        FOREIGN KEY (id_material) REFERENCES materiales (id_material)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_recoleccion_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_recoleccion_solicitud
        FOREIGN KEY (id_solicitud) REFERENCES solicitudes_recoleccion (id_solicitud)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_recoleccion_fecha
        CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
               AND date(fecha) = fecha),
    CONSTRAINT chk_recoleccion_enteros
        CHECK (unidad_medida <> 'unidades' OR cantidad = CAST(cantidad AS INTEGER))
);

-- ------------------------------------------------------------
-- Movimientos de inventario. El inventario SIEMPRE se calcula desde aquí.
-- Entrada: generada por una recolección.
-- Salida: entrega a una empresa (id_pedido) o retiro manual.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos (
    id_movimiento     INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_municipio  TEXT NOT NULL,
    id_material       INTEGER NOT NULL,
    id_recoleccion    INTEGER UNIQUE,
    id_pedido         INTEGER UNIQUE,
    id_usuario        INTEGER NOT NULL,
    tipo              TEXT NOT NULL CHECK (tipo IN ('Entrada', 'Salida')),
    cantidad          REAL NOT NULL CHECK (cantidad > 0),
    unidad_medida     TEXT NOT NULL
                      CHECK (unidad_medida IN ('kg', 'unidades', 'litros')),
    fecha             TEXT NOT NULL,
    observaciones     TEXT,
    fecha_registro    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CONSTRAINT fk_movimiento_material
        FOREIGN KEY (id_material) REFERENCES materiales (id_material)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimiento_recoleccion
        FOREIGN KEY (id_recoleccion) REFERENCES recolecciones (id_recoleccion)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimiento_pedido
        FOREIGN KEY (id_pedido) REFERENCES pedidos_empresa (id_pedido)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimiento_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_movimiento_origen
        CHECK ((tipo = 'Entrada' AND id_recoleccion IS NOT NULL AND id_pedido IS NULL)
            OR (tipo = 'Salida'  AND id_recoleccion IS NULL)),
    CONSTRAINT chk_movimiento_fecha
        CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
               AND date(fecha) = fecha),
    CONSTRAINT chk_movimiento_enteros
        CHECK (unidad_medida <> 'unidades' OR cantidad = CAST(cantidad AS INTEGER))
);

-- ------------------------------------------------------------
-- Índices para consultas y reportes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_materiales_categoria   ON materiales (categoria);
CREATE INDEX IF NOT EXISTS idx_recolecciones_fecha    ON recolecciones (fecha);
CREATE INDEX IF NOT EXISTS idx_recolecciones_material ON recolecciones (id_material);
CREATE INDEX IF NOT EXISTS idx_recolecciones_solicitud ON recolecciones (id_solicitud);
CREATE INDEX IF NOT EXISTS idx_movimientos_material   ON movimientos (id_material);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha      ON movimientos (fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo       ON movimientos (tipo);

-- ------------------------------------------------------------
-- Vista de existencias: calculada desde los movimientos
-- ------------------------------------------------------------
CREATE VIEW IF NOT EXISTS vista_existencias AS
SELECT
    m.id_material,
    m.nombre,
    m.categoria,
    m.unidad_medida,
    m.descripcion,
    m.fecha_registro,
    ROUND(COALESCE(SUM(CASE
        WHEN mv.tipo = 'Entrada' THEN mv.cantidad
        WHEN mv.tipo = 'Salida'  THEN -mv.cantidad
        ELSE 0
    END), 0), 2) AS existencia,
    COALESCE((
        SELECT SUM(r.cantidad) FROM recolecciones r
        WHERE r.id_material = m.id_material
    ), 0) AS total_recolectado,
    COALESCE((
        SELECT SUM(mv2.cantidad) FROM movimientos mv2
        WHERE mv2.id_material = m.id_material AND mv2.tipo = 'Salida'
    ), 0) AS total_salidas,
    MAX(CASE WHEN mv.tipo = 'Entrada' THEN mv.fecha END) AS ultima_entrada
FROM materiales m
LEFT JOIN movimientos mv ON mv.id_material = m.id_material
GROUP BY m.id_material;

PRAGMA user_version = 5;
`,

        ESQUEMA_MUNICIPAL: `-- ============================================================
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
`
    };
})();
