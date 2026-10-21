'use strict';
const $ = id => document.getElementById(id);
const LIMIT = 256 * 1024 * 1024;
const BLOCK_SIZE = 8 * 1024 * 1024;
const BUFFER_HIGH = 4 * 1024 * 1024;
const fmt = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' Mio' : (n / 1024).toFixed(1) + ' Kio';
let selectedFiles = [];
const previewUrls = [];
let hostRole = false;
let peer, channel, connection, ownCode = '', inviteToken = '', paired = false;
let sending = false, receiving = null, waiter = null, pending = null, chain = Promise.resolve(), opening = false, expireTimer, pairTimer;
const urls = [];
const setStatus = message => { $('status').textContent = message; };
const control = message => channel.send(JSON.stringify(message));
const options = { secure: true, debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } };
function digits(length) {
  let value; const range = 10 ** length; const ceiling = Math.floor(4294967296 / range) * range;
  do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= ceiling);
  return String(value % range).padStart(length, '0');
}
function readyButtons(disabled) { $('create').disabled = $('join').disabled = disabled; }
function connected() {
  paired = true; clearTimeout(expireTimer); clearTimeout(pairTimer);
  $('pair').hidden = true; $('pairRequest').hidden = true; $('verification').hidden = true;
  $('files').disabled = false; $('send').disabled = !selectedFiles.length; $('speed').textContent = 'Prêt.';
  setStatus('Appareils associés. Tu peux envoyer tes fichiers dans les deux sens.');
  peer?.disconnect();
}
function fail(text) {
  setStatus(text); $('send').disabled = true;
  if (waiter) { clearTimeout(waiter.timer); waiter.reject(Error(text)); waiter = null; }
  if (receiving?.writer) receiving.writer.abort().catch(() => {});
  receiving = null; pending = null; $('receive').hidden = $('receiveDownload').hidden = $('reject').hidden = true;
}
function cleanup() {
  clearTimeout(expireTimer); clearTimeout(pairTimer); paired = false; channel = null; connection = null;
  peer?.destroy(); peer = null; chain = Promise.resolve();
  $('pairRequest').hidden = true; $('verification').hidden = true;
}
async function action(fn) { try { await fn(); } catch (error) { setStatus(error.message); } }
function createPeer(id) {
  return new Promise((resolve, reject) => {
    if (typeof Peer !== 'function') return reject(Error('Le module de connexion ne se charge pas. Recharge la page.'));
    if (typeof RTCPeerConnection !== 'function') return reject(Error('WebRTC est indisponible. Essaie Chrome, Edge, Firefox ou Safari.'));
    const instance = id ? new Peer(id, options) : new Peer(options); peer = instance;
    const timer = setTimeout(() => { instance.destroy(); reject(Error('Service de connexion indisponible. Vérifie Internet et réessaie.')); }, 15000);
    instance.once('open', () => { clearTimeout(timer); resolve(instance); });
    instance.on('error', error => {
      clearTimeout(timer);
      if (peer !== instance) return;
      const errorText = error.type === 'peer-unavailable' ? 'Code introuvable ou expiré. Vérifie les six chiffres et réessaie.' : 'Connexion impossible. Vérifie Internet, essaie le même Wi-Fi ou recommence.';
      if (!instance.open && !paired) reject(Object.assign(Error(errorText), { type: error.type }));
      else if (!paired) { clearTimeout(pairTimer); channel = null; const old = connection; connection = null; old?.close(); readyButtons(false); opening = false; setStatus(errorText); }
    });
    instance.on('connection', incoming => {
      if (instance !== peer || connection || paired || !ownCode) { incoming.close(); return; }
      if (!/^\d{4}$/.test(incoming.metadata?.verification || '')) { incoming.close(); return; }
      bind(incoming, true);
    });
    instance.on('disconnected', () => { if (!paired && peer === instance) setStatus('Service de connexion déconnecté. Crée un nouveau code.'); });
  });
}
function bind(dc, host) {
  hostRole = host;
  connection = dc;
  pairTimer = setTimeout(() => {
    if (connection !== dc || paired) return;
    connection = null; channel = null; dc.close(); opening = false; readyButtons(false);
    $('pairRequest').hidden = true;
    setStatus('Association trop longue. Essaie le même Wi-Fi puis recommence.');
  }, 60000);
  dc.on('open', () => {
    if (connection !== dc) return;
    channel = dc.dataChannel;
    if (host) {
      $('pairRequest').hidden = false;
      $('verifyCode').textContent = dc.metadata.verification;
      setStatus('Un appareil veut se connecter. Compare le code de vérification affiché sur les deux appareils.');
    } else setStatus('Connexion établie. Confirme l’association sur le premier appareil.');
  });
  dc.on('data', data => {
    if (connection !== dc) return;
    chain = chain.then(() => message(data)).catch(error => { fail(error.message); dc.close(); });
  });
  dc.on('close', () => {
    if (connection !== dc) return;
    clearTimeout(pairTimer); connection = null; channel = null; paired = false;
    fail('Connexion fermée. Clique sur Recommencer pour associer les appareils.');
    $('pair').hidden = false; $('pairRequest').hidden = true; readyButtons(false); opening = false;
  });
  dc.on('error', () => { fail('Erreur de connexion. Recommence l’association.'); dc.close(); });
}
$('create').onclick = () => action(async () => {
  if (opening) return;
  opening = true; readyButtons(true); cleanup(); ownCode = '';
  $('invitation').hidden = true; setStatus('Création de ton code à six chiffres…');
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = digits(6);
      try { await createPeer('flash-transfert-v5-' + code); ownCode = code; break; }
      catch (error) { cleanup(); if (error.type !== 'unavailable-id' || attempt === 4) throw error; }
    }
    inviteToken = crypto.randomUUID();
    const link = new URL(location.href); link.hash = new URLSearchParams({ code: ownCode, token: inviteToken }).toString();
    $('code').textContent = ownCode.slice(0, 3) + ' ' + ownCode.slice(3);
    $('shareLink').value = link.href; $('invitation').hidden = false;
    try {
      const qr = qrcode(0, 'M'); qr.addData(link.href); qr.make();
      const count = qr.getModuleCount(), scale = 5, margin = 4, canvas = $('qr');
      canvas.width = canvas.height = (count + margin * 2) * scale;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#0c111b';
      for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (qr.isDark(y, x)) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
      canvas.hidden = false;
    } catch { $('qr').hidden = true; }
    setStatus('Code prêt. Scanne le QR avec la caméra de ton cell ou saisis les six chiffres sur l’autre appareil.');
    expireTimer = setTimeout(() => {
      if (paired) return; cleanup(); ownCode = ''; $('invitation').hidden = true; setStatus('Code expiré après 10 minutes. Crée un nouveau code.'); readyButtons(false);
    }, 600000);
  } finally { opening = false; readyButtons(false); }
});
$('join').onclick = () => action(async () => {
  if (opening) return;
  const code = $('joinCode').value.replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) throw Error('Saisis exactement six chiffres.');
  if (ownCode === code) throw Error('Saisis ce code sur ton autre appareil.');
  opening = true; readyButtons(true); cleanup(); ownCode = ''; $('invitation').hidden = true;
  setStatus('Recherche de l’autre appareil…');
  try {
    await createPeer();
    const verification = digits(4);
    $('verification').hidden = false; $('myVerifyCode').textContent = verification;
    const dc = peer.connect('flash-transfert-v5-' + code, { serialization: 'raw', reliable: true, metadata: { verification, token: scannedCode === code ? scannedToken : '' } });
    bind(dc, false);
  } catch (error) { cleanup(); throw error; }
  finally { opening = false; readyButtons(false); }
});
$('approvePair').onclick = () => action(async () => {
  if (!channel || !connection) return;
  control({ type: 'paired' }); connected();
});
$('denyPair').onclick = () => {
  const old = connection; connection = null; channel = null; clearTimeout(pairTimer); old?.close();
  $('pairRequest').hidden = true; setStatus('Association refusée. Tu peux attendre ton autre appareil.');
};
$('copy').onclick = () => action(async () => { if (!ownCode) return; await navigator.clipboard.writeText(ownCode); setStatus('Code copié : ' + ownCode); });
$('copyLink').onclick = () => action(async () => { await navigator.clipboard.writeText($('shareLink').value); setStatus('Lien copié. Ouvre-le sur ton autre appareil.'); });
$('reset').onclick = () => location.assign(location.pathname);
$('joinCode').addEventListener('keydown', event => { if (event.key === 'Enter') $('join').click(); });
const scanned = new URLSearchParams(location.hash.slice(1));
const scannedCode = scanned.get('code') || '', scannedToken = scanned.get('token') || '';
if (/^\d{6}$/.test(scannedCode)) {
  $('joinCode').value = scannedCode;
  history.replaceState(null, '', location.pathname + location.search);
  $('join').click();
}
function renderSelection() {
  previewUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
  $('selection').replaceChildren();
  const total = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  $('selectionSummary').textContent = selectedFiles.length ? `${selectedFiles.length} fichier(s) sélectionné(s) · ${fmt(total)}` : 'Aucun fichier sélectionné.';
  $('clearSelection').hidden = !selectedFiles.length;
  for (const [index, file] of selectedFiles.entries()) {
    const item = document.createElement('div'); item.className = 'selection-item';
    if (file.type.startsWith('image/') && index < 80) {
      const image = document.createElement('img'); const url = URL.createObjectURL(file); previewUrls.push(url);
      image.src = url; image.alt = file.name; image.loading = 'lazy'; item.append(image);
    } else {
      const icon = document.createElement('div'); icon.className = 'selection-icon'; icon.textContent = file.type.startsWith('video/') ? '▶' : '▤'; item.append(icon);
    }
    const name = document.createElement('div'); name.className = 'filename'; name.textContent = file.name;
    const size = document.createElement('div'); size.className = 'small'; size.textContent = fmt(file.size);
    const remove = document.createElement('button'); remove.className = 'secondary'; remove.textContent = 'Retirer'; remove.disabled = sending;
    remove.setAttribute('aria-label', 'Retirer ' + file.name);
    remove.onclick = () => { if (!sending) { selectedFiles.splice(index, 1); renderSelection(); } };
    item.append(name, size, remove); $('selection').append(item);
  }
  $('send').disabled = !paired || sending || !selectedFiles.length;
  for (const id of ['pickMedia', 'pickCamera', 'pickFiles', 'clearSelection']) $(id).disabled = sending;
}
function addSelection(input) {
  if (sending) return;
  const existing = new Set(selectedFiles.map(file => JSON.stringify([file.name, file.size, file.lastModified])));
  for (const file of input.files) {
    const key = JSON.stringify([file.name, file.size, file.lastModified]);
    if (!existing.has(key)) { selectedFiles.push(file); existing.add(key); }
  }
  input.value = ''; renderSelection();
}
$('pickMedia').onclick = () => $('media').click();
$('pickCamera').onclick = () => $('camera').click();
$('pickFiles').onclick = () => $('files').click();
for (const id of ['media', 'camera', 'files']) $(id).onchange = () => addSelection($(id));
$('clearSelection').onclick = () => { if (!sending) { selectedFiles = []; renderSelection(); } };
function waitFor(type, id) {
  return new Promise((resolve, reject) => {
    waiter = { type, id, resolve, reject, timer: setTimeout(() => { waiter = null; reject(Error('Délai dépassé. Le destinataire doit accepter le fichier; recommence la connexion.')); channel.close(); }, 180000) };
  });
}
async function message(data) {
  if (!paired) {
    if (!hostRole && typeof data === 'string' && JSON.parse(data).type === 'paired') { connected(); return; }
    throw Error('Association non confirmée.');
  }
  if (typeof data !== 'string') {
    if (!receiving) throw Error('Données reçues sans fichier accepté.');
    if (receiving.bytes + data.byteLength > receiving.size) throw Error('Taille reçue invalide.');
    if (receiving.writer) receiving.writeParts.push(data); else receiving.parts.push(data);
    receiving.bytes += data.byteLength;
    if (performance.now() - receiving.lastProgress > 100 || receiving.bytes === receiving.size) {
      $('request').textContent = receiving.name + ' · ' + fmt(receiving.bytes) + ' / ' + fmt(receiving.size);
      receiving.lastProgress = performance.now();
    }
    return;
  }
  const m = JSON.parse(data);
  if (['ready', 'reject', 'complete', 'blockAck'].includes(m.type)) {
    if (waiter && m.id === waiter.id && (m.type === waiter.type || m.type === 'reject')) {
      const w = waiter; waiter = null; clearTimeout(w.timer); if (m.type === 'reject') w.reject(Error(m.reason || 'Fichier refusé.')); else w.resolve();
    }
  } else if (m.type === 'file') {
    if (typeof m.name !== 'string' || m.name.length > 255 || !Number.isSafeInteger(m.size) || m.size < 0 || typeof m.id !== 'string') throw Error('Description de fichier invalide.');
    if (pending || receiving || sending) { control({ type: 'reject', id: m.id, reason: 'Autre transfert en cours.' }); return; }
    if (!window.showSaveFilePicker && m.size > LIMIT) { control({ type: 'reject', id: m.id, reason: 'Le navigateur destinataire est limité à 256 Mio par fichier. Utilise Chrome ou Edge sur PC pour recevoir un gros fichier.' }); return; }
    pending = m; $('request').textContent = m.name + ' · ' + fmt(m.size) + ' — Accepter ce fichier ?'; $('receive').hidden = $('reject').hidden = false; $('receiveDownload').hidden = !window.showSaveFilePicker || m.size > LIMIT;
  } else if (m.type === 'block') {
    if (!receiving || receiving.id !== m.id || receiving.bytes !== m.bytes || receiving.bytes - receiving.committed > BLOCK_SIZE) throw Error('Bloc de transfert invalide.');
    if (receiving.writer && receiving.writeParts.length) {
      await receiving.writer.write(new Blob(receiving.writeParts)); receiving.writeParts = [];
    }
    receiving.committed = receiving.bytes;
    control({ type: 'blockAck', id: m.id });
  } else if (m.type === 'end') {
    if (!receiving || receiving.id !== m.id || receiving.bytes !== receiving.size) throw Error('Fichier incomplet.');
    const file = receiving;
    if (file.writer) { if (file.writeParts.length) await file.writer.write(new Blob(file.writeParts)); await file.writer.close(); }
    const row = document.createElement('div');
    if (file.writer) row.textContent = file.name + ' — enregistré sur disque.';
    else { const url = URL.createObjectURL(new Blob(file.parts)); urls.push(url); const link = document.createElement('a'); link.href = url; link.download = file.name; link.className = 'link'; link.textContent = 'Enregistrer ' + file.name; row.append(link); }
    $('downloads').append(row); receiving = null; $('request').textContent = 'Fichier reçu intégralement.'; control({ type: 'complete', id: m.id });
  } else throw Error('Message inconnu.');
}
async function receiveFile(useDisk) {
  if (!pending) return;
  const file = pending; $('receive').disabled = true;
  try {
    let writer = null;
    if (useDisk && window.showSaveFilePicker) { const handle = await window.showSaveFilePicker({ suggestedName: file.name.replace(/[<>:"/\\|?*]/g, '_') }); writer = await handle.createWritable(); }
    receiving = { ...file, writer, bytes: 0, parts: [], writeParts: [], committed: 0, lastProgress: 0 }; pending = null; $('receive').hidden = $('receiveDownload').hidden = $('reject').hidden = true; control({ type: 'ready', id: file.id });
  } finally { $('receive').disabled = false; }
}
$('receive').onclick = () => action(() => receiveFile(true));
$('receiveDownload').onclick = () => action(() => receiveFile(false));
$('reject').onclick = () => { if (pending) control({ type: 'reject', id: pending.id }); pending = null; $('receive').hidden = $('receiveDownload').hidden = $('reject').hidden = true; $('request').textContent = 'Fichier refusé.'; };
async function drain() {
  const dc = channel;
  if (!dc || dc.readyState !== 'open') throw Error('Connexion fermée.');
  if (dc.bufferedAmount <= BUFFER_HIGH) return;
  dc.bufferedAmountLowThreshold = 1024 * 1024;
  await new Promise((resolve, reject) => {
    let timer;
    const clear = () => { clearTimeout(timer); dc.removeEventListener('bufferedamountlow', low); dc.removeEventListener('close', closed); dc.removeEventListener('error', closed); };
    const low = () => { clear(); resolve(); };
    const closed = () => { clear(); reject(Error('Connexion interrompue.')); };
    dc.addEventListener('bufferedamountlow', low, { once: true });
    dc.addEventListener('close', closed, { once: true }); dc.addEventListener('error', closed, { once: true });
    timer = setTimeout(() => { clear(); reject(Error('Le réseau ne répond plus. Recommence le transfert.')); }, 30000);
    if (dc.readyState !== 'open') closed(); else if (dc.bufferedAmount <= dc.bufferedAmountLowThreshold) low();
  });
}
$('send').onclick = () => action(async () => {
  if (!paired) throw Error('Associe les appareils d’abord.');
  if (sending || receiving || pending) throw Error('Termine le transfert en cours d’abord.');
  const files = [...selectedFiles]; if (!files.length) throw Error('Choisis un fichier.');
  sending = true; renderSelection();
  try {
    for (const file of files) {
      const id = crypto.randomUUID(); const ready = waitFor('ready', id); control({ type: 'file', id, name: file.name, size: file.size }); setStatus('Attente de l’acceptation de ' + file.name); await ready;
      const start = performance.now(); let lastProgress = 0;
      $('progress').value = 0;
      const maxMessage = connection?.peerConnection?.sctp?.maxMessageSize;
      const chunkSize = Math.min(65536, Number.isFinite(maxMessage) && maxMessage > 0 ? maxMessage : 16384);
      for (let offset = 0; offset < file.size; offset += BLOCK_SIZE) {
        const block = await file.slice(offset, offset + BLOCK_SIZE).arrayBuffer();
        for (let part = 0; part < block.byteLength; part += chunkSize) {
          if (channel?.readyState !== 'open') throw Error('Connexion interrompue.');
          if (channel.bufferedAmount > BUFFER_HIGH) await drain();
          const chunk = new Uint8Array(block, part, Math.min(chunkSize, block.byteLength - part));
          channel.send(chunk);
          const sent = offset + part + chunk.byteLength;
          if (performance.now() - lastProgress > 100) {
            $('progress').value = sent / file.size * 100;
            $('speed').textContent = file.name + ' · ' + fmt(sent) + ' / ' + fmt(file.size);
            lastProgress = performance.now();
          }
        }
        const acknowledged = waitFor('blockAck', id);
        control({ type: 'block', id, bytes: offset + block.byteLength });
        await acknowledged;
        const accepted = offset + block.byteLength;
        const elapsed = Math.max((performance.now() - start) / 1000, 0.001);
        $('progress').value = accepted / file.size * 100;
        $('speed').textContent = file.name + ' · ' + fmt(accepted) + ' / ' + fmt(file.size) + ' · ' + fmt(accepted / elapsed) + '/s · ' + (accepted / elapsed * 8 / 1e6).toFixed(1) + ' Mbit/s';
      }
      const complete = waitFor('complete', id); control({ type: 'end', id }); setStatus('Finalisation sur l’autre appareil…'); await complete;
      const seconds = Math.max((performance.now() - start) / 1000, 0.001);
      $('progress').value = 100;
      $('speed').textContent = fmt(file.size) + ' transférés en ' + seconds.toFixed(2) + ' s · ' + fmt(file.size / seconds) + '/s · ' + (file.size / seconds * 8 / 1e6).toFixed(1) + ' Mbit/s';
      setStatus(file.name + ' reçu intégralement par l’autre appareil.');
    }
  } finally { sending = false; renderSelection(); }
});
window.addEventListener('beforeunload', event => { if (sending || receiving) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { urls.concat(previewUrls).forEach(url => URL.revokeObjectURL(url)); peer?.destroy(); });
