-- ============================================================
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
