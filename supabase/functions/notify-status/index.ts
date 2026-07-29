// Comandas/Pedidos El Torito — Edge Function "notify-status"
// Avisa a los dispositivos ADMIN (celu/compu de Ivan) cuando el carnicero mueve
// una comanda a "por cobrar" (espera_pago) o "por entregar" (lista).
//
// Es INDEPENDIENTE de "notify-order" (esa avisa comandas NUEVAS al carnicero).
// Solo envía a las suscripciones cuyo sub.role === 'admin' (el rol se guarda en el
// jsonb `sub` desde la app, así que NO hay columna nueva en la tabla).
//
// Deploy por el DASHBOARD de Supabase (igual que notify-order). Verify JWT = OFF.
// Reusa el MISMO secreto VAPID_PRIVATE que ya tenés para notify-order.
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

// Llave pública VAPID (la misma que va en la app web). La privada es un secreto.
const VAPID_PUBLIC = "BLtlaO2aaJp3fys_xuX7qVla79QXqi8haOm_I7wAkGU9_cnC6rahdPIoB5NvKGDLmxpJMZ8QYOh80rYqXejv_zY";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { title, body, exclude } = await req.json().catch(() => ({}));

    const SUPA = Deno.env.get("SUPABASE_URL");
    const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
    const restHeaders = { apikey: SRK!, Authorization: `Bearer ${SRK}` };

    let sent = 0, cleaned = 0;

    const priv = (Deno.env.get("VAPID_PRIVATE") || "").trim();
    if (priv) {
      webpush.setVapidDetails("mailto:pedidos@eltorito.hn", VAPID_PUBLIC, priv);
      const rr = await fetch(`${SUPA}/rest/v1/push_subs?select=endpoint,sub`, { headers: restHeaders });
      let subs: any[] = rr.ok ? await rr.json() : [];
      // SOLO dispositivos admin (el celu/compu de Ivan). El rol viaja dentro del jsonb `sub`.
      subs = subs.filter((s) => s?.sub?.role === "admin");
      if (exclude) subs = subs.filter((s) => s.endpoint !== exclude); // no avisar al que lo disparó
      if (subs.length) {
        const payload = JSON.stringify({ title: title || "El Torito", body: body || "" });
        const dead: string[] = [];
        const results = await Promise.allSettled(
          subs.map((s) =>
            webpush.sendNotification(s.sub, payload).catch((err: any) => {
              const code = err?.statusCode;
              if (code === 404 || code === 410) dead.push(s.endpoint); // suscripción muerta
              throw err;
            })
          ),
        );
        sent = results.filter((r) => r.status === "fulfilled").length;
        if (dead.length) {
          const list = dead.map((e) => `"${encodeURIComponent(e)}"`).join(",");
          await fetch(`${SUPA}/rest/v1/push_subs?endpoint=in.(${list})`, { method: "DELETE", headers: restHeaders }).catch(() => {});
          cleaned = dead.length;
        }
      }
    }

    return json({ ok: true, sent, cleaned });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
