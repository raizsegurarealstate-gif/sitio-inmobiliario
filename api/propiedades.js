// GET /api/propiedades — lee propiedades DISPONIBLES de Supabase con la llave de
// servicio (nunca expuesta al navegador) y regresa solo lo que un cliente puede ver.
// Nunca manda url_original, notas, asesor_id, clientes_mostrados ni fotos sin
// autorización — eso es interno, per SISTEMA_INMOBILIARIO_MAESTRO.md sección 10.
const { createClient } = require("@supabase/supabase-js");

const ESTATUS_PUBLICOS = ["DISPONIBLE"];

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "método no permitido" });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !llave) {
    res.status(500).json({ error: "faltan las variables de entorno de Supabase" });
    return;
  }

  const supabase = createClient(url, llave);
  const { data, error } = await supabase
    .from("propiedades")
    .select(
      "referencia_publica, ciudad, municipio, zona, colonia, desarrollo, " +
        "tipo_propiedad, operacion, precio_publicado, terreno_m2, construccion_m2, " +
        "recamaras, banos, estacionamientos, antiguedad, amenidades, " +
        "caracteristicas_especiales, fotos"
    )
    .in("disponibilidad", ESTATUS_PUBLICOS)
    .order("creado_en", { ascending: false })
    .limit(60);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const limpio = (data || [])
    .filter((p) => p.referencia_publica)
    .map((p) => ({
      ...p,
      fotos: (p.fotos || [])
        .filter((f) => f && f.autorizada && f.url)
        .map((f) => f.url),
    }));

  res.setHeader("Cache-Control", "s-maxage=90, stale-while-revalidate=300");
  res.status(200).json(limpio);
};
