/**
 * Controles 7 a 9 de la trazabilidad (decisión 49): cruzan la pestaña Reservas del CRM con la columna
 * «ID RESERVA» de la agenda, que es otra planilla. Solo lectura: no escribe en el CRM ni en la agenda.
 * De la agenda lee únicamente FECHA, VALOR e ID RESERVA (sin nombres, teléfonos ni direcciones).
 * Se ejecutan en el resumen diario y en validacionSoloLectura(), solo si Config.gs tiene TRAZABILIDAD.
 *
 *   7. Reservas Confirmada o Realizada sin fila en la agenda.
 *   8. Filas de la agenda con valor, fecha desde INICIO_CONTROL y sin ID (ni «PREVIO»).
 *   9. IDs de la agenda mal escritos o que no existen en Reservas.
 */
var RE_ID_RESERVA = /^(R-\d{4}-\d{3})(-\d+)?$/;

function controlesAgenda_(cfg) {
  var t = cfg.TRAZABILIDAD;
  var hojaRes = SpreadsheetApp.openById(t.CRM_ID).getSheetByName('Reservas');
  var nRes = Math.max(hojaRes.getLastRow() - 1, 0);
  var reservas = nRes ? hojaRes.getRange(2, 1, nRes, 8).getDisplayValues() : [];
  var hojaAg = SpreadsheetApp.openById(t.AGENDA_ID).getSheetByName(t.PESTANA_AGENDA);
  var nAg = Math.max(hojaAg.getLastRow() - 1, 0);
  var col = function (c) { return nAg ? hojaAg.getRange(2, c, nAg, 1).getDisplayValues().map(function (f) { return String(f[0]).trim(); }) : []; };
  var fechas = col(t.COLUMNAS.fecha), valores = col(t.COLUMNAS.valor), ids = col(t.COLUMNAS.id);
  var inicio = new Date(t.INICIO_CONTROL + 'T00:00:00');

  var existentes = {};
  reservas.forEach(function (r) { if (r[0]) existentes[String(r[0]).trim().toUpperCase()] = String(r[7]).trim(); });
  var enAgenda = {};
  var c8 = [], c9 = [], ilegibles = 0;
  for (var i = 0; i < nAg; i++) {
    var fila = i + 2, id = ids[i].toUpperCase();
    if (id === 'PREVIO') continue;
    if (id) {
      var m = RE_ID_RESERVA.exec(id);
      if (!m || !(m[1] in existentes)) c9.push({ fila: fila, id: ids[i] });
      else enAgenda[m[1]] = true;
      continue;
    }
    var valor = Number(String(valores[i]).replace(/[^\d]/g, '')) || 0;
    if (!valor) continue;
    var f = fechaAgenda_(fechas[i], t.ANIO_TEMPORADA, t.MES_INICIO_TEMPORADA);
    if (!f) { if (fechas[i]) ilegibles++; continue; }
    if (f >= inicio) c8.push({ fila: fila, fecha: Utilities.formatDate(f, 'America/Santiago', 'dd-MM-yyyy') });
  }
  var c7 = Object.keys(existentes).filter(function (k) {
    return (existentes[k] === 'Confirmada' || existentes[k] === 'Realizada') && !enAgenda[k];
  });

  var alertas = [];
  c7.forEach(function (k) { alertas.push({ control: 7, clave: 'traz:7:' + k, etiqueta: k, texto: 'Reserva ' + k + ' (' + existentes[k] + ') sin fila en la agenda' }); });
  c8.forEach(function (x) { alertas.push({ control: 8, clave: 'traz:8:' + x.fila + ':' + x.fecha, etiqueta: 'fila ' + x.fila, texto: 'Agenda, fila ' + x.fila + ' (' + x.fecha + '): evento sin ID de reserva' }); });
  c9.forEach(function (x) { alertas.push({ control: 9, clave: 'traz:9:' + x.fila + ':' + x.id, etiqueta: 'fila ' + x.fila, texto: 'Agenda, fila ' + x.fila + ': ID «' + x.id + '» mal escrito o inexistente en Reservas' }); });
  return {
    resumen: { control7: c7.length, control8: c8.length, control9: c9.length, fechasIlegibles: ilegibles },
    alertas: alertas
  };
}

/** «3/12» o «03/12» → fecha. Meses desde MES_INICIO pertenecen al año de la temporada; los anteriores, al siguiente. */
function fechaAgenda_(texto, anio, mesInicio) {
  var m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(texto).trim());
  if (!m) return null;
  var d = Number(m[1]), mes = Number(m[2]);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  return new Date((mes >= mesInicio ? anio : anio + 1) + '-' + ('0' + mes).slice(-2) + '-' + ('0' + d).slice(-2) + 'T00:00:00');
}
