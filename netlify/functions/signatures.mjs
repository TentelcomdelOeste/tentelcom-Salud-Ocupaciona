import { getStore } from '@netlify/blobs';

const store = getStore({ name: 'firmas-asistencia', consistency: 'strong' });

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache'
};

function response(statusCode, body) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: statusCode,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

function keyFor(sessionId, dni) {
  return 'session_' + String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_') + '__dni_' + String(dni).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  try {
    const url = new URL(request.url);
    const qs = Object.fromEntries(url.searchParams.entries());
    let body = {};
    if (request.method !== 'GET' && request.method !== 'DELETE' && request.headers.get('content-type')?.includes('application/json')) {
      body = await request.json().catch(() => ({}));
    } else if (request.method === 'DELETE') {
      body = await request.json().catch(() => ({}));
    }

    const sessionId = qs.sessionId || body.sessionId;
    if (!sessionId) return response(400, { error: 'Falta sessionId' });

    if (request.method === 'GET') {
      const result = {};
      const dnis = String(qs.dnis || '').split(',').map(v => v.trim()).filter(Boolean);
      for (const dni of dnis) {
        result[dni] = await store.get(keyFor(sessionId, dni), { type: 'text', consistency: 'strong' });
      }
      return response(200, result);
    }

    if (request.method === 'POST') {
      if (!body.dni || typeof body.dataUrl !== 'string') return response(400, { error: 'Falta dni o dataUrl' });
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.dataUrl)) return response(400, { error: 'La firma no tiene un formato PNG válido' });
      if (body.dataUrl.length > 5 * 1024 * 1024) return response(413, { error: 'La firma supera el tamaño permitido' });
      await store.set(keyFor(sessionId, body.dni), body.dataUrl);
      return response(200, { ok: true });
    }

    if (request.method === 'DELETE') {
      if (!body.dni) return response(400, { error: 'Falta dni' });
      await store.delete(keyFor(sessionId, body.dni));
      return response(200, { ok: true });
    }

    return response(405, { error: 'Método no permitido' });
  } catch (err) {
    console.error('signatures function error', err);
    return response(500, { error: 'Error interno de almacenamiento de firmas.', details: String(err?.message || err) });
  }
}
