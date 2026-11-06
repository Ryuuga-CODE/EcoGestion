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
A=11111111-1111-1111-1111-111111111111   # administrador de Soacha
M=66666666-6666-6666-6666-666666666666   # administrador de Medellín
C=33333333-3333-3333-3333-333333333333   # ciudadano de Soacha
R=22222222-2222-2222-2222-222222222222   # repartidor de Soacha
E=44444444-4444-4444-4444-444444444444   # empresa de Soacha
O=77777777-7777-7777-7777-777777777777   # ciudadano de Medellín
X=55555555-5555-5555-5555-555555555555   # intruso sin registro
SOACHA=25754; MEDELLIN=05001

echo "== admin entra: debe registrarse con municipio (administrador=true)"; como $A imsebasff@gmail.com "Ryuuga" "select iniciar_sesion();"
echo "== admin elige 'ciudadano' pero queda administrador de Soacha"; como $A imsebasff@gmail.com "Ryuuga" "select registrar_cuenta('ciudadano','$SOACHA',null,null,null,null); select r.codigo, p.codigo_municipio from perfiles p join roles r using(id_rol);"
echo "== municipio inexistente"; como $C ciuda@gmail.com "Ana Pérez" "select registrar_cuenta('ciudadano','99999','Calle 1 # 2-3',null,null,null);"
echo "== ciudadano sin dirección"; como $C ciuda@gmail.com "Ana Pérez" "select registrar_cuenta('ciudadano','$SOACHA',null,null,null,null);"
echo "== ciudadano de Soacha"; como $C ciuda@gmail.com "Ana Pérez" "select registrar_cuenta('ciudadano','$SOACHA','Cra 7 # 12-30, San Mateo','300 555 0101',null,null)->>'estado';"
echo "== repartidor sin teléfono"; como $R repa@gmail.com "Luis Gómez" "select registrar_cuenta('repartidor','$SOACHA',null,null,null,null);"
echo "== repartidor queda pendiente"; como $R repa@gmail.com "Luis Gómez" "select registrar_cuenta('repartidor','$SOACHA',null,'311 555 0202',null,null)->>'estado'; select iniciar_sesion()->>'estado'; select count(*) from solicitudes_recoleccion;"
echo "== empresa de Soacha"; como $E empresa@gmail.com "Andina" "select registrar_cuenta('empresa','$SOACHA','Zona industrial','6015550190','Recicladora Andina S.A.S.','900123456-7')->>'estado'; select razon_social from empresas;"
echo "== segundo admin en Medellín"; como $M sebasrtw@gmail.com "Sebas" "select registrar_cuenta(null,'$MEDELLIN',null,null,null,null)->>'estado';"
echo "== ciudadano de Medellín"; como $O otra@gmail.com "Marta" "select registrar_cuenta('ciudadano','$MEDELLIN','Calle 50 # 40-20, Laureles',null,null,null)->>'estado';"
echo "== no se puede elegir administrador ni vendedor"; como $X x@gmail.com "X" "select registrar_cuenta('vendedor','$SOACHA','Calle 1 # 1-1',null,null,null);"
echo "== intruso sin registro no ve nada"; como $X x@gmail.com "X" "select count(*) from usuarios; select count(*) from materiales; select count(*) from existencias_municipio;"
echo "== registrar dos veces"; como $C ciuda@gmail.com "Ana Pérez" "select registrar_cuenta('ciudadano','$SOACHA','Cra 7 # 12-30',null,null,null);"

echo "== admin Soacha ve solo su municipio (4 cuentas) y aprueba al repartidor"; como $A imsebasff@gmail.com "R" "select count(*) from usuarios; select admin_estado_usuario(3, true); select activo, pendiente from perfiles where id_usuario = 3;"
echo "== admin Medellín no puede tocar cuentas de Soacha"; como $M sebasrtw@gmail.com "S" "select count(*) from usuarios; select admin_estado_usuario(2, false); select admin_rol_usuario(3, 'ciudadano');"
echo "== ciudadano ve solo a sí mismo y a los administradores de su municipio"; como $C ciuda@gmail.com "A" "select string_agg(nombre, ', ' order by id_usuario) from usuarios;"

echo "== admin crea materiales del centro de acopio"; como $A imsebasff@gmail.com "R" "select guardar_material(null,'Botellas PET','Plástico','kg',null); select guardar_material(null,'Cartón corrugado','Papel y cartón','kg',null); select guardar_material(null,'Botellas PET','Plástico','kg',null);"
echo "== Medellín puede usar el mismo nombre y no ve los de Soacha"; como $M sebasrtw@gmail.com "S" "select guardar_material(null,'Botellas PET','Plástico','kg',null); select count(*) from materiales;"

echo "== ciudadano: solicitud con tipo inválido, fecha pasada y válida"; como $C ciuda@gmail.com "A" "select crear_solicitud('Cra 7 # 12-30', array['Llantas'], null, null, current_date, 'Mañana'); select crear_solicitud('Cra 7 # 12-30', array['Plástico'], null, null, current_date - 1, 'Mañana'); select crear_solicitud('Cra 7 # 12-30, San Mateo', array['Plástico','Papel y cartón','Plástico'], 'Bolsas en la portería', 15, current_date + 1, 'Mañana'); select tipos_residuo, estado from solicitudes_recoleccion;"
echo "== empresa y repartidor no crean solicitudes"; como $E empresa@gmail.com "E" "select crear_solicitud('Calle 1 # 1-1', array['Vidrio'], null, null, current_date, 'Tarde');"
echo "== escritura directa bloqueada"; como $C ciuda@gmail.com "A" "update solicitudes_recoleccion set estado = 'Recolectada'; insert into solicitudes_recoleccion (codigo_municipio,id_ciudadano,direccion,tipos_residuo,fecha_preferida) values ('$SOACHA',2,'xxxxxx','Vidrio',current_date);"
echo "== repartidor todavía no ve la solicitud"; como $R repa@gmail.com "L" "select count(*) from solicitudes_recoleccion;"
echo "== admin Medellín no puede asignar en Soacha"; como $M sebasrtw@gmail.com "S" "select asignar_solicitud(1, 3);"
echo "== admin asigna a un ciudadano (error) y al repartidor"; como $A imsebasff@gmail.com "R" "select asignar_solicitud(1, 2); select asignar_solicitud(1, 3); select estado, id_repartidor from solicitudes_recoleccion;"
echo "== repartidor ve la solicitud y al ciudadano"; como $R repa@gmail.com "L" "select count(*) from solicitudes_recoleccion; select string_agg(nombre, ', ' order by id_usuario) from usuarios;"
echo "== ciudadano ve al repartidor asignado"; como $C ciuda@gmail.com "A" "select string_agg(nombre, ', ' order by id_usuario) from usuarios;"
echo "== repartidor devuelve (deja de verla) y admin reasigna"; como $R repa@gmail.com "L" "select devolver_solicitud(1, 'Nadie en casa'); select count(*) from solicitudes_recoleccion;"; como $A imsebasff@gmail.com "R" "select estado, nota from solicitudes_recoleccion; select asignar_solicitud(1, 3);"
echo "== repartidor completa: material de otro municipio, repetido, y válido"; como $R repa@gmail.com "L" "select completar_solicitud(1, '[{\"id_material\":3,\"cantidad\":2}]', null); select completar_solicitud(1, '[{\"id_material\":1,\"cantidad\":2},{\"id_material\":1,\"cantidad\":3}]', null); select completar_solicitud(1, '[{\"id_material\":1,\"cantidad\":8.5},{\"id_material\":2,\"cantidad\":6}]', 'Todo separado'); select estado, kilos_recolectados from solicitudes_recoleccion; select count(*) from recolecciones;"
echo "== completar otra vez (transición inválida)"; como $R repa@gmail.com "L" "select completar_solicitud(1, '[{\"id_material\":1,\"cantidad\":1}]', null);"
echo "== inventario del admin"; como $A imsebasff@gmail.com "R" "select nombre, existencia, comprometido from existencias_municipio order by 1; select count(*) from movimientos;"
echo "== ciudadano: segunda solicitud y la cancela"; como $C ciuda@gmail.com "A" "select crear_solicitud('Cra 7 # 12-30', array['Vidrio'], null, null, current_date, 'Tarde'); select cancelar_solicitud(2, 'Ya lo llevé'); select estado from solicitudes_recoleccion where id_solicitud = 2;"
echo "== admin rechaza sin motivo y con motivo"; como $C ciuda@gmail.com "A" "select crear_solicitud('Cra 7 # 12-30', array['Metal'], null, null, current_date, 'Tarde');"; como $A imsebasff@gmail.com "R" "select rechazar_solicitud(3, ''); select rechazar_solicitud(3, 'Fuera de la zona de cobertura'); select estado from solicitudes_recoleccion where id_solicitud = 3;"
echo "== ciudadano de Medellín no ve solicitudes de Soacha"; como $O otra@gmail.com "M" "select count(*) from solicitudes_recoleccion; select count(*) from usuarios;"

echo "== empresa ve existencias pero no movimientos"; como $E empresa@gmail.com "E" "select nombre, existencia from existencias_municipio order by 1; select count(*) from movimientos;"
echo "== empresa pide de más y luego 5 kg de PET"; como $E empresa@gmail.com "E" "select crear_pedido(1, 50, 900, null); select crear_pedido(1, 5, 900, 'Recogemos el lunes'); select crear_pedido(1, 1, 900, null);"
echo "== ciudadano no puede pedir"; como $C ciuda@gmail.com "A" "select crear_pedido(1, 1, 900, null);"
echo "== admin aprueba: queda comprometido; salida manual no puede usar lo reservado"; como $A imsebasff@gmail.com "R" "select responder_pedido(1, 'aprobar', null); select existencia, comprometido from existencias_municipio where id_material = 1; select registrar_salida(1, 1, 5, current_date, 'Planta');"
echo "== empresa no puede entregarse a sí misma"; como $E empresa@gmail.com "E" "select responder_pedido(1, 'entregar', null);"
echo "== admin entrega: salida automática"; como $A imsebasff@gmail.com "R" "select responder_pedido(1, 'entregar', 'Entregado en bodega'); select existencia, comprometido from existencias_municipio where id_material = 1; select tipo, cantidad, id_pedido from movimientos where id_pedido is not null;"
echo "== empresa pide y cancela; admin no aprueba cancelado"; como $E empresa@gmail.com "E" "select crear_pedido(2, 3, 400, null); select responder_pedido(2, 'cancelar', null);"; como $A imsebasff@gmail.com "R" "select responder_pedido(2, 'aprobar', null);"
echo "== admin Medellín no ve pedidos de Soacha"; como $M sebasrtw@gmail.com "S" "select count(*) from pedidos_empresa; select count(*) from empresas;"

echo "== no se borra material con movimientos; recolección directa y fecha futura"; como $A imsebasff@gmail.com "R" "select eliminar_material(1); select registrar_recoleccion(2, 3, 4, current_date, 'Punto limpio'); select registrar_recoleccion(2, 2, 4, current_date, null); select registrar_recoleccion(2, 1, 4, current_date + 2, null);"
echo "== repartidor ve solo sus recolecciones"; como $R repa@gmail.com "L" "select count(*) from recolecciones; select count(*) from movimientos;"
echo "== desactivar repartidor devuelve sus asignadas"; como $C ciuda@gmail.com "A" "select crear_solicitud('Cra 7 # 12-30', array['Vidrio'], null, null, current_date, 'Tarde');"; como $A imsebasff@gmail.com "R" "select asignar_solicitud(4, 3); select admin_estado_usuario(3, false); select estado, id_repartidor, nota from solicitudes_recoleccion where id_solicitud = 4;"
echo "== repartidor desactivado"; como $R repa@gmail.com "L" "select iniciar_sesion();"
echo "== cambiar tipo: empresa no cambia; ciudadano a repartidor; último admin"; como $A imsebasff@gmail.com "R" "select admin_rol_usuario(4, 'ciudadano'); select admin_rol_usuario(2, 'repartidor'); select admin_rol_usuario(2, 'ciudadano'); select admin_estado_usuario(1, false);"
echo "== anon solo lee municipios"; $DB -c "set role anon; select count(*) from municipios;" 2>&1 | tail -1; $DB -c "set role anon; select iniciar_sesion();" 2>&1 | tail -1
echo "== correos administradores ocultos"; como $C ciuda@gmail.com "A" "select * from correos_administradores;"
