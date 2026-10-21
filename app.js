'use strict';
const $ = id => document.getElementById(id);
const LIMIT = 256 * 1024 * 1024;
const fmt = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' Mio' : (n / 1024).toFixed(1) + ' Kio';
let pc, channel, sending = false, receiving = null, waiter = null, pending = null, chain = Promise.resolve();
const urls = [];
const status = message => { $('status').textContent = message; };
const control = message => channel.send(JSON.stringify(message));
function encode(description) { return btoa(JSON.stringify(description)); }
function decode(text) {
  if (text.length > 100000) throw Error('Code trop long.');
  const data = JSON.parse(atob(text.trim()));
  if (!['offer', 'answer'].includes(data.type) || typeof data.sdp !== 'string') throw Error('Code invalide.');
  return data;
}
function setup() {
  if (pc) return;
  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.ondatachannel = event => attach(event.channel);
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') fail('Connexion impossible. Essaie le même Wi-Fi, puis recommence l’association.');
    if (pc.connectionState === 'disconnected') status('Connexion interrompue. Attente de reconnexion…');
  };
}
function attach(dc) {
  if (channel) { dc.close(); return; }
  channel = dc; channel.binaryType = 'arraybuffer';
  dc.onopen = () => { status('Appareils connectés. Tu peux envoyer des fichiers.'); $('files').disabled = false; $('send').disabled = false; $('speed').textContent = 'Prêt.'; $('pair').hidden = true; };
  dc.onclose = () => fail('Connexion fermée. Recharge les deux pages pour recommencer.');
  dc.onerror = () => fail('Erreur de transfert. Recharge les deux pages.');
  dc.onmessage = event => { chain = chain.then(() => message(event.data)).catch(error => { fail(error.message); dc.close(); }); };
}
function fail(text) {
  status(text); $('send').disabled = true; $('files').disabled = true;
  if (waiter) { clearTimeout(waiter.timer); waiter.reject(Error(text)); waiter = null; }
  if (receiving) { if (receiving.writer) receiving.writer.abort().catch(() => {}); receiving = null; }
  pending = null; $('receive').hidden = $('reject').hidden = true;
}
async function gathered() {
  if (pc.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pc.removeEventListener('icegatheringstatechange', check); reject(Error('Recherche réseau trop longue. Recommence.')); }, 20000);
    function check() { if (pc.iceGatheringState === 'complete') { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); } }
    pc.addEventListener('icegatheringstatechange', check); check();
  });
  $('outgoing').value = encode(pc.localDescription);
}
async function action(fn) { try { await fn(); } catch (error) { status(error.message); } }
$('create').onclick = () => action(async () => { if (pc) throw Error('Clique sur Recommencer pour créer une nouvelle invitation.'); setup(); attach(pc.createDataChannel('files', { ordered: true })); await pc.setLocalDescription(await pc.createOffer()); await gathered(); status('Invitation prête. Transmets le code à l’autre appareil.'); });
$('accept').onclick = () => action(async () => {
  const description = decode($('incoming').value);
  if (description.type === 'offer') {
    if (pc) throw Error('Cette page a déjà une connexion. Clique sur Recommencer pour accepter une invitation.');
    setup(); await pc.setRemoteDescription(description); await pc.setLocalDescription(await pc.createAnswer()); await gathered(); status('Réponse prête. Renvoie ton code au premier appareil.');
  } else { if (!pc || pc.signalingState !== 'have-local-offer') throw Error('Crée d’abord une invitation sur cet appareil.'); await pc.setRemoteDescription(description); status('Connexion en cours… Si elle échoue, essaie le même Wi-Fi.'); }
  $('incoming').value = '';
});
$('copy').onclick = () => action(async () => { if (!$('outgoing').value) throw Error('Crée ou accepte une invitation d’abord.'); await navigator.clipboard.writeText($('outgoing').value); status('Code copié. Transmets-le uniquement à ton autre appareil.'); });
$('reset').onclick = () => location.reload();
function waitFor(type, id) {
  return new Promise((resolve, reject) => {
    waiter = { type, id, resolve, reject, timer: setTimeout(() => { waiter = null; reject(Error('Délai dépassé. Le destinataire doit accepter le fichier; recommence la connexion.')); channel.close(); }, 180000) };
  });
}
async function message(data) {
  if (typeof data !== 'string') {
    if (!receiving) throw Error('Données reçues sans fichier accepté.');
    if (receiving.bytes + data.byteLength > receiving.size) throw Error('Taille reçue invalide.');
    if (receiving.writer) await receiving.writer.write(data); else receiving.parts.push(data);
    receiving.bytes += data.byteLength;
    $('request').textContent = receiving.name + ' · ' + fmt(receiving.bytes) + ' / ' + fmt(receiving.size);
    return;
  }
  const m = JSON.parse(data);
  if (['ready', 'reject', 'complete'].includes(m.type)) {
    if (waiter && m.id === waiter.id && (m.type === waiter.type || m.type === 'reject')) {
      const w = waiter; waiter = null; clearTimeout(w.timer); if (m.type === 'reject') w.reject(Error(m.reason || 'Fichier refusé.')); else w.resolve();
    }
  } else if (m.type === 'file') {
    if (typeof m.name !== 'string' || m.name.length > 255 || !Number.isSafeInteger(m.size) || m.size < 0 || typeof m.id !== 'string') throw Error('Description de fichier invalide.');
    if (pending || receiving || sending) { control({ type: 'reject', id: m.id, reason: 'Autre transfert en cours.' }); return; }
    if (!window.showSaveFilePicker && m.size > LIMIT) { control({ type: 'reject', id: m.id, reason: 'Le navigateur destinataire est limité à 256 Mio par fichier. Utilise Chrome ou Edge sur PC pour recevoir un gros fichier.' }); return; }
    pending = m; $('request').textContent = m.name + ' · ' + fmt(m.size) + ' — Accepter ce fichier ?'; $('receive').hidden = $('reject').hidden = false;
  } else if (m.type === 'end') {
    if (!receiving || receiving.id !== m.id || receiving.bytes !== receiving.size) throw Error('Fichier incomplet.');
    const file = receiving;
    if (file.writer) await file.writer.close();
    const row = document.createElement('div');
    if (file.writer) row.textContent = file.name + ' — enregistré sur disque.';
    else { const url = URL.createObjectURL(new Blob(file.parts)); urls.push(url); const link = document.createElement('a'); link.href = url; link.download = file.name; link.className = 'link'; link.textContent = 'Enregistrer ' + file.name; row.append(link); }
    $('downloads').append(row); receiving = null; $('request').textContent = 'Fichier reçu intégralement.'; control({ type: 'complete', id: m.id });
  } else throw Error('Message inconnu.');
}
$('receive').onclick = () => action(async () => {
  if (!pending) return;
  const file = pending; $('receive').disabled = true;
  try {
    let writer = null;
    if (window.showSaveFilePicker) { const handle = await window.showSaveFilePicker({ suggestedName: file.name.replace(/[<>:"/\\|?*]/g, '_') }); writer = await handle.createWritable(); }
    receiving = { ...file, writer, bytes: 0, parts: [] }; pending = null; $('receive').hidden = $('reject').hidden = true; control({ type: 'ready', id: file.id });
  } finally { $('receive').disabled = false; }
});
$('reject').onclick = () => { if (pending) control({ type: 'reject', id: pending.id }); pending = null; $('receive').hidden = $('reject').hidden = true; $('request').textContent = 'Fichier refusé.'; };
async function drain() {
  while (channel.bufferedAmount > 1024 * 1024) {
    if (channel.readyState !== 'open') throw Error('Connexion interrompue.');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  if (channel.readyState !== 'open') throw Error('Connexion fermée.');
}
$('send').onclick = () => action(async () => {
  if (sending || receiving || pending) throw Error('Termine le transfert en cours d’abord.');
  const files = [...$('files').files]; if (!files.length) throw Error('Choisis un fichier.');
  sending = true; $('send').disabled = true;
  try {
    for (const file of files) {
      const id = crypto.randomUUID(); const ready = waitFor('ready', id); control({ type: 'file', id, name: file.name, size: file.size }); status('Attente de l’acceptation de ' + file.name); await ready;
      const start = performance.now(); $('progress').value = 0;
      for (let offset = 0; offset < file.size; offset += 16384) {
        await drain(); const chunk = await file.slice(offset, offset + 16384).arrayBuffer(); channel.send(chunk);
        const sent = Math.min(file.size, offset + chunk.byteLength); $('progress').value = file.size ? sent / file.size * 100 : 100;
        $('speed').textContent = file.name + ' · ' + fmt(sent) + ' / ' + fmt(file.size) + ' · ' + fmt(sent / Math.max((performance.now() - start) / 1000, 0.01)) + '/s';
      }
      await drain(); const complete = waitFor('complete', id); control({ type: 'end', id }); status('Finalisation sur l’autre appareil…'); await complete; $('progress').value = 100; status(file.name + ' reçu intégralement par l’autre appareil.');
    }
  } finally { sending = false; $('send').disabled = channel?.readyState !== 'open'; }
});
window.addEventListener('beforeunload', event => { if (sending || receiving) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { urls.forEach(url => URL.revokeObjectURL(url)); pc?.close(); });
