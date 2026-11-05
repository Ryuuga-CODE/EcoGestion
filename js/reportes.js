/* ============================================================
   EcoGestión · Módulo de reportes
   Estadísticas, consultas por fecha y exportación CSV.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const UNIDADES = ['kg', 'unidades', 'litros'];

    function establecerFechasPorDefecto() {
        const desde = document.getElementById('reporte-desde');
        const hasta = document.getElementById('reporte-hasta');
        if (!desde.value) desde.value = Eco.Util.fechaHaceDias(29);
        if (!hasta.value) hasta.value = Eco.Util.fechaHoyIso();
    }

    function leerFiltros() {
        return {
            desde: document.getElementById('reporte-desde').value,
            hasta: document.getElementById('reporte-hasta').value
        };
    }

    function validarFiltros(filtros) {
        const error = document.getElementById('reporte-error');
        if (!Eco.Util.validarFechaIso(filtros.desde)) {
            error.textContent = 'Selecciona una fecha inicial válida.';
            return false;
        }
        if (!Eco.Util.validarFechaIso(filtros.hasta)) {
            error.textContent = 'Selecciona una fecha final válida.';
            return false;
        }
        if (filtros.desde > filtros.hasta) {
            error.textContent = 'La fecha inicial no puede ser posterior a la fecha final.';
            return false;
        }
        error.textContent = '';
        return true;
    }

    function consultarRecolecciones() {
        const filtros = leerFiltros();
        if (!validarFiltros(filtros)) return;

        const filas = Eco.DB.consultar(
            `SELECT r.id_recoleccion, r.fecha, r.cantidad, r.unidad_medida, r.observaciones,
                    m.nombre AS material, m.categoria,
                    u.nombre AS responsable
             FROM recolecciones r
             INNER JOIN materiales m ON m.id_material = r.id_material
             INNER JOIN usuarios u ON u.id_usuario = r.id_usuario
             WHERE r.fecha >= ? AND r.fecha <= ?
             ORDER BY r.fecha DESC, r.id_recoleccion DESC`,
            [filtros.desde, filtros.hasta]
        );

        const cuerpo = document.getElementById('tabla-reporte-recolecciones-body');
        const vacio = document.getElementById('reporte-recolecciones-vacio');
        const contenedor = cuerpo.closest('.tabla-contenedor');

        cuerpo.innerHTML = filas.map((fila) => {
            const observaciones = fila.observaciones
                ? Eco.Util.escaparHtml(fila.observaciones)
                : '<span class="texto-tenue">Sin observaciones</span>';
            return `
                <tr>
                    <td><span class="fecha-tabla">${Eco.Util.formatearFecha(fila.fecha)}</span></td>
                    <td><strong>${Eco.Util.escaparHtml(fila.material)}</strong></td>
                    <td><span class="insignia" data-cat="${Eco.Util.escaparHtml(fila.categoria)}">${Eco.Util.escaparHtml(fila.categoria)}</span></td>
                    <td class="texto-derecha">
                        <strong class="cantidad-tabla">${Eco.Util.formatearCantidad(fila.cantidad, fila.unidad_medida)}</strong>
                        <span class="unidad-sufijo">${Eco.Util.escaparHtml(fila.unidad_medida)}</span>
                    </td>
                    <td>${Eco.Util.escaparHtml(fila.responsable)}</td>
                    <td><span class="celda-observacion" title="${Eco.Util.escaparHtml(fila.observaciones || '')}">${observaciones}</span></td>
                </tr>
            `;
        }).join('');

        const hayFilas = filas.length > 0;
        contenedor.hidden = !hayFilas;
        vacio.hidden = hayFilas;

        const totales = { kg: 0, unidades: 0, litros: 0 };
        filas.forEach((fila) => {
            totales[fila.unidad_medida] += Number(fila.cantidad) || 0;
        });
        const resumen = document.getElementById('reporte-recolecciones-resumen');
        const unidadesConDatos = UNIDADES.filter((unidad) => totales[unidad] > 0);
        resumen.innerHTML = unidadesConDatos.length
            ? unidadesConDatos.map((unidad) => `
                <span class="resumen-unidad">
                    <strong>${Eco.Util.formatearCantidad(totales[unidad], unidad)}</strong>
                    <small>${unidad} recolectados</small>
                </span>
            `).join('')
            : '<span class="texto-tenue">Sin cantidades en el período seleccionado.</span>';

        document.getElementById('reporte-periodo').textContent = Eco.Util.formatearNumero(filas.length);
        document.getElementById('reporte-periodo-pie').textContent =
            `${Eco.Util.formatearFecha(filtros.desde)} – ${Eco.Util.formatearFecha(filtros.hasta)}`;

        return filas;
    }

    function render() {
        establecerFechasPorDefecto();

        const totalMateriales = Eco.DB.contar('SELECT COUNT(*) AS total FROM materiales');
        const totalRecolecciones = Eco.DB.contar('SELECT COUNT(*) AS total FROM recolecciones');
        const ultima = Eco.DB.escalar('SELECT MAX(fecha) AS ultima FROM recolecciones');

        document.getElementById('reporte-materiales').textContent = Eco.Util.formatearNumero(totalMateriales);
        document.getElementById('reporte-recolecciones-total').textContent = Eco.Util.formatearNumero(totalRecolecciones);
        document.getElementById('reporte-ultima').textContent = ultima
            ? Eco.Util.formatearFecha(ultima)
            : '—';

        const existencias = Eco.DB.consultar(
            `SELECT id_material, nombre, categoria, unidad_medida, total_recolectado,
                    total_salidas, existencia
             FROM vista_existencias
             ORDER BY categoria COLLATE NOCASE, nombre COLLATE NOCASE`
        );
        const cuerpoExistencias = document.getElementById('tabla-reporte-existencias-body');
        const vacioExistencias = document.getElementById('reporte-existencias-vacio');
        const contenedorExistencias = cuerpoExistencias.closest('.tabla-contenedor');

        cuerpoExistencias.innerHTML = existencias.map((fila) => `
            <tr>
                <td>
                    <div class="celda-material-texto">
                        <strong>${Eco.Util.escaparHtml(fila.nombre)}</strong>
                        <small>${Eco.Util.escaparHtml(fila.categoria)}</small>
                    </div>
                </td>
                <td class="texto-derecha">
                    ${Eco.Util.formatearCantidad(fila.total_recolectado, fila.unidad_medida)}
                    <span class="unidad-sufijo">${Eco.Util.escaparHtml(fila.unidad_medida)}</span>
                </td>
                <td class="texto-derecha">
                    ${Eco.Util.formatearCantidad(fila.total_salidas, fila.unidad_medida)}
                    <span class="unidad-sufijo">${Eco.Util.escaparHtml(fila.unidad_medida)}</span>
                </td>
                <td class="texto-derecha">
                    <strong class="cantidad-tabla">${Eco.Util.formatearCantidad(fila.existencia, fila.unidad_medida)}</strong>
                    <span class="unidad-sufijo">${Eco.Util.escaparHtml(fila.unidad_medida)}</span>
                </td>
            </tr>
        `).join('');
        contenedorExistencias.hidden = existencias.length === 0;
        vacioExistencias.hidden = existencias.length > 0;

        const categorias = Eco.DB.consultar(
            `SELECT categoria, COUNT(*) AS total
             FROM materiales
             GROUP BY categoria
             ORDER BY total DESC, categoria COLLATE NOCASE`
        );
        const maximo = categorias.reduce((max, fila) => Math.max(max, Number(fila.total)), 0);
        const contenedorCategorias = document.getElementById('reporte-categorias');
        contenedorCategorias.innerHTML = categorias.length
            ? categorias.map((fila) => {
                const porcentaje = maximo > 0 ? (Number(fila.total) / maximo) * 100 : 0;
                return `
                    <div class="barra-categoria">
                        <div class="barra-categoria-cabecera">
                            <span>${Eco.Util.escaparHtml(fila.categoria)}</span>
                            <strong>${Eco.Util.formatearNumero(fila.total)}</strong>
                        </div>
                        <div class="barra-pista">
                            <span class="barra-relleno" style="width: ${porcentaje}%"></span>
                        </div>
                    </div>
                `;
            }).join('')
            : '<p class="texto-tenue">Sin materiales registrados.</p>';

        const principal = categorias.length ? categorias[0] : null;
        document.getElementById('reporte-resumen').innerHTML = `
            <div class="mini-resumen-fila">
                <span>Categorías con materiales</span>
                <strong>${Eco.Util.formatearNumero(categorias.length)}</strong>
            </div>
            <div class="mini-resumen-fila">
                <span>Categoría principal</span>
                <strong>${principal ? Eco.Util.escaparHtml(principal.categoria) : '—'}</strong>
            </div>
            <div class="mini-resumen-fila">
                <span>Materiales registrados</span>
                <strong>${Eco.Util.formatearNumero(totalMateriales)}</strong>
            </div>
        `;

        consultarRecolecciones();
    }

    function exportarRecolecciones() {
        const filtros = leerFiltros();
        if (!validarFiltros(filtros)) return;
        const filas = Eco.DB.consultar(
            `SELECT r.fecha, r.cantidad, r.unidad_medida, r.observaciones,
                    m.nombre AS material, m.categoria, u.nombre AS responsable
             FROM recolecciones r
             INNER JOIN materiales m ON m.id_material = r.id_material
             INNER JOIN usuarios u ON u.id_usuario = r.id_usuario
             WHERE r.fecha >= ? AND r.fecha <= ?
             ORDER BY r.fecha ASC, r.id_recoleccion ASC`,
            [filtros.desde, filtros.hasta]
        );
        if (filas.length === 0) {
            Eco.Util.mostrarAviso('No hay recolecciones para exportar en ese período.', 'info');
            return;
        }
        Eco.Util.descargarCSV(
            `recolecciones_${filtros.desde}_a_${filtros.hasta}.csv`,
            ['Fecha', 'Material', 'Categoría', 'Cantidad', 'Unidad', 'Responsable', 'Observaciones'],
            filas.map((fila) => [
                fila.fecha,
                fila.material,
                fila.categoria,
                Eco.Util.numeroCSV(fila.cantidad),
                fila.unidad_medida,
                fila.responsable,
                fila.observaciones || ''
            ])
        );
        Eco.Util.mostrarAviso('Reporte de recolecciones exportado en CSV.');
    }

    function exportarExistencias() {
        const filas = Eco.DB.consultar(
            `SELECT nombre, categoria, unidad_medida, total_recolectado, total_salidas, existencia
             FROM vista_existencias
             ORDER BY categoria COLLATE NOCASE, nombre COLLATE NOCASE`
        );
        if (filas.length === 0) {
            Eco.Util.mostrarAviso('No hay materiales para exportar.', 'info');
            return;
        }
        Eco.Util.descargarCSV(
            `existencias_ecogestion_${Eco.Util.fechaHoyIso()}.csv`,
            ['Material', 'Categoría', 'Unidad', 'Total recolectado', 'Total salidas', 'Existencia'],
            filas.map((fila) => [
                fila.nombre,
                fila.categoria,
                fila.unidad_medida,
                Eco.Util.numeroCSV(fila.total_recolectado),
                Eco.Util.numeroCSV(fila.total_salidas),
                Eco.Util.numeroCSV(fila.existencia)
            ])
        );
        Eco.Util.mostrarAviso('Reporte de existencias exportado en CSV.');
    }

    function init() {
        establecerFechasPorDefecto();
        document.getElementById('form-reporte-fechas').addEventListener('submit', (evento) => {
            evento.preventDefault();
            consultarRecolecciones();
        });
        document.getElementById('btn-exportar-recolecciones').addEventListener('click', exportarRecolecciones);
        document.getElementById('btn-exportar-existencias').addEventListener('click', exportarExistencias);
        ['reporte-desde', 'reporte-hasta'].forEach((idCampo) => {
            document.getElementById(idCampo).addEventListener('change', () => {
                document.getElementById('reporte-error').textContent = '';
            });
        });
    }

    Eco.Reportes = {
        init,
        render,
        consultarRecolecciones,
        exportarRecolecciones,
        exportarExistencias
    };
})();
