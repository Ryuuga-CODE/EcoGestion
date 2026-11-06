/* ============================================================
   EcoGestión · Utilidades de la gestión municipal
   Formatos de dinero y cantidades, insignias de estado y de
   tipo de residuo, validación de cantidades y precios, enlaces
   de contacto y los selectores Departamento → Municipio.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const esc = (valor) => Eco.Util.escaparHtml(valor);

    // Mismas categorías que materiales.categoria en la base de datos
    const CATEGORIAS = ['Plástico', 'Papel y cartón', 'Vidrio', 'Metal', 'Otros'];
    const PRECIO_MAXIMO = 100000000;
    const formatoDinero = new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2
    });

    const Comun = {
        CATEGORIAS,
        dinero(valor) {
            // Espacio no separable: el símbolo y el número nunca quedan en líneas distintas.
            return formatoDinero.format(Number(valor) || 0).replace(/\s/g, ' ');
        },
        precio(valor, unidad) {
            return `${Comun.dinero(valor)} / ${unidad === 'unidades' ? 'unidad' : unidad === 'litros' ? 'litro' : 'kg'}`;
        },
        cantidad(valor, unidad) {
            return `${Eco.Util.formatearCantidad(valor, unidad)} ${unidad}`;
        },
        insigniaTipo(tipo) {
            return `<span class="insignia insignia-tipo" data-tipo="${esc(tipo)}">${esc(tipo)}</span>`;
        },
        /** "Plástico, Vidrio" → insignias */
        insigniasTipos(lista) {
            return String(lista || '').split(',').map((t) => t.trim()).filter(Boolean)
                .map((t) => Comun.insigniaTipo(t)).join('');
        },
        estado(estado, texto) {
            const clase = String(estado || '').toLowerCase().normalize('NFD')
                .replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
            return `<span class="estado-chip estado-${clase}"><span class="punto"></span>${esc(texto || estado)}</span>`;
        },
        /** Valida una cantidad escrita por el usuario. Devuelve { valor } o { error }. */
        leerCantidad(texto, unidad, maximo) {
            const valor = Eco.Util.normalizarCantidad(texto);
            if (valor === null) return { error: 'Escribe una cantidad válida.' };
            if (valor <= 0) return { error: 'La cantidad debe ser mayor que cero.' };
            if (unidad === 'unidades' && !Number.isInteger(valor)) {
                return { error: 'Para unidades, la cantidad debe ser un número entero.' };
            }
            if (valor > 10000000) return { error: 'La cantidad es demasiado grande.' };
            if (maximo !== undefined && valor > maximo + 0.000001) {
                return { error: `No puede superar lo disponible (${Comun.cantidad(maximo, unidad)}).` };
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
        /** Enlaces de contacto (correo y teléfono). */
        contacto(nombre, correo, telefono) {
            const enlaces = [];
            if (telefono) {
                enlaces.push(`<a class="enlace-contacto" href="tel:${esc(String(telefono).replace(/[^0-9+]/g, ''))}">
                    <svg class="icono" aria-hidden="true"><use href="#i-telefono"></use></svg>${esc(telefono)}</a>`);
            }
            if (correo) {
                enlaces.push(`<a class="enlace-contacto" href="mailto:${esc(correo)}">
                    <svg class="icono" aria-hidden="true"><use href="#i-correo"></use></svg>${esc(correo)}</a>`);
            }
            return enlaces.length
                ? enlaces.join('')
                : `<span class="texto-tenue">${esc(nombre)} no tiene datos de contacto registrados.</span>`;
        },
        /** Fecha corta con el día de la semana: "sáb 14 nov" */
        fechaCorta(fecha) {
            if (!fecha) return '—';
            const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
            return new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })
                .format(new Date(a, m - 1, d)).replace(/\./g, '');
        },

        /**
         * Llena un par de selectores Departamento → Municipio con DIVIPOLA.
         * Al cambiar el departamento se cargan sus municipios.
         */
        prepararLugares(idDepartamento, idMunicipio) {
            const selDep = document.getElementById(idDepartamento);
            const selMun = document.getElementById(idMunicipio);
            selDep.innerHTML = '<option value="">Selecciona el departamento</option>' +
                Eco.Lugares.DEPARTAMENTOS.map((d) => `<option value="${d.c}">${esc(d.n)}</option>`).join('');
            const cargarMunicipios = () => {
                const lista = Eco.Lugares.municipiosDe(selDep.value);
                selMun.disabled = !lista.length;
                selMun.innerHTML = lista.length
                    ? '<option value="">Selecciona el municipio</option>' +
                      lista.map(([codigo, nombre]) => `<option value="${codigo}">${esc(nombre)}</option>`).join('')
                    : '<option value="">Primero elige el departamento</option>';
                // Bogotá, D.C. y San Andrés tienen pocos municipios: si hay uno solo, se elige.
                if (lista.length === 1) selMun.value = lista[0][0];
            };
            selDep.addEventListener('change', cargarMunicipios);
            return {
                reiniciar() { selDep.value = ''; cargarMunicipios(); },
                valor: () => selMun.value
            };
        }
    };

    Eco.Comun = Comun;
})();
