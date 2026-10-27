// POST /api/consulta — guarda cada consulta del sitio directo en clientes_inmobiliaria,
// y si mandaron fecha para una propiedad concreta, agenda la cita en la tabla `citas`.
// Igual que propiedades.js: usa la llave de servicio, nunca la ve el navegador.
// Desde 2026-10-25 también guarda correo, tipo de interés (comprar/construir/invertir),
// plazo, perfil del perfilador y la fecha en que se aceptó el aviso de privacidad.
const { createClient } = require("@supabase/supabase-js");
const { normalizar, siguienteAccion, fechaHoraCita } = require("../lib/consulta");

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
  const r = normalizar(body || {});
  if (r.error) {
    res.status(400).json({ error: r.error });
    return;
  }
  const d = r.datos;

  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) {
    res.status(500).json({ error: "faltan las variables de entorno de Supabase" });
    return;
  }
  const supabase = createClient(url, llave);
  const ahora = new Date().toISOString();

  // Solo se mandan los campos que sí vinieron: nunca se pisa un dato con vacío.
  const campos = {
    nombre: d.nombre,
    correo: d.correo,
    anuncio_origen: d.referencia_propiedad,
    forma_pago: d.forma_pago,
    plazo: d.plazo,
    tipo_operacion: d.tipo_operacion,
    tipo_propiedad: d.tipo_propiedad,
    zona: d.zona,
    presupuesto_max: d.presupuesto_max,
    perfil: d.perfil,
    notas: d.mensaje,
    aviso_aceptado_en: d.aviso_aceptado ? ahora : null,
  };
  const conDatos = {};
  for (const [k, v] of Object.entries(campos)) if (v !== null && v !== undefined) conDatos[k] = v;

  let clienteId = null;

  const { data: insertado, error: errorInsert } = await supabase
    .from("clientes_inmobiliaria")
    .insert({ ...conDatos, telefono: d.telefono, origen: "WEB", etapa: "NUEVO", ultima_interaccion: ahora,
      siguiente_accion: d.tipo_operacion ? siguienteAccion(d.tipo_operacion) : null })
    .select("id")
    .single();

  if (!errorInsert) {
    clienteId = insertado.id;
  } else if (errorInsert.code === "23505") {
    // Ya existía ese teléfono — actualiza en vez de tronar, es la misma persona volviendo.
    const cambios = { ...conDatos, ultima_interaccion: ahora, siguiente_accion: siguienteAccion(d.tipo_operacion) };
    delete cambios.anuncio_origen; // no se pisa el anuncio con el que llegó la primera vez

    const { data: actualizado, error: errorUpdate } = await supabase
      .from("clientes_inmobiliaria")
      .update(cambios)
      .eq("telefono", d.telefono)
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
  if (d.fecha_cita && d.referencia_propiedad && d.referencia_propiedad !== "Kit financiero") {
    const { data: propiedad } = await supabase
      .from("propiedades")
      .select("id, asesor_id")
      .eq("referencia_publica", d.referencia_propiedad)
      .maybeSingle();

    if (propiedad) {
      const fechaHora = fechaHoraCita(d.fecha_cita, d.hora_cita);
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
