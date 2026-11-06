/* ============================================================
   EcoGestión · Módulo de recolecciones
   Registro transaccional de recolecciones y su movimiento de
   entrada. Incluye catálogos reutilizables para los formularios.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const CAMPOS = [
        'recoleccion-material',
        'recoleccion-cantidad',
        'recoleccion-fecha',
        'recoleccion-responsable',
        'recoleccion-observaciones'
    ];

    let guardando = false;

    function cargarResponsables(idSelect, seleccionado) {
        const select = document.getElementById(idSelect);
        // Responsables: administradores y repartidores activos del municipio
        const usuarios = Eco.DB.consultar(
            `SELECT u.id_usuario, u.nombre, r.nombre AS rol
             FROM usuarios u JOIN perfiles p ON p.id_usuario = u.id_usuario JOIN roles r ON r.id_rol = p.id_rol
             WHERE p.activo = 1 AND r.codigo IN ('administrador', 'repartidor')
             ORDER BY r.codigo, u.nombre COLLATE NOCASE`
        );
        select.innerHTML = '<option value="">Selecciona un responsable</option>' +
            usuarios.map((usuario) => `
                <option value="${usuario.id_usuario}">${Eco.Util.escaparHtml(usuario.nombre)} · ${Eco.Util.escaparHtml(usuario.rol)}</option>
            `).join('');
        if (seleccionado) select.value = String(seleccionado);
    }

    function cargarMateriales(idSelect, soloConStock, seleccionado) {
        const select = document.getElementById(idSelect);
        const materiales = Eco.DB.consultar(
            `SELECT id_material, nombre, categoria, unidad_medida, existencia
             FROM vista_existencias
             ORDER BY nombre COLLATE NOCASE`
        ).filter((material) => !soloConStock || Number(material.existencia) > 0);

        select.innerHTML = '<option value="">Selecciona un material</option>' +
            materiales.map((material) => `
                <option value="${material.id_material}"
                        data-unidad="${Eco.Util.escaparHtml(material.unidad_medida)}"
                        data-existencia="${Number(material.existencia) || 0}">
                    ${Eco.Util.escaparHtml(material.nombre)} · ${Eco.Util.escaparHtml(material.categoria)}
                </option>
            `).join('');
        if (seleccionado) select.value = String(seleccionado);
    }

    Eco.Catalogos = {
        cargarResponsables,
        cargarMateriales
    };

    function render() {
        const filas = Eco.DB.consultar(
            `SELECT r.id_recoleccion, r.fecha, r.cantidad, r.unidad_medida, r.observaciones,
                    m.nombre AS material, m.categoria,
                    u.nombre AS responsable
             FROM recolecciones r
             INNER JOIN materiales m ON m.id_material = r.id_material
             INNER JOIN usuarios u ON u.id_usuario = r.id_usuario
             ORDER BY r.fecha DESC, r.id_recoleccion DESC`
        );

        const resumen = Eco.DB.consultarUno(
            `SELECT COUNT(*) AS total,
                    COUNT(DISTINCT id_material) AS materiales,
                    MAX(fecha) AS ultima
             FROM recolecciones`
        ) || { total: 0, materiales: 0, ultima: null };

        document.getElementById('rec-total').textContent = Eco.Util.formatearNumero(resumen.total);
        document.getElementById('rec-materiales').textContent = Eco.Util.formatearNumero(resumen.materiales);
        document.getElementById('rec-ultima').textContent = resumen.ultima
            ? Eco.Util.formatearFecha(resumen.ultima)
            : '—';

        const cuerpo = document.getElementById('tabla-recolecciones-body');
        const vacio = document.getElementById('recolecciones-vacio');
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

        const hayFilas = filas.length > 0;
        contenedor.hidden = !hayFilas;
        vacio.hidden = hayFilas;
    }

    function abrirNueva() {
        const totalMateriales = Eco.DB.contar('SELECT COUNT(*) AS total FROM materiales');
        if (totalMateriales === 0) {
            Eco.Util.mostrarAviso('Primero registra al menos un material en el catálogo.', 'error');
            Eco.App.irA('materiales');
            return;
        }

        document.getElementById('form-recoleccion').reset();
        Eco.Util.limpiarErroresCampos(CAMPOS);
        document.getElementById('recoleccion-fecha').value = Eco.Util.fechaHoyIso();
        document.getElementById('recoleccion-unidad').value = '';
        document.getElementById('recoleccion-existencia').textContent =
            'Selecciona un material para ver su existencia actual.';
        cargarMateriales('recoleccion-material', false);
        cargarResponsables('recoleccion-responsable');
        Eco.App.abrirModal('modal-recoleccion');
        window.setTimeout(() => document.getElementById('recoleccion-material').focus(), 80);
    }

    function actualizarMaterialSeleccionado() {
        const select = document.getElementById('recoleccion-material');
        const opcion = select.options[select.selectedIndex];
        const unidad = opcion ? opcion.dataset.unidad || '' : '';
        const existencia = opcion ? Number(opcion.dataset.existencia || 0) : 0;
        const campoUnidad = document.getElementById('recoleccion-unidad');
        const ayuda = document.getElementById('recoleccion-existencia');
        campoUnidad.value = unidad;
        if (!select.value) {
            ayuda.textContent = 'Selecciona un material para ver su existencia actual.';
            return;
        }
        ayuda.textContent = `Existencia actual: ${Eco.Util.formatearCantidad(existencia, unidad)} ${unidad}.`;
        Eco.Util.limpiarErrorCampo('recoleccion-material');
    }

    function validarFormulario() {
        Eco.Util.limpiarErroresCampos(CAMPOS);
        const idMaterial = Number(document.getElementById('recoleccion-material').value);
        const idUsuario = Number(document.getElementById('recoleccion-responsable').value);
        const cantidad = Eco.Util.normalizarCantidad(document.getElementById('recoleccion-cantidad').value);
        const fecha = document.getElementById('recoleccion-fecha').value;
        const observaciones = document.getElementById('recoleccion-observaciones').value.trim();
        let valido = true;

        const material = idMaterial
            ? Eco.DB.consultarUno(
                'SELECT id_material, nombre, unidad_medida, existencia FROM vista_existencias WHERE id_material = ?',
                [idMaterial]
            )
            : null;
        if (!material) {
            Eco.Util.mostrarErrorCampo('recoleccion-material', 'Selecciona un material válido.');
            valido = false;
        }

        const usuario = idUsuario
            ? Eco.DB.consultarUno('SELECT id_usuario FROM usuarios WHERE id_usuario = ?', [idUsuario])
            : null;
        if (!usuario) {
            Eco.Util.mostrarErrorCampo('recoleccion-responsable', 'Selecciona un responsable válido.');
            valido = false;
        }

        if (cantidad === null || cantidad <= 0) {
            Eco.Util.mostrarErrorCampo('recoleccion-cantidad', 'La cantidad debe ser mayor que cero.');
            valido = false;
        } else if (material && material.unidad_medida === 'unidades' && !Number.isInteger(cantidad)) {
            Eco.Util.mostrarErrorCampo(
                'recoleccion-cantidad',
                'Para materiales en unidades, la cantidad debe ser un número entero.'
            );
            valido = false;
        } else if (cantidad > 1000000000) {
            Eco.Util.mostrarErrorCampo('recoleccion-cantidad', 'La cantidad es demasiado grande.');
            valido = false;
        }

        if (!Eco.Util.validarFechaIso(fecha)) {
            Eco.Util.mostrarErrorCampo('recoleccion-fecha', 'Selecciona una fecha válida.');
            valido = false;
        } else if (fecha > Eco.Util.fechaHoyIso()) {
            Eco.Util.mostrarErrorCampo('recoleccion-fecha', 'La fecha no puede ser posterior a hoy.');
            valido = false;
        }

        if (observaciones.length > 300) {
            Eco.Util.mostrarErrorCampo('recoleccion-observaciones', 'Las observaciones no pueden superar 300 caracteres.');
            valido = false;
        }

        if (!valido) return null;
        return {
            idMaterial,
            idUsuario,
            cantidad: Eco.Util.redondear(cantidad, material.unidad_medida === 'unidades' ? 0 : 2),
            unidad: material.unidad_medida,
            fecha,
            observaciones: observaciones || null,
            nombreMaterial: material.nombre
        };
    }

    async function guardar(evento) {
        evento.preventDefault();
        if (guardando) return;
        const datos = validarFormulario();
        if (!datos) return;

        const boton = document.getElementById('btn-guardar-recoleccion');
        guardando = true;
        boton.disabled = true;
        try {
            // Recolección + movimiento de entrada en una sola transacción del servidor
            await Eco.Nube.rpc('registrar_recoleccion', {
                p_id_material: datos.idMaterial,
                p_id_responsable: datos.idUsuario,
                p_cantidad: datos.cantidad,
                p_fecha: datos.fecha,
                p_observaciones: datos.observaciones
            });

            Eco.App.cerrarModal('modal-recoleccion');
            await Eco.App.despuesDeCambio(
                `Recolección de ${Eco.Util.formatearCantidad(datos.cantidad, datos.unidad)} ${datos.unidad} de ${datos.nombreMaterial} registrada.`
            );
        } catch (error) {
            Eco.Util.mostrarAviso(
                Eco.Util.mensajeError(error, 'No se pudo registrar la recolección.'),
                'error'
            );
        } finally {
            guardando = false;
            boton.disabled = false;
        }
    }

    function init() {
        document.getElementById('btn-nueva-recoleccion').addEventListener('click', abrirNueva);
        document.getElementById('btn-nueva-recoleccion-top').addEventListener('click', abrirNueva);
        document.getElementById('form-recoleccion').addEventListener('submit', guardar);
        document.getElementById('recoleccion-material').addEventListener('change', actualizarMaterialSeleccionado);

        CAMPOS.forEach((idCampo) => {
            const campo = document.getElementById(idCampo);
            campo.addEventListener('input', () => Eco.Util.limpiarErrorCampo(idCampo));
            campo.addEventListener('change', () => Eco.Util.limpiarErrorCampo(idCampo));
        });
    }

    Eco.Recolecciones = {
        init,
        render,
        abrirNueva
    };
})();
