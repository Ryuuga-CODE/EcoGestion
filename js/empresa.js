/* ============================================================
   EcoGestión · Panel empresarial (empresa recicladora)
   - Perfil empresarial y datos de contacto.
   - Necesidades de materiales (cantidades mínimas/máximas y precio).
   - Búsqueda de vendedores.
   - Resumen de compras (el detalle está en "Ofertas").
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const esc = (valor) => Eco.Util.escaparHtml(valor);
    const MU = () => Eco.MercadoUtil;

    const CAMPOS_EMPRESA = ['empresa-razon', 'empresa-nit', 'empresa-telefono', 'empresa-correo',
        'empresa-direccion', 'empresa-ciudad', 'empresa-descripcion'];
    const CAMPOS_NECESIDAD = ['necesidad-tipo', 'necesidad-descripcion', 'necesidad-minima',
        'necesidad-maxima', 'necesidad-unidad', 'necesidad-precio'];

    const filtrosVendedores = { tipo: '', ubicacion: '' };
    let necesidadEditando = null;

    function empresaActual() {
        const usuario = Eco.Sesion.usuarioActual();
        return usuario
            ? Eco.DB.consultarUno('SELECT * FROM empresas WHERE id_usuario = ?', [usuario.id_usuario])
            : null;
    }

    /* --------------------------- Perfil empresarial --------------------------- */
    function renderPerfil(empresa) {
        const formulario = document.getElementById('form-empresa');
        document.getElementById('empresa-aviso-sin-perfil').hidden = Boolean(empresa);
        document.getElementById('btn-guardar-empresa-texto').textContent = empresa ? 'Guardar cambios' : 'Crear perfil empresarial';
        if (formulario.contains(document.activeElement)) return;
        const usuario = Eco.Sesion.usuarioActual();
        const valores = {
            'empresa-razon': empresa ? empresa.razon_social : '',
            'empresa-nit': empresa ? empresa.nit : '',
            'empresa-telefono': empresa ? empresa.telefono : usuario.telefono,
            'empresa-correo': empresa ? empresa.correo_contacto : usuario.correo,
            'empresa-direccion': empresa ? empresa.direccion : '',
            'empresa-ciudad': empresa ? empresa.ciudad : usuario.ubicacion,
            'empresa-descripcion': empresa ? empresa.descripcion : ''
        };
        Object.entries(valores).forEach(([id, valor]) => {
            document.getElementById(id).value = valor || '';
        });
    }

    async function guardarPerfil(evento) {
        evento.preventDefault();
        let usuario;
        try {
            usuario = Eco.Sesion.exigir('empresa.gestionar');
        } catch (error) {
            Eco.Util.mostrarAviso(error.message, 'error');
            return;
        }
        Eco.Util.limpiarErroresCampos(CAMPOS_EMPRESA);
        const valor = (id) => document.getElementById(id).value.replace(/\s+/g, ' ').trim();
        const datos = {
            razon: valor('empresa-razon'),
            nit: valor('empresa-nit'),
            telefono: valor('empresa-telefono'),
            correo: valor('empresa-correo'),
            direccion: valor('empresa-direccion'),
            ciudad: valor('empresa-ciudad'),
            descripcion: document.getElementById('empresa-descripcion').value.trim()
        };
        let valido = true;
        const error = (id, mensaje) => { Eco.Util.mostrarErrorCampo(id, mensaje); valido = false; };
        if (datos.razon.length < 2 || datos.razon.length > 120) error('empresa-razon', 'Escribe el nombre de la empresa (entre 2 y 120 caracteres).');
        if (datos.nit && !/^[0-9.\-\s]{5,20}$/.test(datos.nit)) error('empresa-nit', 'El NIT solo puede tener números, puntos y guion.');
        if (datos.telefono && !/^[0-9+()\s-]{7,30}$/.test(datos.telefono)) error('empresa-telefono', 'Escribe un teléfono válido.');
        if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) error('empresa-correo', 'Escribe un correo válido.');
        if (datos.direccion.length > 150) error('empresa-direccion', 'La dirección no puede superar 150 caracteres.');
        if (!datos.ciudad || datos.ciudad.length > 80) error('empresa-ciudad', 'Indica la ciudad (máximo 80 caracteres).');
        if (datos.descripcion.length > 400) error('empresa-descripcion', 'La descripción no puede superar 400 caracteres.');
        if (!valido) return;

        const parametros = [datos.razon, datos.nit || null, datos.telefono || null, datos.correo || null,
            datos.direccion || null, datos.ciudad, datos.descripcion || null];
        try {
            if (empresaActual()) {
                Eco.DB.ejecutar(
                    `UPDATE empresas SET razon_social = ?, nit = ?, telefono = ?, correo_contacto = ?,
                         direccion = ?, ciudad = ?, descripcion = ? WHERE id_usuario = ?`,
                    [...parametros, usuario.id_usuario]);
            } else {
                Eco.DB.ejecutar(
                    `INSERT INTO empresas (razon_social, nit, telefono, correo_contacto, direccion, ciudad, descripcion, id_usuario)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [...parametros, usuario.id_usuario]);
            }
            document.activeElement.blur();
            await Eco.App.despuesDeCambio('Perfil empresarial guardado.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo guardar el perfil empresarial.'), 'error');
        }
    }

    /* ------------------------------ Necesidades ------------------------------ */
    function renderNecesidades(empresa) {
        const lista = empresa
            ? Eco.DB.consultar('SELECT * FROM necesidades_empresa WHERE id_empresa = ? ORDER BY estado, fecha_publicacion DESC', [empresa.id_empresa])
            : [];
        document.getElementById('btn-nueva-necesidad').disabled = !empresa;
        document.getElementById('tabla-necesidades-body').innerHTML = lista.map((n) => `
            <tr>
                <td>${MU().insigniaTipo(n.tipo_residuo)}${n.descripcion ? `<small class="bloque">${esc(n.descripcion)}</small>` : ''}</td>
                <td class="texto-derecha">${esc(Eco.Util.formatearCantidad(n.cantidad_minima, n.unidad))} – ${esc(MU().cantidad(n.cantidad_maxima, n.unidad))}</td>
                <td class="texto-derecha">${esc(MU().precio(n.precio_ofrecido, n.unidad))}</td>
                <td>${MU().estado(n.estado)}</td>
                <td class="texto-derecha"><div class="acciones-tabla">
                    <button type="button" class="boton-icono" data-accion="editar" data-id="${n.id_necesidad}" title="Editar necesidad" aria-label="Editar necesidad">
                        <svg class="icono" aria-hidden="true"><use href="#i-editar"></use></svg></button>
                    <button type="button" class="boton boton-secundario boton-pequeno" data-accion="estado" data-id="${n.id_necesidad}">
                        ${n.estado === 'Activa' ? 'Cerrar' : 'Reabrir'}</button>
                    <button type="button" class="boton-icono boton-icono-peligro" data-accion="eliminar" data-id="${n.id_necesidad}" title="Eliminar necesidad" aria-label="Eliminar necesidad">
                        <svg class="icono" aria-hidden="true"><use href="#i-eliminar"></use></svg></button>
                </div></td>
            </tr>`).join('');
        document.getElementById('necesidades-propias-vacio').hidden = lista.length > 0;
        document.getElementById('tabla-necesidades-body').closest('.tabla-contenedor').hidden = lista.length === 0;
    }

    function abrirNecesidad(id) {
        const empresa = empresaActual();
        if (!empresa) {
            Eco.Util.mostrarAviso('Primero crea el perfil empresarial.', 'error');
            return;
        }
        necesidadEditando = id || null;
        document.getElementById('form-necesidad').reset();
        Eco.Util.limpiarErroresCampos(CAMPOS_NECESIDAD);
        document.getElementById('titulo-modal-necesidad').textContent = id ? 'Editar necesidad' : 'Publicar necesidad de material';
        if (id) {
            const n = Eco.DB.consultarUno('SELECT * FROM necesidades_empresa WHERE id_necesidad = ? AND id_empresa = ?', [id, empresa.id_empresa]);
            if (!n) return;
            document.getElementById('necesidad-tipo').value = n.tipo_residuo;
            document.getElementById('necesidad-descripcion').value = n.descripcion || '';
            document.getElementById('necesidad-minima').value = String(n.cantidad_minima);
            document.getElementById('necesidad-maxima').value = String(n.cantidad_maxima);
            document.getElementById('necesidad-unidad').value = n.unidad;
            document.getElementById('necesidad-precio').value = String(n.precio_ofrecido);
        }
        Eco.App.abrirModal('modal-necesidad');
    }

    async function guardarNecesidad(evento) {
        evento.preventDefault();
        try {
            Eco.Sesion.exigir('empresa.gestionar');
        } catch (error) {
            Eco.Util.mostrarAviso(error.message, 'error');
            return;
        }
        const empresa = empresaActual();
        if (!empresa) return;
        Eco.Util.limpiarErroresCampos(CAMPOS_NECESIDAD);
        const tipo = document.getElementById('necesidad-tipo').value;
        const unidad = document.getElementById('necesidad-unidad').value;
        const descripcion = document.getElementById('necesidad-descripcion').value.trim();
        let valido = true;
        const error = (id, mensaje) => { Eco.Util.mostrarErrorCampo(id, mensaje); valido = false; };

        if (!MU().TIPOS.includes(tipo)) error('necesidad-tipo', 'Selecciona el tipo de residuo.');
        if (!['kg', 'unidades'].includes(unidad)) error('necesidad-unidad', 'Selecciona kilogramos o unidades.');
        const minima = MU().leerCantidad(document.getElementById('necesidad-minima').value, unidad);
        const maxima = MU().leerCantidad(document.getElementById('necesidad-maxima').value, unidad);
        if (minima.error) error('necesidad-minima', minima.error);
        if (maxima.error) error('necesidad-maxima', maxima.error);
        if (!minima.error && !maxima.error && maxima.valor < minima.valor) {
            error('necesidad-maxima', 'La cantidad máxima no puede ser menor que la mínima.');
        }
        const precio = MU().leerPrecio(document.getElementById('necesidad-precio').value);
        if (precio.error) error('necesidad-precio', precio.error);
        if (descripcion.length > 300) error('necesidad-descripcion', 'La descripción no puede superar 300 caracteres.');
        if (!valido) return;

        try {
            if (necesidadEditando) {
                Eco.DB.ejecutar(
                    `UPDATE necesidades_empresa SET tipo_residuo = ?, descripcion = ?, cantidad_minima = ?,
                         cantidad_maxima = ?, unidad = ?, precio_ofrecido = ?
                     WHERE id_necesidad = ? AND id_empresa = ?`,
                    [tipo, descripcion || null, minima.valor, maxima.valor, unidad, precio.valor, necesidadEditando, empresa.id_empresa]);
            } else {
                Eco.DB.ejecutar(
                    `INSERT INTO necesidades_empresa (id_empresa, tipo_residuo, descripcion, cantidad_minima, cantidad_maxima, unidad, precio_ofrecido)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [empresa.id_empresa, tipo, descripcion || null, minima.valor, maxima.valor, unidad, precio.valor]);
            }
            const mensaje = necesidadEditando ? 'Necesidad actualizada.' : 'Necesidad publicada. Los vendedores la verán en el mercado.';
            necesidadEditando = null;
            Eco.App.cerrarModal('modal-necesidad');
            await Eco.App.despuesDeCambio(mensaje);
        } catch (errorGuardar) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(errorGuardar, 'No se pudo guardar la necesidad.'), 'error');
        }
    }

    async function accionNecesidad(accion, id) {
        const empresa = empresaActual();
        if (!empresa) return;
        const n = Eco.DB.consultarUno('SELECT * FROM necesidades_empresa WHERE id_necesidad = ? AND id_empresa = ?', [id, empresa.id_empresa]);
        if (!n) return;
        try {
            if (accion === 'editar') {
                abrirNecesidad(id);
            } else if (accion === 'estado') {
                const nuevo = n.estado === 'Activa' ? 'Cerrada' : 'Activa';
                Eco.DB.ejecutar('UPDATE necesidades_empresa SET estado = ? WHERE id_necesidad = ?', [nuevo, id]);
                await Eco.App.despuesDeCambio(nuevo === 'Cerrada' ? 'Necesidad cerrada: ya no se muestra en el mercado.' : 'Necesidad publicada de nuevo.');
            } else if (accion === 'eliminar') {
                const confirmado = await Eco.App.confirmar({
                    titulo: 'Eliminar necesidad',
                    mensaje: `¿Eliminar la necesidad de ${n.tipo_residuo.toLowerCase()}? Esta acción no se puede deshacer.`,
                    textoConfirmar: 'Eliminar',
                    peligro: true
                });
                if (!confirmado) return;
                Eco.DB.ejecutar('DELETE FROM necesidades_empresa WHERE id_necesidad = ?', [id]);
                await Eco.App.despuesDeCambio('Necesidad eliminada.');
            }
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo completar la acción.'), 'error');
        }
    }

    /* ---------------------------- Buscar vendedores ---------------------------- */
    function renderVendedores() {
        const lista = Eco.DB.consultar(
            `SELECT u.id_usuario, u.nombre, u.correo, pf.telefono, pf.ubicacion, pf.foto_url,
                    COUNT(pb.id_publicacion) AS publicaciones,
                    GROUP_CONCAT(DISTINCT pb.tipo_residuo) AS tipos,
                    MIN(pb.precio_unitario) AS precio_minimo
             FROM usuarios u
             JOIN perfiles pf ON pf.id_usuario = u.id_usuario
             JOIN roles r ON r.id_rol = pf.id_rol AND r.codigo = 'vendedor'
             JOIN publicaciones pb ON pb.id_vendedor = u.id_usuario AND pb.estado = 'Activa'
             WHERE pf.activo = 1
               AND (? = '' OR pb.tipo_residuo = ?)
               AND (? = '' OR pf.ubicacion LIKE '%' || ? || '%' OR pb.ubicacion LIKE '%' || ? || '%')
             GROUP BY u.id_usuario
             ORDER BY publicaciones DESC, u.nombre`,
            [filtrosVendedores.tipo, filtrosVendedores.tipo,
                filtrosVendedores.ubicacion, filtrosVendedores.ubicacion, filtrosVendedores.ubicacion]
        );
        document.getElementById('lista-vendedores').innerHTML = lista.map((v) => `
            <article class="tarjeta-vendedor">
                <div class="detalle-vendedor">
                    ${Eco.Sesion.avatar(v.nombre, v.foto_url)}
                    <div><strong>${esc(v.nombre)}</strong><small>${esc(v.ubicacion || 'Sin ubicación')}</small></div>
                </div>
                <div class="publicacion-etiquetas">${String(v.tipos || '').split(',').filter(Boolean).map((t) => MU().insigniaTipo(t)).join('')}</div>
                <p class="texto-tenue">${v.publicaciones} ${v.publicaciones === 1 ? 'publicación activa' : 'publicaciones activas'}</p>
                <div class="publicacion-acciones">
                    <button type="button" class="boton boton-primario boton-pequeno" data-accion="ver" data-id="${v.id_usuario}" data-nombre="${esc(v.nombre)}">Ver publicaciones</button>
                    <button type="button" class="boton boton-secundario boton-pequeno" data-accion="contacto" data-id="${v.id_usuario}">Contactar</button>
                </div>
            </article>`).join('');
        document.getElementById('vendedores-vacio').hidden = lista.length > 0;
    }

    function contactarVendedor(id) {
        const v = Eco.DB.consultarUno(
            `SELECT u.nombre, u.correo, pf.telefono, pf.foto_url, pf.ubicacion FROM usuarios u
             JOIN perfiles pf ON pf.id_usuario = u.id_usuario WHERE u.id_usuario = ?`, [id]);
        if (!v) return;
        document.getElementById('titulo-modal-contacto').textContent = v.nombre;
        document.getElementById('contacto-contenido').innerHTML = `
            <div class="detalle-vendedor">${Eco.Sesion.avatar(v.nombre, v.foto_url)}
                <div><strong>${esc(v.nombre)}</strong><small>Vendedor · ${esc(v.ubicacion || 'Sin ubicación')}</small></div></div>
            <div class="detalle-contacto">${MU().contacto(v.nombre, v.correo, v.telefono)}</div>
            <p class="texto-tenue nota-contacto">EcoGestión no envía mensajes: el contacto se hace por correo o teléfono.</p>`;
        Eco.App.abrirModal('modal-contacto');
    }

    /* -------------------------------- Resumen -------------------------------- */
    function renderResumen() {
        const usuario = Eco.Sesion.usuarioActual();
        const r = Eco.DB.consultarUno(
            `SELECT
                SUM(CASE WHEN o.estado = 'Pendiente' THEN 1 ELSE 0 END) AS pendientes,
                SUM(CASE WHEN t.estado = 'En curso' THEN 1 ELSE 0 END) AS en_curso,
                SUM(CASE WHEN t.estado = 'Completada' THEN 1 ELSE 0 END) AS completadas,
                COALESCE(SUM(CASE WHEN t.estado = 'Completada' THEN o.cantidad * o.precio_unitario END), 0) AS invertido
             FROM ofertas o LEFT JOIN transacciones t ON t.id_oferta = o.id_oferta
             WHERE o.id_comprador = ?`, [usuario.id_usuario]);
        document.getElementById('empresa-pendientes').textContent = Eco.Util.formatearNumero(r.pendientes || 0);
        document.getElementById('empresa-en-curso').textContent = Eco.Util.formatearNumero(r.en_curso || 0);
        document.getElementById('empresa-completadas').textContent = Eco.Util.formatearNumero(r.completadas || 0);
        document.getElementById('empresa-invertido').textContent = MU().dinero(r.invertido);
    }

    function render() {
        if (!Eco.Sesion.puedeVerVista('empresa')) return;
        const empresa = empresaActual();
        renderPerfil(empresa);
        renderNecesidades(empresa);
        renderVendedores();
        renderResumen();
    }

    function init() {
        document.getElementById('form-empresa').addEventListener('submit', guardarPerfil);
        document.getElementById('form-necesidad').addEventListener('submit', guardarNecesidad);
        document.getElementById('btn-nueva-necesidad').addEventListener('click', () => abrirNecesidad(null));
        document.getElementById('btn-empresa-ver-ofertas').addEventListener('click', () => Eco.App.irA('ofertas'));
        document.getElementById('tabla-necesidades-body').addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-accion]');
            if (boton) accionNecesidad(boton.dataset.accion, Number(boton.dataset.id));
        });
        const selectorTipo = document.getElementById('vendedores-tipo');
        selectorTipo.innerHTML = '<option value="">Todos los tipos</option>' +
            MU().TIPOS.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        selectorTipo.addEventListener('change', (evento) => {
            filtrosVendedores.tipo = evento.target.value;
            renderVendedores();
        });
        document.getElementById('vendedores-ubicacion').addEventListener('input', Eco.Util.debounce((evento) => {
            filtrosVendedores.ubicacion = evento.target.value.trim();
            renderVendedores();
        }, 200));
        document.getElementById('lista-vendedores').addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-accion]');
            if (!boton) return;
            if (boton.dataset.accion === 'ver') Eco.Mercado.verVendedor(Number(boton.dataset.id), boton.dataset.nombre);
            if (boton.dataset.accion === 'contacto') contactarVendedor(Number(boton.dataset.id));
        });
        [...CAMPOS_EMPRESA, ...CAMPOS_NECESIDAD].forEach((id) => {
            const campo = document.getElementById(id);
            campo.addEventListener('input', () => Eco.Util.limpiarErrorCampo(id));
            campo.addEventListener('change', () => Eco.Util.limpiarErrorCampo(id));
        });
    }

    Eco.Empresa = { init, render };
})();
