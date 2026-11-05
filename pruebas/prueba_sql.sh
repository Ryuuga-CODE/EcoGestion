#!/bin/bash
# Pruebas de las funciones y de RLS actuando como distintos usuarios.
# Requiere una base recién creada con stub_supabase.sql + esquema_supabase.sql.
# Cada bloque muestra el resultado esperado (o el error esperado).
DB="psql -h ${PGHOST:-localhost} -U ${PGUSER:-postgres} -d ${PGDATABASE:-eco} -tA -v ON_ERROR_STOP=0"
como() { # uuid correo nombre sql
  $DB -c "insert into auth.users values ('$1','$2') on conflict do nothing" >/dev/null
  $DB <<SQL 2>&1 | grep -v '^SET$' | sed 's/^/   /'
select set_config('request.jwt.claims', '{"sub":"$1","email":"$2","role":"authenticated","user_metadata":{"full_name":"$3","avatar_url":"https://lh3.googleusercontent.com/x","provider_id":"g-$1"}}', false);
set role authenticated;
$4
SQL
}
A=11111111-1111-1111-1111-111111111111   # admin
V=22222222-2222-2222-2222-222222222222   # vendedor
C=33333333-3333-3333-3333-333333333333   # comprador
E=44444444-4444-4444-4444-444444444444   # empresa
X=55555555-5555-5555-5555-555555555555   # intruso
echo "== admin entra (correo de administradores)"; como $A imsebasff@gmail.com "Ryuuga" "select iniciar_sesion();"
echo "== vendedor nuevo"; como $V vende@gmail.com "Carlos Ramírez" "select iniciar_sesion(); select registrar_cuenta('vendedor','Bogotá · Kennedy','300 555 0123',null,null); select iniciar_sesion();"
echo "== comprador nuevo con nombre repetido"; como $C compra@gmail.com "Carlos Ramírez" "select registrar_cuenta('comprador','Bogotá · Suba',null,null,null); select nombre from usuarios order by id_usuario;"
echo "== empresa"; como $E empresa@gmail.com "Andina" "select registrar_cuenta('empresa','Bogotá','6015550190','Recicladora Andina S.A.S.','900123456-7'); select razon_social from empresas;"
echo "== registrar dos veces"; como $V vende@gmail.com "Carlos Ramírez" "select registrar_cuenta('vendedor','x y',null,null,null);"
echo "== intruso sin registro no ve nada"; como $X otro@gmail.com "Otro" "select count(*) from usuarios; select count(*) from publicaciones;"
echo "== intruso no puede elegir admin"; como $X otro@gmail.com "Otro" "select registrar_cuenta('administrador','Bogotá',null,null,null);"
echo "== vendedor publica"; como $V vende@gmail.com "Carlos Ramírez" "select guardar_publicacion(null,'Plástico','Botellas PET','limpias',85,'kg',900,'Bogotá · Kennedy', array['https://x.supabase.co/storage/v1/object/public/fotos/a.jpg']); select count(*) from fotos_publicacion;"
echo "== escritura directa bloqueada"; como $V vende@gmail.com "C" "insert into publicaciones(id_vendedor,tipo_residuo,nombre_material,cantidad_disponible,unidad,precio_unitario,ubicacion) values (1,'Papel','xx',1,'kg',1,'aa');"
echo "== update directo bloqueado (0 filas o error)"; como $V vende@gmail.com "C" "update publicaciones set precio_unitario=1;"
echo "== comprador no puede publicar"; como $C compra@gmail.com "C" "select guardar_publicacion(null,'Papel','Papel','',1,'kg',1,'Bogotá',null);"
echo "== comprador oferta de más"; como $C compra@gmail.com "C" "select enviar_oferta(1, 100, 850, null);"
echo "== comprador oferta válida y repetida"; como $C compra@gmail.com "C" "select enviar_oferta(1, 30, 850, 'sábado'); select enviar_oferta(1, 5, 850, null);"
echo "== empresa oferta 60"; como $E empresa@gmail.com "E" "select enviar_oferta(1, 60, 880, null);"
echo "== vendedor ve sus 2 ofertas; empresa solo la suya"; como $V vende@gmail.com "C" "select count(*) from ofertas;"; como $E empresa@gmail.com "E" "select count(*) from ofertas;"
echo "== comprador no puede aceptar"; como $C compra@gmail.com "C" "select responder_oferta(1,'aceptar');"
echo "== vendedor acepta 30 y luego 60 (no alcanza: 55)"; como $V vende@gmail.com "C" "select responder_oferta(1,'aceptar'); select cantidad_disponible, estado from publicaciones; select responder_oferta(2,'aceptar'); select cantidad_disponible from publicaciones; select estado from ofertas order by 1;"
echo "== comprador cancela aceptada → devuelve"; como $C compra@gmail.com "C" "select responder_oferta(1,'cancelar'); select cantidad_disponible from publicaciones; select estado from transacciones;"
echo "== vendedor acepta 60 y completa"; como $V vende@gmail.com "C" "select responder_oferta(2,'aceptar'); select responder_oferta(2,'completar'); select o.estado, t.estado from ofertas o join transacciones t using(id_oferta) where id_oferta=2;"
echo "== transición inválida"; como $V vende@gmail.com "C" "select responder_oferta(2,'aceptar');"
echo "== comprador no ve inventario"; como $C compra@gmail.com "C" "select count(*) from materiales;"
echo "== admin: material, recolección, salida"; como $A imsebasff@gmail.com "R" "select guardar_material(null,'Botellas PET','Plástico','kg',null); select registrar_recoleccion(1, 1, 48.5, current_date, 'sede'); select registrar_salida(1,1,10,current_date,'planta'); select registrar_salida(1,1,100,current_date,'planta');"
echo "== admin no puede borrar material con movimientos"; como $A imsebasff@gmail.com "R" "select eliminar_material(1);"
echo "== no admin no registra recolección"; como $V vende@gmail.com "C" "select registrar_recoleccion(1, 2, 5, current_date, null);"
echo "== fecha futura"; como $A imsebasff@gmail.com "R" "select registrar_recoleccion(1, 1, 5, current_date + 3, null);"
echo "== empresa necesidad"; como $E empresa@gmail.com "E" "select guardar_necesidad(null,'Cartón',null,500,100,'kg',480); select guardar_necesidad(null,'Cartón',null,500,3000,'kg',480); select accion_necesidad(1,'estado'); select estado from necesidades_empresa;"
echo "== admin desactiva vendedor y cambia rol"; como $A imsebasff@gmail.com "R" "select admin_estado_usuario(2,false); select admin_rol_usuario(3,'vendedor'); select admin_estado_usuario(1,false);"
echo "== vendedor desactivado"; como $V vende@gmail.com "C" "select iniciar_sesion(); select count(*) from publicaciones;"
echo "== anon no ejecuta funciones"; $DB -c "set role anon; select iniciar_sesion();" 2>&1 | tail -1
echo "== correos administradores ocultos"; como $C compra@gmail.com "C" "select * from correos_administradores;"
