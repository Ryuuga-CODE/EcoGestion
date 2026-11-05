/* ============================================================
   EcoGestión · Copia embebida de los scripts SQL
   Generada a partir de database/esquema.sql,
   database/datos_iniciales.sql, database/esquema_mercado.sql y
   database/datos_mercado.sql.

   ¿Por qué está duplicado? Al abrir index.html con file:// el
   navegador no permite leer archivos .sql con fetch(). Esta copia
   permite inicializar SQLite sin servidor. Los archivos .sql son
   la fuente documental y se conservan en la carpeta database/.
   ============================================================ */
(function () {
    'use strict';
    const Eco = window.Eco = window.Eco || {};
    Eco.SQL = {
        // Trigger de stock por separado: se usa para actualizar bases antiguas.
        TRIGGER_STOCK: `CREATE TRIGGER IF NOT EXISTS trg_movimiento_stock
BEFORE INSERT ON movimientos
FOR EACH ROW
WHEN NEW.tipo = 'Salida' AND NEW.cantidad > COALESCE((
    SELECT SUM(CASE WHEN tipo = 'Entrada' THEN cantidad ELSE -cantidad END)
    FROM movimientos
    WHERE id_material = NEW.id_material
), 0) + 0.000001
BEGIN
    SELECT RAISE(ABORT, 'Stock insuficiente para registrar la salida.');
END;`,
        ESQUEMA: `-- ============================================================
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
`,
        DATOS_INICIALES: `-- ============================================================
-- EcoGestión · Datos de demostración
-- Ejecutar después de esquema.sql.
-- Las fechas son relativas al día de creación de la base,
-- para que el panel y los reportes muestren actividad reciente.
-- ============================================================

BEGIN TRANSACTION;

-- ------------------------------------------------------------
-- Usuarios responsables
-- ------------------------------------------------------------
INSERT INTO usuarios (id_usuario, nombre, rol, correo) VALUES
    (1, 'Laura Gómez',    'Administrador', 'laura.gomez@ecogestion.local'),
    (2, 'Carlos Ramírez', 'Operador',      'carlos.ramirez@ecogestion.local'),
    (3, 'Andrea Torres',  'Operador',      'andrea.torres@ecogestion.local');

-- ------------------------------------------------------------
-- Catálogo de materiales
-- ------------------------------------------------------------
INSERT INTO materiales (id_material, nombre, categoria, unidad_medida, descripcion) VALUES
    (1,  'Botellas PET',            'Plástico',        'kg',       'Botellas transparentes de tereftalato de polietileno, limpias y compactadas.'),
    (2,  'Envases plásticos duros', 'Plástico',        'kg',       'Envases rígidos de polietileno o polipropileno provenientes de aseo y cocina.'),
    (3,  'Cartón corrugado',        'Papel y cartón',  'kg',       'Cajas y empaques de cartón corrugado secos y sin residuos orgánicos.'),
    (4,  'Papel de archivo',        'Papel y cartón',  'kg',       'Papel blanco de oficina, impresiones y documentos sin grapas.'),
    (5,  'Botellas de vidrio',      'Vidrio',          'unidades', 'Botellas y frascos de vidrio enteros, separados por color cuando sea posible.'),
    (6,  'Vidrio triturado',        'Vidrio',          'kg',       'Vidrio limpio triturado listo para entrega al gestor externo.'),
    (7,  'Latas de aluminio',       'Metal',           'kg',       'Latas de bebidas escurridas y compactadas.'),
    (8,  'Chatarra de hierro',      'Metal',           'kg',       'Piezas y recortes de hierro libre de otros materiales.'),
    (9,  'Tapas plásticas',         'Plástico',        'kg',       'Tapas y tapones plásticos clasificados para campañas de reciclaje.'),
    (10, 'Textiles y telas',        'Otros',           'kg',       'Prendas y retales de tela limpios y secos.');

-- ------------------------------------------------------------
-- Recolecciones de demostración
-- ------------------------------------------------------------
INSERT INTO recolecciones
    (id_recoleccion, id_material, id_usuario, cantidad, unidad_medida, fecha, observaciones)
VALUES
    (1,  1,  2, 125.50, 'kg',       date('now', '-1 day'),  'Jornada de recolección en el barrio Centro.'),
    (2,  3,  3, 210.00, 'kg',       date('now', '-3 days'), 'Cartón entregado por locales comerciales aliados.'),
    (3,  5,  2, 240,    'unidades', date('now', '-4 days'), 'Botellas de vidrio recibidas en el punto ecológico.'),
    (4,  7,  3, 74.20,  'kg',       date('now', '-4 days'), 'Latas compactadas por el equipo de operación.'),
    (5,  4,  2, 60.00,  'kg',       date('now', '-6 days'), 'Papel de archivo de la sede administrativa.'),
    (6,  1,  3, 96.00,  'kg',       date('now', '-7 days'), 'Segunda jornada de recolección de PET.'),
    (7,  6,  2, 95.00,  'kg',       date('now', '-8 days'), 'Vidrio triturado proveniente del punto de acopio.'),
    (8,  8,  3, 130.50, 'kg',       date('now', '-9 days'), 'Chatarra recibida del mantenimiento de equipos.'),
    (9,  9,  2, 32.40,  'kg',       date('now', '-10 days'), 'Campaña de tapas plásticas con instituciones educativas.'),
    (10, 10, 3, 48.50,  'kg',       date('now', '-11 days'), 'Donación de textiles para aprovechamiento.'),
    (11, 3,  2, 180.75, 'kg',       date('now', '-13 days'), 'Caja de cartón de la bodega central.'),
    (12, 5,  3, 180,    'unidades', date('now', '-14 days'), 'Frascos y botellas de vidrio clasificados.'),
    (13, 7,  2, 58.60,  'kg',       date('now', '-17 days'), 'Recolección en la zona industrial.'),
    (14, 1,  3, 142.30, 'kg',       date('now', '-19 days'), 'PET recolectado en la jornada ambiental.'),
    (15, 6,  2, 65.40,  'kg',       date('now', '-21 days'), 'Vidrio triturado de la campaña de reciclaje.'),
    (16, 4,  3, 32.50,  'kg',       date('now', '-23 days'), 'Papel de archivo de la jornada de limpieza.'),
    (17, 7,  2, 81.90,  'kg',       date('now', '-26 days'), 'Latas de aluminio entregadas por el restaurante aliado.'),
    (18, 2,  3, 88.60,  'kg',       date('now', '-28 days'), 'Envases plásticos duros de la planta de producción.');

-- ------------------------------------------------------------
-- Movimientos de entrada: uno por cada recolección.
-- Los triggers validan que coincidan exactamente.
-- ------------------------------------------------------------
INSERT INTO movimientos
    (id_material, id_recoleccion, id_usuario, tipo, cantidad, unidad_medida, fecha, observaciones)
SELECT
    id_material,
    id_recoleccion,
    id_usuario,
    'Entrada',
    cantidad,
    unidad_medida,
    fecha,
    observaciones
FROM recolecciones
ORDER BY id_recoleccion;

-- ------------------------------------------------------------
-- Salidas de demostración: entregas al gestor externo.
-- Se insertan después de las entradas para que el stock alcance.
-- ------------------------------------------------------------
INSERT INTO movimientos
    (id_material, id_recoleccion, id_usuario, tipo, cantidad, unidad_medida, fecha, observaciones)
VALUES
    (1,  NULL, 1, 'Salida', 120.00, 'kg',       date('now', '-2 days'),  'Entrega al centro de acopio aliado.'),
    (3,  NULL, 1, 'Salida', 150.00, 'kg',       date('now', '-3 days'),  'Despacho de cartón para reciclaje industrial.'),
    (5,  NULL, 1, 'Salida', 100,    'unidades', date('now', '-5 days'),  'Entrega de botellas de vidrio al gestor externo.'),
    (7,  NULL, 1, 'Salida', 60.00,  'kg',       date('now', '-6 days'),  'Retiro de latas por el comprador aliado.'),
    (4,  NULL, 1, 'Salida', 25.00,  'kg',       date('now', '-8 days'),  'Envío de papel de archivo a pulpa.'),
    (6,  NULL, 1, 'Salida', 45.00,  'kg',       date('now', '-10 days'), 'Despacho de vidrio triturado.'),
    (10, NULL, 1, 'Salida', 20.00,  'kg',       date('now', '-12 days'), 'Entrega de textiles a taller de reutilización.');

COMMIT;
`,

        // Ampliación (versión 3): copia de database/esquema_mercado.sql
        ESQUEMA_MERCADO: `-- ============================================================
-- EcoGestión · Ampliación: cuentas, roles y mercado de residuos
-- Versión del esquema: 3
-- ============================================================
-- Este script AMPLÍA la base creada por esquema.sql. No elimina ni
-- modifica las tablas existentes (usuarios, materiales,
-- recolecciones, movimientos); solo agrega tablas nuevas que se
-- relacionan con ellas.
--
-- La aplicación incluye una copia embebida en js/datos_sql.js.
-- Al abrir una base de la versión 2, se aplica automáticamente.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- Roles (tipos de cuenta) y permisos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id_rol       INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo       TEXT NOT NULL UNIQUE
                 CHECK (codigo IN ('administrador', 'vendedor', 'comprador', 'empresa')),
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
    CONSTRAINT fk_rp_rol
        FOREIGN KEY (id_rol) REFERENCES roles (id_rol)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_rp_permiso
        FOREIGN KEY (id_permiso) REFERENCES permisos (id_permiso)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Perfiles: amplía la tabla usuarios (relación 1 a 1).
-- El nombre y el correo siguen en usuarios; aquí solo va lo nuevo.
-- usuarios.rol conserva su significado original (rol en la
-- operación del centro de acopio); perfiles.id_rol es el tipo de
-- cuenta en la plataforma.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfiles (
    id_usuario       INTEGER PRIMARY KEY,
    id_rol           INTEGER NOT NULL,
    google_sub       TEXT UNIQUE,
    foto_url         TEXT,
    telefono         TEXT CHECK (telefono IS NULL OR length(telefono) <= 30),
    ubicacion        TEXT CHECK (ubicacion IS NULL OR length(ubicacion) <= 120),
    activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
    metodo_registro  TEXT NOT NULL CHECK (metodo_registro IN ('google', 'demo')),
    fecha_creacion   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    ultimo_acceso    TEXT,
    CONSTRAINT fk_perfil_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_perfil_rol
        FOREIGN KEY (id_rol) REFERENCES roles (id_rol)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_perfil_google
        CHECK (metodo_registro <> 'google' OR google_sub IS NOT NULL)
);

-- Un correo identifica a una sola cuenta (ignora mayúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_correo
    ON usuarios (lower(correo)) WHERE correo IS NOT NULL;

-- ------------------------------------------------------------
-- Empresas recicladoras (perfil empresarial)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
    id_empresa       INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario       INTEGER NOT NULL UNIQUE,
    razon_social     TEXT NOT NULL CHECK (length(trim(razon_social)) BETWEEN 2 AND 120),
    nit              TEXT CHECK (nit IS NULL OR length(nit) <= 20),
    telefono         TEXT CHECK (telefono IS NULL OR length(telefono) <= 30),
    correo_contacto  TEXT CHECK (correo_contacto IS NULL OR correo_contacto LIKE '%_@_%'),
    direccion        TEXT CHECK (direccion IS NULL OR length(direccion) <= 150),
    ciudad           TEXT CHECK (ciudad IS NULL OR length(ciudad) <= 80),
    descripcion      TEXT CHECK (descripcion IS NULL OR length(descripcion) <= 400),
    fecha_registro   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CONSTRAINT fk_empresa_usuario
        FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Materiales que una empresa necesita comprar
CREATE TABLE IF NOT EXISTS necesidades_empresa (
    id_necesidad      INTEGER PRIMARY KEY AUTOINCREMENT,
    id_empresa        INTEGER NOT NULL,
    tipo_residuo      TEXT NOT NULL
                      CHECK (tipo_residuo IN ('Plástico', 'Cartón', 'Papel', 'Vidrio', 'Metal', 'Otros')),
    descripcion       TEXT CHECK (descripcion IS NULL OR length(descripcion) <= 300),
    cantidad_minima   REAL NOT NULL CHECK (cantidad_minima > 0),
    cantidad_maxima   REAL NOT NULL,
    unidad            TEXT NOT NULL CHECK (unidad IN ('kg', 'unidades')),
    precio_ofrecido   REAL NOT NULL CHECK (precio_ofrecido > 0),
    estado            TEXT NOT NULL DEFAULT 'Activa' CHECK (estado IN ('Activa', 'Cerrada')),
    fecha_publicacion TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    CONSTRAINT fk_necesidad_empresa
        FOREIGN KEY (id_empresa) REFERENCES empresas (id_empresa)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_necesidad_rango
        CHECK (cantidad_maxima >= cantidad_minima)
);

-- ------------------------------------------------------------
-- Publicaciones de los vendedores en el mercado
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publicaciones (
    id_publicacion       INTEGER PRIMARY KEY AUTOINCREMENT,
    id_vendedor          INTEGER NOT NULL,
    tipo_residuo         TEXT NOT NULL
                         CHECK (tipo_residuo IN ('Plástico', 'Cartón', 'Papel', 'Vidrio', 'Metal', 'Otros')),
    nombre_material      TEXT NOT NULL CHECK (length(trim(nombre_material)) BETWEEN 2 AND 80),
    descripcion          TEXT CHECK (descripcion IS NULL OR length(descripcion) <= 400),
    cantidad_disponible  REAL NOT NULL CHECK (cantidad_disponible >= 0),
    unidad               TEXT NOT NULL CHECK (unidad IN ('kg', 'unidades')),
    precio_unitario      REAL NOT NULL CHECK (precio_unitario > 0),
    ubicacion            TEXT NOT NULL CHECK (length(trim(ubicacion)) BETWEEN 2 AND 120),
    estado               TEXT NOT NULL DEFAULT 'Activa'
                         CHECK (estado IN ('Activa', 'Agotada', 'Retirada')),
    fecha_publicacion    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_actualizacion  TEXT,
    CONSTRAINT fk_publicacion_vendedor
        FOREIGN KEY (id_vendedor) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_publicacion_enteros
        CHECK (unidad <> 'unidades' OR cantidad_disponible = CAST(cantidad_disponible AS INTEGER))
);

-- Fotografías de cada publicación (hasta 3, guardadas dentro de la base)
CREATE TABLE IF NOT EXISTS fotos_publicacion (
    id_foto         INTEGER PRIMARY KEY AUTOINCREMENT,
    id_publicacion  INTEGER NOT NULL,
    imagen          TEXT NOT NULL CHECK (imagen LIKE 'data:image/%'),
    orden           INTEGER NOT NULL CHECK (orden BETWEEN 1 AND 3),
    UNIQUE (id_publicacion, orden),
    CONSTRAINT fk_foto_publicacion
        FOREIGN KEY (id_publicacion) REFERENCES publicaciones (id_publicacion)
        ON UPDATE CASCADE ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Ofertas de compra (negociaciones).
-- El vendedor no se repite aquí: se obtiene de la publicación.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ofertas (
    id_oferta        INTEGER PRIMARY KEY AUTOINCREMENT,
    id_publicacion   INTEGER NOT NULL,
    id_comprador     INTEGER NOT NULL,
    cantidad         REAL NOT NULL CHECK (cantidad > 0),
    precio_unitario  REAL NOT NULL CHECK (precio_unitario > 0),
    mensaje          TEXT CHECK (mensaje IS NULL OR length(mensaje) <= 300),
    estado           TEXT NOT NULL DEFAULT 'Pendiente'
                     CHECK (estado IN ('Pendiente', 'Aceptada', 'Rechazada', 'Cancelada', 'Completada')),
    fecha_oferta     TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_respuesta  TEXT,
    CONSTRAINT fk_oferta_publicacion
        FOREIGN KEY (id_publicacion) REFERENCES publicaciones (id_publicacion)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_oferta_comprador
        FOREIGN KEY (id_comprador) REFERENCES usuarios (id_usuario)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- ------------------------------------------------------------
-- Transacciones: la operación comercial que nace cuando el
-- vendedor acepta una oferta. Cantidad y precio se leen de la
-- oferta (no se duplican).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transacciones (
    id_transaccion  INTEGER PRIMARY KEY AUTOINCREMENT,
    id_oferta       INTEGER NOT NULL UNIQUE,
    estado          TEXT NOT NULL DEFAULT 'En curso'
                    CHECK (estado IN ('En curso', 'Completada', 'Cancelada')),
    fecha_acuerdo   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    fecha_cierre    TEXT,
    CONSTRAINT fk_transaccion_oferta
        FOREIGN KEY (id_oferta) REFERENCES ofertas (id_oferta)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_transaccion_cierre
        CHECK ((estado = 'En curso' AND fecha_cierre IS NULL)
            OR (estado <> 'En curso' AND fecha_cierre IS NOT NULL))
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_perfiles_rol            ON perfiles (id_rol);
CREATE INDEX IF NOT EXISTS idx_publicaciones_vendedor  ON publicaciones (id_vendedor);
CREATE INDEX IF NOT EXISTS idx_publicaciones_tipo      ON publicaciones (tipo_residuo, estado);
CREATE INDEX IF NOT EXISTS idx_fotos_publicacion       ON fotos_publicacion (id_publicacion);
CREATE INDEX IF NOT EXISTS idx_ofertas_publicacion     ON ofertas (id_publicacion);
CREATE INDEX IF NOT EXISTS idx_ofertas_comprador       ON ofertas (id_comprador);
CREATE INDEX IF NOT EXISTS idx_ofertas_estado          ON ofertas (estado);
CREATE INDEX IF NOT EXISTS idx_necesidades_empresa     ON necesidades_empresa (id_empresa);

-- Un comprador solo puede tener una oferta pendiente por publicación
CREATE UNIQUE INDEX IF NOT EXISTS ux_oferta_pendiente
    ON ofertas (id_publicacion, id_comprador) WHERE estado = 'Pendiente';

-- ------------------------------------------------------------
-- Triggers de integridad del mercado
-- ------------------------------------------------------------

-- Solo un vendedor activo puede publicar
CREATE TRIGGER IF NOT EXISTS trg_publicacion_vendedor
BEFORE INSERT ON publicaciones
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1 FROM perfiles p JOIN roles r ON r.id_rol = p.id_rol
    WHERE p.id_usuario = NEW.id_vendedor AND r.codigo = 'vendedor' AND p.activo = 1
)
BEGIN
    SELECT RAISE(ABORT, 'Solo una cuenta de vendedor activa puede publicar materiales.');
END;

-- Solo compradores o empresas activas pueden ofertar, nunca sobre lo propio,
-- solo sobre publicaciones activas y sin superar lo disponible
CREATE TRIGGER IF NOT EXISTS trg_oferta_validar
BEFORE INSERT ON ofertas
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Una oferta nueva debe quedar en estado Pendiente.')
    WHERE NEW.estado <> 'Pendiente';

    SELECT RAISE(ABORT, 'Solo compradores o empresas recicladoras activas pueden enviar ofertas.')
    WHERE NOT EXISTS (
        SELECT 1 FROM perfiles p JOIN roles r ON r.id_rol = p.id_rol
        WHERE p.id_usuario = NEW.id_comprador
          AND r.codigo IN ('comprador', 'empresa') AND p.activo = 1
    );

    SELECT RAISE(ABORT, 'No puedes ofertar por tu propia publicación.')
    WHERE (SELECT id_vendedor FROM publicaciones WHERE id_publicacion = NEW.id_publicacion) = NEW.id_comprador;

    SELECT RAISE(ABORT, 'La publicación no está disponible para recibir ofertas.')
    WHERE (SELECT estado FROM publicaciones WHERE id_publicacion = NEW.id_publicacion) <> 'Activa';

    SELECT RAISE(ABORT, 'La cantidad solicitada supera la cantidad disponible.')
    WHERE NEW.cantidad > (SELECT cantidad_disponible FROM publicaciones
                          WHERE id_publicacion = NEW.id_publicacion) + 0.000001;
END;

-- Cambios de estado permitidos en una negociación
CREATE TRIGGER IF NOT EXISTS trg_oferta_estado
BEFORE UPDATE OF estado ON ofertas
FOR EACH ROW
WHEN NEW.estado <> OLD.estado AND NOT (
       (OLD.estado = 'Pendiente' AND NEW.estado IN ('Aceptada', 'Rechazada', 'Cancelada'))
    OR (OLD.estado = 'Aceptada'  AND NEW.estado IN ('Completada', 'Cancelada'))
)
BEGIN
    SELECT RAISE(ABORT, 'Cambio de estado de la oferta no permitido.');
END;

-- Una transacción solo puede existir para una oferta aceptada
CREATE TRIGGER IF NOT EXISTS trg_transaccion_oferta
BEFORE INSERT ON transacciones
FOR EACH ROW
WHEN (SELECT estado FROM ofertas WHERE id_oferta = NEW.id_oferta) <> 'Aceptada'
BEGIN
    SELECT RAISE(ABORT, 'Solo se registran transacciones de ofertas aceptadas.');
END;

-- Solo las cuentas de empresa recicladora tienen perfil empresarial
CREATE TRIGGER IF NOT EXISTS trg_empresa_rol
BEFORE INSERT ON empresas
FOR EACH ROW
WHEN NOT EXISTS (
    SELECT 1 FROM perfiles p JOIN roles r ON r.id_rol = p.id_rol
    WHERE p.id_usuario = NEW.id_usuario AND r.codigo = 'empresa'
)
BEGIN
    SELECT RAISE(ABORT, 'El perfil empresarial requiere una cuenta de empresa recicladora.');
END;

-- ------------------------------------------------------------
-- Datos de catálogo (necesarios para que el sistema funcione)
-- ------------------------------------------------------------
INSERT OR IGNORE INTO roles (codigo, nombre, descripcion) VALUES
    ('administrador', 'Administrador',       'Gestiona usuarios, supervisa el mercado y opera el centro de acopio.'),
    ('vendedor',      'Vendedor',            'Ofrece residuos aprovechables a compradores y empresas.'),
    ('comprador',     'Comprador',           'Persona o pequeño negocio que compra residuos a la población.'),
    ('empresa',       'Empresa recicladora', 'Organización que compra materiales para procesos de reciclaje.');

INSERT OR IGNORE INTO permisos (codigo, descripcion) VALUES
    ('inventario.gestionar',    'Operar el centro de acopio: materiales, recolecciones, inventario, historial y reportes'),
    ('usuarios.gestionar',      'Consultar usuarios, activar o desactivar cuentas y cambiar el tipo de cuenta'),
    ('mercado.supervisar',      'Consultar todas las publicaciones, transacciones y estadísticas del mercado'),
    ('mercado.consultar',       'Consultar el mercado de materiales'),
    ('publicaciones.gestionar', 'Crear, editar y retirar publicaciones propias'),
    ('ofertas.recibir',         'Consultar, aceptar y rechazar ofertas recibidas'),
    ('ofertas.enviar',          'Enviar ofertas de compra y consultar sus negociaciones'),
    ('empresa.gestionar',       'Gestionar el perfil empresarial y las necesidades de materiales'),
    ('perfil.editar',           'Consultar y editar el perfil propio');

INSERT OR IGNORE INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r JOIN permisos p
WHERE (r.codigo = 'administrador' AND p.codigo IN
          ('inventario.gestionar', 'usuarios.gestionar', 'mercado.supervisar', 'mercado.consultar', 'perfil.editar'))
   OR (r.codigo = 'vendedor' AND p.codigo IN
          ('mercado.consultar', 'publicaciones.gestionar', 'ofertas.recibir', 'perfil.editar'))
   OR (r.codigo = 'comprador' AND p.codigo IN
          ('mercado.consultar', 'ofertas.enviar', 'perfil.editar'))
   OR (r.codigo = 'empresa' AND p.codigo IN
          ('mercado.consultar', 'ofertas.enviar', 'empresa.gestionar', 'perfil.editar'));

-- Los usuarios que ya existían reciben un perfil local (sin Google):
-- Administrador conserva ese rol; los operadores pasan a vendedores.
INSERT OR IGNORE INTO perfiles (id_usuario, id_rol, metodo_registro)
SELECT u.id_usuario,
       (SELECT id_rol FROM roles
        WHERE codigo = CASE u.rol WHEN 'Administrador' THEN 'administrador' ELSE 'vendedor' END),
       'demo'
FROM usuarios u;

PRAGMA user_version = 3;
`,

        // Copia de database/datos_mercado.sql
        DATOS_MERCADO: `-- ============================================================
-- EcoGestión · Datos de demostración del mercado
-- Ejecutar DESPUÉS de esquema.sql, datos_iniciales.sql y
-- esquema_mercado.sql.
--
-- Las cuentas de demostración NO tienen Google asociado
-- (metodo_registro = 'demo'). Solo se pueden usar desde el
-- "Acceso de demostración" de la pantalla de inicio.
-- Los usuarios se buscan por nombre para no depender de los id.
-- ============================================================

-- Nuevas cuentas de demostración
INSERT OR IGNORE INTO usuarios (nombre, rol, correo) VALUES
    ('Marta Rojas',         'Operador', 'marta.rojas@ecogestion.local'),
    ('Jorge Medina',        'Operador', 'jorge.medina@ecogestion.local'),
    ('Recicladora Andina',  'Operador', 'compras@recicladoraandina.local');

INSERT OR IGNORE INTO perfiles (id_usuario, id_rol, metodo_registro, telefono, ubicacion)
SELECT u.id_usuario, r.id_rol, 'demo', d.telefono, d.ubicacion
FROM (
    SELECT 'Marta Rojas' AS nombre, 'vendedor' AS rol, '310 555 0142' AS telefono, 'Soacha · Centro' AS ubicacion
    UNION ALL SELECT 'Jorge Medina', 'comprador', '315 555 0177', 'Bogotá · Bosa'
    UNION ALL SELECT 'Recicladora Andina', 'empresa', '601 555 0190', 'Bogotá · Puente Aranda'
) d
JOIN usuarios u ON u.nombre = d.nombre
JOIN roles r ON r.codigo = d.rol;

-- Cuentas que ya existían: datos de contacto y tipo de cuenta para la demo
UPDATE perfiles SET telefono = '312 555 0101', ubicacion = 'Bogotá · Chapinero'
WHERE id_usuario = (SELECT id_usuario FROM usuarios WHERE nombre = 'Laura Gómez');

UPDATE perfiles SET telefono = '300 555 0123', ubicacion = 'Bogotá · Kennedy'
WHERE id_usuario = (SELECT id_usuario FROM usuarios WHERE nombre = 'Carlos Ramírez');

UPDATE perfiles
SET id_rol = (SELECT id_rol FROM roles WHERE codigo = 'comprador'),
    telefono = '320 555 0164', ubicacion = 'Bogotá · Suba'
WHERE id_usuario = (SELECT id_usuario FROM usuarios WHERE nombre = 'Andrea Torres');

-- Perfil empresarial
INSERT OR IGNORE INTO empresas (id_usuario, razon_social, nit, telefono, correo_contacto, direccion, ciudad, descripcion)
SELECT id_usuario, 'Recicladora Andina S.A.S.', '900123456-7', '601 555 0190',
       'compras@recicladoraandina.local', 'Calle 13 # 52-40, bodega 3', 'Bogotá',
       'Transformamos plástico PET y cartón en materia prima para la industria.'
FROM usuarios WHERE nombre = 'Recicladora Andina';

INSERT INTO necesidades_empresa (id_empresa, tipo_residuo, descripcion, cantidad_minima, cantidad_maxima, unidad, precio_ofrecido, fecha_publicacion)
SELECT e.id_empresa, n.tipo, n.descripcion, n.minimo, n.maximo, 'kg', n.precio, datetime('now', 'localtime', n.dias)
FROM empresas e
JOIN usuarios u ON u.id_usuario = e.id_usuario AND u.nombre = 'Recicladora Andina'
JOIN (
    SELECT 'Plástico' AS tipo, 'PET transparente, limpio y sin etiquetas.' AS descripcion,
           200 AS minimo, 1000 AS maximo, 950 AS precio, '-6 days' AS dias
    UNION ALL SELECT 'Cartón', 'Cartón corrugado seco, compactado o en pacas.', 500, 3000, 480, '-3 days'
) n;

-- Publicaciones (se crean activas con su cantidad inicial)
INSERT INTO publicaciones (id_vendedor, tipo_residuo, nombre_material, descripcion, cantidad_disponible, unidad, precio_unitario, ubicacion, fecha_publicacion)
SELECT u.id_usuario, p.tipo, p.material, p.descripcion, p.cantidad, p.unidad, p.precio, p.ubicacion,
       datetime('now', 'localtime', p.dias)
FROM (
    SELECT 'Carlos Ramírez' AS vendedor, 'Plástico' AS tipo, 'Botellas PET transparentes' AS material,
           'Botellas lavadas y aplastadas, separadas de las tapas.' AS descripcion,
           85 AS cantidad, 'kg' AS unidad, 900 AS precio, 'Bogotá · Kennedy' AS ubicacion, '-9 days' AS dias
    UNION ALL SELECT 'Marta Rojas', 'Cartón', 'Cartón corrugado', 'Cajas desarmadas de un supermercado, secas.',
           250, 'kg', 450, 'Soacha · Centro', '-8 days'
    UNION ALL SELECT 'Carlos Ramírez', 'Metal', 'Latas de aluminio', 'Latas de bebidas compactadas.',
           32, 'kg', 3800, 'Bogotá · Kennedy', '-12 days'
    UNION ALL SELECT 'Marta Rojas', 'Vidrio', 'Botellas de vidrio ámbar', 'Botellas enteras, sin etiquetas.',
           120, 'unidades', 120, 'Soacha · Centro', '-5 days'
    UNION ALL SELECT 'Carlos Ramírez', 'Papel', 'Papel de archivo', 'Hojas blancas de oficina, sin ganchos.',
           60, 'kg', 600, 'Bogotá · Kennedy', '-4 days'
    UNION ALL SELECT 'Marta Rojas', 'Otros', 'Envases Tetra Pak', 'Envases enjuagados y aplanados.',
           40, 'kg', 250, 'Soacha · Centro', '-2 days'
) p
JOIN usuarios u ON u.nombre = p.vendedor;

-- Ofertas: todas nacen pendientes; luego se aplican las mismas
-- actualizaciones que hace la aplicación al aceptar, rechazar,
-- cancelar o completar.
INSERT INTO ofertas (id_publicacion, id_comprador, cantidad, precio_unitario, mensaje, fecha_oferta)
SELECT pb.id_publicacion, c.id_usuario, o.cantidad, o.precio, o.mensaje, datetime('now', 'localtime', o.dias)
FROM (
    SELECT 'Botellas PET transparentes' AS material, 'Andrea Torres' AS comprador, 30 AS cantidad, 850 AS precio,
           '¿Puedo recogerlas el sábado en la mañana?' AS mensaje, '-1 days' AS dias
    UNION ALL SELECT 'Cartón corrugado', 'Jorge Medina', 100, 420, 'Pago de contado al recoger.', '-6 days'
    UNION ALL SELECT 'Latas de aluminio', 'Recicladora Andina', 32, 3700, 'Compramos todo el lote.', '-10 days'
    UNION ALL SELECT 'Botellas de vidrio ámbar', 'Andrea Torres', 50, 100, NULL, '-4 days'
    UNION ALL SELECT 'Papel de archivo', 'Jorge Medina', 20, 550, NULL, '-3 days'
    UNION ALL SELECT 'Cartón corrugado', 'Recicladora Andina', 80, 470, 'Podemos enviar vehículo propio.', '-2 days'
) o
JOIN publicaciones pb ON pb.nombre_material = o.material
JOIN usuarios c ON c.nombre = o.comprador;

-- Cartón: oferta de Jorge aceptada (descuenta 100 kg y abre la transacción)
UPDATE publicaciones SET cantidad_disponible = cantidad_disponible - 100,
       fecha_actualizacion = datetime('now', 'localtime', '-5 days')
WHERE nombre_material = 'Cartón corrugado';
UPDATE ofertas SET estado = 'Aceptada', fecha_respuesta = datetime('now', 'localtime', '-5 days')
WHERE id_publicacion = (SELECT id_publicacion FROM publicaciones WHERE nombre_material = 'Cartón corrugado')
  AND id_comprador = (SELECT id_usuario FROM usuarios WHERE nombre = 'Jorge Medina');
INSERT INTO transacciones (id_oferta, fecha_acuerdo)
SELECT id_oferta, fecha_respuesta FROM ofertas
WHERE estado = 'Aceptada'
  AND id_comprador = (SELECT id_usuario FROM usuarios WHERE nombre = 'Jorge Medina');

-- Latas: la empresa compró todo el lote; la operación se completó
UPDATE publicaciones SET cantidad_disponible = 0, estado = 'Agotada',
       fecha_actualizacion = datetime('now', 'localtime', '-9 days')
WHERE nombre_material = 'Latas de aluminio';
UPDATE ofertas SET estado = 'Aceptada', fecha_respuesta = datetime('now', 'localtime', '-9 days')
WHERE id_publicacion = (SELECT id_publicacion FROM publicaciones WHERE nombre_material = 'Latas de aluminio');
INSERT INTO transacciones (id_oferta, fecha_acuerdo)
SELECT id_oferta, fecha_respuesta FROM ofertas
WHERE id_publicacion = (SELECT id_publicacion FROM publicaciones WHERE nombre_material = 'Latas de aluminio');
UPDATE ofertas SET estado = 'Completada'
WHERE id_publicacion = (SELECT id_publicacion FROM publicaciones WHERE nombre_material = 'Latas de aluminio');
UPDATE transacciones SET estado = 'Completada', fecha_cierre = datetime('now', 'localtime', '-7 days')
WHERE id_oferta = (SELECT o.id_oferta FROM ofertas o JOIN publicaciones p ON p.id_publicacion = o.id_publicacion
                   WHERE p.nombre_material = 'Latas de aluminio');

-- Vidrio: oferta rechazada por el vendedor
UPDATE ofertas SET estado = 'Rechazada', fecha_respuesta = datetime('now', 'localtime', '-3 days')
WHERE id_publicacion = (SELECT id_publicacion FROM publicaciones WHERE nombre_material = 'Botellas de vidrio ámbar');

-- Papel: el comprador canceló su oferta
UPDATE ofertas SET estado = 'Cancelada', fecha_respuesta = datetime('now', 'localtime', '-2 days')
WHERE id_publicacion = (SELECT id_publicacion FROM publicaciones WHERE nombre_material = 'Papel de archivo');
`
    };
})();
