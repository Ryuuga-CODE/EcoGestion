/* ============================================================
   EcoGestión · Utilidades compartidas
   Formato, validaciones, CSV, descargas y avisos.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};

    const formatoNumero = new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });

    const formatoFecha = new Intl.DateTimeFormat('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    function escaparHtml(valor) {
        return String(valor === null || valor === undefined ? '' : valor)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatearNumero(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return '0';
        return formatoNumero.format(numero);
    }

    function formatearCantidad(valor, unidad) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return '0';
        const formateador = new Intl.NumberFormat('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: unidad === 'unidades' ? 0 : 2
        });
        return formateador.format(numero);
    }

    function formatearFecha(fecha) {
        if (!fecha) return '—';
        const partes = String(fecha).slice(0, 10).split('-').map(Number);
        if (partes.length !== 3 || partes.some(Number.isNaN)) return String(fecha);
        const fechaLocal = new Date(partes[0], partes[1] - 1, partes[2]);
        if (Number.isNaN(fechaLocal.getTime())) return String(fecha);
        return formatoFecha.format(fechaLocal).replace(/\./g, '');
    }

    function formatearFechaHora(fecha) {
        if (!fecha) return '—';
        const valor = String(fecha).includes('T') ? fecha : String(fecha).replace(' ', 'T');
        const fechaLocal = new Date(valor);
        if (Number.isNaN(fechaLocal.getTime())) return String(fecha);
        return new Intl.DateTimeFormat('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(fechaLocal).replace(/\./g, '');
    }

    function dosDigitos(numero) {
        return String(numero).padStart(2, '0');
    }

    function fechaHoyIso() {
        const hoy = new Date();
        return `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}`;
    }

    function sumarDias(fecha, dias) {
        const partes = String(fecha).slice(0, 10).split('-').map(Number);
        const fechaLocal = new Date(partes[0], partes[1] - 1, partes[2]);
        fechaLocal.setDate(fechaLocal.getDate() + Number(dias || 0));
        return `${fechaLocal.getFullYear()}-${dosDigitos(fechaLocal.getMonth() + 1)}-${dosDigitos(fechaLocal.getDate())}`;
    }

    function fechaHaceDias(dias) {
        return sumarDias(fechaHoyIso(), -Math.abs(Number(dias) || 0));
    }

    function validarFechaIso(fecha) {
        const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ''));
        if (!coincidencia) return false;
        const anio = Number(coincidencia[1]);
        const mes = Number(coincidencia[2]);
        const dia = Number(coincidencia[3]);
        const fechaLocal = new Date(anio, mes - 1, dia);
        return fechaLocal.getFullYear() === anio
            && fechaLocal.getMonth() === mes - 1
            && fechaLocal.getDate() === dia;
    }

    function normalizarCantidad(valor) {
        const texto = String(valor === null || valor === undefined ? '' : valor)
            .trim()
            .replace(',', '.');
        if (!/^\d+(\.\d+)?$/.test(texto)) return null;
        const numero = Number(texto);
        return Number.isFinite(numero) ? numero : null;
    }

    function redondear(numero, decimales) {
        const factor = Math.pow(10, decimales === undefined ? 2 : decimales);
        return Math.round((Number(numero) + Number.EPSILON) * factor) / factor;
    }

    function numeroCSV(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return '';
        return String(numero).replace('.', ',');
    }

    function generarCSV(encabezados, filas) {
        const escapar = (valor) => {
            const texto = valor === null || valor === undefined ? '' : String(valor);
            return `"${texto.replace(/"/g, '""')}"`;
        };
        const lineas = [encabezados.map(escapar).join(';')];
        filas.forEach((fila) => {
            lineas.push(fila.map(escapar).join(';'));
        });
        return '\uFEFF' + lineas.join('\r\n');
    }

    function descargarArchivo(nombre, contenido, tipoMime) {
        const tipo = tipoMime || 'text/csv;charset=utf-8';
        const blob = contenido instanceof Blob
            ? contenido
            : new Blob([contenido], { type: tipo });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    function descargarCSV(nombre, encabezados, filas) {
        descargarArchivo(nombre, generarCSV(encabezados, filas));
    }

    function debounce(funcion, espera) {
        let temporizador;
        return function () {
            const contexto = this;
            const argumentos = arguments;
            window.clearTimeout(temporizador);
            temporizador = window.setTimeout(() => {
                funcion.apply(contexto, argumentos);
            }, espera === undefined ? 220 : espera);
        };
    }

    function bytesABase64(bytes) {
        let binario = '';
        const tamano = 0x8000;
        for (let i = 0; i < bytes.length; i += tamano) {
            binario += String.fromCharCode.apply(null, bytes.subarray(i, i + tamano));
        }
        return window.btoa(binario);
    }

    function base64ABytes(base64) {
        const binario = window.atob(base64);
        const bytes = new Uint8Array(binario.length);
        for (let i = 0; i < binario.length; i += 1) {
            bytes[i] = binario.charCodeAt(i);
        }
        return bytes;
    }

    function mostrarErrorCampo(idCampo, mensaje) {
        const campo = document.getElementById(idCampo);
        const error = document.getElementById(`error-${idCampo}`);
        if (campo) {
            campo.classList.toggle('campo-invalido', Boolean(mensaje));
            campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
            if (mensaje && error) {
                campo.setAttribute('aria-describedby', error.id);
            }
        }
        if (error) error.textContent = mensaje || '';
    }

    function limpiarErrorCampo(idCampo) {
        mostrarErrorCampo(idCampo, '');
    }

    function limpiarErroresCampos(campos) {
        campos.forEach((idCampo) => limpiarErrorCampo(idCampo));
    }

    function mensajeError(error, mensajePredeterminado) {
        const texto = String(error && error.message ? error.message : error || '');
        if (/UNIQUE constraint failed: materiales\.nombre/i.test(texto)) {
            return 'Ya existe un material con ese nombre.';
        }
        if (/UNIQUE constraint failed: usuarios\.nombre/i.test(texto)) {
            return 'Ya existe un usuario con ese nombre.';
        }
        if (/Stock insuficiente/i.test(texto)) {
            return 'No hay existencias suficientes para registrar esa salida.';
        }
        if (/no coincide con la del material|unidad de medida no coincide/i.test(texto)) {
            return 'La unidad de medida no coincide con la del material.';
        }
        if (/no coincide con una recolección/i.test(texto)) {
            return 'El movimiento de entrada no coincide con la recolección registrada.';
        }
        // Reglas del mercado (triggers de esquema_mercado.sql): el mensaje ya es claro.
        const mensajesMercado = [
            'Solo una cuenta de vendedor activa puede publicar materiales.',
            'Solo compradores o empresas recicladoras activas pueden enviar ofertas.',
            'No puedes ofertar por tu propia publicación.',
            'La publicación no está disponible para recibir ofertas.',
            'La cantidad solicitada supera la cantidad disponible.',
            'Cambio de estado de la oferta no permitido.',
            'Solo se registran transacciones de ofertas aceptadas.',
            'El perfil empresarial requiere una cuenta de empresa recicladora.'
        ];
        const mensajeMercado = mensajesMercado.find((mensaje) => texto.includes(mensaje));
        if (mensajeMercado) return mensajeMercado;
        if (/ux_oferta_pendiente|ofertas\.id_publicacion, ofertas\.id_comprador/i.test(texto)) {
            return 'Ya tienes una oferta pendiente para esta publicación.';
        }
        if (/ux_usuarios_correo/i.test(texto)) {
            return 'Ese correo ya está asociado a otra cuenta.';
        }
        if (/UNIQUE constraint failed: empresas\.id_usuario/i.test(texto)) {
            return 'Esta cuenta ya tiene un perfil empresarial.';
        }
        if (/cantidad_disponible >= 0/i.test(texto)) {
            return 'La operación dejaría la publicación con cantidad negativa.';
        }
        if (/^El archivo /.test(texto)) {
            return texto.split('. ')[0] + '.';
        }
        if (/FOREIGN KEY constraint failed/i.test(texto)) {
            return 'La operación afecta registros relacionados y no se puede completar.';
        }
        if (/CHECK constraint failed/i.test(texto)) {
            return 'Los datos no cumplen una regla de validación de la base de datos.';
        }
        if (/NOT NULL constraint failed/i.test(texto)) {
            return 'Falta un dato obligatorio para completar la operación.';
        }
        return mensajePredeterminado || 'Ocurrió un error inesperado. Inténtalo de nuevo.';
    }

    function mostrarAviso(mensaje, tipo) {
        const contenedor = document.getElementById('toasts');
        if (!contenedor) return;
        const clase = tipo === 'error' ? 'error' : (tipo === 'info' ? 'info' : 'exito');
        const icono = tipo === 'error' ? 'i-alerta' : (tipo === 'info' ? 'i-info' : 'i-check');
        const aviso = document.createElement('div');
        aviso.className = `toast toast-${clase}`;
        aviso.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
        aviso.innerHTML = `
            <svg class="icono" aria-hidden="true"><use href="#${icono}"></use></svg>
            <span>${escaparHtml(mensaje)}</span>
        `;
        contenedor.appendChild(aviso);
        const duracion = tipo === 'error' ? 7000 : 4200;
        window.setTimeout(() => {
            aviso.classList.add('toast-saliendo');
            window.setTimeout(() => aviso.remove(), 240);
        }, duracion);
    }

    Eco.Util = {
        escaparHtml,
        formatearNumero,
        formatearCantidad,
        formatearFecha,
        formatearFechaHora,
        fechaHoyIso,
        sumarDias,
        fechaHaceDias,
        validarFechaIso,
        normalizarCantidad,
        redondear,
        numeroCSV,
        generarCSV,
        descargarArchivo,
        descargarCSV,
        debounce,
        bytesABase64,
        base64ABytes,
        mostrarErrorCampo,
        limpiarErrorCampo,
        limpiarErroresCampos,
        mensajeError,
        mostrarAviso
    };
})();
