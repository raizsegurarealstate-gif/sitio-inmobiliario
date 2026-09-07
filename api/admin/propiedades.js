// GET/POST/PUT /api/admin/propiedades — panel de Alejandra. Nunca lo llama el
// sitio público. Protegido con ADMIN_PASSWORD: sin la contraseña correcta en
// el encabezado x-admin-key, no lee ni escribe nada.
const { createClient } = require("@supabase/supabase-js");

const COLUMNAS_ADMIN =
  "id, referencia_publica, id_operativo, estado, ciudad, municipio, zona, colonia, " +
  "desarrollo, tipo_propiedad, operacion, precio_publicado, terreno_m2, construccion_m2, " +
  "recamaras, banos, estacionamientos, antiguedad, amenidades, caracteristicas_especiales, " +
  "disponibilidad, fuente, mercado_codigo, formas_pago_aceptadas, fotos, notas, creado_en";

// El id_operativo/referencia_publica solo se arman solos si la propiedad ya
// trae mercado_codigo + fuente (ver ~/raiz-profunda-curso/ids_operativos.sql).
// El panel solo conoce el nombre del estado, así que aquí se busca el código
// (QRO/PUE/...) correspondiente en tu catálogo — nunca se inventa uno.
async function buscarMercadoCodigo(supabase, nombreEstado) {
  if (!nombreEstado) return null;
  const { data } = await supabase
    .from("catalogo_ubicaciones")
    .select("codigo")
    .ilike("nombre", nombreEstado)
    .maybeSingle();
  return data ? data.codigo : null;
}

function autorizado(req) {
  const clave = process.env.ADMIN_PASSWORD;
  return !!clave && req.headers["x-admin-key"] === clave;
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function listaOVacio(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  return [];
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

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("propiedades")
      .select(COLUMNAS_ADMIN)
      .order("creado_en", { ascending: false })
      .limit(200);
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data || []);
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const mercadoCodigo = await buscarMercadoCodigo(supabase, body.estado);

  const registro = {
    estado: body.estado || null,
    ciudad: body.ciudad || null,
    municipio: body.municipio || null,
    colonia: body.colonia || null,
    desarrollo: body.desarrollo || null,
    tipo_propiedad: body.tipo_propiedad || null,
    operacion: body.operacion || null,
    precio_publicado: numOrNull(body.precio_publicado),
    terreno_m2: numOrNull(body.terreno_m2),
    construccion_m2: numOrNull(body.construccion_m2),
    recamaras: numOrNull(body.recamaras),
    banos: numOrNull(body.banos),
    estacionamientos: numOrNull(body.estacionamientos),
    antiguedad: body.antiguedad || null,
    amenidades: listaOVacio(body.amenidades),
    caracteristicas_especiales: body.caracteristicas_especiales || null,
    disponibilidad: body.disponibilidad || "DISPONIBLE",
    fuente: body.fuente || null,
    mercado_codigo: mercadoCodigo,
    formas_pago_aceptadas: listaOVacio(body.formas_pago_aceptadas),
    fotos: listaOVacio(body.fotos).map((u) => ({ url: u, autorizada: true, origen: "admin" })),
    notas: body.notas || null,
  };

  if (req.method === "POST") {
    const { data, error } = await supabase
      .from("propiedades")
      .insert(registro)
      .select(COLUMNAS_ADMIN)
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  if (req.method === "PUT") {
    const id = (body.id || "").toString();
    if (!id) { res.status(400).json({ error: "Falta el id de la propiedad a editar." }); return; }
    const { data, error } = await supabase
      .from("propiedades")
      .update(registro)
      .eq("id", id)
      .select(COLUMNAS_ADMIN)
      .single();
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.status(200).json(data);
    return;
  }

  res.status(405).json({ error: "método no permitido" });
};
