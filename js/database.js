/* ============================================================
   EcoGestión · Capa de acceso a SQLite (sql.js)
   Centraliza la conexión, las consultas parametrizadas, las
   transacciones y la persistencia del archivo .sqlite.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const TABLAS_REQUERIDAS = ['materiales', 'usuarios', 'recolecciones', 'movimientos'];

    let bd = null;
    let SQL = null;
    let iniciada = false;

    function validarInstancia(instancia) {
        const resultado = instancia.exec("SELECT name FROM sqlite_master WHERE type = 'table'");
        const nombres = new Set(
            resultado.length ? resultado[0].values.map((fila) => fila[0]) : []
        );
        const faltantes = TABLAS_REQUERIDAS.filter((tabla) => !nombres.has(tabla));
        if (faltantes.length > 0) {
            throw new Error('El archivo no contiene las tablas requeridas: ' + faltantes.join(', ') + '.');
        }
        const integridad = instancia.exec('PRAGMA integrity_check');
        if (!integridad.length || integridad[0].values[0][0] !== 'ok') {
            throw new Error('La verificación de integridad de SQLite no fue satisfactoria.');
        }
    }

    /* sql.js reabre la base internamente al exportar y SQLite
       desactiva las claves foráneas en cada conexión nueva, por eso
       se vuelven a activar después de cada export(). */
    function activarClavesForaneas(instancia) {
        instancia.run('PRAGMA foreign_keys = ON');
    }

    function exportarBytes() {
        const bytes = bd.export();
        activarClavesForaneas(bd);
        return bytes;
    }

    function versionEsquema(instancia) {
        const version = instancia.exec('PRAGMA user_version');
        return version.length ? Number(version[0].values[0][0]) : 0;
    }

    /* Actualiza bases creadas con versiones anteriores del esquema.
       Versión 2: el trigger de stock tolera diferencias de redondeo
       (por ejemplo 0,7 + 0,1 = 0,7999999...).
       Versión 3: cuentas, roles, permisos y mercado de residuos
       (solo agrega tablas; las existentes no se modifican). */
    function actualizarEsquema(instancia) {
        if (versionEsquema(instancia) < 2) {
            instancia.run('DROP TRIGGER IF EXISTS trg_movimiento_stock');
            instancia.run(Eco.SQL.TRIGGER_STOCK);
            instancia.run('PRAGMA user_version = 2');
        }
        if (versionEsquema(instancia) < 3) {
            instancia.run('BEGIN TRANSACTION');
            try {
                instancia.run(Eco.SQL.ESQUEMA_MERCADO);
                // Los datos de ejemplo del mercado solo se agregan si aún no hay publicaciones.
                const publicaciones = instancia.exec('SELECT COUNT(*) FROM publicaciones');
                if (!Number(publicaciones[0].values[0][0])) {
                    instancia.run(Eco.SQL.DATOS_MERCADO);
                }
                instancia.run('COMMIT');
            } catch (error) {
                try { instancia.run('ROLLBACK'); } catch (errorRollback) { /* sin acción */ }
                throw error;
            }
        }
    }

    function crearBaseDemo() {
        const nueva = new SQL.Database();
        nueva.run('PRAGMA foreign_keys = ON');
        nueva.run(Eco.SQL.ESQUEMA);
        nueva.run(Eco.SQL.DATOS_INICIALES);
        nueva.run(Eco.SQL.ESQUEMA_MERCADO);
        nueva.run(Eco.SQL.DATOS_MERCADO);
        return nueva;
    }

    async function iniciar() {
        if (iniciada) return { origen: 'memoria', advertencia: null };

        if (typeof window.initSqlJs !== 'function') {
            throw new Error('No se encontró la biblioteca sql.js. Verifica que exista js/lib/sql-asm.js.');
        }

        SQL = await window.initSqlJs();
        const guardada = await Eco.Almacenamiento.leer();

        if (guardada && guardada.bytes && guardada.bytes.length > 0) {
            let restaurada = null;
            try {
                restaurada = new SQL.Database(guardada.bytes);
                restaurada.run('PRAGMA foreign_keys = ON');
                validarInstancia(restaurada);
                actualizarEsquema(restaurada);
                bd = restaurada;
                iniciada = true;
                return {
                    origen: 'guardada',
                    backend: guardada.backend,
                    actualizado: guardada.actualizado,
                    advertencia: null
                };
            } catch (error) {
                if (restaurada) {
                    try { restaurada.close(); } catch (errorCierre) { /* sin acción */ }
                }
                throw new Error(
                    'La base guardada en el navegador no se pudo abrir. ' +
                    'Puedes reintentar o restaurar la base de demostración desde la pantalla de error. Detalle: ' +
                    error.message
                );
            }
        }

        let advertencia = null;
        bd = crearBaseDemo();
        iniciada = true;

        try {
            await persistir();
        } catch (error) {
            advertencia = 'La base funciona en memoria, pero no se pudo guardar automáticamente. ' +
                'Descarga el archivo .sqlite para no perder los cambios.';
        }

        return { origen: 'nueva', backend: Eco.Almacenamiento.obtenerOrigen(), advertencia };
    }

    function verificarConexion() {
        if (!bd) {
            throw new Error('La base de datos todavía no está inicializada.');
        }
    }

    function normalizarParametros(parametros) {
        return (parametros || []).map((valor) => (valor === undefined ? null : valor));
    }

    function consultar(sql, parametros) {
        verificarConexion();
        const sentencia = bd.prepare(sql);
        const filas = [];
        try {
            sentencia.bind(normalizarParametros(parametros));
            while (sentencia.step()) {
                filas.push(sentencia.getAsObject());
            }
        } finally {
            sentencia.free();
        }
        return filas;
    }

    function consultarUno(sql, parametros) {
        const filas = consultar(sql, parametros);
        return filas.length ? filas[0] : null;
    }

    function escalar(sql, parametros) {
        const fila = consultarUno(sql, parametros);
        if (!fila) return null;
        const claves = Object.keys(fila);
        return claves.length ? fila[claves[0]] : null;
    }

    function ejecutar(sql, parametros) {
        verificarConexion();
        bd.run(sql, normalizarParametros(parametros));
    }

    function ultimoId() {
        return Number(escalar('SELECT last_insert_rowid() AS id'));
    }

    function contar(sql, parametros) {
        return Number(escalar(sql, parametros) || 0);
    }

    function transaccion(operacion) {
        verificarConexion();
        ejecutar('BEGIN IMMEDIATE TRANSACTION');
        try {
            const resultado = operacion();
            ejecutar('COMMIT');
            return resultado;
        } catch (error) {
            try {
                ejecutar('ROLLBACK');
            } catch (errorRollback) {
                // Si el rollback falla, se informa el error original.
            }
            throw error;
        }
    }

    function exportar() {
        verificarConexion();
        return exportarBytes();
    }

    async function persistir() {
        verificarConexion();
        const bytes = exportarBytes();
        return Eco.Almacenamiento.guardar(bytes);
    }

    function reemplazarCon(bytes) {
        if (!SQL) {
            throw new Error('El motor SQLite no está inicializado.');
        }
        if (!bytes || bytes.length === 0) {
            throw new Error('El archivo seleccionado está vacío.');
        }
        let nueva;
        try {
            nueva = new SQL.Database(bytes);
            nueva.run('PRAGMA foreign_keys = ON');
            validarInstancia(nueva);
            actualizarEsquema(nueva);
        } catch (error) {
            if (nueva) {
                try { nueva.close(); } catch (errorCierre) { /* sin acción */ }
            }
            throw new Error('El archivo no es una base de datos SQLite válida de EcoGestión. ' + error.message);
        }
        if (bd) {
            try { bd.close(); } catch (errorCierre) { /* sin acción */ }
        }
        bd = nueva;
        iniciada = true;
    }

    function restaurarDemo() {
        if (!SQL) {
            throw new Error('El motor SQLite no está inicializado.');
        }
        if (bd) {
            try { bd.close(); } catch (errorCierre) { /* sin acción */ }
        }
        bd = crearBaseDemo();
        iniciada = true;
    }

    function cerrar() {
        if (bd) {
            bd.close();
            bd = null;
        }
        iniciada = false;
    }

    Eco.DB = {
        iniciar,
        consultar,
        consultarUno,
        escalar,
        ejecutar,
        ultimoId,
        contar,
        transaccion,
        exportar,
        persistir,
        reemplazarCon,
        restaurarDemo,
        cerrar
    };
})();
