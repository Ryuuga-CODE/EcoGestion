/* ============================================================
   EcoGestión · Módulo de materiales
   CRUD del catálogo, búsqueda, filtro y validaciones.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const CAMPOS_MATERIAL = [
        'material-nombre',
        'material-categoria',
        'material-unidad',
        'material-descripcion'
    ];

    let materialEditando = null;
    let guardando = false;

    function resumir(texto, limite) {
        const valor = String(texto || '').trim();
        if (!valor) return 'Sin descripción';
        return valor.length > limite ? `${valor.slice(0, limite - 1)}…` : valor;
    }

    function inicial(nombre) {
        return String(nombre || '?').trim().charAt(0).toUpperCase();
    }

    function render() {
        const texto = document.getElementById('filtro-material').value.trim();
        const categoria = document.getElementById('filtro-categoria-material').value;
        const patron = `%${texto}%`;
        const filas = Eco.DB.consultar(
            `SELECT id_material, nombre, categoria, unidad_medida, descripcion, existencia
             FROM vista_existencias
             WHERE (? = '' OR nombre LIKE ? COLLATE NOCASE)
               AND (? = '' OR categoria = ?)
             ORDER BY nombre COLLATE NOCASE`,
            [texto, patron, categoria, categoria]
        );

        const cuerpo = document.getElementById('tabla-materiales-body');
        const vacio = document.getElementById('materiales-vacio');
        const contenedor = cuerpo.closest('.tabla-contenedor');
        const contador = document.getElementById('conteo-materiales');

        cuerpo.innerHTML = filas.map((fila) => {
            const nombre = Eco.Util.escaparHtml(fila.nombre);
            const descripcion = Eco.Util.escaparHtml(resumir(fila.descripcion, 58));
            return `
                <tr>
                    <td>
                        <div class="celda-material">
                            <span class="avatar-material" aria-hidden="true">${Eco.Util.escaparHtml(inicial(fila.nombre))}</span>
                            <div class="celda-material-texto">
                                <strong>${nombre}</strong>
                                <small title="${Eco.Util.escaparHtml(fila.descripcion || '')}">${descripcion}</small>
                            </div>
                        </div>
                    </td>
                    <td><span class="insignia" data-cat="${Eco.Util.escaparHtml(fila.categoria)}">${Eco.Util.escaparHtml(fila.categoria)}</span></td>
                    <td><span class="texto-unidad">${Eco.Util.escaparHtml(fila.unidad_medida)}</span></td>
                    <td class="texto-derecha">
                        <strong class="cantidad-tabla">${Eco.Util.formatearCantidad(fila.existencia, fila.unidad_medida)}</strong>
                        <span class="unidad-sufijo">${Eco.Util.escaparHtml(fila.unidad_medida)}</span>
                    </td>
                    <td class="texto-derecha">
                        <div class="acciones-tabla">
                            <button type="button" class="boton-icono" data-accion="editar" data-id="${fila.id_material}" title="Editar material" aria-label="Editar ${nombre}">
                                <svg class="icono" aria-hidden="true"><use href="#i-editar"></use></svg>
                            </button>
                            <button type="button" class="boton-icono boton-icono-peligro" data-accion="eliminar" data-id="${fila.id_material}" title="Eliminar material" aria-label="Eliminar ${nombre}">
                                <svg class="icono" aria-hidden="true"><use href="#i-eliminar"></use></svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        const hayFilas = filas.length > 0;
        contenedor.hidden = !hayFilas;
        vacio.hidden = hayFilas;
        contador.textContent = `${filas.length} ${filas.length === 1 ? 'material' : 'materiales'}`;
    }

    function limpiarFormulario() {
        document.getElementById('form-material').reset();
        document.getElementById('material-id').value = '';
        Eco.Util.limpiarErroresCampos(CAMPOS_MATERIAL);
        const unidad = document.getElementById('material-unidad');
        unidad.disabled = false;
        document.getElementById('nota-unidad-material').hidden = true;
    }

    function abrirNuevo() {
        materialEditando = null;
        limpiarFormulario();
        document.getElementById('titulo-modal-material').textContent = 'Nuevo material';
        document.getElementById('btn-guardar-material').innerHTML =
            '<svg class="icono" aria-hidden="true"><use href="#i-check"></use></svg> Guardar material';
        Eco.App.abrirModal('modal-material');
        window.setTimeout(() => document.getElementById('material-nombre').focus(), 80);
    }

    function abrirEditar(id) {
        const fila = Eco.DB.consultarUno(
            'SELECT * FROM vista_existencias WHERE id_material = ?',
            [id]
        );
        if (!fila) {
            Eco.Util.mostrarAviso('El material ya no existe.', 'error');
            return;
        }

        materialEditando = fila.id_material;
        document.getElementById('form-material').reset();
        Eco.Util.limpiarErroresCampos(CAMPOS_MATERIAL);
        document.getElementById('material-id').value = fila.id_material;
        document.getElementById('material-nombre').value = fila.nombre;
        document.getElementById('material-categoria').value = fila.categoria;
        document.getElementById('material-unidad').value = fila.unidad_medida;
        document.getElementById('material-descripcion').value = fila.descripcion || '';

        const movimientos = Eco.DB.contar(
            'SELECT COUNT(*) AS total FROM movimientos WHERE id_material = ?',
            [id]
        );
        const unidad = document.getElementById('material-unidad');
        unidad.disabled = movimientos > 0;
        document.getElementById('nota-unidad-material').hidden = movimientos === 0;
        document.getElementById('titulo-modal-material').textContent = 'Editar material';
        document.getElementById('btn-guardar-material').innerHTML =
            '<svg class="icono" aria-hidden="true"><use href="#i-check"></use></svg> Guardar cambios';

        Eco.App.abrirModal('modal-material');
        window.setTimeout(() => document.getElementById('material-nombre').focus(), 80);
    }

    function validarFormulario() {
        Eco.Util.limpiarErroresCampos(CAMPOS_MATERIAL);
        const nombre = document.getElementById('material-nombre').value.trim().replace(/\s+/g, ' ');
        const categoria = document.getElementById('material-categoria').value;
        const unidad = document.getElementById('material-unidad').value;
        const descripcion = document.getElementById('material-descripcion').value.trim();
        const categorias = ['Plástico', 'Papel y cartón', 'Vidrio', 'Metal', 'Otros'];
        const unidades = ['kg', 'unidades', 'litros'];
        let valido = true;

        if (nombre.length < 2 || nombre.length > 80) {
            Eco.Util.mostrarErrorCampo('material-nombre', 'El nombre debe tener entre 2 y 80 caracteres.');
            valido = false;
        } else {
            const duplicado = Eco.DB.consultarUno(
                'SELECT id_material FROM materiales WHERE nombre = ? COLLATE NOCASE AND id_material <> ?',
                [nombre, materialEditando || 0]
            );
            if (duplicado) {
                Eco.Util.mostrarErrorCampo('material-nombre', 'Ya existe un material con este nombre.');
                valido = false;
            }
        }

        if (!categorias.includes(categoria)) {
            Eco.Util.mostrarErrorCampo('material-categoria', 'Selecciona una categoría válida.');
            valido = false;
        }

        if (!unidades.includes(unidad)) {
            Eco.Util.mostrarErrorCampo('material-unidad', 'Selecciona una unidad de medida válida.');
            valido = false;
        } else if (materialEditando) {
            const original = Eco.DB.consultarUno(
                'SELECT unidad_medida FROM materiales WHERE id_material = ?',
                [materialEditando]
            );
            const movimientos = Eco.DB.contar(
                'SELECT COUNT(*) AS total FROM movimientos WHERE id_material = ?',
                [materialEditando]
            );
            if (original && original.unidad_medida !== unidad && movimientos > 0) {
                Eco.Util.mostrarErrorCampo(
                    'material-unidad',
                    'No puedes cambiar la unidad porque el material ya tiene movimientos.'
                );
                valido = false;
            }
        }

        if (descripcion.length > 300) {
            Eco.Util.mostrarErrorCampo('material-descripcion', 'La descripción no puede superar 300 caracteres.');
            valido = false;
        }

        if (!valido) return null;
        return { nombre, categoria, unidad, descripcion: descripcion || null };
    }

    async function guardar(evento) {
        evento.preventDefault();
        if (guardando) return;
        const datos = validarFormulario();
        if (!datos) return;

        const boton = document.getElementById('btn-guardar-material');
        guardando = true;
        boton.disabled = true;
        try {
            if (materialEditando) {
                Eco.DB.ejecutar(
                    `UPDATE materiales
                     SET nombre = ?, categoria = ?, unidad_medida = ?, descripcion = ?
                     WHERE id_material = ?`,
                    [datos.nombre, datos.categoria, datos.unidad, datos.descripcion, materialEditando]
                );
            } else {
                Eco.DB.ejecutar(
                    `INSERT INTO materiales (nombre, categoria, unidad_medida, descripcion)
                     VALUES (?, ?, ?, ?)`,
                    [datos.nombre, datos.categoria, datos.unidad, datos.descripcion]
                );
            }
            materialEditando = null;
            Eco.App.cerrarModal('modal-material');
            await Eco.App.despuesDeCambio(
                datos.nombre + (document.getElementById('material-id').value ? ' actualizado.' : ' registrado.')
            );
        } catch (error) {
            Eco.Util.mostrarAviso(
                Eco.Util.mensajeError(error, 'No se pudo guardar el material.'),
                'error'
            );
        } finally {
            guardando = false;
            boton.disabled = false;
        }
    }

    async function eliminar(id) {
        const fila = Eco.DB.consultarUno(
            'SELECT nombre FROM vista_existencias WHERE id_material = ?',
            [id]
        );
        if (!fila) {
            Eco.Util.mostrarAviso('El material ya no existe.', 'error');
            return;
        }

        const movimientos = Eco.DB.contar(
            'SELECT COUNT(*) AS total FROM movimientos WHERE id_material = ?',
            [id]
        );
        const recolecciones = Eco.DB.contar(
            'SELECT COUNT(*) AS total FROM recolecciones WHERE id_material = ?',
            [id]
        );

        if (movimientos > 0 || recolecciones > 0) {
            Eco.Util.mostrarAviso(
                `No se puede eliminar “${fila.nombre}” porque tiene movimientos asociados. ` +
                'Conserva el historial del inventario.',
                'error'
            );
            return;
        }

        const confirmado = await Eco.App.confirmar({
            titulo: 'Eliminar material',
            mensaje: `¿Deseas eliminar “${fila.nombre}” del catálogo? Esta acción no se puede deshacer.`,
            textoConfirmar: 'Eliminar',
            peligro: true
        });
        if (!confirmado) return;

        try {
            Eco.DB.ejecutar('DELETE FROM materiales WHERE id_material = ?', [id]);
            await Eco.App.despuesDeCambio('Material eliminado del catálogo.');
        } catch (error) {
            Eco.Util.mostrarAviso(
                Eco.Util.mensajeError(error, 'No se pudo eliminar el material.'),
                'error'
            );
        }
    }

    function init() {
        document.getElementById('btn-nuevo-material').addEventListener('click', abrirNuevo);
        document.getElementById('form-material').addEventListener('submit', guardar);
        document.getElementById('filtro-categoria-material').addEventListener('change', render);
        document.getElementById('filtro-material').addEventListener(
            'input',
            Eco.Util.debounce(render, 160)
        );

        document.getElementById('tabla-materiales-body').addEventListener('click', (evento) => {
            const boton = evento.target.closest('button[data-accion]');
            if (!boton) return;
            const id = Number(boton.dataset.id);
            if (boton.dataset.accion === 'editar') abrirEditar(id);
            if (boton.dataset.accion === 'eliminar') eliminar(id);
        });

        CAMPOS_MATERIAL.forEach((idCampo) => {
            const campo = document.getElementById(idCampo);
            campo.addEventListener('input', () => Eco.Util.limpiarErrorCampo(idCampo));
            campo.addEventListener('change', () => Eco.Util.limpiarErrorCampo(idCampo));
        });
    }

    Eco.Materiales = {
        init,
        render,
        abrirNuevo,
        abrirEditar
    };
})();
