const test = require("node:test");
const assert = require("node:assert");
const { normalizarVenta, normalizarCita, normalizarCliente } = require("../lib/ventas");

const CLIENTE = "11111111-1111-4111-8111-111111111111";
const PROP = "22222222-2222-4222-8222-222222222222";

test("venta directa calcula la comisión y no guarda colaborador", () => {
  const r = normalizarVenta({ cliente_id: CLIENTE, propiedad_id: PROP, tipo_venta: "directa", monto_operacion: "3,000,000", comision_porcentaje: 3, estado: "cerrada", fecha_cierre: "2026-10-25" });
  assert.ok(!r.error);
  assert.strictEqual(r.datos.comision_total_monto, 90000);
  assert.strictEqual(r.datos.comision_ale_monto, 90000);
  assert.strictEqual(r.datos.comision_colaborador_monto, 0);
  assert.strictEqual(r.datos.colaborador_nombre, null);
});
test("venta en colaboración reparte la comisión y exige colaborador", () => {
  const ok = normalizarVenta({ cliente_id: CLIENTE, tipo_venta: "colaboracion", colaborador_nombre: "Asesor Externo", comision_total_monto: 80000, porcentaje_colaborador: 50 });
  assert.ok(!ok.error);
  assert.deepStrictEqual([ok.datos.comision_colaborador_monto, ok.datos.comision_ale_monto], [40000, 40000]);
  assert.match(normalizarVenta({ cliente_id: CLIENTE, tipo_venta: "colaboracion", comision_total_monto: 1000, porcentaje_colaborador: 50 }).error, /colaborador/);
  assert.match(normalizarVenta({ cliente_id: CLIENTE, tipo_venta: "colaboracion", colaborador_nombre: "X", comision_total_monto: 1000 }).error, /porcentaje/);
});
test("rechaza cliente inválido, estado raro, fecha mala y monto negativo", () => {
  assert.ok(normalizarVenta({ cliente_id: "no" }).error);
  assert.ok(normalizarVenta({ cliente_id: CLIENTE, estado: "vendidisima" }).error);
  assert.ok(normalizarVenta({ cliente_id: CLIENTE, fecha_cierre: "25/10/2026" }).error);
  assert.ok(normalizarVenta({ cliente_id: CLIENTE, monto_operacion: -1 }).error);
});
test("sin datos de comisión no inventa cifras", () => {
  const r = normalizarVenta({ cliente_id: CLIENTE });
  assert.strictEqual(r.datos.comision_total_monto, null);
  assert.strictEqual(r.datos.comision_ale_monto, null);
});
test("cita: valida estado y fecha; parcial solo valida lo que llega", () => {
  assert.ok(normalizarCita({ cliente_id: CLIENTE }).error);
  assert.ok(!normalizarCita({ cliente_id: CLIENTE, propiedad_id: PROP, fecha_hora: "2026-10-26T11:00" }).error);
  assert.ok(normalizarCita({ estado: "volando" }, true).error);
  assert.deepStrictEqual(normalizarCita({ estado: "realizada" }, true).datos, { estado: "realizada" });
});
test("cliente: solo campos permitidos y etapas válidas", () => {
  assert.ok(normalizarCliente({ etapa: "INVENTADA" }).error);
  const r = normalizarCliente({ etapa: "NEGOCIACION", prioridad: "alta", notas: "n", telefono: "no se toca", origen: "tampoco" });
  assert.deepStrictEqual(Object.keys(r.datos).sort(), ["etapa", "notas", "prioridad"]);
});
