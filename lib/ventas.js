// Validación de ventas y citas que captura Ale en el panel (sin red; se prueba con `node --test`).
const { calcularComision, num } = require("./reportes");

const OPERACIONES = ["venta", "renta", "construccion", "inversion"];
const ESTADOS_VENTA = ["en_proceso", "cerrada", "cancelada"];
const ESTADOS_CITA = ["agendada", "confirmada", "realizada", "cancelada"];
const ETAPAS = ["NUEVO", "LISTO_PARA_BUSCAR", "CONSULTANDO_BASE", "BUSQUEDA_EXTERNA", "OPCIONES_EN_VALIDACION", "OPCIONES_LISTAS",
  "OPCIONES_ENVIADAS", "CLIENTE_INTERESADO", "COORDINANDO_VISITA", "VISITA_AGENDADA", "VISITA_REALIZADA", "NEGOCIACION", "OFERTA",
  "CIERRE", "BUSQUEDA_ACTIVA", "PAUSADO", "SIN_RESPUESTA", "CERRADO"];
const PRIORIDADES = ["alta", "media", "nutricion", "baja"];

const t = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const uuid = (v) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || "")) ? String(v) : null);
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null);

// parcial=true: para actualizar (solo valida lo que viene)
function normalizarVenta(b, parcial = false) {
  b = b || {};
  const out = {};
  if (!parcial || b.cliente_id !== undefined) {
    out.cliente_id = uuid(b.cliente_id);
    if (!out.cliente_id) return { error: "Falta el cliente." };
  }
  if (b.propiedad_id !== undefined) out.propiedad_id = uuid(b.propiedad_id);
  if (b.cita_id !== undefined) out.cita_id = uuid(b.cita_id);
  if (b.tipo_operacion !== undefined) {
    if (!OPERACIONES.includes(b.tipo_operacion)) return { error: "Tipo de operación no válido." };
    out.tipo_operacion = b.tipo_operacion;
  }
  if (b.estado !== undefined) {
    if (!ESTADOS_VENTA.includes(b.estado)) return { error: "Estado de venta no válido." };
    out.estado = b.estado;
  }
  if (b.fecha_cierre !== undefined) {
    if (b.fecha_cierre && !fecha(b.fecha_cierre)) return { error: "La fecha de cierre debe ser AAAA-MM-DD." };
    out.fecha_cierre = fecha(b.fecha_cierre);
  }
  if (b.monto_operacion !== undefined) {
    const m = num(b.monto_operacion);
    if (m != null && m < 0) return { error: "El monto no puede ser negativo." };
    out.monto_operacion = m;
  }
  if (b.notas !== undefined) out.notas = t(b.notas, 1000) || null;

  const tipo = b.tipo_venta === undefined && parcial ? undefined : (b.tipo_venta || "directa");
  if (tipo !== undefined) {
    if (!["directa", "colaboracion"].includes(tipo)) return { error: "El tipo de venta debe ser directa o colaboración." };
    out.tipo_venta = tipo;
    if (tipo === "colaboracion") {
      out.asesor_colaborador_id = uuid(b.asesor_colaborador_id);
      out.colaborador_nombre = t(b.colaborador_nombre, 200) || null;
      if (!out.asesor_colaborador_id && !out.colaborador_nombre) return { error: "En una colaboración indique quién es el colaborador." };
    } else {
      out.asesor_colaborador_id = null;
      out.colaborador_nombre = null;
    }
    const c = calcularComision({ monto_operacion: b.monto_operacion, comision_porcentaje: b.comision_porcentaje,
      comision_total_monto: b.comision_total_monto, tipo_venta: tipo, porcentaje_colaborador: b.porcentaje_colaborador });
    if (c.error) return { error: c.error };
    out.comision_porcentaje = num(b.comision_porcentaje);
    out.comision_total_monto = c.total;
    out.porcentaje_colaborador = tipo === "colaboracion" ? c.porcentaje_colaborador : null;
    out.comision_colaborador_monto = c.colaborador;
    out.comision_ale_monto = c.ale;
  }
  return { datos: out };
}

function normalizarCita(b, parcial = false) {
  b = b || {};
  const out = {};
  if (!parcial) {
    out.cliente_id = uuid(b.cliente_id);
    out.propiedad_id = uuid(b.propiedad_id);
    if (!out.cliente_id || !out.propiedad_id) return { error: "Una cita necesita cliente y propiedad." };
  }
  if (b.estado !== undefined) {
    if (!ESTADOS_CITA.includes(b.estado)) return { error: "Estado de cita no válido." };
    out.estado = b.estado;
  }
  if (b.fecha_hora !== undefined) {
    if (b.fecha_hora && Number.isNaN(Date.parse(b.fecha_hora))) return { error: "Fecha y hora no válidas." };
    out.fecha_hora = b.fecha_hora ? new Date(b.fecha_hora).toISOString() : null;
  }
  if (b.notas !== undefined) out.notas = t(b.notas, 1000) || null;
  return { datos: out };
}

function normalizarCliente(b) {
  b = b || {};
  const out = {};
  if (b.etapa !== undefined) {
    if (!ETAPAS.includes(b.etapa)) return { error: "Etapa no válida." };
    out.etapa = b.etapa;
  }
  if (b.prioridad !== undefined) {
    if (b.prioridad && !PRIORIDADES.includes(b.prioridad)) return { error: "Prioridad no válida." };
    out.prioridad = b.prioridad || null;
  }
  if (b.siguiente_accion !== undefined) out.siguiente_accion = t(b.siguiente_accion, 300) || null;
  if (b.notas !== undefined) out.notas = t(b.notas, 2000) || null;
  if (b.baja !== undefined) out.baja = b.baja === true;
  return { datos: out };
}

module.exports = { normalizarVenta, normalizarCita, normalizarCliente, ETAPAS, ESTADOS_CITA, ESTADOS_VENTA, OPERACIONES };
