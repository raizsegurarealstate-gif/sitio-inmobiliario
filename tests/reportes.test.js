const test = require("node:test");
const assert = require("node:assert");
const { calcularComision, csv, celda, reporte, resumenVentas, enRango } = require("../lib/reportes");

test("comisión directa: todo es de Ale", () => {
  const r = calcularComision({ monto_operacion: 3000000, comision_porcentaje: 3, tipo_venta: "directa" });
  assert.deepStrictEqual([r.total, r.colaborador, r.ale], [90000, 0, 90000]);
});
test("comisión en colaboración compartida 50/50 y 60/40", () => {
  let r = calcularComision({ comision_total_monto: 90000, tipo_venta: "colaboracion", porcentaje_colaborador: 50 });
  assert.deepStrictEqual([r.total, r.colaborador, r.ale], [90000, 45000, 45000]);
  r = calcularComision({ monto_operacion: 2500000, comision_porcentaje: 4, tipo_venta: "colaboracion", porcentaje_colaborador: 40 });
  assert.deepStrictEqual([r.total, r.colaborador, r.ale], [100000, 40000, 60000]);
});
test("colaboración sin porcentaje o con valores inválidos da error; sin datos no inventa", () => {
  assert.ok(calcularComision({ comision_total_monto: 1000, tipo_venta: "colaboracion" }).error);
  assert.ok(calcularComision({ comision_total_monto: 1000, tipo_venta: "colaboracion", porcentaje_colaborador: 150 }).error);
  assert.ok(calcularComision({ comision_total_monto: -5, tipo_venta: "directa" }).error);
  assert.ok(calcularComision({ monto_operacion: 100, comision_porcentaje: 150, tipo_venta: "directa" }).error);
  const vacio = calcularComision({ tipo_venta: "directa" });
  assert.strictEqual(vacio.total, null);
  assert.strictEqual(vacio.ale, null);
});
test("CSV: BOM, comillas y protección contra fórmulas", () => {
  assert.strictEqual(celda('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.strictEqual(celda("-5"), "-5");
  assert.strictEqual(celda("a,b"), '"a,b"');
  const out = csv([{ k: "a", t: "A" }, { k: "b", t: "B" }], [{ a: "x", b: "1,5" }]);
  assert.ok(out.startsWith("﻿A,B\r\n"));
  assert.ok(out.includes('x,"1,5"'));
});
test("rango de fechas", () => {
  assert.ok(enRango("2026-10-15T12:00:00Z", "2026-10-01", "2026-10-31"));
  assert.ok(enRango("2026-11-01T00:00:00Z", "2026-10-01", "2026-10-31")); // 31-oct 18:00 en México: aún es octubre
  assert.ok(!enRango("2026-11-01T07:00:00Z", "2026-10-01", "2026-10-31")); // 1-nov 01:00 en México
  assert.ok(enRango("2026-11-01", null, null));
});
test("reporte de ventas separa directas, colaboración y comisiones", () => {
  const ventas = [
    { estado: "cerrada", tipo_venta: "directa", monto_operacion: 3000000, comision_total_monto: 90000, comision_ale_monto: 90000, comision_colaborador_monto: 0, fecha_cierre: "2026-10-10" },
    { estado: "cerrada", tipo_venta: "colaboracion", monto_operacion: 2000000, comision_total_monto: 80000, comision_ale_monto: 40000, comision_colaborador_monto: 40000, fecha_cierre: "2026-10-12" },
    { estado: "en_proceso", tipo_venta: "directa", fecha_cierre: null, creado_en: "2026-10-20" },
    { estado: "cancelada", tipo_venta: "directa", fecha_cierre: "2026-10-13" },
  ];
  const r = resumenVentas(ventas);
  assert.deepStrictEqual([r.cerradas, r.directas, r.colaboracion, r.comision_total, r.comision_ale, r.comision_colaboradores], [2, 1, 1, 170000, 130000, 40000]);
  const rep = reporte("ventas", { ventas }, "2026-10-01", "2026-10-31");
  assert.strictEqual(rep.filas.length, 4);
  assert.strictEqual(rep.resumen.find((x) => x.t === "Comisión de Ale").v, 130000);
});
test("reporte de clientes cuenta por interés, pago y plazo", () => {
  const clientes = [
    { fecha_primer_contacto: "2026-10-05", tipo_operacion: "comprar", forma_pago: "Infonavit", plazo: "Lo antes posible", etapa: "NUEVO" },
    { fecha_primer_contacto: "2026-10-06", tipo_operacion: "construir", forma_pago: null, plazo: null, etapa: "NUEVO" },
  ];
  const rep = reporte("clientes", { clientes }, "2026-10-01", "2026-10-31");
  assert.strictEqual(rep.resumen[0].v, 2);
  assert.ok(rep.resumen.some((x) => x.t === "Interés: construir" && x.v === 1));
  assert.ok(rep.resumen.some((x) => x.t === "Pago: (sin dato)" && x.v === 1));
});
const { fechaMx } = require("../lib/reportes");
test("fechas en hora de México: un contacto de la noche no se pasa al día siguiente", () => {
  assert.strictEqual(fechaMx("2026-10-27T03:30:00Z"), "2026-10-26");
  assert.strictEqual(fechaMx("2026-10-27T07:00:00Z"), "2026-10-27");
  assert.strictEqual(fechaMx("2026-10-24"), "2026-10-24");
  assert.ok(enRango("2026-10-27T03:30:00Z", "2026-10-26", "2026-10-26"));
});
