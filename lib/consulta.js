// Validación y limpieza de lo que manda el sitio a /api/consulta (sin red: se prueba con `node --test`).
// Nada se inventa: lo que no viene, queda vacío.

const TIPOS = ["comprar", "construir", "invertir"];
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function texto(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

function numero(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[,\s$]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// perfil: objeto plano con respuestas del perfilador (solo texto/números/booleanos, tamaño acotado)
function limpiarPerfil(p) {
  const out = {};
  if (!p || typeof p !== "object" || Array.isArray(p)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(p)) {
    if (n >= 30) break;
    const clave = texto(k, 60).replace(/[^\w áéíóúñÁÉÍÓÚÑ.-]/g, "");
    if (!clave) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[clave] = v;
    else if (typeof v === "boolean") out[clave] = v;
    else if (v != null && typeof v !== "object") out[clave] = texto(v, 300);
    else continue;
    n++;
  }
  return out;
}

function normalizar(body) {
  const b = body && typeof body === "object" ? body : {};
  const telefono = String(b.telefono || "").replace(/\D/g, "");
  if (telefono.length !== 10) return { error: "Falta un teléfono válido de 10 dígitos." };

  const correo = texto(b.correo, 200).toLowerCase();
  if (correo && !CORREO.test(correo)) return { error: "El correo no parece válido." };

  const tipo = texto(b.tipo_operacion, 20).toLowerCase();
  if (tipo && !TIPOS.includes(tipo)) return { error: "Tipo de interés no válido." };

  const perfil = limpiarPerfil(b.perfil);
  const aviso = b.aviso_aceptado === true;
  // datos nuevos (correo, tipo o perfil) solo se guardan si aceptó el aviso de privacidad
  if ((correo || tipo || Object.keys(perfil).length) && !aviso) {
    return { error: "Hay que aceptar el aviso de privacidad para continuar." };
  }

  const presupuesto = numero(b.presupuesto_max != null ? b.presupuesto_max : perfil.presupuesto_max);
  return {
    datos: {
      nombre: texto(b.nombre, 200) || null,
      telefono,
      correo: correo || null,
      mensaje: texto(b.mensaje, 1000) || null,
      referencia_propiedad: texto(b.referencia_propiedad, 100) || null,
      forma_pago: texto(b.forma_pago || perfil.forma_pago, 100) || null,
      plazo: texto(b.plazo || perfil.plazo, 100) || null,
      tipo_operacion: tipo || null,
      tipo_propiedad: texto(b.tipo_propiedad || perfil.tipo_propiedad, 100) || null,
      zona: texto(b.zona || perfil.zona, 200) || null,
      presupuesto_max: presupuesto,
      perfil: Object.keys(perfil).length ? perfil : null,
      aviso_aceptado: aviso,
      fecha_cita: texto(b.fecha_cita, 10) || null,
      hora_cita: texto(b.hora_cita, 5) || null,
    },
  };
}

function siguienteAccion(tipo) {
  if (tipo === "construir") return "Contactar: quiere construir su casa a la medida — revisar perfil.";
  if (tipo === "invertir") return "Contactar: tiene capital para invertir — revisar perfil.";
  if (tipo === "comprar") return "Contactar: quiere comprar — revisar perfil y mandar opciones.";
  return "Volvió a preguntar desde el sitio web — revisar.";
}

module.exports = { normalizar, limpiarPerfil, siguienteAccion, TIPOS };
