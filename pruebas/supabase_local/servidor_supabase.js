// Imitación local de Supabase (solo para pruebas): /rest/v1 → PostgREST, /auth/v1 (id_token), /storage/v1, y archivos de la app
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { execFileSync } = require('child_process');
const APP = process.argv[2] || path.resolve(__dirname, '..', '..'), PUERTO = Number(process.env.PUERTO || 8800), SECRETO = 'secreto-de-prueba-local-con-mas-de-32-caracteres';
const b64u = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const firmar = (claims) => { const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify(claims));
  return `${h}.${p}.${b64u(crypto.createHmac('sha256', SECRETO).update(`${h}.${p}`).digest())}`; };
const refresh = new Map(), fotos = new Map();
const uuidDe = (s) => { const h = crypto.createHash('md5').update(s).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj)); };
function sesionPara(claims) {
  const rt = crypto.randomBytes(16).toString('hex'); refresh.set(rt, claims);
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return { access_token: firmar({ ...claims, exp }), refresh_token: rt, expires_in: 3600, expires_at: exp, user: { id: claims.sub, email: claims.email } };
}
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let cuerpo = []; req.on('data', (c) => cuerpo.push(c)); req.on('end', () => {
    cuerpo = Buffer.concat(cuerpo);
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }); return res.end(); }
    if (url.pathname.startsWith('/rest/v1/')) {
      const opciones = { host: 'localhost', port: 3000, method: req.method, path: url.pathname.slice(8) + url.search,
        headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => ['authorization', 'range', 'range-unit', 'content-type', 'prefer', 'accept'].includes(k))) };
      if (!req.headers.apikey) return json(res, 401, { message: 'No API key found in request' });
      const p = http.request(opciones, (r) => { res.writeHead(r.statusCode, { ...r.headers, 'access-control-allow-origin': '*' }); r.pipe(res); });
      p.on('error', (e) => json(res, 502, { message: e.message })); p.end(cuerpo); return;
    }
    if (url.pathname === '/auth/v1/token') {
      const datos = JSON.parse(cuerpo.toString() || '{}');
      if (url.searchParams.get('grant_type') === 'id_token') {
        let g; try { g = JSON.parse(Buffer.from(datos.id_token.split('.')[1], 'base64url').toString()); } catch (e) { return json(res, 400, { error: 'invalid_request', error_description: 'Bad ID token' }); }
        if (g.nonce || datos.nonce) { const h = crypto.createHash('sha256').update(String(datos.nonce || '')).digest('hex');
          if (h !== g.nonce) return json(res, 400, { error: 'invalid_request', error_description: 'Nonces mismatch' }); }
        const sub = uuidDe(g.sub);
        execFileSync('psql', ['-h', 'localhost', '-U', 'postgres', '-d', 'eco', '-qc', `insert into auth.users values ('${sub}', '${g.email.replace(/'/g, "''")}') on conflict do nothing`]);
        return json(res, 200, sesionPara({ sub, email: g.email, role: 'authenticated', aud: 'authenticated', user_metadata: { full_name: g.name, avatar_url: g.picture, provider_id: g.sub } }));
      }
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        const c = refresh.get(datos.refresh_token); if (!c) return json(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
        refresh.delete(datos.refresh_token); return json(res, 200, sesionPara(c));
      }
    }
    if (url.pathname === '/auth/v1/logout') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*' }); return res.end(); }
    if (url.pathname.startsWith('/storage/v1/object/public/fotos/')) {
      const f = fotos.get(url.pathname.slice('/storage/v1/object/public/fotos/'.length));
      if (!f) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(f);
    }
    if (url.pathname.startsWith('/storage/v1/object/fotos/') && req.method === 'POST') {
      const ruta = url.pathname.slice('/storage/v1/object/fotos/'.length);
      const auth = (req.headers.authorization || '').split('.')[1];
      let sub; try { sub = JSON.parse(Buffer.from(auth, 'base64url').toString()).sub; } catch (e) { return json(res, 401, { message: 'Unauthorized' }); }
      if (ruta.split('/')[0] !== sub) return json(res, 403, { message: 'new row violates row-level security policy' });
      fotos.set(ruta, cuerpo); return json(res, 200, { Key: 'fotos/' + ruta });
    }
    // Archivos de la aplicación (config.js de prueba apunta a este servidor)
    let archivo = path.join(APP, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (url.pathname === '/js/config.js') {
      res.writeHead(200, { 'Content-Type': tipos['.js'] });
      return res.end(`window.Eco=window.Eco||{};Eco.Config=Object.freeze({GOOGLE_CLIENT_ID:'cliente-prueba.apps.googleusercontent.com',SUPABASE_URL:'http://localhost:${PUERTO}',SUPABASE_ANON_KEY:'clave-anon-de-prueba-0123456789'});`);
    }
    fs.readFile(archivo, (e, d) => { if (e) { res.writeHead(404); return res.end('no'); } res.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream' }); res.end(d); });
  });
}).listen(PUERTO, () => console.log('listo en', PUERTO));
