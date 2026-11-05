/* ============================================================
   EcoGestión · Configuración del inicio de sesión
   Este es el único archivo que necesitas editar para activar
   Google Identity Services. Consulta README.md, sección 9.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};

    Eco.Config = Object.freeze({
        // ID de cliente OAuth 2.0 de tipo "Aplicación web" creado en
        // Google Cloud Console. Termina en .apps.googleusercontent.com
        // Mientras esté vacío, el botón de Google no se mostrará.
        GOOGLE_CLIENT_ID: '90051835805-o6b84c189c52t6pr3bqv6u7thtp1081t.apps.googleusercontent.com',

        // Correos de Google que entran como Administrador. Un usuario no
        // puede elegir el rol de administrador al registrarse.
        CORREOS_ADMINISTRADORES: Object.freeze([
            'imsebasff@gmail.com',
            'sebasrtw@gmail.com'
        ]),

        // Acceso de demostración: permite entrar con las cuentas de prueba
        // (las que NO están vinculadas a Google). NO es autenticación.
        // Ponlo en false cuando no lo necesites.
        PERMITIR_ACCESO_DEMO: true,

        // Horas que dura una sesión abierta en este navegador.
        DURACION_SESION_HORAS: 12
    });
})();
