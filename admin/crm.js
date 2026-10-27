// CRM del panel: clientes, citas, ventas (directas o en colaboración) y reportes descargables.
// Se carga después de /lib/reportes.js. Todo texto del cliente se pinta con textContent (nunca HTML).
(function () {
  "use strict";
  var R = window.Reportes;
  var obtenerClave = function () { return ""; };
  var D = { clientes: [], citas: [], ventas: [], propiedades: [], asesores: [] };
  var iniciado = false;

  var ETAPAS = ["NUEVO", "LISTO_PARA_BUSCAR", "CONSULTANDO_BASE", "BUSQUEDA_EXTERNA", "OPCIONES_EN_VALIDACION", "OPCIONES_LISTAS",
    "OPCIONES_ENVIADAS", "CLIENTE_INTERESADO", "COORDINANDO_VISITA", "VISITA_AGENDADA", "VISITA_REALIZADA", "NEGOCIACION", "OFERTA",
    "CIERRE", "BUSQUEDA_ACTIVA", "PAUSADO", "SIN_RESPUESTA", "CERRADO"];
  var dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

  function $(id) { return document.getElementById(id); }
  function h(tag, attrs, hijos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "class") e.className = attrs[k]; else if (k === "text") e.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function fecha(iso) { return R.fechaMx(iso); }
  function fechaHora(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  }
  function llamar(metodo, recurso, cuerpo) {
    return fetch("/api/admin/crm?r=" + recurso, { method: metodo, headers: { "Content-Type": "application/json", "x-admin-key": obtenerClave() },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Error"); return j; }); });
  }
  function cargar() {
    return llamar("GET", "todo").then(function (j) { D = j; pintaTodo(); }).catch(function (e) { aviso("No pude cargar el CRM: " + e.message, true); });
  }
  function aviso(t, error) {
    var a = $("crm-aviso"); a.textContent = t; a.className = error ? "crm-aviso error" : "crm-aviso ok"; a.style.display = "block";
    setTimeout(function () { a.style.display = "none"; }, 6000);
  }
  function clavePropiedad(id) { var p = D.propiedades.find(function (x) { return x.id === id; }); return p ? p.referencia_publica : ""; }
  function nombreCliente(id) { var c = D.clientes.find(function (x) { return x.id === id; }); return c ? (c.nombre || c.telefono || "(sin nombre)") : ""; }
  function opciones(sel, lista, valor, vacio) {
    sel.textContent = "";
    if (vacio != null) sel.appendChild(h("option", { value: "", text: vacio }));
    lista.forEach(function (o) { var op = h("option", { value: o.v, text: o.t }); if (o.v === valor) op.selected = true; sel.appendChild(op); });
  }
  function tabla(columnas, filas, alClic) {
    var t = h("table", { class: "crm-tabla" });
    t.appendChild(h("thead", {}, [h("tr", {}, columnas.map(function (c) { return h("th", { text: c.t }); }))]));
    var cuerpo = h("tbody");
    if (!filas.length) cuerpo.appendChild(h("tr", {}, [h("td", { colspan: String(columnas.length), class: "vacio", text: "Sin registros." })]));
    filas.forEach(function (f) {
      var tr = h("tr", alClic ? { class: "clicable", onclick: function () { alClic(f); } } : {});
      columnas.forEach(function (c) { tr.appendChild(h("td", { text: c.f ? c.f(f) : (f[c.k] == null ? "" : String(f[c.k])) })); });
      cuerpo.appendChild(tr);
    });
    t.appendChild(cuerpo);
    return h("div", { class: "crm-scroll" }, [t]);
  }

  // ---------- pestañas ----------
  function vista(nombre) {
    ["propiedades", "clientes", "citas", "ventas", "reportes"].forEach(function (v) {
      $("vista-" + v).style.display = v === nombre ? "block" : "none";
      $("tab-" + v).classList.toggle("activa", v === nombre);
    });
  }

  // ---------- CLIENTES ----------
  function pintaClientes() {
    var q = ($("cli-buscar").value || "").toLowerCase(), tipo = $("cli-tipo").value, etapa = $("cli-etapa").value;
    var f = D.clientes.filter(function (c) {
      var texto = [c.nombre, c.telefono, c.correo, c.anuncio_origen, c.zona].join(" ").toLowerCase();
      return (!q || texto.indexOf(q) >= 0) && (!tipo || c.tipo_operacion === tipo) && (!etapa || c.etapa === etapa);
    });
    var cont = $("cli-lista"); cont.textContent = "";
    cont.appendChild(tabla([
      { t: "Fecha de contacto", f: function (c) { return fecha(c.fecha_primer_contacto); } }, { t: "Nombre", k: "nombre" }, { t: "Teléfono", k: "telefono" },
      { t: "Correo", k: "correo" }, { t: "Interés", k: "tipo_operacion" }, { t: "Clave de propiedad", k: "anuncio_origen" },
      { t: "Forma de pago", k: "forma_pago" }, { t: "Plazo", k: "plazo" }, { t: "Etapa", k: "etapa" }
    ], f, abreCliente));
    $("cli-total").textContent = f.length + " de " + D.clientes.length + " clientes";
  }
  function abreCliente(c) {
    var citas = D.citas.filter(function (x) { return x.cliente_id === c.id; });
    var ventas = D.ventas.filter(function (x) { return x.cliente_id === c.id; });
    var et = h("select"); opciones(et, ETAPAS.map(function (e) { return { v: e, t: e.replace(/_/g, " ").toLowerCase() }; }), c.etapa);
    var pr = h("select"); opciones(pr, ["alta", "media", "nutricion", "baja"].map(function (e) { return { v: e, t: e }; }), c.prioridad, "(sin prioridad)");
    var sig = h("input", { type: "text", maxlength: "300", value: c.siguiente_accion || "" });
    var notas = h("textarea", { rows: "3" }); notas.value = c.notas || "";
    var perfil = c.perfil ? Object.keys(c.perfil).map(function (k) { return h("li", { text: k.replace(/_/g, " ") + ": " + c.perfil[k] }); }) : [];
    var cuerpo = h("div", {}, [
      h("p", { class: "dato", text: "Teléfono: " + (c.telefono || "—") + " · Correo: " + (c.correo || "—") }),
      h("p", { class: "dato", text: "Contactó: " + fechaHora(c.fecha_primer_contacto) + " · Origen: " + (c.origen || "—") + " · Interés: " + (c.tipo_operacion || "—") }),
      h("p", { class: "dato", text: "Propiedad de interés: " + (c.anuncio_origen || "—") + " · Pago: " + (c.forma_pago || "—") + " · Plazo: " + (c.plazo || "—") +
        " · Presupuesto máx.: " + (c.presupuesto_max ? dinero.format(c.presupuesto_max) : "—") + " · Zona: " + (c.zona || "—") }),
      h("p", { class: "dato", text: c.aviso_aceptado_en ? "Aceptó el aviso de privacidad el " + fechaHora(c.aviso_aceptado_en) : "Sin registro de aviso de privacidad" }),
      perfil.length ? h("div", {}, [h("strong", { text: "Perfil que contestó:" }), h("ul", {}, perfil)]) : null,
      h("div", { class: "grid2" }, [h("div", { class: "campo" }, [h("label", { text: "Etapa" }), et]), h("div", { class: "campo" }, [h("label", { text: "Prioridad" }), pr])]),
      h("div", { class: "campo" }, [h("label", { text: "Siguiente acción" }), sig]),
      h("div", { class: "campo" }, [h("label", { text: "Notas" }), notas]),
      h("p", { class: "dato", text: "Citas: " + citas.length + " · Ventas: " + ventas.length }),
      h("div", { class: "fila-botones-form" }, [
        h("button", { class: "btn secundario", type: "button", text: "Nueva cita", onclick: function () { cierraModal(); abreCita(c); } }),
        h("button", { class: "btn secundario", type: "button", text: "Registrar venta", onclick: function () { cierraModal(); abreVenta(null, c); } }),
        h("button", { class: "btn", type: "button", text: "Guardar", onclick: function () {
          llamar("PATCH", "cliente", { id: c.id, etapa: et.value, prioridad: pr.value, siguiente_accion: sig.value, notas: notas.value })
            .then(function () { cierraModal(); aviso("Cliente actualizado."); return cargar(); }).catch(function (e) { aviso(e.message, true); });
        } })
      ])
    ]);
    modal("Cliente: " + (c.nombre || c.telefono || "(sin nombre)"), cuerpo);
  }

  // ---------- CITAS ----------
  function pintaCitas() {
    var estado = $("cit-estado").value;
    var f = D.citas.filter(function (c) { return !estado || c.estado === estado; });
    var cont = $("cit-lista"); cont.textContent = "";
    cont.appendChild(tabla([
      { t: "Fecha y hora", f: function (c) { return fechaHora(c.fecha_hora); } }, { t: "Estado", k: "estado" }, { t: "Cliente", k: "cliente_nombre" },
      { t: "Teléfono", k: "cliente_telefono" }, { t: "Clave de propiedad", k: "propiedad_clave" }, { t: "Notas", k: "notas" }
    ], f, abreEditarCita));
  }
  function abreEditarCita(c) {
    var es = h("select"); opciones(es, ["agendada", "confirmada", "realizada", "cancelada"].map(function (e) { return { v: e, t: e }; }), c.estado);
    var fh = h("input", { type: "datetime-local" });
    if (c.fecha_hora) { var d = new Date(c.fecha_hora); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); fh.value = d.toISOString().slice(0, 16); }
    var notas = h("textarea", { rows: "3" }); notas.value = c.notas || "";
    modal("Cita de " + (c.cliente_nombre || "cliente") + (c.propiedad_clave ? " · " + c.propiedad_clave : ""), h("div", {}, [
      h("div", { class: "grid2" }, [h("div", { class: "campo" }, [h("label", { text: "Estado" }), es]), h("div", { class: "campo" }, [h("label", { text: "Fecha y hora" }), fh])]),
      h("div", { class: "campo" }, [h("label", { text: "Notas (qué pasó en la visita, seguimiento)" }), notas]),
      h("div", { class: "fila-botones-form" }, [
        h("button", { class: "btn secundario", type: "button", text: "Registrar venta de esta cita", onclick: function () {
          cierraModal(); abreVenta(null, D.clientes.find(function (x) { return x.id === c.cliente_id; }), c); } }),
        h("button", { class: "btn", type: "button", text: "Guardar", onclick: function () {
          llamar("PATCH", "cita", { id: c.id, estado: es.value, fecha_hora: fh.value ? new Date(fh.value).toISOString() : null, notas: notas.value })
            .then(function () { cierraModal(); aviso("Cita actualizada."); return cargar(); }).catch(function (e) { aviso(e.message, true); });
        } })
      ])
    ]));
  }
  function abreCita(cliente) {
    var cl = h("select"); opciones(cl, D.clientes.map(function (c) { return { v: c.id, t: (c.nombre || c.telefono || "(sin nombre)") + " · " + (c.telefono || "") }; }), cliente && cliente.id, "Elige cliente");
    var pr = h("select"); opciones(pr, D.propiedades.map(function (p) { return { v: p.id, t: p.referencia_publica + " · " + [p.colonia, p.municipio].filter(Boolean).join(", ") }; }), null, "Elige propiedad");
    if (cliente && cliente.anuncio_origen) { var m = D.propiedades.find(function (p) { return p.referencia_publica === cliente.anuncio_origen; }); if (m) pr.value = m.id; }
    var fh = h("input", { type: "datetime-local" });
    var notas = h("textarea", { rows: "2" });
    modal("Nueva cita", h("div", {}, [
      h("div", { class: "campo" }, [h("label", { text: "Cliente" }), cl]), h("div", { class: "campo" }, [h("label", { text: "Propiedad" }), pr]),
      h("div", { class: "campo" }, [h("label", { text: "Fecha y hora" }), fh]), h("div", { class: "campo" }, [h("label", { text: "Notas" }), notas]),
      h("div", { class: "fila-botones-form" }, [h("button", { class: "btn", type: "button", text: "Guardar cita", onclick: function () {
        llamar("POST", "cita", { cliente_id: cl.value, propiedad_id: pr.value, fecha_hora: fh.value ? new Date(fh.value).toISOString() : null, notas: notas.value })
          .then(function () { cierraModal(); aviso("Cita creada."); return cargar(); }).catch(function (e) { aviso(e.message, true); });
      } })])
    ]));
  }

  // ---------- VENTAS ----------
  function pintaVentas() {
    var r = R.resumenVentas(D.ventas);
    var tarjetas = $("ven-tarjetas"); tarjetas.textContent = "";
    [["Ventas cerradas", r.cerradas], ["Directas", r.directas], ["En colaboración", r.colaboracion], ["Comisión total", dinero.format(r.comision_total)],
      ["Comisión de Ale", dinero.format(r.comision_ale)], ["Comisión de colaboradores", dinero.format(r.comision_colaboradores)]].forEach(function (x) {
      tarjetas.appendChild(h("div", { class: "tarjeta" }, [h("div", { class: "tv", text: String(x[1]) }), h("div", { class: "tt", text: x[0] })]));
    });
    var cont = $("ven-lista"); cont.textContent = "";
    cont.appendChild(tabla([
      { t: "Cierre", k: "fecha_cierre" }, { t: "Estado", k: "estado" }, { t: "Cliente", k: "cliente_nombre" }, { t: "Propiedad", k: "propiedad_clave" },
      { t: "Operación", k: "tipo_operacion" }, { t: "Monto", f: function (v) { return v.monto_operacion != null ? dinero.format(v.monto_operacion) : ""; } },
      { t: "Tipo", f: function (v) { return v.tipo_venta === "colaboracion" ? "Colaboración (" + (v.colaborador || "—") + ")" : "Directa"; } },
      { t: "Comisión total", f: function (v) { return v.comision_total_monto != null ? dinero.format(v.comision_total_monto) : ""; } },
      { t: "Ale", f: function (v) { return v.comision_ale_monto != null ? dinero.format(v.comision_ale_monto) : ""; } },
      { t: "Colaborador", f: function (v) { return v.comision_colaborador_monto ? dinero.format(v.comision_colaborador_monto) : ""; } }
    ], D.ventas, function (v) { abreVenta(v, D.clientes.find(function (c) { return c.id === v.cliente_id; })); }));
  }
  function abreVenta(v, cliente, cita) {
    var nueva = !v; v = v || {};
    var cl = h("select"); opciones(cl, D.clientes.map(function (c) { return { v: c.id, t: (c.nombre || c.telefono || "(sin nombre)") + " · " + (c.telefono || "") }; }), (cliente && cliente.id) || v.cliente_id, "Elige cliente");
    if (!nueva) cl.disabled = true;
    var pr = h("select"); opciones(pr, D.propiedades.map(function (p) { return { v: p.id, t: p.referencia_publica + " · " + [p.colonia, p.municipio].filter(Boolean).join(", ") }; }), v.propiedad_id || (cita && cita.propiedad_id), "(sin propiedad)");
    var op = h("select"); opciones(op, [["venta", "Venta"], ["renta", "Renta"], ["construccion", "Construcción a la medida"], ["inversion", "Inversión"]].map(function (x) { return { v: x[0], t: x[1] }; }), v.tipo_operacion || "venta");
    var es = h("select"); opciones(es, [["en_proceso", "En proceso"], ["cerrada", "Cerrada"], ["cancelada", "Cancelada"]].map(function (x) { return { v: x[0], t: x[1] }; }), v.estado || "en_proceso");
    var cierre = h("input", { type: "date", value: v.fecha_cierre || "" });
    var monto = h("input", { type: "text", inputmode: "decimal", placeholder: "Ej. 3,000,000", value: v.monto_operacion != null ? String(v.monto_operacion) : "" });
    var tipo = h("select"); opciones(tipo, [["directa", "Directa"], ["colaboracion", "En colaboración (comisión compartida)"]].map(function (x) { return { v: x[0], t: x[1] }; }), v.tipo_venta || "directa");
    var ase = h("select"); opciones(ase, D.asesores.map(function (a) { return { v: a.id, t: a.nombre + (a.inmobiliaria ? " · " + a.inmobiliaria : "") }; }), v.asesor_colaborador_id, "(otro: escribir nombre)");
    var colNombre = h("input", { type: "text", maxlength: "200", placeholder: "Nombre del colaborador", value: v.colaborador_nombre || "" });
    var pct = h("input", { type: "text", inputmode: "decimal", placeholder: "% sobre la operación", value: v.comision_porcentaje != null ? String(v.comision_porcentaje) : "" });
    var total = h("input", { type: "text", inputmode: "decimal", placeholder: "o monto de comisión", value: v.comision_total_monto != null ? String(v.comision_total_monto) : "" });
    var pc = h("input", { type: "text", inputmode: "decimal", placeholder: "% de la comisión para el colaborador", value: v.porcentaje_colaborador != null ? String(v.porcentaje_colaborador) : "" });
    var notas = h("textarea", { rows: "2" }); notas.value = v.notas || "";
    var vista = h("p", { class: "dato calculo" });
    var bloqueColab = h("div", {}, [
      h("div", { class: "grid2" }, [h("div", { class: "campo" }, [h("label", { text: "Colaborador (de tu lista)" }), ase]), h("div", { class: "campo" }, [h("label", { text: "o nombre del colaborador" }), colNombre])]),
      h("div", { class: "campo" }, [h("label", { text: "Porcentaje de la comisión que se lleva el colaborador" }), pc])
    ]);
    function recalcula() {
      bloqueColab.style.display = tipo.value === "colaboracion" ? "block" : "none";
      var c = R.calcularComision({ monto_operacion: monto.value, comision_porcentaje: pct.value, comision_total_monto: total.value, tipo_venta: tipo.value, porcentaje_colaborador: pc.value });
      vista.textContent = c.error ? c.error : c.total == null ? "Captura el % o el monto de la comisión para ver el reparto."
        : "Comisión total " + dinero.format(c.total) + " → Ale " + dinero.format(c.ale) + (tipo.value === "colaboracion" ? " · Colaborador " + dinero.format(c.colaborador) : "");
      vista.className = "dato calculo" + (c.error ? " error" : "");
    }
    [monto, tipo, pct, total, pc].forEach(function (e) { e.addEventListener("input", recalcula); e.addEventListener("change", recalcula); });
    recalcula();
    modal(nueva ? "Registrar venta" : "Venta", h("div", {}, [
      h("div", { class: "grid2" }, [h("div", { class: "campo" }, [h("label", { text: "Cliente" }), cl]), h("div", { class: "campo" }, [h("label", { text: "Propiedad" }), pr])]),
      h("div", { class: "grid3" }, [h("div", { class: "campo" }, [h("label", { text: "Operación" }), op]), h("div", { class: "campo" }, [h("label", { text: "Estado" }), es]), h("div", { class: "campo" }, [h("label", { text: "Fecha de cierre" }), cierre])]),
      h("div", { class: "campo" }, [h("label", { text: "Monto de la operación (MXN)" }), monto]),
      h("div", { class: "campo" }, [h("label", { text: "¿Cómo fue la venta?" }), tipo]),
      bloqueColab,
      h("div", { class: "grid2" }, [h("div", { class: "campo" }, [h("label", { text: "Comisión: % sobre la operación" }), pct]), h("div", { class: "campo" }, [h("label", { text: "o monto de la comisión (MXN)" }), total])]),
      vista,
      h("div", { class: "campo" }, [h("label", { text: "Notas" }), notas]),
      h("div", { class: "fila-botones-form" }, [h("button", { class: "btn", type: "button", text: "Guardar venta", onclick: function () {
        var cuerpo = { cliente_id: cl.value, propiedad_id: pr.value || null, cita_id: (cita && cita.id) || v.cita_id || null, tipo_operacion: op.value, estado: es.value,
          fecha_cierre: cierre.value || null, monto_operacion: monto.value, tipo_venta: tipo.value, asesor_colaborador_id: ase.value || null,
          colaborador_nombre: colNombre.value, comision_porcentaje: pct.value, comision_total_monto: total.value, porcentaje_colaborador: pc.value, notas: notas.value };
        if (!nueva) cuerpo.id = v.id;
        llamar(nueva ? "POST" : "PATCH", "venta", cuerpo).then(function () { cierraModal(); aviso("Venta guardada."); return cargar(); }).catch(function (e) { aviso(e.message, true); });
      } })])
    ]));
  }

  // ---------- REPORTES ----------
  var ultimo = null;
  function generaReporte() {
    ultimo = R.reporte($("rep-tipo").value, D, $("rep-desde").value || null, $("rep-hasta").value || null);
    var salida = $("rep-salida"); salida.textContent = "";
    if (ultimo.error) { salida.appendChild(h("p", { text: ultimo.error })); return; }
    var rango = ($("rep-desde").value || "inicio") + " a " + ($("rep-hasta").value || "hoy");
    salida.appendChild(h("h3", { text: ultimo.titulo + " (" + rango + ")" }));
    var tarjetas = h("div", { class: "tarjetas" });
    ultimo.resumen.forEach(function (x) { tarjetas.appendChild(h("div", { class: "tarjeta" }, [h("div", { class: "tv", text: x.dinero ? dinero.format(x.v) : String(x.v) }), h("div", { class: "tt", text: x.t })])); });
    salida.appendChild(tarjetas);
    salida.appendChild(tabla(ultimo.columnas.map(function (c) { return { t: c.t, f: function (f) { var v = f[c.k]; return v == null ? "" : (c.k.indexOf("fecha") === 0 ? R.fechaMx(v) : (typeof v === "object" ? JSON.stringify(v) : String(v))); } }; }), ultimo.filas));
    $("rep-acciones").style.display = "flex";
  }
  function descargaCsv() {
    if (!ultimo || ultimo.error) return;
    var blob = new Blob([R.csv(ultimo.columnas, ultimo.filas)], { type: "text/csv;charset=utf-8" });
    var a = h("a", { href: URL.createObjectURL(blob), download: "reporte-" + $("rep-tipo").value + "-" + new Date().toISOString().slice(0, 10) + ".csv" });
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- modal ----------
  function modal(titulo, cuerpo) {
    var m = $("crm-modal"); $("crm-modal-titulo").textContent = titulo;
    var c = $("crm-modal-cuerpo"); c.textContent = ""; c.appendChild(cuerpo); m.classList.add("abierto");
  }
  function cierraModal() { $("crm-modal").classList.remove("abierto"); }

  function pintaTodo() { pintaClientes(); pintaCitas(); pintaVentas(); }

  window.crmIniciar = function (dameClave) {
    obtenerClave = dameClave;
    if (iniciado) { cargar(); return; }
    iniciado = true;
    ["propiedades", "clientes", "citas", "ventas", "reportes"].forEach(function (v) { $("tab-" + v).addEventListener("click", function () { vista(v); if (v !== "propiedades") cargar(); }); });
    opciones($("cli-etapa"), ETAPAS.map(function (e) { return { v: e, t: e.replace(/_/g, " ").toLowerCase() }; }), null, "Todas las etapas");
    ["cli-buscar", "cli-tipo", "cli-etapa"].forEach(function (id) { $(id).addEventListener("input", pintaClientes); });
    $("cit-estado").addEventListener("change", pintaCitas);
    $("cit-nueva").addEventListener("click", function () { abreCita(null); });
    $("ven-nueva").addEventListener("click", function () { abreVenta(null, null); });
    $("rep-generar").addEventListener("click", generaReporte);
    $("rep-csv").addEventListener("click", descargaCsv);
    $("rep-imprimir").addEventListener("click", function () { window.print(); });
    $("crm-modal-cerrar").addEventListener("click", cierraModal);
    $("crm-modal").addEventListener("click", function (e) { if (e.target === $("crm-modal")) cierraModal(); });
    vista("propiedades");
    cargar();
  };
})();
