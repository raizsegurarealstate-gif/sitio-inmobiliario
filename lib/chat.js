// Lógica pura del chat del sitio (sin red): se puede probar con `node --test`.
// Reglas de Ale: máx. 60 palabras, trato de usted, UNA sola pregunta, no inventar datos,
// no decir 'ficha' ni mencionar IA/bot, cifras solo de las propiedades.

const MAX_PALABRAS = 60;

const RE_CORREO = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const RE_TEL = /(?<![\w$,.])\+?\(?\d[\d ()-]{5,}\d(?!\w|,\d)/g;

function tapar(texto) {
  const mapa = {};
  let n = 0;
  let t = String(texto || "").replace(RE_CORREO, (m) => {
    const k = `[CORREO_${++n}]`;
    mapa[k] = m;
    return k;
  });
  t = t.replace(RE_TEL, (m) => {
    if ((m.match(/\d/g) || []).length < 7) return m;
    const k = `[TEL_${++n}]`;
    mapa[k] = m;
    return k;
  });
  return { texto: t, mapa };
}

function cifras(texto) {
  const out = new Set();
  const m = String(texto || "").match(/\$\s?[\d,.]+|\b\d[\d,.]{4,}\b/g) || [];
  for (const x of m) {
    const d = x.replace(/\D/g, "");
    if (d) out.add(d);
  }
  return out;
}

const PROHIBIDAS = [
  [/\bfichas?\b/i, "menciona la 'ficha'"],
  [/inteligencia artificial|\bIA\b|\bbot\b|chatbot|modelo de lenguaje|generado por/i, "menciona IA/bot"],
  [/https?:\/\/|www\./i, "trae una liga"],
  [/espero que (se )?encuentre/i, "frase vacía"],
  [/comisi[oó]n|porcentaje compartido|colaboraci[oó]n entre asesores|id operativo|url original|notas internas/i, "revela información interna (manual §10)"],
  [/\b(tú|tienes|puedes|quieres|necesitas|contigo)\b/i, "parece tuteo"],
];

function verificar(respuesta, cifrasPermitidas) {
  const fallas = [];
  const r = String(respuesta || "").trim();
  if (!r) return ["vacía"];
  const palabras = (r.match(/\S+/g) || []).length;
  if (palabras > MAX_PALABRAS) fallas.push(`${palabras} palabras (máx. ${MAX_PALABRAS})`);
  const preguntas = (r.match(/¿/g) || []).length;
  if (preguntas > 1) fallas.push(`${preguntas} preguntas (debe ser una)`);
  for (const q of r.match(/¿[^?]*\?/g) || []) {
    if (/\by\s+(cuál|cuáles|qué|cuándo|cómo|cuánto|dónde|quién)\b/i.test(q)) {
      fallas.push("posible doble pregunta");
      break;
    }
  }
  for (const [re, motivo] of PROHIBIDAS) if (re.test(r)) fallas.push(motivo);
  for (const c of cifras(r)) {
    if (!cifrasPermitidas.has(c)) fallas.push(`cifra ${c} no está en las propiedades`);
  }
  return fallas;
}

function resumenPropiedades(props) {
  return (props || [])
    .map((p) => {
      const l = [
        `Referencia ${p.referencia_publica}`,
        [p.tipo_propiedad, p.operacion].filter(Boolean).join(" en "),
        [p.colonia || p.desarrollo, p.municipio, p.estado].filter(Boolean).join(", "),
        p.precio_publicado ? `Precio ${p.precio_publicado}` : "Precio a consultar",
        p.recamaras != null ? `${p.recamaras} recámaras` : "",
        p.banos != null ? `${p.banos} baños` : "",
        p.estacionamientos != null ? `${p.estacionamientos} estacionamientos` : "",
        p.construccion_m2 ? `${p.construccion_m2} m2 construcción` : "",
        p.terreno_m2 ? `${p.terreno_m2} m2 terreno` : "",
        Array.isArray(p.formas_pago_aceptadas) && p.formas_pago_aceptadas.length
          ? `Formas de pago: ${p.formas_pago_aceptadas.join(", ")}`
          : "",
      ];
      return l.filter(Boolean).join(" · ");
    })
    .join("\n");
}

function sistema(props, hoy) {
  return (
    `Eres el asistente de Raíz Segura Real Estate (asesora: Alejandra García). Hoy es ${hoy}.\n` +
    "Respondes a visitantes del sitio web que quieren más detalles de propiedades.\n" +
    "REGLAS: español mexicano, trato de usted, familiar y cercano. Máximo 60 palabras. " +
    "UNA sola pregunta, al final (o ninguna si pasas el caso a Ale). Usa SOLO los datos de las propiedades de abajo; " +
    "nunca inventes cifras, horarios, descuentos, gastos ni características. " +
    "No digas 'ficha', ni que eres IA o bot, ni pongas ligas. " +
    "Nunca reveles la comisión ni condiciones entre asesores, el teléfono o contacto de otros asesores, ni si una propiedad viene de otro asesor; " +
    "nunca presentes un precio estimado como oficial; solo el precio publicado. " +
    "Si preguntan algo que no está en los datos (descuento, escrituración, mantenimiento, disponibilidad de visita, " +
    "o cualquier otra cosa), responde que se lo confirma Ale y marca necesita_ale=true. " +
    "Si el visitante muestra interés real o pide hablar con alguien, también necesita_ale=true. " +
    "Objetivo: ayudar y, cuando corresponda, pedir presupuesto y forma de pago.\n" +
    "Si el visitante quiere visitar una propiedad o agendar una cita, dígale en una frase que puede elegir " +
    "propiedad, día y hora en el formulario que le aparece, marca quiere_cita=true y NO prometas que la cita " +
    "queda confirmada: Ale la confirma. No inventes horarios disponibles.\n" +
    'Devuelve SOLO JSON: {"respuesta":"...","necesita_ale":true|false,"quiere_cita":true|false,"motivo":"..."}\n\n' +
    "PROPIEDADES DISPONIBLES:\n" + resumenPropiedades(props)
  );
}

function leerJson(texto) {
  const m = String(texto || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (typeof o.respuesta !== "string") return null;
    return { respuesta: o.respuesta.trim(), necesita_ale: !!o.necesita_ale, quiere_cita: !!o.quiere_cita, motivo: String(o.motivo || "").slice(0, 200) };
  } catch {
    return null;
  }
}

const PASAR_A_ALE =
  "Con gusto. Eso se lo confirma Ale directamente. ¿Me comparte su nombre y teléfono para que le escriba?";

// llamarModelo(sistema, mensajes) -> texto. Se inyecta para poder probar sin red.
async function responder({ mensaje, historial, props, hoy, llamarModelo }) {
  const permitidas = cifras(resumenPropiedades(props));
  // el teléfono o correo que escriba el visitante no se manda al modelo
  const msgs = [];
  const mapa = {};
  for (const h of (historial || []).slice(-6)) {
    const t = tapar(String(h.texto || "").slice(0, 500));
    Object.assign(mapa, t.mapa);
    msgs.push({ role: h.rol === "asistente" ? "assistant" : "user", content: t.texto });
  }
  const actual = tapar(String(mensaje || "").slice(0, 500));
  Object.assign(mapa, actual.mapa);
  msgs.push({ role: "user", content: actual.texto });

  let ultimo = null;
  let fallas = [];
  for (let intento = 0; intento < 2; intento++) {
    const extra = intento === 0 ? "" : `\n\nTu respuesta anterior falló: ${fallas.join("; ")}. Corrígela.`;
    const crudo = await llamarModelo(sistema(props, hoy) + extra, msgs);
    ultimo = leerJson(crudo);
    if (!ultimo) {
      fallas = ["no devolvió JSON válido"];
      continue;
    }
    fallas = verificar(ultimo.respuesta, permitidas);
    if (!fallas.length) return { ...ultimo, verificada: true };
  }
  // no se pudo verificar: nunca se manda un texto dudoso al visitante
  return { respuesta: PASAR_A_ALE, necesita_ale: true, quiere_cita: false, motivo: "No se pudo verificar la respuesta: " + fallas.join("; "), verificada: false };
}

module.exports = { tapar, cifras, verificar, resumenPropiedades, leerJson, responder, PASAR_A_ALE };
