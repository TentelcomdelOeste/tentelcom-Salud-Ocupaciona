import { getStore } from '@netlify/blobs';

const store = getStore('firmas-asistencia', { consistency: 'strong' });

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
      const rawDnis = qs.dnis || '';
      const dnis = String(rawDnis).split(',').map(v => v.trim()).filter(Boolean);

      if (dnis.length) {
        const values = await Promise.all(dnis.map(async dni => ({
          dni,
          value: await store.get(keyFor(sessionId, dni), { type: 'text', consistency: 'strong' })
        })));
        values.forEach(({ dni, value }) => { result[dni] = value || null; });
      } else {
        const { blobs } = await store.list({ prefix: 'session_' + String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_') + '__dni_' });
        for (const b of blobs) {
          const marker = '__dni_';
          const idx = b.key.indexOf(marker);
          if (idx >= 0) {
            const dni = b.key.slice(idx + marker.length);
            const value = await store.get(b.key, { type: 'text', consistency: 'strong' });
            if (value) result[dni] = value;
          }
        }
      }
      return response(200, result);
    }

    if (request.method === 'POST') {
      if (!body.dni || typeof body.dataUrl !== 'string') return response(400, { error: 'Falta dni o dataUrl' });
      if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.dataUrl)) return response(400, { error: 'La firma no tiene un formato PNG válido' });
      if (body.dataUrl.length > 5 * 1024 * 1024) return response(413, { error: 'La firma supera el tamaño permitido' });

      const key = keyFor(sessionId, body.dni);
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await store.set(key, body.dataUrl);
          const saved = await store.get(key, { type: 'text', consistency: 'strong' });
          if (saved === body.dataUrl) return response(200, { ok: true });
          throw new Error('La firma no pudo verificarse después de guardarla');
        } catch (err) {
          lastError = err;
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
      throw lastError || new Error('No se pudo guardar la firma');
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
