/* ============================================================
   EcoGestión · Sesión, autenticación y permisos
   - Inicio de sesión con Google Identity Services (GIS).
   - Registro de cuentas nuevas con selección del tipo de cuenta.
   - Acceso de demostración (opcional, NO es autenticación).
   - Permisos por rol leídos de la base (roles_permisos) para
     mostrar solo las opciones que corresponden.

   IMPORTANTE: esta aplicación no tiene servidor. El token de
   Google se valida en el navegador (emisor, destinatario,
   vencimiento y correo verificado), pero la FIRMA del token solo
   se puede verificar de forma segura en un backend. Ver README.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const CLAVE_SESION = 'ecogestion_sesion';
    const URL_GIS = 'https://accounts.google.com/gsi/client';
    const EMISORES_GOOGLE = ['accounts.google.com', 'https://accounts.google.com'];

    // Vista -> permisos que la habilitan (basta con tener uno)
    const PERMISOS_VISTA = {
        panel: ['inventario.gestionar'],
        materiales: ['inventario.gestionar'],
        recolecciones: ['inventario.gestionar'],
        inventario: ['inventario.gestionar'],
        historial: ['inventario.gestionar'],
        reportes: ['inventario.gestionar'],
        mercado: ['mercado.consultar'],
        publicaciones: ['publicaciones.gestionar'],
        ofertas: ['ofertas.recibir', 'ofertas.enviar'],
        empresa: ['empresa.gestionar'],
        administracion: ['usuarios.gestionar', 'mercado.supervisar'],
        perfil: ['perfil.editar']
    };

    const TIPOS_REGISTRO = ['vendedor', 'comprador', 'empresa'];

    let usuario = null;
    let permisos = new Set();
    let metodoActual = null;
    let registroPendiente = null;
    let gisCargado = false;

    /* ---------------------- Utilidades ---------------------- */
    function config() {
        return Eco.Config || {};
    }

    function $(id) {
        return document.getElementById(id);
    }

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

    function leerSesionGuardada() {
        try {
            const datos = JSON.parse(window.localStorage.getItem(CLAVE_SESION) || 'null');
            if (!datos || !datos.id || !datos.expira || Date.now() > datos.expira) return null;
            return datos;
        } catch (error) {
            return null;
        }
    }

    function guardarSesion(id, metodo) {
        const horas = Number(config().DURACION_SESION_HORAS) || 12;
        try {
            window.localStorage.setItem(CLAVE_SESION, JSON.stringify({
                id,
                metodo,
                expira: Date.now() + horas * 3600 * 1000
            }));
        } catch (error) {
            // Sin almacenamiento la sesión dura hasta recargar la página.
        }
    }

    function borrarSesion() {
        try { window.localStorage.removeItem(CLAVE_SESION); } catch (error) { /* sin acción */ }
    }

    /* -------------------- Datos de la cuenta -------------------- */
    function cargarUsuario(id) {
        const fila = Eco.DB.consultarUno(
            `SELECT u.id_usuario, u.nombre, u.correo, p.foto_url, p.telefono, p.ubicacion,
                    p.activo, p.metodo_registro, p.google_sub, p.id_rol,
                    r.codigo AS rol, r.nombre AS rol_nombre
             FROM usuarios u
             JOIN perfiles p ON p.id_usuario = u.id_usuario
             JOIN roles r ON r.id_rol = p.id_rol
             WHERE u.id_usuario = ?`,
            [id]
        );
        if (!fila) return null;
        fila.permisos = Eco.DB.consultar(
            `SELECT pe.codigo FROM roles_permisos rp
             JOIN permisos pe ON pe.id_permiso = rp.id_permiso
             WHERE rp.id_rol = ?`,
            [fila.id_rol]
        ).map((p) => p.codigo);
        return fila;
    }

    function tiene(permiso) {
        return permisos.has(permiso);
    }

    function tieneAlguno(lista) {
        return lista.some((permiso) => permisos.has(permiso));
    }

    function puedeVerVista(vista) {
        if (!usuario) return false;
        const requeridos = PERMISOS_VISTA[vista];
        return Boolean(requeridos && tieneAlguno(requeridos));
    }

    /** Detiene una acción si el usuario no tiene el permiso. */
    function exigir(permiso) {
        if (!usuario || !tiene(permiso)) {
            throw new Error('No tienes permiso para realizar esta acción.');
        }
        return usuario;
    }

    function vistaInicial() {
        if (puedeVerVista('panel')) return 'panel';
        if (puedeVerVista('mercado')) return 'mercado';
        return 'perfil';
    }

    /* ------------------- Interfaz según el rol ------------------- */
    function aplicarPermisosUI() {
        document.querySelectorAll('[data-permiso]').forEach((elemento) => {
            const requeridos = elemento.dataset.permiso.split(/\s+/).filter(Boolean);
            elemento.hidden = !usuario || !tieneAlguno(requeridos);
        });
        // El primer título visible del menú no necesita margen superior.
        const titulos = Array.from(document.querySelectorAll('.menu .menu-titulo'));
        let primero = true;
        titulos.forEach((titulo) => {
            titulo.classList.toggle('menu-titulo-primero', primero && !titulo.hidden);
            if (!titulo.hidden) primero = false;
        });
        pintarTarjetaUsuario();
    }

    function pintarTarjetaUsuario() {
        const tarjeta = $('tarjeta-usuario');
        if (!tarjeta) return;
        tarjeta.hidden = !usuario;
        if (!usuario) return;
        $('tarjeta-usuario-avatar').innerHTML = avatar(usuario.nombre, usuario.foto_url);
        $('tarjeta-usuario-nombre').textContent = usuario.nombre;
        $('tarjeta-usuario-rol').textContent = usuario.rol_nombre +
            (metodoActual === 'demo' ? ' (demo)' : '');
    }

    /* ------------------------- Entrar / salir ------------------------- */
    async function entrar(id, metodo) {
        const datos = cargarUsuario(id);
        if (!datos) {
            mostrarErrorAcceso('La cuenta no existe en esta base de datos.');
            return false;
        }
        if (!datos.activo) {
            mostrarErrorAcceso('Esta cuenta está desactivada. Comunícate con el administrador.');
            return false;
        }
        usuario = datos;
        permisos = new Set(datos.permisos);
        metodoActual = metodo;
        guardarSesion(id, metodo);

        try {
            Eco.DB.ejecutar(
                "UPDATE perfiles SET ultimo_acceso = datetime('now', 'localtime') WHERE id_usuario = ?",
                [id]
            );
            await Eco.DB.persistir();
        } catch (error) {
            console.warn('No se pudo registrar el último acceso.', error);
        }

        aplicarPermisosUI();
        $('capa-acceso').hidden = true;
        document.body.classList.remove('sin-sesion');
        Eco.App.refrescarTodo();
        Eco.App.irA(vistaInicial());
        Eco.Util.mostrarAviso(`Bienvenido, ${datos.nombre}.`);
        return true;
    }

    function cerrarSesion() {
        if (metodoActual === 'google' && window.google && window.google.accounts) {
            try { window.google.accounts.id.disableAutoSelect(); } catch (error) { /* sin acción */ }
        }
        borrarSesion();
        // Recargar garantiza que no quede información de la cuenta en pantalla.
        window.location.reload();
    }

    /** Comprueba la cuenta tras restaurar o cargar otra base de datos. */
    function revalidar() {
        if (!usuario) return;
        const datos = cargarUsuario(usuario.id_usuario);
        if (!datos || !datos.activo || (usuario.google_sub && datos.google_sub !== usuario.google_sub)) {
            Eco.Util.mostrarAviso('Tu cuenta no está disponible en la base cargada. Inicia sesión de nuevo.', 'error');
            window.setTimeout(cerrarSesion, 1400);
            return;
        }
        usuario = datos;
        permisos = new Set(datos.permisos);
        aplicarPermisosUI();
    }

    /** Recarga los datos de la cuenta actual (por ejemplo, tras editar el perfil). */
    function refrescarUsuario() {
        if (!usuario) return;
        const datos = cargarUsuario(usuario.id_usuario);
        if (datos) {
            usuario = datos;
            permisos = new Set(datos.permisos);
            aplicarPermisosUI();
        }
    }

    /* ------------------------ Google Identity ------------------------ */
    function decodificarToken(token) {
        const partes = String(token || '').split('.');
        if (partes.length !== 3) throw new Error('Token de Google con formato inválido.');
        const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
        const relleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
        const binario = window.atob(relleno);
        const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
        return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    }

    /**
     * Comprobaciones que SÍ se pueden hacer en el navegador.
     * La verificación de la firma (claves públicas de Google) debe
     * hacerse en un servidor; ver README, sección 10.
     */
    function validarDatosToken(datos) {
        const ahora = Math.floor(Date.now() / 1000);
        if (!EMISORES_GOOGLE.includes(datos.iss)) throw new Error('El token no fue emitido por Google.');
        if (datos.aud !== config().GOOGLE_CLIENT_ID) throw new Error('El token no corresponde a esta aplicación.');
        if (!datos.exp || datos.exp < ahora) throw new Error('El token de Google ya venció. Inténtalo de nuevo.');
        if (!datos.sub) throw new Error('El token no identifica a la cuenta de Google.');
        if (!datos.email || datos.email_verified !== true) {
            throw new Error('La cuenta de Google debe tener un correo verificado.');
        }
    }

    function esCorreoAdministrador(correo) {
        const lista = (config().CORREOS_ADMINISTRADORES || []).map((c) => String(c).trim().toLowerCase());
        return lista.includes(String(correo || '').trim().toLowerCase());
    }

    async function manejarCredencialGoogle(respuesta) {
        limpiarErrorAcceso();
        let datos;
        try {
            datos = decodificarToken(respuesta && respuesta.credential);
            validarDatosToken(datos);
        } catch (error) {
            mostrarErrorAcceso(error.message);
            return;
        }

        const existente = Eco.DB.consultarUno('SELECT id_usuario FROM perfiles WHERE google_sub = ?', [datos.sub]);
        if (existente) {
            try {
                Eco.DB.ejecutar('UPDATE perfiles SET foto_url = ? WHERE id_usuario = ?',
                    [datos.picture || null, existente.id_usuario]);
                if (esCorreoAdministrador(datos.email)) asignarRol(existente.id_usuario, 'administrador');
            } catch (error) {
                console.warn('No se pudo actualizar el perfil de Google.', error);
            }
            await entrar(existente.id_usuario, 'google');
            return;
        }

        const correoUsado = Eco.DB.consultarUno(
            'SELECT id_usuario FROM usuarios WHERE lower(correo) = lower(?)', [datos.email]
        );
        if (correoUsado) {
            mostrarErrorAcceso('Ese correo ya está asociado a otra cuenta de EcoGestión.');
            return;
        }

        const perfilGoogle = {
            sub: datos.sub,
            correo: datos.email,
            nombre: (datos.name || datos.email.split('@')[0]).trim(),
            foto: datos.picture || null
        };

        if (esCorreoAdministrador(datos.email)) {
            try {
                const id = crearCuenta(perfilGoogle, 'administrador', {});
                await Eco.DB.persistir();
                await entrar(id, 'google');
            } catch (error) {
                mostrarErrorAcceso(Eco.Util.mensajeError(error, 'No se pudo crear la cuenta de administrador.'));
            }
            return;
        }
        mostrarRegistro(perfilGoogle);
    }

    function cargarGoogle() {
        const contenedor = $('acceso-google');
        const aviso = $('acceso-google-aviso');
        const boton = $('boton-google');
        const idCliente = String(config().GOOGLE_CLIENT_ID || '').trim();

        const avisar = (mensaje) => {
            aviso.innerHTML = mensaje;
            aviso.hidden = false;
            boton.hidden = true;
        };

        contenedor.hidden = false;
        if (!idCliente) {
            avisar('<strong>Inicio con Google sin configurar.</strong> Agrega tu Client ID en <code>js/config.js</code> (instrucciones en el README).');
            return;
        }
        if (window.location.protocol === 'file:') {
            avisar('<strong>Google no permite iniciar sesión desde un archivo abierto con doble clic.</strong> Abre el proyecto desde IntelliJ IDEA (dirección <code>http://localhost:63342/…</code>).');
            return;
        }

        const inicializar = () => {
            try {
                window.google.accounts.id.initialize({
                    client_id: idCliente,
                    callback: manejarCredencialGoogle,
                    auto_select: false,
                    cancel_on_tap_outside: true,
                    ux_mode: 'popup',
                    context: 'signin'
                });
                window.google.accounts.id.renderButton(boton, {
                    type: 'standard',
                    theme: 'outline',
                    size: 'large',
                    text: 'continue_with',
                    shape: 'pill',
                    logo_alignment: 'left',
                    locale: 'es',
                    width: 300
                });
                aviso.hidden = true;
                boton.hidden = false;
            } catch (error) {
                console.error(error);
                avisar('No se pudo iniciar Google Identity Services. Revisa el Client ID en <code>js/config.js</code>.');
            }
        };

        if (gisCargado && window.google && window.google.accounts) {
            inicializar();
            return;
        }
        avisar('Cargando el inicio de sesión de Google…');
        const script = document.createElement('script');
        script.src = URL_GIS;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            gisCargado = true;
            inicializar();
        };
        script.onerror = () => {
            avisar('<strong>No se pudo cargar Google.</strong> El inicio de sesión con Google necesita conexión a Internet.');
        };
        document.head.appendChild(script);
    }

    /* --------------------------- Registro --------------------------- */
    function nombreDisponible(base, correo) {
        const limpio = base.replace(/\s+/g, ' ').trim().slice(0, 80);
        const candidatos = [
            limpio.length >= 2 ? limpio : correo.split('@')[0],
            `${limpio} (${correo.split('@')[0]})`.slice(0, 80)
        ];
        for (const candidato of candidatos) {
            if (!Eco.DB.consultarUno('SELECT 1 AS hay FROM usuarios WHERE nombre = ?', [candidato])) return candidato;
        }
        for (let n = 2; n < 1000; n += 1) {
            const candidato = `${limpio.slice(0, 74)} ${n}`;
            if (!Eco.DB.consultarUno('SELECT 1 AS hay FROM usuarios WHERE nombre = ?', [candidato])) return candidato;
        }
        throw new Error('No se pudo asignar un nombre único a la cuenta.');
    }

    function asignarRol(idUsuario, codigoRol) {
        Eco.DB.ejecutar(
            'UPDATE perfiles SET id_rol = (SELECT id_rol FROM roles WHERE codigo = ?) WHERE id_usuario = ?',
            [codigoRol, idUsuario]
        );
        // usuarios.rol conserva su sentido original: rol en el centro de acopio.
        Eco.DB.ejecutar('UPDATE usuarios SET rol = ? WHERE id_usuario = ?',
            [codigoRol === 'administrador' ? 'Administrador' : 'Operador', idUsuario]);
    }

    /** Crea usuario + perfil (+ empresa) en una sola transacción. */
    function crearCuenta(perfilGoogle, codigoRol, extra) {
        return Eco.DB.transaccion(() => {
            const nombre = nombreDisponible(perfilGoogle.nombre, perfilGoogle.correo);
            Eco.DB.ejecutar('INSERT INTO usuarios (nombre, rol, correo) VALUES (?, ?, ?)', [
                nombre,
                codigoRol === 'administrador' ? 'Administrador' : 'Operador',
                perfilGoogle.correo
            ]);
            const id = Eco.DB.ultimoId();
            Eco.DB.ejecutar(
                `INSERT INTO perfiles (id_usuario, id_rol, google_sub, foto_url, telefono, ubicacion, metodo_registro)
                 VALUES (?, (SELECT id_rol FROM roles WHERE codigo = ?), ?, ?, ?, ?, 'google')`,
                [id, codigoRol, perfilGoogle.sub, perfilGoogle.foto, extra.telefono || null, extra.ubicacion || null]
            );
            if (codigoRol === 'empresa') {
                Eco.DB.ejecutar(
                    `INSERT INTO empresas (id_usuario, razon_social, nit, telefono, correo_contacto, ciudad)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [id, extra.razonSocial, extra.nit || null, extra.telefono || null,
                        perfilGoogle.correo, extra.ubicacion || null]
                );
            }
            return id;
        });
    }

    function mostrarRegistro(perfilGoogle) {
        registroPendiente = perfilGoogle;
        $('paso-acceso').hidden = true;
        $('paso-registro').hidden = false;
        $('registro-avatar').innerHTML = avatar(perfilGoogle.nombre, perfilGoogle.foto, 'avatar-grande');
        $('registro-nombre').textContent = perfilGoogle.nombre;
        $('registro-correo').textContent = perfilGoogle.correo;
        $('form-registro').reset();
        actualizarCamposEmpresa();
        Eco.Util.limpiarErroresCampos(['registro-tipo', 'registro-ubicacion', 'registro-telefono', 'registro-razon', 'registro-nit']);
    }

    function cancelarRegistro() {
        registroPendiente = null;
        if (window.google && window.google.accounts) {
            try { window.google.accounts.id.disableAutoSelect(); } catch (error) { /* sin acción */ }
        }
        $('paso-registro').hidden = true;
        $('paso-acceso').hidden = false;
    }

    function tipoSeleccionado() {
        const marcado = document.querySelector('input[name="registro-tipo"]:checked');
        return marcado ? marcado.value : '';
    }

    function actualizarCamposEmpresa() {
        $('registro-campos-empresa').hidden = tipoSeleccionado() !== 'empresa';
    }

    async function enviarRegistro(evento) {
        evento.preventDefault();
        if (!registroPendiente) return;
        const tipo = tipoSeleccionado();
        const datos = {
            telefono: $('registro-telefono').value.trim(),
            ubicacion: $('registro-ubicacion').value.replace(/\s+/g, ' ').trim(),
            razonSocial: $('registro-razon').value.replace(/\s+/g, ' ').trim(),
            nit: $('registro-nit').value.trim()
        };
        let valido = true;
        const error = (id, mensaje) => { Eco.Util.mostrarErrorCampo(id, mensaje); valido = false; };
        Eco.Util.limpiarErroresCampos(['registro-tipo', 'registro-ubicacion', 'registro-telefono', 'registro-razon', 'registro-nit']);

        if (!TIPOS_REGISTRO.includes(tipo)) error('registro-tipo', 'Selecciona el tipo de cuenta.');
        if (datos.ubicacion.length < 2 || datos.ubicacion.length > 120) {
            error('registro-ubicacion', 'Indica tu ciudad y barrio (entre 2 y 120 caracteres).');
        }
        if (datos.telefono && !/^[0-9+()\s-]{7,30}$/.test(datos.telefono)) {
            error('registro-telefono', 'Escribe un teléfono válido (solo números, espacios, +, - o paréntesis).');
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
        try {
            const id = crearCuenta(registroPendiente, tipo, datos);
            await Eco.DB.persistir();
            registroPendiente = null;
            $('paso-registro').hidden = true;
            $('paso-acceso').hidden = false;
            await entrar(id, 'google');
        } catch (errorRegistro) {
            console.error(errorRegistro);
            mostrarErrorAcceso(Eco.Util.mensajeError(errorRegistro, 'No se pudo crear la cuenta.'), true);
        } finally {
            boton.disabled = false;
        }
    }

    /* ---------------------- Acceso de demostración ---------------------- */
    function pintarAccesoDemo() {
        const seccion = $('acceso-demo');
        if (!config().PERMITIR_ACCESO_DEMO) {
            seccion.hidden = true;
            return;
        }
        const cuentas = Eco.DB.consultar(
            `SELECT u.id_usuario, u.nombre, r.nombre AS rol_nombre, r.codigo AS rol
             FROM perfiles p
             JOIN usuarios u ON u.id_usuario = p.id_usuario
             JOIN roles r ON r.id_rol = p.id_rol
             WHERE p.metodo_registro = 'demo' AND p.google_sub IS NULL AND p.activo = 1
             ORDER BY CASE r.codigo WHEN 'administrador' THEN 1 WHEN 'vendedor' THEN 2
                                    WHEN 'comprador' THEN 3 ELSE 4 END, u.nombre`
        );
        seccion.hidden = cuentas.length === 0;
        $('lista-demo').innerHTML = cuentas.map((cuenta) => `
            <button type="button" class="cuenta-demo" data-id="${cuenta.id_usuario}">
                ${avatar(cuenta.nombre, null)}
                <span class="cuenta-demo-texto">
                    <strong>${Eco.Util.escaparHtml(cuenta.nombre)}</strong>
                    <small>${Eco.Util.escaparHtml(cuenta.rol_nombre)}</small>
                </span>
            </button>
        `).join('');
    }

    async function entrarDemo(id) {
        if (!config().PERMITIR_ACCESO_DEMO) return;
        const cuenta = Eco.DB.consultarUno(
            "SELECT 1 AS ok FROM perfiles WHERE id_usuario = ? AND metodo_registro = 'demo' AND google_sub IS NULL",
            [id]
        );
        if (!cuenta) {
            mostrarErrorAcceso('Solo las cuentas de prueba se pueden usar sin Google.');
            return;
        }
        await entrar(id, 'demo');
    }

    /* -------------------------- Pantalla de acceso -------------------------- */
    function mostrarErrorAcceso(mensaje, enRegistro) {
        const caja = enRegistro ? $('registro-error') : $('acceso-error');
        caja.textContent = mensaje;
        caja.hidden = false;
    }

    function limpiarErrorAcceso() {
        $('acceso-error').hidden = true;
        $('registro-error').hidden = true;
    }

    function mostrarAcceso() {
        usuario = null;
        permisos = new Set();
        aplicarPermisosUI();
        document.body.classList.add('sin-sesion');
        $('paso-registro').hidden = true;
        $('paso-acceso').hidden = false;
        $('capa-acceso').hidden = false;
        limpiarErrorAcceso();
        cargarGoogle();
        pintarAccesoDemo();
    }

    function initEventos() {
        $('lista-demo').addEventListener('click', (evento) => {
            const boton = evento.target.closest('.cuenta-demo');
            if (boton) entrarDemo(Number(boton.dataset.id));
        });
        $('form-registro').addEventListener('submit', enviarRegistro);
        $('btn-cancelar-registro').addEventListener('click', cancelarRegistro);
        document.querySelectorAll('input[name="registro-tipo"]').forEach((opcion) => {
            opcion.addEventListener('change', () => {
                actualizarCamposEmpresa();
                Eco.Util.limpiarErrorCampo('registro-tipo');
            });
        });
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

    /** Se llama cuando la base de datos ya está lista. */
    async function iniciar() {
        initEventos();
        const guardada = leerSesionGuardada();
        if (guardada) {
            const datos = cargarUsuario(guardada.id);
            if (datos && datos.activo && (guardada.metodo !== 'demo' || config().PERMITIR_ACCESO_DEMO)) {
                await entrar(guardada.id, guardada.metodo);
                return;
            }
            borrarSesion();
        }
        mostrarAcceso();
    }

    Eco.Sesion = {
        iniciar,
        cerrarSesion,
        revalidar,
        refrescarUsuario,
        tiene,
        tieneAlguno,
        exigir,
        puedeVerVista,
        aplicarPermisosUI,
        avatar,
        asignarRol,
        usuarioActual: () => usuario,
        metodo: () => metodoActual,
        // Expuesto para las pruebas y para documentar la validación del token.
        _decodificarToken: decodificarToken,
        _validarDatosToken: validarDatosToken,
        _manejarCredencialGoogle: manejarCredencialGoogle
    };
})();
