/**
 * Conciliación diaria Wix → Google Sheets — Artistas a Domicilio
 *
 * Qué hace (solo lectura, salvo la pestaña «Conciliación» del Registro):
 *   1. Lista los envíos de formularios de Wix desde la última revisión (con 2 h de solapamiento).
 *   2. Para cada automatización Wix → Google Sheets vigilada, lee su mapeo de columnas
 *      directamente desde Wix y busca cada envío en su planilla de destino.
 *   3. Compara estado, revisión y cuenta de Google de cada automatización con la línea base.
 *   4. Si un envío lleva más de 30 minutos sin su fila, o cambia una automatización,
 *      escribe una fila ALERTA en «Conciliación» y envía un correo a la cuenta corporativa.
 *   5. Una vez al día (08:30, America/Santiago) escribe el resumen y envía un correo breve.
 *      Si ese correo diario no llega, el monitor dejó de funcionar.
 *
 * No escribe en el CRM ni en las planillas operativas; no modifica Wix.
 * Configuración: archivo Config.gs (no se versiona; ver Config.example.gs).
 */

var MIN_EDAD_ALERTA_MS = 30 * 60 * 1000;
var SOLAPAMIENTO_MS = 2 * 60 * 60 * 1000;
var VENTANA_INICIAL_MS = 48 * 60 * 60 * 1000;
var MAX_ALERTADOS = 500;

function conciliar() {
  ejecutar_({ resumen: false });
}

function resumenDiario() {
  ejecutar_({ resumen: true });
}

function ejecutar_(opciones) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  var props = PropertiesService.getScriptProperties();
  var ahora = new Date();
  try {
    var cfg = obtenerConfig_();
    var ultima = props.getProperty('ULTIMA_REVISION');
    var desde = ultima ? new Date(new Date(ultima).getTime() - SOLAPAMIENTO_MS)
                       : new Date(ahora.getTime() - VENTANA_INICIAL_MS);
    if (opciones.resumen) desde = new Date(ahora.getTime() - 24 * 60 * 60 * 1000);

    var envios = listarEnvios_(cfg, desde);
    var alertados = JSON.parse(props.getProperty('ALERTADOS') || '[]');
    var nuevasAlertas = [];
    var filas = [];
    var estadoAutos = [];

    cfg.AUTOMATIZACIONES.forEach(function (a) {
      var auto = obtenerAutomatizacion_(cfg, a.id);
      var estado = resumirAutomatizacion_(auto);
      estadoAutos.push(a.nombre + ': ' + estado.status + ' rev ' + estado.revision);
      var cambio = compararConLineaBase_(props, a.id, estado);
      if (cambio) {
        nuevasAlertas.push('Automatización «' + a.nombre + '» cambió: ' + cambio);
        filas.push(fila_(ahora, desde, a.nombre, '—', '—', '—', 'SÍ', estado.status, 'Cambio: ' + cambio));
      }
      if (a.legado) {
        if (estado.status !== 'ACTIVE') return;
        var r = conciliarLegado_(props, a, buscarDestinoPlanilla_(auto), desde, ahora);
        var firma = 'LEGADO_ALERTA_' + a.id;
        var alertaNueva = r.alerta && props.getProperty(firma) !== String(r.avisos - r.filasNuevas);
        if (r.alerta) props.setProperty(firma, String(r.avisos - r.filasNuevas)); else props.deleteProperty(firma);
        if (alertaNueva) nuevasAlertas.push('Formulario antiguo «' + a.nombre + '»: ' + r.avisos + ' avisos y ' + r.filasNuevas + ' filas nuevas.');
        if (opciones.resumen || alertaNueva) {
          filas.push(fila_(ahora, desde, a.nombre, r.avisos + ' avisos', r.filasNuevas + ' filas nuevas',
                           r.alerta ? 'Diferencia: ' + (r.avisos - r.filasNuevas) : 'Ninguno', r.alerta ? 'SÍ' : 'No',
                           estado.status, 'Formulario antiguo: recuento de avisos de correo frente a filas agregadas'));
        }
        return;
      }
      if (!a.formId) return;
      var delFormulario = envios.filter(function (s) { return s.formId === a.formId; });
      if (estado.status !== 'ACTIVE') {
        if (opciones.resumen) {
          filas.push(fila_(ahora, desde, a.nombre, delFormulario.length, 'No aplica', 'No aplica',
                           'No', estado.status, 'Automatización inactiva: envíos sin planilla de destino (solo recuento)'));
        }
        return;
      }
      var destino = buscarDestino_(auto);
      var claves = leerClavesDestino_(destino);
      var conFila = 0;
      var faltantes = [];
      delFormulario.forEach(function (s) {
        if (estaEnDestino_(s, destino, claves)) { conFila++; return; }
        var edad = ahora.getTime() - new Date(s.createdDate).getTime();
        if (edad > MIN_EDAD_ALERTA_MS) faltantes.push(s);
      });
      var hayAlerta = faltantes.length > 0;
      var hayAlertaNueva = false;
      faltantes.forEach(function (s) {
        if (alertados.indexOf(s.id) === -1) {
          alertados.push(s.id);
          hayAlertaNueva = true;
          nuevasAlertas.push('Envío ' + s.id + ' (' + a.nombre + ', ' + s.createdDate + ') sin fila en su planilla.');
        }
      });
      if (opciones.resumen || hayAlertaNueva) {
        filas.push(fila_(ahora, desde, a.nombre, delFormulario.length, conFila + ' de ' + delFormulario.length,
                         hayAlerta ? faltantes.map(function (s) { return s.id + ' ' + s.createdDate; }).join('; ') : 'Ninguno',
                         hayAlerta ? 'SÍ' : 'No', estado.status, 'Coincidencia por ID de envío'));
      }
    });

    if (filas.length) escribirFilas_(cfg, filas);
    if (alertados.length > MAX_ALERTADOS) alertados = alertados.slice(alertados.length - MAX_ALERTADOS);
    props.setProperty('ALERTADOS', JSON.stringify(alertados));
    props.setProperty('ULTIMA_REVISION', ahora.toISOString());

    if (nuevasAlertas.length) {
      MailApp.sendEmail(cfg.CORREO_ALERTAS, 'ALERTA conciliación Wix → planillas',
        nuevasAlertas.join('\n') + '\n\nRevise la pestaña «Conciliación» del Registro y el envío en el panel de Wix. ' +
        'Procedimiento de recuperación: README de la conciliación, sección «Recuperación».');
    }
    if (opciones.resumen) {
      MailApp.sendEmail(cfg.CORREO_ALERTAS, 'Conciliación diaria: ' + (nuevasAlertas.length ? 'CON ALERTAS' : 'sin incidencias'),
        envios.length + ' envíos revisados en las últimas 24 h.\n' + estadoAutos.join('\n') +
        '\n\nSi este correo no llega un día, el monitor dejó de funcionar.');
    }
  } catch (e) {
    try {
      var cfgErr = obtenerConfig_();
      escribirFilas_(cfgErr, [fila_(ahora, ahora, 'Monitor', '—', '—', '—', 'ERROR', '—', String(e).slice(0, 400))]);
      MailApp.sendEmail(cfgErr.CORREO_ALERTAS, 'ERROR en la conciliación Wix → planillas', String(e));
    } catch (e2) { /* el propio activador notificará la falla */ }
    throw e;
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Wix ---------- */

function wix_(cfg, metodo, ruta, cuerpo) {
  var opciones = {
    method: metodo,
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'Authorization': cfg.WIX_API_KEY, 'wix-site-id': cfg.WIX_SITE_ID }
  };
  if (cuerpo) opciones.payload = JSON.stringify(cuerpo);
  var r = UrlFetchApp.fetch('https://www.wixapis.com' + ruta, opciones);
  var codigo = r.getResponseCode();
  if (codigo < 200 || codigo >= 300) {
    throw new Error('Wix ' + metodo + ' ' + ruta + ' → ' + codigo + ': ' + r.getContentText().slice(0, 300));
  }
  return JSON.parse(r.getContentText() || '{}');
}

function listarEnvios_(cfg, desde) {
  var todos = [];
  var cursor = null;
  for (var pagina = 0; pagina < 5; pagina++) {
    var paginacion = cursor ? { limit: 100, cursor: cursor } : { limit: 100 };
    var cuerpo = {
      query: {
        filter: { namespace: 'wix.form_app.form', createdDate: { $gt: desde.toISOString() } },
        sort: [{ fieldName: 'createdDate', order: 'DESC' }],
        cursorPaging: paginacion
      }
    };
    var res = wix_(cfg, 'post', '/form-submission-service/v4/submissions/namespace/query', cuerpo);
    var items = res.submissions || [];
    items.forEach(function (s) {
      todos.push({ id: s.id, formId: s.formId, createdDate: s.createdDate, contactId: s.contactId, valores: s.submissions || {} });
    });
    var sig = res.metadata && res.metadata.cursors && res.metadata.cursors.next;
    if (!sig || sig === cursor || !items.length) break;
    cursor = sig;
  }
  return todos;
}

function obtenerAutomatizacion_(cfg, id) {
  return wix_(cfg, 'get', '/automations-service/v2/automations/' + id).automation;
}

function resumirAutomatizacion_(auto) {
  var cuentas = [];
  var acciones = (auto.configuration && auto.configuration.actions) || {};
  Object.keys(acciones).forEach(function (k) {
    var m = acciones[k].appDefinedInfo && acciones[k].appDefinedInfo.inputMapping;
    if (m && m.accountId && cuentas.indexOf(m.accountId) === -1) cuentas.push(m.accountId);
  });
  return { status: auto.configuration.status, revision: String(auto.revision), cuentas: cuentas.sort().join(',') };
}

function compararConLineaBase_(props, id, estado) {
  var clave = 'BASE_' + id;
  var base = props.getProperty(clave);
  if (!base) { props.setProperty(clave, JSON.stringify(estado)); return null; }
  var b = JSON.parse(base);
  var cambios = [];
  if (b.status !== estado.status) cambios.push('estado ' + b.status + ' → ' + estado.status);
  if (b.revision !== estado.revision) cambios.push('revisión ' + b.revision + ' → ' + estado.revision);
  if (b.cuentas !== estado.cuentas) cambios.push('cuenta de Google ' + b.cuentas + ' → ' + estado.cuentas);
  if (!cambios.length) return null;
  // Se alerta una sola vez por cambio: la nueva configuración pasa a ser la línea base.
  props.setProperty(clave, JSON.stringify(estado));
  return cambios.join('; ');
}

/** Planilla y columna donde la automatización escribe el ID del envío (formularios nuevos). */
function buscarDestino_(auto) {
  var destino = null;
  accionesPlanilla_(auto).forEach(function (m) {
    var porId = (m.contentMapping || []).filter(function (c) { return /var\("submissionId"\)/.test(c.value || ''); })[0];
    if (porId && !destino) destino = { spreadsheetId: m.spreadsheetId, sheetId: Number(m.sheetId), columna: porId.index };
  });
  if (!destino) throw new Error('La automatización ' + auto.id + ' no escribe el ID del envío en ninguna columna');
  return destino;
}

/** Planilla de destino de un formulario antiguo (sin ID de envío). */
function buscarDestinoPlanilla_(auto) {
  var m = accionesPlanilla_(auto)[0];
  if (!m) throw new Error('La automatización ' + auto.id + ' no tiene acción de planilla');
  return { spreadsheetId: m.spreadsheetId, sheetId: Number(m.sheetId) };
}

function accionesPlanilla_(auto) {
  var acciones = (auto.configuration && auto.configuration.actions) || {};
  return Object.keys(acciones).map(function (k) {
    return acciones[k].appDefinedInfo && acciones[k].appDefinedInfo.inputMapping;
  }).filter(function (m) { return m && m.spreadsheetId; });
}

function abrirPestana_(destino) {
  var hoja = SpreadsheetApp.openById(destino.spreadsheetId).getSheets().filter(function (h) {
    return h.getSheetId() === destino.sheetId;
  })[0];
  if (!hoja) throw new Error('Pestaña ' + destino.sheetId + ' no encontrada en ' + destino.spreadsheetId);
  return hoja;
}

function leerClavesDestino_(destino) {
  var hoja = abrirPestana_(destino);
  var ultima = hoja.getLastRow();
  if (ultima < 2) return {};
  var valores = hoja.getRange(2, destino.columna + 1, ultima - 1, 1).getDisplayValues();
  var claves = {};
  valores.forEach(function (fila) {
    var v = String(fila[0] || '').trim();
    if (v) claves[v] = true;
  });
  return claves;
}

function estaEnDestino_(envio, destino, claves) {
  return !!claves[envio.id];
}

/**
 * Formularios antiguos de Wix: sus envíos no están en la API actual de formularios.
 * Se comparan los avisos de correo recibidos (con más de 30 minutos) con las filas agregadas
 * a la planilla. Requiere que los avisos lleguen a la cuenta que ejecuta el script (decisión 31).
 */
function conciliarLegado_(props, a, destino, desde, ahora) {
  // Contadores acumulados desde una línea base: avisos recibidos frente a filas agregadas.
  // Así un aviso y su fila nunca se cuentan en ejecuciones distintas por error.
  var hoja = abrirPestana_(destino);
  var clave = 'LEGADO_' + a.id;
  var base = JSON.parse(props.getProperty(clave) || 'null');
  if (!base) {
    base = { fecha: ahora.toISOString(), filas: hoja.getLastRow() };
    props.setProperty(clave, JSON.stringify(base));
  }
  var inicio = new Date(base.fecha);
  var limite = new Date(ahora.getTime() - MIN_EDAD_ALERTA_MS);
  var consulta = 'subject:"' + a.legado.asuntoAviso + '" after:' + Math.floor(inicio.getTime() / 1000);
  var avisos = GmailApp.search(consulta).reduce(function (n, hilo) {
    return n + hilo.getMessages().filter(function (msj) {
      return msj.getDate() > inicio && msj.getDate() <= limite;
    }).length;
  }, 0);
  var filasNuevas = Math.max(0, hoja.getLastRow() - base.filas);
  return { avisos: avisos, filasNuevas: filasNuevas, alerta: avisos > filasNuevas };
}

/** Después de resolver una alerta de un formulario antiguo, reinicia su línea base. */
function reiniciarLineaBaseLegado() {
  var props = PropertiesService.getScriptProperties();
  obtenerConfig_().AUTOMATIZACIONES.forEach(function (a) {
    if (a.legado) props.deleteProperty('LEGADO_' + a.id);
  });
}

/* ---------- Registro ---------- */

function fila_(ahora, desde, nombre, envios, conFila, sinFila, alerta, estado, obs) {
  var tz = 'America/Santiago';
  return [Utilities.formatDate(ahora, tz, 'dd-MM-yyyy HH:mm'),
          Utilities.formatDate(desde, tz, 'dd-MM-yyyy HH:mm') + ' → ' + Utilities.formatDate(ahora, tz, 'dd-MM-yyyy HH:mm'),
          nombre, String(envios), String(conFila), String(sinFila), alerta, estado, obs, 'Apps Script (cuenta corporativa)'];
}

function escribirFilas_(cfg, filas) {
  var hoja = SpreadsheetApp.openById(cfg.REGISTRO_ID).getSheetByName(cfg.PESTANA_CONCILIACION);
  if (!hoja) throw new Error('No existe la pestaña ' + cfg.PESTANA_CONCILIACION);
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, filas[0].length).setNumberFormat('@').setValues(filas);
}

/* ---------- Instalación ---------- */

function instalarActivadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['conciliar', 'resumenDiario'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('conciliar').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('resumenDiario').timeBased().everyDays(1).atHour(8).nearMinute(30)
    .inTimezone('America/Santiago').create();
}

/** Prueba sin escribir: devuelve lo que encontraría, para revisarlo en el registro de ejecución. */
function pruebaEnSeco() {
  var cfg = obtenerConfig_();
  var desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  var envios = listarEnvios_(cfg, desde);
  var salida = cfg.AUTOMATIZACIONES.map(function (a) {
    var auto = obtenerAutomatizacion_(cfg, a.id);
    var estado = resumirAutomatizacion_(auto);
    var r = { automatizacion: a.nombre, estado: estado };
    if (a.formId && estado.status === 'ACTIVE') {
      var destino = buscarDestino_(auto);
      var claves = leerClavesDestino_(destino);
      var del = envios.filter(function (s) { return s.formId === a.formId; });
      r.envios7dias = del.length;
      r.sinFila = del.filter(function (s) { return !estaEnDestino_(s, destino, claves); }).map(function (s) { return s.id; });
      r.coincidencia = destino.coincidencia;
    }
    return r;
  });
  Logger.log(JSON.stringify(salida, null, 2));
  return salida;
}
