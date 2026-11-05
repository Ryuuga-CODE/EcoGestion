/* ============================================================
   EcoGestión · Esquema de la réplica SQLite (copia embebida)
   Copia de database/esquema.sql y database/esquema_mercado.sql.
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

        ESQUEMA_MERCADO: `-- ============================================================
-- EcoGestión · Ampliación: cuentas, roles y mercado de residuos
-- Versión del esquema: 3
-- ============================================================
-- Este script AMPLÍA la base creada por esquema.sql. No elimina ni
-- modifica las tablas existentes (usuarios, materiales,
-- recolecciones, movimientos); solo agrega tablas nuevas que se
-- relacionan con ellas.
--
-- Desde la versión 4 este esquema SQLite se usa para la RÉPLICA
-- local (sql.js) de cada navegador; la base central está en
-- Supabase (supabase/esquema_supabase.sql). Copia embebida en
-- js/datos_sql.js.
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

-- Fotografías de cada publicación (hasta 3; URL de Supabase Storage)
CREATE TABLE IF NOT EXISTS fotos_publicacion (
    id_foto         INTEGER PRIMARY KEY AUTOINCREMENT,
    id_publicacion  INTEGER NOT NULL,
    imagen          TEXT NOT NULL CHECK (imagen LIKE 'https://%' OR imagen LIKE 'http://%'),
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
`
    };
})();
