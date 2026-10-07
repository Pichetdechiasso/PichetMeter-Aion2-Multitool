"use strict";
/**
 * PichetMeter — lecture du trafic du jeu pour le DPS de groupe.
 * Lecture seule : les données arrivent de capture.ps1 (Npcap), rien n'est envoyé au jeu ni au serveur.
 * Format des paquets documenté par le projet RATmeter (github.com/Kuroukihime/AIon2-Dps-Meter, GPL-3.0),
 * dont ce module reprend la logique de décodage.
 */

/* ════════ Outils binaires ════════ */
const DEUX32 = 4294967296;
const SYNC = Buffer.from([0x0e, 0x00, 0x36]);
const OP = {
  DEGATS: 0x3804, DOT: 0x3805, MOI: 0x3633, AUTRES: 0x3645, LIEN: 0x3620, GROUPE: 0x9702,
  MOB: 0x3641, PV: 0x8d00, MORT: 0x8d04
};

// Entier variable (7 bits par octet, 5 octets au plus). n = -1 : incomplet ou invalide.
function varint(b, pos = 0) {
  let v = 0, shift = 0, n = 0;
  while (pos + n < b.length) {
    const o = b[pos + n++];
    v += (o & 0x7f) * 2 ** shift;
    if (!(o & 0x80)) return { v: v % DEUX32, n };
    shift += 7;
    if (shift >= 32 + 3) return { v: -1, n: -1 };
  }
  return { v: -1, n: -1 };
}
function varint64(b, pos = 0) {
  let v = 0, shift = 0, n = 0;
  while (pos + n < b.length) {
    const o = b[pos + n++];
    v += (o & 0x7f) * 2 ** shift;
    if (!(o & 0x80)) return { v, n };
    shift += 7;
    if (shift >= 64) return { v: -1, n: -1 };
  }
  return { v: -1, n: -1 };
}

class Lecteur {
  constructor(b, pos = 0) { this.b = b; this.pos = pos; this.bits = 0; this.nbits = 0; }
  get reste() { return this.b.length - this.pos; }
  exiger(n) { if (n < 0 || this.pos + n > this.b.length) throw new RangeError("paquet tronqué"); }
  u8() { this.exiger(1); return this.b[this.pos++]; }
  u16() { this.exiger(2); const v = this.b[this.pos] | (this.b[this.pos + 1] << 8); this.pos += 2; return v; }
  u32() { this.exiger(4); const v = this.b.readUInt32LE(this.pos); this.pos += 4; return v; }
  u64() { this.exiger(8); const lo = this.b.readUInt32LE(this.pos), hi = this.b.readUInt32LE(this.pos + 4); this.pos += 8; return { lo, hi }; }
  varint() {
    let v = 0, shift = 0, o;
    do {
      if (shift >= 35) throw new RangeError("entier variable trop long");
      o = this.u8();
      v += (o & 0x7f) * 2 ** shift;
      shift += 7;
    } while (o & 0x80);
    return v % DEUX32;
  }
  chaine() { const n = this.u8(); this.exiger(n); const s = this.b.toString("utf8", this.pos, this.pos + n); this.pos += n; return s; }
  bit() {
    if (this.nbits === 0) { this.bits = this.u8(); this.nbits = 8; }
    const v = this.bits & 1;
    this.bits >>= 1;
    this.nbits--;
    return v;
  }
  saut(n) { this.exiger(n); this.pos += n; }
}

/* ════════ LZ4 (format bloc) ════════ */
function lz4(src, i, fin, taille) {
  const dst = Buffer.allocUnsafe(taille);
  let o = 0;
  while (i < fin) {
    const jeton = src[i++];
    let lit = jeton >> 4;
    if (lit === 15) { let x; do { if (i >= fin) return null; x = src[i++]; lit += x; } while (x === 255); }
    if (i + lit > fin || o + lit > taille) return null;
    src.copy(dst, o, i, i + lit);
    i += lit; o += lit;
    if (i >= fin) break; // la dernière séquence ne contient que des littéraux
    if (i + 2 > fin) return null;
    const dec = src[i] | (src[i + 1] << 8);
    i += 2;
    if (dec === 0 || dec > o) return null;
    let m = (jeton & 15) + 4;
    if ((jeton & 15) === 15) { let x; do { if (i >= fin) return null; x = src[i++]; m += x; } while (x === 255); }
    if (o + m > taille) return null;
    for (let k = 0; k < m; k++, o++) dst[o] = dst[o - dec];
  }
  return o > 0 ? dst.subarray(0, o) : null;
}

/* ════════ Découpage du flux en paquets ════════ */
const TAILLE_MAX = 40960;
class Flux {
  constructor() { this.buf = Buffer.alloc(0); this.sync = false; }
  vider() { this.buf = Buffer.alloc(0); this.sync = false; }
  ajouter(data, surPaquet) {
    let b = this.buf.length ? Buffer.concat([this.buf, data]) : Buffer.from(data);
    if (b.length > 10 * 1024 * 1024) { this.vider(); return; }
    let pos = 0;
    while (pos < b.length) {
      if (!this.sync) {
        const i = b.indexOf(SYNC, pos);
        if (i < 0) { pos = Math.max(pos, b.length - 2); break; }
        pos = i;
        this.sync = true;
      }
      const l = varint(b, pos);
      if (l.n < 0) {
        if (b.length - pos >= 5) { this.sync = false; pos++; continue; }
        break; // longueur incomplète : on attend la suite
      }
      const taille = l.v + l.n - 4;
      if (taille <= 0 || taille > TAILLE_MAX) { this.sync = false; pos++; continue; }
      if (b.length - pos < taille) break;
      const p = b.subarray(pos, pos + taille);
      if (!(taille === 11 && p[0] === 0x0e && p[1] === 0x00 && p[2] === 0x36)) surPaquet(p);
      pos += taille;
    }
    this.buf = pos >= b.length ? Buffer.alloc(0) : Buffer.from(b.subarray(pos));
  }
}

function opcode(p) {
  const l = varint(p, 0);
  if (l.n <= 0 || p.length < l.n + 2) return -1;
  return p[l.n] | (p[l.n + 1] << 8);
}
function estCompresse(p) {
  if (p.length < 3) return false;
  const l = varint(p, 0);
  return l.n > 0 && p.length >= l.n + 2 && p[l.n] === 0xff && p[l.n + 1] === 0xff;
}
function trames(buf) {
  const out = [];
  let pos = 0;
  while (pos < buf.length) {
    if (buf[pos] === 0) { pos++; continue; }
    const l = varint(buf, pos);
    if (l.n <= 0 || l.v > 2000000) break;
    const taille = l.v + l.n - 4;
    if (taille <= 0) { pos++; continue; }
    if (pos + taille > buf.length) break;
    out.push({ base: pos, taille, nv: l.n });
    pos += taille;
  }
  return out;
}
function decompresser(buf, f) {
  let h = f.nv;
  if (h < f.taille) { const x = buf[f.base + h]; if ((x & 0xf0) === 0xf0 && x !== 0xff) h++; }
  if (f.taille < h + 6) return null;
  if (buf[f.base + h] !== 0xff || buf[f.base + h + 1] !== 0xff) return null;
  const taille = buf.readUInt32LE(f.base + h + 2);
  if (taille < 1 || taille > 10000000) return null;
  const debut = f.base + h + 6, fin = f.base + f.taille;
  if (fin <= debut) return null;
  return lz4(buf, debut, fin, taille);
}
function paquetsInternes(p) {
  if (!estCompresse(p)) return [p];
  const res = [], pile = [p];
  let garde = 0;
  while (pile.length && garde++ < 5000) {
    const buf = pile.pop();
    for (const f of trames(buf)) {
      const d = decompresser(buf, f);
      if (d) pile.push(d);
      else if (f.taille - f.nv > 0) res.push(buf.subarray(f.base, f.base + f.taille));
    }
  }
  return res;
}

/* ════════ Compétences et classes ════════ */
// Préfixe à deux chiffres du code de compétence → classe (10 : esprit invoqué)
const CLASSES = { 10: "Esprit", 11: "Gladiateur", 12: "Templier", 13: "Assassin", 14: "Rôdeur", 15: "Sorcier", 16: "Spiritualiste", 17: "Clerc", 18: "Aède", 19: "Lutteur" };
const SOINS = new Set([18120000, 18170000, 16770000, 16190000, 17120000, 17800000, 17100000, 17410000]);
const theostone = c => c >= 3000000 && c <= 3099999;
function classeDe(code) {
  const s = String(code);
  if (s.length < 2) return null;
  const c = +s.slice(0, 2);
  return c >= 10 && c <= 19 ? c : null;
}
function codeRaisonnable(c) {
  if (c < 1 || c > 299999999) return false;
  if (theostone(c)) return true;
  if (c >= 1000000 && c <= 9999999) return false; // compétences de monstres
  if (c >= 100000 && c < 200000) return true; // familiers / invocations
  if (c >= 11000000 && c < 20000000) return true;
  for (const d of [0, 10, 20, 30, 40, 50, 120, 130, 140, 150, 230, 240, 250, 340, 350, 450]) {
    const b = c - d;
    if ((b >= 11000000 && b < 19000000) || (b >= 100000 && b < 200000)) return true;
  }
  return false;
}
// Variantes (spécialisations) regroupées sur la compétence de base
function baseCompetence(code) {
  if (code >= 10000000 && code < 30000000) return Math.floor(code / 10000) * 10000;
  if (theostone(code)) return Math.floor(code / 10) * 10;
  return code;
}

/* ════════ Décodage des paquets ════════ */
function lireDegats(q) {
  const r = new Lecteur(q);
  r.varint(); r.u16();
  const cible = r.varint();
  const sw = r.varint();
  if (sw > 255) return null;
  const s = sw & 0x0f;
  if (s < 4 || s > 7) return null;
  r.varint();
  const acteur = r.varint();
  if (acteur === cible) return null;
  const code = r.u32();
  if (!codeRaisonnable(code)) return null;
  r.u8();
  const type = r.varint();
  let drapeaux = 0, direction = 0;
  if (s === 4) { if (r.reste < 8) return null; }
  else { if (r.reste < 12) return null; drapeaux = r.u8(); r.u8(); direction = r.u8(); }
  r.u32(); r.saut(4);
  r.varint();
  const degats = r.varint();
  return {
    cible, acteur, code, degats, crit: type === 3,
    dos: (direction & 1) !== 0, parfait: (drapeaux & 4) !== 0, double: (drapeaux & 8) !== 0, parade: (drapeaux & 2) !== 0
  };
}
function lireDot(q) {
  const r = new Lecteur(q);
  r.varint(); r.u16();
  const cible = r.varint();
  const effet = r.u8();
  if (!(effet & 2)) return null;
  const acteur = r.varint();
  r.varint();
  const code = Math.floor(r.u32() / 100);
  if (!codeRaisonnable(code)) return null;
  const degats = r.varint();
  if (cible === acteur) return null;
  return { cible, acteur, code, degats };
}
function decoderChaine(d, off, max) {
  const out = [];
  for (let i = off; i < off + max && i < d.length; i++) {
    const b = d[i];
    if (b === 0) break;
    if (b < 32) { const rep = Math.min(b, out.length); for (let j = 0; j < rep; j++) out.push(out[j]); }
    else out.push(b);
  }
  return [...Buffer.from(out).toString("utf8")].filter(c => /[\p{L}\p{N}]/u.test(c)).join("");
}
function lireNom(d, debut, fin) {
  debut += 4;
  if (debut >= fin || !(d[debut] & 1)) return null;
  let pos = debut + 1;
  const l = varint(d, pos);
  if (l.v < 1 || l.v > 72) return null;
  pos += l.n;
  if (pos + l.v > fin) return null;
  const nom = decoderChaine(d, pos, l.v);
  if (!nom || /^\d+$/.test(nom)) return null;
  return { nom, fin: pos + l.v };
}
function lireInfoJoueur(q) {
  let pos = varint(q, 0).n + 2;
  if (pos >= q.length) return null;
  const e = varint(q, pos);
  if (e.v < 1) return null;
  pos += e.n;
  const n = lireNom(q, pos, q.length);
  return n ? { id: e.v, nom: n.nom } : null;
}
function lireGroupe(q) {
  const r = new Lecteur(q);
  r.varint(); r.u16();
  r.u32(); r.chaine(); r.u8(); r.u32();
  r.u8(); r.u8(); r.u64(); r.bit(); r.u8(); r.u8();
  const nb = r.varint();
  if (nb > 64) return [];
  const membres = [];
  for (let i = 0; i < nb; i++) {
    const masque = r.u8();
    r.u8();
    const dbid = r.u64();
    const nom = r.chaine();
    r.u32();
    const niveau = r.u32();
    if (masque & 0x01) r.u32();
    r.u32();
    if (masque & 0x02) r.bit();
    r.bit();
    if (masque & 0x04) r.u16();
    if (masque & 0x08) r.u16();
    r.u8();
    r.u64();
    const tickets = r.varint();
    for (let j = 0; j < tickets && j < 256; j++) { r.u8(); r.u32(); }
    if (masque & 0x10) r.u64();
    r.u8(); r.u8();
    if (masque) membres.push({ id: dbid.lo, serveur: (dbid.hi >>> 16) & 0xffff, nom, niveau });
  }
  return membres;
}
const MARQUE_INVOC = Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
function lireInvocation(q) {
  const fin = q.length;
  const pos = varint(q, 0).n + 2;
  if (pos >= fin) return null;
  const id = varint(q, pos).v;
  if (id < 0) return null;
  const zone = q.subarray(pos);
  const b = zone.indexOf(MARQUE_INVOC);
  if (b < 0) return null;
  const apres = b + MARQUE_INVOC.length;
  if (apres >= zone.length) return null;
  const reste = zone.subarray(apres);
  let h = reste.indexOf(Buffer.from([0x07, 0x02, 0x06]));
  if (h < 0) h = reste.indexOf(Buffer.from([0x07, 0x02, 0x01]));
  if (h < 0) h = reste.indexOf(Buffer.from([0x07, 0x02])) + 1;
  const o = apres + h;
  if (o + 5 > zone.length) return null;
  const maitre = zone[o + 3] | (zone[o + 4] << 8);
  return maitre > 1 ? { id, maitre } : null;
}
function lireMob(q) {
  const fin = q.length;
  const pos = varint(q, 0).n + 2;
  if (pos >= fin) return null;
  const id = varint(q, pos).v;
  if (id < 0) return null;
  const limite = Math.min(pos + 60, fin - 2);
  let marque = -1;
  for (let i = pos; i < limite; i++) {
    const k = pos + i + 2;
    if (k < fin && q[k - 2] === 0 && (q[k - 1] & 0xbf) === 0 && q[k] === 2) { marque = i + 2; break; }
  }
  if (marque < 0) return null;
  const rel = marque - 2;
  if (pos > rel - 3) return null;
  const abs = pos + rel - 3;
  if (abs < pos || abs + 3 > fin) return null;
  const code = q[abs] | (q[abs + 1] << 8) | (q[abs + 2] << 16);
  const lim = Math.min(rel + 64, fin - pos - 2);
  for (let x = rel + 3; x < lim; x++) {
    const a = pos + x;
    if (a >= fin) break;
    if (q[a] !== 1 || a + 1 >= fin) continue;
    const max = varint64(q, a + 1).v;
    if (max <= 0) continue;
    return { id, code, pvMax: max };
  }
  return null;
}
function lirePv(q) {
  let o = 3;
  const e = varint(q, o);
  if (e.n < 0) return null;
  o += e.n;
  for (let k = 0; k < 3; k++) { const s = varint(q, o); if (s.n < 0) return null; o += s.n; }
  if (o + 8 > q.length) return null;
  return { id: e.v, pv: q.readUInt32LE(o) + q.readUInt32LE(o + 4) * DEUX32 };
}

/* ════════ Noms des monstres ════════ */
// Table code → nom (anglais) des monstres, boss et mannequins, d'après les données publiées par RATmeter (GPL-3.0)
let MOBS = null;
function nomMob(code) {
  if (!code) return null;
  if (!MOBS) { try { MOBS = require("./mobs.json"); } catch { MOBS = {}; } }
  const v = MOBS[String(code)];
  if (!v) return null;
  return Array.isArray(v) ? { nom: v[0], boss: !!(v[1] & 1), mannequin: !!(v[1] & 2) } : { nom: v, boss: false, mannequin: false };
}

const SEUIL_BOSS = 10000000;

/* ════════ Joueurs et monstres ════════ */
class Entites {
  constructor() { this.vider(); }
  vider() {
    this.sessions = new Map(); this.globaux = new Map(); this.invocations = new Map(); this.mobs = new Map();
    this.groupe = new Set(); this.groupeNoms = new Set(); this.moi = "";
  }
  joueur(id, classe) {
    let p = this.sessions.get(id);
    if (!p) {
      p = { id, nom: "", classe: classe ?? null, identifie: false, moi: false, global: null, cree: Date.now() };
      this.sessions.set(id, p);
      if (this.sessions.size > 400) {
        const limite = Date.now() - 600000;
        for (const [k, s] of this.sessions) if (!s.identifie && s.cree < limite) this.sessions.delete(k);
      }
    } else if (p.classe == null && classe != null) p.classe = classe;
    return p;
  }
  nommer(id, nom, moi = false) {
    const ex = this.sessions.get(id);
    if (ex && ex.identifie && ex.nom !== nom) this.sessions.delete(id);
    const p = this.joueur(id);
    p.nom = nom;
    p.identifie = true;
    p.moi = moi || nom === this.moi;
    if (moi) this.definirMoi(nom);
    this.lierParNom(nom);
  }
  definirMoi(nom) {
    if (!nom) return;
    this.moi = nom;
    for (const s of this.sessions.values()) if (s.nom === nom) s.moi = true;
    for (const g of this.globaux.values()) if (g.nom === nom) g.moi = true;
  }
  global(d) {
    let g = this.globaux.get(d.id);
    if (!g) { g = { id: d.id }; this.globaux.set(d.id, g); }
    Object.assign(g, { nom: d.nom, niveau: d.niveau, serveur: d.serveur, identifie: true });
    g.moi = !!g.moi || g.nom === this.moi;
    for (const s of this.sessions.values()) if (s.global === d.id) this.appliquer(s, g);
    this.lierParNom(g.nom);
  }
  lier(gid, sid) {
    const s = this.joueur(sid);
    s.global = gid;
    let g = this.globaux.get(gid);
    if (!g) { g = { id: gid, nom: s.nom, identifie: s.identifie, moi: s.moi }; this.globaux.set(gid, g); }
    this.appliquer(s, g);
  }
  appliquer(s, g) {
    if (g.identifie && g.nom) { s.nom = g.nom; s.identifie = true; }
    s.moi = s.moi || !!g.moi;
    s.global = g.id;
  }
  lierParNom(nom) {
    if (!nom) return;
    let s = null, g = null;
    for (const x of this.sessions.values()) if (x.global == null && x.nom === nom) { s = x; break; }
    if (!s) return;
    for (const x of this.globaux.values()) if (x.nom === nom) { g = x; break; }
    if (g) this.appliquer(s, g);
  }
  definirGroupe(membres) {
    this.groupe = new Set(membres.map(m => m.id));
    this.groupeNoms = new Set(membres.map(m => m.nom).filter(Boolean));
    for (const m of membres) this.global(m);
  }
  estGroupe(s) { return !!s && ((s.global != null && this.groupe.has(s.global)) || (!!s.nom && this.groupeNoms.has(s.nom))); }
}

/* ════════ Combats ════════ */
class Combat {
  constructor({ inactif = 10000, historique = [] } = {}) {
    this.inactif = inactif; this.historique = historique; this.cur = null; this.dernier = null; this.surFin = null; this.entites = null;
  }
  ajouter(ev) {
    if (this.cur && ev.t - this.cur.dernier > this.inactif) this.terminer();
    if (!this.cur) {
      this.cur = { debut: ev.t, dernier: ev.t, total: 0, joueurs: new Map(), cibles: new Map(), derniers: new Map(), secondes: new Map() };
      this.dernier = this.cur;
    }
    const c = this.cur;
    let j = c.joueurs.get(ev.source);
    if (!j) { j = { id: ev.source, total: 0, coups: 0, crit: 0, dos: 0, parfait: 0, double: 0, max: 0, dot: 0, morts: 0, comp: new Map() }; c.joueurs.set(ev.source, j); }
    j.total += ev.degats;
    if (ev.dot) j.dot += ev.degats;
    else {
      j.coups++;
      if (ev.crit) j.crit++;
      if (ev.dos) j.dos++;
      if (ev.parfait) j.parfait++;
      if (ev.double) j.double++;
      if (ev.degats > j.max) j.max = ev.degats;
    }
    const base = baseCompetence(ev.code);
    let k = j.comp.get(base);
    if (!k) { k = { code: base, total: 0, coups: 0, crit: 0, max: 0, dot: !!ev.dot }; j.comp.set(base, k); }
    k.total += ev.degats; k.coups++;
    if (ev.crit) k.crit++;
    if (ev.degats > k.max) k.max = ev.degats;
    c.total += ev.degats;
    if (ev.t > c.dernier) c.dernier = ev.t;
    c.cibles.set(ev.cible, (c.cibles.get(ev.cible) || 0) + ev.degats);
    c.derniers.set(ev.cible, ev.t);
    const s = Math.floor((ev.t - c.debut) / 1000);
    c.secondes.set(s, (c.secondes.get(s) || 0) + ev.degats);
  }
  mort(id) { const j = this.cur && this.cur.joueurs.get(id); if (j) j.morts++; }
  terminer() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    if (c.dernier - c.debut >= 3000 && c.total > 0) {
      this.historique.unshift(this.resume(c));
      this.historique.length = Math.min(this.historique.length, 30);
      if (this.surFin) this.surFin(this.historique);
    }
  }
  tick(t) { if (this.cur && t - this.cur.dernier > this.inactif) this.terminer(); }
  reinitialiser() { this.cur = null; this.dernier = null; }
  duree(c) { return Math.max(1000, c.dernier - c.debut); }
  ident(id) {
    const e = this.entites, s = e && e.sessions.get(id);
    const g = s && s.global != null && e.globaux ? e.globaux.get(s.global) : null;
    return { nom: (s && s.nom) || "", classe: s ? s.classe : null, serveur: (g && g.serveur) || null, moi: !!(s && s.moi), groupe: !!(s && (s.moi || e.estGroupe(s))) };
  }
  resume(c) {
    const d = this.duree(c);
    const joueurs = [...c.joueurs.values()].sort((a, b) => b.total - a.total).slice(0, 24)
      .map(j => ({ ...this.ident(j.id), total: j.total, dps: Math.round(j.total / d * 1000) }));
    const moi = joueurs.find(j => j.moi);
    return { debut: c.debut, duree: d, total: c.total, dps: Math.round(c.total / d * 1000), cible: this.cible(c), moi: moi ? { dps: moi.dps, total: moi.total } : null, joueurs };
  }
  // Cible en question : la plus frappée parmi celles touchées dans les 8 dernières secondes du combat
  cible(c) {
    let id = null, max = -1;
    const recents = c.derniers ? [...c.derniers].filter(([, t]) => c.dernier - t <= 8000).map(([k]) => k) : [];
    const candidats = recents.length ? recents : [...c.cibles.keys()];
    for (const k of candidats) { const v = c.cibles.get(k) || 0; if (v > max) { max = v; id = k; } }
    if (id == null) return null;
    const m = this.entites && this.entites.mobs.get(id);
    const info = m ? (m.nom ? { nom: m.nom, boss: !!m.boss, mannequin: false } : nomMob(m.code)) : null;
    return { id, code: m ? m.code || null : null, nom: info ? info.nom : null, boss: !!(info && info.boss), mannequin: !!(info && info.mannequin),
      pv: m && m.pv != null ? m.pv : null, pvMax: m && m.pvMax ? m.pvMax : null, degats: max };
  }
  serie(c, t) {
    if (!c) return [];
    const fin = Math.floor((Math.min(t, c.dernier + this.inactif) - c.debut) / 1000);
    const debut = Math.max(0, fin - 59), out = [];
    for (let s = debut; s <= fin; s++) {
      let somme = 0;
      for (let k = s - 2; k <= s; k++) somme += c.secondes.get(k) || 0;
      out.push(Math.round(somme / Math.min(3, s + 1)));
    }
    return out;
  }
  etat(t, noms) {
    const c = this.cur || this.dernier;
    let combat = null;
    if (c) {
      const d = this.duree(c);
      const joueurs = [...c.joueurs.values()].sort((a, b) => b.total - a.total).slice(0, 24).map(j => {
        const nh = Math.max(1, j.coups);
        const comp = [...j.comp.values()].sort((a, b) => b.total - a.total).slice(0, 16).map(k => {
          const n = noms && (noms.get(k.code) || noms.get(Math.floor(k.code / 10000) * 10000));
          return { code: k.code, nom: n ? n.nom : "", icone: n ? n.icone : "", total: k.total, coups: k.coups, crit: Math.round(k.crit / Math.max(1, k.coups) * 100), max: k.max, dot: k.dot, part: c.total ? k.total / Math.max(1, j.total) : 0 };
        });
        return {
          id: j.id, ...this.ident(j.id), total: j.total, dps: Math.round(j.total / d * 1000), part: c.total ? j.total / c.total : 0,
          coups: j.coups, crit: Math.round(j.crit / nh * 100), dos: Math.round(j.dos / nh * 100), parfait: Math.round(j.parfait / nh * 100),
          double: Math.round(j.double / nh * 100), max: j.max, dot: j.dot, morts: j.morts, comp
        };
      });
      combat = { debut: c.debut, duree: d, total: c.total, dps: Math.round(c.total / d * 1000), cible: this.cible(c), joueurs };
    }
    return { enCombat: !!this.cur && t - this.cur.dernier <= this.inactif, combat, serie: this.serie(c, t), historique: this.historique };
  }
}

/* ════════ Analyseur : du flux TCP aux combats ════════ */
class Analyseur {
  constructor({ inactif = 10000, historique = [], dot = true, bossOnly = false } = {}) {
    this.bossOnly = bossOnly;
    this.flux = new Map();
    this.entites = new Entites();
    this.combat = new Combat({ inactif, historique });
    this.combat.entites = this.entites;
    this.noms = new Map();
    this.dot = dot;
    this.stats = { paquets: 0, degats: 0, erreurs: 0, dernierDegat: 0 };
  }
  tcp(port, data, trou, t = Date.now()) {
    let f = this.flux.get(port);
    if (!f) { f = new Flux(); this.flux.set(port, f); }
    if (trou) f.vider();
    f.ajouter(data, p => this.paquet(p, t));
  }
  reinitialiserFlux() { this.flux.clear(); }
  paquet(p, t) {
    for (const q of paquetsInternes(p)) {
      this.stats.paquets++;
      try { this.traiter(q, t); } catch { this.stats.erreurs++; }
    }
  }
  traiter(q, t) {
    switch (opcode(q)) {
      case OP.DEGATS: {
        const d = lireDegats(q);
        if (d) this.degats(d, t, false);
        break;
      }
      case OP.DOT: {
        if (!this.dot) break;
        const d = lireDot(q);
        if (d) this.degats(d, t, true);
        break;
      }
      case OP.MOI: { const i = lireInfoJoueur(q); if (i) this.entites.nommer(i.id, i.nom, true); break; }
      case OP.AUTRES: { const i = lireInfoJoueur(q); if (i) this.entites.nommer(i.id, i.nom); break; }
      case OP.LIEN: {
        const r = new Lecteur(q);
        r.varint(); r.u16(); r.saut(2);
        const sid = r.varint();
        r.saut(4);
        this.entites.lier(r.u32(), sid);
        break;
      }
      case OP.GROUPE: { const m = lireGroupe(q); if (m.length) this.entites.definirGroupe(m); break; }
      case OP.MOB: {
        const i = lireInvocation(q);
        if (i) this.entites.invocations.set(i.id, i.maitre);
        const m = lireMob(q);
        if (m) { const x = this.entites.mobs.get(m.id) || { id: m.id }; x.code = m.code; x.pvMax = m.pvMax; this.entites.mobs.set(m.id, x); }
        break;
      }
      case OP.PV: {
        const h = lirePv(q);
        if (!h) break;
        let m = this.entites.mobs.get(h.id);
        if (!m) { if (h.pv < 1000000) break; m = { id: h.id, code: 0, pvMax: 0 }; this.entites.mobs.set(h.id, m); }
        m.pv = h.pv;
        if (m.pv > (m.pvMax || 0) + 10000000) m.pvMax = m.pv;
        break;
      }
      case OP.MORT: {
        const r = new Lecteur(q);
        r.varint(); r.u16();
        const id = r.varint();
        const s = this.entites.sessions.get(id);
        if (s && s.identifie) this.combat.mort(id);
        break;
      }
      default: break;
    }
  }
  // Boss (ou mannequin d'entraînement) : d'après la table des monstres ; monstre absent de la table :
  // ses points de vie (au moins SEUIL_BOSS) le désignent comme boss.
  estBoss(id) {
    const m = this.entites.mobs.get(id);
    if (!m) return false;
    if (m.boss) return true;
    const info = m.code ? nomMob(m.code) : null;
    if (info) return info.boss || info.mannequin;
    return (m.pvMax || m.pv || 0) >= SEUIL_BOSS;
  }
  degats(d, t, dot) {
    if (d.degats <= 0) return;
    const base = baseCompetence(d.code);
    if (SOINS.has(base)) return;
    if (this.bossOnly && !this.estBoss(d.cible)) return; // option « Boss uniquement »
    let classe;
    if (theostone(d.code)) {
      const p = this.entites.sessions.get(d.acteur);
      if (!p) return;
      classe = p.classe;
    } else {
      classe = classeDe(d.code);
      if (classe == null) return;
    }
    // Soins sur la durée appliqués à un allié : ce ne sont pas des dégâts
    if (dot) { const c = this.entites.sessions.get(d.cible); if (c && c.identifie) return; }
    let source = d.acteur, invocation = false;
    this.entites.joueur(d.acteur, classe);
    if (this.entites.invocations.has(d.acteur)) { source = this.entites.invocations.get(d.acteur); invocation = true; }
    this.entites.joueur(source, invocation ? null : classe);
    this.stats.degats++;
    this.stats.dernierDegat = t;
    this.combat.ajouter({ t, source, cible: d.cible, code: d.code, degats: d.degats, crit: !!d.crit, dos: !!d.dos, parfait: !!d.parfait, double: !!d.double, dot });
  }
  etat(t = Date.now()) { this.combat.tick(t); return this.combat.etat(t, this.noms); }
}

/* ════════ Démo : un groupe simulé pour régler l'affichage ════════ */
class DemoGroupe {
  constructor(analyseur, nomMoi) {
    this.a = analyseur;
    this.membres = [
      { id: 901, nom: nomMoi || "Moi", classe: 15, base: 52000, codes: [15010000, 15020000, 15030000, 15110000, 15210000], moi: true },
      { id: 902, nom: "Kaelthys", classe: 11, base: 61000, codes: [11010000, 11020000, 11050000, 11120000] },
      { id: 903, nom: "Sylvaine", classe: 14, base: 47000, codes: [14010000, 14020000, 14040000, 14100000] },
      { id: 904, nom: "Elowen", classe: 17, base: 15000, codes: [17010000, 17030000] }
    ];
    for (const m of this.membres) {
      const s = this.a.entites.joueur(m.id, m.classe);
      s.nom = m.nom; s.identifie = true; s.moi = !!m.moi; s.global = 7000 + m.id;
    }
    this.a.entites.definirMoi(this.membres[0].nom);
    this.a.entites.groupe = new Set(this.membres.map(m => 7000 + m.id));
    this.a.entites.mobs.set(5555, { id: 5555, code: 1, nom: "Gardien de la démo", boss: true, pvMax: 48000000, pv: 48000000 });
    this.debut = 0;
  }
  tick(t) {
    if (!this.debut) this.debut = t;
    const cycle = (t - this.debut) % 75000;
    if (cycle > 62000) return; // courte pause entre deux combats
    const mob = this.a.entites.mobs.get(5555);
    if (cycle < 600) mob.pv = mob.pvMax;
    for (const m of this.membres) {
      const coups = 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < coups; k++) {
        const crit = Math.random() < 0.32;
        const deg = Math.round(m.base / 4 * (0.6 + Math.random() * 0.8) * (crit ? 1.8 : 1));
        const code = m.codes[Math.floor(Math.random() * m.codes.length)] + (Math.random() < 0.3 ? 10 : 0);
        this.a.combat.ajouter({ t, source: m.id, cible: 5555, code, degats: deg, crit, dos: Math.random() < 0.2, parfait: Math.random() < 0.1, double: Math.random() < 0.08, dot: false });
        mob.pv = Math.max(0, mob.pv - deg);
      }
    }
  }
}

module.exports = {
  Analyseur, Flux, Entites, Combat, DemoGroupe, CLASSES,
  nomMob,
  _test: { varint, varint64, lz4, paquetsInternes, trames, opcode, lireDegats, lireDot, lireGroupe, lireInfoJoueur, lireNom, decoderChaine, lireInvocation, lirePv, baseCompetence, classeDe, codeRaisonnable }
};
