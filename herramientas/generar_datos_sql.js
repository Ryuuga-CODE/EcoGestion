// Regenera los archivos derivados (no se editan a mano):
//   * js/datos_sql.js       ← database/esquema.sql + database/esquema_municipal.sql
//   * js/lugares.js         ← datos/divipola.csv (departamentos y municipios)
//   * supabase/esquema_supabase.sql, bloque DIVIPOLA ← datos/divipola.csv
// Uso (desde la carpeta del proyecto):  node herramientas/generar_datos_sql.js
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta), 'utf8');
const escribir = (ruta, texto) => fs.writeFileSync(path.join(raiz, ruta), texto);

/* ------------------------- Réplica SQLite embebida ------------------------- */
const esquema = leer('database/esquema.sql');
const municipal = leer('database/esquema_municipal.sql');
if (/`|\$\{/.test(esquema + municipal)) {
    console.error('Los archivos .sql no pueden contener comillas invertidas (`) ni ${ porque se embeben en un template string.');
    process.exit(1);
}
escribir('js/datos_sql.js', `/* ============================================================
   EcoGestión · Esquema de la réplica SQLite (copia embebida)
   Copia de database/esquema.sql y database/esquema_municipal.sql.
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

        ESQUEMA_MUNICIPAL: \`${municipal}\`
    };
})();
`);
console.log('js/datos_sql.js actualizado.');

/* ------------------------------ DIVIPOLA ------------------------------ */
function leerCsv(texto) {
    const filas = [];
    texto.split(/\r?\n/).filter(Boolean).forEach((linea) => {
        const celdas = [];
        let actual = '';
        let comillas = false;
        for (let i = 0; i < linea.length; i += 1) {
            const c = linea[i];
            if (c === '"') {
                if (comillas && linea[i + 1] === '"') { actual += '"'; i += 1; } else comillas = !comillas;
            } else if (c === ',' && !comillas) {
                celdas.push(actual); actual = '';
            } else actual += c;
        }
        celdas.push(actual);
        filas.push(celdas);
    });
    return filas;
}

const filas = leerCsv(leer('datos/divipola.csv')).slice(1);
const departamentos = new Map();
filas.forEach(([codDep, nomDep, codMun, nomMun]) => {
    if (!/^\d{2}$/.test(codDep) || !/^\d{5}$/.test(codMun) || codMun.slice(0, 2) !== codDep) {
        throw new Error(`Fila DIVIPOLA inválida: ${codDep},${codMun}`);
    }
    if (!departamentos.has(codDep)) departamentos.set(codDep, { c: codDep, n: nomDep, m: [] });
    departamentos.get(codDep).m.push([codMun, nomMun]);
});
const lista = [...departamentos.values()].sort((a, b) => a.n.localeCompare(b.n, 'es'));
lista.forEach((d) => d.m.sort((a, b) => a[1].localeCompare(b[1], 'es')));

escribir('js/lugares.js', `/* ============================================================
   EcoGestión · Departamentos y municipios de Colombia
   Fuente: DIVIPOLA del DANE (datos/divipola.csv).
   ${lista.length} departamentos (incluye Bogotá, D.C.) y ${filas.length} municipios
   y áreas no municipalizadas.
   NO lo edites a mano: ejecuta node herramientas/generar_datos_sql.js
   ============================================================ */
(function () {
    'use strict';
    const Eco = window.Eco = window.Eco || {};
    // [{ c: código del departamento, n: nombre, m: [[código DANE del municipio, nombre], ...] }]
    const DEPARTAMENTOS = ${JSON.stringify(lista)};

    const municipios = new Map();
    DEPARTAMENTOS.forEach((d) => d.m.forEach(([codigo, nombre]) => municipios.set(codigo, { codigo, nombre, departamento: d.n })));

    Eco.Lugares = {
        DEPARTAMENTOS,
        /** Municipios de un departamento: [[código, nombre], ...] */
        municipiosDe: (codigoDepartamento) => {
            const d = DEPARTAMENTOS.find((x) => x.c === codigoDepartamento);
            return d ? d.m : [];
        },
        municipio: (codigo) => municipios.get(String(codigo || '')) || null,
        /** "Soacha, Cundinamarca" */
        nombre: (codigo) => {
            const m = municipios.get(String(codigo || ''));
            if (!m) return 'Municipio sin definir';
            return m.nombre === m.departamento ? m.nombre : \`\${m.nombre}, \${m.departamento}\`;
        }
    };
})();
`);
console.log(`js/lugares.js actualizado (${lista.length} departamentos, ${filas.length} municipios).`);

const sqlTexto = (t) => `'${t.replace(/'/g, "''")}'`;
const bloque = [
    '-- DIVIPOLA:INICIO',
    'insert into public.departamentos (codigo, nombre) values',
    lista.map((d) => `    (${sqlTexto(d.c)}, ${sqlTexto(d.n)})`).join(',\n') + ';',
    'insert into public.municipios (codigo, codigo_departamento, nombre) values',
    filas.map(([codDep, , codMun, nomMun]) => `    (${sqlTexto(codMun)}, ${sqlTexto(codDep)}, ${sqlTexto(nomMun)})`).join(',\n') + ';',
    '-- DIVIPOLA:FIN'
].join('\n');
const supa = leer('supabase/esquema_supabase.sql');
const nuevo = supa.replace(/-- DIVIPOLA:INICIO[\s\S]*-- DIVIPOLA:FIN/, bloque);
if (nuevo === supa && !supa.includes(bloque)) throw new Error('No se encontró el bloque DIVIPOLA en supabase/esquema_supabase.sql');
escribir('supabase/esquema_supabase.sql', nuevo);
console.log('supabase/esquema_supabase.sql: bloque DIVIPOLA actualizado.');
