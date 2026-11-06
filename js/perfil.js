/* ============================================================
   EcoGestión · Perfil del usuario
   Muestra la cuenta (foto, nombre y correo de Google) y permite
   editar los datos de contacto propios.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};
    const CAMPOS = ['perfil-telefono', 'perfil-direccion'];

    function render() {
        const usuario = Eco.Sesion.usuarioActual();
        if (!usuario) return;
        const esc = Eco.Util.escaparHtml;

        document.getElementById('perfil-avatar').innerHTML =
            Eco.Sesion.avatar(usuario.nombre, usuario.foto_url, 'avatar-grande');
        document.getElementById('perfil-nombre').textContent = usuario.nombre;
        document.getElementById('perfil-correo').textContent = usuario.correo || 'Sin correo registrado';
        document.getElementById('perfil-rol').textContent = usuario.rol_nombre;
        document.getElementById('perfil-metodo').textContent = 'Cuenta de Google';

        const formulario = document.getElementById('form-perfil');
        document.getElementById('perfil-municipio').value = Eco.Lugares.nombre(usuario.codigo_municipio);
        document.getElementById('perfil-direccion-opcional').hidden = Eco.Sesion.tiene('solicitudes.crear');
        document.getElementById('perfil-telefono-opcional').hidden = Eco.Sesion.tiene('recolecciones.realizar');
        if (!formulario.contains(document.activeElement)) {
            document.getElementById('perfil-telefono').value = usuario.telefono || '';
            document.getElementById('perfil-direccion').value = usuario.direccion || '';
        }

        const permisos = Eco.DB.consultar(
            `SELECT pe.descripcion FROM roles_permisos rp
             JOIN permisos pe ON pe.id_permiso = rp.id_permiso
             JOIN perfiles p ON p.id_rol = rp.id_rol
             WHERE p.id_usuario = ? ORDER BY pe.id_permiso`,
            [usuario.id_usuario]
        );
        document.getElementById('perfil-permisos').innerHTML = permisos
            .map((p) => `<li><svg class="icono" aria-hidden="true"><use href="#i-check"></use></svg>${esc(p.descripcion)}</li>`)
            .join('');
    }

    async function guardar(evento) {
        evento.preventDefault();
        let usuario;
        try {
            usuario = Eco.Sesion.exigir('perfil.editar');
        } catch (error) {
            Eco.Util.mostrarAviso(error.message, 'error');
            return;
        }
        Eco.Util.limpiarErroresCampos(CAMPOS);
        const telefono = document.getElementById('perfil-telefono').value.trim();
        const direccion = document.getElementById('perfil-direccion').value.replace(/\s+/g, ' ').trim();
        let valido = true;
        if (telefono && !/^[0-9+()\s-]{7,30}$/.test(telefono)) {
            Eco.Util.mostrarErrorCampo('perfil-telefono', 'Escribe un teléfono válido (solo números, espacios, +, - o paréntesis).');
            valido = false;
        } else if (!telefono && Eco.Sesion.tiene('recolecciones.realizar')) {
            Eco.Util.mostrarErrorCampo('perfil-telefono', 'Los repartidores deben tener un teléfono de contacto.');
            valido = false;
        }
        if (Eco.Sesion.tiene('solicitudes.crear') && direccion.length < 5) {
            Eco.Util.mostrarErrorCampo('perfil-direccion', 'Escribe tu dirección y barrio (mínimo 5 caracteres).');
            valido = false;
        } else if (direccion.length > 150) {
            Eco.Util.mostrarErrorCampo('perfil-direccion', 'La dirección no puede superar 150 caracteres.');
            valido = false;
        }
        if (!valido) return;

        try {
            await Eco.Nube.rpc('actualizar_perfil', { p_telefono: telefono || null, p_direccion: direccion || null });
            document.activeElement.blur();
            await Eco.App.despuesDeCambio('Perfil actualizado.');
        } catch (error) {
            Eco.Util.mostrarAviso(Eco.Util.mensajeError(error, 'No se pudo actualizar el perfil.'), 'error');
        }
    }

    function init() {
        document.getElementById('form-perfil').addEventListener('submit', guardar);
        document.getElementById('btn-perfil-cerrar-sesion').addEventListener('click', () => Eco.Sesion.cerrarSesion());
        CAMPOS.forEach((id) => {
            document.getElementById(id).addEventListener('input', () => Eco.Util.limpiarErrorCampo(id));
        });
    }

    Eco.Perfil = { init, render };
})();
