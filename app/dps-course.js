"use strict";
/**
 * PichetMeter · DPS meter façon course : les lignes glissent quand un joueur en dépasse un autre (animation FLIP),
 * badge ▲, éclair sur la ligne qui monte, bannière « Nouveau leader », chiffres qui défilent jusqu'à leur valeur.
 * Les lignes portent data-jid (identifiant du joueur) et data-v (son DPS).
 */
window.CourseDps = (() => {
  const ETATS = new WeakMap();
  const reduit = () => document.body.classList.contains("no-anim") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const echap = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function defiler(el, de, a, fmt) {
    const t0 = performance.now(), d = 750;
    const pas = now => {
      if (!el.isConnected) return;
      const k = Math.min(1, (now - t0) / d), x = de + (a - de) * (1 - Math.pow(1 - k, 3));
      el.textContent = fmt(x);
      if (k < 1) requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  }
  function badge(ligne, texte, cls) {
    const b = document.createElement("span");
    b.className = "dps-up " + cls; b.textContent = texte;
    ligne.appendChild(b);
  }

  /**
   * Remplace le contenu de `box` par `html` en animant les changements de place.
   * opts : { actif, valeur (sélecteur du DPS dans une ligne), fmt, nom(id) → texte, banniere (sélecteur), surLeader(id, ligne), debut (horodatage du combat) }
   */
  function rendre(box, html, opts = {}) {
    let e = ETATS.get(box);
    if (!e) { e = { rang: new Map(), vals: new Map(), ban: null, combat: null }; ETATS.set(box, e); }
    if (opts.debut !== e.combat) { e.combat = opts.debut; e.rang.clear(); e.vals.clear(); e.ban = null; } // nouveau combat : on repart de zéro
    const actif = opts.actif !== false && !reduit();
    const avant = new Map();
    if (actif) for (const r of box.querySelectorAll("[data-jid]")) avant.set(r.dataset.jid, r.getBoundingClientRect().top);
    box.innerHTML = html;
    const lignes = [...box.querySelectorAll("[data-jid]")];
    const calme = opts.debut && Date.now() - opts.debut < 2500; // les premières secondes, le classement bouge sans cesse
    lignes.forEach((r, i) => {
      const id = r.dataset.jid, ancien = e.rang.get(id), v = +r.dataset.v || 0;
      r.classList.add("r" + Math.min(i + 1, 4));
      if (actif) {
        if (avant.has(id)) {
          const dy = avant.get(id) - r.getBoundingClientRect().top;
          if (Math.abs(dy) > 1) {
            r.style.transition = "none"; r.style.transform = `translateY(${dy}px)`;
            requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transition = "transform .7s cubic-bezier(.2, .9, .25, 1.05)"; r.style.transform = ""; }));
          }
        } else if (e.rang.size) r.classList.add("entre");
        if (ancien != null && !calme) {
          if (ancien > i) {
            r.classList.add("monte"); badge(r, "▲" + (ancien - i), "up");
            if (i === 0) {
              e.ban = { txt: opts.nom ? opts.nom(id) : "", depuis: Date.now() };
              if (opts.surLeader) opts.surLeader(id, r);
            }
          } else if (ancien < i) { r.classList.add("descend"); badge(r, "▼" + (i - ancien), "down"); }
        }
        const el = opts.valeur && r.querySelector(opts.valeur), pv = e.vals.get(id);
        if (el && pv != null && pv !== v && opts.fmt) defiler(el, pv, v, opts.fmt);
      }
      e.rang.set(id, i); e.vals.set(id, v);
    });
    const presents = new Set(lignes.map(r => r.dataset.jid));
    for (const id of [...e.rang.keys()]) if (!presents.has(id)) { e.rang.delete(id); e.vals.delete(id); }
    // bannière « Nouveau leader » (2,6 s), sans relancer son animation à chaque rafraîchissement
    if (e.ban && opts.banniere) {
      const age = Date.now() - e.ban.depuis;
      if (age < 2600) {
        const host = box.querySelector(opts.banniere);
        if (host) host.insertAdjacentHTML("afterend", `<div class="dps-ban" style="animation-delay:-${age}ms"><i>🏁</i>${opts.leaderTxt || "Nouveau leader"} : <b>${echap(e.ban.txt)}</b></div>`);
      } else e.ban = null;
    }
  }
  return { rendre };
})();
