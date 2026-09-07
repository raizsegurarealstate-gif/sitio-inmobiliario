// POST /api/consulta — guarda cada consulta del sitio directo en clientes_inmobiliaria,
// y si mandaron fecha para una propiedad concreta, agenda la cita en la tabla `citas`.
// Igual que propiedades.js: usa la llave de servicio, nunca la ve el navegador.
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
  const formaPago = (body.forma_pago || "").trim().slice(0, 100);
  const fechaCita = (body.fecha_cita || "").trim().slice(0, 10); // "YYYY-MM-DD"
  const horaCita = (body.hora_cita || "").trim().slice(0, 5); // "HH:MM"

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

  let clienteId = null;

  const { data: insertado, error: errorInsert } = await supabase
    .from("clientes_inmobiliaria")
    .insert({
      nombre: nombre || null,
      telefono,
      origen: "WEB",
      anuncio_origen: referenciaPropiedad || null,
      forma_pago: formaPago || null,
      notas: mensaje || null,
      etapa: "NUEVO",
    })
    .select("id")
    .single();

  if (!errorInsert) {
    clienteId = insertado.id;
  } else if (errorInsert.code === "23505") {
    // Ya existía ese teléfono — actualiza en vez de tronar, es la misma persona volviendo.
    const cambios = { ultima_interaccion: new Date().toISOString() };
    if (nombre) cambios.nombre = nombre;
    if (formaPago) cambios.forma_pago = formaPago;
    if (mensaje) cambios.notas = mensaje;
    cambios.siguiente_accion = "Volvió a preguntar desde el sitio web — revisar.";

    const { data: actualizado, error: errorUpdate } = await supabase
      .from("clientes_inmobiliaria")
      .update(cambios)
      .eq("telefono", telefono)
      .select("id")
      .single();

    if (errorUpdate) {
      res.status(500).json({ error: errorUpdate.message });
      return;
    }
    clienteId = actualizado.id;
  } else {
    res.status(500).json({ error: errorInsert.message });
    return;
  }

  // Si pidieron fecha y es sobre una propiedad concreta (no el kit financiero),
  // agenda la cita ligada a esa propiedad.
  if (fechaCita && referenciaPropiedad && referenciaPropiedad !== "Kit financiero") {
    const { data: propiedad } = await supabase
      .from("propiedades")
      .select("id, asesor_id")
      .eq("referencia_publica", referenciaPropiedad)
      .maybeSingle();

    if (propiedad) {
      const fechaHora = fechaCita + "T" + (horaCita || "12:00") + ":00";
      await supabase.from("citas").insert({
        cliente_id: clienteId,
        propiedad_id: propiedad.id,
        asesor_id: propiedad.asesor_id || null,
        fecha_hora: fechaHora,
        estado: "agendada",
        notas: "Solicitada desde el sitio web.",
      });
    }
  }

  res.status(200).json({ ok: true });
};
