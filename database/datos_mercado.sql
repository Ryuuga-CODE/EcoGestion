-- ============================================================
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
