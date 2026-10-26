// Cálculos y reportes del CRM (sin red; se prueban con `node --test`).
// Regla de Ale: nada se inventa. La comisión solo se calcula con lo que ella captura.

function num(v) {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[,\s$]/g, ""));
  return Number.isFinite(n) ? n : null;
}
const redondea = (n) => Math.round(n * 100) / 100;

// total: se captura el monto de la comisión, o el % sobre la operación.
// directa: todo es de Ale. colaboración: el colaborador se lleva `porcentaje_colaborador` % de la comisión total.
function calcularComision({ monto_operacion, comision_porcentaje, comision_total_monto, tipo_venta, porcentaje_colaborador }) {
  const monto = num(monto_operacion);
  const pct = num(comision_porcentaje);
  let total = num(comision_total_monto);
  if (total == null && pct != null && monto != null) total = redondea((monto * pct) / 100);
  if (pct != null && (pct < 0 || pct > 100)) return { error: "El porcentaje de comisión debe estar entre 0 y 100." };
  if (total == null) return { error: null, total: null, colaborador: null, ale: null, porcentaje_colaborador: null };
  if (total < 0) return { error: "La comisión no puede ser negativa." };
  let pc = 0;
  if (tipo_venta === "colaboracion") {
    pc = num(porcentaje_colaborador);
    if (pc == null) return { error: "En una colaboración hay que indicar qué porcentaje de la comisión se lleva el colaborador." };
    if (pc < 0 || pc > 100) return { error: "El porcentaje del colaborador debe estar entre 0 y 100." };
  }
  const colaborador = redondea((total * pc) / 100);
  return { error: null, total, colaborador, ale: redondea(total - colaborador), porcentaje_colaborador: pc };
}

// ---- CSV (Excel en español: BOM + comillas) ----
function celda(v) {
  if (v == null) return "";
  let t = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = "'" + t; // evita fórmulas en Excel
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
function csv(columnas, filas) {
  const cab = columnas.map((c) => celda(c.t)).join(",");
  const cuerpo = filas.map((f) => columnas.map((c) => celda(f[c.k])).join(","));
  return "﻿" + [cab, ...cuerpo].join("\r\n") + "\r\n";
}

function enRango(iso, desde, hasta) {
  if (!iso) return !desde && !hasta;
  const d = String(iso).slice(0, 10);
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}
function contar(filas, campo, vacio = "(sin dato)") {
  const m = {};
  for (const f of filas) {
    const k = f[campo] || vacio;
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ clave: k, total: n }));
}
const suma = (filas, campo) => redondea(filas.reduce((s, f) => s + (Number(f[campo]) || 0), 0));

function resumenVentas(ventas) {
  const cerradas = ventas.filter((v) => v.estado === "cerrada");
  const directas = cerradas.filter((v) => v.tipo_venta === "directa");
  const colab = cerradas.filter((v) => v.tipo_venta === "colaboracion");
  return {
    cerradas: cerradas.length, directas: directas.length, colaboracion: colab.length,
    monto_operaciones: suma(cerradas, "monto_operacion"),
    comision_total: suma(cerradas, "comision_total_monto"),
    comision_ale: suma(cerradas, "comision_ale_monto"),
    comision_colaboradores: suma(cerradas, "comision_colaborador_monto"),
    en_proceso: ventas.filter((v) => v.estado === "en_proceso").length,
    canceladas: ventas.filter((v) => v.estado === "cancelada").length,
  };
}

const COLUMNAS = {
  clientes: [
    { k: "fecha_primer_contacto", t: "Fecha de contacto" }, { k: "nombre", t: "Nombre" }, { k: "telefono", t: "Teléfono" },
    { k: "correo", t: "Correo" }, { k: "tipo_operacion", t: "Interés" }, { k: "anuncio_origen", t: "Clave de propiedad" },
    { k: "forma_pago", t: "Forma de pago" }, { k: "plazo", t: "Plazo" }, { k: "presupuesto_max", t: "Presupuesto máx." },
    { k: "zona", t: "Zona" }, { k: "etapa", t: "Etapa" }, { k: "prioridad", t: "Prioridad" }, { k: "origen", t: "Origen" },
    { k: "siguiente_accion", t: "Siguiente acción" }, { k: "notas", t: "Notas" },
  ],
  citas: [
    { k: "fecha_hora", t: "Fecha y hora" }, { k: "estado", t: "Estado" }, { k: "cliente_nombre", t: "Cliente" },
    { k: "cliente_telefono", t: "Teléfono" }, { k: "propiedad_clave", t: "Clave de propiedad" }, { k: "notas", t: "Notas" },
  ],
  ventas: [
    { k: "fecha_cierre", t: "Fecha de cierre" }, { k: "estado", t: "Estado" }, { k: "tipo_operacion", t: "Operación" },
    { k: "cliente_nombre", t: "Cliente" }, { k: "propiedad_clave", t: "Clave de propiedad" }, { k: "monto_operacion", t: "Monto" },
    { k: "tipo_venta", t: "Tipo de venta" }, { k: "colaborador", t: "Colaborador" }, { k: "comision_total_monto", t: "Comisión total" },
    { k: "porcentaje_colaborador", t: "% colaborador" }, { k: "comision_colaborador_monto", t: "Comisión colaborador" },
    { k: "comision_ale_monto", t: "Comisión Ale" }, { k: "notas", t: "Notas" },
  ],
};

// tipo: clientes | citas | ventas | embudo
function reporte(tipo, { clientes = [], citas = [], ventas = [] }, desde, hasta) {
  if (tipo === "clientes") {
    const f = clientes.filter((c) => enRango(c.fecha_primer_contacto, desde, hasta));
    return {
      titulo: "Clientes", columnas: COLUMNAS.clientes, filas: f,
      resumen: [{ t: "Clientes", v: f.length },
        ...contar(f, "tipo_operacion").map((x) => ({ t: "Interés: " + x.clave, v: x.total })),
        ...contar(f, "forma_pago").map((x) => ({ t: "Pago: " + x.clave, v: x.total })),
        ...contar(f, "plazo").map((x) => ({ t: "Plazo: " + x.clave, v: x.total }))],
    };
  }
  if (tipo === "citas") {
    const f = citas.filter((c) => enRango(c.fecha_hora, desde, hasta));
    return {
      titulo: "Citas", columnas: COLUMNAS.citas, filas: f,
      resumen: [{ t: "Citas", v: f.length }, ...contar(f, "estado").map((x) => ({ t: "Estado: " + x.clave, v: x.total }))],
    };
  }
  if (tipo === "ventas") {
    const f = ventas.filter((v) => enRango(v.fecha_cierre || v.creado_en, desde, hasta));
    const r = resumenVentas(f);
    return {
      titulo: "Ventas y comisiones", columnas: COLUMNAS.ventas, filas: f,
      resumen: [{ t: "Ventas cerradas", v: r.cerradas }, { t: "Directas", v: r.directas }, { t: "En colaboración", v: r.colaboracion },
        { t: "Monto de operaciones", v: r.monto_operaciones, dinero: true }, { t: "Comisión total", v: r.comision_total, dinero: true },
        { t: "Comisión de Ale", v: r.comision_ale, dinero: true }, { t: "Comisión de colaboradores", v: r.comision_colaboradores, dinero: true },
        { t: "En proceso", v: r.en_proceso }, { t: "Canceladas", v: r.canceladas }],
    };
  }
  if (tipo === "embudo") {
    const f = clientes.filter((c) => enRango(c.fecha_primer_contacto, desde, hasta));
    const filas = contar(f, "etapa").map((x) => ({ etapa: x.clave, total: x.total }));
    return {
      titulo: "Embudo por etapa", columnas: [{ k: "etapa", t: "Etapa" }, { k: "total", t: "Clientes" }], filas,
      resumen: [{ t: "Clientes", v: f.length }, { t: "Citas", v: citas.length }, { t: "Ventas cerradas", v: ventas.filter((v) => v.estado === "cerrada").length }],
    };
  }
  return { error: "Tipo de reporte desconocido." };
}

const API = { calcularComision, csv, celda, enRango, contar, resumenVentas, reporte, num };
// Se usa igual en el servidor (require) y en el panel del navegador (window.Reportes).
if (typeof module !== "undefined" && module.exports) module.exports = API;
else if (typeof window !== "undefined") window.Reportes = API;
