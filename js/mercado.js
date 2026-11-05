/* ============================================================
   EcoGestión · Mercado de residuos
   - Publicaciones activas de los vendedores, con filtros.
   - Necesidades publicadas por las empresas recicladoras.
   - Detalle, contacto con el vendedor y envío de ofertas.
   Incluye utilidades compartidas por los módulos del mercado
   (Eco.MercadoUtil).
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const esc = (valor) => Eco.Util.escaparHtml(valor);

    /* ===================== Utilidades del mercado ===================== */
    const TIPOS = ['Plástico', 'Cartón', 'Papel', 'Vidrio', 'Metal', 'Otros'];
    const PRECIO_MAXIMO = 100000000;
    const formatoDinero = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });

    const Util = {
        TIPOS,
        PRECIO_MAXIMO,
        dinero(valor) {
            // Espacio no separable: el símbolo y el número nunca quedan en líneas distintas.
            return formatoDinero.format(Number(valor) || 0).replace(/\s/g, '\u00a0');
        },
        precio(valor, unidad) {
            return `${Util.dinero(valor)} / ${unidad === 'unidades' ? 'unidad' : 'kg'}`;
        },
        cantidad(valor, unidad) {
            return `${Eco.Util.formatearCantidad(valor, unidad)} ${unidad}`;
        },
        fecha(valor) {
            return Eco.Util.formatearFecha(valor);
        },
        insigniaTipo(tipo) {
            return `<span class="insignia insignia-tipo" data-tipo="${esc(tipo)}">${esc(tipo)}</span>`;
        },
        estado(estado) {
            const clase = String(estado || '').toLowerCase().normalize('NFD')
                .replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
            return `<span class="estado-chip estado-${clase}"><span class="punto"></span>${esc(estado)}</span>`;
        },
        /** Primera foto de la publicación o una ilustración según el tipo. */
        portada(foto, tipo, clase) {
            const extra = clase ? ` ${clase}` : '';
            if (foto) return `<div class="foto-material${extra}"><img src="${esc(foto)}" alt=""></div>`;
            return `<div class="foto-material foto-vacia${extra}" data-tipo="${esc(tipo)}">
                        <svg class="icono" aria-hidden="true"><use href="#i-reciclar"></use></svg>
                    </div>`;
        },
        /**
         * Valida una cantidad escrita por el usuario.
         * Devuelve { valor } o { error }.
         */
        leerCantidad(texto, unidad, maximo) {
            const valor = Eco.Util.normalizarCantidad(texto);
            if (valor === null) return { error: 'Escribe una cantidad válida.' };
            if (valor <= 0) return { error: 'La cantidad debe ser mayor que cero.' };
            if (unidad === 'unidades' && !Number.isInteger(valor)) {
                return { error: 'Para unidades, la cantidad debe ser un número entero.' };
            }
            if (valor > 10000000) return { error: 'La cantidad es demasiado grande.' };
            if (maximo !== undefined && valor > maximo + 0.000001) {
                return { error: `No puede superar lo disponible (${Util.cantidad(maximo, unidad)}).` };
            }
            return { valor: Eco.Util.redondear(valor, 2) };
        },
        leerPrecio(texto) {
            const valor = Eco.Util.normalizarCantidad(texto);
            if (valor === null) return { error: 'Escribe un precio válido.' };
            if (valor <= 0) return { error: 'El precio debe ser mayor que cero.' };
            if (valor > PRECIO_MAXIMO) return { error: 'El precio es demasiado alto.' };
            return { valor: Eco.Util.redondear(valor, 2) };
        },
        /** Enlaces de contacto (correo y teléfono) de una cuenta. */
        contacto(nombre, correo, telefono) {
            const enlaces = [];
            if (correo) {
                enlaces.push(`<a class="enlace-contacto" href="mailto:${esc(correo)}">
                    <svg class="icono" aria-hidden="true"><use href="#i-correo"></use></svg>${esc(correo)}</a>`);
            }
            if (telefono) {
                enlaces.push(`<a class="enlace-contacto" href="tel:${esc(String(telefono).replace(/[^0-9+]/g, ''))}">
                    <svg class="icono" aria-hidden="true"><use href="#i-telefono"></use></svg>${esc(telefono)}</a>`);
            }
            return enlaces.length
                ? enlaces.join('')
                : `<span class="texto-tenue">${esc(nombre)} no tiene datos de contacto registrados.</span>`;
        },
        fotosDe(idPublicacion) {
            return Eco.DB.consultar(
                'SELECT imagen FROM fotos_publicacion WHERE id_publicacion = ? ORDER BY orden',
                [idPublicacion]
            ).map((fila) => fila.imagen);
        }
    };
    Eco.MercadoUtil = Util;

    /* =========================== Mercado =========================== */
    const filtros = { tipo: '', texto: '', ubicacion: '', orden: 'recientes', vendedor: null, vendedorNombre: '' };
    let pestanaActual = 'publicaciones';
    let publicacionOferta = null;

    // Solo publicaciones activas de vendedores activos
    const SQL_PUBLICACIONES = `
        SELECT pb.*, u.nombre AS vendedor, u.correo AS vendedor_correo,
               pf.telefono AS vendedor_telefono, pf.foto_url AS vendedor_foto,
               (SELECT imagen FROM fotos_publicacion f
                 WHERE f.id_publicacion = pb.id_publicacion ORDER BY orden LIMIT 1) AS portada,
               (SELECT COUNT(*) FROM fotos_publicacion f WHERE f.id_publicacion = pb.id_publicacion) AS total_fotos
        FROM publicaciones pb
        JOIN usuarios u ON u.id_usuario = pb.id_vendedor
        JOIN perfiles pf ON pf.id_usuario = u.id_usuario
        JOIN roles r ON r.id_rol = pf.id_rol
        WHERE pb.estado = 'Activa' AND pf.activo = 1 AND r.codigo = 'vendedor'`;

    function consultarPublicaciones() {
        const orden = {
            recientes: 'pb.fecha_publicacion DESC, pb.id_publicacion DESC',
            'precio-asc': 'pb.precio_unitario ASC',
            'precio-desc': 'pb.precio_unitario DESC',
            cantidad: 'pb.cantidad_disponible DESC'
        }[filtros.orden] || 'pb.fecha_publicacion DESC';
        return Eco.DB.consultar(
            `${SQL_PUBLICACIONES}
               AND (? = '' OR pb.tipo_residuo = ?)
               AND (? = '' OR pb.nombre_material LIKE '%' || ? || '%' OR pb.descripcion LIKE '%' || ? || '%')
               AND (? = '' OR pb.ubicacion LIKE '%' || ? || '%')
               AND (? IS NULL OR pb.id_vendedor = ?)
             ORDER BY ${orden}`,
            [filtros.tipo, filtros.tipo, filtros.texto, filtros.texto, filtros.texto,
                filtros.ubicacion, filtros.ubicacion, filtros.vendedor, filtros.vendedor]
        );
    }

    function tarjetaPublicacion(pb, usuario) {
        const propia = usuario && pb.id_vendedor === usuario.id_usuario;
        const puedeOfertar = Eco.Sesion.tiene('ofertas.enviar') && !propia;
        return `
            <article class="tarjeta-publicacion">
                <button type="button" class="publicacion-foto" data-accion="detalle" data-id="${pb.id_publicacion}"
                        aria-label="Ver detalle de ${esc(pb.nombre_material)}">
                    ${Util.portada(pb.portada, pb.tipo_residuo)}
                    ${pb.total_fotos > 1 ? `<span class="contador-fotos"><svg class="icono" aria-hidden="true"><use href="#i-foto"></use></svg>${pb.total_fotos}</span>` : ''}
                </button>
                <div class="publicacion-cuerpo">
                    <div class="publicacion-etiquetas">
                        ${Util.insigniaTipo(pb.tipo_residuo)}
                        ${propia ? '<span class="insignia insignia-propia">Tu publicación</span>' : ''}
                    </div>
                    <h3>${esc(pb.nombre_material)}</h3>
                    <p class="publicacion-precio">${esc(Util.precio(pb.precio_unitario, pb.unidad))}</p>
                    <dl class="publicacion-datos">
                        <div><dt>Disponible</dt><dd>${esc(Util.cantidad(pb.cantidad_disponible, pb.unidad))}</dd></div>
                        <div><dt>Ubicación</dt><dd>${esc(pb.ubicacion)}</dd></div>
                    </dl>
                    <div class="publicacion-vendedor">
                        ${Eco.Sesion.avatar(pb.vendedor, pb.vendedor_foto, 'avatar-mini')}
                        <span>${esc(pb.vendedor)}</span>
                    </div>
                </div>
                <div class="publicacion-acciones">
                    <button type="button" class="boton boton-secundario boton-pequeno" data-accion="detalle" data-id="${pb.id_publicacion}">
                        Ver detalle
                    </button>
                    ${puedeOfertar ? `<button type="button" class="boton boton-primario boton-pequeno" data-accion="ofertar" data-id="${pb.id_publicacion}">
                        <svg class="icono" aria-hidden="true"><use href="#i-oferta"></use></svg>Hacer oferta
                    </button>` : ''}
                </div>
            </article>`;
    }

    function renderPublicaciones() {
        const usuario = Eco.Sesion.usuarioActual();
        const lista = consultarPublicaciones();
        document.getElementById('mercado-grid').innerHTML = lista.map((pb) => tarjetaPublicacion(pb, usuario)).join('');
        document.getElementById('mercado-vacio').hidden = lista.length > 0;
        document.getElementById('mercado-conteo').textContent =
            `${lista.length} ${lista.length === 1 ? 'publicación' : 'publicaciones'}`;

        const chipVendedor = document.getElementById('mercado-filtro-vendedor');
        chipVendedor.hidden = !filtros.vendedor;
        chipVendedor.querySelector('span').textContent = `Vendedor: ${filtros.vendedorNombre}`;
    }

    function renderNecesidades() {
        const lista = Eco.DB.consultar(
            `SELECT n.*, e.razon_social, e.ciudad, e.telefono, e.correo_contacto, u.correo
             FROM necesidades_empresa n
             JOIN empresas e ON e.id_empresa = n.id_empresa
             JOIN usuarios u ON u.id_usuario = e.id_usuario
             JOIN perfiles pf ON pf.id_usuario = u.id_usuario
             JOIN roles r ON r.id_rol = pf.id_rol AND r.codigo = 'empresa'
             WHERE n.estado = 'Activa' AND pf.activo = 1
               AND (? = '' OR n.tipo_residuo = ?)
               AND (? = '' OR e.ciudad LIKE '%' || ? || '%')
             ORDER BY n.fecha_publicacion DESC`,
            [filtros.tipo, filtros.tipo, filtros.ubicacion, filtros.ubicacion]
        );
        document.getElementById('necesidades-grid').innerHTML = lista.map((n) => `
            <article class="tarjeta-necesidad">
                <div class="necesidad-cabecera">
                    ${Util.insigniaTipo(n.tipo_residuo)}
                    <span class="texto-tenue">${esc(Util.fecha(n.fecha_publicacion))}</span>
                </div>
                <h3>${esc(n.razon_social)}</h3>
                <p class="necesidad-descripcion">${esc(n.descripcion || 'Sin descripción adicional.')}</p>
                <dl class="publicacion-datos">
                    <div><dt>Compra entre</dt><dd>${esc(Eco.Util.formatearCantidad(n.cantidad_minima, n.unidad))} y ${esc(Util.cantidad(n.cantidad_maxima, n.unidad))}</dd></div>
                    <div><dt>Paga</dt><dd class="dato-precio">${esc(Util.precio(n.precio_ofrecido, n.unidad))}</dd></div>
                    <div><dt>Ciudad</dt><dd>${esc(n.ciudad || 'Sin especificar')}</dd></div>
                </dl>
                <div class="necesidad-contacto">${Util.contacto(n.razon_social, n.correo_contacto || n.correo, n.telefono)}</div>
            </article>
        `).join('');
        document.getElementById('necesidades-vacio').hidden = lista.length > 0;
        document.getElementById('necesidades-conteo').textContent =
            `${lista.length} ${lista.length === 1 ? 'necesidad' : 'necesidades'}`;
    }

    function render() {
        if (!Eco.Sesion.puedeVerVista('mercado')) return;
        document.querySelectorAll('#mercado-tipos .chip-filtro').forEach((chip) => {
            const activo = chip.dataset.tipo === filtros.tipo;
            chip.classList.toggle('activo', activo);
            chip.setAttribute('aria-pressed', String(activo));
        });
        document.querySelectorAll('#vista-mercado .pestana').forEach((pestana) => {
            const activa = pestana.dataset.pestana === pestanaActual;
            pestana.classList.toggle('activa', activa);
            pestana.setAttribute('aria-selected', String(activa));
        });
        document.getElementById('mercado-panel-publicaciones').hidden = pestanaActual !== 'publicaciones';
        document.getElementById('mercado-panel-necesidades').hidden = pestanaActual !== 'necesidades';
        document.getElementById('mercado-herramientas-publicaciones').hidden = pestanaActual !== 'publicaciones';
        renderPublicaciones();
        renderNecesidades();
    }

    /* ------------------------------ Detalle ------------------------------ */
    function obtenerPublicacion(id) {
        return Eco.DB.consultarUno(`${SQL_PUBLICACIONES} AND pb.id_publicacion = ?`, [id]);
    }

    function abrirDetalle(id) {
        const pb = obtenerPublicacion(id);
        if (!pb) {
            Eco.Util.mostrarAviso('La publicación ya no está disponible.', 'error');
            render();
            return;
        }
        const usuario = Eco.Sesion.usuarioActual();
        const propia = usuario && pb.id_vendedor === usuario.id_usuario;
        const fotos = Util.fotosDe(id);
        const puedeOfertar = Eco.Sesion.tiene('ofertas.enviar') && !propia;

        document.getElementById('titulo-modal-detalle').textContent = pb.nombre_material;
        document.getElementById('detalle-contenido').innerHTML = `
            <div class="galeria">
                <div class="galeria-principal" id="galeria-principal">
                    ${Util.portada(fotos[0] || null, pb.tipo_residuo, 'foto-grande')}
                </div>
                ${fotos.length > 1 ? `<div class="galeria-miniaturas">
                    ${fotos.map((foto, i) => `<button type="button" class="galeria-miniatura${i === 0 ? ' activa' : ''}" data-indice="${i}" aria-label="Ver foto ${i + 1}">
                        <img src="${esc(foto)}" alt=""></button>`).join('')}
                </div>` : ''}
            </div>
            <div class="detalle-info">
                <div class="publicacion-etiquetas">${Util.insigniaTipo(pb.tipo_residuo)}</div>
                <p class="publicacion-precio publicacion-precio-grande">${esc(Util.precio(pb.precio_unitario, pb.unidad))}</p>
                <dl class="publicacion-datos">
                    <div><dt>Disponible</dt><dd>${esc(Util.cantidad(pb.cantidad_disponible, pb.unidad))}</dd></div>
                    <div><dt>Ubicación</dt><dd>${esc(pb.ubicacion)}</dd></div>
                    <div><dt>Publicado</dt><dd>${esc(Util.fecha(pb.fecha_publicacion))}</dd></div>
                </dl>
                <p class="detalle-descripcion">${esc(pb.descripcion || 'El vendedor no agregó una descripción.')}</p>
                <div class="detalle-vendedor">
                    ${Eco.Sesion.avatar(pb.vendedor, pb.vendedor_foto)}
                    <div>
                        <strong>${esc(pb.vendedor)}</strong>
                        <small>Vendedor</small>
                    </div>
                </div>
                ${propia ? '' : `<div class="detalle-contacto">
                    <span class="detalle-contacto-titulo">Contactar al vendedor</span>
                    ${Util.contacto(pb.vendedor, pb.vendedor_correo, pb.vendedor_telefono)}
                </div>`}
            </div>`;
        const botonOferta = document.getElementById('btn-detalle-ofertar');
        botonOferta.hidden = !puedeOfertar;
        botonOferta.dataset.id = String(id);

        const galeria = document.getElementById('detalle-contenido');
        galeria.querySelectorAll('.galeria-miniatura').forEach((boton) => {
            boton.addEventListener('click', () => {
                galeria.querySelectorAll('.galeria-miniatura').forEach((b) => b.classList.toggle('activa', b === boton));
                document.getElementById('galeria-principal').innerHTML =
                    Util.portada(fotos[Number(boton.dataset.indice)], pb.tipo_residuo, 'foto-grande');
            });
        });
        Eco.App.abrirModal('modal-detalle-publicacion');
    }

    /* ------------------------------ Ofertas ------------------------------ */
    const CAMPOS_OFERTA = ['oferta-cantidad', 'oferta-precio', 'oferta-mensaje'];

    function abrirOferta(id) {
        try {
            Eco.Sesion.exigir('ofertas.enviar');
        } catch (error) {
            Eco.Util.mostrarAviso(error.message, 'error');
            return;
        }
        const pb = obtenerPublicacion(id);
        if (!pb) {
            Eco.Util.mostrarAviso('La publicación ya no está disponible.', 'error');
            render();
            return;
        }
        publicacionOferta = pb;
        document.getElementById('form-oferta').reset();
        Eco.Util.limpiarErroresCampos(CAMPOS_OFERTA);
        document.getElementById('oferta-resumen').innerHTML = `
            ${Util.portada(pb.portada, pb.tipo_residuo, 'foto-mini')}
            <div>
                <strong>${esc(pb.nombre_material)}</strong>
                <small>${esc(pb.vendedor)} · ${esc(pb.ubicacion)}</small>
                <small>Disponible: ${esc(Util.cantidad(pb.cantidad_disponible, pb.unidad))} · Precio publicado: ${esc(Util.precio(pb.precio_unitario, pb.unidad))}</small>
            </div>`;
        document.getElementById('oferta-unidad').textContent = pb.unidad;
        document.getElementById('oferta-precio-unidad').textContent = pb.unidad === 'unidades' ? 'por unidad' : 'por kg';
        const cantidad = document.getElementById('oferta-cantidad');
        cantidad.step = pb.unidad === 'unidades' ? '1' : '0.01';
        cantidad.max = String(pb.cantidad_disponible);
        document.getElementById('oferta-precio').value = String(pb.precio_unitario);
        actualizarTotalOferta();
        Eco.App.cerrarModal('modal-detalle-publicacion');
        Eco.App.abrirModal('modal-oferta');
    }

    function actualizarTotalOferta() {
        const cantidad = Eco.Util.normalizarCantidad(document.getElementById('oferta-cantidad').value);
        const precio = Eco.Util.normalizarCantidad(document.getElementById('oferta-precio').value);
        document.getElementById('oferta-total').textContent =
            cantidad && precio ? Util.dinero(cantidad * precio) : '—';
    }

    async function enviarOferta(evento) {
        evento.preventDefault();
        if (!publicacionOferta) return;
        let usuario;
        try {
            usuario = Eco.Sesion.exigir('ofertas.enviar');
        } catch (error) {
            Eco.Util.mostrarAviso(error.message, 'error');
            return;
        }
        Eco.Util.limpiarErroresCampos(CAMPOS_OFERTA);
        const pb = obtenerPublicacion(publicacionOferta.id_publicacion);
        if (!pb) {
            Eco.App.cerrarModal('modal-oferta');
            Eco.Util.mostrarAviso('La publicación ya no está disponible.', 'error');
            render();
            return;
        }
        const cantidad = Util.leerCantidad(document.getElementById('oferta-cantidad').value, pb.unidad, pb.cantidad_disponible);
        const precio = Util.leerPrecio(document.getElementById('oferta-precio').value);
        const mensaje = document.getElementById('oferta-mensaje').value.trim();
        let valido = true;
        if (cantidad.error) { Eco.Util.mostrarErrorCampo('oferta-cantidad', cantidad.error); valido = false; }
        if (precio.error) { Eco.Util.mostrarErrorCampo('oferta-precio', precio.error); valido = false; }
        if (mensaje.length > 300) { Eco.Util.mostrarErrorCampo('oferta-mensaje', 'El mensaje no puede superar 300 caracteres.'); valido = false; }
        if (!valido) return;

        const pendiente = Eco.DB.consultarUno(
            "SELECT id_oferta FROM ofertas WHERE id_publicacion = ? AND id_comprador = ? AND estado = 'Pendiente'",
            [pb.id_publicacion, usuario.id_usuario]
        );
        if (pendiente) {
            Eco.Util.mostrarErrorCampo('oferta-cantidad',
                'Ya tienes una oferta pendiente para esta publicación. Cancélala en "Ofertas" si quieres enviar otra.');
            return;
        }

        try {
            await Eco.Nube.rpc('enviar_oferta', {
                p_id_publicacion: pb.id_publicacion,
                p_cantidad: cantidad.valor,
                p_precio: precio.valor,
                p_mensaje: mensaje || null
            });
            Eco.App.cerrarModal('modal-oferta');
            publicacionOferta = null;
            await Eco.App.despuesDeCambio('Oferta enviada. Puedes seguir su estado en "Ofertas".');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo enviar la oferta.'), 'error');
        }
    }

    /* ------------------------------ Eventos ------------------------------ */
    /** Abre el mercado mostrando solo las publicaciones de un vendedor. */
    function verVendedor(idVendedor, nombre) {
        filtros.vendedor = idVendedor;
        filtros.vendedorNombre = nombre;
        pestanaActual = 'publicaciones';
        Eco.App.irA('mercado');
        render();
    }

    function init() {
        document.getElementById('mercado-tipos').innerHTML = ['', ...TIPOS].map((tipo) => `
            <button type="button" class="chip-filtro" data-tipo="${esc(tipo)}" aria-pressed="false">${esc(tipo || 'Todos')}</button>
        `).join('');
        document.getElementById('mercado-tipos').addEventListener('click', (evento) => {
            const chip = evento.target.closest('.chip-filtro');
            if (!chip) return;
            filtros.tipo = chip.dataset.tipo;
            render();
        });
        document.querySelectorAll('#vista-mercado .pestana').forEach((pestana) => {
            pestana.addEventListener('click', () => {
                pestanaActual = pestana.dataset.pestana;
                render();
            });
        });
        document.getElementById('mercado-buscar').addEventListener('input', Eco.Util.debounce((evento) => {
            filtros.texto = evento.target.value.trim();
            renderPublicaciones();
        }, 200));
        document.getElementById('mercado-ubicacion').addEventListener('input', Eco.Util.debounce((evento) => {
            filtros.ubicacion = evento.target.value.trim();
            renderPublicaciones();
            renderNecesidades();
        }, 200));
        document.getElementById('mercado-orden').addEventListener('change', (evento) => {
            filtros.orden = evento.target.value;
            renderPublicaciones();
        });
        document.getElementById('mercado-filtro-vendedor').addEventListener('click', () => {
            filtros.vendedor = null;
            filtros.vendedorNombre = '';
            renderPublicaciones();
        });
        document.getElementById('mercado-grid').addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-accion]');
            if (!boton) return;
            const id = Number(boton.dataset.id);
            if (boton.dataset.accion === 'detalle') abrirDetalle(id);
            if (boton.dataset.accion === 'ofertar') abrirOferta(id);
        });
        document.getElementById('btn-detalle-ofertar').addEventListener('click', (evento) => {
            abrirOferta(Number(evento.currentTarget.dataset.id));
        });
        document.getElementById('btn-mercado-publicar').addEventListener('click', () => {
            if (Eco.Publicaciones) Eco.Publicaciones.abrirNueva();
        });
        document.getElementById('form-oferta').addEventListener('submit', enviarOferta);
        ['oferta-cantidad', 'oferta-precio'].forEach((id) => {
            document.getElementById(id).addEventListener('input', () => {
                Eco.Util.limpiarErrorCampo(id);
                actualizarTotalOferta();
            });
        });
    }

    Eco.Mercado = { init, render, verVendedor, abrirDetalle, abrirOferta };
})();
