// /api/admin/crm — CRM del panel de Alejandra: clientes, citas y ventas (con comisión compartida).
// Protegido con ADMIN_PASSWORD (encabezado x-admin-key), igual que /api/admin/propiedades.
//   GET   ?r=todo                    -> clientes, citas, ventas, propiedades, asesores
//   PATCH ?r=cliente   {id, etapa, prioridad, siguiente_accion, notas, baja}
//   POST  ?r=cita      {cliente_id, propiedad_id, fecha_hora, notas}
//   PATCH ?r=cita      {id, estado, fecha_hora, notas}
//   POST  ?r=venta     {cliente_id, ...}     PATCH ?r=venta {id, ...}
// Nunca se borra nada: los cambios importantes quedan en historial_cambios.
const { createClient } = require("@supabase/supabase-js");
const { normalizarVenta, normalizarCita, normalizarCliente } = require("../../lib/ventas");

function autorizado(req) {
  const clave = process.env.ADMIN_PASSWORD;
  return !!clave && req.headers["x-admin-key"] === clave;
}

async function registrarCambios(supabase, entidad, id, antes, despues) {
  const filas = [];
  for (const [campo, nuevo] of Object.entries(despues)) {
    const viejo = antes ? antes[campo] : null;
    if (JSON.stringify(viejo ?? null) === JSON.stringify(nuevo ?? null)) continue;
    filas.push({ entidad, entidad_id: id, campo, valor_anterior: viejo == null ? null : String(viejo),
      valor_nuevo: nuevo == null ? null : String(nuevo), fuente: "panel" });
  }
  if (filas.length) await supabase.from("historial_cambios").insert(filas);
}

module.exports = async (req, res) => {
  if (!autorizado(req)) {
    res.status(401).json({ error: "Contraseña incorrecta o faltante." });
    return;
  }
  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) {
    res.status(500).json({ error: "faltan las variables de entorno de Supabase" });
    return;
  }
  const supabase = createClient(url, llave);
  const r = String((req.query && req.query.r) || "");
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  try {
    if (req.method === "GET" && r === "todo") {
      const [c, ci, v, p, a] = await Promise.all([
        supabase.from("clientes_inmobiliaria").select("*").order("fecha_primer_contacto", { ascending: false }).limit(2000),
        supabase.from("citas").select("*").order("fecha_hora", { ascending: false }).limit(2000),
        supabase.from("ventas").select("*").order("creado_en", { ascending: false }).limit(2000),
        supabase.from("propiedades").select("id, referencia_publica, colonia, municipio, tipo_propiedad, precio_publicado"),
        supabase.from("asesores").select("id, nombre, inmobiliaria"),
      ]);
      const falla = [c, ci, v, p, a].find((x) => x.error);
      if (falla) { res.status(500).json({ error: falla.error.message }); return; }
      const cli = new Map(c.data.map((x) => [x.id, x]));
      const pro = new Map(p.data.map((x) => [x.id, x]));
      const ase = new Map(a.data.map((x) => [x.id, x]));
      const citas = ci.data.map((x) => ({ ...x,
        cliente_nombre: (cli.get(x.cliente_id) || {}).nombre || null, cliente_telefono: (cli.get(x.cliente_id) || {}).telefono || null,
        propiedad_clave: (pro.get(x.propiedad_id) || {}).referencia_publica || null }));
      const ventas = v.data.map((x) => ({ ...x,
        cliente_nombre: (cli.get(x.cliente_id) || {}).nombre || null,
        propiedad_clave: (pro.get(x.propiedad_id) || {}).referencia_publica || null,
        colaborador: x.tipo_venta === "colaboracion" ? ((ase.get(x.asesor_colaborador_id) || {}).nombre || x.colaborador_nombre) : null }));
      res.status(200).json({ clientes: c.data, citas, ventas, propiedades: p.data, asesores: a.data });
      return;
    }

    if (req.method === "PATCH" && r === "cliente") {
      const n = normalizarCliente(body);
      if (n.error || !body.id) { res.status(400).json({ error: n.error || "Falta el id." }); return; }
      const { data: antes } = await supabase.from("clientes_inmobiliaria").select("*").eq("id", body.id).maybeSingle();
      if (!antes) { res.status(404).json({ error: "Cliente no encontrado." }); return; }
      const { error } = await supabase.from("clientes_inmobiliaria").update({ ...n.datos, ultima_interaccion: new Date().toISOString() }).eq("id", body.id);
      if (error) { res.status(500).json({ error: error.message }); return; }
      await registrarCambios(supabase, "cliente", body.id, antes, n.datos);
      res.status(200).json({ ok: true });
      return;
    }

    if (r === "cita" && (req.method === "POST" || req.method === "PATCH")) {
      const nuevo = req.method === "POST";
      const n = normalizarCita(body, !nuevo);
      if (n.error || (!nuevo && !body.id)) { res.status(400).json({ error: n.error || "Falta el id." }); return; }
      if (nuevo) {
        const { data, error } = await supabase.from("citas").insert({ ...n.datos, estado: n.datos.estado || "agendada" }).select("id").single();
        if (error) { res.status(500).json({ error: error.message }); return; }
        res.status(200).json({ ok: true, id: data.id });
        return;
      }
      const { data: antes } = await supabase.from("citas").select("*").eq("id", body.id).maybeSingle();
      if (!antes) { res.status(404).json({ error: "Cita no encontrada." }); return; }
      const { error } = await supabase.from("citas").update(n.datos).eq("id", body.id);
      if (error) { res.status(500).json({ error: error.message }); return; }
      await registrarCambios(supabase, "cita", body.id, antes, n.datos);
      res.status(200).json({ ok: true });
      return;
    }

    if (r === "venta" && (req.method === "POST" || req.method === "PATCH")) {
      const nuevo = req.method === "POST";
      let entrada = body;
      let antes = null;
      if (!nuevo) {
        if (!body.id) { res.status(400).json({ error: "Falta el id." }); return; }
        const { data } = await supabase.from("ventas").select("*").eq("id", body.id).maybeSingle();
        if (!data) { res.status(404).json({ error: "Venta no encontrada." }); return; }
        antes = data;
        // el panel manda la venta completa al editar: se mezcla con lo guardado para recalcular la comisión
        entrada = { ...data, ...body };
      }
      const n = normalizarVenta(entrada, false);
      if (n.error) { res.status(400).json({ error: n.error }); return; }
      if (nuevo) {
        const { data, error } = await supabase.from("ventas").insert(n.datos).select("id").single();
        if (error) { res.status(500).json({ error: error.message }); return; }
        await registrarCambios(supabase, "venta", data.id, null, { estado: n.datos.estado || "en_proceso", tipo_venta: n.datos.tipo_venta });
        res.status(200).json({ ok: true, id: data.id });
        return;
      }
      const cambios = { ...n.datos, actualizado_en: new Date().toISOString() };
      delete cambios.cliente_id; // el cliente de una venta no se reasigna
      const { error } = await supabase.from("ventas").update(cambios).eq("id", body.id);
      if (error) { res.status(500).json({ error: error.message }); return; }
      await registrarCambios(supabase, "venta", body.id, antes, n.datos);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: "método o recurso no permitido" });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
};
