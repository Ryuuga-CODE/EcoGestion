/* ============================================================
   EcoGestión · Conexión con Supabase
   Cliente mínimo (sin librerías externas) para la API de Supabase:
   - Auth: inicia sesión con el token de Google (Supabase verifica
     su firma), renueva y cierra la sesión.
   - REST: lee tablas (según RLS) y llama funciones del servidor.
   - Storage: sube las fotografías de las publicaciones.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const CLAVE_SESION = 'ecogestion_supabase_sesion';
    const TAMANO_PAGINA = 1000;

    let sesion = null;          // { access_token, refresh_token, expires_at, user }
    let renovando = null;

    const config = () => Eco.Config || {};
    const base = () => String(config().SUPABASE_URL || '').replace(/\/+$/, '');
    const clave = () => String(config().SUPABASE_ANON_KEY || '');

    function configurada() {
        return /^https?:\/\//.test(base()) && clave().length > 20;
    }

    /** Error con un mensaje listo para mostrar al usuario. */
    function errorServidor(mensaje, codigo) {
        const error = new Error(mensaje);
        error.mensajeServidor = mensaje;
        error.codigo = codigo || null;
        return error;
    }

    function cabeceras(extra) {
        const lista = { apikey: clave() };
        if (sesion && sesion.access_token) lista.Authorization = `Bearer ${sesion.access_token}`;
        return Object.assign(lista, extra || {});
    }

    /** Traduce las respuestas de error de Auth, PostgREST y Storage. */
    async function leerError(respuesta) {
        let datos = null;
        try { datos = await respuesta.json(); } catch (error) { /* sin cuerpo */ }
        const mensaje = datos && (datos.message || datos.msg || datos.error_description || datos.error);
        if (respuesta.status === 401 || (datos && datos.code === 'PGRST301')) {
            return errorServidor('Tu sesión venció. Inicia sesión de nuevo.', 'sesion');
        }
        if (datos && datos.code === '42501') {
            return errorServidor('No tienes permiso para realizar esta acción.', datos.code);
        }
        if (datos && datos.code === '23505') {
            return errorServidor('Ya existe un registro con esos datos.', datos.code);
        }
        if (datos && datos.code === 'P0001' && mensaje) {
            return errorServidor(mensaje, datos.code);   // mensajes de las funciones del servidor
        }
        if (/invalid.*(id token|nonce|audience)|unacceptable audience|provider.*not enabled/i.test(String(mensaje))) {
            return errorServidor('Supabase rechazó el inicio con Google. Revisa la configuración del proveedor Google en Supabase (README, sección 11).', 'auth');
        }
        return errorServidor(mensaje ? `Error del servidor: ${mensaje}` : `Error del servidor (${respuesta.status}).`, datos && datos.code);
    }

    async function pedir(ruta, opciones) {
        let respuesta;
        try {
            respuesta = await window.fetch(base() + ruta, opciones);
        } catch (error) {
            throw errorServidor('No hay conexión con el servidor. Revisa tu conexión a Internet.', 'red');
        }
        if (!respuesta.ok) throw await leerError(respuesta);
        return respuesta;
    }

    /* ------------------------------ Sesión ------------------------------ */
    function guardarSesion(datos) {
        const ahora = Math.floor(Date.now() / 1000);
        sesion = {
            access_token: datos.access_token,
            refresh_token: datos.refresh_token,
            expires_at: datos.expires_at || (ahora + Number(datos.expires_in || 3600)),
            user: datos.user ? { id: datos.user.id, email: datos.user.email } : (sesion && sesion.user)
        };
        try { window.localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion)); } catch (error) { /* sin almacenamiento */ }
    }

    function olvidarSesion() {
        sesion = null;
        try { window.localStorage.removeItem(CLAVE_SESION); } catch (error) { /* sin acción */ }
    }

    /** Inicia sesión en Supabase con el ID token que entrega Google. */
    async function iniciarConGoogle(idToken, nonce) {
        const respuesta = await pedir('/auth/v1/token?grant_type=id_token', {
            method: 'POST',
            headers: { apikey: clave(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: 'google', id_token: idToken, nonce })
        });
        guardarSesion(await respuesta.json());
    }

    async function renovar() {
        if (!sesion || !sesion.refresh_token) return false;
        if (!renovando) {
            renovando = (async () => {
                try {
                    const respuesta = await pedir('/auth/v1/token?grant_type=refresh_token', {
                        method: 'POST',
                        headers: { apikey: clave(), 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refresh_token: sesion.refresh_token })
                    });
                    guardarSesion(await respuesta.json());
                    return true;
                } catch (error) {
                    if (error.codigo !== 'red') olvidarSesion();
                    return false;
                } finally {
                    renovando = null;
                }
            })();
        }
        return renovando;
    }

    async function asegurarToken() {
        if (!sesion) throw errorServidor('Tu sesión venció. Inicia sesión de nuevo.', 'sesion');
        if (sesion.expires_at - Math.floor(Date.now() / 1000) < 90) {
            const ok = await renovar();
            if (!ok) throw errorServidor('Tu sesión venció. Inicia sesión de nuevo.', 'sesion');
        }
    }

    /** Recupera la sesión guardada en este navegador. */
    async function restaurarSesion() {
        try {
            sesion = JSON.parse(window.localStorage.getItem(CLAVE_SESION) || 'null');
        } catch (error) {
            sesion = null;
        }
        if (!sesion || !sesion.refresh_token) {
            sesion = null;
            return false;
        }
        try {
            await asegurarToken();
            return true;
        } catch (error) {
            return false;
        }
    }

    async function cerrarSesion() {
        if (sesion) {
            try {
                await window.fetch(base() + '/auth/v1/logout', { method: 'POST', headers: cabeceras() });
            } catch (error) { /* se cierra localmente de todos modos */ }
        }
        olvidarSesion();
    }

    /* ------------------------------ Datos ------------------------------ */
    /** Llama una función del servidor (cada una es una transacción). */
    async function rpc(nombre, parametros) {
        await asegurarToken();
        const respuesta = await pedir(`/rest/v1/rpc/${nombre}`, {
            method: 'POST',
            headers: cabeceras({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(parametros || {})
        });
        const texto = await respuesta.text();
        return texto ? JSON.parse(texto) : null;
    }

    /** Lee todas las filas visibles de una tabla, por páginas. */
    async function leerTabla(tabla, columnas) {
        const filas = [];
        for (let desde = 0; ; desde += TAMANO_PAGINA) {
            const respuesta = await pedir(
                `/rest/v1/${tabla}?select=${encodeURIComponent(columnas.join(','))}`,
                { headers: cabeceras({ 'Range-Unit': 'items', Range: `${desde}-${desde + TAMANO_PAGINA - 1}` }) }
            );
            const pagina = await respuesta.json();
            filas.push(...pagina);
            if (pagina.length < TAMANO_PAGINA) break;
        }
        return filas;
    }

    /** Descarga lo que la cuenta puede leer y actualiza la réplica SQLite. */
    async function sincronizar() {
        await asegurarToken();
        const tablas = Eco.DB.TABLAS_REPLICA;
        const resultados = await Promise.all(tablas.map((tabla) => leerTabla(tabla, Eco.DB.columnas(tabla))));
        const datos = {};
        tablas.forEach((tabla, i) => { datos[tabla] = resultados[i]; });
        Eco.DB.cargarReplica(datos);
        return Eco.DB.ultimaSincronizacion();
    }

    /** Sube una foto (data URL JPEG) y devuelve su URL pública. */
    async function subirFoto(dataUrl) {
        await asegurarToken();
        const blob = await (await window.fetch(dataUrl)).blob();
        const aleatorio = Math.random().toString(36).slice(2, 10);
        const ruta = `${sesion.user.id}/${Date.now()}-${aleatorio}.jpg`;
        await pedir(`/storage/v1/object/fotos/${ruta}`, {
            method: 'POST',
            headers: cabeceras({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }),
            body: blob
        });
        return `${base()}/storage/v1/object/public/fotos/${ruta}`;
    }

    Eco.Nube = {
        configurada,
        iniciarConGoogle,
        restaurarSesion,
        cerrarSesion,
        rpc,
        sincronizar,
        subirFoto,
        haySesion: () => Boolean(sesion)
    };
})();
