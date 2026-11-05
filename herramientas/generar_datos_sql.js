// Regenera js/datos_sql.js a partir de database/esquema.sql y database/esquema_mercado.sql.
// Uso (desde la carpeta del proyecto):  node herramientas/generar_datos_sql.js
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8');
const esquema = leer('database/esquema.sql');
const mercado = leer('database/esquema_mercado.sql');

if (/`|\$\{/.test(esquema + mercado)) {
    console.error('Los archivos .sql no pueden contener comillas invertidas (`) ni ${ porque se embeben en un template string.');
    process.exit(1);
}

const salida = `/* ============================================================
   EcoGestión · Esquema de la réplica SQLite (copia embebida)
   Copia de database/esquema.sql y database/esquema_mercado.sql.
   Se usa para crear la réplica local (sql.js) donde se cargan
   los datos que vienen de Supabase. Está embebida porque el
   navegador no deja leer archivos .sql con fetch() desde file://.
   NO lo edites a mano: ejecuta node herramientas/generar_datos_sql.js
   ============================================================ */
(function () {
    'use strict';
    const Eco = window.Eco = window.Eco || {};
    Eco.SQL = {
        ESQUEMA: \`${esquema}\`,

        ESQUEMA_MERCADO: \`${mercado}\`
    };
})();
`;
fs.writeFileSync(path.join(raiz, 'js/datos_sql.js'), salida);
console.log('js/datos_sql.js actualizado.');
