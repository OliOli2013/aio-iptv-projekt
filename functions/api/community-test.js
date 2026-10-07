export async function onRequestGet(context) {
  const { env } = context;

  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  };

  try {
    if (!env.COMMUNITY_DB) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Brak bindingu COMMUNITY_DB"
      }), { status: 500, headers });
    }

    if (!env.COMMUNITY_MEDIA) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Brak bindingu COMMUNITY_MEDIA"
      }), { status: 500, headers });
    }

    const tables = await env.COMMUNITY_DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'community_%' ORDER BY name"
    ).all();

    const media = await env.COMMUNITY_MEDIA.list({ limit: 1 });

    return new Response(JSON.stringify({
      ok: true,
      database: {
        binding: "COMMUNITY_DB",
        tables: (tables.results || []).map(row => row.name),
        tableCount: (tables.results || []).length
      },
      storage: {
        binding: "COMMUNITY_MEDIA",
        reachable: true,
        objectCountSample: Array.isArray(media.objects) ? media.objects.length : 0
      },
      timestamp: new Date().toISOString()
    }, null, 2), { headers });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error && error.message ? error.message : String(error)
    }), { status: 500, headers });
  }
}
