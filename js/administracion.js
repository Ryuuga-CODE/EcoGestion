/* ============================================================
   EcoGestión · Administración
   - Usuarios: consultar por tipo, activar/desactivar cuentas y
     cambiar el tipo de cuenta.
   - Supervisión: todas las publicaciones y transacciones.
   - Estadísticas generales del mercado.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const esc = (valor) => Eco.Util.escaparHtml(valor);
    const MU = () => Eco.MercadoUtil;

    let pestanaActual = 'usuarios';
    const filtros = {
        usuarios: { rol: '', estado: '', texto: '' },
        publicaciones: { estado: '', tipo: '' },
        transacciones: { estado: '' }
    };
    let usuarioRol = null;

    const PESTANAS = {
        usuarios: 'usuarios.gestionar',
        publicaciones: 'mercado.supervisar',
        transacciones: 'mercado.supervisar',
        estadisticas: 'mercado.supervisar'
    };

    /* -------------------------------- Usuarios -------------------------------- */
    function renderUsuarios() {
        const f = filtros.usuarios;
        const lista = Eco.DB.consultar(
            `SELECT u.id_usuario, u.nombre, u.correo, p.activo, p.metodo_registro, p.ultimo_acceso,
                    p.foto_url, p.ubicacion, r.codigo AS rol, r.nombre AS rol_nombre,
                    e.razon_social,
                    (SELECT COUNT(*) FROM publicaciones pb WHERE pb.id_vendedor = u.id_usuario) AS publicaciones,
                    (SELECT COUNT(*) FROM ofertas o WHERE o.id_comprador = u.id_usuario) AS ofertas
             FROM usuarios u
             JOIN perfiles p ON p.id_usuario = u.id_usuario
             JOIN roles r ON r.id_rol = p.id_rol
             LEFT JOIN empresas e ON e.id_usuario = u.id_usuario
             WHERE (? = '' OR r.codigo = ?)
               AND (? = '' OR p.activo = ?)
               AND (? = '' OR u.nombre LIKE '%' || ? || '%' OR u.correo LIKE '%' || ? || '%' OR e.razon_social LIKE '%' || ? || '%')
             ORDER BY CASE r.codigo WHEN 'administrador' THEN 1 WHEN 'vendedor' THEN 2 WHEN 'comprador' THEN 3 ELSE 4 END,
                      u.nombre`,
            [f.rol, f.rol, f.estado, f.estado === '' ? '' : Number(f.estado), f.texto, f.texto, f.texto, f.texto]
        );
        const actual = Eco.Sesion.usuarioActual();
        document.getElementById('tabla-usuarios-body').innerHTML = lista.map((u) => {
            const propio = actual && u.id_usuario === actual.id_usuario;
            const actividad = u.rol === 'vendedor' ? `${u.publicaciones} publicaciones`
                : (u.rol === 'comprador' || u.rol === 'empresa') ? `${u.ofertas} ofertas` : '—';
            return `
                <tr>
                    <td><div class="celda-persona">${Eco.Sesion.avatar(u.nombre, u.foto_url, 'avatar-mini')}
                        <div><strong>${esc(u.nombre)}${propio ? ' <span class="texto-tenue">(tú)</span>' : ''}</strong>
                        <small>${esc(u.correo || 'Sin correo')}</small>
                        ${u.razon_social ? `<small>${esc(u.razon_social)}</small>` : ''}
                        ${u.ubicacion ? `<small>${esc(u.ubicacion)}</small>` : ''}</div></div></td>
                    <td><span class="insignia insignia-rol" data-rol="${esc(u.rol)}">${esc(u.rol_nombre)}</span>
                        <small class="bloque">${u.metodo_registro === 'google' ? 'Cuenta de Google' : 'Cuenta de demostración'}</small></td>
                    <td class="texto-derecha">${esc(actividad)}</td>
                    <td><span class="fecha-tabla">${u.ultimo_acceso ? esc(Eco.Util.formatearFechaHora(u.ultimo_acceso)) : 'Nunca'}</span></td>
                    <td>${MU().estado(u.activo ? 'Activo' : 'Inactivo')}</td>
                    <td class="texto-derecha"><div class="acciones-tabla">
                        ${propio ? '<span class="texto-tenue">Tu cuenta</span>' : `
                        <button type="button" class="boton boton-secundario boton-pequeno" data-accion="rol" data-id="${u.id_usuario}">Cambiar tipo</button>
                        <button type="button" class="boton ${u.activo ? 'boton-secundario' : 'boton-primario'} boton-pequeno" data-accion="estado" data-id="${u.id_usuario}">
                            ${u.activo ? 'Desactivar' : 'Activar'}</button>`}
                    </div></td>
                </tr>`;
        }).join('');
        document.getElementById('usuarios-conteo').textContent = `${lista.length} ${lista.length === 1 ? 'usuario' : 'usuarios'}`;
        document.getElementById('usuarios-vacio').hidden = lista.length > 0;

        const porRol = Eco.DB.consultar(
            `SELECT r.codigo, COUNT(p.id_usuario) AS total, SUM(CASE WHEN p.activo = 1 THEN 1 ELSE 0 END) AS activos
             FROM roles r LEFT JOIN perfiles p ON p.id_rol = r.id_rol GROUP BY r.id_rol`
        );
        porRol.forEach((fila) => {
            const elemento = document.getElementById(`admin-total-${fila.codigo}`);
            if (elemento) elemento.textContent = Eco.Util.formatearNumero(fila.total);
            const pie = document.getElementById(`admin-activos-${fila.codigo}`);
            if (pie) pie.textContent = `${fila.activos || 0} activos`;
        });
    }

    function administradoresActivos() {
        return Eco.DB.contar(
            `SELECT COUNT(*) AS total FROM perfiles p JOIN roles r ON r.id_rol = p.id_rol
             WHERE r.codigo = 'administrador' AND p.activo = 1`);
    }

    function obtenerCuenta(id) {
        return Eco.DB.consultarUno(
            `SELECT u.id_usuario, u.nombre, p.activo, r.codigo AS rol, r.nombre AS rol_nombre
             FROM usuarios u JOIN perfiles p ON p.id_usuario = u.id_usuario JOIN roles r ON r.id_rol = p.id_rol
             WHERE u.id_usuario = ?`, [id]);
    }

    async function cambiarEstado(id) {
        Eco.Sesion.exigir('usuarios.gestionar');
        const actual = Eco.Sesion.usuarioActual();
        const cuenta = obtenerCuenta(id);
        if (!cuenta) return;
        if (cuenta.id_usuario === actual.id_usuario) throw new Error('No puedes desactivar tu propia cuenta.');
        if (cuenta.activo && cuenta.rol === 'administrador' && administradoresActivos() <= 1) {
            throw new Error('Debe quedar al menos un administrador activo.');
        }
        const activar = !cuenta.activo;
        const confirmado = await Eco.App.confirmar({
            titulo: activar ? 'Activar cuenta' : 'Desactivar cuenta',
            mensaje: activar
                ? `${cuenta.nombre} podrá volver a iniciar sesión.`
                : `${cuenta.nombre} no podrá iniciar sesión y sus publicaciones y necesidades dejarán de verse en el mercado. Su historial se conserva.`,
            textoConfirmar: activar ? 'Activar' : 'Desactivar',
            peligro: !activar
        });
        if (!confirmado) return;
        await Eco.Nube.rpc('admin_estado_usuario', { p_id: id, p_activo: activar });
        await Eco.App.despuesDeCambio(activar ? 'Cuenta activada.' : 'Cuenta desactivada.');
    }

    function abrirCambioRol(id) {
        Eco.Sesion.exigir('usuarios.gestionar');
        const cuenta = obtenerCuenta(id);
        if (!cuenta) return;
        usuarioRol = cuenta;
        document.getElementById('rol-usuario-nombre').textContent = cuenta.nombre;
        document.getElementById('rol-usuario-actual').textContent = cuenta.rol_nombre;
        const selector = document.getElementById('rol-nuevo');
        selector.innerHTML = Eco.DB.consultar('SELECT codigo, nombre FROM roles ORDER BY id_rol')
            .map((r) => `<option value="${esc(r.codigo)}"${r.codigo === cuenta.rol ? ' selected' : ''}>${esc(r.nombre)}</option>`)
            .join('');
        Eco.Util.limpiarErrorCampo('rol-nuevo');
        Eco.App.abrirModal('modal-rol');
    }

    async function guardarRol(evento) {
        evento.preventDefault();
        if (!usuarioRol) return;
        try {
            Eco.Sesion.exigir('usuarios.gestionar');
            const nuevo = document.getElementById('rol-nuevo').value;
            const cuenta = obtenerCuenta(usuarioRol.id_usuario);
            if (!cuenta) return;
            if (nuevo === cuenta.rol) {
                Eco.App.cerrarModal('modal-rol');
                return;
            }
            if (cuenta.rol === 'administrador' && cuenta.activo && administradoresActivos() <= 1) {
                Eco.Util.mostrarErrorCampo('rol-nuevo', 'Debe quedar al menos un administrador activo.');
                return;
            }
            // El servidor cambia el tipo y, si deja de ser vendedor, rechaza sus ofertas pendientes.
            await Eco.Nube.rpc('admin_rol_usuario', { p_id: cuenta.id_usuario, p_rol: nuevo });
            usuarioRol = null;
            Eco.App.cerrarModal('modal-rol');
            await Eco.App.despuesDeCambio('Tipo de cuenta actualizado. Se aplicará en la próxima actualización de su sesión.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, error.message), 'error');
        }
    }

    /* ------------------------------ Publicaciones ------------------------------ */
    function renderPublicaciones() {
        const f = filtros.publicaciones;
        const lista = Eco.DB.consultar(
            `SELECT pb.*, u.nombre AS vendedor,
                    (SELECT imagen FROM fotos_publicacion fp WHERE fp.id_publicacion = pb.id_publicacion ORDER BY orden LIMIT 1) AS portada,
                    (SELECT COUNT(*) FROM ofertas o WHERE o.id_publicacion = pb.id_publicacion) AS ofertas
             FROM publicaciones pb JOIN usuarios u ON u.id_usuario = pb.id_vendedor
             WHERE (? = '' OR pb.estado = ?) AND (? = '' OR pb.tipo_residuo = ?)
             ORDER BY pb.fecha_publicacion DESC`,
            [f.estado, f.estado, f.tipo, f.tipo]
        );
        document.getElementById('tabla-admin-publicaciones-body').innerHTML = lista.map((pb) => `
            <tr>
                <td><div class="celda-publicacion">${MU().portada(pb.portada, pb.tipo_residuo, 'foto-mini')}
                    <div><strong>${esc(pb.nombre_material)}</strong><small>${esc(pb.tipo_residuo)} · ${esc(pb.ubicacion)}</small></div></div></td>
                <td>${esc(pb.vendedor)}</td>
                <td class="texto-derecha">${esc(MU().cantidad(pb.cantidad_disponible, pb.unidad))}</td>
                <td class="texto-derecha">${esc(MU().precio(pb.precio_unitario, pb.unidad))}</td>
                <td class="texto-derecha">${pb.ofertas}</td>
                <td>${MU().estado(pb.estado)}</td>
                <td><span class="fecha-tabla">${esc(MU().fecha(pb.fecha_publicacion))}</span></td>
            </tr>`).join('');
        document.getElementById('admin-publicaciones-conteo').textContent =
            `${lista.length} ${lista.length === 1 ? 'publicación' : 'publicaciones'}`;
        document.getElementById('admin-publicaciones-vacio').hidden = lista.length > 0;
    }

    /* ------------------------------ Transacciones ------------------------------ */
    function consultarNegociaciones(estado) {
        return Eco.DB.consultar(
            `SELECT o.*, (o.cantidad * o.precio_unitario) AS total, pb.nombre_material, pb.unidad,
                    v.nombre AS vendedor, c.nombre AS comprador, t.estado AS estado_transaccion
             FROM ofertas o
             JOIN publicaciones pb ON pb.id_publicacion = o.id_publicacion
             JOIN usuarios v ON v.id_usuario = pb.id_vendedor
             JOIN usuarios c ON c.id_usuario = o.id_comprador
             LEFT JOIN transacciones t ON t.id_oferta = o.id_oferta
             WHERE (? = '' OR o.estado = ?)
             ORDER BY o.fecha_oferta DESC`,
            [estado, estado]
        );
    }

    function renderTransacciones() {
        const lista = consultarNegociaciones(filtros.transacciones.estado);
        document.getElementById('tabla-admin-transacciones-body').innerHTML = lista.map((o) => `
            <tr>
                <td><span class="fecha-tabla">${esc(MU().fecha(o.fecha_oferta))}</span></td>
                <td><strong>${esc(o.nombre_material)}</strong></td>
                <td>${esc(o.vendedor)}<small class="bloque">a ${esc(o.comprador)}</small></td>
                <td class="texto-derecha">${esc(MU().cantidad(o.cantidad, o.unidad))}</td>
                <td class="texto-derecha"><strong>${esc(MU().dinero(o.total))}</strong><small class="bloque">${esc(MU().precio(o.precio_unitario, o.unidad))}</small></td>
                <td>${MU().estado(o.estado)}</td>
                <td>${o.estado_transaccion ? MU().estado(o.estado_transaccion) : '<span class="texto-tenue">Sin operación</span>'}</td>
            </tr>`).join('');
        document.getElementById('admin-transacciones-conteo').textContent =
            `${lista.length} ${lista.length === 1 ? 'negociación' : 'negociaciones'}`;
        document.getElementById('admin-transacciones-vacio').hidden = lista.length > 0;
    }

    function exportarTransacciones() {
        const lista = consultarNegociaciones(filtros.transacciones.estado);
        if (!lista.length) {
            Eco.Util.mostrarAviso('No hay negociaciones para exportar.', 'error');
            return;
        }
        Eco.Util.descargarCSV(
            `negociaciones_ecogestion_${Eco.Util.fechaHoyIso()}.csv`,
            ['Fecha', 'Material', 'Vendedor', 'Comprador', 'Cantidad', 'Unidad', 'Precio unitario', 'Total', 'Estado oferta', 'Estado operación'],
            lista.map((o) => [o.fecha_oferta.slice(0, 10), o.nombre_material, o.vendedor, o.comprador,
                Eco.Util.numeroCSV(o.cantidad), o.unidad, Eco.Util.numeroCSV(o.precio_unitario),
                Eco.Util.numeroCSV(o.total), o.estado, o.estado_transaccion || ''])
        );
        Eco.Util.mostrarAviso('Negociaciones exportadas en CSV.');
    }

    /* ------------------------------ Estadísticas ------------------------------ */
    function barras(filas, etiqueta, valor, formato) {
        const maximo = filas.reduce((max, fila) => Math.max(max, Number(fila[valor]) || 0), 0);
        if (!filas.length) return '<p class="texto-tenue">Sin datos todavía.</p>';
        return filas.map((fila) => `
            <div class="barra-categoria">
                <div class="barra-categoria-cabecera">
                    <span>${esc(fila[etiqueta])}</span>
                    <strong>${esc(formato ? formato(fila) : Eco.Util.formatearNumero(fila[valor]))}</strong>
                </div>
                <div class="barra-pista"><span class="barra-relleno" style="width: ${maximo ? (Number(fila[valor]) / maximo) * 100 : 0}%"></span></div>
            </div>`).join('');
    }

    function renderEstadisticas() {
        const g = Eco.DB.consultarUno(
            `SELECT
                (SELECT COUNT(*) FROM perfiles WHERE activo = 1) AS usuarios_activos,
                (SELECT COUNT(*) FROM publicaciones WHERE estado = 'Activa') AS publicaciones_activas,
                (SELECT COUNT(*) FROM ofertas WHERE estado = 'Pendiente') AS ofertas_pendientes,
                (SELECT COUNT(*) FROM transacciones WHERE estado = 'Completada') AS completadas,
                (SELECT COALESCE(SUM(o.cantidad * o.precio_unitario), 0) FROM transacciones t
                  JOIN ofertas o ON o.id_oferta = t.id_oferta WHERE t.estado = 'Completada') AS valor`
        );
        document.getElementById('est-usuarios').textContent = Eco.Util.formatearNumero(g.usuarios_activos);
        document.getElementById('est-publicaciones').textContent = Eco.Util.formatearNumero(g.publicaciones_activas);
        document.getElementById('est-pendientes').textContent = Eco.Util.formatearNumero(g.ofertas_pendientes);
        document.getElementById('est-completadas').textContent = Eco.Util.formatearNumero(g.completadas);
        document.getElementById('est-valor').textContent = MU().dinero(g.valor);

        const porEstado = Eco.DB.consultar(
            `SELECT estado, COUNT(*) AS total FROM ofertas GROUP BY estado
             ORDER BY CASE estado WHEN 'Pendiente' THEN 1 WHEN 'Aceptada' THEN 2 WHEN 'Completada' THEN 3
                                  WHEN 'Rechazada' THEN 4 ELSE 5 END`);
        document.getElementById('est-ofertas-estado').innerHTML = barras(porEstado, 'estado', 'total');

        const porTipo = Eco.DB.consultar(
            `SELECT pb.tipo_residuo, pb.unidad, SUM(o.cantidad) AS cantidad, SUM(o.cantidad * o.precio_unitario) AS valor
             FROM transacciones t JOIN ofertas o ON o.id_oferta = t.id_oferta
             JOIN publicaciones pb ON pb.id_publicacion = o.id_publicacion
             WHERE t.estado = 'Completada'
             GROUP BY pb.tipo_residuo, pb.unidad ORDER BY valor DESC`);
        document.getElementById('est-material-tipo').innerHTML = barras(porTipo, 'tipo_residuo', 'valor',
            (fila) => `${MU().cantidad(fila.cantidad, fila.unidad)} · ${MU().dinero(fila.valor)}`);

        const publicadas = Eco.DB.consultar(
            `SELECT tipo_residuo, COUNT(*) AS total FROM publicaciones WHERE estado = 'Activa'
             GROUP BY tipo_residuo ORDER BY total DESC`);
        document.getElementById('est-publicaciones-tipo').innerHTML = barras(publicadas, 'tipo_residuo', 'total');
    }

    /* ---------------------------------- Vista ---------------------------------- */
    function render() {
        if (!Eco.Sesion.puedeVerVista('administracion')) return;
        const disponibles = Object.keys(PESTANAS).filter((p) => Eco.Sesion.tiene(PESTANAS[p]));
        if (!disponibles.includes(pestanaActual)) pestanaActual = disponibles[0];
        document.querySelectorAll('#vista-administracion .pestana').forEach((pestana) => {
            const nombre = pestana.dataset.pestana;
            pestana.hidden = !disponibles.includes(nombre);
            pestana.classList.toggle('activa', nombre === pestanaActual);
            pestana.setAttribute('aria-selected', String(nombre === pestanaActual));
        });
        Object.keys(PESTANAS).forEach((nombre) => {
            document.getElementById(`admin-panel-${nombre}`).hidden = nombre !== pestanaActual;
        });
        if (pestanaActual === 'usuarios') renderUsuarios();
        if (pestanaActual === 'publicaciones') renderPublicaciones();
        if (pestanaActual === 'transacciones') renderTransacciones();
        if (pestanaActual === 'estadisticas') renderEstadisticas();
    }

    async function accionUsuario(accion, id) {
        try {
            if (accion === 'estado') await cambiarEstado(id);
            if (accion === 'rol') abrirCambioRol(id);
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, error.message), 'error');
        }
    }

    function init() {
        document.querySelectorAll('#vista-administracion .pestana').forEach((pestana) => {
            pestana.addEventListener('click', () => {
                pestanaActual = pestana.dataset.pestana;
                render();
            });
        });
        document.getElementById('admin-filtro-rol').addEventListener('change', (e) => { filtros.usuarios.rol = e.target.value; render(); });
        document.getElementById('admin-filtro-estado').addEventListener('change', (e) => { filtros.usuarios.estado = e.target.value; render(); });
        document.getElementById('admin-buscar-usuario').addEventListener('input', Eco.Util.debounce((e) => {
            filtros.usuarios.texto = e.target.value.trim();
            render();
        }, 200));
        document.getElementById('admin-pub-estado').addEventListener('change', (e) => { filtros.publicaciones.estado = e.target.value; render(); });
        const tipo = document.getElementById('admin-pub-tipo');
        tipo.innerHTML = '<option value="">Todos los tipos</option>' +
            MU().TIPOS.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
        tipo.addEventListener('change', (e) => { filtros.publicaciones.tipo = e.target.value; render(); });
        document.getElementById('admin-trans-estado').addEventListener('change', (e) => { filtros.transacciones.estado = e.target.value; render(); });
        document.getElementById('btn-exportar-negociaciones').addEventListener('click', exportarTransacciones);
        document.getElementById('tabla-usuarios-body').addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-accion]');
            if (boton) accionUsuario(boton.dataset.accion, Number(boton.dataset.id));
        });
        document.getElementById('form-rol').addEventListener('submit', guardarRol);
    }

    Eco.Administracion = { init, render };
})();
