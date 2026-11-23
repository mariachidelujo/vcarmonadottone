/**
 * Controles 7 a 9 de la trazabilidad (decisión 49): cruzan la pestaña Reservas del CRM con la columna
 * «ID RESERVA» de la agenda, que es otra planilla. Solo lectura: no escribe en el CRM ni en la agenda.
 * De la agenda lee únicamente FECHA, HORARIO, VALOR e ID RESERVA (sin nombres, teléfonos ni direcciones).
 * Se ejecutan en el resumen diario y en validacionSoloLectura(), solo si Config.gs tiene TRAZABILIDAD.
 *
 *   7. Reservas Confirmada o Realizada sin fila en la agenda.
 *   8. Filas de la agenda con valor, fecha desde INICIO_CONTROL, sin ID y sin excepción registrada.
 *   9. IDs de la agenda mal escritos o que no existen en Reservas (la columna Q solo admite ID reales).
 *
 * Excepciones temporales: filas «EXC-AAAA-NNN» de la pestaña Control del CRM (fecha, hora y valor de la
 * agenda, con Estado «Vigente» o «Cerrada»). Se identifican por su contenido, no por el número de fila,
 * para que sigan valiendo si el equipo inserta u ordena filas en la agenda.
 */
var RE_ID_RESERVA = /^(R-\d{4}-\d{3})(-\d+)?$/;
var RE_EXCEPCION = /^EXC-\d{4}-\d{3}$/;

function controlesAgenda_(cfg) {
  var t = cfg.TRAZABILIDAD;
  var crm = SpreadsheetApp.openById(t.CRM_ID);
  var hojaRes = crm.getSheetByName('Reservas');
  var nRes = Math.max(hojaRes.getLastRow() - 1, 0);
  var reservas = nRes ? hojaRes.getRange(2, 1, nRes, 8).getDisplayValues() : [];
  var excepciones = leerExcepciones_(crm.getSheetByName(t.PESTANA_CONTROL || 'Control'));

  var hojaAg = SpreadsheetApp.openById(t.AGENDA_ID).getSheetByName(t.PESTANA_AGENDA);
  var nAg = Math.max(hojaAg.getLastRow() - 1, 0);
  var col = function (c) { return nAg ? hojaAg.getRange(2, c, nAg, 1).getDisplayValues().map(function (f) { return String(f[0]).trim(); }) : []; };
  var fechas = col(t.COLUMNAS.fecha), horas = col(t.COLUMNAS.hora), valores = col(t.COLUMNAS.valor), ids = col(t.COLUMNAS.id);
  var inicio = new Date(t.INICIO_CONTROL + 'T00:00:00');

  var existentes = {};
  reservas.forEach(function (r) { if (r[0]) existentes[String(r[0]).trim().toUpperCase()] = String(r[7]).trim(); });
  var enAgenda = {}, usadas = {};
  var c8 = [], c9 = [], ilegibles = 0, exceptuadas = 0;
  for (var i = 0; i < nAg; i++) {
    var fila = i + 2, id = ids[i].toUpperCase();
    if (id) {
      var m = RE_ID_RESERVA.exec(id);
      if (!m || !(m[1] in existentes)) c9.push({ fila: fila, id: ids[i] });
      else enAgenda[m[1]] = true;
      continue;
    }
    var valor = numero_(valores[i]);
    if (!valor) continue;
    var f = fechaAgenda_(fechas[i], t.ANIO_TEMPORADA, t.MES_INICIO_TEMPORADA);
    if (!f) { if (fechas[i]) ilegibles++; continue; }
    if (f < inicio) continue;
    var clave = claveEvento_(fechas[i], horas[i], valor);
    if (excepciones[clave]) { exceptuadas++; usadas[clave] = true; continue; }
    c8.push({ fila: fila, fecha: Utilities.formatDate(f, 'America/Santiago', 'dd-MM-yyyy') });
  }
  var c7 = Object.keys(existentes).filter(function (k) {
    return (existentes[k] === 'Confirmada' || existentes[k] === 'Realizada') && !enAgenda[k];
  });
  var sinFila = Object.keys(excepciones).filter(function (k) { return !usadas[k]; }).map(function (k) { return excepciones[k]; });

  var alertas = [];
  c7.forEach(function (k) { alertas.push({ control: 7, clave: 'traz:7:' + k, etiqueta: k, texto: 'Reserva ' + k + ' (' + existentes[k] + ') sin fila en la agenda' }); });
  c8.forEach(function (x) { alertas.push({ control: 8, clave: 'traz:8:' + x.fila + ':' + x.fecha, etiqueta: 'fila ' + x.fila, texto: 'Agenda, fila ' + x.fila + ' (' + x.fecha + '): evento sin ID de reserva ni excepción' }); });
  c9.forEach(function (x) { alertas.push({ control: 9, clave: 'traz:9:' + x.fila + ':' + x.id, etiqueta: 'fila ' + x.fila, texto: 'Agenda, fila ' + x.fila + ': «' + x.id + '» no es un ID de reserva existente' }); });
  return {
    resumen: { control7: c7.length, control8: c8.length, control9: c9.length, excepcionesAplicadas: exceptuadas,
               excepcionesSinFila: sinFila, fechasIlegibles: ilegibles },
    alertas: alertas
  };
}

/** Lee las excepciones EXC- de la pestaña Control: { "d/m|hh:mm|valor": "EXC-AAAA-NNN" }. */
function leerExcepciones_(hoja) {
  var salida = {};
  if (!hoja) return salida;
  var n = hoja.getLastRow();
  if (!n) return salida;
  hoja.getRange(1, 1, n, 8).getDisplayValues().forEach(function (r) {
    var id = String(r[0]).trim();
    var estado = String(r[7]).trim();
    if (RE_EXCEPCION.test(id) && (estado === 'Vigente' || estado === 'Cerrada')) salida[claveEvento_(r[1], r[2], numero_(r[3]))] = id;
  });
  return salida;
}

function claveEvento_(fecha, hora, valor) {
  var m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(fecha).trim());
  var h = /^(\d{1,2}):(\d{2})/.exec(String(hora).trim());
  return (m ? Number(m[1]) + '/' + Number(m[2]) : String(fecha).trim()) + '|' + (h ? Number(h[1]) + ':' + h[2] : String(hora).trim()) + '|' + valor;
}

function numero_(texto) { return Number(String(texto).replace(/[^\d]/g, '')) || 0; }

/** «3/12» o «03/12» → fecha. Meses desde MES_INICIO pertenecen al año de la temporada; los anteriores, al siguiente. */
function fechaAgenda_(texto, anio, mesInicio) {
  var m = /^(\d{1,2})\/(\d{1,2})$/.exec(String(texto).trim());
  if (!m) return null;
  var d = Number(m[1]), mes = Number(m[2]);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  return new Date((mes >= mesInicio ? anio : anio + 1) + '-' + ('0' + mes).slice(-2) + '-' + ('0' + d).slice(-2) + 'T00:00:00');
}
