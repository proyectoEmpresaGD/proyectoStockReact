import { randomUUID, createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
import { ClienteModel } from '../models/Postgres/clients.js';
import { StockModel } from '../models/Postgres/stock.js';
import { normalizeUserClientAccess } from '../utils/clientPortfolioAccess.js';
import { normalizeFairSubmission, assertAvailability, mailHtml, summarizeFairInventory, FAIR_LOGO_CID, escapeHtml } from './feriasRules.js';
import { createFeriasMailPolicy, FERIAS_TEST_MAILBOX, isFeriasTestMessage, prepareFeriasMailSubject } from './feriasMailRouting.js';
import { getFairRepresentative, getFairVisitorScope, isFairAdmin, fairVisitorIdentitySQL } from './feriasVisitorRegistry.js';
import { buildFairRepresentativeReport, createFairRepresentativeWorkbook } from './feriasReport.js';

const fairLogoPath = fileURLToPath(new URL('../assets/cjm-marca-negro.png', import.meta.url));
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const text = v => String(v ?? '').trim();
const normalizeUser = user => String(user?.id ?? user?.username ?? '');
const commercial = user => [user?.nombre,user?.apellido1,user?.apellido2].map(text).filter(Boolean).join(' ') || text(user?.username) || 'Comercial';
export function createFairService({ pool, mailer, stockReader = opts => StockModel.getAll(opts), clientModel = ClienteModel, env = process.env } = {}) {
  // Credenciales propias opcionales: no es necesario cambiar el correo de los demás módulos.
  const ownMailAccount = Boolean(text(env.FERIAS_EMAIL_USER) || text(env.FERIAS_EMAIL_PASS));
  const smtpUser = ownMailAccount ? text(env.FERIAS_EMAIL_USER) : text(env.EMAIL_USER);
  const smtpPass = ownMailAccount ? text(env.FERIAS_EMAIL_PASS) : text(env.EMAIL_PASS);
  const outgoing = mailer || nodemailer.createTransport({
    host: env.EMAIL_HOST || 'send.one.com', port: Number(env.EMAIL_PORT || 465),
    secure: true, auth: { user: smtpUser, pass: smtpPass },
  });
  const notificationAddress = text(env.FERIAS_PEDIDOS_EMAIL) || 'pedidos@cjmgroup.es';
  const mailPolicy = createFeriasMailPolicy(env);
  // Remitente corporativo fijo para los dos correos del módulo Ferias.
  // La cuenta SMTP autenticada debe ser info@cjmw.eu o tener permiso 'send as'.
  const senderAddress = 'CJM Worldwide <info@cjmw.eu>';
  const replyAddress = 'info@cjmw.eu';
  const mailReady = Boolean(smtpUser && smtpPass);
  // Extrae los datos disponibles de la ficha existente; no se permite que
  // el navegador sobrescriba la ficha del cliente en la solicitud de feria.
  function existingClientData(found) {
    return {
      code: text(found.codclien), company: text(found.razclien), tradingName: text(found.nomcomer),
      contact: text(found.nomclien), email: text(found.email), phone: text(found.tlfno),
      taxId: text(found.nif), address: text(found.direccion), postalCode: text(found.cp),
      city: text(found.localidad), province: text(found.codprovi), country: text(found.codpais),
      taxPersonType: text(found.codtippersona), taxRegime: text(found.codiva),
      tariffPreference: text(found.codtarifa), paymentTerms: text(found.codforpago),
      shippingTerms: text(found.portes), shippingMethod: text(found.forenvio),
      representativeCode: text(found.codrepre),
      notes: '',
    };
  }
  async function selectClient(code, user) {
    const access = normalizeUserClientAccess(user);
    if (!await clientModel.userCanAccessClient({ targetCodclien: code, ...access })) throw error('Este cliente no está en tu cartera autorizada.', 403);
    const found = await clientModel.getById({ codclien: code });
    if (!found || text(found.dadobaja).toUpperCase() === 'S') throw error('El cliente no está activo.', 400);
    return existingClientData(found);
  }
  async function lookupClients(query, user) {
    const q = text(query).slice(0,100);
    if (q.length < 2) return [];
    const access = normalizeUserClientAccess(user);
    const data = await clientModel.getAll({ offset: 0, limit: 12, query: q, ...access });
    return data.map(existingClientData);
  }
  async function searchProducts(query) {
    const q = text(query).slice(0,80);
    if (q.length < 2) return [];
    const { rows } = await pool.query(`
      SELECT codprodu::text AS code, COALESCE(desprodu,'') AS description
        FROM productos
       WHERE (codprodu::text ILIKE $1 OR desprodu ILIKE $1)
         AND COALESCE(UPPER(TRIM(obsoleto::text)), '') <> 'S'
       ORDER BY CASE WHEN UPPER(TRIM(codprodu::text)) = UPPER($2) THEN 0 ELSE 1 END, codprodu
       LIMIT 15`, [`%${q}%`,q]);
    return rows;
  }
  async function inventory(lines, db = pool) {
    const codes = [...new Set(lines.map(l => l.code))];
    if (!codes.length) return [];
    const [rows, reservations, pendingFair, products] = await Promise.all([
      stockReader({ codes }),
      db.query(`SELECT UPPER(TRIM(pr.codprodu::text)) AS code, COALESCE(SUM(pr.stockreservado),0)::numeric AS amount
        FROM productoreservados pr JOIN reservas r ON r.idreserva=pr.idreserva
        WHERE r.fechavencimientoreserva >= CURRENT_DATE
          AND (pr.lotereservado IS NULL OR TRIM(pr.lotereservado::text)='')
          AND UPPER(TRIM(pr.codprodu::text))=ANY($1::text[])
        GROUP BY UPPER(TRIM(pr.codprodu::text))`, [codes]),
      db.query(`SELECT UPPER(TRIM(l->>'code')) AS code, COALESCE(SUM((l->>'quantity')::numeric),0) AS amount
        FROM ferias_solicitudes f CROSS JOIN LATERAL jsonb_array_elements(f.lineas) l
        WHERE f.tipo='PEDIDO' AND f.estado NOT IN ('DESCARTADA','REGISTRADA_ERP')
          AND UPPER(TRIM(l->>'code')) = ANY($1::text[])
        GROUP BY UPPER(TRIM(l->>'code'))`, [codes]),
      db.query(`SELECT UPPER(TRIM(codprodu::text)) AS code, COALESCE(desprodu,'') AS description,
        COALESCE(UPPER(TRIM(obsoleto::text)),'') AS obsolete
        FROM productos WHERE UPPER(TRIM(codprodu::text))=ANY($1::text[])`, [codes]),
    ]);
    return summarizeFairInventory(codes,rows,reservations.rows,pendingFair.rows,products.rows);

  }
  async function checkAvailability(input) {
    const codes = Array.isArray(input) ? input : [];
    if (codes.length > 25 || codes.some(l => !l || !/^[\w.\-/]{1,60}$/.test(text(l.code)) || Number(l.quantity) <= 0)) throw error('Revisa los artículos a consultar.');
    const normalized = codes.map(l => ({code:text(l.code).toUpperCase(),quantity:Number(l.quantity),unit: text(l.unit) }));
    const values = await inventory(normalized);
    const totals = new Map();
    for(const line of normalized) totals.set(line.code,(totals.get(line.code)||0)+line.quantity);
    return { items: values, checkedAt: new Date().toISOString(), source: 'PostgreSQL: almacén 00, no reserva mercancía',
      canSubmit: [...totals].every(([code,qty]) => {
        const row=values.find(item=>item.code===code);
        return row && row.available!==null && Number.isFinite(row.available) && row.available>=qty;
      }) };
  }
  async function storeSubmission(input, user) {
    const data = normalizeFairSubmission(input);
    const userId = normalizeUser(user);
    if (!userId) throw error('La sesión no identifica al comercial.', 401);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      // Lock idempotency even before the row exists to serialize same key submissions.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [data.requestKey]);
      const existing = await db.query('SELECT id, estado, usuario_id FROM ferias_solicitudes WHERE request_key=$1', [data.requestKey]);
      if (existing.rows.length) {
        if (existing.rows[0].usuario_id !== userId) throw error('Solicitud existente de otro usuario.', 403);
        await db.query('COMMIT'); return { id: existing.rows[0].id, status: existing.rows[0].estado, existing: true };
      }
      // Limita envíos repetitivos aunque el usuario cambie la clave de petición.
      const counts=await db.query(`SELECT COUNT(*) FILTER (WHERE created_at > now()-interval '1 minute')::int AS recent,
        COUNT(*) FILTER (WHERE created_at > now()-interval '1 day')::int AS daily
        FROM ferias_solicitudes WHERE usuario_id=$1`,[userId]);
      if(Number(counts.rows[0]?.recent)>4 || Number(counts.rows[0]?.daily)>=60)
        throw error('Demasiadas solicitudes de feria. Contacta con Administración antes de continuar.',429);
      let client = data.client;
      if (data.clientKind === 'EXISTENTE') client = await selectClient(data.client.code, user);
      // El representante lo fija el servidor desde la sesión o la ficha ERP.
      const assigned = getFairRepresentative(user, client, data.clientKind);
      let representativeName = assigned.name;
      if (assigned.code && !representativeName) {
        const representative = await db.query(`SELECT nombre,apellido1,apellido2,username
          FROM usuarios WHERE BTRIM(codrepre::text)=$1 ORDER BY id LIMIT 1`, [assigned.code]);
        const rep = representative.rows[0];
        if (rep) representativeName = [rep.nombre,rep.apellido1,rep.apellido2].map(text).filter(Boolean).join(' ') || text(rep.username);
      }
      let lines = [];
      if (data.type === 'PEDIDO') {
        for (const code of [...new Set(data.lines.map(l => l.code))].sort()) await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`FERIA_STOCK:${code}`]);
        const values = await inventory(data.lines, db);
        lines = assertAvailability(data.lines, values);
      }
      const id = randomUUID();
      await db.query(`INSERT INTO ferias_solicitudes
       (id,request_key,tipo,feria,usuario_id,comercial,registrador_username,representante_codigo,representante_nombre,cliente_tipo,cliente_codigo,cliente,lineas,observaciones,entrega_solicitada,direccion_entrega,enviar_agradecimiento,idioma_correo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18)`,
       [id,data.requestKey,data.type,data.fair,userId,commercial(user),text(user?.username)||null,assigned.code,representativeName,data.clientKind,client.code||null,JSON.stringify(client),JSON.stringify(lines),data.observations,data.requestedDelivery,data.deliveryAddress,data.thankYou,data.language]);
      for (const [purpose,intendedTo] of [['INTERNO',notificationAddress],...(data.thankYou ? [['CLIENTE',client.email]] : [])]) {
        const stable = createHash('sha256').update(`${id}:${purpose}`).digest('hex').slice(0,32);
        // El destino de la cola se fija al registrar: apagar el modo prueba
        // NO cambia retrospectivamente el destinatario de correos pendientes.
        const to = mailPolicy.destination(intendedTo);
        const testMarker = mailPolicy.testMode ? 'test-' : '';
        await db.query(`INSERT INTO ferias_correos (id,solicitud_id,destino_tipo,destinatario,message_id)
         VALUES ($1,$2,$3,$4,$5)`,[randomUUID(),id,purpose,to,`<feria-${testMarker}${stable}@cjmgroup.es>`]);
      }
      await db.query('COMMIT');
      return { id, status:'PENDIENTE_EMAIL', existing:false };
    } catch(e) { await db.query('ROLLBACK').catch(()=>{}); throw e; }
    finally { db.release(); }
  }
  async function dispatch(id, user) {
    // Send after commit: no email exists for a failed database transaction.
    if (!mailReady) return;
    const { rows } = await pool.query('SELECT * FROM ferias_solicitudes WHERE id=$1', [id]);
    const record = rows[0];
    if (!record) return;
    if (record.usuario_id !== normalizeUser(user) && text(user?.role).toLowerCase() !== 'admin') return;
    const mailRecord = { id:record.id, fair:record.feria, type:record.tipo,
      salesperson:record.comercial, registrarUsername:record.registrador_username,
      representativeCode:record.representante_codigo, representativeName:record.representante_nombre,
      client:record.cliente, lines:record.lineas,
      observations:record.observaciones, requestedDelivery:record.entrega_solicitada, deliveryAddress:record.direccion_entrega, language:record.idioma_correo };
    for (const purpose of ['INTERNO','CLIENTE']) {
      const { rows: pending } = await pool.query(`UPDATE ferias_correos
       SET estado='ENVIANDO',
           destinatario=CASE WHEN $3::boolean THEN $4::text ELSE destinatario END
       WHERE solicitud_id=$1 AND destino_tipo=$2 AND estado='PENDIENTE'
       RETURNING *`, [id,purpose,mailPolicy.testMode,FERIAS_TEST_MAILBOX]);
      if (!pending.length) continue;
      const notification = pending[0];
      // Si se cambia el .env entre crear y enviar, se respeta igualmente
      // el buzón de prueba fijado al crear el mensaje. La ruta PENDIENTE de
      // versiones anteriores también se redirige cuando la prueba está activa.
      const testDelivery = mailPolicy.testMode || isFeriasTestMessage(notification.message_id);
      const intendedRecipient = purpose === 'INTERNO' ? notificationAddress : text(record.cliente?.email);
      const originalSubject = purpose==='INTERNO'
        ? `[Feria ${record.feria}] ${record.tipo==='PEDIDO'?'Pedido solicitado':'Nuevo contacto'} · ${record.cliente.company}`
        : `${record.idioma_correo==='en'?'Thank you for visiting us at':record.idioma_correo==='fr'?'Merci de votre visite à':'Gracias por visitarnos en'} ${record.feria} · CJM Group`;
      const previewNotice = testDelivery
        ? `<div style="padding:14px 18px;background:#fff5d6;border:1px solid #e6c779;font:14px Arial,sans-serif;color:#493800"><strong>MODO PRUEBA: no enviado al destinatario final.</strong> Destinatario previsto: ${escapeHtml(intendedRecipient)}</div>`
        : '';
      const html = mailHtml(mailRecord,purpose==='INTERNO');
      try {
        await outgoing.sendMail({ from:senderAddress, to:notification.destinatario,
          replyTo:replyAddress, messageId:notification.message_id,
          subject:prepareFeriasMailSubject(originalSubject,testDelivery),
          html:previewNotice ? html.replace(/(<body\b[^>]*>)/i, `$1${previewNotice}`) : html,
          attachments:[{filename:'cjm-logo.png',path:fairLogoPath,cid:FAIR_LOGO_CID,contentDisposition:'inline'}],
        });
        await pool.query(`UPDATE ferias_correos SET estado='ENVIADO',enviado_at=now() WHERE id=$1`,[notification.id]);
      } catch(e) {
        // Even if SMTP times out, it might have delivered. Do not auto-retry.
        await pool.query(`UPDATE ferias_correos SET estado='REVISAR',error_codigo=$2 WHERE id=$1`,
          [notification.id,text(e.code || e.name || 'SMTP_ERROR').slice(0,80)]);
      }
    }
    const { rows: notifications }=await pool.query('SELECT destino_tipo,estado FROM ferias_correos WHERE solicitud_id=$1',[id]);
    const complete = notifications.length>0 && notifications.every(m=>m.estado==='ENVIADO');
    const status = complete ? 'NOTIFICADA' : 'REVISAR_EMAIL';
    await pool.query('UPDATE ferias_solicitudes SET estado=$2,updated_at=now() WHERE id=$1 AND estado=$3', [id,status,'PENDIENTE_EMAIL']);
  }
  async function sendUnsent(id,user) {
    if(!['admin','administracion'].includes(text(user?.role).toLowerCase()))
      throw error('Solo Administración puede reenviar correos pendientes.',403);
    if(!mailReady) throw error('Configura la cuenta SMTP de Ferias (FERIAS_EMAIL_USER y FERIAS_EMAIL_PASS, o EMAIL_USER y EMAIL_PASS autorizados).',503);
    // Solo envía mensajes PENDIENTES: nunca ENVIANDO ni REVISAR, porque
    // el servidor puede haber recibido una confirmación incierta de SMTP.
    await dispatch(id,user);
    return getStatus(id,user);
  }
  async function markRegistered(id, input, user) {
    if(!['admin','administracion'].includes(text(user?.role).toLowerCase()))
      throw error('Solo Administración puede finalizar la gestión del ERP.',403);
    const erpReference=text(input?.erpReference).slice(0,100);
    if(!erpReference || input?.stockSyncConfirmed!==true)
      throw error('Indica la referencia del ERP y confirma que has comprobado stock y pendientes actualizados.');
    const {rows}=await pool.query(`UPDATE ferias_solicitudes
      SET estado='REGISTRADA_ERP',erp_referencia=$2,registrado_erp_at=now(),updated_at=now()
      WHERE id=$1 AND tipo='PEDIDO' AND estado IN ('NOTIFICADA','REVISAR_EMAIL')
      RETURNING id,estado,erp_referencia`,[id,erpReference]);
    if(!rows.length) throw error('No se puede cerrar esa solicitud. Comprueba que sea un pedido pendiente y no esté ya registrado.',409);
    return rows[0];
  }
  async function listRecent(user) {
    const admin=isFairAdmin(user);
    const args=admin?[]:[normalizeUser(user)];
    const {rows}=await pool.query(`SELECT id,tipo,feria,cliente->>'company' AS empresa,
      estado,created_at,comercial,representante_codigo,representante_nombre
      FROM ferias_solicitudes ${admin?'':'WHERE usuario_id=$1'} ORDER BY created_at DESC LIMIT 30`,args);
    return rows;
  }
  async function listVisitors(query, user) {
    const scope = getFairVisitorScope(user, normalizeUserClientAccess(user));
    const page = Math.min(10000, Math.max(1, Number.parseInt(query?.page, 10) || 1));
    const limit = 25;
    const fair = text(query?.feria).slice(0, 120);
    const search = text(query?.q).slice(0, 100);
    const representative = text(query?.representante).slice(0, 60);
    const onlyMine = String(query?.soloMios || '') === 'true';
    const params = [scope.isAdmin && !onlyMine, scope.userId, scope.representatives,
      fair || null, search || null, representative || null, onlyMine];
    const base = `FROM ferias_solicitudes f
      WHERE ($1::boolean OR f.usuario_id=$2 OR ($7::boolean IS FALSE AND f.representante_codigo=ANY($3::text[])))
        AND ($4::text IS NULL OR f.feria ILIKE '%'||$4||'%')
        AND ($5::text IS NULL OR f.cliente->>'company' ILIKE '%'||$5||'%'
          OR f.cliente->>'contact' ILIKE '%'||$5||'%'
          OR f.cliente_codigo ILIKE '%'||$5||'%'
          OR f.cliente->>'email' ILIKE '%'||$5||'%')
        AND ($6::text IS NULL OR f.representante_codigo=$6)`;
    const [listing, metrics] = await Promise.all([
      pool.query(`SELECT f.id, f.tipo, f.feria, f.cliente_tipo, f.cliente_codigo,
          f.cliente->>'company' AS empresa, f.cliente->>'contact' AS contacto,
          f.cliente->>'email' AS email, f.cliente->>'phone' AS telefono,
          f.cliente->>'mobile' AS movil, f.usuario_id, f.registrador_username,
          f.comercial, f.representante_codigo, f.representante_nombre,
          f.estado, f.created_at
        ${base} ORDER BY f.created_at DESC, f.id DESC LIMIT $8 OFFSET $9`,
        [...params, limit, (page - 1) * limit]),
      pool.query(`SELECT COUNT(*)::int AS registros,
        COUNT(DISTINCT ${fairVisitorIdentitySQL})::int AS visitantes ${base}`, params),
    ]);
    return { visits:listing.rows, total:metrics.rows[0]?.registros || 0,
      visitors:metrics.rows[0]?.visitantes || 0, page, limit };
  }
  async function listFairs(user) {
    // Compartir únicamente el nombre de una feria, no datos de visitantes ni de otras carteras.
    getFairVisitorScope(user,normalizeUserClientAccess(user));
    const {rows}=await pool.query(`SELECT feria AS name FROM ferias_solicitudes
      GROUP BY feria ORDER BY MAX(created_at) DESC LIMIT 80`);
    return rows;
  }
  async function listReportRepresentatives(user) {
    const scope=getFairVisitorScope(user,normalizeUserClientAccess(user));
    const {rows}=await pool.query(`SELECT BTRIM(c.codrepre::text) AS code,
        COUNT(*)::int AS clients,
        (SELECT CONCAT_WS(' ',NULLIF(BTRIM(u.nombre),'') ,NULLIF(BTRIM(u.apellido1),''),NULLIF(BTRIM(u.apellido2),''))
           FROM usuarios u WHERE BTRIM(u.codrepre::text)=BTRIM(c.codrepre::text)
           ORDER BY u.id LIMIT 1) AS name
      FROM clientes c
      WHERE COALESCE(UPPER(BTRIM(c.dadobaja::text)),'') <> 'S'
        AND NULLIF(BTRIM(c.codrepre::text),'') IS NOT NULL
        AND ($1::boolean OR BTRIM(c.codrepre::text)=ANY($2::text[]))
      GROUP BY BTRIM(c.codrepre::text) ORDER BY code`,[scope.isAdmin,scope.representatives]);
    if(scope.isAdmin) {
      const {rows:missing}=await pool.query(`SELECT
        (SELECT COUNT(*)::int FROM clientes WHERE COALESCE(UPPER(BTRIM(dadobaja::text)),'') <> 'S'
          AND NULLIF(BTRIM(codrepre::text),'') IS NULL) AS clientes,
        (SELECT COUNT(*)::int FROM ferias_solicitudes WHERE cliente_tipo='NUEVO'
          AND NULLIF(BTRIM(representante_codigo),'') IS NULL) AS contactos`);
      if(Number(missing[0]?.clientes)||Number(missing[0]?.contactos))
        rows.push({code:'SIN_ASIGNAR',name:'Sin representante asignado (revisión)',clients:Number(missing[0]?.clientes||0)});
    }
    return rows;
  }
  async function getFairReport({fair,representativeCode},user) {
    const scope=getFairVisitorScope(user,normalizeUserClientAccess(user));
    const code=text(representativeCode).slice(0,60);
    const unassigned=code==='SIN_ASIGNAR';
    const fairName=text(fair).slice(0,120);
    if(!fairName || !code) throw error('Selecciona la feria y el representante para descargar el informe.',400);
    if(!scope.isAdmin && !scope.representatives.includes(code))
      throw error('No tienes permiso para consultar la cartera de este representante.',403);
    const catalog=await listReportRepresentatives(user);
    const rep=catalog.find(r=>r.code===code);
    if(!rep) throw error('El representante no tiene clientes activos en la cartera autorizada.',404);
    const check=await pool.query(`SELECT feria FROM ferias_solicitudes
      WHERE LOWER(BTRIM(feria))=LOWER(BTRIM($1)) LIMIT 1`,[fairName]);
    if(!check.rows.length) throw error('No hay registros de esta feria. Comprueba el nombre elegido.',404);
    const clientRows=await pool.query(`SELECT c.codclien::text AS codigo,
        COALESCE(c.razclien,'') AS empresa, COALESCE(c.localidad,'') AS localidad,
        COALESCE(c.codpais,'') AS pais, COALESCE(c.email,'') AS email
      FROM clientes c WHERE COALESCE(UPPER(BTRIM(c.dadobaja::text)),'') <> 'S'
        AND (($2::boolean AND NULLIF(BTRIM(c.codrepre::text),'') IS NULL) OR
          (NOT $2::boolean AND BTRIM(c.codrepre::text)=$1))
        ORDER BY c.razclien,c.codclien LIMIT 20001`,[code,unassigned]);
    if(clientRows.rows.length>20000) throw error('La cartera es demasiado grande para un único Excel.',413);
    const [known, newClients] = await Promise.all([
      pool.query(`SELECT f.* FROM ferias_solicitudes f
        JOIN clientes c ON BTRIM(f.cliente_codigo::text)=BTRIM(c.codclien::text)
        WHERE LOWER(BTRIM(f.feria))=LOWER(BTRIM($1))
          AND f.cliente_tipo='EXISTENTE'
          AND (($3::boolean AND NULLIF(BTRIM(c.codrepre::text),'') IS NULL) OR
            (NOT $3::boolean AND BTRIM(c.codrepre::text)=$2))
          AND COALESCE(UPPER(BTRIM(c.dadobaja::text)),'') <> 'S'
        ORDER BY f.created_at LIMIT 20001`,[fairName,code,unassigned]),
      pool.query(`SELECT f.* FROM ferias_solicitudes f
        WHERE LOWER(BTRIM(f.feria))=LOWER(BTRIM($1))
          AND f.cliente_tipo='NUEVO'
          AND (($3::boolean AND NULLIF(BTRIM(f.representante_codigo::text),'') IS NULL) OR
            (NOT $3::boolean AND BTRIM(f.representante_codigo::text)=$2))
        ORDER BY f.created_at LIMIT 20001`,[fairName,code,unassigned]),
    ]);
    if(known.rows.length>20000 || newClients.rows.length>20000)
      throw error('La feria tiene demasiados registros. Solicita un informe por periodos.',413);
    return buildFairRepresentativeReport({fair:check.rows[0].feria,representativeCode:code,
      representativeName:rep.name || `Comercial ${code}`,clients:clientRows.rows,
      submissions:known.rows,newSubmissions:newClients.rows});
  }
  async function exportFairReport(filters,user) {
    const report=await getFairReport(filters,user);
    const {default:XLSX}=await import('xlsx-js-style');
    return {buffer:createFairRepresentativeWorkbook(report,XLSX),
      filename:`CJM_Feria_${report.fair.replace(/[^a-z0-9_-]/gi,'_').slice(0,35)}_Comercial_${report.representativeCode.replace(/[^a-z0-9_-]/gi,'_')}.xlsx`,
      summary:report.summary};
  }
  async function getStatus(id,user) {
    const { rows }=await pool.query('SELECT id,tipo,feria,usuario_id,comercial,registrador_username,representante_codigo,representante_nombre,estado,created_at FROM ferias_solicitudes WHERE id=$1',[id]);
    const found=rows[0];
    if (!found || (found.usuario_id !== normalizeUser(user) && !isFairAdmin(user))) throw error('Solicitud no encontrada.',404);
    const { rows: mails }=await pool.query('SELECT destino_tipo,estado FROM ferias_correos WHERE solicitud_id=$1 ORDER BY destino_tipo',[id]);
    return { id:found.id, type:found.tipo, fair:found.feria, status:found.estado, mails, createdAt:found.created_at,
      registrar:found.comercial, registrarUsername:found.registrador_username,
      representativeCode:found.representante_codigo, representativeName:found.representante_nombre };
  }
  return { lookupClients, searchProducts, checkAvailability, storeSubmission, dispatch, getStatus, listRecent, listVisitors, listFairs, listReportRepresentatives, getFairReport, exportFairReport, markRegistered, sendUnsent, mailReady,
    mailTestMode: mailPolicy.testMode, mailTestRecipient: mailPolicy.testMailbox };
}
