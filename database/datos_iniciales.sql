-- ============================================================
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
