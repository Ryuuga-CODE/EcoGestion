/* ============================================================
   EcoGestión · Panel principal
   Indicadores, actividad reciente y estadísticas generales.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const UNIDADES = ['kg', 'unidades', 'litros'];

    function htmlUnidades(mapa) {
        const conDatos = UNIDADES.filter((unidad) => Number(mapa[unidad] || 0) > 0);
        const visibles = conDatos.length ? conDatos : ['kg'];
        return visibles.map((unidad) => `
            <span class="unidad-chip">
                <strong>${Eco.Util.formatearCantidad(mapa[unidad] || 0, unidad)}</strong>
                <small>${unidad}</small>
            </span>
        `).join('');
    }

    /** Tareas pendientes del municipio: lo que el administrador debe atender hoy. */
    function renderMunicipio() {
        const usuario = Eco.Sesion.usuarioActual();
        const esc = Eco.Util.escaparHtml;
        const sinAsignar = Eco.DB.contar("SELECT COUNT(*) FROM solicitudes_recoleccion WHERE estado = 'Pendiente'");
        const porAprobar = Eco.DB.contar('SELECT COUNT(*) FROM perfiles WHERE pendiente = 1');
        const pedidos = Eco.DB.contar("SELECT COUNT(*) FROM pedidos_empresa WHERE estado IN ('Pendiente', 'Aprobado')");
        const tarjeta = (valor, titulo, detalle, vista, icono) => `
            <button type="button" class="pendiente-municipio${valor ? ' con-pendientes' : ''}" data-ir="${vista}">
                <span class="kpi-icono"><svg class="icono" aria-hidden="true"><use href="#${icono}"></use></svg></span>
                <span><strong>${Eco.Util.formatearNumero(valor)}</strong> ${esc(titulo)}<small>${esc(detalle)}</small></span>
            </button>`;
        document.getElementById('panel-municipio').innerHTML =
            tarjeta(sinAsignar, sinAsignar === 1 ? 'solicitud sin asignar' : 'solicitudes sin asignar', 'Asígnalas a un repartidor', 'solicitudes', 'i-camion') +
            tarjeta(porAprobar, porAprobar === 1 ? 'repartidor por aprobar' : 'repartidores por aprobar', 'Revisa las cuentas nuevas', 'administracion', 'i-usuarios') +
            tarjeta(pedidos, pedidos === 1 ? 'pedido de empresa abierto' : 'pedidos de empresas abiertos', 'Responde o registra la entrega', 'pedidos', 'i-empresa');
        if (usuario) {
            document.getElementById('bienvenida-titulo').textContent = `Centro de acopio de ${Eco.Lugares.nombre(usuario.codigo_municipio)}`;
        }
    }

    function render() {
        renderMunicipio();
        const totalMateriales = Eco.DB.contar('SELECT COUNT(*) AS total FROM materiales');
        const totalRecolecciones = Eco.DB.contar('SELECT COUNT(*) AS total FROM recolecciones');
        const ultimaRecoleccion = Eco.DB.escalar('SELECT MAX(fecha) AS ultima FROM recolecciones');

        const recolectado = { kg: 0, unidades: 0, litros: 0 };
        Eco.DB.consultar(
            `SELECT unidad_medida, ROUND(SUM(cantidad), 2) AS total
             FROM recolecciones
             GROUP BY unidad_medida`
        ).forEach((fila) => {
            recolectado[fila.unidad_medida] = Number(fila.total) || 0;
        });

        const existencias = { kg: 0, unidades: 0, litros: 0 };
        Eco.DB.consultar(
            `SELECT unidad_medida, ROUND(SUM(existencia), 2) AS total
             FROM vista_existencias
             GROUP BY unidad_medida`
        ).forEach((fila) => {
            existencias[fila.unidad_medida] = Number(fila.total) || 0;
        });

        document.getElementById('kpi-materiales').textContent = Eco.Util.formatearNumero(totalMateriales);
        document.getElementById('kpi-recolecciones').textContent = Eco.Util.formatearNumero(totalRecolecciones);
        document.getElementById('kpi-recolecciones-pie').textContent = ultimaRecoleccion
            ? `Última: ${Eco.Util.formatearFecha(ultimaRecoleccion)}`
            : 'Aún no hay registros';
        document.getElementById('kpi-recolectado').innerHTML = htmlUnidades(recolectado);
        document.getElementById('kpi-existencias').innerHTML = htmlUnidades(existencias);

        document.getElementById('bienvenida-detalle').textContent =
            `Hay ${Eco.Util.formatearNumero(totalMateriales)} materiales y ` +
            `${Eco.Util.formatearNumero(totalRecolecciones)} recolecciones registradas. ` +
            'El inventario se calcula automáticamente a partir de los movimientos.';

        const actividad = Eco.DB.consultar(
            `SELECT mv.fecha, mv.tipo, mv.cantidad, mv.unidad_medida,
                    m.nombre AS material, u.nombre AS responsable
             FROM movimientos mv
             INNER JOIN materiales m ON m.id_material = mv.id_material
             INNER JOIN usuarios u ON u.id_usuario = mv.id_usuario
             ORDER BY mv.fecha DESC, mv.id_movimiento DESC
             LIMIT 6`
        );
        const cuerpoActividad = document.getElementById('panel-actividad-body');
        const vacioActividad = document.getElementById('panel-actividad-vacio');
        const contenedorActividad = cuerpoActividad.closest('.tabla-contenedor');

        cuerpoActividad.innerHTML = actividad.map((fila) => {
            const tipoClase = fila.tipo === 'Entrada' ? 'entrada' : 'salida';
            const icono = fila.tipo === 'Entrada' ? 'i-flecha-abajo' : 'i-flecha-arriba';
            return `
                <tr>
                    <td>
                        <span class="insignia-movimiento ${tipoClase}">
                            <svg class="icono" aria-hidden="true"><use href="#${icono}"></use></svg>
                            ${Eco.Util.escaparHtml(fila.tipo)}
                        </span>
                    </td>
                    <td><strong>${Eco.Util.escaparHtml(fila.material)}</strong></td>
                    <td class="texto-derecha">
                        <strong class="cantidad-tabla">${Eco.Util.formatearCantidad(fila.cantidad, fila.unidad_medida)}</strong>
                        <span class="unidad-sufijo">${Eco.Util.escaparHtml(fila.unidad_medida)}</span>
                    </td>
                    <td>${Eco.Util.escaparHtml(fila.responsable)}</td>
                    <td class="texto-derecha"><span class="fecha-tabla">${Eco.Util.escaparHtml(String(fila.fecha).split('-').reverse().join('/'))}</span></td>
                </tr>
            `;
        }).join('');

        contenedorActividad.hidden = actividad.length === 0;
        vacioActividad.hidden = actividad.length > 0;

        const categorias = Eco.DB.consultar(
            `SELECT m.categoria, COUNT(r.id_recoleccion) AS total
             FROM materiales m
             LEFT JOIN recolecciones r ON r.id_material = m.id_material
             GROUP BY m.categoria
             ORDER BY total DESC, m.categoria COLLATE NOCASE`
        );
        const maximo = categorias.reduce((max, fila) => Math.max(max, Number(fila.total)), 0);
        const contenedorCategorias = document.getElementById('panel-categorias');
        contenedorCategorias.innerHTML = categorias.length
            ? categorias.map((fila) => {
                const porcentaje = maximo > 0 ? (Number(fila.total) / maximo) * 100 : 0;
                return `
                    <div class="barra-categoria">
                        <div class="barra-categoria-cabecera">
                            <span>${Eco.Util.escaparHtml(fila.categoria)}</span>
                            <strong>${Eco.Util.formatearNumero(fila.total)}</strong>
                        </div>
                        <div class="barra-pista">
                            <span class="barra-relleno" style="width: ${porcentaje}%"></span>
                        </div>
                    </div>
                `;
            }).join('')
            : '<p class="texto-tenue">Sin categorías registradas.</p>';

        const materialTop = Eco.DB.consultarUno(
            `SELECT m.nombre, COUNT(*) AS total
             FROM recolecciones r
             INNER JOIN materiales m ON m.id_material = r.id_material
             GROUP BY m.id_material
             ORDER BY total DESC, m.nombre COLLATE NOCASE
             LIMIT 1`
        );
        const responsableTop = Eco.DB.consultarUno(
            `SELECT u.nombre, COUNT(*) AS total
             FROM recolecciones r
             INNER JOIN usuarios u ON u.id_usuario = r.id_usuario
             GROUP BY u.id_usuario
             ORDER BY total DESC, u.nombre COLLATE NOCASE
             LIMIT 1`
        );

        document.getElementById('panel-resumen').innerHTML = `
            <div class="mini-resumen-fila">
                <span>Material con más recolecciones</span>
                <strong>${materialTop ? Eco.Util.escaparHtml(materialTop.nombre) : '—'}</strong>
            </div>
            <div class="mini-resumen-fila">
                <span>Responsable con más registros</span>
                <strong>${responsableTop ? Eco.Util.escaparHtml(responsableTop.nombre) : '—'}</strong>
            </div>
            <div class="mini-resumen-fila">
                <span>Categorías con materiales</span>
                <strong>${Eco.Util.formatearNumero(categorias.length)}</strong>
            </div>
        `;
    }

    function init() {
        document.getElementById('panel-municipio').addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-ir]');
            if (boton) Eco.App.irA(boton.dataset.ir);
        });
        document.getElementById('btn-ver-historial').addEventListener('click', () => {
            Eco.App.irA('historial');
        });
    }

    Eco.Panel = {
        init,
        render
    };
})();
