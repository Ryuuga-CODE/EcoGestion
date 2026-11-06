# Pruebas de EcoGestión

Estas pruebas reproducen Supabase en tu computador: el mismo PostgreSQL, la misma API REST (PostgREST), y una imitación de Auth. Así se prueban el esquema, las reglas de seguridad y la aplicación completa sin tocar el proyecto real.

> Son herramientas de desarrollo. La aplicación no las necesita para funcionar.

## Requisitos

| Herramienta | Para qué |
|---|---|
| PostgreSQL 15 o superior (`psql`) | Base de datos local |
| [PostgREST](https://github.com/PostgREST/postgrest/releases) 12.x | API REST, igual que Supabase |
| Node.js 18 o superior | Servidor que imita Auth/Storage y pruebas en navegador |
| Playwright (`npm i -D playwright` y `npx playwright install chromium`) | Solo para `prueba_e2e.js` |

## 1. Crear la base de prueba

```bash
createdb -h localhost -U postgres eco
psql -h localhost -U postgres -d eco -f pruebas/supabase_local/stub_supabase.sql
psql -h localhost -U postgres -d eco -f supabase/esquema_supabase.sql
```

`stub_supabase.sql` crea lo mínimo de Supabase que el esquema necesita: los roles `anon`, `authenticated` y `authenticator`, las funciones `auth.uid()` y `auth.jwt()` (que leen el token como lo hace Supabase) y el esquema `storage`.

## 2. Pruebas SQL (funciones y RLS)

```bash
bash pruebas/prueba_sql.sh
```

Actúa como siete usuarios de dos municipios (administradores de Soacha y Medellín, ciudadanos, un repartidor, una empresa y un intruso sin registro) y ejecuta cada caso como el rol `authenticated`. La salida muestra el resultado o el error esperado de cada caso, por ejemplo:

- "La solicitud ya no existe." (el administrador de Medellín intenta asignar una solicitud de Soacha).
- "permission denied for table solicitudes_recoleccion" (escritura directa bloqueada).
- "Solo hay 3.5 kg libres: el resto está reservado para pedidos de empresas aprobados."

Ejecútalo sobre una base **recién creada**: los casos usan los identificadores 1, 2, 3…

## 3. Prueba de extremo a extremo (navegador)

Vuelve a crear la base (paso 1) y luego, en tres terminales:

```bash
postgrest pruebas/supabase_local/postgrest.conf          # API en el puerto 3000
node pruebas/supabase_local/servidor_supabase.js           # App + Auth + Storage en el puerto 8800
node pruebas/prueba_e2e.js                                 # 44 comprobaciones
```

El servidor de prueba entrega un `config.js` que apunta a `http://localhost:8800` y simula el inicio de sesión de Google, incluida la verificación del *nonce*. La prueba abre cinco navegadores (administrador de Soacha, ciudadano, repartidor, empresa y administrador de Medellín) y comprueba, entre otras cosas:

- el registro con Departamento → Municipio (33 departamentos; 116 municipios en Cundinamarca);
- que el repartidor queda pendiente hasta que el administrador lo aprueba;
- el flujo completo: solicitud → asignación → registro de kilos → inventario → pedido → aprobación (reserva) → entrega (salida);
- que cada rol solo recibe lo suyo (RLS) y que Medellín no ve nada de Soacha;
- que el servidor rechaza acciones aunque se salte la interfaz;
- que una cuenta desactivada queda fuera, y que la sesión se conserva al recargar.

Termina con código de salida 1 si alguna comprobación falla. Los `403` en la consola son los rechazos que la prueba provoca a propósito.

## Archivos

| Archivo | Contenido |
|---|---|
| `supabase_local/stub_supabase.sql` | Roles y funciones mínimas de Supabase |
| `supabase_local/postgrest.conf` | Configuración de PostgREST (secreto JWT de prueba) |
| `supabase_local/servidor_supabase.js` | `/rest/v1` → PostgREST, `/auth/v1/token` (id_token y refresh), archivos de la app |
| `prueba_sql.sh` | Casos de funciones y RLS en SQL |
| `prueba_e2e.js` | Prueba completa en el navegador con Playwright |
