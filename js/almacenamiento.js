/* ============================================================
   EcoGestión · Persistencia local
   Guarda el archivo SQLite completo en IndexedDB y utiliza
   localStorage como respaldo si IndexedDB no está disponible.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const NOMBRE_BD = 'ecogestion_local';
    const VERSION_BD = 1;
    const ALMACEN = 'estado';
    const CLAVE = 'base_datos_actual';
    const CLAVE_LOCAL_BD = 'ecogestion_sqlite_base64';
    const CLAVE_LOCAL_FECHA = 'ecogestion_sqlite_fecha';

    let promesaApertura = null;
    let ultimoOrigen = 'indexedDB';

    function abrirIndexedDB() {
        if (promesaApertura) return promesaApertura;
        promesaApertura = new Promise((resolver, rechazar) => {
            if (!('indexedDB' in window) || !window.indexedDB) {
                rechazar(new Error('IndexedDB no está disponible en este navegador.'));
                return;
            }
            let solicitud;
            try {
                solicitud = window.indexedDB.open(NOMBRE_BD, VERSION_BD);
            } catch (error) {
                rechazar(error);
                return;
            }
            solicitud.onupgradeneeded = () => {
                const bd = solicitud.result;
                if (!bd.objectStoreNames.contains(ALMACEN)) {
                    bd.createObjectStore(ALMACEN);
                }
            };
            solicitud.onsuccess = () => {
                const bd = solicitud.result;
                bd.onversionchange = () => bd.close();
                resolver(bd);
            };
            solicitud.onerror = () => {
                rechazar(solicitud.error || new Error('No se pudo abrir IndexedDB.'));
            };
            solicitud.onblocked = () => {
                rechazar(new Error('IndexedDB está bloqueada por otra pestaña de la aplicación.'));
            };
        });
        return promesaApertura;
    }

    function normalizarBytes(valor) {
        if (valor instanceof Uint8Array) return valor;
        if (valor instanceof ArrayBuffer) return new Uint8Array(valor);
        if (ArrayBuffer.isView(valor)) {
            return new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength);
        }
        return null;
    }

    function leerIndexedDB() {
        return abrirIndexedDB().then((bd) => new Promise((resolver, rechazar) => {
            let transaccion;
            try {
                transaccion = bd.transaction(ALMACEN, 'readonly');
            } catch (error) {
                rechazar(error);
                return;
            }
            const solicitud = transaccion.objectStore(ALMACEN).get(CLAVE);
            solicitud.onsuccess = () => resolver(solicitud.result || null);
            solicitud.onerror = () => rechazar(solicitud.error || new Error('No se pudo leer la base guardada.'));
        }));
    }

    function guardarEnIndexedDB(bytes) {
        return abrirIndexedDB().then((bd) => new Promise((resolver, rechazar) => {
            let transaccion;
            try {
                transaccion = bd.transaction(ALMACEN, 'readwrite');
            } catch (error) {
                rechazar(error);
                return;
            }
            const registro = {
                bytes,
                actualizado: new Date().toISOString()
            };
            transaccion.objectStore(ALMACEN).put(registro, CLAVE);
            transaccion.oncomplete = () => resolver(registro);
            transaccion.onerror = () => rechazar(transaccion.error || new Error('No se pudo guardar en IndexedDB.'));
            transaccion.onabort = () => rechazar(transaccion.error || new Error('Guardado cancelado.'));
        }));
    }

    function guardarEnLocalStorage(bytes) {
        const base64 = Eco.Util.bytesABase64(bytes);
        const fecha = new Date().toISOString();
        window.localStorage.setItem(CLAVE_LOCAL_BD, base64);
        window.localStorage.setItem(CLAVE_LOCAL_FECHA, fecha);
        return { actualizado: fecha };
    }

    function leerLocalStorage() {
        let base64 = null;
        try {
            base64 = window.localStorage.getItem(CLAVE_LOCAL_BD);
        } catch (error) {
            return null;
        }
        if (!base64) return null;
        try {
            return {
                bytes: Eco.Util.base64ABytes(base64),
                actualizado: window.localStorage.getItem(CLAVE_LOCAL_FECHA) || null
            };
        } catch (error) {
            return null;
        }
    }

    async function guardar(bytes) {
        if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
            throw new Error('No hay datos de base de datos para guardar.');
        }
        try {
            const registro = await guardarEnIndexedDB(bytes);
            ultimoOrigen = 'indexedDB';
            return { backend: 'indexedDB', actualizado: registro.actualizado };
        } catch (error) {
            try {
                const registro = guardarEnLocalStorage(bytes);
                ultimoOrigen = 'localStorage';
                return { backend: 'localStorage', actualizado: registro.actualizado };
            } catch (errorLocal) {
                throw new Error('No se pudo guardar la base de datos en este navegador.');
            }
        }
    }

    async function leer() {
        try {
            const registro = await leerIndexedDB();
            const bytes = registro ? normalizarBytes(registro.bytes) : null;
            if (bytes && bytes.length > 0) {
                ultimoOrigen = 'indexedDB';
                return {
                    bytes,
                    actualizado: registro.actualizado || null,
                    backend: 'indexedDB'
                };
            }
        } catch (error) {
            // Se intenta el respaldo en localStorage.
        }

        const registroLocal = leerLocalStorage();
        if (registroLocal) {
            ultimoOrigen = 'localStorage';
            return {
                bytes: registroLocal.bytes,
                actualizado: registroLocal.actualizado,
                backend: 'localStorage'
            };
        }
        return null;
    }

    async function eliminar() {
        try {
            const bd = await abrirIndexedDB();
            await new Promise((resolver, rechazar) => {
                const transaccion = bd.transaction(ALMACEN, 'readwrite');
                transaccion.objectStore(ALMACEN).delete(CLAVE);
                transaccion.oncomplete = resolver;
                transaccion.onerror = () => rechazar(transaccion.error);
            });
        } catch (error) {
            // Si IndexedDB falla, igual se limpia el respaldo local.
        }
        try {
            window.localStorage.removeItem(CLAVE_LOCAL_BD);
            window.localStorage.removeItem(CLAVE_LOCAL_FECHA);
        } catch (error) {
            // Sin acceso a localStorage: no hay nada más que limpiar.
        }
    }

    Eco.Almacenamiento = {
        guardar,
        leer,
        eliminar,
        obtenerOrigen: () => ultimoOrigen
    };
})();
