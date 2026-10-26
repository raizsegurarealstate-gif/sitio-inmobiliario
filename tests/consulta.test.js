const test = require("node:test");
const assert = require("node:assert");
const { normalizar } = require("../lib/consulta");

test("exige teléfono de 10 dígitos", () => {
  assert.ok(normalizar({ telefono: "123" }).error);
  assert.strictEqual(normalizar({ telefono: "442 123 4567" }).datos.telefono, "4421234567");
});
test("el formato viejo (nombre, teléfono, mensaje) sigue funcionando sin aviso", () => {
  const r = normalizar({ nombre: "Ana", telefono: "4421234567", mensaje: "hola" });
  assert.ok(!r.error); assert.strictEqual(r.datos.aviso_aceptado, false);
});
test("correo, tipo o perfil sin aviso de privacidad se rechazan", () => {
  assert.match(normalizar({ telefono: "4421234567", correo: "a@b.co" }).error, /aviso/);
  assert.match(normalizar({ telefono: "4421234567", tipo_operacion: "comprar" }).error, /aviso/);
  assert.match(normalizar({ telefono: "4421234567", perfil: { zona: "x" } }).error, /aviso/);
});
test("con aviso acepta correo, tipo y perfil, y rechaza valores inválidos", () => {
  const ok = normalizar({ telefono: "4421234567", correo: "ANA@Correo.com", tipo_operacion: "Construir", aviso_aceptado: true,
    perfil: { "¿Tiene terreno?": "Sí", presupuesto_max: "2,500,000", otro: { x: 1 } } });
  assert.ok(!ok.error); assert.strictEqual(ok.datos.correo, "ana@correo.com");
  assert.strictEqual(ok.datos.tipo_operacion, "construir"); assert.strictEqual(ok.datos.presupuesto_max, 2500000);
  assert.ok(!("otro" in ok.datos.perfil));
  assert.ok(normalizar({ telefono: "4421234567", correo: "no-es-correo", aviso_aceptado: true }).error);
  assert.ok(normalizar({ telefono: "4421234567", tipo_operacion: "robar", aviso_aceptado: true }).error);
});
test("aviso solo cuenta si es exactamente true", () => {
  assert.ok(normalizar({ telefono: "4421234567", correo: "a@b.co", aviso_aceptado: "true" }).error);
});
test("recorta textos largos y limita el perfil", () => {
  const perfil = {}; for (let i = 0; i < 50; i++) perfil["k" + i] = "x".repeat(500);
  const r = normalizar({ telefono: "4421234567", mensaje: "m".repeat(5000), perfil, aviso_aceptado: true });
  assert.strictEqual(r.datos.mensaje.length, 1000); assert.strictEqual(Object.keys(r.datos.perfil).length, 30);
  assert.strictEqual(r.datos.perfil.k0.length, 300);
});
