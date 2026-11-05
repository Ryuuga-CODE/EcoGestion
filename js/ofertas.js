/* ============================================================
   EcoGestión · Ofertas y negociaciones
   - Vendedor: ofertas recibidas (aceptar, rechazar, completar)
     e historial de ventas.
   - Comprador / empresa: ofertas enviadas (cancelar) e
     historial de compras.
   Aceptar, cancelar una oferta aceptada y completar se ejecutan
   en el servidor (función responder_oferta) como una transacción:
   se actualizan la oferta, la publicación y la transacción a la
   vez, o no se cambia nada.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const esc = (valor) => Eco.Util.escaparHtml(valor);
    const MU = () => Eco.MercadoUtil;

    let pestanaActual = null;
    const filtroEstado = { recibidas: '', enviadas: '', operaciones: '' };

    const SQL_BASE = `
        SELECT o.*, (o.cantidad * o.precio_unitario) AS total,
               pb.nombre_material, pb.tipo_residuo, pb.unidad, pb.precio_unitario AS precio_publicado,
               pb.cantidad_disponible, pb.estado AS estado_publicacion, pb.id_vendedor,
               v.nombre AS vendedor, v.correo AS vendedor_correo, pv.telefono AS vendedor_telefono, pv.foto_url AS vendedor_foto,
               c.nombre AS comprador, c.correo AS comprador_correo, pc.telefono AS comprador_telefono, pc.foto_url AS comprador_foto,
               rc.nombre AS comprador_tipo,
               t.id_transaccion, t.estado AS estado_transaccion, t.fecha_acuerdo, t.fecha_cierre
        FROM ofertas o
        JOIN publicaciones pb ON pb.id_publicacion = o.id_publicacion
        JOIN usuarios v ON v.id_usuario = pb.id_vendedor
        JOIN perfiles pv ON pv.id_usuario = v.id_usuario
        JOIN usuarios c ON c.id_usuario = o.id_comprador
        JOIN perfiles pc ON pc.id_usuario = c.id_usuario
        JOIN roles rc ON rc.id_rol = pc.id_rol
        LEFT JOIN transacciones t ON t.id_oferta = o.id_oferta`;

    function pestanasDisponibles() {
        const lista = [];
        if (Eco.Sesion.tiene('ofertas.recibir')) lista.push('recibidas');
        if (Eco.Sesion.tiene('ofertas.enviar')) lista.push('enviadas');
        if (lista.length) lista.push('operaciones');
        return lista;
    }

    function persona(nombre, foto, detalle) {
        return `<div class="celda-persona">${Eco.Sesion.avatar(nombre, foto, 'avatar-mini')}
            <div><strong>${esc(nombre)}</strong>${detalle ? `<small>${esc(detalle)}</small>` : ''}</div></div>`;
    }

    function celdaMaterial(o) {
        return `<strong>${esc(o.nombre_material)}</strong><small class="bloque">${esc(o.tipo_residuo)}</small>`;
    }

    function celdaCantidad(o) {
        return `<strong class="cantidad-tabla">${esc(Eco.Util.formatearCantidad(o.cantidad, o.unidad))}</strong> <span class="unidad-sufijo">${esc(o.unidad)}</span>`;
    }

    /** Total de la oferta, precio unitario y diferencia con el precio publicado. */
    function celdaOferta(o) {
        const diferencia = o.precio_unitario - o.precio_publicado;
        const nota = Math.abs(diferencia) < 0.005 ? 'igual al publicado'
            : `${diferencia > 0 ? '+' : '−'}${MU().dinero(Math.abs(diferencia))} vs. publicado`;
        return `<strong>${esc(MU().dinero(o.total))}</strong>
            <small class="bloque">${esc(MU().precio(o.precio_unitario, o.unidad))}</small>
            <small class="bloque">${esc(nota)}</small>`;
    }

    /* ------------------------------ Tablas ------------------------------ */
    function renderRecibidas(usuario) {
        const lista = Eco.DB.consultar(
            `${SQL_BASE} WHERE pb.id_vendedor = ? AND (? = '' OR o.estado = ?)
             ORDER BY CASE o.estado WHEN 'Pendiente' THEN 1 WHEN 'Aceptada' THEN 2 ELSE 3 END, o.fecha_oferta DESC`,
            [usuario.id_usuario, filtroEstado.recibidas, filtroEstado.recibidas]
        );
        document.getElementById('tabla-recibidas-body').innerHTML = lista.map((o) => {
            const acciones = [];
            if (o.estado === 'Pendiente') {
                acciones.push(`<button type="button" class="boton boton-primario boton-pequeno" data-accion="aceptar" data-id="${o.id_oferta}">Aceptar</button>`);
                acciones.push(`<button type="button" class="boton boton-secundario boton-pequeno" data-accion="rechazar" data-id="${o.id_oferta}">Rechazar</button>`);
            } else if (o.estado === 'Aceptada') {
                acciones.push(`<button type="button" class="boton boton-primario boton-pequeno" data-accion="completar" data-id="${o.id_oferta}">Marcar completada</button>`);
                acciones.push(`<button type="button" class="boton boton-secundario boton-pequeno" data-accion="cancelar" data-id="${o.id_oferta}">Cancelar</button>`);
            }
            acciones.push(`<button type="button" class="boton-icono" data-accion="contacto" data-id="${o.id_oferta}" title="Contactar al comprador" aria-label="Contactar a ${esc(o.comprador)}">
                <svg class="icono" aria-hidden="true"><use href="#i-correo"></use></svg></button>`);
            const excede = o.estado === 'Pendiente' && o.cantidad > o.cantidad_disponible + 0.000001;
            return `
                <tr>
                    <td><span class="fecha-tabla">${esc(MU().fecha(o.fecha_oferta))}</span></td>
                    <td>${persona(o.comprador, o.comprador_foto, o.comprador_tipo)}</td>
                    <td>${celdaMaterial(o)}${o.mensaje ? `<small class="mensaje-oferta">“${esc(o.mensaje)}”</small>` : ''}</td>
                    <td class="texto-derecha">${celdaCantidad(o)}${excede ? `<small class="bloque texto-alerta">Supera lo disponible (${esc(MU().cantidad(o.cantidad_disponible, o.unidad))})</small>` : ''}</td>
                    <td class="texto-derecha">${celdaOferta(o)}</td>
                    <td>${MU().estado(o.estado)}</td>
                    <td class="texto-derecha"><div class="acciones-tabla">${acciones.join('')}</div></td>
                </tr>`;
        }).join('');
        mostrarVacio('recibidas', lista.length);
    }

    function renderEnviadas(usuario) {
        const lista = Eco.DB.consultar(
            `${SQL_BASE} WHERE o.id_comprador = ? AND (? = '' OR o.estado = ?)
             ORDER BY CASE o.estado WHEN 'Pendiente' THEN 1 WHEN 'Aceptada' THEN 2 ELSE 3 END, o.fecha_oferta DESC`,
            [usuario.id_usuario, filtroEstado.enviadas, filtroEstado.enviadas]
        );
        document.getElementById('tabla-enviadas-body').innerHTML = lista.map((o) => {
            const acciones = [];
            if (o.estado === 'Pendiente' || o.estado === 'Aceptada') {
                acciones.push(`<button type="button" class="boton boton-secundario boton-pequeno" data-accion="cancelar" data-id="${o.id_oferta}">Cancelar</button>`);
            }
            acciones.push(`<button type="button" class="boton-icono" data-accion="contacto" data-id="${o.id_oferta}" title="Contactar al vendedor" aria-label="Contactar a ${esc(o.vendedor)}">
                <svg class="icono" aria-hidden="true"><use href="#i-correo"></use></svg></button>`);
            return `
                <tr>
                    <td><span class="fecha-tabla">${esc(MU().fecha(o.fecha_oferta))}</span></td>
                    <td>${celdaMaterial(o)}</td>
                    <td>${persona(o.vendedor, o.vendedor_foto, 'Vendedor')}</td>
                    <td class="texto-derecha">${celdaCantidad(o)}</td>
                    <td class="texto-derecha">${celdaOferta(o)}</td>
                    <td>${MU().estado(o.estado)}${o.estado === 'Aceptada' ? '<small class="bloque">Coordina la entrega con el vendedor</small>' : ''}</td>
                    <td class="texto-derecha"><div class="acciones-tabla">${acciones.join('')}</div></td>
                </tr>`;
        }).join('');
        mostrarVacio('enviadas', lista.length);
    }

    function renderOperaciones(usuario) {
        const lista = Eco.DB.consultar(
            `${SQL_BASE} WHERE t.id_transaccion IS NOT NULL AND (pb.id_vendedor = ? OR o.id_comprador = ?)
               AND (? = '' OR t.estado = ?)
             ORDER BY t.fecha_acuerdo DESC`,
            [usuario.id_usuario, usuario.id_usuario, filtroEstado.operaciones, filtroEstado.operaciones]
        );
        document.getElementById('tabla-operaciones-body').innerHTML = lista.map((o) => {
            const esVenta = o.id_vendedor === usuario.id_usuario;
            return `
                <tr>
                    <td><span class="fecha-tabla">${esc(MU().fecha(o.fecha_acuerdo))}</span></td>
                    <td><span class="insignia ${esVenta ? 'insignia-venta' : 'insignia-compra'}">${esVenta ? 'Venta' : 'Compra'}</span></td>
                    <td>${celdaMaterial(o)}</td>
                    <td>${esVenta ? persona(o.comprador, o.comprador_foto, o.comprador_tipo) : persona(o.vendedor, o.vendedor_foto, 'Vendedor')}</td>
                    <td class="texto-derecha">${celdaCantidad(o)}</td>
                    <td class="texto-derecha"><strong>${esc(MU().dinero(o.total))}</strong></td>
                    <td>${MU().estado(o.estado_transaccion)}</td>
                    <td><span class="fecha-tabla">${o.fecha_cierre ? esc(MU().fecha(o.fecha_cierre)) : '—'}</span></td>
                </tr>`;
        }).join('');
        mostrarVacio('operaciones', lista.length);
    }

    function mostrarVacio(pestana, cantidad) {
        document.getElementById(`${pestana}-vacio`).hidden = cantidad > 0;
        document.getElementById(`tabla-${pestana}-body`).closest('.tabla-contenedor').hidden = cantidad === 0;
    }

    function renderResumen(usuario) {
        const r = Eco.DB.consultarUno(
            `SELECT
                SUM(CASE WHEN o.estado = 'Pendiente' THEN 1 ELSE 0 END) AS pendientes,
                SUM(CASE WHEN t.estado = 'En curso' THEN 1 ELSE 0 END) AS en_curso,
                SUM(CASE WHEN t.estado = 'Completada' THEN 1 ELSE 0 END) AS completadas,
                COALESCE(SUM(CASE WHEN t.estado = 'Completada' THEN o.cantidad * o.precio_unitario END), 0) AS valor
             FROM ofertas o
             JOIN publicaciones pb ON pb.id_publicacion = o.id_publicacion
             LEFT JOIN transacciones t ON t.id_oferta = o.id_oferta
             WHERE pb.id_vendedor = ? OR o.id_comprador = ?`,
            [usuario.id_usuario, usuario.id_usuario]
        );
        document.getElementById('ofertas-pendientes').textContent = Eco.Util.formatearNumero(r.pendientes || 0);
        document.getElementById('ofertas-en-curso').textContent = Eco.Util.formatearNumero(r.en_curso || 0);
        document.getElementById('ofertas-completadas').textContent = Eco.Util.formatearNumero(r.completadas || 0);
        document.getElementById('ofertas-valor').textContent = MU().dinero(r.valor);
        document.getElementById('ofertas-valor-etiqueta').textContent =
            Eco.Sesion.tiene('ofertas.recibir') ? 'Total vendido' : 'Total comprado';
    }

    /** Número de ofertas por responder junto a "Ofertas" en el menú (vendedores). */
    function actualizarContadorMenu(usuario) {
        const contador = document.getElementById('menu-contador-ofertas');
        const total = Eco.Sesion.tiene('ofertas.recibir')
            ? Eco.DB.contar(
                `SELECT COUNT(*) AS total FROM ofertas o JOIN publicaciones pb ON pb.id_publicacion = o.id_publicacion
                 WHERE pb.id_vendedor = ? AND o.estado = 'Pendiente'`, [usuario.id_usuario])
            : 0;
        contador.hidden = total === 0;
        contador.textContent = String(total);
        contador.setAttribute('aria-label', `${total} ofertas por responder`);
    }

    function render() {
        if (!Eco.Sesion.puedeVerVista('ofertas')) return;
        const usuario = Eco.Sesion.usuarioActual();
        const disponibles = pestanasDisponibles();
        if (!disponibles.includes(pestanaActual)) pestanaActual = disponibles[0];

        document.querySelectorAll('#vista-ofertas .pestana').forEach((pestana) => {
            const nombre = pestana.dataset.pestana;
            pestana.hidden = !disponibles.includes(nombre);
            pestana.classList.toggle('activa', nombre === pestanaActual);
            pestana.setAttribute('aria-selected', String(nombre === pestanaActual));
        });
        ['recibidas', 'enviadas', 'operaciones'].forEach((nombre) => {
            document.getElementById(`ofertas-panel-${nombre}`).hidden = nombre !== pestanaActual;
        });
        document.getElementById('pestana-operaciones-texto').textContent =
            Eco.Sesion.tiene('ofertas.recibir') ? 'Historial de ventas' : 'Mis compras';

        renderResumen(usuario);
        actualizarContadorMenu(usuario);
        if (disponibles.includes('recibidas')) renderRecibidas(usuario);
        if (disponibles.includes('enviadas')) renderEnviadas(usuario);
        renderOperaciones(usuario);
    }

    /* ------------------------------ Acciones ------------------------------ */
    function obtener(id) {
        return Eco.DB.consultarUno(`${SQL_BASE} WHERE o.id_oferta = ?`, [id]);
    }

    function esVendedor(oferta, usuario) {
        return oferta && usuario && oferta.id_vendedor === usuario.id_usuario;
    }

    function esComprador(oferta, usuario) {
        return oferta && usuario && oferta.id_comprador === usuario.id_usuario;
    }

    async function aceptar(id) {
        const usuario = Eco.Sesion.exigir('ofertas.recibir');
        const oferta = obtener(id);
        if (!esVendedor(oferta, usuario)) throw new Error('Solo el vendedor puede aceptar esta oferta.');
        const confirmado = await Eco.App.confirmar({
            titulo: 'Aceptar oferta',
            mensaje: `Venderás ${MU().cantidad(oferta.cantidad, oferta.unidad)} de "${oferta.nombre_material}" a ${oferta.comprador} ` +
                `por ${MU().dinero(oferta.total)}. La cantidad se descontará de tu publicación.`,
            textoConfirmar: 'Aceptar oferta',
            peligro: false
        });
        if (!confirmado) return;

        // El servidor vuelve a comprobar todo y, en una sola transacción, descuenta la
        // cantidad de la publicación, acepta la oferta y registra la transacción.
        await Eco.Nube.rpc('responder_oferta', { p_id: id, p_accion: 'aceptar' });
        await Eco.App.despuesDeCambio('Oferta aceptada. La operación quedó registrada y la cantidad se descontó.');
    }

    async function rechazar(id) {
        const usuario = Eco.Sesion.exigir('ofertas.recibir');
        const oferta = obtener(id);
        if (!esVendedor(oferta, usuario)) throw new Error('Solo el vendedor puede rechazar esta oferta.');
        const confirmado = await Eco.App.confirmar({
            titulo: 'Rechazar oferta',
            mensaje: `¿Rechazar la oferta de ${oferta.comprador} por "${oferta.nombre_material}"?`,
            textoConfirmar: 'Rechazar',
            peligro: true
        });
        if (!confirmado) return;
        await Eco.Nube.rpc('responder_oferta', { p_id: id, p_accion: 'rechazar' });
        await Eco.App.despuesDeCambio('Oferta rechazada.');
    }

    async function cancelar(id) {
        const usuario = Eco.Sesion.usuarioActual();
        const oferta = obtener(id);
        const vendedor = esVendedor(oferta, usuario) && Eco.Sesion.tiene('ofertas.recibir');
        const comprador = esComprador(oferta, usuario) && Eco.Sesion.tiene('ofertas.enviar');
        if (!vendedor && !comprador) throw new Error('No puedes cancelar esta oferta.');
        if (oferta.estado === 'Pendiente' && !comprador) throw new Error('El vendedor debe rechazar la oferta, no cancelarla.');

        const aceptada = oferta.estado === 'Aceptada';
        const confirmado = await Eco.App.confirmar({
            titulo: aceptada ? 'Cancelar negociación' : 'Cancelar oferta',
            mensaje: aceptada
                ? `La operación por "${oferta.nombre_material}" se cancelará y ${MU().cantidad(oferta.cantidad, oferta.unidad)} volverán a estar disponibles en la publicación.`
                : `¿Cancelar tu oferta por "${oferta.nombre_material}"?`,
            textoConfirmar: 'Cancelar oferta',
            textoCancelar: 'Volver',
            peligro: true
        });
        if (!confirmado) return;

        // Si estaba aceptada, el servidor devuelve la cantidad a la publicación.
        await Eco.Nube.rpc('responder_oferta', { p_id: id, p_accion: 'cancelar' });
        await Eco.App.despuesDeCambio(aceptada ? 'Negociación cancelada. La cantidad volvió a la publicación.' : 'Oferta cancelada.');
    }

    async function completar(id) {
        const usuario = Eco.Sesion.exigir('ofertas.recibir');
        const oferta = obtener(id);
        if (!esVendedor(oferta, usuario)) throw new Error('Solo el vendedor puede completar la operación.');
        const confirmado = await Eco.App.confirmar({
            titulo: 'Completar operación',
            mensaje: `Confirma que entregaste ${MU().cantidad(oferta.cantidad, oferta.unidad)} de "${oferta.nombre_material}" a ${oferta.comprador} y recibiste el pago.`,
            textoConfirmar: 'Marcar completada',
            peligro: false
        });
        if (!confirmado) return;
        await Eco.Nube.rpc('responder_oferta', { p_id: id, p_accion: 'completar' });
        await Eco.App.despuesDeCambio('Operación completada y registrada en el historial de ventas.');
    }

    function contacto(id) {
        const usuario = Eco.Sesion.usuarioActual();
        const oferta = obtener(id);
        if (!oferta) return;
        const soyVendedor = esVendedor(oferta, usuario);
        if (!soyVendedor && !esComprador(oferta, usuario)) return;
        const nombre = soyVendedor ? oferta.comprador : oferta.vendedor;
        document.getElementById('titulo-modal-contacto').textContent = nombre;
        document.getElementById('contacto-contenido').innerHTML = `
            <div class="detalle-vendedor">
                ${Eco.Sesion.avatar(nombre, soyVendedor ? oferta.comprador_foto : oferta.vendedor_foto)}
                <div><strong>${esc(nombre)}</strong><small>${esc(soyVendedor ? oferta.comprador_tipo : 'Vendedor')} · ${esc(oferta.nombre_material)}</small></div>
            </div>
            <div class="detalle-contacto">
                ${MU().contacto(nombre, soyVendedor ? oferta.comprador_correo : oferta.vendedor_correo,
                    soyVendedor ? oferta.comprador_telefono : oferta.vendedor_telefono)}
            </div>
            <p class="texto-tenue nota-contacto">EcoGestión no envía mensajes: el contacto se hace por correo o teléfono.</p>`;
        Eco.App.abrirModal('modal-contacto');
    }

    async function ejecutar(accion, id) {
        try {
            if (accion === 'aceptar') await aceptar(id);
            if (accion === 'rechazar') await rechazar(id);
            if (accion === 'cancelar') await cancelar(id);
            if (accion === 'completar') await completar(id);
            if (accion === 'contacto') contacto(id);
        } catch (error) {
            console.warn(error);
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, error.message || 'No se pudo completar la acción.'), 'error');
            render();
        }
    }

    function init() {
        document.querySelectorAll('#vista-ofertas .pestana').forEach((pestana) => {
            pestana.addEventListener('click', () => {
                pestanaActual = pestana.dataset.pestana;
                render();
            });
        });
        ['recibidas', 'enviadas', 'operaciones'].forEach((nombre) => {
            document.getElementById(`tabla-${nombre}-body`).addEventListener('click', (evento) => {
                const boton = evento.target.closest('[data-accion]');
                if (boton) ejecutar(boton.dataset.accion, Number(boton.dataset.id));
            });
            document.getElementById(`filtro-${nombre}`).addEventListener('change', (evento) => {
                filtroEstado[nombre] = evento.target.value;
                render();
            });
        });
    }

    Eco.Ofertas = { init, render };
})();
