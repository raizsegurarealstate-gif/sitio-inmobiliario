// POST /api/chat — el asistente del sitio. Responde con los datos reales de las propiedades
// DISPONIBLES (mismas columnas seguras que /api/propiedades). Usa Groq con la llave
// GROQ_API_KEY (variable de entorno de Vercel; nunca en archivos). Cada respuesta pasa por un
// verificador; si no pasa, no se manda y el caso se pasa a Ale.
const { createClient } = require("@supabase/supabase-js");
const { responder, PASAR_A_ALE } = require("../lib/chat");

const MODELO = "openai/gpt-oss-120b";
const visitas = new Map(); // límite simple por IP (se reinicia en frío; es un freno básico)

function limite(ip) {
  const ahora = Date.now();
  const lista = (visitas.get(ip) || []).filter((t) => ahora - t < 3600000);
  lista.push(ahora);
  visitas.set(ip, lista);
  return lista.length > 30;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "método no permitido" });
    return;
  }
  const llaveGroq = process.env.GROQ_API_KEY;
  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!llaveGroq || !url || !llave) {
    // sin configurar: el sitio muestra el botón de WhatsApp en lugar del chat
    res.status(503).json({ error: "chat no disponible", respuesta: null });
    return;
  }
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "desconocida";
  if (limite(ip)) {
    res.status(429).json({ respuesta: "Hemos recibido muchos mensajes. Escríbale a Ale por WhatsApp, por favor.", necesita_ale: true });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const mensaje = String(body.mensaje || "").trim();
  if (!mensaje) {
    res.status(400).json({ error: "mensaje vacío" });
    return;
  }

  const supabase = createClient(url, llave);
  const { data, error } = await supabase
    .from("propiedades")
    .select(
      "referencia_publica, estado, municipio, colonia, desarrollo, tipo_propiedad, operacion, " +
        "precio_publicado, terreno_m2, construccion_m2, recamaras, banos, estacionamientos, formas_pago_aceptadas"
    )
    .in("disponibilidad", ["DISPONIBLE"])
    .limit(40);
  if (error) {
    res.status(500).json({ respuesta: PASAR_A_ALE, necesita_ale: true });
    return;
  }
  const props = (data || []).filter((p) => p.referencia_publica);
  if (!props.length) {
    res.status(200).json({ respuesta: "Por ahora estoy actualizando las propiedades. Ale con gusto le ayuda por WhatsApp.", necesita_ale: true });
    return;
  }

  const llamarModelo = async (sis, msgs) => {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llaveGroq}`, "User-Agent": "raizsegura-chat/1.0" },
      body: JSON.stringify({ model: MODELO, temperature: 0.2, messages: [{ role: "system", content: sis }, ...msgs] }),
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    return j.choices[0].message.content;
  };

  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "America/Mexico_City" });
  try {
    const r = await responder({ mensaje, historial: body.historial, props, hoy, llamarModelo });
    res.status(200).json({ respuesta: r.respuesta, necesita_ale: r.necesita_ale, quiere_cita: r.quiere_cita, motivo: r.motivo });
  } catch (e) {
    res.status(200).json({ respuesta: PASAR_A_ALE, necesita_ale: true, motivo: "falló el ayudante" });
  }
};
