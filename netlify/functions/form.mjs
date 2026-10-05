import { getStore } from '@netlify/blobs';

const store = getStore('formularios-asistencia', { consistency: 'strong' });

function json(statusCode, body) {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      'Content-Type': 'application/json'
    }
  });
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      }
    });
  }

  try {
    if (request.method === 'GET') {
      const blob = await store.get('current', { type: 'json', consistency: 'strong' });
      if (!blob) return json(404, { error: 'No hay un PDF configurado todavía' });
      return json(200, blob);
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!body.pdfB64 || !Array.isArray(body.signers) || !body.sessionId) {
        return json(400, { error: 'Faltan pdfB64, signers o sessionId' });
      }
      if (typeof body.pdfB64 !== 'string' || body.pdfB64.length > 5 * 1024 * 1024) {
        return json(413, { error: 'El PDF supera el tamaño permitido' });
      }

      await store.setJSON('current', {
        sessionId: String(body.sessionId),
        fileName: body.fileName || 'asistencia.pdf',
        pdfB64: body.pdfB64,
        signers: body.signers,
        meta: body.meta || {},
        updatedAt: new Date().toISOString()
      });
      return json(200, { ok: true });
    }

    return json(405, { error: 'Método no permitido' });
  } catch (err) {
    console.error('form function error', err);
    return json(500, {
      error: 'Error interno al guardar el formulario.',
      details: String(err?.message || err)
    });
  }
}
