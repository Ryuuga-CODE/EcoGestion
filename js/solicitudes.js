/* ============================================================
   EcoGestión · Solicitudes de recolección
   El corazón del flujo municipal:
     1. El ciudadano solicita que recojan sus residuos separados.
     2. El administrador la asigna a un repartidor del municipio.
     3. El repartidor la recoge y registra los kilos por material:
        cada material entra al inventario del centro de acopio.
   Este módulo dibuja las tres vistas (ciudadano, repartidor y
   administrador) y sus formularios. Todas las escrituras son
   funciones del servidor (Eco.Nube.rpc).
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const esc = (valor) => Eco.Util.escaparHtml(valor);
    const C = () => Eco.Comun;
    const CAMPOS_SOLICITUD = ['solicitud-tipos', 'solicitud-direccion', 'solicitud-fecha', 'solicitud-franja',
        'solicitud-cantidad', 'solicitud-descripcion'];

    const filtrosAdmin = { estado: 'abiertas', texto: '', modo: 'lista' };
    let solicitudActual = null;

    const SQL_SOLICITUDES = `
        SELECT s.*, c.nombre AS ciudadano, c.correo AS ciudadano_correo,
               pc.telefono AS ciudadano_telefono, pc.foto_url AS ciudadano_foto,
               r.nombre AS repartidor, r.correo AS repartidor_correo,
               pr.telefono AS repartidor_telefono, pr.foto_url AS repartidor_foto
        FROM solicitudes_recoleccion s
        LEFT JOIN usuarios c ON c.id_usuario = s.id_ciudadano
        LEFT JOIN perfiles pc ON pc.id_usuario = s.id_ciudadano
        LEFT JOIN usuarios r ON r.id_usuario = s.id_repartidor
        LEFT JOIN perfiles pr ON pr.id_usuario = s.id_repartidor`;

    const TEXTO_ESTADO = {
        Pendiente: 'Sin asignar',
        Asignada: 'Asignada',
        Recolectada: 'Recolectada',
        Cancelada: 'Cancelada',
        Rechazada: 'Rechazada'
    };

    function obtener(id) {
        return Eco.DB.consultarUno(`${SQL_SOLICITUDES} WHERE s.id_solicitud = ?`, [id]);
    }

    function cuando(s) {
        return `${C().fechaCorta(s.fecha_preferida)} · ${s.franja}`;
    }

    function kilos(valor) {
        return `${Eco.Util.formatearCantidad(valor || 0, 'kg')} kg`;
    }

    /* ----------------------------- Tarjetas ----------------------------- */
    function pasos(estado) {
        const orden = ['Pendiente', 'Asignada', 'Recolectada'];
        if (!orden.includes(estado)) return '';
        const actual = orden.indexOf(estado);
        const nombres = ['Recibida', 'Con repartidor', 'Recolectada'];
        return `<ol class="pasos-solicitud" aria-label="Avance de la solicitud">${nombres.map((n, i) =>
            `<li class="${i <= actual ? 'hecho' : ''}${i === actual ? ' actual' : ''}">${n}</li>`).join('')}</ol>`;
    }

    function persona(etiqueta, nombre, foto, correo, telefono) {
        return `<div class="solicitud-persona">
            ${Eco.Sesion.avatar(nombre, foto, 'avatar-mini')}
            <div><small>${esc(etiqueta)}</small><strong>${esc(nombre)}</strong>
            <div class="detalle-contacto">${C().contacto(nombre, correo, telefono)}</div></div>
        </div>`;
    }

    function tarjeta(s, modo) {
        const datos = [
            ['Dirección', esc(s.direccion)],
            ['Cuándo', esc(cuando(s))]
        ];
        if (s.cantidad_estimada) datos.push(['Cantidad aproximada', esc(kilos(s.cantidad_estimada))]);
        if (s.estado === 'Recolectada') datos.push(['Recolectado', `<strong>${esc(kilos(s.kilos_recolectados))}</strong>`]);

        let notaHtml = '';
        if (s.descripcion) notaHtml += `<p class="solicitud-nota"><svg class="icono" aria-hidden="true"><use href="#i-info"></use></svg>${esc(s.descripcion)}</p>`;
        if (s.nota) {
            const etiqueta = s.estado === 'Rechazada' ? 'Motivo del rechazo'
                : s.estado === 'Cancelada' ? 'Motivo' : s.estado === 'Pendiente' ? 'Aviso' : 'Observaciones';
            notaHtml += `<p class="solicitud-nota solicitud-nota-${s.estado === 'Rechazada' ? 'alerta' : 'info'}"><strong>${etiqueta}:</strong> ${esc(s.nota)}</p>`;
        }

        let personaHtml = '';
        let acciones = '';
        if (modo === 'ciudadano') {
            if (s.repartidor && ['Asignada', 'Recolectada'].includes(s.estado)) {
                personaHtml = persona('Repartidor', s.repartidor, s.repartidor_foto, null, s.repartidor_telefono);
            }
            if (['Pendiente', 'Asignada'].includes(s.estado)) {
                acciones = `<button type="button" class="boton boton-secundario boton-pequeno" data-accion="cancelar" data-id="${s.id_solicitud}">Cancelar solicitud</button>`;
            }
        } else if (modo === 'repartidor') {
            personaHtml = persona('Ciudadano', s.ciudadano, s.ciudadano_foto, s.ciudadano_correo, s.ciudadano_telefono);
            acciones = `
                <button type="button" class="boton boton-secundario boton-pequeno" data-accion="devolver" data-id="${s.id_solicitud}">No pude recogerla</button>
                <a class="boton boton-secundario boton-pequeno" target="_blank" rel="noopener"
                   href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${s.direccion}, ${Eco.Lugares.nombre(s.codigo_municipio)}, Colombia`)}">
                   <svg class="icono" aria-hidden="true"><use href="#i-ubicacion"></use></svg>Ver mapa</a>
                <button type="button" class="boton boton-primario boton-pequeno" data-accion="completar" data-id="${s.id_solicitud}">
                    <svg class="icono" aria-hidden="true"><use href="#i-check"></use></svg>Registrar kilos</button>`;
        }

        const vencida = s.estado === 'Asignada' && s.fecha_preferida < Eco.Util.fechaHoyIso();
        return `
            <article class="tarjeta-solicitud" data-estado="${esc(s.estado)}">
                <header class="solicitud-cabecera">
                    <span class="solicitud-numero">Solicitud #${s.id_solicitud}</span>
                    ${vencida ? '<span class="insignia insignia-alerta">Atrasada</span>' : ''}
                    ${C().estado(s.estado, TEXTO_ESTADO[s.estado])}
                </header>
                ${modo === 'ciudadano' ? pasos(s.estado) : ''}
                <div class="publicacion-etiquetas">${C().insigniasTipos(s.tipos_residuo)}</div>
                <dl class="solicitud-datos">${datos.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join('')}</dl>
                ${notaHtml}
                ${personaHtml}
                ${acciones ? `<footer class="publicacion-acciones">${acciones}</footer>` : ''}
            </article>`;
    }

    /* ------------------------------ Ciudadano ------------------------------ */
    function renderCiudadano() {
        const usuario = Eco.Sesion.usuarioActual();
        if (!usuario) return;
        const lista = Eco.DB.consultar(
            `${SQL_SOLICITUDES} WHERE s.id_ciudadano = ?
             ORDER BY CASE s.estado WHEN 'Asignada' THEN 1 WHEN 'Pendiente' THEN 2 ELSE 3 END,
                      s.fecha_solicitud DESC`, [usuario.id_usuario]);
        document.getElementById('lista-mis-solicitudes').innerHTML = lista.map((s) => tarjeta(s, 'ciudadano')).join('');
        document.getElementById('mis-solicitudes-vacio').hidden = lista.length > 0;
        const contar = (estado) => lista.filter((s) => s.estado === estado).length;
        document.getElementById('ciudadano-pendientes').textContent = contar('Pendiente');
        document.getElementById('ciudadano-asignadas').textContent = contar('Asignada');
        document.getElementById('ciudadano-recolectadas').textContent = contar('Recolectada');
        document.getElementById('ciudadano-kilos').textContent =
            kilos(lista.reduce((suma, s) => suma + (s.estado === 'Recolectada' ? Number(s.kilos_recolectados) || 0 : 0), 0));
        document.getElementById('ciudadano-municipio').textContent = Eco.Lugares.nombre(usuario.codigo_municipio);
    }

    function abrirNuevaSolicitud() {
        const usuario = Eco.Sesion.usuarioActual();
        try {
            Eco.Sesion.exigir('solicitudes.crear');
        } catch (error) {
            Eco.Util.mostrarAviso(error.message, 'error');
            return;
        }
        const abiertas = Eco.DB.contar(
            "SELECT COUNT(*) FROM solicitudes_recoleccion WHERE id_ciudadano = ? AND estado IN ('Pendiente', 'Asignada')",
            [usuario.id_usuario]);
        if (abiertas >= 3) {
            Eco.Util.mostrarAviso('Ya tienes 3 solicitudes abiertas. Espera a que se atiendan antes de crear otra.', 'error');
            return;
        }
        document.getElementById('form-solicitud').reset();
        Eco.Util.limpiarErroresCampos(CAMPOS_SOLICITUD);
        document.getElementById('solicitud-direccion').value = usuario.direccion || '';
        document.getElementById('solicitud-municipio').textContent = Eco.Lugares.nombre(usuario.codigo_municipio);
        const fecha = document.getElementById('solicitud-fecha');
        fecha.min = Eco.Util.fechaHoyIso();
        fecha.max = Eco.Util.sumarDias(fecha.min, 60);
        fecha.value = Eco.Util.sumarDias(fecha.min, 1);
        Eco.App.abrirModal('modal-solicitud');
    }

    async function enviarSolicitud(evento) {
        evento.preventDefault();
        Eco.Util.limpiarErroresCampos(CAMPOS_SOLICITUD);
        const tipos = [...document.querySelectorAll('input[name="solicitud-tipo"]:checked')].map((c) => c.value);
        const direccion = document.getElementById('solicitud-direccion').value.replace(/\s+/g, ' ').trim();
        const fecha = document.getElementById('solicitud-fecha').value;
        const franja = document.getElementById('solicitud-franja').value;
        const textoCantidad = document.getElementById('solicitud-cantidad').value.trim();
        const descripcion = document.getElementById('solicitud-descripcion').value.trim();
        let valido = true;
        const error = (id, mensaje) => { Eco.Util.mostrarErrorCampo(id, mensaje); valido = false; };

        if (!tipos.length) error('solicitud-tipos', 'Marca al menos un tipo de residuo.');
        if (direccion.length < 5 || direccion.length > 150) error('solicitud-direccion', 'Escribe la dirección (entre 5 y 150 caracteres).');
        const hoy = Eco.Util.fechaHoyIso();
        if (!Eco.Util.validarFechaIso(fecha) || fecha < hoy || fecha > Eco.Util.sumarDias(hoy, 60)) {
            error('solicitud-fecha', 'Elige una fecha entre hoy y los próximos 60 días.');
        }
        let cantidad = null;
        if (textoCantidad) {
            const leida = C().leerCantidad(textoCantidad, 'kg', 5000);
            if (leida.error) error('solicitud-cantidad', leida.error.replace('lo disponible', 'el máximo'));
            else cantidad = leida.valor;
        }
        if (descripcion.length > 300) error('solicitud-descripcion', 'Las indicaciones no pueden superar 300 caracteres.');
        if (!valido) return;

        try {
            await Eco.Nube.rpc('crear_solicitud', {
                p_direccion: direccion,
                p_tipos: tipos,
                p_descripcion: descripcion || null,
                p_cantidad_estimada: cantidad,
                p_fecha_preferida: fecha,
                p_franja: franja
            });
            Eco.App.cerrarModal('modal-solicitud');
            await Eco.App.despuesDeCambio('Solicitud enviada. El municipio te asignará un repartidor.');
        } catch (errorEnvio) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(errorEnvio, 'No se pudo enviar la solicitud.'), 'error');
        }
    }

    async function cancelar(id) {
        const s = obtener(id);
        if (!s) return;
        const motivo = await Eco.App.pedirTexto({
            etiqueta: `Solicitud #${id}`,
            titulo: 'Cancelar solicitud',
            mensaje: s.estado === 'Asignada' ? `${s.repartidor} ya la tiene en su ruta. Se le quitará de inmediato.` : '',
            campo: 'Motivo (opcional)',
            ayuda: 'Ej. Ya lo llevé al punto de acopio.',
            textoConfirmar: 'Cancelar solicitud',
            peligro: true
        });
        if (motivo === null) return;
        try {
            await Eco.Nube.rpc('cancelar_solicitud', { p_id: id, p_motivo: motivo || null });
            await Eco.App.despuesDeCambio('Solicitud cancelada.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo cancelar la solicitud.'), 'error');
        }
    }

    /* ------------------------------ Repartidor ------------------------------ */
    function renderRepartidor() {
        const usuario = Eco.Sesion.usuarioActual();
        if (!usuario) return;
        const asignadas = Eco.DB.consultar(
            `${SQL_SOLICITUDES} WHERE s.id_repartidor = ? AND s.estado = 'Asignada'
             ORDER BY s.fecha_preferida, CASE s.franja WHEN 'Mañana' THEN 1 WHEN 'Tarde' THEN 2 ELSE 3 END`,
            [usuario.id_usuario]);
        document.getElementById('lista-rutas').innerHTML = asignadas.map((s) => tarjeta(s, 'repartidor')).join('');
        document.getElementById('rutas-vacio').hidden = asignadas.length > 0;

        const hoy = Eco.Util.fechaHoyIso();
        const mes = hoy.slice(0, 7);
        const resumen = Eco.DB.consultarUno(
            `SELECT COUNT(*) AS total, COALESCE(SUM(kilos_recolectados), 0) AS kilos
             FROM solicitudes_recoleccion
             WHERE id_repartidor = ? AND estado = 'Recolectada' AND substr(fecha_cierre, 1, 7) = ?`,
            [usuario.id_usuario, mes]);
        document.getElementById('rutas-asignadas').textContent = asignadas.length;
        document.getElementById('rutas-hoy').textContent = asignadas.filter((s) => s.fecha_preferida <= hoy).length;
        document.getElementById('rutas-mes').textContent = resumen.total;
        document.getElementById('rutas-kilos').textContent = kilos(resumen.kilos);

        const historial = Eco.DB.consultar(
            `SELECT r.fecha, r.cantidad, r.unidad_medida, r.id_solicitud, m.nombre AS material, m.categoria
             FROM recolecciones r JOIN materiales m ON m.id_material = r.id_material
             WHERE r.id_usuario = ? ORDER BY r.fecha DESC, r.id_recoleccion DESC LIMIT 50`, [usuario.id_usuario]);
        document.getElementById('tabla-rutas-historial').innerHTML = historial.map((h) => `
            <tr>
                <td><span class="fecha-tabla">${esc(Eco.Util.formatearFecha(h.fecha))}</span></td>
                <td><strong>${esc(h.material)}</strong><small class="bloque">${esc(h.categoria)}</small></td>
                <td class="texto-derecha">${esc(C().cantidad(h.cantidad, h.unidad_medida))}</td>
                <td>${h.id_solicitud ? `#${h.id_solicitud}` : '<span class="texto-tenue">En el centro de acopio</span>'}</td>
            </tr>`).join('');
        document.getElementById('rutas-historial-vacio').hidden = historial.length > 0;
        document.getElementById('tabla-rutas-historial').closest('.tabla-contenedor').hidden = historial.length === 0;
    }

    async function devolver(id) {
        const motivo = await Eco.App.pedirTexto({
            etiqueta: `Solicitud #${id}`,
            titulo: 'No pude recogerla',
            mensaje: 'La solicitud vuelve al administrador para asignarla de nuevo. El ciudadano verá el motivo.',
            campo: '¿Qué pasó?',
            ayuda: 'Ej. Nadie atendió en la dirección.',
            obligatorio: true,
            textoConfirmar: 'Devolver solicitud'
        });
        if (motivo === null) return;
        try {
            await Eco.Nube.rpc('devolver_solicitud', { p_id: id, p_motivo: motivo });
            await Eco.App.despuesDeCambio('Solicitud devuelta al administrador.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo devolver la solicitud.'), 'error');
        }
    }

    /* -------------------------- Registrar los kilos -------------------------- */
    function materialesMunicipio() {
        return Eco.DB.consultar('SELECT id_material, nombre, categoria, unidad_medida FROM materiales ORDER BY categoria, nombre COLLATE NOCASE');
    }

    function lineaMaterial(materiales, seleccionado) {
        const opciones = materiales.map((m) =>
            `<option value="${m.id_material}" data-unidad="${esc(m.unidad_medida)}"${m.id_material === seleccionado ? ' selected' : ''}>
                ${esc(m.nombre)} · ${esc(m.categoria)}</option>`).join('');
        return `<div class="linea-material">
            <select aria-label="Material" data-campo="material"><option value="">Material…</option>${opciones}</select>
            <div class="campo-con-sufijo">
                <input type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0" aria-label="Cantidad" data-campo="cantidad">
                <span data-campo="unidad">kg</span>
            </div>
            <button type="button" class="boton-icono boton-icono-peligro" data-accion="quitar" title="Quitar" aria-label="Quitar material">
                <svg class="icono" aria-hidden="true"><use href="#i-eliminar"></use></svg></button>
        </div>`;
    }

    function actualizarLineas() {
        const lineas = [...document.querySelectorAll('#completar-lineas .linea-material')];
        let total = 0;
        lineas.forEach((linea) => {
            const opcion = linea.querySelector('[data-campo="material"]').selectedOptions[0];
            const unidad = opcion && opcion.dataset.unidad ? opcion.dataset.unidad : 'kg';
            linea.querySelector('[data-campo="unidad"]').textContent = unidad;
            const valor = Eco.Util.normalizarCantidad(linea.querySelector('[data-campo="cantidad"]').value);
            if (unidad === 'kg' && valor) total += valor;
        });
        document.querySelectorAll('#completar-lineas [data-accion="quitar"]').forEach((boton) => { boton.disabled = lineas.length === 1; });
        document.getElementById('completar-total').textContent = kilos(total);
    }

    function abrirCompletar(id) {
        const s = obtener(id);
        if (!s || s.estado !== 'Asignada') return;
        const materiales = materialesMunicipio();
        if (!materiales.length) {
            Eco.Util.mostrarAviso('El centro de acopio todavía no tiene materiales. El administrador debe crearlos en “Materiales”.', 'error');
            return;
        }
        solicitudActual = id;
        document.getElementById('completar-etiqueta').textContent = `Solicitud #${id}`;
        document.getElementById('completar-resumen').innerHTML = `
            <div><strong>${esc(s.ciudadano)}</strong><small>${esc(s.direccion)}</small></div>
            <div class="publicacion-etiquetas">${C().insigniasTipos(s.tipos_residuo)}</div>`;
        // Una línea por cada tipo que marcó el ciudadano, con el primer material de esa categoría
        const tipos = String(s.tipos_residuo).split(',').map((t) => t.trim());
        const sugeridos = tipos.map((t) => (materiales.find((m) => m.categoria === t) || {}).id_material).filter(Boolean);
        const iniciales = sugeridos.length ? [...new Set(sugeridos)] : [null];
        document.getElementById('completar-lineas').innerHTML = iniciales.map((m) => lineaMaterial(materiales, m)).join('');
        document.getElementById('completar-observaciones').value = '';
        Eco.Util.limpiarErroresCampos(['completar-lineas', 'completar-observaciones']);
        actualizarLineas();
        Eco.App.abrirModal('modal-completar');
    }

    async function enviarCompletar(evento) {
        evento.preventDefault();
        Eco.Util.limpiarErroresCampos(['completar-lineas', 'completar-observaciones']);
        const detalle = [];
        let error = '';
        const vistos = new Set();
        document.querySelectorAll('#completar-lineas .linea-material').forEach((linea) => {
            if (error) return;
            const selector = linea.querySelector('[data-campo="material"]');
            const idMaterial = Number(selector.value);
            const unidad = selector.selectedOptions[0] ? selector.selectedOptions[0].dataset.unidad : 'kg';
            const texto = linea.querySelector('[data-campo="cantidad"]').value;
            if (!idMaterial && !texto) return; // línea vacía
            if (!idMaterial) { error = 'Elige el material de cada línea.'; return; }
            if (vistos.has(idMaterial)) { error = 'Hay un material repetido: suma las cantidades en una sola línea.'; return; }
            vistos.add(idMaterial);
            const leida = C().leerCantidad(texto, unidad);
            if (leida.error) { error = `${selector.selectedOptions[0].textContent.trim()}: ${leida.error}`; return; }
            detalle.push({ id_material: idMaterial, cantidad: leida.valor });
        });
        if (!error && !detalle.length) error = 'Registra al menos un material con su cantidad.';
        const observaciones = document.getElementById('completar-observaciones').value.trim();
        if (observaciones.length > 300) {
            Eco.Util.mostrarErrorCampo('completar-observaciones', 'Las observaciones no pueden superar 300 caracteres.');
            return;
        }
        if (error) {
            document.getElementById('error-completar-lineas').textContent = error;
            return;
        }
        const boton = document.getElementById('btn-guardar-completar');
        boton.disabled = true;
        try {
            const total = await Eco.Nube.rpc('completar_solicitud', {
                p_id: solicitudActual, p_detalle: detalle, p_observaciones: observaciones || null
            });
            Eco.App.cerrarModal('modal-completar');
            await Eco.App.despuesDeCambio(`Recolección registrada: ${kilos(total)} al centro de acopio.`);
        } catch (errorEnvio) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(errorEnvio, 'No se pudo registrar la recolección.'), 'error');
        } finally {
            boton.disabled = false;
        }
    }

    /* ---------------------------- Administrador ---------------------------- */
    function renderAdmin() {
        const f = filtrosAdmin;
        if (f.modo === 'kanban') {
            renderKanban();
            actualizarResumenAdmin();
            return;
        }
        const condicion = {
            abiertas: "s.estado IN ('Pendiente', 'Asignada')",
            cerradas: "s.estado IN ('Cancelada', 'Rechazada')"
        }[f.estado] || 's.estado = ?';
        const parametros = ['abiertas', 'cerradas'].includes(f.estado) ? [] : [f.estado];
        const lista = Eco.DB.consultar(
            `${SQL_SOLICITUDES}
             WHERE ${condicion}
               AND (? = '' OR c.nombre LIKE '%' || ? || '%' OR s.direccion LIKE '%' || ? || '%' OR r.nombre LIKE '%' || ? || '%')
             ORDER BY CASE s.estado WHEN 'Pendiente' THEN 1 WHEN 'Asignada' THEN 2 ELSE 3 END,
                      CASE WHEN s.estado IN ('Pendiente', 'Asignada') THEN s.fecha_preferida END,
                      s.fecha_solicitud DESC`,
            [...parametros, f.texto, f.texto, f.texto, f.texto]);
        const hoy = Eco.Util.fechaHoyIso();
        document.getElementById('tabla-solicitudes-body').innerHTML = lista.map((s) => {
            let acciones = '';
            if (s.estado === 'Pendiente' || s.estado === 'Asignada') {
                acciones = `
                    <button type="button" class="boton ${s.estado === 'Pendiente' ? 'boton-primario' : 'boton-secundario'} boton-pequeno" data-accion="asignar" data-id="${s.id_solicitud}">
                        ${s.estado === 'Pendiente' ? 'Asignar' : 'Reasignar'}</button>
                    ${s.estado === 'Asignada' ? `<button type="button" class="boton boton-secundario boton-pequeno" data-accion="completar" data-id="${s.id_solicitud}" title="Registrar los kilos en nombre del repartidor">Registrar kilos</button>` : ''}
                    <button type="button" class="boton boton-secundario boton-pequeno" data-accion="rechazar" data-id="${s.id_solicitud}">Rechazar</button>`;
            }
            const atrasada = ['Pendiente', 'Asignada'].includes(s.estado) && s.fecha_preferida < hoy;
            return `
                <tr>
                    <td><strong>#${s.id_solicitud}</strong><small class="bloque">${esc(Eco.Util.formatearFechaHora(s.fecha_solicitud))}</small></td>
                    <td><div class="celda-persona">${Eco.Sesion.avatar(s.ciudadano, s.ciudadano_foto, 'avatar-mini')}
                        <div><strong>${esc(s.ciudadano)}</strong><small>${esc(s.direccion)}</small>
                        ${s.ciudadano_telefono ? `<small>${esc(s.ciudadano_telefono)}</small>` : ''}</div></div></td>
                    <td><div class="publicacion-etiquetas">${C().insigniasTipos(s.tipos_residuo)}</div>
                        ${s.cantidad_estimada ? `<small class="bloque">Aprox. ${esc(kilos(s.cantidad_estimada))}</small>` : ''}
                        ${s.descripcion ? `<small class="bloque texto-tenue">${esc(s.descripcion)}</small>` : ''}</td>
                    <td>${esc(cuando(s))}${atrasada ? '<small class="bloque texto-alerta">Fecha vencida</small>' : ''}</td>
                    <td>${C().estado(s.estado, TEXTO_ESTADO[s.estado])}
                        ${s.repartidor ? `<small class="bloque">${esc(s.repartidor)}</small>` : ''}
                        ${s.estado === 'Recolectada' ? `<small class="bloque">${esc(kilos(s.kilos_recolectados))}</small>` : ''}
                        ${s.nota ? `<small class="bloque texto-tenue">${esc(s.nota)}</small>` : ''}</td>
                    <td class="texto-derecha"><div class="acciones-tabla">${acciones || '<span class="texto-tenue">—</span>'}</div></td>
                </tr>`;
        }).join('');
        document.getElementById('sol-conteo').textContent = `${lista.length} ${lista.length === 1 ? 'solicitud' : 'solicitudes'}`;
        document.getElementById('solicitudes-vacio').hidden = lista.length > 0;
        document.getElementById('tabla-solicitudes-body').closest('.tabla-contenedor').hidden = lista.length === 0;
        actualizarResumenAdmin();
    }

    function actualizarResumenAdmin() {
        const hoy = Eco.Util.fechaHoyIso();
        const r = Eco.DB.consultarUno(
            `SELECT SUM(CASE WHEN estado = 'Pendiente' THEN 1 ELSE 0 END) AS pendientes,
                    SUM(CASE WHEN estado = 'Asignada' THEN 1 ELSE 0 END) AS asignadas,
                    SUM(CASE WHEN estado = 'Recolectada' AND substr(fecha_cierre, 1, 7) = ? THEN 1 ELSE 0 END) AS mes
             FROM solicitudes_recoleccion`, [hoy.slice(0, 7)]);
        document.getElementById('sol-pendientes').textContent = r.pendientes || 0;
        document.getElementById('sol-asignadas').textContent = r.asignadas || 0;
        document.getElementById('sol-mes').textContent = r.mes || 0;
        document.getElementById('sol-repartidores').textContent = repartidores().length;
    }

    /* --------------------------- Tablero Kanban --------------------------- */
    // Columnas del tablero: Pendiente (sin asignar), En progreso (asignada)
    // y Finalizado (recolectada en los últimos 30 días).
    const COLUMNAS_KANBAN = [
        { estado: 'Pendiente', lista: 'kanban-pendiente', conteo: 'kanban-conteo-pendiente' },
        { estado: 'Asignada', lista: 'kanban-progreso', conteo: 'kanban-conteo-progreso' },
        { estado: 'Recolectada', lista: 'kanban-finalizado', conteo: 'kanban-conteo-finalizado' }
    ];

    function tarjetaKanban(s, hoy) {
        const atrasada = ['Pendiente', 'Asignada'].includes(s.estado) && s.fecha_preferida < hoy;
        let acciones = '';
        if (s.estado === 'Pendiente') {
            acciones = `<button type="button" class="boton boton-primario boton-pequeno" data-accion="asignar" data-id="${s.id_solicitud}">Asignar</button>
                <button type="button" class="boton boton-secundario boton-pequeno" data-accion="rechazar" data-id="${s.id_solicitud}">Rechazar</button>`;
        } else if (s.estado === 'Asignada') {
            acciones = `<button type="button" class="boton boton-primario boton-pequeno" data-accion="completar" data-id="${s.id_solicitud}">Registrar kilos</button>
                <button type="button" class="boton boton-secundario boton-pequeno" data-accion="asignar" data-id="${s.id_solicitud}">Reasignar</button>`;
        }
        const arrastrable = s.estado !== 'Recolectada';
        return `
            <article class="kanban-tarjeta${atrasada ? ' kanban-atrasada' : ''}" data-id="${s.id_solicitud}" data-estado="${esc(s.estado)}"
                     ${arrastrable ? 'draggable="true"' : ''} aria-label="Solicitud ${s.id_solicitud} de ${esc(s.ciudadano)}">
                <header class="kanban-tarjeta-cabecera">
                    <strong>#${s.id_solicitud}</strong>
                    ${atrasada ? '<span class="insignia insignia-alerta">Atrasada</span>' : ''}
                </header>
                <p class="kanban-tarjeta-titulo">${esc(s.ciudadano)}</p>
                <small class="bloque texto-tenue">${esc(s.direccion)}</small>
                <div class="publicacion-etiquetas">${C().insigniasTipos(s.tipos_residuo)}</div>
                <dl class="kanban-datos">
                    <div><dt>Fecha</dt><dd>${esc(cuando(s))}</dd></div>
                    ${s.repartidor ? `<div><dt>Responsable</dt><dd>${esc(s.repartidor)}</dd></div>` : ''}
                    ${s.estado === 'Recolectada' ? `<div><dt>Recolectado</dt><dd>${esc(kilos(s.kilos_recolectados))}</dd></div>` : ''}
                </dl>
                ${acciones ? `<footer class="kanban-acciones">${acciones}</footer>` : ''}
            </article>`;
    }

    function renderKanban() {
        const hoy = Eco.Util.fechaHoyIso();
        const desde = Eco.Util.fechaHaceDias(29);
        const t = filtrosAdmin.texto;
        const lista = Eco.DB.consultar(
            `${SQL_SOLICITUDES}
             WHERE (s.estado IN ('Pendiente', 'Asignada')
                    OR (s.estado = 'Recolectada' AND substr(s.fecha_cierre, 1, 10) >= ?))
               AND (? = '' OR c.nombre LIKE '%' || ? || '%' OR s.direccion LIKE '%' || ? || '%' OR r.nombre LIKE '%' || ? || '%')
             ORDER BY CASE WHEN s.estado = 'Recolectada' THEN s.fecha_cierre END DESC,
                      s.fecha_preferida, s.id_solicitud`,
            [desde, t, t, t, t]);
        COLUMNAS_KANBAN.forEach((col) => {
            const tarjetas = lista.filter((s) => s.estado === col.estado);
            document.getElementById(col.lista).innerHTML = tarjetas.length
                ? tarjetas.map((s) => tarjetaKanban(s, hoy)).join('')
                : '<p class="kanban-vacia">Sin solicitudes</p>';
            document.getElementById(col.conteo).textContent = tarjetas.length;
        });
        document.getElementById('sol-conteo').textContent =
            `${lista.length} ${lista.length === 1 ? 'solicitud' : 'solicitudes'}`;
    }

    function cambiarModo(modo) {
        filtrosAdmin.modo = modo;
        const kanban = modo === 'kanban';
        document.querySelectorAll('#sol-modo .chip-filtro').forEach((boton) => {
            const activo = boton.dataset.modo === modo;
            boton.classList.toggle('chip-activo', activo);
            boton.setAttribute('aria-pressed', String(activo));
        });
        document.getElementById('sol-filtro-estado').hidden = kanban;
        document.getElementById('sol-kanban').hidden = !kanban;
        document.getElementById('tabla-solicitudes-body').closest('.tabla-contenedor').hidden = kanban;
        document.getElementById('solicitudes-vacio').hidden = true;
        renderAdmin();
    }

    // Arrastrar y soltar: solo se permiten los movimientos del flujo real
    // (asignar y registrar kilos); cada uno abre su formulario.
    function iniciarArrastre() {
        const tablero = document.getElementById('sol-kanban');
        let arrastrada = null;
        tablero.addEventListener('dragstart', (evento) => {
            const tarjeta = evento.target.closest('.kanban-tarjeta[draggable="true"]');
            if (!tarjeta) return;
            arrastrada = { id: Number(tarjeta.dataset.id), estado: tarjeta.dataset.estado };
            evento.dataTransfer.effectAllowed = 'move';
            evento.dataTransfer.setData('text/plain', tarjeta.dataset.id);
            tarjeta.classList.add('arrastrando');
        });
        tablero.addEventListener('dragend', (evento) => {
            const tarjeta = evento.target.closest('.kanban-tarjeta');
            if (tarjeta) tarjeta.classList.remove('arrastrando');
            tablero.querySelectorAll('.kanban-columna').forEach((c) => c.classList.remove('soltar-aqui'));
            arrastrada = null;
        });
        tablero.addEventListener('dragover', (evento) => {
            const columna = evento.target.closest('.kanban-columna');
            if (!columna || !arrastrada) return;
            evento.preventDefault();
            tablero.querySelectorAll('.kanban-columna').forEach((c) => c.classList.toggle('soltar-aqui', c === columna));
        });
        tablero.addEventListener('drop', (evento) => {
            const columna = evento.target.closest('.kanban-columna');
            if (!columna || !arrastrada) return;
            evento.preventDefault();
            columna.classList.remove('soltar-aqui');
            const destino = columna.dataset.columna;
            const { id, estado } = arrastrada;
            if (destino === estado) return;
            if (estado === 'Pendiente' && destino === 'Asignada') abrirAsignar(id);
            else if (estado === 'Asignada' && destino === 'Recolectada') abrirCompletar(id);
            else Eco.Util.mostrarAviso('Ese movimiento no es posible: una solicitud pasa de Pendiente a En progreso (asignar) y de En progreso a Finalizado (registrar kilos).', 'info');
        });
    }

    function repartidores() {
        return Eco.DB.consultar(
            `SELECT u.id_usuario, u.nombre, p.telefono,
                    (SELECT COUNT(*) FROM solicitudes_recoleccion s WHERE s.id_repartidor = u.id_usuario AND s.estado = 'Asignada') AS carga
             FROM usuarios u JOIN perfiles p ON p.id_usuario = u.id_usuario JOIN roles r ON r.id_rol = p.id_rol
             WHERE r.codigo = 'repartidor' AND p.activo = 1
             ORDER BY carga, u.nombre COLLATE NOCASE`);
    }

    function abrirAsignar(id) {
        const s = obtener(id);
        if (!s) return;
        const lista = repartidores();
        if (!lista.length) {
            Eco.Util.mostrarAviso('No hay repartidores activos. Aprueba o crea uno en “Usuarios”.', 'error');
            return;
        }
        solicitudActual = id;
        document.getElementById('asignar-etiqueta').textContent = `Solicitud #${id}`;
        document.getElementById('titulo-modal-asignar').textContent = s.estado === 'Asignada' ? 'Reasignar repartidor' : 'Asignar repartidor';
        document.getElementById('asignar-resumen').innerHTML = `
            <div><strong>${esc(s.ciudadano)}</strong><small>${esc(s.direccion)} · ${esc(cuando(s))}</small></div>
            <div class="publicacion-etiquetas">${C().insigniasTipos(s.tipos_residuo)}</div>`;
        const selector = document.getElementById('asignar-repartidor');
        selector.innerHTML = lista.map((r) =>
            `<option value="${r.id_usuario}">${esc(r.nombre)} (${r.carga})</option>`).join('');
        if (s.id_repartidor) selector.value = String(s.id_repartidor);
        Eco.Util.limpiarErrorCampo('asignar-repartidor');
        Eco.App.abrirModal('modal-asignar');
    }

    async function enviarAsignar(evento) {
        evento.preventDefault();
        const idRepartidor = Number(document.getElementById('asignar-repartidor').value);
        if (!idRepartidor) {
            Eco.Util.mostrarErrorCampo('asignar-repartidor', 'Selecciona un repartidor.');
            return;
        }
        try {
            await Eco.Nube.rpc('asignar_solicitud', { p_id: solicitudActual, p_id_repartidor: idRepartidor });
            Eco.App.cerrarModal('modal-asignar');
            const nombre = document.getElementById('asignar-repartidor').selectedOptions[0].textContent.replace(/\s*\(\d+\)$/, '');
            await Eco.App.despuesDeCambio(`Solicitud asignada a ${nombre}.`);
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo asignar la solicitud.'), 'error');
        }
    }

    async function rechazar(id) {
        const motivo = await Eco.App.pedirTexto({
            etiqueta: `Solicitud #${id}`,
            titulo: 'Rechazar solicitud',
            mensaje: 'El ciudadano verá este motivo en su solicitud.',
            ayuda: 'Ej. La dirección está fuera de la zona de cobertura.',
            obligatorio: true,
            textoConfirmar: 'Rechazar',
            peligro: true
        });
        if (motivo === null) return;
        try {
            await Eco.Nube.rpc('rechazar_solicitud', { p_id: id, p_motivo: motivo });
            await Eco.App.despuesDeCambio('Solicitud rechazada.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo rechazar la solicitud.'), 'error');
        }
    }

    /* -------------------------------- Inicio -------------------------------- */
    function manejarAccion(evento) {
        const boton = evento.target.closest('button[data-accion]');
        if (!boton) return;
        const id = Number(boton.dataset.id);
        const acciones = { cancelar, devolver, completar: abrirCompletar, asignar: abrirAsignar, rechazar };
        if (acciones[boton.dataset.accion]) acciones[boton.dataset.accion](id);
    }

    function init() {
        document.getElementById('solicitud-tipos').innerHTML = C().CATEGORIAS.map((t) => `
            <label class="opcion-residuo">
                <input type="checkbox" name="solicitud-tipo" value="${esc(t)}">
                <span class="insignia insignia-tipo" data-tipo="${esc(t)}">${esc(t)}</span>
            </label>`).join('');
        document.getElementById('solicitud-tipos').addEventListener('change', () => Eco.Util.limpiarErrorCampo('solicitud-tipos'));
        CAMPOS_SOLICITUD.slice(1).forEach((id) => {
            document.getElementById(id).addEventListener('input', () => Eco.Util.limpiarErrorCampo(id));
        });
        document.getElementById('btn-nueva-solicitud').addEventListener('click', abrirNuevaSolicitud);
        document.getElementById('form-solicitud').addEventListener('submit', enviarSolicitud);
        document.getElementById('form-asignar').addEventListener('submit', enviarAsignar);
        document.getElementById('form-completar').addEventListener('submit', enviarCompletar);
        ['lista-mis-solicitudes', 'lista-rutas', 'tabla-solicitudes-body', 'sol-kanban'].forEach((id) => {
            document.getElementById(id).addEventListener('click', manejarAccion);
        });

        const lineas = document.getElementById('completar-lineas');
        lineas.addEventListener('input', () => { document.getElementById('error-completar-lineas').textContent = ''; actualizarLineas(); });
        lineas.addEventListener('change', actualizarLineas);
        lineas.addEventListener('click', (evento) => {
            const quitar = evento.target.closest('[data-accion="quitar"]');
            if (!quitar || quitar.disabled) return;
            quitar.closest('.linea-material').remove();
            actualizarLineas();
        });
        document.getElementById('btn-completar-agregar').addEventListener('click', () => {
            lineas.insertAdjacentHTML('beforeend', lineaMaterial(materialesMunicipio(), null));
            actualizarLineas();
        });

        document.getElementById('sol-filtro-estado').addEventListener('click', (evento) => {
            const chip = evento.target.closest('[data-estado]');
            if (!chip) return;
            filtrosAdmin.estado = chip.dataset.estado;
            document.querySelectorAll('#sol-filtro-estado .chip-filtro').forEach((c) => c.classList.toggle('chip-activo', c === chip));
            renderAdmin();
        });
        document.getElementById('sol-modo').addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-modo]');
            if (boton && boton.dataset.modo !== filtrosAdmin.modo) cambiarModo(boton.dataset.modo);
        });
        iniciarArrastre();
        document.getElementById('sol-buscar').addEventListener('input', Eco.Util.debounce((evento) => {
            filtrosAdmin.texto = evento.target.value.trim();
            renderAdmin();
        }, 200));
    }

    Eco.Solicitudes = {
        init,
        render: renderAdmin,
        ciudadano: { render: renderCiudadano },
        repartidor: { render: renderRepartidor }
    };
})();
