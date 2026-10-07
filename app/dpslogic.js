"use strict";
/**
 * Logique du DPS meter : lecture des nombres renvoyés par l'OCR et découpage en combats.
 * Aucune dépendance : utilisable par le processus principal et testable avec Node.
 */

/** Corrige les confusions fréquentes de l'OCR entre lettres et chiffres. */
function nettoyer(texte) {
  return String(texte || "")
    .replace(/[   ]/g, " ")
    .replace(/(?<=\d[\doO.,\s]*)[oO]|[oO](?=[\doO.,\s]*\d)/g, "0")
    .replace(/(?<=\d)[lI|](?=\d)|(?<=^|\s)[lI|](?=\d)/g, "1")
    .replace(/(?<=\d)[sS](?=\d)/g, "5")
    .replace(/(?<=\d)B(?=\d)/g, "8");
}

/**
 * Convertit un jeton numérique en nombre.
 * Gère : 12,345 · 12 345 · 12.345 · 1.234,5 · 12,3k · 1.2M · 3,4 M
 */
function jetonVersNombre(brut, suffixe) {
  let s = brut.replace(/\s+/g, "");
  const point = s.lastIndexOf("."), virgule = s.lastIndexOf(",");
  if (point >= 0 && virgule >= 0) {
    const dec = point > virgule ? "." : ",";
    const mil = dec === "." ? "," : ".";
    s = s.split(mil).join("").replace(dec, ".");
  } else if (point >= 0 || virgule >= 0) {
    const sep = point >= 0 ? "." : ",";
    const morceaux = s.split(sep);
    const millier = morceaux.length > 1 && morceaux.slice(1).every(m => m.length === 3) && !suffixe;
    s = millier ? morceaux.join("") : morceaux.slice(0, -1).join("") + "." + morceaux[morceaux.length - 1];
  }
  let n = parseFloat(s);
  if (!isFinite(n)) return null;
  const k = (suffixe || "").toLowerCase();
  if (k === "k") n *= 1e3;
  else if (k === "m") n *= 1e6;
  else if (k === "b" || k === "g") n *= 1e9;
  return n;
}

/** Renvoie le nombre le plus "significatif" trouvé dans le texte (le plus de chiffres), ou null. */
function lireNombre(texte) {
  const t = nettoyer(texte);
  const re = /(\d[\d\s.,]*\d|\d)\s*([kKmMbBgG](?![a-zA-Z]))?/g;
  let meilleur = null, chiffres = -1, m;
  while ((m = re.exec(t))) {
    const n = jetonVersNombre(m[1], m[2]);
    if (n == null) continue;
    const c = m[1].replace(/\D/g, "").length + (m[2] ? 3 : 0);
    if (c > chiffres) { chiffres = c; meilleur = n; }
  }
  return meilleur;
}

/**
 * Suivi des combats à partir d'échantillons { t, dps?, total? }.
 * - total fourni : le DPS instantané est calculé sur les 3 dernières secondes si dps est absent.
 * - dps seul : le total est intégré dans le temps.
 * Un combat se termine après `inactif` ms sans progression.
 */
class SuiviCombat {
  constructor(opts = {}) {
    this.inactif = opts.inactif || 6000;
    this.dureeMin = opts.dureeMin || 3000;
    this.historique = opts.historique || [];
    this.combat = null;
    this.serie = [];
    this.dernierBrut = null;
  }

  _nouveau(t, base, pas) {
    this._archiver();
    // le premier échantillon contient déjà environ un intervalle de combat
    this.combat = { debut: t - pas, dernier: t, base, total: 0, pic: 0, points: [], fini: false, dps: 0, dernierEch: t - pas };
  }

  _archiver() {
    const c = this.combat;
    if (!c || c.archive) return;
    const duree = c.dernier - c.debut;
    if (duree >= this.dureeMin && c.total > 0) {
      this.historique.unshift({ debut: c.debut, duree, total: Math.round(c.total), moyenne: Math.round(c.total / (duree / 1000)), pic: Math.round(c.pic) });
      this.historique.length = Math.min(this.historique.length, 50);
    }
    c.archive = true;
  }

  ajouter(e) {
    const t = e.t, pas = e.pas || 1000;
    const brutTotal = e.total != null && isFinite(e.total) ? e.total : null;
    const dpsLu = e.dps != null && isFinite(e.dps) ? e.dps : null;
    let c = this.combat;

    if (brutTotal != null) {
      const precedent = this.dernierBrut;
      if (!c || (precedent != null && brutTotal < precedent * 0.7)) {
        if (brutTotal > 0) this._nouveau(t, 0, pas);
      } else if (c.fini && precedent != null && brutTotal > precedent) {
        this._nouveau(t, precedent, pas);
      }
      c = this.combat;
      this.dernierBrut = brutTotal;
      if (c && !c.fini) {
        const total = Math.max(0, brutTotal - c.base);
        if (total > c.total) { c.total = total; c.dernier = t; }
        c.points.push([t, c.total]);
        while (c.points.length > 2 && c.points[1][0] <= t - 3000) c.points.shift();
        const [t0, v0] = c.points[0];
        const taux = t > t0 ? (c.total - v0) / ((t - t0) / 1000) : c.total / (pas / 1000);
        c.dps = dpsLu != null ? dpsLu : taux;
      }
    } else if (dpsLu != null) {
      if (dpsLu > 0 && (!c || c.fini)) { this._nouveau(t, 0, pas); c = this.combat; }
      if (c && !c.fini) {
        const dt = (t - (c.dernierEch != null ? c.dernierEch : t)) / 1000;
        c.total += dpsLu * Math.max(0, dt);
        if (dpsLu !== c.dps || dpsLu > 0) c.dernier = dpsLu > 0 ? t : c.dernier;
        c.dps = dpsLu;
        c.dernierEch = t;
      }
    }

    c = this.combat;
    if (c && !c.fini) {
      c.pic = Math.max(c.pic, c.dps || 0);
      if (t - c.dernier > this.inactif) { c.fini = true; c.dps = 0; this._archiver(); }
    }
    this.serie.push([t, c && !c.fini ? Math.round(c.dps || 0) : 0]);
    while (this.serie.length && this.serie[0][0] < t - 60000) this.serie.shift();
    return this.etat(t);
  }

  reinitialiser() { this._archiver(); this.combat = null; this.dernierBrut = null; this.serie = []; }

  etat(t) {
    const c = this.combat;
    const duree = c ? Math.max(0, (c.fini ? c.dernier : t) - c.debut) : 0;
    return {
      enCombat: !!(c && !c.fini),
      dps: c && !c.fini ? Math.round(c.dps || 0) : 0,
      moyenne: c && duree > 0 ? Math.round(c.total / (duree / 1000)) : 0,
      pic: c ? Math.round(c.pic) : 0,
      total: c ? Math.round(c.total) : 0,
      duree,
      serie: this.serie.map(p => p[1]),
      historique: this.historique.slice(0, 30)
    };
  }
}

/** Générateur de données de démonstration : combats de 20 à 40 s séparés de pauses. */
class Simulation {
  constructor() { this.t0 = 0; this.total = 0; this.fin = 0; this.pause = 0; this.base = 9000 + Math.random() * 5000; }
  echantillon(t) {
    if (!this.t0 || t > this.pause && this.fin && t > this.fin + 8000) {
      this.t0 = t; this.total = 0; this.fin = t + 20000 + Math.random() * 20000; this.base = 8000 + Math.random() * 8000; this.dernier = t;
    }
    if (t <= this.fin) {
      const dt = (t - this.dernier) / 1000; this.dernier = t;
      const dps = Math.max(0, this.base * (0.75 + Math.random() * 0.5) + Math.sin(t / 2500) * this.base * 0.15);
      this.total += dps * dt;
      return { t, total: Math.round(this.total), dps: Math.round(dps) };
    }
    return { t, total: Math.round(this.total), dps: 0 };
  }
}

module.exports = { lireNombre, nettoyer, SuiviCombat, Simulation };
