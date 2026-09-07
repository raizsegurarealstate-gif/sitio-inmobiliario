// POST /api/consulta — guarda cada consulta del sitio directo en clientes_inmobiliaria.
// Igual que propiedades.js: usa la llave de servicio, nunca la ve el navegador.
// Si el teléfono ya existía (índice único de clientes_inmo_tel_unico), actualiza esa
// fila en vez de tronar — es la misma persona volviendo a preguntar.
const { createClient } = require("@supabase/supabase-js");

function soloDigitos(t) {
  return (t || "").replace(/\D/g, "");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "método no permitido" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const nombre = (body.nombre || "").trim().slice(0, 200);
  const telefono = soloDigitos(body.telefono);
  const mensaje = (body.mensaje || "").trim().slice(0, 1000);
  const referenciaPropiedad = (body.referencia_propiedad || "").trim().slice(0, 100);

  if (telefono.length !== 10) {
    res.status(400).json({ error: "Falta un teléfono válido de 10 dígitos." });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) {
    res.status(500).json({ error: "faltan las variables de entorno de Supabase" });
    return;
  }
  const supabase = createClient(url, llave);

  const { error: errorInsert } = await supabase.from("clientes_inmobiliaria").insert({
    nombre: nombre || null,
    telefono,
    origen: "WEB",
    anuncio_origen: referenciaPropiedad || null,
    notas: mensaje || null,
    etapa: "NUEVO",
  });

  if (!errorInsert) {
    res.status(200).json({ ok: true });
    return;
  }

  // 23505 = ya existe ese teléfono (índice único parcial) — actualiza, no falla.
  if (errorInsert.code === "23505") {
    const { error: errorUpdate } = await supabase
      .from("clientes_inmobiliaria")
      .update({
        ultima_interaccion: new Date().toISOString(),
        notas: mensaje || null,
        siguiente_accion: "Volvió a preguntar desde el sitio web — revisar.",
      })
      .eq("telefono", telefono);

    if (errorUpdate) {
      res.status(500).json({ error: errorUpdate.message });
      return;
    }
    res.status(200).json({ ok: true, nota: "Ya te teníamos registrado — actualizamos tu consulta." });
    return;
  }

  res.status(500).json({ error: errorInsert.message });
};
