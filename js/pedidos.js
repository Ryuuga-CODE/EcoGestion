/* ============================================================
   EcoGestión · Pedidos de las empresas recicladoras
   El material que recogen los repartidores queda en el centro
   de acopio del municipio. Las empresas recicladoras del mismo
   municipio lo piden; el administrador aprueba (queda reservado)
   y luego registra la entrega, que crea la salida del inventario.
     Empresa: material disponible, pedidos y perfil empresarial.
     Administrador: todos los pedidos del municipio.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const esc = (valor) => Eco.Util.escaparHtml(valor);
    const C = () => Eco.Comun;

    const CAMPOS_EMPRESA = ['empresa-razon', 'empresa-nit', 'empresa-telefono', 'empresa-correo',
        'empresa-direccion', 'empresa-descripcion'];
    const CAMPOS_PEDIDO = ['pedido-cantidad', 'pedido-precio', 'pedido-mensaje'];

    const filtrosAdmin = { estado: 'abiertos' };
    let materialPedido = null;

    const SQL_PEDIDOS = `
        SELECT pe.*, e.razon_social, e.nit, e.telefono AS empresa_telefono, e.correo_contacto,
               m.nombre AS material, m.categoria, m.unidad_medida,
               pe.cantidad * pe.precio_unitario AS valor
        FROM pedidos_empresa pe
        JOIN empresas e ON e.id_empresa = pe.id_empresa
        LEFT JOIN materiales m ON m.id_material = pe.id_material`;

    const TEXTO_ESTADO = {
        Pendiente: 'Por responder',
        Aprobado: 'Aprobado',
        Entregado: 'Entregado',
        Rechazado: 'Rechazado',
        Cancelado: 'Cancelado'
    };

    function celdaRespuesta(p) {
        const partes = [];
        if (p.mensaje) partes.push(`<small class="bloque texto-tenue">Empresa: ${esc(p.mensaje)}</small>`);
        if (p.respuesta) partes.push(`<small class="bloque texto-tenue">Municipio: ${esc(p.respuesta)}</small>`);
        return partes.join('');
    }

    /* ------------------------------ Empresa ------------------------------ */
    function empresaActual() {
        const usuario = Eco.Sesion.usuarioActual();
        return usuario ? Eco.DB.consultarUno('SELECT * FROM empresas WHERE id_usuario = ?', [usuario.id_usuario]) : null;
    }

    function disponibles() {
        return Eco.DB.consultar(
            `SELECT *, ROUND(existencia - comprometido, 2) AS disponible
             FROM existencias_municipio ORDER BY categoria, nombre COLLATE NOCASE`);
    }

    function renderEmpresa() {
        const usuario = Eco.Sesion.usuarioActual();
        if (!usuario) return;
        const empresa = empresaActual();
        document.getElementById('empresa-municipio').textContent = Eco.Lugares.nombre(usuario.codigo_municipio);
        document.getElementById('empresa-aviso-sin-perfil').hidden = Boolean(empresa);

        const lista = disponibles().filter((m) => Number(m.disponible) > 0);
        document.getElementById('tabla-disponible-body').innerHTML = lista.map((m) => `
            <tr>
                <td><strong>${esc(m.nombre)}</strong></td>
                <td>${C().insigniaTipo(m.categoria)}</td>
                <td class="texto-derecha"><strong>${esc(C().cantidad(m.disponible, m.unidad_medida))}</strong></td>
                <td class="texto-derecha"><button type="button" class="boton boton-primario boton-pequeno" data-accion="pedir" data-id="${m.id_material}"${empresa ? '' : ' disabled'}>Pedir</button></td>
            </tr>`).join('');
        document.getElementById('disponible-vacio').hidden = lista.length > 0;
        document.getElementById('tabla-disponible-body').closest('.tabla-contenedor').hidden = lista.length === 0;

        const pedidos = empresa
            ? Eco.DB.consultar(`${SQL_PEDIDOS} WHERE pe.id_empresa = ?
                 ORDER BY CASE pe.estado WHEN 'Aprobado' THEN 1 WHEN 'Pendiente' THEN 2 ELSE 3 END, pe.fecha_pedido DESC`, [empresa.id_empresa])
            : [];
        document.getElementById('tabla-mis-pedidos-body').innerHTML = pedidos.map((p) => `
            <tr>
                <td><strong>#${p.id_pedido}</strong><small class="bloque">${esc(Eco.Util.formatearFecha(p.fecha_pedido))}</small></td>
                <td><strong>${esc(p.material)}</strong>${celdaRespuesta(p)}</td>
                <td class="texto-derecha">${esc(C().cantidad(p.cantidad, p.unidad_medida))}</td>
                <td class="texto-derecha">${esc(C().dinero(p.valor))}<small class="bloque">${esc(C().precio(p.precio_unitario, p.unidad_medida))}</small></td>
                <td>${C().estado(p.estado, TEXTO_ESTADO[p.estado])}
                    ${p.estado === 'Aprobado' ? '<small class="bloque">Coordina la recogida con el municipio.</small>' : ''}</td>
                <td class="texto-derecha">${['Pendiente', 'Aprobado'].includes(p.estado)
                    ? `<button type="button" class="boton boton-secundario boton-pequeno" data-accion="cancelar" data-id="${p.id_pedido}">Cancelar</button>`
                    : '<span class="texto-tenue">—</span>'}</td>
            </tr>`).join('');
        document.getElementById('mis-pedidos-vacio').hidden = pedidos.length > 0;
        document.getElementById('tabla-mis-pedidos-body').closest('.tabla-contenedor').hidden = pedidos.length === 0;

        const contar = (estado) => pedidos.filter((p) => p.estado === estado).length;
        document.getElementById('empresa-pendientes').textContent = contar('Pendiente');
        document.getElementById('empresa-aprobados').textContent = contar('Aprobado');
        document.getElementById('empresa-entregados').textContent = contar('Entregado');
        document.getElementById('empresa-invertido').textContent =
            C().dinero(pedidos.filter((p) => p.estado === 'Entregado').reduce((s, p) => s + Number(p.valor), 0));

        renderPerfilEmpresa(empresa, usuario);
    }

    function renderPerfilEmpresa(empresa, usuario) {
        const formulario = document.getElementById('form-empresa');
        document.getElementById('btn-guardar-empresa-texto').textContent = empresa ? 'Guardar cambios' : 'Crear perfil empresarial';
        if (formulario.contains(document.activeElement)) return;
        const valores = {
            'empresa-razon': empresa ? empresa.razon_social : '',
            'empresa-nit': empresa ? empresa.nit : '',
            'empresa-telefono': empresa ? empresa.telefono : usuario.telefono,
            'empresa-correo': empresa ? empresa.correo_contacto : usuario.correo,
            'empresa-direccion': empresa ? empresa.direccion : usuario.direccion,
            'empresa-descripcion': empresa ? empresa.descripcion : ''
        };
        Object.entries(valores).forEach(([id, valor]) => { document.getElementById(id).value = valor || ''; });
    }

    async function guardarPerfil(evento) {
        evento.preventDefault();
        try {
            Eco.Sesion.exigir('empresa.gestionar');
        } catch (error) {
            Eco.Util.mostrarAviso(error.message, 'error');
            return;
        }
        Eco.Util.limpiarErroresCampos(CAMPOS_EMPRESA);
        const valor = (id) => document.getElementById(id).value.replace(/\s+/g, ' ').trim();
        const datos = {
            razon: valor('empresa-razon'), nit: valor('empresa-nit'), telefono: valor('empresa-telefono'),
            correo: valor('empresa-correo'), direccion: valor('empresa-direccion'),
            descripcion: document.getElementById('empresa-descripcion').value.trim()
        };
        let valido = true;
        const error = (id, mensaje) => { Eco.Util.mostrarErrorCampo(id, mensaje); valido = false; };
        if (datos.razon.length < 2 || datos.razon.length > 120) error('empresa-razon', 'Escribe el nombre de la empresa (entre 2 y 120 caracteres).');
        if (datos.nit && !/^[0-9.\-\s]{5,20}$/.test(datos.nit)) error('empresa-nit', 'El NIT solo puede tener números, puntos y guion.');
        if (datos.telefono && !/^[0-9+()\s-]{7,30}$/.test(datos.telefono)) error('empresa-telefono', 'Escribe un teléfono válido.');
        if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) error('empresa-correo', 'Escribe un correo válido.');
        if (datos.direccion.length > 150) error('empresa-direccion', 'La dirección no puede superar 150 caracteres.');
        if (datos.descripcion.length > 400) error('empresa-descripcion', 'La descripción no puede superar 400 caracteres.');
        if (!valido) return;
        try {
            await Eco.Nube.rpc('guardar_empresa', {
                p_razon_social: datos.razon, p_nit: datos.nit || null, p_telefono: datos.telefono || null,
                p_correo: datos.correo || null, p_direccion: datos.direccion || null, p_descripcion: datos.descripcion || null
            });
            document.activeElement.blur();
            await Eco.App.despuesDeCambio('Perfil empresarial guardado.');
        } catch (errorGuardar) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(errorGuardar, 'No se pudo guardar el perfil empresarial.'), 'error');
        }
    }

    function abrirPedido(id) {
        const m = disponibles().find((x) => x.id_material === id);
        if (!m || !empresaActual()) return;
        materialPedido = m;
        document.getElementById('form-pedido').reset();
        Eco.Util.limpiarErroresCampos(CAMPOS_PEDIDO);
        document.getElementById('titulo-modal-pedido').textContent = `Pedir ${m.nombre}`;
        document.getElementById('pedido-resumen').innerHTML = `
            <div><strong>${esc(m.nombre)}</strong><small>Centro de acopio de ${esc(Eco.Lugares.nombre(m.codigo_municipio))}</small></div>
            <div>${C().insigniaTipo(m.categoria)} <span class="texto-tenue">Disponible: <strong>${esc(C().cantidad(m.disponible, m.unidad_medida))}</strong></span></div>`;
        document.getElementById('pedido-unidad').textContent = m.unidad_medida;
        document.getElementById('pedido-precio-unidad').textContent = `por ${m.unidad_medida === 'unidades' ? 'unidad' : m.unidad_medida === 'litros' ? 'litro' : 'kg'}`;
        document.getElementById('pedido-cantidad').step = m.unidad_medida === 'unidades' ? '1' : '0.01';
        actualizarTotal();
        Eco.App.abrirModal('modal-pedido');
    }

    function actualizarTotal() {
        const cantidad = Eco.Util.normalizarCantidad(document.getElementById('pedido-cantidad').value);
        const precio = Eco.Util.normalizarCantidad(document.getElementById('pedido-precio').value);
        document.getElementById('pedido-total').textContent = cantidad && precio ? C().dinero(cantidad * precio) : '—';
    }

    async function enviarPedido(evento) {
        evento.preventDefault();
        const m = materialPedido;
        if (!m) return;
        Eco.Util.limpiarErroresCampos(CAMPOS_PEDIDO);
        const cantidad = C().leerCantidad(document.getElementById('pedido-cantidad').value, m.unidad_medida, Number(m.disponible));
        const precio = C().leerPrecio(document.getElementById('pedido-precio').value);
        const mensaje = document.getElementById('pedido-mensaje').value.trim();
        let valido = true;
        if (cantidad.error) { Eco.Util.mostrarErrorCampo('pedido-cantidad', cantidad.error); valido = false; }
        if (precio.error) { Eco.Util.mostrarErrorCampo('pedido-precio', precio.error); valido = false; }
        if (mensaje.length > 300) { Eco.Util.mostrarErrorCampo('pedido-mensaje', 'El mensaje no puede superar 300 caracteres.'); valido = false; }
        if (!valido) return;
        try {
            await Eco.Nube.rpc('crear_pedido', {
                p_id_material: m.id_material, p_cantidad: cantidad.valor, p_precio: precio.valor, p_mensaje: mensaje || null
            });
            Eco.App.cerrarModal('modal-pedido');
            await Eco.App.despuesDeCambio('Pedido enviado al municipio.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo enviar el pedido.'), 'error');
        }
    }

    async function cancelarPedido(id) {
        const motivo = await Eco.App.pedirTexto({
            etiqueta: `Pedido #${id}`, titulo: 'Cancelar pedido', campo: 'Motivo (opcional)',
            textoConfirmar: 'Cancelar pedido', peligro: true
        });
        if (motivo === null) return;
        await responder(id, 'cancelar', motivo, 'Pedido cancelado.');
    }

    /* ---------------------------- Administrador ---------------------------- */
    function consultaAdmin() {
        const condicion = {
            abiertos: "pe.estado IN ('Pendiente', 'Aprobado')",
            cerrados: "pe.estado IN ('Rechazado', 'Cancelado')"
        }[filtrosAdmin.estado] || 'pe.estado = ?';
        const parametros = ['abiertos', 'cerrados'].includes(filtrosAdmin.estado) ? [] : [filtrosAdmin.estado];
        return Eco.DB.consultar(
            `${SQL_PEDIDOS} WHERE ${condicion}
             ORDER BY CASE pe.estado WHEN 'Pendiente' THEN 1 WHEN 'Aprobado' THEN 2 ELSE 3 END, pe.fecha_pedido DESC`,
            parametros);
    }

    function renderAdmin() {
        const lista = consultaAdmin();
        const libre = {};
        Eco.DB.consultar('SELECT id_material, existencia - comprometido AS libre FROM existencias_municipio')
            .forEach((x) => { libre[x.id_material] = Number(x.libre); });
        document.getElementById('tabla-pedidos-body').innerHTML = lista.map((p) => {
            let acciones = '<span class="texto-tenue">—</span>';
            if (p.estado === 'Pendiente') {
                const alcanza = (libre[p.id_material] || 0) + 0.000001 >= Number(p.cantidad);
                acciones = `
                    <button type="button" class="boton boton-primario boton-pequeno" data-accion="aprobar" data-id="${p.id_pedido}"${alcanza ? '' : ' disabled title="No hay existencias libres suficientes"'}>Aprobar</button>
                    <button type="button" class="boton boton-secundario boton-pequeno" data-accion="rechazar" data-id="${p.id_pedido}">Rechazar</button>`;
            } else if (p.estado === 'Aprobado') {
                acciones = `
                    <button type="button" class="boton boton-primario boton-pequeno" data-accion="entregar" data-id="${p.id_pedido}">Registrar entrega</button>
                    <button type="button" class="boton boton-secundario boton-pequeno" data-accion="rechazar" data-id="${p.id_pedido}">Anular</button>`;
            }
            return `
                <tr>
                    <td><strong>#${p.id_pedido}</strong><small class="bloque">${esc(Eco.Util.formatearFecha(p.fecha_pedido))}</small></td>
                    <td><strong>${esc(p.razon_social)}</strong>${p.nit ? `<small class="bloque">NIT ${esc(p.nit)}</small>` : ''}
                        <div class="detalle-contacto">${C().contacto(p.razon_social, p.correo_contacto, p.empresa_telefono)}</div></td>
                    <td><strong>${esc(p.material)}</strong>${celdaRespuesta(p)}</td>
                    <td class="texto-derecha">${esc(C().cantidad(p.cantidad, p.unidad_medida))}
                        ${p.estado === 'Pendiente' ? `<small class="bloque texto-tenue">Libre: ${esc(C().cantidad(Math.max(libre[p.id_material] || 0, 0), p.unidad_medida))}</small>` : ''}</td>
                    <td class="texto-derecha">${esc(C().dinero(p.valor))}<small class="bloque">${esc(C().precio(p.precio_unitario, p.unidad_medida))}</small></td>
                    <td>${C().estado(p.estado, TEXTO_ESTADO[p.estado])}</td>
                    <td class="texto-derecha"><div class="acciones-tabla">${acciones}</div></td>
                </tr>`;
        }).join('');
        document.getElementById('ped-conteo').textContent = `${lista.length} ${lista.length === 1 ? 'pedido' : 'pedidos'}`;
        document.getElementById('pedidos-vacio').hidden = lista.length > 0;
        document.getElementById('tabla-pedidos-body').closest('.tabla-contenedor').hidden = lista.length === 0;

        const r = Eco.DB.consultarUno(
            `SELECT SUM(CASE WHEN estado = 'Pendiente' THEN 1 ELSE 0 END) AS pendientes,
                    SUM(CASE WHEN estado = 'Aprobado' THEN 1 ELSE 0 END) AS aprobados,
                    SUM(CASE WHEN estado = 'Entregado' THEN 1 ELSE 0 END) AS entregados,
                    COALESCE(SUM(CASE WHEN estado = 'Entregado' THEN cantidad * precio_unitario END), 0) AS valor
             FROM pedidos_empresa`);
        document.getElementById('ped-pendientes').textContent = r.pendientes || 0;
        document.getElementById('ped-aprobados').textContent = r.aprobados || 0;
        document.getElementById('ped-entregados').textContent = r.entregados || 0;
        document.getElementById('ped-valor').textContent = C().dinero(r.valor);
    }

    async function responder(id, accion, respuesta, mensaje) {
        try {
            await Eco.Nube.rpc('responder_pedido', { p_id: id, p_accion: accion, p_respuesta: respuesta || null });
            await Eco.App.despuesDeCambio(mensaje);
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo completar la acción.'), 'error');
        }
    }

    async function accionAdmin(accion, id) {
        const p = Eco.DB.consultarUno(`${SQL_PEDIDOS} WHERE pe.id_pedido = ?`, [id]);
        if (!p) return;
        const detalle = `${C().cantidad(p.cantidad, p.unidad_medida)} de ${p.material} para ${p.razon_social}`;
        if (accion === 'aprobar') {
            const nota = await Eco.App.pedirTexto({
                etiqueta: `Pedido #${id}`, titulo: 'Aprobar pedido',
                mensaje: `${detalle}. El material queda reservado hasta que registres la entrega.`,
                campo: 'Indicaciones para la empresa (opcional)', ayuda: 'Ej. Recoger el martes de 8 a 12 en el centro de acopio.',
                textoConfirmar: 'Aprobar'
            });
            if (nota !== null) await responder(id, 'aprobar', nota, 'Pedido aprobado: el material quedó reservado.');
        } else if (accion === 'rechazar') {
            const motivo = await Eco.App.pedirTexto({
                etiqueta: `Pedido #${id}`, titulo: p.estado === 'Aprobado' ? 'Anular pedido aprobado' : 'Rechazar pedido',
                mensaje: `${detalle}. La empresa verá el motivo.`, obligatorio: true,
                textoConfirmar: p.estado === 'Aprobado' ? 'Anular' : 'Rechazar', peligro: true
            });
            if (motivo !== null) await responder(id, 'rechazar', motivo, 'Pedido rechazado.');
        } else if (accion === 'entregar') {
            const confirmado = await Eco.App.confirmar({
                titulo: 'Registrar entrega',
                mensaje: `¿Se entregaron ${detalle}? Se registrará la salida del inventario.`,
                textoConfirmar: 'Sí, registrar entrega', peligro: false
            });
            if (confirmado) await responder(id, 'entregar', null, 'Entrega registrada y descontada del inventario.');
        }
    }

    function exportar() {
        const lista = consultaAdmin();
        Eco.Util.descargarCSV(`pedidos_empresas_${Eco.Util.fechaHoyIso()}.csv`,
            ['Pedido', 'Fecha', 'Empresa', 'NIT', 'Material', 'Categoría', 'Cantidad', 'Unidad', 'Precio unitario', 'Valor', 'Estado', 'Entrega'],
            lista.map((p) => [p.id_pedido, p.fecha_pedido, p.razon_social, p.nit || '', p.material, p.categoria,
                Eco.Util.numeroCSV(p.cantidad), p.unidad_medida, Eco.Util.numeroCSV(p.precio_unitario),
                Eco.Util.numeroCSV(p.valor), p.estado, p.fecha_entrega || '']));
    }

    function init() {
        document.getElementById('form-empresa').addEventListener('submit', guardarPerfil);
        document.getElementById('form-pedido').addEventListener('submit', enviarPedido);
        ['pedido-cantidad', 'pedido-precio'].forEach((id) => document.getElementById(id).addEventListener('input', actualizarTotal));
        [...CAMPOS_EMPRESA, ...CAMPOS_PEDIDO].forEach((id) => {
            document.getElementById(id).addEventListener('input', () => Eco.Util.limpiarErrorCampo(id));
        });
        document.getElementById('tabla-disponible-body').addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-accion="pedir"]');
            if (boton) abrirPedido(Number(boton.dataset.id));
        });
        document.getElementById('tabla-mis-pedidos-body').addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-accion="cancelar"]');
            if (boton) cancelarPedido(Number(boton.dataset.id));
        });
        document.getElementById('tabla-pedidos-body').addEventListener('click', (evento) => {
            const boton = evento.target.closest('button[data-accion]');
            if (boton) accionAdmin(boton.dataset.accion, Number(boton.dataset.id));
        });
        document.getElementById('ped-filtro-estado').addEventListener('click', (evento) => {
            const chip = evento.target.closest('[data-estado]');
            if (!chip) return;
            filtrosAdmin.estado = chip.dataset.estado;
            document.querySelectorAll('#ped-filtro-estado .chip-filtro').forEach((c) => c.classList.toggle('chip-activo', c === chip));
            renderAdmin();
        });
        document.getElementById('btn-exportar-pedidos').addEventListener('click', exportar);
    }

    Eco.Pedidos = { init, render: renderAdmin, empresa: { render: renderEmpresa } };
})();
