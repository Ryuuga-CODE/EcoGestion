/* ============================================================
   EcoGestión · Aplicación
   Navegación, modales, inicialización, sincronización con
   Supabase y descarga de la réplica SQLite.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};

    let vistaActual = 'panel';
    let modalActivo = null;
    let elementoEnfocado = null;
    let resolverConfirmacion = null;
    let iniciada = false;

    function dosDigitos(numero) {
        return String(numero).padStart(2, '0');
    }

    function iniciarFecha() {
        const hoy = new Date();
        const texto = new Intl.DateTimeFormat('es-CO', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        }).format(hoy).replace(/\./g, '');
        const contenedor = document.getElementById('fecha-actual');
        if (contenedor) {
            contenedor.innerHTML =
                `<svg class="icono" aria-hidden="true"><use href="#i-calendario"></use></svg><span>${Eco.Util.escaparHtml(texto)}</span>`;
        }
    }

    function abrirMenu() {
        document.body.classList.add('menu-abierto');
        document.getElementById('fondo-menu').hidden = false;
        const boton = document.getElementById('btn-menu');
        boton.setAttribute('aria-expanded', 'true');
        boton.setAttribute('aria-label', 'Cerrar menú');
    }

    function cerrarMenu() {
        document.body.classList.remove('menu-abierto');
        document.getElementById('fondo-menu').hidden = true;
        const boton = document.getElementById('btn-menu');
        boton.setAttribute('aria-expanded', 'false');
        boton.setAttribute('aria-label', 'Abrir menú');
    }

    function irA(vista) {
        const seccion = document.getElementById(`vista-${vista}`);
        if (!seccion) return;
        // Cada cuenta solo puede abrir las vistas que su rol permite.
        if (Eco.Sesion && !Eco.Sesion.puedeVerVista(vista)) return;
        vistaActual = vista;
        document.querySelectorAll('.vista').forEach((elemento) => {
            elemento.classList.toggle('activa', elemento === seccion);
        });
        document.querySelectorAll('.menu-item').forEach((boton) => {
            const activo = boton.dataset.vista === vista;
            boton.classList.toggle('activo', activo);
            if (activo) boton.setAttribute('aria-current', 'page');
            else boton.removeAttribute('aria-current');
        });
        const titulo = seccion.dataset.titulo || 'EcoGestión';
        const subtitulo = seccion.dataset.subtitulo || '';
        document.getElementById('titulo-vista').textContent = titulo;
        document.getElementById('subtitulo-vista').textContent = subtitulo;
        document.title = `${titulo} · EcoGestión`;
        cerrarMenu();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function abrirModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        if (!modalActivo) elementoEnfocado = document.activeElement;

        document.querySelectorAll('.modal-fondo.abierto').forEach((otro) => {
            if (otro !== modal) {
                otro.classList.remove('abierto');
                otro.setAttribute('aria-hidden', 'true');
            }
        });

        modal.classList.add('abierto');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-abierto');
        modalActivo = id;

        window.setTimeout(() => {
            const foco = modal.querySelector(
                'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
            );
            if (foco) foco.focus();
        }, 60);
    }

    function cerrarModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('abierto');
        modal.setAttribute('aria-hidden', 'true');
        if (modalActivo === id) modalActivo = null;

        if (!document.querySelector('.modal-fondo.abierto')) {
            document.body.classList.remove('modal-abierto');
            const anterior = elementoEnfocado;
            if (anterior && typeof anterior.focus === 'function') {
                window.setTimeout(() => anterior.focus(), 0);
            }
            elementoEnfocado = null;
        }
    }

    function confirmar(opciones) {
        const config = opciones || {};
        if (resolverConfirmacion) {
            const anterior = resolverConfirmacion;
            resolverConfirmacion = null;
            anterior(false);
        }

        document.getElementById('confirmar-titulo').textContent = config.titulo || 'Confirmar acción';
        document.getElementById('confirmar-mensaje').textContent = config.mensaje || '';
        const boton = document.getElementById('btn-confirmar-accion');
        boton.textContent = config.textoConfirmar || 'Confirmar';
        boton.className = `boton ${config.peligro === false ? 'boton-primario' : 'boton-peligro'}`;
        document.getElementById('btn-cancelar-confirmar').textContent = config.textoCancelar || 'Cancelar';
        abrirModal('modal-confirmar');

        return new Promise((resolver) => {
            resolverConfirmacion = resolver;
        });
    }

    function resolverConfirmar(resultado) {
        const resolver = resolverConfirmacion;
        resolverConfirmacion = null;
        cerrarModal('modal-confirmar');
        if (resolver) resolver(resultado);
    }

    function iniciarNavegacion() {
        document.querySelectorAll('.menu-item').forEach((boton) => {
            boton.addEventListener('click', () => irA(boton.dataset.vista));
        });
        document.getElementById('btn-menu').addEventListener('click', () => {
            if (document.body.classList.contains('menu-abierto')) cerrarMenu();
            else abrirMenu();
        });
        document.getElementById('fondo-menu').addEventListener('click', cerrarMenu);
        window.addEventListener('resize', () => {
            if (window.innerWidth > 960) cerrarMenu();
        });
    }

    function iniciarModales() {
        document.querySelectorAll('[data-cerrar-modal]').forEach((boton) => {
            boton.addEventListener('click', () => cerrarModal(boton.dataset.cerrarModal));
        });

        document.querySelectorAll('.modal-fondo').forEach((fondo) => {
            fondo.addEventListener('click', (evento) => {
                if (evento.target !== fondo) return;
                if (fondo.id === 'modal-confirmar') {
                    resolverConfirmar(false);
                } else {
                    cerrarModal(fondo.id);
                }
            });
        });

        document.addEventListener('keydown', (evento) => {
            if (evento.key !== 'Escape') return;
            const confirmarAbierto = document.getElementById('modal-confirmar').classList.contains('abierto');
            if (confirmarAbierto) {
                resolverConfirmar(false);
                return;
            }
            if (modalActivo) {
                cerrarModal(modalActivo);
                return;
            }
            if (document.body.classList.contains('menu-abierto')) cerrarMenu();
        });

        document.getElementById('btn-cancelar-confirmar').addEventListener('click', () => resolverConfirmar(false));
        document.getElementById('btn-confirmar-accion').addEventListener('click', () => resolverConfirmar(true));
    }

    function actualizarEstado(texto, detalle, error) {
        const estado = document.getElementById('estado-guardado');
        const ultimo = document.getElementById('ultimo-guardado');
        const punto = document.getElementById('punto-estado');
        if (!estado || !ultimo || !punto) return;
        punto.className = `punto-estado ${error ? 'error' : 'ok'}`;
        estado.textContent = texto;
        ultimo.textContent = detalle || '';
    }

    /** Muestra la hora de la última sincronización con Supabase. */
    function marcarSincronizado() {
        const fecha = Eco.DB.ultimaSincronizacion();
        actualizarEstado('Sincronizado con Supabase',
            fecha ? `Actualizado: ${Eco.Util.formatearFechaHora(fecha.toISOString())}` : '');
    }

    function refrescarTodo() {
        const modulos = [
            ['Panel', Eco.Panel, 'panel'],
            ['Materiales', Eco.Materiales, 'materiales'],
            ['Recolecciones', Eco.Recolecciones, 'recolecciones'],
            ['Inventario', Eco.Inventario, 'inventario'],
            ['Historial', Eco.Historial, 'historial'],
            ['Reportes', Eco.Reportes, 'reportes'],
            ['Mercado', Eco.Mercado, 'mercado'],
            ['Mis publicaciones', Eco.Publicaciones, 'publicaciones'],
            ['Ofertas', Eco.Ofertas, 'ofertas'],
            ['Panel empresarial', Eco.Empresa, 'empresa'],
            ['Administración', Eco.Administracion, 'administracion'],
            ['Perfil', Eco.Perfil, 'perfil']
        ];
        let errores = 0;
        modulos.forEach(([nombre, modulo, vista]) => {
            if (!modulo || typeof modulo.render !== 'function') return;
            // Solo se cargan datos en las vistas que la cuenta puede ver.
            if (Eco.Sesion && !Eco.Sesion.puedeVerVista(vista)) return;
            try {
                modulo.render();
            } catch (error) {
                errores += 1;
                console.error(`No se pudo actualizar ${nombre}:`, error);
            }
        });
        if (errores > 0) {
            Eco.Util.mostrarAviso('Algunas secciones no se pudieron actualizar. Revisa la consola.', 'error');
        }
    }

    function hayModalAbierto() {
        return Boolean(document.querySelector('.modal-fondo.abierto'));
    }

    /** Descarga los datos del servidor y redibuja la vista. */
    async function sincronizar() {
        await Eco.Nube.sincronizar();
        marcarSincronizado();
        Eco.Sesion.revalidar();
        refrescarTodo();
    }

    /**
     * Se llama después de cada operación exitosa en el servidor:
     * vuelve a sincronizar la réplica para que todas las vistas
     * muestren el estado actual.
     */
    async function despuesDeCambio(mensaje) {
        try {
            await sincronizar();
            if (mensaje) Eco.Util.mostrarAviso(mensaje, 'exito');
        } catch (error) {
            console.warn(error);
            actualizarEstado('Sin sincronizar', 'Recarga la página para ver los datos más recientes.', true);
            Eco.Util.mostrarAviso(
                (mensaje ? `${mensaje} ` : '') + 'No se pudieron actualizar los datos en pantalla; recarga la página.',
                'error'
            );
        }
    }

    // Actualización periódica: trae los cambios que hacen otras personas.
    let temporizador = null;
    let actualizando = false;
    async function actualizarEnSegundoPlano() {
        if (actualizando || document.visibilityState !== 'visible' || hayModalAbierto()) return;
        if (!Eco.Sesion.usuarioActual()) return;
        actualizando = true;
        try {
            await sincronizar();
        } catch (error) {
            console.warn(error);
            actualizarEstado('Sin conexión', error.mensajeServidor || 'Se reintentará en unos segundos.', true);
            if (error.codigo === 'sesion') {
                Eco.Util.mostrarAviso('Tu sesión venció. Inicia sesión de nuevo.', 'error');
                window.setTimeout(() => Eco.Sesion.cerrarSesion(), 1500);
            }
        } finally {
            actualizando = false;
        }
    }

    function iniciarActualizacionPeriodica() {
        if (temporizador) return;
        temporizador = window.setInterval(actualizarEnSegundoPlano, 30000);
        window.addEventListener('focus', actualizarEnSegundoPlano);
    }

    function descargarBaseDatos() {
        try {
            const bytes = Eco.DB.exportar();
            const ahora = new Date();
            const marca = `${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}_` +
                `${dosDigitos(ahora.getHours())}${dosDigitos(ahora.getMinutes())}`;
            const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
            Eco.Util.descargarArchivo(`ecogestion_${marca}.sqlite`, blob, 'application/x-sqlite3');
            Eco.Util.mostrarAviso('Copia SQLite descargada (contiene los datos que tu cuenta puede ver).');
        } catch (error) {
            console.error(error);
            Eco.Util.mostrarAviso('No se pudo descargar la base de datos.', 'error');
        }
    }

    function iniciarBaseDatosUI() {
        document.getElementById('btn-descargar-bd').addEventListener('click', descargarBaseDatos);
        document.getElementById('btn-sincronizar').addEventListener('click', async () => {
            try {
                await sincronizar();
                Eco.Util.mostrarAviso('Datos actualizados.');
            } catch (error) {
                Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo sincronizar.'), 'error');
            }
        });
        document.getElementById('btn-reintentar').addEventListener('click', () => window.location.reload());
    }

    function mostrarError(mensaje) {
        const capa = document.getElementById('capa-error');
        document.getElementById('mensaje-error').textContent = mensaje;
        capa.hidden = false;
        actualizarEstado('Sin conexión', 'La aplicación no pudo iniciar.', true);
    }

    async function iniciar() {
        if (iniciada) return;
        iniciada = true;
        iniciarFecha();
        iniciarNavegacion();
        iniciarModales();
        iniciarBaseDatosUI();

        Eco.Materiales.init();
        Eco.Recolecciones.init();
        Eco.Inventario.init();
        Eco.Historial.init();
        Eco.Reportes.init();
        Eco.Panel.init();
        Eco.Perfil.init();
        Eco.Mercado.init();
        Eco.Publicaciones.init();
        Eco.Ofertas.init();
        Eco.Empresa.init();
        Eco.Administracion.init();

        try {
            await Eco.DB.iniciar();
            actualizarEstado('Conectando…', 'Base central en Supabase');
            // La sesión decide qué se muestra: pantalla de acceso o la vista inicial del rol.
            await Eco.Sesion.iniciar();
            document.getElementById('capa-carga').classList.add('oculto');
        } catch (error) {
            console.error(error);
            document.getElementById('capa-carga').classList.add('oculto');
            mostrarError(error.message || 'No se pudo iniciar la aplicación.');
        }
    }

    Eco.App = {
        iniciar,
        irA,
        refrescarTodo,
        despuesDeCambio,
        confirmar,
        abrirModal,
        cerrarModal,
        notificar: Eco.Util.mostrarAviso,
        descargarBaseDatos,
        marcarSincronizado,
        iniciarActualizacionPeriodica
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
