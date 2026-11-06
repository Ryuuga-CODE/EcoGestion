/* ============================================================
   EcoGestión · Sesión, autenticación y permisos
   - Inicio de sesión con Google Identity Services (GIS).
   - El token de Google se envía a Supabase Auth, que verifica su
     firma en el servidor y entrega una sesión propia.
   - Registro de cuentas nuevas: tipo de cuenta (ciudadano,
     repartidor o empresa) y municipio (Departamento → Municipio,
     DIVIPOLA). Se crea en el servidor con registrar_cuenta.
     Los correos autorizados entran como administradores del
     municipio que elijan. Los repartidores esperan aprobación.
   - Permisos por rol (roles_permisos) para mostrar solo las
     opciones que corresponden. El servidor vuelve a comprobarlos
     en cada operación.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const URL_GIS = 'https://accounts.google.com/gsi/client';

    // Vista -> permisos que la habilitan (basta con tener uno)
    const PERMISOS_VISTA = {
        panel: ['inventario.gestionar'],
        materiales: ['inventario.gestionar'],
        recolecciones: ['inventario.gestionar'],
        inventario: ['inventario.gestionar'],
        historial: ['inventario.gestionar'],
        reportes: ['inventario.gestionar'],
        solicitudes: ['solicitudes.gestionar'],
        pedidos: ['pedidos.gestionar'],
        administracion: ['usuarios.gestionar'],
        'mis-solicitudes': ['solicitudes.crear'],
        rutas: ['recolecciones.realizar'],
        empresa: ['pedidos.crear', 'empresa.gestionar'],
        perfil: ['perfil.editar']
    };
    const TIPOS_REGISTRO = ['ciudadano', 'repartidor', 'empresa'];
    const CAMPOS_REGISTRO = ['registro-tipo', 'registro-departamento', 'registro-municipio', 'registro-direccion',
        'registro-telefono', 'registro-razon', 'registro-nit'];

    let usuario = null;
    let idUsuario = null;
    let permisos = new Set();
    let gisCargado = false;
    let nonceCrudo = null;
    let ocupado = false;
    let registroAdmin = false;
    let lugaresRegistro = null;

    const config = () => Eco.Config || {};
    const $ = (id) => document.getElementById(id);

    /* ---------------------------- Utilidades ---------------------------- */
    function iniciales(nombre) {
        return String(nombre || '?').trim().split(/\s+/).slice(0, 2)
            .map((parte) => parte.charAt(0).toUpperCase()).join('') || '?';
    }

    /** Avatar con la foto de Google o, si no hay, las iniciales. */
    function avatar(nombre, foto, clase) {
        const extra = clase ? ` ${clase}` : '';
        const texto = Eco.Util.escaparHtml(iniciales(nombre));
        if (foto && /^https:\/\//i.test(foto)) {
            return `<span class="avatar${extra}" data-iniciales="${texto}">` +
                `<img class="avatar-img" src="${Eco.Util.escaparHtml(foto)}" alt="" referrerpolicy="no-referrer"></span>`;
        }
        return `<span class="avatar${extra}">${texto}</span>`;
    }

    async function sha256Hex(texto) {
        const datos = new TextEncoder().encode(texto);
        const hash = await window.crypto.subtle.digest('SHA-256', datos);
        return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function nonceAleatorio() {
        const bytes = new Uint8Array(24);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    /* ------------------------- Datos de la cuenta ------------------------- */
    function cargarUsuario(id) {
        const fila = Eco.DB.consultarUno(
            `SELECT u.id_usuario, u.nombre, u.correo, p.foto_url, p.telefono, p.direccion, p.codigo_municipio,
                    p.activo, p.pendiente, p.metodo_registro, p.id_rol, r.codigo AS rol, r.nombre AS rol_nombre
             FROM usuarios u
             JOIN perfiles p ON p.id_usuario = u.id_usuario
             JOIN roles r ON r.id_rol = p.id_rol
             WHERE u.id_usuario = ?`,
            [id]
        );
        if (!fila) return null;
        fila.permisos = Eco.DB.consultar(
            `SELECT pe.codigo FROM roles_permisos rp
             JOIN permisos pe ON pe.id_permiso = rp.id_permiso WHERE rp.id_rol = ?`,
            [fila.id_rol]
        ).map((p) => p.codigo);
        return fila;
    }

    const tiene = (permiso) => permisos.has(permiso);
    const tieneAlguno = (lista) => lista.some((permiso) => permisos.has(permiso));

    function puedeVerVista(vista) {
        if (!usuario) return false;
        const requeridos = PERMISOS_VISTA[vista];
        return Boolean(requeridos && tieneAlguno(requeridos));
    }

    /** Detiene una acción si el usuario no tiene el permiso (el servidor también lo comprueba). */
    function exigir(permiso) {
        if (!usuario || !tiene(permiso)) throw new Error('No tienes permiso para realizar esta acción.');
        return usuario;
    }

    function vistaInicial() {
        const orden = ['panel', 'mis-solicitudes', 'rutas', 'empresa'];
        return orden.find((vista) => puedeVerVista(vista)) || 'perfil';
    }

    /* ------------------------ Interfaz según el rol ------------------------ */
    function aplicarPermisosUI() {
        document.querySelectorAll('[data-permiso]').forEach((elemento) => {
            const requeridos = elemento.dataset.permiso.split(/\s+/).filter(Boolean);
            elemento.hidden = !usuario || !tieneAlguno(requeridos);
        });
        let primero = true;
        document.querySelectorAll('.menu .menu-titulo').forEach((titulo) => {
            titulo.classList.toggle('menu-titulo-primero', primero && !titulo.hidden);
            if (!titulo.hidden) primero = false;
        });
        const tarjeta = $('tarjeta-usuario');
        tarjeta.hidden = !usuario;
        if (usuario) {
            $('tarjeta-usuario-avatar').innerHTML = avatar(usuario.nombre, usuario.foto_url);
            $('tarjeta-usuario-nombre').textContent = usuario.nombre;
            $('tarjeta-usuario-rol').textContent = usuario.rol_nombre;
            $('marca-municipio').textContent = Eco.Lugares.nombre(usuario.codigo_municipio);
        } else {
            $('marca-municipio').textContent = 'Residuos aprovechables';
        }
    }

    /* --------------------------- Entrar / salir --------------------------- */
    /** Pregunta al servidor el estado de la cuenta y continúa según el caso. */
    async function continuarSesion() {
        const info = await Eco.Nube.rpc('iniciar_sesion');
        if (info.estado === 'inactivo' || info.estado === 'pendiente') {
            await Eco.Nube.cerrarSesion();
            mostrarAcceso();
            mostrarErrorAcceso(info.estado === 'pendiente'
                ? 'Tu cuenta de repartidor está creada y espera la aprobación del administrador de tu municipio. Vuelve a entrar cuando te confirmen.'
                : 'Esta cuenta está desactivada. Comunícate con el administrador de tu municipio.',
            false, info.estado === 'pendiente');
            return;
        }
        if (info.estado === 'registro') {
            mostrarRegistro(info);
            return;
        }
        idUsuario = Number(info.id_usuario);
        await Eco.Nube.sincronizar();
        const datos = cargarUsuario(idUsuario);
        if (!datos) throw new Error('No se pudieron cargar los datos de tu cuenta.');
        usuario = datos;
        permisos = new Set(datos.permisos);
        aplicarPermisosUI();
        $('capa-acceso').hidden = true;
        document.body.classList.remove('sin-sesion');
        Eco.App.marcarSincronizado();
        Eco.App.refrescarTodo();
        Eco.App.irA(vistaInicial());
        Eco.App.iniciarActualizacionPeriodica();
    }

    async function cerrarSesion() {
        if (window.google && window.google.accounts) {
            try { window.google.accounts.id.disableAutoSelect(); } catch (error) { /* sin acción */ }
        }
        await Eco.Nube.cerrarSesion();
        // Recargar garantiza que no quede información de la cuenta en pantalla.
        window.location.reload();
    }

    /** Después de cada sincronización: comprueba que la cuenta siga activa y con el mismo rol. */
    function revalidar() {
        if (!usuario) return;
        const datos = cargarUsuario(idUsuario);
        if (!datos || !Number(datos.activo)) {
            Eco.Util.mostrarAviso('Tu cuenta fue desactivada. La sesión se cerrará.', 'error');
            window.setTimeout(cerrarSesion, 1600);
            return;
        }
        const cambioRol = datos.rol !== usuario.rol;
        usuario = datos;
        permisos = new Set(datos.permisos);
        aplicarPermisosUI();
        if (cambioRol) {
            Eco.Util.mostrarAviso(`Tu tipo de cuenta ahora es: ${datos.rol_nombre}.`);
            Eco.App.irA(vistaInicial());
        }
    }

    /* ------------------------- Google Identity Services ------------------------- */
    async function manejarCredencialGoogle(respuesta) {
        if (ocupado) return;
        ocupado = true;
        limpiarErrorAcceso();
        mostrarCargandoAcceso(true);
        try {
            await Eco.Nube.iniciarConGoogle(respuesta && respuesta.credential, nonceCrudo);
            await continuarSesion();
        } catch (error) {
            console.warn(error);
            mostrarErrorAcceso(Eco.Util.mensajeError(error, 'No se pudo iniciar sesión.'));
            prepararGoogle(); // nonce nuevo para el siguiente intento
        } finally {
            ocupado = false;
            mostrarCargandoAcceso(false);
        }
    }

    function avisarGoogle(mensaje) {
        $('acceso-google-aviso').innerHTML = mensaje;
        $('acceso-google-aviso').hidden = false;
        $('boton-google').hidden = true;
    }

    async function prepararGoogle() {
        const idCliente = String(config().GOOGLE_CLIENT_ID || '').trim();
        if (!Eco.Nube.configurada()) {
            avisarGoogle('<strong>Conexión con Supabase sin configurar.</strong> Agrega la URL y la clave pública de tu proyecto en <code>js/config.js</code> (README, sección 11).');
            return;
        }
        if (!idCliente) {
            avisarGoogle('<strong>Inicio con Google sin configurar.</strong> Agrega tu Client ID en <code>js/config.js</code>.');
            return;
        }
        if (window.location.protocol === 'file:') {
            avisarGoogle('<strong>Google no permite iniciar sesión desde un archivo abierto con doble clic.</strong> Abre el proyecto desde IntelliJ IDEA o desde la dirección publicada.');
            return;
        }

        const inicializar = async () => {
            try {
                nonceCrudo = nonceAleatorio();
                window.google.accounts.id.initialize({
                    client_id: idCliente,
                    callback: manejarCredencialGoogle,
                    nonce: await sha256Hex(nonceCrudo),
                    auto_select: false,
                    cancel_on_tap_outside: true,
                    ux_mode: 'popup',
                    context: 'signin'
                });
                window.google.accounts.id.renderButton($('boton-google'), {
                    type: 'standard', theme: 'outline', size: 'large', text: 'continue_with',
                    shape: 'pill', logo_alignment: 'left', locale: 'es', width: 300
                });
                $('acceso-google-aviso').hidden = true;
                $('boton-google').hidden = false;
            } catch (error) {
                console.error(error);
                avisarGoogle('No se pudo iniciar Google Identity Services. Revisa el Client ID en <code>js/config.js</code>.');
            }
        };

        if (gisCargado && window.google && window.google.accounts) {
            await inicializar();
            return;
        }
        avisarGoogle('Cargando el inicio de sesión de Google…');
        const script = document.createElement('script');
        script.src = URL_GIS;
        script.async = true;
        script.onload = () => { gisCargado = true; inicializar(); };
        script.onerror = () => avisarGoogle('<strong>No se pudo cargar Google.</strong> Revisa tu conexión a Internet.');
        document.head.appendChild(script);
    }

    /* ------------------------------- Registro ------------------------------- */
    function mostrarRegistro(info) {
        $('paso-acceso').hidden = true;
        $('paso-registro').hidden = false;
        $('capa-acceso').hidden = false;
        $('registro-avatar').innerHTML = avatar(info.nombre, info.foto, 'avatar-grande');
        $('registro-nombre').textContent = info.nombre;
        $('registro-correo').textContent = info.correo;
        $('form-registro').reset();
        registroAdmin = Boolean(info.administrador);
        $('registro-aviso-admin').hidden = !registroAdmin;
        $('registro-campo-tipo').hidden = registroAdmin;
        $('registro-subtitulo').textContent = registroAdmin
            ? 'Es tu primera vez en EcoGestión. Elige el municipio que administras.'
            : 'Es tu primera vez en EcoGestión. Elige tu tipo de cuenta y tu municipio.';
        if (!lugaresRegistro) lugaresRegistro = Eco.Comun.prepararLugares('registro-departamento', 'registro-municipio');
        lugaresRegistro.reiniciar();
        actualizarCamposTipo();
        Eco.Util.limpiarErroresCampos(CAMPOS_REGISTRO);
    }

    async function cancelarRegistro() {
        await Eco.Nube.cerrarSesion();
        if (window.google && window.google.accounts) {
            try { window.google.accounts.id.disableAutoSelect(); } catch (error) { /* sin acción */ }
        }
        $('paso-registro').hidden = true;
        $('paso-acceso').hidden = false;
        prepararGoogle();
    }

    function tipoSeleccionado() {
        const marcado = document.querySelector('input[name="registro-tipo"]:checked');
        return marcado ? marcado.value : '';
    }

    /** Cada tipo de cuenta pide datos distintos. */
    function actualizarCamposTipo() {
        const tipo = registroAdmin ? 'administrador' : tipoSeleccionado();
        const direccionObligatoria = tipo === 'ciudadano' || tipo === '';
        $('registro-campos-empresa').hidden = tipo !== 'empresa';
        $('registro-direccion-obligatorio').hidden = !direccionObligatoria;
        $('registro-direccion-opcional').hidden = direccionObligatoria;
        $('registro-direccion-ayuda').textContent = tipo === 'empresa'
            ? 'Dirección de la empresa o de la planta.'
            : tipo === 'repartidor' || tipo === 'administrador'
                ? 'Opcional.'
                : 'Aquí pasará el repartidor a recoger tus residuos.';
        $('registro-telefono-obligatorio').hidden = tipo !== 'repartidor';
        $('registro-telefono-opcional').hidden = tipo === 'repartidor';
    }

    async function enviarRegistro(evento) {
        evento.preventDefault();
        const tipo = registroAdmin ? 'administrador' : tipoSeleccionado();
        const datos = {
            telefono: $('registro-telefono').value.trim(),
            municipio: $('registro-municipio').value,
            direccion: $('registro-direccion').value.replace(/\s+/g, ' ').trim(),
            razonSocial: $('registro-razon').value.replace(/\s+/g, ' ').trim(),
            nit: $('registro-nit').value.trim()
        };
        let valido = true;
        const error = (id, mensaje) => { Eco.Util.mostrarErrorCampo(id, mensaje); valido = false; };
        Eco.Util.limpiarErroresCampos(CAMPOS_REGISTRO);
        if (!registroAdmin && !TIPOS_REGISTRO.includes(tipo)) error('registro-tipo', 'Selecciona el tipo de cuenta.');
        if (!$('registro-departamento').value) error('registro-departamento', 'Selecciona el departamento.');
        else if (!Eco.Lugares.municipio(datos.municipio)) error('registro-municipio', 'Selecciona el municipio.');
        if (tipo === 'ciudadano' && datos.direccion.length < 5) {
            error('registro-direccion', 'Escribe tu dirección y barrio (mínimo 5 caracteres).');
        } else if (datos.direccion.length > 150) {
            error('registro-direccion', 'La dirección no puede superar 150 caracteres.');
        }
        if (datos.telefono && !/^[0-9+()\s-]{7,30}$/.test(datos.telefono)) {
            error('registro-telefono', 'Escribe un teléfono válido (solo números, espacios, +, - o paréntesis).');
        } else if (tipo === 'repartidor' && !datos.telefono) {
            error('registro-telefono', 'Los repartidores deben indicar un teléfono de contacto.');
        }
        if (tipo === 'empresa') {
            if (datos.razonSocial.length < 2 || datos.razonSocial.length > 120) {
                error('registro-razon', 'Escribe el nombre de la empresa (entre 2 y 120 caracteres).');
            }
            if (datos.nit && !/^[0-9.\-\s]{5,20}$/.test(datos.nit)) error('registro-nit', 'El NIT solo puede tener números, puntos y guion.');
        }
        if (!valido) return;

        const boton = $('btn-crear-cuenta');
        boton.disabled = true;
        $('registro-error').hidden = true;
        try {
            await Eco.Nube.rpc('registrar_cuenta', {
                p_tipo: tipo,
                p_codigo_municipio: datos.municipio,
                p_direccion: datos.direccion || null,
                p_telefono: datos.telefono || null,
                p_razon_social: tipo === 'empresa' ? datos.razonSocial : null,
                p_nit: tipo === 'empresa' ? (datos.nit || null) : null
            });
            $('paso-registro').hidden = true;
            $('paso-acceso').hidden = false;
            await continuarSesion();
        } catch (errorRegistro) {
            console.warn(errorRegistro);
            mostrarErrorAcceso(Eco.Util.mensajeError(errorRegistro, 'No se pudo crear la cuenta.'), true);
        } finally {
            boton.disabled = false;
        }
    }

    /* --------------------------- Pantalla de acceso --------------------------- */
    function mostrarErrorAcceso(mensaje, enRegistro, informativo) {
        const caja = enRegistro ? $('registro-error') : $('acceso-error');
        caja.textContent = mensaje;
        caja.classList.toggle('acceso-info', Boolean(informativo));
        caja.hidden = false;
    }

    function limpiarErrorAcceso() {
        $('acceso-error').hidden = true;
        $('registro-error').hidden = true;
    }

    function mostrarCargandoAcceso(cargando) {
        $('acceso-cargando').hidden = !cargando;
    }

    function mostrarAcceso() {
        usuario = null;
        idUsuario = null;
        permisos = new Set();
        aplicarPermisosUI();
        document.body.classList.add('sin-sesion');
        $('paso-registro').hidden = true;
        $('paso-acceso').hidden = false;
        $('capa-acceso').hidden = false;
        limpiarErrorAcceso();
        prepararGoogle();
    }

    function initEventos() {
        $('form-registro').addEventListener('submit', enviarRegistro);
        $('btn-cancelar-registro').addEventListener('click', cancelarRegistro);
        document.querySelectorAll('input[name="registro-tipo"]').forEach((opcion) => {
            opcion.addEventListener('change', () => {
                actualizarCamposTipo();
                Eco.Util.limpiarErrorCampo('registro-tipo');
            });
        });
        CAMPOS_REGISTRO.slice(1).forEach((id) => {
            $(id).addEventListener('input', () => Eco.Util.limpiarErrorCampo(id));
            $(id).addEventListener('change', () => Eco.Util.limpiarErrorCampo(id));
        });
        $('registro-departamento').addEventListener('change', () => Eco.Util.limpiarErrorCampo('registro-municipio'));
        $('btn-cerrar-sesion').addEventListener('click', cerrarSesion);
        $('tarjeta-usuario-perfil').addEventListener('click', () => Eco.App.irA('perfil'));

        // Si una foto de perfil no carga, se muestran las iniciales.
        document.addEventListener('error', (evento) => {
            const imagen = evento.target;
            if (!(imagen instanceof HTMLImageElement) || !imagen.classList.contains('avatar-img')) return;
            const contenedor = imagen.parentElement;
            contenedor.textContent = contenedor.dataset.iniciales || '?';
        }, true);
    }

    /** Se llama cuando el motor SQLite ya está listo. */
    async function iniciar() {
        initEventos();
        if (Eco.Nube.configurada() && await Eco.Nube.restaurarSesion()) {
            try {
                await continuarSesion();
                return;
            } catch (error) {
                console.warn(error);
                if (error.codigo === 'red') {
                    mostrarAcceso();
                    mostrarErrorAcceso(error.mensajeServidor);
                    return;
                }
                await Eco.Nube.cerrarSesion();
            }
        }
        mostrarAcceso();
    }

    Eco.Sesion = {
        iniciar,
        cerrarSesion,
        revalidar,
        tiene,
        tieneAlguno,
        exigir,
        puedeVerVista,
        aplicarPermisosUI,
        avatar,
        usuarioActual: () => usuario,
        metodo: () => 'google',
        // Expuesto para las pruebas automáticas
        _manejarCredencialGoogle: manejarCredencialGoogle
    };
})();
