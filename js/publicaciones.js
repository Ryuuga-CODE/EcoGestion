/* ============================================================
   EcoGestión · Publicaciones del vendedor
   Crear, editar, retirar, reactivar y eliminar publicaciones
   propias, con hasta 3 fotografías (Supabase Storage).
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const esc = (valor) => Eco.Util.escaparHtml(valor);
    const MU = () => Eco.MercadoUtil;

    const MAX_FOTOS = 3;
    const MAX_BYTES_ORIGINAL = 10 * 1024 * 1024;
    const LADO_MAXIMO = 900;
    const CAMPOS = ['publicacion-tipo', 'publicacion-nombre', 'publicacion-cantidad', 'publicacion-unidad',
        'publicacion-precio', 'publicacion-ubicacion', 'publicacion-descripcion', 'publicacion-fotos'];

    let editando = null;     // id de la publicación en edición
    let fotos = [];          // data URLs de las fotos del formulario
    let guardando = false;

    /* ---------------------------- Datos ---------------------------- */
    function propias(idVendedor) {
        return Eco.DB.consultar(
            `SELECT pb.*,
                    (SELECT imagen FROM fotos_publicacion f WHERE f.id_publicacion = pb.id_publicacion
                      ORDER BY orden LIMIT 1) AS portada,
                    (SELECT COUNT(*) FROM ofertas o WHERE o.id_publicacion = pb.id_publicacion) AS total_ofertas,
                    (SELECT COUNT(*) FROM ofertas o WHERE o.id_publicacion = pb.id_publicacion
                      AND o.estado = 'Pendiente') AS pendientes
             FROM publicaciones pb
             WHERE pb.id_vendedor = ?
             ORDER BY CASE pb.estado WHEN 'Activa' THEN 1 WHEN 'Agotada' THEN 2 ELSE 3 END,
                      pb.fecha_publicacion DESC`,
            [idVendedor]
        );
    }

    function obtenerPropia(id) {
        const usuario = Eco.Sesion.usuarioActual();
        return Eco.DB.consultarUno(
            `SELECT pb.*, (SELECT COUNT(*) FROM ofertas o WHERE o.id_publicacion = pb.id_publicacion) AS total_ofertas
             FROM publicaciones pb WHERE pb.id_publicacion = ? AND pb.id_vendedor = ?`,
            [id, usuario ? usuario.id_usuario : -1]
        );
    }

    /* ---------------------------- Vista ---------------------------- */
    function render() {
        if (!Eco.Sesion.puedeVerVista('publicaciones')) return;
        const usuario = Eco.Sesion.usuarioActual();
        const lista = propias(usuario.id_usuario);

        const resumen = Eco.DB.consultarUno(
            `SELECT
                (SELECT COUNT(*) FROM publicaciones WHERE id_vendedor = ? AND estado = 'Activa') AS activas,
                (SELECT COUNT(*) FROM ofertas o JOIN publicaciones p ON p.id_publicacion = o.id_publicacion
                  WHERE p.id_vendedor = ? AND o.estado = 'Pendiente') AS pendientes,
                (SELECT COUNT(*) FROM transacciones t JOIN ofertas o ON o.id_oferta = t.id_oferta
                  JOIN publicaciones p ON p.id_publicacion = o.id_publicacion
                  WHERE p.id_vendedor = ? AND t.estado = 'Completada') AS ventas,
                (SELECT COALESCE(SUM(o.cantidad * o.precio_unitario), 0) FROM transacciones t
                  JOIN ofertas o ON o.id_oferta = t.id_oferta
                  JOIN publicaciones p ON p.id_publicacion = o.id_publicacion
                  WHERE p.id_vendedor = ? AND t.estado = 'Completada') AS ingresos`,
            [usuario.id_usuario, usuario.id_usuario, usuario.id_usuario, usuario.id_usuario]
        );
        document.getElementById('pub-activas').textContent = Eco.Util.formatearNumero(resumen.activas);
        document.getElementById('pub-pendientes').textContent = Eco.Util.formatearNumero(resumen.pendientes);
        document.getElementById('pub-ventas').textContent = Eco.Util.formatearNumero(resumen.ventas);
        document.getElementById('pub-ingresos').textContent = MU().dinero(resumen.ingresos);

        document.getElementById('tabla-publicaciones-body').innerHTML = lista.map((pb) => {
            const acciones = [];
            acciones.push(`<button type="button" class="boton-icono" data-accion="editar" data-id="${pb.id_publicacion}" title="Editar publicación" aria-label="Editar ${esc(pb.nombre_material)}">
                <svg class="icono" aria-hidden="true"><use href="#i-editar"></use></svg></button>`);
            if (pb.estado === 'Retirada') {
                acciones.push(`<button type="button" class="boton boton-secundario boton-pequeno" data-accion="reactivar" data-id="${pb.id_publicacion}">Reactivar</button>`);
            } else {
                acciones.push(`<button type="button" class="boton boton-secundario boton-pequeno" data-accion="retirar" data-id="${pb.id_publicacion}">Retirar</button>`);
            }
            if (!pb.total_ofertas) {
                acciones.push(`<button type="button" class="boton-icono boton-icono-peligro" data-accion="eliminar" data-id="${pb.id_publicacion}" title="Eliminar publicación" aria-label="Eliminar ${esc(pb.nombre_material)}">
                    <svg class="icono" aria-hidden="true"><use href="#i-eliminar"></use></svg></button>`);
            }
            return `
                <tr>
                    <td>
                        <div class="celda-publicacion">
                            ${MU().portada(pb.portada, pb.tipo_residuo, 'foto-mini')}
                            <div>
                                <strong>${esc(pb.nombre_material)}</strong>
                                <small>${esc(pb.ubicacion)}</small>
                            </div>
                        </div>
                    </td>
                    <td>${MU().insigniaTipo(pb.tipo_residuo)}</td>
                    <td class="texto-derecha"><strong class="cantidad-tabla">${esc(Eco.Util.formatearCantidad(pb.cantidad_disponible, pb.unidad))}</strong> <span class="unidad-sufijo">${esc(pb.unidad)}</span></td>
                    <td class="texto-derecha">${esc(MU().precio(pb.precio_unitario, pb.unidad))}</td>
                    <td>${MU().estado(pb.estado)}</td>
                    <td class="texto-derecha">${pb.pendientes ? `<span class="insignia insignia-alerta">${pb.pendientes} pendiente${pb.pendientes === 1 ? '' : 's'}</span>` : `<span class="texto-tenue">${pb.total_ofertas}</span>`}</td>
                    <td class="texto-derecha"><div class="acciones-tabla">${acciones.join('')}</div></td>
                </tr>`;
        }).join('');
        document.getElementById('publicaciones-vacio').hidden = lista.length > 0;
        document.getElementById('tabla-publicaciones-body').closest('.tabla-contenedor').hidden = lista.length === 0;
    }

    /* --------------------------- Fotografías --------------------------- */
    function leerComoDataUrl(archivo) {
        return new Promise((resolver, rechazar) => {
            const lector = new FileReader();
            lector.onload = () => resolver(lector.result);
            lector.onerror = () => rechazar(new Error('No se pudo leer la imagen.'));
            lector.readAsDataURL(archivo);
        });
    }

    function cargarImagen(url) {
        return new Promise((resolver, rechazar) => {
            const imagen = new Image();
            imagen.onload = () => resolver(imagen);
            imagen.onerror = () => rechazar(new Error('El archivo no es una imagen válida.'));
            imagen.src = url;
        });
    }

    /** Reduce la foto (máx. 900 px) y la convierte a JPEG para no inflar la base. */
    async function prepararFoto(archivo) {
        if (!/^image\/(jpeg|png|webp|gif)$/.test(archivo.type)) {
            throw new Error(`"${archivo.name}" no es una imagen JPG, PNG, WEBP o GIF.`);
        }
        if (archivo.size > MAX_BYTES_ORIGINAL) {
            throw new Error(`"${archivo.name}" supera 10 MB.`);
        }
        const imagen = await cargarImagen(await leerComoDataUrl(archivo));
        const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.max(1, Math.round(imagen.width * escala));
        lienzo.height = Math.max(1, Math.round(imagen.height * escala));
        const contexto = lienzo.getContext('2d');
        contexto.fillStyle = '#ffffff';
        contexto.fillRect(0, 0, lienzo.width, lienzo.height);
        contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
        return lienzo.toDataURL('image/jpeg', 0.78);
    }

    function pintarFotos() {
        const contenedor = document.getElementById('publicacion-fotos-lista');
        contenedor.innerHTML = fotos.map((foto, i) => `
            <div class="foto-previa">
                <img src="${esc(foto)}" alt="Foto ${i + 1}">
                <button type="button" class="foto-quitar" data-indice="${i}" aria-label="Quitar foto ${i + 1}">
                    <svg class="icono" aria-hidden="true"><use href="#i-cerrar"></use></svg>
                </button>
                ${i === 0 ? '<span class="foto-portada">Portada</span>' : ''}
            </div>`).join('');
        document.getElementById('publicacion-fotos-agregar').hidden = fotos.length >= MAX_FOTOS;
        document.getElementById('publicacion-fotos-contador').textContent = `${fotos.length} de ${MAX_FOTOS} fotos`;
    }

    async function agregarFotos(evento) {
        const archivos = Array.from(evento.target.files || []);
        evento.target.value = '';
        Eco.Util.limpiarErrorCampo('publicacion-fotos');
        const espacio = MAX_FOTOS - fotos.length;
        if (archivos.length > espacio) {
            Eco.Util.mostrarErrorCampo('publicacion-fotos', `Puedes agregar hasta ${MAX_FOTOS} fotos. Se tomaron las primeras ${espacio}.`);
        }
        for (const archivo of archivos.slice(0, espacio)) {
            try {
                fotos.push(await prepararFoto(archivo));
            } catch (error) {
                Eco.Util.mostrarErrorCampo('publicacion-fotos', error.message);
            }
        }
        pintarFotos();
    }

    /* --------------------------- Formulario --------------------------- */
    function abrirNueva() {
        let usuario;
        try {
            usuario = Eco.Sesion.exigir('publicaciones.gestionar');
        } catch (error) {
            Eco.Util.mostrarAviso(error.message, 'error');
            return;
        }
        editando = null;
        fotos = [];
        document.getElementById('form-publicacion').reset();
        Eco.Util.limpiarErroresCampos(CAMPOS);
        document.getElementById('titulo-modal-publicacion').textContent = 'Publicar material';
        document.getElementById('publicacion-ubicacion').value = usuario.ubicacion || '';
        document.getElementById('publicacion-unidad').disabled = false;
        document.getElementById('nota-unidad-publicacion').hidden = true;
        pintarFotos();
        Eco.App.abrirModal('modal-publicacion');
    }

    function abrirEdicion(id) {
        const pb = obtenerPropia(id);
        if (!pb) {
            Eco.Util.mostrarAviso('No se encontró la publicación.', 'error');
            return;
        }
        editando = id;
        fotos = MU().fotosDe(id);
        Eco.Util.limpiarErroresCampos(CAMPOS);
        document.getElementById('titulo-modal-publicacion').textContent = 'Editar publicación';
        document.getElementById('publicacion-tipo').value = pb.tipo_residuo;
        document.getElementById('publicacion-nombre').value = pb.nombre_material;
        document.getElementById('publicacion-cantidad').value = String(pb.cantidad_disponible);
        document.getElementById('publicacion-unidad').value = pb.unidad;
        document.getElementById('publicacion-precio').value = String(pb.precio_unitario);
        document.getElementById('publicacion-ubicacion').value = pb.ubicacion;
        document.getElementById('publicacion-descripcion').value = pb.descripcion || '';
        const bloquearUnidad = pb.total_ofertas > 0;
        document.getElementById('publicacion-unidad').disabled = bloquearUnidad;
        document.getElementById('nota-unidad-publicacion').hidden = !bloquearUnidad;
        pintarFotos();
        Eco.App.abrirModal('modal-publicacion');
    }

    function validar() {
        Eco.Util.limpiarErroresCampos(CAMPOS);
        const datos = {
            tipo: document.getElementById('publicacion-tipo').value,
            nombre: document.getElementById('publicacion-nombre').value.replace(/\s+/g, ' ').trim(),
            unidad: document.getElementById('publicacion-unidad').value,
            ubicacion: document.getElementById('publicacion-ubicacion').value.replace(/\s+/g, ' ').trim(),
            descripcion: document.getElementById('publicacion-descripcion').value.trim()
        };
        let valido = true;
        const error = (id, mensaje) => { Eco.Util.mostrarErrorCampo(id, mensaje); valido = false; };

        if (!MU().TIPOS.includes(datos.tipo)) error('publicacion-tipo', 'Selecciona el tipo de residuo.');
        if (datos.nombre.length < 2 || datos.nombre.length > 80) error('publicacion-nombre', 'El nombre debe tener entre 2 y 80 caracteres.');
        if (!['kg', 'unidades'].includes(datos.unidad)) error('publicacion-unidad', 'Selecciona kilogramos o unidades.');

        const textoCantidad = document.getElementById('publicacion-cantidad').value;
        const cantidad = Eco.Util.normalizarCantidad(textoCantidad);
        if (cantidad === null) error('publicacion-cantidad', 'Escribe la cantidad disponible.');
        else if (cantidad < 0) error('publicacion-cantidad', 'La cantidad no puede ser negativa.');
        else if (!editando && cantidad <= 0) error('publicacion-cantidad', 'La cantidad debe ser mayor que cero.');
        else if (datos.unidad === 'unidades' && !Number.isInteger(cantidad)) error('publicacion-cantidad', 'Para unidades, la cantidad debe ser un número entero.');
        else if (cantidad > 10000000) error('publicacion-cantidad', 'La cantidad es demasiado grande.');
        datos.cantidad = cantidad === null ? null : Eco.Util.redondear(cantidad, 2);

        const precio = MU().leerPrecio(document.getElementById('publicacion-precio').value);
        if (precio.error) error('publicacion-precio', precio.error);
        datos.precio = precio.valor;

        if (datos.ubicacion.length < 2 || datos.ubicacion.length > 120) error('publicacion-ubicacion', 'Indica la ciudad y el barrio donde está el material.');
        if (datos.descripcion.length > 400) error('publicacion-descripcion', 'La descripción no puede superar 400 caracteres.');
        return valido ? datos : null;
    }

    async function guardar(evento) {
        evento.preventDefault();
        if (guardando) return;
        let usuario;
        try {
            usuario = Eco.Sesion.exigir('publicaciones.gestionar');
        } catch (error) {
            Eco.Util.mostrarAviso(error.message, 'error');
            return;
        }
        const datos = validar();
        if (!datos) return;

        guardando = true;
        document.getElementById('btn-guardar-publicacion').disabled = true;
        try {
            if (editando && !obtenerPropia(editando)) throw new Error('No se encontró la publicación.');
            // 1) Las fotos nuevas se suben a Supabase Storage; las existentes ya son URL.
            const boton = document.getElementById('btn-guardar-publicacion');
            const urls = [];
            for (let i = 0; i < fotos.length; i += 1) {
                if (fotos[i].startsWith('data:')) {
                    boton.textContent = `Subiendo foto ${i + 1} de ${fotos.length}…`;
                    urls.push(await Eco.Nube.subirFoto(fotos[i]));
                } else {
                    urls.push(fotos[i]);
                }
            }
            boton.textContent = 'Guardando…';
            // 2) Publicación y fotos se guardan juntas en una transacción del servidor.
            await Eco.Nube.rpc('guardar_publicacion', {
                p_id: editando || null,
                p_tipo: datos.tipo,
                p_nombre: datos.nombre,
                p_descripcion: datos.descripcion || null,
                p_cantidad: datos.cantidad,
                p_unidad: datos.unidad,
                p_precio: datos.precio,
                p_ubicacion: datos.ubicacion,
                p_fotos: urls
            });
            const mensaje = editando ? 'Publicación actualizada.' : 'Material publicado en el mercado.';
            editando = null;
            fotos = [];
            Eco.App.cerrarModal('modal-publicacion');
            await Eco.App.despuesDeCambio(mensaje);
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo guardar la publicación.'), 'error');
        } finally {
            guardando = false;
            const boton = document.getElementById('btn-guardar-publicacion');
            boton.disabled = false;
            boton.innerHTML = '<svg class="icono" aria-hidden="true"><use href="#i-check"></use></svg> Guardar publicación';
        }
    }

    /* ----------------------------- Acciones ----------------------------- */
    async function retirar(id) {
        const pb = obtenerPropia(id);
        if (!pb) return;
        const pendientes = Eco.DB.contar(
            "SELECT COUNT(*) AS total FROM ofertas WHERE id_publicacion = ? AND estado = 'Pendiente'", [id]);
        const confirmado = await Eco.App.confirmar({
            titulo: 'Retirar publicación',
            mensaje: `"${pb.nombre_material}" dejará de verse en el mercado.` +
                (pendientes ? ` Las ${pendientes} ofertas pendientes se marcarán como rechazadas.` : '') +
                ' Las negociaciones aceptadas no se modifican.',
            textoConfirmar: 'Retirar',
            peligro: true
        });
        if (!confirmado) return;
        try {
            // También rechaza en el servidor las ofertas pendientes de esta publicación
            await Eco.Nube.rpc('cambiar_estado_publicacion', { p_id: id, p_accion: 'retirar' });
            await Eco.App.despuesDeCambio('Publicación retirada del mercado.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo retirar la publicación.'), 'error');
        }
    }

    async function reactivar(id) {
        const pb = obtenerPropia(id);
        if (!pb) return;
        try {
            await Eco.Nube.rpc('cambiar_estado_publicacion', { p_id: id, p_accion: 'reactivar' });
            await Eco.App.despuesDeCambio(pb.cantidad_disponible > 0
                ? 'Publicación visible de nuevo en el mercado.'
                : 'Publicación reactivada como agotada. Edita la cantidad para volver a ofrecerla.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo reactivar la publicación.'), 'error');
        }
    }

    async function eliminar(id) {
        const pb = obtenerPropia(id);
        if (!pb) return;
        if (pb.total_ofertas > 0) {
            Eco.Util.mostrarAviso('No se puede eliminar: la publicación tiene ofertas asociadas. Puedes retirarla.', 'error');
            return;
        }
        const confirmado = await Eco.App.confirmar({
            titulo: 'Eliminar publicación',
            mensaje: `¿Eliminar "${pb.nombre_material}" y sus fotos? Esta acción no se puede deshacer.`,
            textoConfirmar: 'Eliminar',
            peligro: true
        });
        if (!confirmado) return;
        try {
            await Eco.Nube.rpc('eliminar_publicacion', { p_id: id });
            await Eco.App.despuesDeCambio('Publicación eliminada.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo eliminar la publicación.'), 'error');
        }
    }

    function init() {
        document.getElementById('btn-nueva-publicacion').addEventListener('click', abrirNueva);
        document.getElementById('form-publicacion').addEventListener('submit', guardar);
        document.getElementById('publicacion-fotos').addEventListener('change', agregarFotos);
        document.getElementById('publicacion-fotos-agregar').addEventListener('click', () => {
            document.getElementById('publicacion-fotos').click();
        });
        document.getElementById('publicacion-fotos-lista').addEventListener('click', (evento) => {
            const boton = evento.target.closest('.foto-quitar');
            if (!boton) return;
            fotos.splice(Number(boton.dataset.indice), 1);
            pintarFotos();
        });
        document.getElementById('tabla-publicaciones-body').addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-accion]');
            if (!boton) return;
            const id = Number(boton.dataset.id);
            const accion = boton.dataset.accion;
            if (accion === 'editar') abrirEdicion(id);
            if (accion === 'retirar') retirar(id);
            if (accion === 'reactivar') reactivar(id);
            if (accion === 'eliminar') eliminar(id);
        });
        CAMPOS.forEach((id) => {
            const campo = document.getElementById(id);
            campo.addEventListener('input', () => Eco.Util.limpiarErrorCampo(id));
            campo.addEventListener('change', () => Eco.Util.limpiarErrorCampo(id));
        });
    }

    Eco.Publicaciones = { init, render, abrirNueva };
})();
