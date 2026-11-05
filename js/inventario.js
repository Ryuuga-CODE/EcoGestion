/* ============================================================
   EcoGestión · Módulo de inventario
   Consulta de existencias y registro transaccional de salidas.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const CAMPOS_SALIDA = [
        'salida-material',
        'salida-cantidad',
        'salida-fecha',
        'salida-responsable',
        'salida-observaciones'
    ];

    let guardando = false;

    function render() {
        const texto = document.getElementById('filtro-inventario').value.trim();
        const patron = `%${texto}%`;
        const filas = Eco.DB.consultar(
            `SELECT id_material, nombre, categoria, unidad_medida, existencia
             FROM vista_existencias
             WHERE (? = '' OR nombre LIKE ? COLLATE NOCASE)
             ORDER BY categoria COLLATE NOCASE, nombre COLLATE NOCASE`,
            [texto, patron]
        );

        const totales = Eco.DB.consultar(
            `SELECT unidad_medida,
                    ROUND(SUM(existencia), 2) AS total,
                    COUNT(*) AS materiales
             FROM vista_existencias
             GROUP BY unidad_medida`
        );
        const mapa = {};
        totales.forEach((fila) => {
            mapa[fila.unidad_medida] = fila;
        });
        const unidades = [
            { clave: 'kg', nombre: 'Kilogramos' },
            { clave: 'unidades', nombre: 'Unidades' },
            { clave: 'litros', nombre: 'Litros' }
        ];
        document.getElementById('inventario-unidades').innerHTML = unidades.map((unidad) => {
            const datos = mapa[unidad.clave] || { total: 0, materiales: 0 };
            return `
                <div class="unidad-resumen">
                    <span class="unidad-resumen-icono"><svg class="icono" aria-hidden="true"><use href="#i-almacen"></use></svg></span>
                    <div>
                        <span class="unidad-resumen-etiqueta">${unidad.nombre}</span>
                        <strong>${Eco.Util.formatearCantidad(datos.total, unidad.clave)} <small>${unidad.clave}</small></strong>
                        <p>${Eco.Util.formatearNumero(datos.materiales)} ${Number(datos.materiales) === 1 ? 'material' : 'materiales'}</p>
                    </div>
                </div>
            `;
        }).join('');

        const cuerpo = document.getElementById('tabla-inventario-body');
        const vacio = document.getElementById('inventario-vacio');
        const contenedor = cuerpo.closest('.tabla-contenedor');
        cuerpo.innerHTML = filas.map((fila) => {
            const existencia = Number(fila.existencia) || 0;
            const disponible = existencia > 0;
            return `
                <tr>
                    <td>
                        <div class="celda-material">
                            <span class="avatar-material" aria-hidden="true">${Eco.Util.escaparHtml(String(fila.nombre).charAt(0).toUpperCase())}</span>
                            <div class="celda-material-texto"><strong>${Eco.Util.escaparHtml(fila.nombre)}</strong></div>
                        </div>
                    </td>
                    <td><span class="insignia" data-cat="${Eco.Util.escaparHtml(fila.categoria)}">${Eco.Util.escaparHtml(fila.categoria)}</span></td>
                    <td class="texto-derecha">
                        <strong class="cantidad-tabla">${Eco.Util.formatearCantidad(existencia, fila.unidad_medida)}</strong>
                        <span class="unidad-sufijo">${Eco.Util.escaparHtml(fila.unidad_medida)}</span>
                    </td>
                    <td><span class="texto-unidad">${Eco.Util.escaparHtml(fila.unidad_medida)}</span></td>
                    <td>
                        <span class="estado-stock ${disponible ? 'disponible' : 'agotado'}">
                            <span class="punto"></span>
                            ${disponible ? 'Disponible' : 'Agotado'}
                        </span>
                    </td>
                    <td class="texto-derecha">
                        <button type="button" class="boton boton-salida boton-pequeno" data-accion="salida" data-id="${fila.id_material}" ${disponible ? '' : 'disabled'} title="${disponible ? 'Registrar salida de inventario' : 'Sin existencias disponibles'}">
                            <svg class="icono" aria-hidden="true"><use href="#i-flecha-arriba"></use></svg>
                            Salida
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        const hayFilas = filas.length > 0;
        contenedor.hidden = !hayFilas;
        vacio.hidden = hayFilas;
        document.getElementById('conteo-inventario').textContent =
            `${filas.length} ${filas.length === 1 ? 'material' : 'materiales'}`;
    }

    function abrirSalida(idMaterial) {
        const materiales = Eco.DB.contar(
            'SELECT COUNT(*) AS total FROM vista_existencias WHERE existencia > 0'
        );
        if (materiales === 0) {
            Eco.Util.mostrarAviso('No hay existencias disponibles para registrar una salida.', 'error');
            return;
        }

        document.getElementById('form-salida').reset();
        Eco.Util.limpiarErroresCampos(CAMPOS_SALIDA);
        document.getElementById('salida-fecha').value = Eco.Util.fechaHoyIso();
        document.getElementById('salida-unidad').value = '';
        document.getElementById('salida-disponible').textContent =
            'Selecciona un material para ver su disponibilidad.';
        document.getElementById('salida-cantidad').removeAttribute('max');
        document.getElementById('salida-cantidad').step = '0.01';

        Eco.Catalogos.cargarMateriales('salida-material', true, idMaterial || null);
        Eco.Catalogos.cargarResponsables('salida-responsable');

        Eco.App.abrirModal('modal-salida');
        actualizarMaterialSeleccionado();
        window.setTimeout(() => {
            const select = document.getElementById('salida-material');
            if (!select.value) select.focus();
            else document.getElementById('salida-cantidad').focus();
        }, 80);
    }

    function actualizarMaterialSeleccionado() {
        const select = document.getElementById('salida-material');
        const opcion = select.options[select.selectedIndex];
        const unidad = opcion ? opcion.dataset.unidad || '' : '';
        const existencia = opcion ? Number(opcion.dataset.existencia || 0) : 0;
        const campoUnidad = document.getElementById('salida-unidad');
        const ayuda = document.getElementById('salida-disponible');
        const cantidad = document.getElementById('salida-cantidad');

        campoUnidad.value = unidad;
        if (!select.value) {
            ayuda.textContent = 'Selecciona un material para ver su disponibilidad.';
            cantidad.removeAttribute('max');
            cantidad.step = '0.01';
            return;
        }

        ayuda.textContent = `Disponible: ${Eco.Util.formatearCantidad(existencia, unidad)} ${unidad}.`;
        cantidad.max = String(existencia);
        cantidad.step = unidad === 'unidades' ? '1' : '0.01';
        Eco.Util.limpiarErrorCampo('salida-material');
    }

    function validarFormulario() {
        Eco.Util.limpiarErroresCampos(CAMPOS_SALIDA);
        const idMaterial = Number(document.getElementById('salida-material').value);
        const idUsuario = Number(document.getElementById('salida-responsable').value);
        const cantidad = Eco.Util.normalizarCantidad(document.getElementById('salida-cantidad').value);
        const fecha = document.getElementById('salida-fecha').value;
        const observaciones = document.getElementById('salida-observaciones').value.trim();
        let valido = true;

        const material = idMaterial
            ? Eco.DB.consultarUno(
                'SELECT id_material, nombre, unidad_medida, existencia FROM vista_existencias WHERE id_material = ?',
                [idMaterial]
            )
            : null;
        if (!material) {
            Eco.Util.mostrarErrorCampo('salida-material', 'Selecciona un material válido.');
            valido = false;
        }

        const usuario = idUsuario
            ? Eco.DB.consultarUno('SELECT id_usuario FROM usuarios WHERE id_usuario = ?', [idUsuario])
            : null;
        if (!usuario) {
            Eco.Util.mostrarErrorCampo('salida-responsable', 'Selecciona un responsable válido.');
            valido = false;
        }

        if (cantidad === null || cantidad <= 0) {
            Eco.Util.mostrarErrorCampo('salida-cantidad', 'La cantidad debe ser mayor que cero.');
            valido = false;
        } else if (material && material.unidad_medida === 'unidades' && !Number.isInteger(cantidad)) {
            Eco.Util.mostrarErrorCampo(
                'salida-cantidad',
                'Para materiales en unidades, la cantidad debe ser un número entero.'
            );
            valido = false;
        } else if (material && cantidad > Number(material.existencia)) {
            Eco.Util.mostrarErrorCampo(
                'salida-cantidad',
                `No puedes retirar más de ${Eco.Util.formatearCantidad(material.existencia, material.unidad_medida)} ${material.unidad_medida}.`
            );
            valido = false;
        }

        if (!Eco.Util.validarFechaIso(fecha)) {
            Eco.Util.mostrarErrorCampo('salida-fecha', 'Selecciona una fecha válida.');
            valido = false;
        } else if (fecha > Eco.Util.fechaHoyIso()) {
            Eco.Util.mostrarErrorCampo('salida-fecha', 'La fecha no puede ser posterior a hoy.');
            valido = false;
        }

        if (!observaciones) {
            Eco.Util.mostrarErrorCampo('salida-observaciones', 'Indica el motivo o destino de la salida.');
            valido = false;
        } else if (observaciones.length > 300) {
            Eco.Util.mostrarErrorCampo('salida-observaciones', 'Las observaciones no pueden superar 300 caracteres.');
            valido = false;
        }

        if (!valido) return null;
        return {
            idMaterial,
            idUsuario,
            cantidad: Eco.Util.redondear(cantidad, material.unidad_medida === 'unidades' ? 0 : 2),
            unidad: material.unidad_medida,
            fecha,
            observaciones,
            nombreMaterial: material.nombre
        };
    }

    async function guardar(evento) {
        evento.preventDefault();
        if (guardando) return;
        const datos = validarFormulario();
        if (!datos) return;

        const boton = document.getElementById('btn-guardar-salida');
        guardando = true;
        boton.disabled = true;
        try {
            await Eco.Nube.rpc('registrar_salida', {
                p_id_material: datos.idMaterial,
                p_id_responsable: datos.idUsuario,
                p_cantidad: datos.cantidad,
                p_fecha: datos.fecha,
                p_observaciones: datos.observaciones
            });

            Eco.App.cerrarModal('modal-salida');
            await Eco.App.despuesDeCambio(
                `Salida de ${Eco.Util.formatearCantidad(datos.cantidad, datos.unidad)} ${datos.unidad} de ${datos.nombreMaterial} registrada.`
            );
        } catch (error) {
            Eco.Util.mostrarAviso(
                Eco.Util.mensajeError(error, 'No se pudo registrar la salida.'),
                'error'
            );
        } finally {
            guardando = false;
            boton.disabled = false;
        }
    }

    function init() {
        document.getElementById('form-salida').addEventListener('submit', guardar);
        document.getElementById('salida-material').addEventListener('change', actualizarMaterialSeleccionado);
        document.getElementById('filtro-inventario').addEventListener(
            'input',
            Eco.Util.debounce(render, 160)
        );
        document.getElementById('tabla-inventario-body').addEventListener('click', (evento) => {
            const boton = evento.target.closest('button[data-accion="salida"]');
            if (!boton || boton.disabled) return;
            abrirSalida(Number(boton.dataset.id));
        });

        CAMPOS_SALIDA.forEach((idCampo) => {
            const campo = document.getElementById(idCampo);
            campo.addEventListener('input', () => Eco.Util.limpiarErrorCampo(idCampo));
            campo.addEventListener('change', () => Eco.Util.limpiarErrorCampo(idCampo));
        });
    }

    Eco.Inventario = {
        init,
        render,
        abrirSalida
    };
})();
