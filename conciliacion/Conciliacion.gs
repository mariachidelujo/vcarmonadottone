/**
 * Conciliación Wix → Google Sheets — Artistas a Domicilio (versión 2)
 *
 * Comprueba que cada solicitud enviada en Wix tenga su fila en la planilla que escribe su automatización.
 * Solo lee Wix, Gmail y las planillas; escribe únicamente en la pestaña «Conciliación» del Registro.
 *
 *   - Formularios nuevos (Wix Forms): cada envío se busca por su ID en la columna donde la automatización
 *     escribe el ID del envío. Solo se exigen los envíos posteriores a la creación de la automatización.
 *   - Formularios antiguos («comp-…»): no están en la API de envíos. Cada aviso de correo de Wix se
 *     empareja con UNA fila por teléfono (8 últimos dígitos) y fecha del evento normalizada; el nombre
 *     confirma. Sin fecha coincidente pero con teléfono y nombre: «REVISAR». Sin teléfono: «SIN FILA».
 *   - Automatizaciones: estado, revisión y cuenta de Google frente a lo esperado y a la última lectura.
 *
 * Modos: conciliar() cada 30 min; resumenDiario() a las 08:30; validacionSoloLectura(dias) no escribe
 * nada, no envía correos y no cambia el estado: devuelve un informe para revisar antes de instalar.
 * Datos personales: los cuerpos de los avisos se procesan en memoria; solo se registran ID y fechas.
 */

var MIN_EDAD_ALERTA_MS = 30 * 60 * 1000;
var SOLAPAMIENTO_MS = 2 * 60 * 60 * 1000;
var VENTANA_INICIAL_MS = 48 * 60 * 60 * 1000;
var MAX_PAGINAS = 10;
var MAX_ALERTADOS = 1000;
var SILENCIO_ERROR_MS = 6 * 60 * 60 * 1000;
var RUTA_ENVIOS = '/form-submission-service/v4/submissions/namespace/query';
var RUTA_AUTOMATIZACION = '/automations-service/v2/automations/';

function conciliar() { return ejecutar_({ modo: 'normal' }); }
function resumenDiario() { return ejecutar_({ modo: 'resumen' }); }
function validacionSoloLectura(dias) {
  var informe = ejecutar_({ modo: 'validacion', dias: dias || 30 });
  Logger.log(JSON.stringify(informe, null, 2));
  return informe;
}

function ejecutar_(op) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(op.modo === 'resumen' ? 120000 : 30000)) return null;
  var escribe = op.modo !== 'validacion';
  var props = PropertiesService.getScriptProperties();
  var ahora = new Date();
  var informe = { modo: op.modo, ejecutado: ahora.toISOString(), automatizaciones: [], formularios: [], alertas: [], advertencias: [] };
  try {
    var cfg = obtenerConfig_();
    validarConfig_(cfg);
    var desde = calcularDesde_(op, props, ahora);
    informe.desde = desde.toISOString();
    var lectura = listarEnvios_(cfg, desde);
    if (!lectura.completo) informe.advertencias.push('Ventana incompleta: hay más de ' + (MAX_PAGINAS * 100) + ' envíos; no se avanza la marca de revisión.');
    var alertados = leerJson_(props, 'ALERTADOS', []);
    var usados = leerJson_(props, 'FILAS_USADAS', {});
    var nuevas = [];
    var filas = [];

    cfg.AUTOMATIZACIONES.forEach(function (a) {
      var auto = obtenerAutomatizacion_(cfg, a.id);
      var estado = resumirAutomatizacion_(auto);
      var cambio = compararConLineaBase_(props, a, estado, escribe);
      informe.automatizaciones.push({ nombre: a.nombre, status: estado.status, revision: estado.revision, cambio: cambio });
      if (cambio) {
        nuevas.push('Automatización «' + a.nombre + '»: ' + cambio);
        filas.push(fila_(ahora, desde, a.nombre, '—', '—', '—', 'SÍ', estado.status, 'Cambio: ' + cambio, 'auto:' + a.id + ':' + estado.revision + ':' + estado.status));
      }
      if (!a.formId && !a.legado) return;
      if (estado.status !== 'ACTIVE') {
        var cuantos = a.formId ? lectura.envios.filter(function (s) { return s.formId === a.formId; }).length : '—';
        informe.formularios.push({ nombre: a.nombre, inactiva: true, envios: cuantos });
        if (op.modo === 'resumen') filas.push(fila_(ahora, desde, a.nombre, cuantos, 'No aplica', 'No aplica', 'No', estado.status, 'Automatización inactiva: solo recuento', null));
        return;
      }
      var r = a.legado ? conciliarLegado_(cfg, a, auto, desde, ahora, usados, op.modo === 'validacion')
                       : conciliarNuevo_(cfg, a, auto, lectura.envios, ahora);
      informe.formularios.push(r.resumen);
      var nuevasAqui = 0;
      r.faltantes.forEach(function (f) {
        if (alertados.indexOf(f.clave) !== -1) return;
        alertados.push(f.clave);
        nuevasAqui++;
        nuevas.push(f.texto);
      });
      if (op.modo === 'resumen' || nuevasAqui) {
        filas.push(fila_(ahora, desde, a.nombre, r.resumen.total, r.resumen.conciliados + ' de ' + r.resumen.exigibles,
                         r.faltantes.length ? r.faltantes.map(function (f) { return f.etiqueta; }).join('; ') : 'Ninguno',
                         r.faltantes.length ? 'SÍ' : 'No', estado.status, r.resumen.criterio,
                         nuevasAqui ? 'alerta:' + r.faltantes.map(function (f) { return f.clave; }).join(',') : null));
      }
    });

    // Controles 7 a 9 de trazabilidad (Trazabilidad.gs): solo en el resumen diario y en la validación.
    if (op.modo !== 'normal' && cfg.TRAZABILIDAD) {
      try {
        var traz = controlesAgenda_(cfg);
        informe.trazabilidad = traz.resumen;
        traz.alertas.forEach(function (al) {
          if (alertados.indexOf(al.clave) !== -1) return;
          alertados.push(al.clave);
          nuevas.push(al.texto);
          filas.push(fila_(ahora, desde, 'Trazabilidad · control ' + al.control, '—', '—', al.etiqueta, 'SÍ', '—', al.texto, al.clave));
        });
      } catch (eT) {
        // Un problema con la agenda no debe detener la conciliación de formularios.
        var msg = 'Trazabilidad no disponible (no se pudo leer la agenda o Reservas): ' + String(eT && eT.message || eT).slice(0, 150);
        informe.advertencias.push(msg);
        nuevas.push(msg);
      }
    }

    informe.alertas = nuevas;
    if (!escribe) return informe;

    // Latido diario visible en «Conciliación» (una fila por día, idempotente): permite comprobar desde el
    // Registro que el monitor sigue corriendo, sin abrir el proyecto ni el correo corporativo.
    if (op.modo === 'resumen') {
      var ultimoError = leerJson_(props, 'ULTIMO_ERROR', null);
      filas.push(fila_(ahora, desde, 'Monitor (latido diario)', '—', '—', '—', nuevas.length ? 'SÍ' : 'No', 'OK',
        'Ejecuciones desde el último resumen: ' + (leerNumero_(props, 'EJECUCIONES') + 1) + ' · errores: ' + leerNumero_(props, 'ERRORES') +
        ' · último error: ' + (ultimoError && ultimoError.fecha ? ultimoError.fecha : 'ninguno'),
        'latido:' + Utilities.formatDate(ahora, 'America/Santiago', 'yyyy-MM-dd')));
    }

    // Orden: filas (idempotentes por clave) → estado → correo. Si el correo falla, la fila ya existe.
    if (filas.length) escribirFilas_(cfg, filas);
    guardarJson_(props, 'ALERTADOS', alertados.slice(-MAX_ALERTADOS));
    guardarJson_(props, 'FILAS_USADAS', usados);
    if (lectura.completo) props.setProperty('ULTIMA_REVISION', ahora.toISOString());
    contar_(props, 'EJECUCIONES');
    props.setProperty('LATIDO', ahora.toISOString());
    if (nuevas.length) {
      MailApp.sendEmail(cfg.CORREO_ALERTAS, 'ALERTA conciliación Wix → planillas',
        nuevas.join('\n') + '\n\nDetalle en la pestaña «Conciliación» del Registro. Recuperación: README, sección «Recuperación».');
    }
    if (op.modo === 'resumen') {
      MailApp.sendEmail(cfg.CORREO_ALERTAS, 'Conciliación diaria: ' + (nuevas.length ? 'CON ALERTAS' : 'sin incidencias'),
        resumenTexto_(informe) + '\nEjecuciones desde el último resumen: ' + leerNumero_(props, 'EJECUCIONES') +
        ' · errores: ' + leerNumero_(props, 'ERRORES') + '\nSi este correo no llega un día, el monitor dejó de funcionar.');
      props.setProperty('EJECUCIONES', '0');
      props.setProperty('ERRORES', '0');
    }
    return informe;
  } catch (e) {
    if (escribe) manejarError_(props, e, ahora);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function calcularDesde_(op, props, ahora) {
  if (op.modo === 'validacion') return new Date(ahora.getTime() - op.dias * 24 * 60 * 60 * 1000);
  if (op.modo === 'resumen') return new Date(ahora.getTime() - 24 * 60 * 60 * 1000);
  var ultima = props.getProperty('ULTIMA_REVISION');
  return ultima ? new Date(new Date(ultima).getTime() - SOLAPAMIENTO_MS) : new Date(ahora.getTime() - VENTANA_INICIAL_MS);
}

/* ---------- Formularios nuevos ---------- */

function conciliarNuevo_(cfg, a, auto, envios, ahora) {
  var destino = buscarDestino_(auto);
  var claves = leerClavesDestino_(destino);
  var inicioCobertura = new Date(Math.max(new Date(auto.createdDate).getTime(), a.desde ? new Date(a.desde).getTime() : 0));
  var excluidos = (cfg.EXCLUIDOS && cfg.EXCLUIDOS.envios) || [];
  var res = { nombre: a.nombre, tipo: 'nuevo', total: 0, exigibles: 0, conciliados: 0, recientes: 0, excluidos: 0, fueraDeCobertura: 0,
              criterio: 'ID de envío en la columna ' + (destino.columna + 1) + ' de la planilla de destino' };
  var faltantes = [];
  envios.filter(function (s) { return s.formId === a.formId; }).forEach(function (s) {
    res.total++;
    if (excluidos.indexOf(s.id) !== -1) { res.excluidos++; return; }
    if (new Date(s.createdDate) < inicioCobertura) { res.fueraDeCobertura++; return; }
    res.exigibles++;
    if (claves[s.id]) { res.conciliados++; return; }
    if (ahora.getTime() - new Date(s.createdDate).getTime() <= MIN_EDAD_ALERTA_MS) { res.recientes++; return; }
    faltantes.push({ clave: s.id, etiqueta: s.id + ' ' + s.createdDate, texto: 'Envío ' + s.id + ' («' + a.nombre + '», ' + s.createdDate + ') sin fila en su planilla.' });
  });
  res.sinFila = faltantes.length;
  return { resumen: res, faltantes: faltantes };
}

/* ---------- Formularios antiguos ---------- */

function conciliarLegado_(cfg, a, auto, desde, ahora, usados, soloLectura) {
  var destino = buscarDestinoPlanilla_(auto, a.legado.columnas);
  var filas = leerFilasLegado_(destino);
  var avisos = buscarAvisos_(a.legado.asuntoAviso, desde).sort(function (x, y) { return x.fecha - y.fecha; });
  var excluidos = (cfg.EXCLUIDOS && cfg.EXCLUIDOS.avisos) || [];
  var claveUso = 'auto:' + a.id;
  var usadosAqui = soloLectura ? {} : (usados[claveUso] = usados[claveUso] || {});
  var usadosVentana = {};
  var res = { nombre: a.nombre, tipo: 'antiguo', total: avisos.length, exigibles: 0, conciliados: 0, sinFila: 0, revisar: 0, ilegibles: 0,
              recientes: 0, excluidos: 0, criterio: 'Aviso de correo ↔ fila por teléfono (8 dígitos) y fecha del evento; el nombre confirma' };
  var faltantes = [];
  avisos.forEach(function (av) {
    if (excluidos.indexOf(av.id) !== -1 || /\bprueba\b/i.test(av.nombre)) { res.excluidos++; return; }
    if (ahora.getTime() - av.fecha.getTime() <= MIN_EDAD_ALERTA_MS) { res.recientes++; return; }
    res.exigibles++;
    if (!av.tel || !av.fechaEvento) {
      res.ilegibles++;
      faltantes.push({ clave: av.id, etiqueta: 'ILEGIBLE aviso ' + av.id,
                       texto: 'Formulario antiguo «' + a.nombre + '»: no se pudo leer el teléfono o la fecha del aviso ' + av.id + ' (¿cambió la plantilla del aviso de Wix?).' });
      return;
    }
    if (usadosAqui[av.id]) { res.conciliados++; return; }   // ya emparejado en una ejecución anterior
    var candidatas = filas.filter(function (f) { return f.tel && f.tel === av.tel; });
    var exactas = candidatas.filter(function (f) { return f.fecha === av.fechaEvento && disponible_(f, usadosAqui, usadosVentana); });
    exactas.sort(function (x, y) { return (y.nombre === av.nombre) - (x.nombre === av.nombre); });
    if (exactas.length) {
      usadosVentana[exactas[0].firma] = (usadosVentana[exactas[0].firma] || 0) + 1;
      if (!soloLectura) usadosAqui[av.id] = exactas[0].firma;
      res.conciliados++;
      return;
    }
    var porNombre = candidatas.filter(function (f) { return f.nombre && f.nombre === av.nombre; });
    var etiqueta = 'aviso ' + av.id + ' ' + av.fecha.toISOString();
    if (porNombre.length) {
      res.revisar++;
      faltantes.push({ clave: av.id, etiqueta: 'REVISAR ' + etiqueta,
                       texto: 'Formulario antiguo «' + a.nombre + '»: el aviso ' + av.id + ' coincide por teléfono y nombre pero no por fecha del evento. Revisar.' });
    } else {
      res.sinFila++;
      faltantes.push({ clave: av.id, etiqueta: 'SIN FILA ' + etiqueta,
                       texto: 'Formulario antiguo «' + a.nombre + '»: el aviso ' + av.id + ' (' + av.fecha.toISOString() + ') no tiene fila con su teléfono.' });
    }
  });
  return { resumen: res, faltantes: faltantes };
}

function disponible_(fila, usadosAqui, usadosVentana) {
  var previos = Object.keys(usadosAqui).filter(function (k) { return usadosAqui[k] === fila.firma; }).length;
  return previos + (usadosVentana[fila.firma] || 0) < fila.repeticiones;
}

function leerFilasLegado_(destino) {
  var hoja = abrirPestana_(destino);
  var ultima = hoja.getLastRow();
  if (ultima < 2) return [];
  var ancho = Math.max(destino.col.telefono, destino.col.fecha, destino.col.nombre) + 1;
  var valores = hoja.getRange(2, 1, ultima - 1, ancho).getDisplayValues();
  var filas = valores.map(function (v) {
    return { tel: normalizarTelefono_(v[destino.col.telefono]), fecha: normalizarFecha_(v[destino.col.fecha]), nombre: normalizarTexto_(v[destino.col.nombre]) };
  }).filter(function (f) { return f.tel; });
  var cuenta = {};
  filas.forEach(function (f) { f.firma = f.tel + '|' + f.fecha + '|' + f.nombre; cuenta[f.firma] = (cuenta[f.firma] || 0) + 1; });
  filas.forEach(function (f) { f.repeticiones = cuenta[f.firma]; });
  return filas;
}

/** Avisos de Wix por asunto, incluida la carpeta de spam. Usa el servicio avanzado de Gmail (solo lectura). */
function buscarAvisos_(asunto, desde) {
  var consulta = 'in:anywhere subject:"' + asunto + '" after:' + Math.floor(desde.getTime() / 1000);
  var ids = [];
  var token = null;
  do {
    var parametros = { q: consulta, maxResults: 100 };
    if (token) parametros.pageToken = token;
    var lista = Gmail.Users.Messages.list('me', parametros);
    (lista.messages || []).forEach(function (m) { ids.push(m.id); });
    token = lista.nextPageToken;
  } while (token && ids.length < 500);
  return ids.map(function (id) {
    var m = Gmail.Users.Messages.get('me', id, { format: 'full' });
    var cuerpo = textoPlano_(m.payload);
    var campo = function (etiqueta) {
      var r = new RegExp('\\n\\s*' + etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s:\\s*([^\\n]*)').exec('\n' + cuerpo);
      return r ? r[1].trim() : '';
    };
    return { id: id, fecha: new Date(Number(m.internalDate)), tel: normalizarTelefono_(campo('Numero de Celular')),
             fechaEvento: normalizarFecha_(campo('Fecha de tu Evento')), nombre: normalizarTexto_(campo('Nombre')) };
  }).filter(function (av) { return av.fecha > desde; });
}

function textoPlano_(parte) {
  if (!parte) return '';
  if (parte.mimeType === 'text/plain' && parte.body && parte.body.data) {
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(parte.body.data)).getDataAsString('UTF-8');
  }
  var partes = parte.parts || [];
  for (var i = 0; i < partes.length; i++) {
    var t = textoPlano_(partes[i]);
    if (t) return t;
  }
  return '';
}

function normalizarTelefono_(t) {
  var d = String(t || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-8) : '';
}

function normalizarTexto_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).join(' ');
}

function normalizarFecha_(s) {
  return normalizarTexto_(s).split(' ').filter(function (w) {
    return ['lunes', 'martes', 'marts', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'de', 'del'].indexOf(w) === -1;
  }).join(' ');
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
  for (var intento = 0; intento < 3; intento++) {
    var r = UrlFetchApp.fetch('https://www.wixapis.com' + ruta, opciones);
    var codigo = r.getResponseCode();
    if (codigo >= 200 && codigo < 300) return JSON.parse(r.getContentText() || '{}');
    if (codigo !== 429 && codigo < 500) {
      // Se oculta la clave antes de recortar: un recorte previo podría dejar un fragmento de ella.
      throw new Error('Wix ' + metodo.toUpperCase() + ' ' + ruta.split('?')[0] + ' → ' + codigo + ': ' +
        ocultarClave_(r.getContentText(), cfg.WIX_API_KEY).slice(0, 200));
    }
    Utilities.sleep(2000 * (intento + 1));
  }
  throw new Error('Wix ' + ruta.split('?')[0] + ': sin respuesta válida tras 3 intentos (último código ' + codigo + ')');
}

function listarEnvios_(cfg, desde) {
  var envios = [];
  var cursor = null;
  for (var pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    var cuerpo = {
      query: {
        filter: { namespace: 'wix.form_app.form', createdDate: { $gt: desde.toISOString() } },
        sort: [{ fieldName: 'createdDate', order: 'DESC' }],
        cursorPaging: cursor ? { limit: 100, cursor: cursor } : { limit: 100 }
      }
    };
    var res = wix_(cfg, 'post', RUTA_ENVIOS, cuerpo);
    var items = res.submissions || [];
    items.forEach(function (s) { envios.push({ id: s.id, formId: s.formId, createdDate: s.createdDate }); });
    var sig = res.metadata && res.metadata.cursors && res.metadata.cursors.next;
    if (!sig || sig === cursor || !items.length) return { envios: envios, completo: true };
    cursor = sig;
  }
  return { envios: envios, completo: false };
}

function obtenerAutomatizacion_(cfg, id) {
  return wix_(cfg, 'get', RUTA_AUTOMATIZACION + id).automation;
}

function resumirAutomatizacion_(auto) {
  var cuentas = accionesPlanilla_(auto).map(function (m) { return m.accountId; })
    .filter(function (c, i, arr) { return c && arr.indexOf(c) === i; }).sort();
  return { status: auto.configuration.status, revision: String(auto.revision), cuentas: cuentas.join(',') };
}

/** Compara con lo esperado (Config) en la primera lectura y con la lectura anterior después. Avisa una vez por cambio. */
function compararConLineaBase_(props, a, estado, escribe) {
  var clave = 'BASE_' + a.id;
  var guardada = props.getProperty(clave);
  var base = guardada ? JSON.parse(guardada) : (a.esperado || null);
  var cambios = [];
  if (base) {
    if (base.status && base.status !== estado.status) cambios.push('estado ' + base.status + ' → ' + estado.status);
    if (base.revision && base.revision !== estado.revision) cambios.push('revisión ' + base.revision + ' → ' + estado.revision);
    if (base.cuentas && base.cuentas !== estado.cuentas) cambios.push('cuenta de Google ' + base.cuentas + ' → ' + estado.cuentas);
  }
  if (escribe) props.setProperty(clave, JSON.stringify(estado));
  return cambios.length ? cambios.join('; ') : null;
}

/* ---------- Planillas ---------- */

function accionesPlanilla_(auto) {
  var acciones = (auto.configuration && auto.configuration.actions) || {};
  return Object.keys(acciones).map(function (k) {
    return acciones[k].appDefinedInfo && acciones[k].appDefinedInfo.inputMapping;
  }).filter(function (m) { return m && m.spreadsheetId; });
}

function buscarDestino_(auto) {
  var destino = null;
  accionesPlanilla_(auto).forEach(function (m) {
    var porId = (m.contentMapping || []).filter(function (c) { return /var\("submissionId"\)/.test(c.value || ''); })[0];
    if (porId && !destino) destino = { spreadsheetId: m.spreadsheetId, sheetId: Number(m.sheetId), columna: porId.index };
  });
  if (!destino) throw new Error('La automatización ' + auto.id + ' no escribe el ID del envío en ninguna columna');
  return destino;
}

function buscarDestinoPlanilla_(auto, columnas) {
  var m = accionesPlanilla_(auto)[0];
  if (!m) throw new Error('La automatización ' + auto.id + ' no tiene acción de planilla');
  var indice = function (encabezado) {
    var c = (m.contentMapping || []).filter(function (x) { return normalizarTexto_(x.header) === normalizarTexto_(encabezado); })[0];
    if (!c) throw new Error('La automatización ' + auto.id + ' no tiene la columna «' + encabezado + '»');
    return c.index;
  };
  return { spreadsheetId: m.spreadsheetId, sheetId: Number(m.sheetId),
           col: { telefono: indice(columnas.telefono), fecha: indice(columnas.fecha), nombre: indice(columnas.nombre) } };
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
  var claves = {};
  if (ultima < 2) return claves;
  hoja.getRange(2, destino.columna + 1, ultima - 1, 1).getDisplayValues().forEach(function (f) {
    var v = String(f[0] || '').trim();
    if (v) claves[v] = true;
  });
  return claves;
}

/* ---------- Registro ---------- */

function fila_(ahora, desde, nombre, envios, conFila, sinFila, alerta, estado, obs, clave) {
  var tz = 'America/Santiago';
  return { clave: clave, valores: [Utilities.formatDate(ahora, tz, 'dd-MM-yyyy HH:mm'),
    Utilities.formatDate(desde, tz, 'dd-MM-yyyy HH:mm') + ' → ' + Utilities.formatDate(ahora, tz, 'dd-MM-yyyy HH:mm'),
    nombre, String(envios), String(conFila), String(sinFila), alerta, estado,
    obs + (clave ? ' [' + clave + ']' : ''), 'Apps Script (cuenta corporativa)'] };
}

/** Agrega filas a «Conciliación» sin repetir una alerta ya escrita (misma clave). */
function escribirFilas_(cfg, filas) {
  var hoja = SpreadsheetApp.openById(cfg.REGISTRO_ID).getSheetByName(cfg.PESTANA_CONCILIACION);
  if (!hoja) throw new Error('No existe la pestaña ' + cfg.PESTANA_CONCILIACION);
  var ultima = hoja.getLastRow();
  var inicio = Math.max(2, ultima - 299);
  var previas = ultima >= 2 ? hoja.getRange(inicio, 9, ultima - inicio + 1, 1).getDisplayValues().join('\n') : '';
  var nuevas = filas.filter(function (f) { return !f.clave || previas.indexOf('[' + f.clave + ']') === -1; }).map(function (f) { return f.valores; });
  if (!nuevas.length) return;
  hoja.getRange(ultima + 1, 1, nuevas.length, nuevas[0].length).setNumberFormat('@').setValues(nuevas);
}

/**
 * Quita la clave de Wix de cualquier texto que pueda terminar en una fila, un correo o el registro de
 * ejecución: su valor exacto y cualquier valor que siga a «Authorization».
 */
function ocultarClave_(texto, clave) {
  var t = String(texto);
  if (clave && String(clave).length >= 8) t = t.split(String(clave)).join('[clave oculta]');
  return t.replace(/(authorization["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[clave oculta]');
}

function manejarError_(props, e, ahora) {
  contar_(props, 'ERRORES');
  var clave = null;
  try { clave = obtenerConfig_().WIX_API_KEY; } catch (e3) { /* sin configuración: no hay clave que ocultar */ }
  var texto = ocultarClave_(String(e && e.message || e), clave).slice(0, 300);
  var previo = leerJson_(props, 'ULTIMO_ERROR', null);
  if (previo && previo.texto === texto && ahora.getTime() - new Date(previo.fecha).getTime() < SILENCIO_ERROR_MS) return;
  guardarJson_(props, 'ULTIMO_ERROR', { texto: texto, fecha: ahora.toISOString() });
  try {
    var cfg = obtenerConfig_();
    escribirFilas_(cfg, [fila_(ahora, ahora, 'Monitor', '—', '—', '—', 'ERROR', '—', texto, null)]);
    MailApp.sendEmail(cfg.CORREO_ALERTAS, 'ERROR en la conciliación Wix → planillas', texto);
  } catch (e2) { /* el propio activador también notifica la falla */ }
}

function resumenTexto_(informe) {
  var t = informe.trazabilidad;
  var traz = t ? '\nTrazabilidad agenda ↔ CRM: control 7: ' + t.control7 + ' · control 8: ' + t.control8 + ' · control 9: ' + t.control9 +
    ' · excepciones aplicadas: ' + t.excepcionesAplicadas +
    (t.excepcionesSinFila && t.excepcionesSinFila.length ? ' · excepciones sin fila en la agenda (revisar): ' + t.excepcionesSinFila.join(', ') : '') +
    (t.fechasIlegibles ? ' · ' + t.fechasIlegibles + ' fechas de agenda ilegibles' : '') : '';
  return informe.formularios.map(function (f) {
    if (f.inactiva) return f.nombre + ': automatización inactiva (' + f.envios + ' envíos)';
    return f.nombre + ': ' + f.conciliados + ' de ' + f.exigibles + ' conciliados' + (f.sinFila ? ' · ' + f.sinFila + ' SIN FILA' : '') +
      (f.revisar ? ' · ' + f.revisar + ' por revisar' : '') + (f.ilegibles ? ' · ' + f.ilegibles + ' avisos ilegibles' : '') +
      (f.excluidos ? ' · ' + f.excluidos + ' pruebas excluidas' : '');
  }).join('\n') + traz;
}

function leerJson_(props, clave, defecto) {
  var v = props.getProperty(clave);
  return v ? JSON.parse(v) : defecto;
}
function guardarJson_(props, clave, valor) { props.setProperty(clave, JSON.stringify(valor)); }
function leerNumero_(props, clave) { return Number(props.getProperty(clave) || 0); }
function contar_(props, clave) { props.setProperty(clave, String(leerNumero_(props, clave) + 1)); }

function validarConfig_(cfg) {
  ['WIX_API_KEY', 'WIX_SITE_ID', 'REGISTRO_ID', 'PESTANA_CONCILIACION', 'CORREO_ALERTAS'].forEach(function (k) {
    if (!cfg[k] || /^</.test(String(cfg[k]))) throw new Error('Falta configurar ' + k);
  });
  cfg.AUTOMATIZACIONES.forEach(function (a) {
    if (!a.id || /^</.test(a.id)) throw new Error('Falta el ID de la automatización «' + a.nombre + '»');
    if (a.legado && !(a.legado.asuntoAviso && a.legado.columnas)) throw new Error('Falta la configuración de aviso de «' + a.nombre + '»');
  });
  var t = cfg.TRAZABILIDAD;
  if (t) {
    ['CRM_ID', 'AGENDA_ID', 'PESTANA_AGENDA', 'INICIO_CONTROL'].forEach(function (k) {
      if (!t[k] || /^</.test(String(t[k]))) throw new Error('Falta configurar TRAZABILIDAD.' + k);
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.INICIO_CONTROL)) throw new Error('TRAZABILIDAD.INICIO_CONTROL debe tener el formato AAAA-MM-DD');
  }
}

/* ---------- Instalación y diagnóstico ---------- */

function instalarActivadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['conciliar', 'resumenDiario'].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('conciliar').timeBased().everyMinutes(30).create();
  ScriptApp.newTrigger('resumenDiario').timeBased().everyDays(1).atHour(8).nearMinute(30).inTimezone('America/Santiago').create();
}

function desinstalarActivadores() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

/**
 * Prueba de extremo a extremo del canal de alertas, sin datos de clientes y sin tocar el CRM ni Wix:
 * escribe una fila «PRUEBA» en «Conciliación» y envía un correo a CORREO_ALERTAS. Ejecutarla dos veces
 * debe dejar una sola fila (idempotencia). Borrar la fila después de documentar la prueba.
 */
function pruebaAlertaControlada() {
  var cfg = obtenerConfig_();
  validarConfig_(cfg);
  var ahora = new Date();
  var clave = 'prueba-alerta:' + Utilities.formatDate(ahora, 'America/Santiago', 'yyyy-MM-dd');
  escribirFilas_(cfg, [fila_(ahora, ahora, 'PRUEBA del canal de alertas', '—', '—', '—', 'PRUEBA', '—', 'Prueba controlada; no corresponde a un envío', clave)]);
  MailApp.sendEmail(cfg.CORREO_ALERTAS, 'PRUEBA — canal de alertas de la conciliación', 'Prueba controlada del monitor. No requiere acción.');
  return clave;
}

/** Comprueba credenciales y permisos sin escribir nada. No muestra la clave. */
function diagnosticoCredenciales() {
  var cfg = obtenerConfig_();
  var salida = { clave: cfg.WIX_API_KEY ? 'configurada (' + cfg.WIX_API_KEY.length + ' caracteres)' : 'FALTA' };
  var err = function (e) { return ocultarClave_(String(e), cfg.WIX_API_KEY).slice(0, 200); };
  try { listarEnvios_(cfg, new Date(Date.now() - 24 * 3600 * 1000)); salida.envios = 'OK'; } catch (e) { salida.envios = err(e); }
  try { obtenerAutomatizacion_(cfg, cfg.AUTOMATIZACIONES[0].id); salida.automatizaciones = 'OK'; } catch (e) { salida.automatizaciones = err(e); }
  try { Gmail.Users.Messages.list('me', { q: 'subject:"Nuevo envío"', maxResults: 1 }); salida.gmail = 'OK'; } catch (e) { salida.gmail = err(e); }
  try { SpreadsheetApp.openById(cfg.REGISTRO_ID).getSheetByName(cfg.PESTANA_CONCILIACION).getLastRow(); salida.registro = 'OK'; } catch (e) { salida.registro = err(e); }
  Logger.log(JSON.stringify(salida, null, 2));
  return salida;
}
