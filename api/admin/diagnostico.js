// GET /api/admin/diagnostico — herramienta temporal para revisar si las
// variables de entorno llegaron limpias. Nunca muestra el valor completo de
// las secretas, solo su longitud y si hay caracteres fuera de lo normal.
// Bórrala cuando ya no la necesites.
function autorizado(req) {
  const clave = process.env.ADMIN_PASSWORD;
  return !!clave && req.headers["x-admin-key"] === clave;
}

function revisar(nombre, valor) {
  if (valor === undefined) return { nombre: nombre, estado: "NO EXISTE" };
  const raros = [];
  for (let i = 0; i < valor.length; i++) {
    const codigo = valor.charCodeAt(i);
    const esNormal = (codigo >= 32 && codigo <= 126);
    if (!esNormal) raros.push({ posicion: i, codigo: codigo });
  }
  return {
    nombre: nombre,
    longitud: valor.length,
    primeros_3: valor.slice(0, 3),
    ultimos_3: valor.slice(-3),
    caracteres_raros: raros,
  };
}

module.exports = async (req, res) => {
  if (!autorizado(req)) {
    res.status(401).json({ error: "Contraseña incorrecta o faltante." });
    return;
  }
  res.status(200).json({
    SUPABASE_URL: revisar("SUPABASE_URL", process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: revisar("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
};
