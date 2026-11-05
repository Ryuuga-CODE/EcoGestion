/* ============================================================
   EcoGestión · Módulo de historial
   Consulta filtrada de movimientos y exportación a CSV.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};

    function leerFiltros() {
        return {
            desde: document.getElementById('historial-desde').value,
            hasta: document.getElementById('historial-hasta').value,
            tipo: document.getElementById('historial-tipo').value,
            texto: document.getElementById('historial-texto').value.trim()
        };
    }

    function validarFiltros(filtros) {
        const error = document.getElementById('historial-error');
        if (filtros.desde && !Eco.Util.validarFechaIso(filtros.desde)) {
            error.textContent = 'La fecha inicial no es válida.';
            return false;
        }
        if (filtros.hasta && !Eco.Util.validarFechaIso(filtros.hasta)) {
            error.textContent = 'La fecha final no es válida.';
            return false;
        }
        if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
            error.textContent = 'La fecha inicial no puede ser posterior a la fecha final.';
            return false;
        }
        error.textContent = '';
        return true;
    }

    function construirConsulta(filtros) {
        const condiciones = [];
        const parametros = [];
        if (filtros.tipo) {
            condiciones.push('mv.tipo = ?');
            parametros.push(filtros.tipo);
        }
        if (filtros.desde) {
            condiciones.push('mv.fecha >= ?');
            parametros.push(filtros.desde);
        }
        if (filtros.hasta) {
            condiciones.push('mv.fecha <= ?');
            parametros.push(filtros.hasta);
        }
        if (filtros.texto) {
            condiciones.push(`(m.nombre LIKE ? COLLATE NOCASE
                OR u.nombre LIKE ? COLLATE NOCASE
                OR COALESCE(mv.observaciones, '') LIKE ? COLLATE NOCASE)`);
            const patron = `%${filtros.texto}%`;
            parametros.push(patron, patron, patron);
        }
        const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
        return {
            sql: `SELECT mv.id_movimiento, mv.fecha, mv.tipo, mv.cantidad, mv.unidad_medida,
                         mv.observaciones, m.nombre AS material, m.categoria,
                         u.nombre AS responsable
                  FROM movimientos mv
                  INNER JOIN materiales m ON m.id_material = mv.id_material
                  INNER JOIN usuarios u ON u.id_usuario = mv.id_usuario
                  ${where}
                  ORDER BY mv.fecha DESC, mv.id_movimiento DESC`,
            parametros
        };
    }

    function render() {
        const filtros = leerFiltros();
        if (!validarFiltros(filtros)) return;
        const consulta = construirConsulta(filtros);
        const filas = Eco.DB.consultar(consulta.sql, consulta.parametros);

        const cuerpo = document.getElementById('tabla-historial-body');
        const vacio = document.getElementById('historial-vacio');
        const contenedor = cuerpo.closest('.tabla-contenedor');
        const resumen = document.getElementById('historial-resumen');

        cuerpo.innerHTML = filas.map((fila) => {
            const tipoClase = fila.tipo === 'Entrada' ? 'entrada' : 'salida';
            const icono = fila.tipo === 'Entrada' ? 'i-flecha-abajo' : 'i-flecha-arriba';
            const observaciones = fila.observaciones
                ? Eco.Util.escaparHtml(fila.observaciones)
                : '<span class="texto-tenue">Sin observaciones</span>';
            return `
                <tr>
                    <td><span class="fecha-tabla">${Eco.Util.formatearFecha(fila.fecha)}</span></td>
                    <td>
                        <span class="insignia-movimiento ${tipoClase}">
                            <svg class="icono" aria-hidden="true"><use href="#${icono}"></use></svg>
                            ${Eco.Util.escaparHtml(fila.tipo)}
                        </span>
                    </td>
                    <td>
                        <div class="celda-material-texto">
                            <strong>${Eco.Util.escaparHtml(fila.material)}</strong>
                            <small>${Eco.Util.escaparHtml(fila.categoria)}</small>
                        </div>
                    </td>
                    <td class="texto-derecha">
                        <strong class="cantidad-tabla">${Eco.Util.formatearCantidad(fila.cantidad, fila.unidad_medida)}</strong>
                        <span class="unidad-sufijo">${Eco.Util.escaparHtml(fila.unidad_medida)}</span>
                    </td>
                    <td>
                        <div class="celda-persona">
                            <span class="avatar-persona" aria-hidden="true">${Eco.Util.escaparHtml(String(fila.responsable || '?').charAt(0).toUpperCase())}</span>
                            <span>${Eco.Util.escaparHtml(fila.responsable)}</span>
                        </div>
                    </td>
                    <td><span class="celda-observacion" title="${Eco.Util.escaparHtml(fila.observaciones || '')}">${observaciones}</span></td>
                </tr>
            `;
        }).join('');

        const entradas = filas.filter((fila) => fila.tipo === 'Entrada').length;
        const salidas = filas.length - entradas;
        resumen.textContent = `${filas.length} ${filas.length === 1 ? 'movimiento' : 'movimientos'} · ` +
            `${entradas} ${entradas === 1 ? 'entrada' : 'entradas'} · ${salidas} ${salidas === 1 ? 'salida' : 'salidas'}`;

        const hayFilas = filas.length > 0;
        contenedor.hidden = !hayFilas;
        vacio.hidden = hayFilas;
    }

    function exportar() {
        const filtros = leerFiltros();
        if (!validarFiltros(filtros)) return;
        const consulta = construirConsulta(filtros);
        const filas = Eco.DB.consultar(consulta.sql, consulta.parametros);
        if (filas.length === 0) {
            Eco.Util.mostrarAviso('No hay movimientos para exportar con los filtros actuales.', 'info');
            return;
        }
        const encabezados = ['Fecha', 'Tipo', 'Material', 'Categoría', 'Cantidad', 'Unidad', 'Responsable', 'Observaciones'];
        const datos = filas.map((fila) => [
            fila.fecha,
            fila.tipo,
            fila.material,
            fila.categoria,
            Eco.Util.numeroCSV(fila.cantidad),
            fila.unidad_medida,
            fila.responsable,
            fila.observaciones || ''
        ]);
        Eco.Util.descargarCSV(`historial_ecogestion_${Eco.Util.fechaHoyIso()}.csv`, encabezados, datos);
        Eco.Util.mostrarAviso('Historial exportado en formato CSV.');
    }

    function limpiar() {
        document.getElementById('form-filtros-historial').reset();
        document.getElementById('historial-error').textContent = '';
        render();
    }

    function init() {
        document.getElementById('form-filtros-historial').addEventListener('submit', (evento) => {
            evento.preventDefault();
            render();
        });
        document.getElementById('btn-limpiar-historial').addEventListener('click', limpiar);
        document.getElementById('btn-exportar-historial').addEventListener('click', exportar);
        ['historial-desde', 'historial-hasta'].forEach((idCampo) => {
            document.getElementById(idCampo).addEventListener('change', () => {
                document.getElementById('historial-error').textContent = '';
            });
        });
    }

    Eco.Historial = {
        init,
        render,
        exportar
    };
})();
