/* ============================================================
   EcoGestión · Configuración
   Datos públicos de conexión. NO pongas aquí claves secretas:
   el "client secret" de Google y la "service_role key" de
   Supabase nunca van en el navegador.
   Consulta README.md, sección 11.
   ============================================================ */
(function () {
    'use strict';

    const Eco = window.Eco = window.Eco || {};

    Eco.Config = Object.freeze({
        // ID de cliente OAuth 2.0 (tipo "Aplicación web") de Google Cloud.
        GOOGLE_CLIENT_ID: '90051835805-o6b84c189c52t6pr3bqv6u7thtp1081t.apps.googleusercontent.com',

        // Supabase → Project Settings → API (o "Connect"):
        // URL del proyecto, por ejemplo https://abcdefghijkl.supabase.co
        SUPABASE_URL: 'https://oyhewgnhjrkppvmbfxpo.supabase.co',

        // Clave pública: "anon public" o "publishable key".
        // Es segura en el navegador porque las tablas están protegidas con RLS.
        SUPABASE_ANON_KEY: 'sb_publishable_gitY4gp3uQHV40fkSItJOQ_HgWVAtma'

        // Los correos administradores ya no se configuran aquí: están en la
        // tabla correos_administradores de Supabase (supabase/esquema_supabase.sql).
    });
})();
