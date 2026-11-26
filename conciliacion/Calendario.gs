/**
 * Controles 12 a 16: cruzan Reservas del CRM con el calendario operativo corporativo
 * (trazabilidad/DISENO_CALENDAR.md, sección 5). Solo lectura: no crea, edita ni borra eventos.
 * Del evento usa título, descripción (solo para extraer ID y valor), inicio, estado y la propiedad privada
 * idReserva. No lee invitados ni ubicación.
 *
 *   12. Evento de reserva activo sin ID o con un ID que no existe en Reservas.
 *   13. Reserva Pendiente o Confirmada con fecha futura (hasta DIAS_ADELANTE) sin evento activo.
 *   14. Dos o más eventos activos con el mismo ID (el sufijo -1, -2 distingue fechas).
 *   15. Fecha u hora del evento distinta de Reservas (E y F); o «valor total $X» distinto de Reservas (I).
 *   16. Evento cancelado o eliminado con la reserva vigente; reserva Cancelada con evento activo; y, como
 *       registro, eventos de reserva que desaparecen entre dos revisiones.
 *
 * ESTADO: preparado, sin instalar. Requiere, en la etapa 2 y con autorización, el servicio avanzado Calendar
 * y el permiso calendar.readonly en appsscript.json (hoy no están). Sin activador: se ejecuta a pedido.
 */
var RE_ID_TITULO = /\[(R-\d{4}-\d{3}(?:-\d+)?)\]/i;
var RE_ID_DESCRIPCION = /ID reserva:\s*(R-\d{4}-\d{3}(?:-\d+)?)/i;
var RE_VALOR_TOTAL = /valor total\s*\$?\s*([\d.]+)/i;
var RE_CANCELADA = /^\s*\[CANCELADA\]/i;

/**
 * Núcleo puro (probado fuera de Apps Script).
 * @param eventos  [{ id, titulo, descripcion, inicio: Date, estado: 'confirmed'|'cancelled', idReserva }]
 * @param reservas filas de Reservas A:I con valores visibles (ID, cot., cliente, servicio, fecha, hora, comuna,
 *                 estado, venta)
 * @param vistos   { idEvento: idReserva } de la revisión anterior (solo identificadores)
 * @param hoy      Date
 * @param opciones { diasAdelante, zona }
 */
function controlesCalendario_(eventos, reservas, vistos, hoy, opciones) {
  var o = opciones || {};
  var zona = o.zona || 'America/Santiago';
  var limite = new Date(hoy.getTime() + (o.diasAdelante || 180) * 86400000);
  var hoyTexto = Utilities.formatDate(hoy, zona, 'yyyy-MM-dd');

  var res = {};
  reservas.forEach(function (r) {
    var id = String(r[0] || '').trim().toUpperCase();
    if (!RE_ID_RESERVA.test(id)) return;
    res[id] = { fecha: String(r[4] || '').trim(), hora: horaCorta_(r[5]), estado: String(r[7] || '').trim(), venta: numero_(r[8]) };
  });
  var vigente = function (e) { return e === 'Pendiente' || e === 'Confirmada'; };

  var c12 = [], c14 = [], c15 = [], c16 = [], porId = {}, ahora = {};
  eventos.forEach(function (ev) {
    var titulo = String(ev.titulo || ''), desc = String(ev.descripcion || '');
    var id = idDeEvento_(ev);
    var esReserva = id || /Reserva Artistas a Domicilio/i.test(desc);
    if (!esReserva) return;
    var anulado = ev.estado === 'cancelled' || RE_CANCELADA.test(titulo);
    if (id) ahora[ev.id] = id;
    var base = baseId_(id);
    var r = base ? res[base] : null;
    if (anulado) {
      if (r && vigente(r.estado)) c16.push({ clave: 'cal:16:anulado:' + ev.id, texto: 'Evento de ' + id + ' cancelado o marcado [CANCELADA], pero la reserva sigue ' + r.estado });
      return;
    }
    if (!id || !r) { c12.push({ clave: 'cal:12:' + ev.id, texto: id ? 'Evento con ' + id + ', que no existe en Reservas' : 'Evento de reserva sin ID (' + Utilities.formatDate(ev.inicio, zona, 'dd-MM-yyyy') + ')' }); return; }
    (porId[id] = porId[id] || []).push(ev.id);
    if (r.estado === 'Cancelada') c16.push({ clave: 'cal:16:activo:' + ev.id, texto: 'Reserva ' + base + ' Cancelada con evento activo' });
    if (id === base) {
      var fechaEv = Utilities.formatDate(ev.inicio, zona, 'yyyy-MM-dd'), horaEv = horaCorta_(Utilities.formatDate(ev.inicio, zona, 'H:mm'));
      if (r.fecha && fechaEv !== r.fecha) c15.push({ clave: 'cal:15:fecha:' + id + ':' + fechaEv, texto: id + ': fecha del evento ' + fechaEv + ', en Reservas ' + r.fecha });
      else if (r.hora && horaEv !== r.hora) c15.push({ clave: 'cal:15:hora:' + id + ':' + horaEv, texto: id + ': hora del evento ' + horaEv + ', en Reservas ' + r.hora });
    }
    var v = RE_VALOR_TOTAL.exec(desc);
    if (v && r.venta && numero_(v[1]) !== r.venta) c15.push({ clave: 'cal:15:valor:' + id + ':' + numero_(v[1]), texto: id + ': valor del evento ' + numero_(v[1]) + ', en Reservas ' + r.venta });
  });

  Object.keys(porId).forEach(function (id) {
    if (porId[id].length > 1) c14.push({ clave: 'cal:14:' + id + ':' + porId[id].length, texto: id + ': ' + porId[id].length + ' eventos activos' });
  });
  var conEvento = {};
  Object.keys(porId).forEach(function (id) { conEvento[baseId_(id)] = true; });
  var c13 = Object.keys(res).filter(function (id) {
    var r = res[id];
    if (!vigente(r.estado) || !r.fecha || conEvento[id]) return false;
    var f = new Date(r.fecha + 'T12:00:00');
    return r.fecha >= hoyTexto && f <= limite;
  }).map(function (id) { return { clave: 'cal:13:' + id, texto: 'Reserva ' + id + ' (' + res[id].estado + ', ' + res[id].fecha + ') sin evento en el calendario' }; });

  var desaparecidos = Object.keys(vistos || {}).filter(function (k) { return !(k in ahora) && !eventos.some(function (e) { return e.id === k; }); });
  desaparecidos.forEach(function (k) { c16.push({ clave: 'cal:16:desaparecido:' + k, texto: 'El evento de ' + vistos[k] + ' ya no está en el calendario (registro)' }); });

  var alertas = [];
  [[12, c12], [13, c13], [14, c14], [15, c15], [16, c16]].forEach(function (p) {
    p[1].forEach(function (a) { alertas.push({ control: p[0], clave: a.clave, texto: a.texto }); });
  });
  return {
    resumen: { control12: c12.length, control13: c13.length, control14: c14.length, control15: c15.length, control16: c16.length },
    alertas: alertas,
    vistos: ahora
  };
}

function idDeEvento_(ev) {
  var m = ev.idReserva ? [null, ev.idReserva] : (RE_ID_TITULO.exec(String(ev.titulo || '')) || RE_ID_DESCRIPCION.exec(String(ev.descripcion || '')));
  return m ? String(m[1]).trim().toUpperCase() : '';
}

/** «R-2026-002-1» → «R-2026-002»; texto no válido → «». */
function baseId_(id) {
  var m = RE_ID_RESERVA.exec(String(id || ''));
  return m ? m[1] : '';
}

/** «20:00:00», «9:30» o «09:30» → «20:00» / «9:30». */
function horaCorta_(texto) {
  var h = /^(\d{1,2}):(\d{2})/.exec(String(texto || '').trim());
  return h ? Number(h[1]) + ':' + h[2] : '';
}

/**
 * Revisión a pedido (sin activador): lee el calendario corporativo y Reservas, y devuelve el informe.
 * No guarda nada, salvo que guardarVistos sea true (solo identificadores en Propiedades).
 */
function revisionCalendarioSoloLectura(guardarVistos) {
  if (typeof Calendar === 'undefined') throw new Error('Falta el servicio avanzado Calendar (etapa 2, requiere autorización)');
  var cfg = obtenerConfig_(), t = cfg.CALENDARIO;
  if (!t || !t.CALENDAR_ID) throw new Error('Config.gs no tiene CALENDARIO.CALENDAR_ID');
  var hoy = new Date();
  var eventos = [], token = null;
  do {
    var r = Calendar.Events.list(t.CALENDAR_ID, { timeMin: new Date(hoy.getTime() - 7 * 86400000).toISOString(),
      timeMax: new Date(hoy.getTime() + (t.DIAS_ADELANTE || 180) * 86400000).toISOString(), singleEvents: true,
      showDeleted: true, maxResults: 250, pageToken: token, fields: 'nextPageToken,items(id,summary,description,start,status,extendedProperties/private)' });
    (r.items || []).forEach(function (e) {
      var p = (e.extendedProperties && e.extendedProperties['private']) || {};
      eventos.push({ id: e.id, titulo: e.summary, descripcion: e.description, estado: e.status, idReserva: p.idReserva || '',
        inicio: new Date((e.start && (e.start.dateTime || e.start.date + 'T00:00:00')) || 0) });
    });
    token = r.nextPageToken;
  } while (token);
  var hoja = SpreadsheetApp.openById(cfg.TRAZABILIDAD.CRM_ID).getSheetByName('Reservas');
  var n = Math.max(hoja.getLastRow() - 1, 0);
  var reservas = n ? hoja.getRange(2, 1, n, 9).getDisplayValues() : [];
  var props = PropertiesService.getScriptProperties();
  var vistos = JSON.parse(props.getProperty('CAL_VISTOS') || '{}');
  var salida = controlesCalendario_(eventos, reservas, vistos, hoy, { diasAdelante: t.DIAS_ADELANTE });
  if (guardarVistos === true) props.setProperty('CAL_VISTOS', JSON.stringify(salida.vistos));
  Logger.log(JSON.stringify(salida.resumen));
  salida.alertas.forEach(function (a) { Logger.log('Control ' + a.control + ': ' + a.texto); });
  return salida;
}
