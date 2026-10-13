// AIO public shallow readiness check. No user data, secrets, or expensive AI calls.
export async function onRequestGet({env}) {
  let db=false,media=false;
  try {
    if(env.COMMUNITY_DB){
      const row=await env.COMMUNITY_DB.prepare('SELECT 1 AS ready').first();
      db=Number(row?.ready)===1;
    }
  } catch (_) { db=false; }
  try {
    if(env.COMMUNITY_MEDIA){
      const result=await env.COMMUNITY_MEDIA.list({limit:1});
      media=Array.isArray(result?.objects);
    }
  } catch (_) { media=false; }
  const ok=db&&media;
  return new Response(JSON.stringify({ok}),{
    status:ok?200:503,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
  });
}
