/* ============================================================
   EcoGestión · Réplica SQLite local (sql.js)
   La base central está en Supabase (PostgreSQL). Después de
   iniciar sesión, la aplicación descarga lo que tu cuenta puede
   leer y lo carga en esta réplica SQLite en memoria. Todas las
   consultas y reportes usan SQL sobre esta réplica.
   La réplica es de SOLO LECTURA: las escrituras se hacen con las
   funciones del servidor (Eco.Nube.rpc) y luego se vuelve a
   sincronizar.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};

    // Orden de carga (respeta las relaciones entre tablas)
    const TABLAS_REPLICA = [
        'roles', 'permisos', 'roles_permisos',
        'usuarios', 'perfiles',
        'materiales', 'recolecciones', 'movimientos',
        'empresas', 'necesidades_empresa',
        'publicaciones', 'fotos_publicacion', 'ofertas', 'transacciones'
    ];

    let bd = null;
    let SQL = null;
    let ultimaSincronizacion = null;

    /** Crea una réplica vacía con el mismo esquema relacional. */
    function crearReplicaVacia() {
        const nueva = new SQL.Database();
        nueva.run(Eco.SQL.ESQUEMA);
        nueva.run(Eco.SQL.ESQUEMA_MERCADO);
        // Las reglas (triggers) se aplican en el servidor; en la réplica
        // solo se copian datos ya validados.
        const triggers = nueva.exec("SELECT name FROM sqlite_master WHERE type = 'trigger'");
        if (triggers.length) {
            triggers[0].values.forEach(([nombre]) => nueva.run(`DROP TRIGGER IF EXISTS "${nombre}"`));
        }
        // El catálogo de roles y permisos llega desde el servidor.
        nueva.run('DELETE FROM roles_permisos; DELETE FROM permisos; DELETE FROM roles;');
        nueva.run('PRAGMA foreign_keys = OFF');
        return nueva;
    }

    async function iniciar() {
        if (bd) return;
        if (typeof window.initSqlJs !== 'function') {
            throw new Error('No se encontró la biblioteca sql.js. Verifica que exista js/lib/sql-asm.js.');
        }
        SQL = await window.initSqlJs();
        bd = crearReplicaVacia();
    }

    /** Columnas de una tabla de la réplica (se piden solo esas al servidor). */
    function columnasDe(instancia, tabla) {
        const sentencia = instancia.prepare(`PRAGMA table_info("${tabla}")`);
        const lista = [];
        try {
            while (sentencia.step()) lista.push(sentencia.getAsObject().name);
        } finally {
            sentencia.free();
        }
        return lista;
    }

    function columnas(tabla) {
        verificarConexion();
        return columnasDe(bd, tabla);
    }

    function valorSqlite(valor) {
        if (valor === undefined || valor === null) return null;
        if (typeof valor === 'boolean') return valor ? 1 : 0;
        if (typeof valor === 'object') return JSON.stringify(valor);
        return valor;
    }

    /**
     * Reemplaza la réplica con los datos descargados.
     * datos = { tabla: [filas] }. Se construye una base nueva y se cambia
     * al final, así una descarga incompleta no deja la réplica a medias.
     */
    function cargarReplica(datos) {
        const nueva = crearReplicaVacia();
        let omitidas = 0;
        nueva.run('BEGIN TRANSACTION');
        try {
            TABLAS_REPLICA.forEach((tabla) => {
                const filas = datos[tabla] || [];
                if (!filas.length) return;
                const cols = columnasDe(nueva, tabla).filter((c) => c in filas[0]);
                const sentencia = nueva.prepare(
                    `INSERT OR IGNORE INTO "${tabla}" (${cols.map((c) => `"${c}"`).join(', ')})
                     VALUES (${cols.map(() => '?').join(', ')})`
                );
                try {
                    filas.forEach((fila) => {
                        sentencia.run(cols.map((c) => valorSqlite(fila[c])));
                        if (nueva.getRowsModified() === 0) omitidas += 1;
                    });
                } finally {
                    sentencia.free();
                }
            });
            nueva.run('COMMIT');
        } catch (error) {
            try { nueva.run('ROLLBACK'); } catch (errorRollback) { /* sin acción */ }
            nueva.close();
            throw error;
        }
        if (omitidas) console.warn(`Réplica: ${omitidas} filas no cumplieron el esquema local y se omitieron.`);
        if (bd) bd.close();
        bd = nueva;
        ultimaSincronizacion = new Date();
    }

    function vaciar() {
        if (!SQL) return;
        if (bd) bd.close();
        bd = crearReplicaVacia();
        ultimaSincronizacion = null;
    }

    function verificarConexion() {
        if (!bd) throw new Error('La base de datos todavía no está inicializada.');
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
            while (sentencia.step()) filas.push(sentencia.getAsObject());
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

    function contar(sql, parametros) {
        return Number(escalar(sql, parametros) || 0);
    }

    /** Copia de la réplica como archivo .sqlite (respaldo / consulta externa). */
    function exportar() {
        verificarConexion();
        return bd.export();
    }

    Eco.DB = {
        TABLAS_REPLICA,
        iniciar,
        columnas,
        cargarReplica,
        vaciar,
        consultar,
        consultarUno,
        escalar,
        contar,
        exportar,
        ultimaSincronizacion: () => ultimaSincronizacion
    };
})();
