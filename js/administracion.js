/* ============================================================
   EcoGestión · Administración del municipio
   - Cuentas del municipio: aprobar repartidores, activar o
     desactivar y cambiar el tipo de cuenta.
   - Estadísticas: solicitudes por estado, kilos por repartidor
     y material entregado a empresas.
   El servidor solo deja actuar sobre cuentas del mismo municipio.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const esc = (valor) => Eco.Util.escaparHtml(valor);
    const C = () => Eco.Comun;

    const filtros = { rol: '', estado: '', texto: '' };
    let usuarioRol = null;

    function estadoCuenta(u) {
        if (Number(u.pendiente)) return C().estado('Pendiente', 'Por aprobar');
        return C().estado(Number(u.activo) ? 'Activo' : 'Inactivo');
    }

    function actividad(u) {
        if (u.rol === 'ciudadano') return `${u.solicitudes} ${u.solicitudes === 1 ? 'solicitud' : 'solicitudes'}`;
        if (u.rol === 'repartidor') return `${u.recogidas} recogidas · ${Eco.Util.formatearCantidad(u.kilos, 'kg')} kg`;
        if (u.rol === 'empresa') return `${u.pedidos} ${u.pedidos === 1 ? 'pedido' : 'pedidos'}`;
        return '—';
    }

    function renderUsuarios() {
        const f = filtros;
        const lista = Eco.DB.consultar(
            `SELECT u.id_usuario, u.nombre, u.correo, p.activo, p.pendiente, p.ultimo_acceso, p.fecha_creacion,
                    p.foto_url, p.telefono, p.direccion, r.codigo AS rol, r.nombre AS rol_nombre, e.razon_social,
                    (SELECT COUNT(*) FROM solicitudes_recoleccion s WHERE s.id_ciudadano = u.id_usuario) AS solicitudes,
                    (SELECT COUNT(*) FROM solicitudes_recoleccion s WHERE s.id_repartidor = u.id_usuario AND s.estado = 'Recolectada') AS recogidas,
                    (SELECT COALESCE(SUM(s.kilos_recolectados), 0) FROM solicitudes_recoleccion s WHERE s.id_repartidor = u.id_usuario AND s.estado = 'Recolectada') AS kilos,
                    (SELECT COUNT(*) FROM pedidos_empresa pe WHERE pe.id_empresa = e.id_empresa) AS pedidos
             FROM usuarios u
             JOIN perfiles p ON p.id_usuario = u.id_usuario
             JOIN roles r ON r.id_rol = p.id_rol
             LEFT JOIN empresas e ON e.id_usuario = u.id_usuario
             WHERE (? = '' OR r.codigo = ?)
               AND (? = '' OR (? = 'pendiente' AND p.pendiente = 1)
                           OR (? = 'activo' AND p.activo = 1)
                           OR (? = 'inactivo' AND p.activo = 0 AND p.pendiente = 0))
               AND (? = '' OR u.nombre LIKE '%' || ? || '%' OR u.correo LIKE '%' || ? || '%'
                           OR p.direccion LIKE '%' || ? || '%' OR e.razon_social LIKE '%' || ? || '%')
             ORDER BY p.pendiente DESC,
                      CASE r.codigo WHEN 'administrador' THEN 1 WHEN 'repartidor' THEN 2 WHEN 'empresa' THEN 3 ELSE 4 END,
                      u.nombre COLLATE NOCASE`,
            [f.rol, f.rol, f.estado, f.estado, f.estado, f.estado, f.texto, f.texto, f.texto, f.texto, f.texto]);
        const actual = Eco.Sesion.usuarioActual();
        document.getElementById('tabla-usuarios-body').innerHTML = lista.map((u) => {
            const propio = actual && u.id_usuario === actual.id_usuario;
            let acciones;
            if (propio) {
                acciones = '<span class="texto-tenue">Tu cuenta</span>';
            } else if (Number(u.pendiente)) {
                acciones = `
                    <button type="button" class="boton boton-primario boton-pequeno" data-accion="aprobar" data-id="${u.id_usuario}">Aprobar</button>
                    <button type="button" class="boton boton-secundario boton-pequeno" data-accion="rol" data-id="${u.id_usuario}">Cambiar tipo</button>`;
            } else {
                acciones = `
                    ${u.rol === 'empresa' ? '' : `<button type="button" class="boton boton-secundario boton-pequeno" data-accion="rol" data-id="${u.id_usuario}">Cambiar tipo</button>`}
                    <button type="button" class="boton ${Number(u.activo) ? 'boton-secundario' : 'boton-primario'} boton-pequeno" data-accion="estado" data-id="${u.id_usuario}">
                        ${Number(u.activo) ? 'Desactivar' : 'Activar'}</button>`;
            }
            return `
                <tr${Number(u.pendiente) ? ' class="fila-pendiente"' : ''}>
                    <td><div class="celda-persona">${Eco.Sesion.avatar(u.nombre, u.foto_url, 'avatar-mini')}
                        <div><strong>${esc(u.nombre)}${propio ? ' <span class="texto-tenue">(tú)</span>' : ''}</strong>
                        <small>${esc(u.correo || 'Sin correo')}</small>
                        ${u.razon_social ? `<small>${esc(u.razon_social)}</small>` : ''}
                        ${u.telefono ? `<small>${esc(u.telefono)}</small>` : ''}
                        ${u.direccion ? `<small>${esc(u.direccion)}</small>` : ''}</div></div></td>
                    <td><span class="insignia insignia-rol" data-rol="${esc(u.rol)}">${esc(u.rol_nombre)}</span>
</td>
                    <td class="texto-derecha">${esc(actividad(u))}</td>
                    <td><span class="fecha-tabla">${u.ultimo_acceso ? esc(Eco.Util.formatearFecha(u.ultimo_acceso)) : 'Nunca'}</span>
                        <small class="bloque texto-tenue">Desde ${esc(Eco.Util.formatearFecha(u.fecha_creacion))}</small></td>
                    <td>${estadoCuenta(u)}</td>
                    <td class="texto-derecha"><div class="acciones-tabla">${acciones}</div></td>
                </tr>`;
        }).join('');
        document.getElementById('usuarios-conteo').textContent = `${lista.length} ${lista.length === 1 ? 'usuario' : 'usuarios'}`;
        document.getElementById('usuarios-vacio').hidden = lista.length > 0;
        document.getElementById('tabla-usuarios-body').closest('.tabla-contenedor').hidden = lista.length === 0;

        Eco.DB.consultar(
            `SELECT r.codigo, COUNT(p.id_usuario) AS total, SUM(CASE WHEN p.activo = 1 THEN 1 ELSE 0 END) AS activos
             FROM roles r LEFT JOIN perfiles p ON p.id_rol = r.id_rol GROUP BY r.id_rol`
        ).forEach((r) => {
            const total = document.getElementById(`admin-total-${r.codigo}`);
            if (!total) return;
            total.textContent = Eco.Util.formatearNumero(r.total);
            document.getElementById(`admin-activos-${r.codigo}`).textContent = `${r.activos || 0} activos`;
        });

        const pendientes = Eco.DB.contar('SELECT COUNT(*) FROM perfiles WHERE pendiente = 1');
        document.getElementById('admin-aviso-pendientes').hidden = pendientes === 0;
        document.getElementById('admin-aviso-pendientes-titulo').textContent =
            pendientes === 1 ? '1 repartidor por aprobar' : `${pendientes} repartidores por aprobar`;
    }

    function barras(idContenedor, filas, formato, vacio) {
        const maximo = Math.max(...filas.map((f) => Number(f.valor) || 0), 0);
        document.getElementById(idContenedor).innerHTML = filas.length && maximo > 0
            ? filas.map((f) => `
                <div class="barra-categoria">
                    <div class="barra-categoria-cabecera"><span>${esc(f.etiqueta)}</span><strong>${esc(formato(f.valor))}</strong></div>
                    <div class="barra-pista"><span class="barra-relleno" style="width: ${Math.max(4, Math.round((Number(f.valor) / maximo) * 100))}%"></span></div>
                </div>`).join('')
            : `<p class="texto-tenue">${esc(vacio)}</p>`;
    }

    function renderEstadisticas() {
        barras('est-solicitudes-estado', Eco.DB.consultar(
            `SELECT estado AS etiqueta, COUNT(*) AS valor FROM solicitudes_recoleccion GROUP BY estado
             ORDER BY CASE estado WHEN 'Pendiente' THEN 1 WHEN 'Asignada' THEN 2 WHEN 'Recolectada' THEN 3 ELSE 4 END`),
        (v) => Eco.Util.formatearNumero(v), 'Aún no hay solicitudes.');
        barras('est-repartidores', Eco.DB.consultar(
            `SELECT u.nombre AS etiqueta, ROUND(SUM(r.cantidad), 2) AS valor
             FROM recolecciones r JOIN usuarios u ON u.id_usuario = r.id_usuario
             WHERE r.id_solicitud IS NOT NULL AND r.unidad_medida = 'kg'
             GROUP BY r.id_usuario ORDER BY valor DESC LIMIT 6`),
        (v) => `${Eco.Util.formatearCantidad(v, 'kg')} kg`, 'Aún no hay recolecciones de solicitudes.');
        barras('est-entregas', Eco.DB.consultar(
            `SELECT m.categoria AS etiqueta, ROUND(SUM(pe.cantidad * pe.precio_unitario), 2) AS valor
             FROM pedidos_empresa pe JOIN materiales m ON m.id_material = pe.id_material
             WHERE pe.estado = 'Entregado' GROUP BY m.categoria ORDER BY valor DESC`),
        (v) => C().dinero(v), 'Aún no hay entregas a empresas.');
    }

    function render() {
        if (!Eco.Sesion.puedeVerVista('administracion')) return;
        renderUsuarios();
        renderEstadisticas();
    }

    /* ------------------------------- Acciones ------------------------------- */
    function obtenerCuenta(id) {
        return Eco.DB.consultarUno(
            `SELECT u.id_usuario, u.nombre, p.activo, p.pendiente, r.codigo AS rol, r.nombre AS rol_nombre,
                    (SELECT COUNT(*) FROM solicitudes_recoleccion s WHERE s.id_repartidor = u.id_usuario AND s.estado = 'Asignada') AS asignadas
             FROM usuarios u JOIN perfiles p ON p.id_usuario = u.id_usuario JOIN roles r ON r.id_rol = p.id_rol
             WHERE u.id_usuario = ?`, [id]);
    }

    async function cambiarEstado(id, aprobar) {
        Eco.Sesion.exigir('usuarios.gestionar');
        const cuenta = obtenerCuenta(id);
        if (!cuenta) return;
        const activar = aprobar || !Number(cuenta.activo);
        let mensaje;
        if (aprobar) mensaje = `${cuenta.nombre} podrá entrar y recibir solicitudes asignadas.`;
        else if (activar) mensaje = `${cuenta.nombre} podrá volver a iniciar sesión.`;
        else mensaje = `${cuenta.nombre} no podrá iniciar sesión. Su historial se conserva.` +
            (cuenta.asignadas ? ` Sus ${cuenta.asignadas} solicitudes asignadas volverán a quedar sin asignar.` : '');
        const confirmado = await Eco.App.confirmar({
            titulo: aprobar ? 'Aprobar repartidor' : activar ? 'Activar cuenta' : 'Desactivar cuenta',
            mensaje,
            textoConfirmar: aprobar ? 'Aprobar' : activar ? 'Activar' : 'Desactivar',
            peligro: !activar
        });
        if (!confirmado) return;
        await Eco.Nube.rpc('admin_estado_usuario', { p_id: id, p_activo: activar });
        await Eco.App.despuesDeCambio(aprobar ? 'Repartidor aprobado.' : activar ? 'Cuenta activada.' : 'Cuenta desactivada.');
    }

    function abrirCambioRol(id) {
        Eco.Sesion.exigir('usuarios.gestionar');
        const cuenta = obtenerCuenta(id);
        if (!cuenta || cuenta.rol === 'empresa') return;
        usuarioRol = cuenta;
        document.getElementById('rol-usuario-nombre').textContent = cuenta.nombre;
        document.getElementById('rol-usuario-actual').textContent = cuenta.rol_nombre.toLowerCase();
        document.getElementById('rol-nuevo').value = cuenta.rol;
        Eco.Util.limpiarErrorCampo('rol-nuevo');
        Eco.App.abrirModal('modal-rol');
    }

    async function guardarRol(evento) {
        evento.preventDefault();
        if (!usuarioRol) return;
        try {
            const nuevo = document.getElementById('rol-nuevo').value;
            if (nuevo === usuarioRol.rol) {
                Eco.App.cerrarModal('modal-rol');
                return;
            }
            await Eco.Nube.rpc('admin_rol_usuario', { p_id: usuarioRol.id_usuario, p_rol: nuevo });
            usuarioRol = null;
            Eco.App.cerrarModal('modal-rol');
            await Eco.App.despuesDeCambio('Tipo de cuenta actualizado. Se aplicará en la próxima actualización de su sesión.');
        } catch (error) {
            Eco.Util.mostrarErrorCampo('rol-nuevo', Eco.Util.mensajeError(error, error.message));
        }
    }

    function init() {
        document.getElementById('admin-buscar-usuario').addEventListener('input', Eco.Util.debounce((evento) => {
            filtros.texto = evento.target.value.trim();
            renderUsuarios();
        }, 200));
        document.getElementById('admin-filtro-rol').addEventListener('change', (evento) => {
            filtros.rol = evento.target.value;
            renderUsuarios();
        });
        document.getElementById('admin-filtro-estado').addEventListener('change', (evento) => {
            filtros.estado = evento.target.value;
            renderUsuarios();
        });
        document.getElementById('btn-ver-pendientes').addEventListener('click', () => {
            filtros.estado = 'pendiente';
            document.getElementById('admin-filtro-estado').value = 'pendiente';
            renderUsuarios();
        });
        document.getElementById('tabla-usuarios-body').addEventListener('click', async (evento) => {
            const boton = evento.target.closest('button[data-accion]');
            if (!boton) return;
            const id = Number(boton.dataset.id);
            try {
                if (boton.dataset.accion === 'rol') abrirCambioRol(id);
                else await cambiarEstado(id, boton.dataset.accion === 'aprobar');
            } catch (error) {
                Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, error.message), 'error');
            }
        });
        document.getElementById('form-rol').addEventListener('submit', guardarRol);
    }

    Eco.Administracion = { init, render };
})();
