const test = require("node:test");
const assert = require("node:assert");
const { tapar, verificar, cifras, responder, PASAR_A_ALE, resumenPropiedades } = require("../lib/chat");

const props = [{ referencia_publica: "QRO-9001", tipo_propiedad: "Casa", operacion: "Venta", colonia: "Los Pinos",
  municipio: "Querétaro", estado: "Querétaro", precio_publicado: 2850000, recamaras: 3, banos: 2,
  formas_pago_aceptadas: ["Infonavit", "Crédito bancario"] }];
const permitidas = cifras(resumenPropiedades(props));

test("tapa teléfonos y correos pero no precios ni horas", () => {
  const r = tapar("Soy Mario 442 123 4567, mario@x.com, casa $2,850,000, de 10 a 18 h");
  assert.match(r.texto, /\[TEL_\d\]/); assert.match(r.texto, /\[CORREO_\d\]/);
  assert.ok(r.texto.includes("$2,850,000")); assert.ok(r.texto.includes("10 a 18"));
  assert.ok(!r.texto.includes("4567"));
});
test("verificador acepta una buena respuesta", () => {
  assert.deepStrictEqual(verificar("La casa de Los Pinos cuesta $2,850,000 y acepta Infonavit. ¿Qué presupuesto tiene?", permitidas), []);
});
test("verificador rechaza cifra inventada, IA, ficha, dos preguntas y exceso de palabras", () => {
  assert.ok(verificar("Cuesta $9,999,999. ¿Le interesa?", permitidas).some((f) => /cifra/.test(f)));
  assert.ok(verificar("Soy un bot. ¿Le ayudo?", permitidas).some((f) => /IA\/bot/.test(f)));
  assert.ok(verificar("Según la ficha, sí. ¿Le ayudo?", permitidas).some((f) => /ficha/.test(f)));
  assert.ok(verificar("¿Qué día y cuál presupuesto?", permitidas).some((f) => /doble/.test(f)));
  assert.ok(verificar("¿Uno? ¿Dos?", permitidas).some((f) => /preguntas/.test(f)));
  assert.ok(verificar("palabra ".repeat(61), permitidas).some((f) => /palabras/.test(f)));
});
test("responder: corrige al reintentar y no manda al modelo el teléfono", async () => {
  let n = 0; const vistos = [];
  const llamarModelo = async (sis, msgs) => {
    n++; vistos.push(JSON.stringify(msgs));
    return n === 1
      ? '{"respuesta":"Cuesta $1,111,111. ¿Le interesa?","necesita_ale":false,"motivo":""}'
      : '{"respuesta":"La casa de Los Pinos cuesta $2,850,000. ¿Con qué forma de pago piensa comprarla?","necesita_ale":false,"motivo":""}';
  };
  const r = await responder({ mensaje: "Mi cel es 442 123 4567, ¿cuánto cuesta?", props, hoy: "domingo", llamarModelo });
  assert.strictEqual(n, 2); assert.ok(r.verificada); assert.ok(!vistos.join().includes("4567"));
});
test("responder: si nunca verifica, pasa a Ale y NO manda el texto dudoso", async () => {
  const llamarModelo = async () => '{"respuesta":"Soy un bot y cuesta $5,000,000. ¿Y cuánto?","necesita_ale":false}';
  const r = await responder({ mensaje: "hola", props, hoy: "x", llamarModelo });
  assert.strictEqual(r.respuesta, PASAR_A_ALE); assert.strictEqual(r.verificada, false); assert.ok(r.necesita_ale);
});
test("responder: JSON inválido también pasa a Ale", async () => {
  const r = await responder({ mensaje: "hola", props, hoy: "x", llamarModelo: async () => "no es json" });
  assert.strictEqual(r.respuesta, PASAR_A_ALE);
});
test("responder: pasa quiere_cita cuando el visitante quiere visitar", async () => {
  const llamarModelo = async () => '{"respuesta":"Con gusto. Elija propiedad, día y hora en el formulario y Ale se lo confirma.","necesita_ale":false,"quiere_cita":true}';
  const r = await responder({ mensaje: "quiero ver la casa", props, hoy: "x", llamarModelo });
  assert.ok(r.verificada); assert.strictEqual(r.quiere_cita, true);
});
