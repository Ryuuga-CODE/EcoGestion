-- ============================================================
-- EcoGestión · Sistema de Gestión de Residuos Aprovechables
-- Esquema relacional para SQLite
-- ============================================================
-- Este script se ejecuta al crear una base nueva. La aplicación
-- incluye una copia embebida del mismo en js/datos_sql.js para
-- poder funcionar al abrir index.html directamente (file://).
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- Usuarios responsables de las recolecciones
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
-- Catálogo de materiales aprovechables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materiales (
    id_material     INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT NOT NULL COLLATE NOCASE UNIQUE,
    categoria       TEXT NOT NULL
                    CHECK (categoria IN ('Plástico', 'Papel y cartón', 'Vidrio', 'Metal', 'Otros')),
    unidad_medida   TEXT NOT NULL
                    CHECK (unidad_medida IN ('kg', 'unidades', 'litros')),
    descripcion     TEXT,
    fecha_registro  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CHECK (length(trim(nombre)) BETWEEN 2 AND 80)
);

-- ------------------------------------------------------------
-- Recolecciones realizadas
-- La unidad se copia del material y un trigger verifica que
-- coincida con la unidad configurada en el catálogo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recolecciones (
    id_recoleccion  INTEGER PRIMARY KEY AUTOINCREMENT,
    id_material     INTEGER NOT NULL,
    id_usuario      INTEGER NOT NULL,
    cantidad        REAL NOT NULL CHECK (cantidad > 0),
    unidad_medida   TEXT NOT NULL
                    CHECK (unidad_medida IN ('kg', 'unidades', 'litros')),
    fecha           TEXT NOT NULL,
    observaciones   TEXT,
    fecha_registro  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CONSTRAINT fk_recoleccion_material
        FOREIGN KEY (id_material) REFERENCES materiales (id_material)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_recoleccion_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_recoleccion_fecha
        CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
               AND date(fecha) = fecha),
    CONSTRAINT chk_recoleccion_enteros
        CHECK (unidad_medida <> 'unidades' OR cantidad = CAST(cantidad AS INTEGER))
);

-- ------------------------------------------------------------
-- Movimientos de inventario.
-- Entrada: generada automáticamente por una recolección.
-- Salida: retiro/entrega de material (descuenta existencias).
-- El inventario SIEMPRE se calcula desde esta tabla.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos (
    id_movimiento   INTEGER PRIMARY KEY AUTOINCREMENT,
    id_material     INTEGER NOT NULL,
    id_recoleccion  INTEGER UNIQUE,
    id_usuario      INTEGER NOT NULL,
    tipo            TEXT NOT NULL CHECK (tipo IN ('Entrada', 'Salida')),
    cantidad        REAL NOT NULL CHECK (cantidad > 0),
    unidad_medida   TEXT NOT NULL
                    CHECK (unidad_medida IN ('kg', 'unidades', 'litros')),
    fecha           TEXT NOT NULL,
    observaciones   TEXT,
    fecha_registro  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CONSTRAINT fk_movimiento_material
        FOREIGN KEY (id_material) REFERENCES materiales (id_material)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimiento_recoleccion
        FOREIGN KEY (id_recoleccion) REFERENCES recolecciones (id_recoleccion)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimiento_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_movimiento_origen
        CHECK ((tipo = 'Entrada' AND id_recoleccion IS NOT NULL)
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
CREATE INDEX IF NOT EXISTS idx_materiales_categoria
    ON materiales (categoria);

CREATE INDEX IF NOT EXISTS idx_recolecciones_fecha
    ON recolecciones (fecha);

CREATE INDEX IF NOT EXISTS idx_recolecciones_material
    ON recolecciones (id_material);

CREATE INDEX IF NOT EXISTS idx_movimientos_material
    ON movimientos (id_material);

CREATE INDEX IF NOT EXISTS idx_movimientos_fecha
    ON movimientos (fecha);

CREATE INDEX IF NOT EXISTS idx_movimientos_tipo
    ON movimientos (tipo);

-- ------------------------------------------------------------
-- Validaciones de integridad adicionales
-- ------------------------------------------------------------

-- La unidad de la recolección debe coincidir con la del material.
CREATE TRIGGER IF NOT EXISTS trg_recoleccion_unidad
BEFORE INSERT ON recolecciones
FOR EACH ROW
WHEN NEW.unidad_medida <> (
    SELECT unidad_medida FROM materiales WHERE id_material = NEW.id_material
)
BEGIN
    SELECT RAISE(ABORT, 'La unidad de medida no coincide con la del material.');
END;

CREATE TRIGGER IF NOT EXISTS trg_recoleccion_unidad_update
BEFORE UPDATE OF id_material, unidad_medida ON recolecciones
FOR EACH ROW
WHEN NEW.unidad_medida <> (
    SELECT unidad_medida FROM materiales WHERE id_material = NEW.id_material
)
BEGIN
    SELECT RAISE(ABORT, 'La unidad de medida no coincide con la del material.');
END;

-- La unidad de cualquier movimiento debe coincidir con la del material.
CREATE TRIGGER IF NOT EXISTS trg_movimiento_unidad
BEFORE INSERT ON movimientos
FOR EACH ROW
WHEN NEW.unidad_medida <> (
    SELECT unidad_medida FROM materiales WHERE id_material = NEW.id_material
)
BEGIN
    SELECT RAISE(ABORT, 'La unidad de medida no coincide con la del material.');
END;

-- Una entrada debe corresponder exactamente a una recolección registrada.
CREATE TRIGGER IF NOT EXISTS trg_movimiento_entrada
BEFORE INSERT ON movimientos
FOR EACH ROW
WHEN NEW.tipo = 'Entrada' AND NOT EXISTS (
    SELECT 1
    FROM recolecciones r
    WHERE r.id_recoleccion = NEW.id_recoleccion
      AND r.id_material = NEW.id_material
      AND r.id_usuario = NEW.id_usuario
      AND r.cantidad = NEW.cantidad
      AND r.unidad_medida = NEW.unidad_medida
      AND r.fecha = NEW.fecha
)
BEGIN
    SELECT RAISE(ABORT, 'La entrada no coincide con una recolección registrada.');
END;

-- No se puede retirar más material del disponible.
CREATE TRIGGER IF NOT EXISTS trg_movimiento_stock
BEFORE INSERT ON movimientos
FOR EACH ROW
WHEN NEW.tipo = 'Salida' AND NEW.cantidad > COALESCE((
    SELECT SUM(CASE WHEN tipo = 'Entrada' THEN cantidad ELSE -cantidad END)
    FROM movimientos
    WHERE id_material = NEW.id_material
), 0) + 0.000001
BEGIN
    SELECT RAISE(ABORT, 'Stock insuficiente para registrar la salida.');
END;

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

PRAGMA user_version = 2;
