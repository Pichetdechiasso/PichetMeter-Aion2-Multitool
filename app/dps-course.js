"use strict";
/**
 * PichetMeter · DPS meter façon course, rendu fluide.
 * Le contenu n'est plus remplacé à chaque rafraîchissement : il est mis à jour en place (les barres glissent jusqu'à
 * leur nouvelle largeur, les chiffres défilent). Quand un joueur en dépasse un autre, sa ligne glisse à sa nouvelle
 * place (FLIP), avec un éclair et un badge ▲ ; la bannière « Nouveau leader » flotte par-dessus sans changer la
 * taille du widget (la fenêtre ne bouge plus).
 * Les lignes portent data-jid (identifiant du joueur) et data-v (son DPS).
 */
window.CourseDps = (() => {
  const ETATS = new WeakMap();
  const PASSAGERES = new Set(["monte", "descend", "entre"]); // classes d'animation conservées pendant la mise à jour
  const reduit = () => document.body.classList.contains("no-anim") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const echap = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cle = n => n.nodeType === 1 ? (n.getAttribute("data-jid") || n.getAttribute("data-k") || null) : null;
  const garder = n => n.nodeType === 1 && n.hasAttribute("data-keep");

  /* ── Mise à jour en place d'un arbre DOM vers un nouvel arbre (léger « morph ») ── */
  function attributs(a, b) {
    for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
    for (const { name, value } of [...b.attributes]) {
      if (name === "class") {
        const gardees = [...a.classList].filter(c => PASSAGERES.has(c) || /^r\d$/.test(c));
        const nouv = value.split(/\s+/).filter(Boolean);
        const final = [...new Set([...nouv, ...gardees])].join(" ");
        if (a.getAttribute("class") !== final) a.setAttribute("class", final);
      } else if (name === "style") {
        if (a.getAttribute("style") !== value) {
          const tr = a.style.transform, tn = a.style.transition; // ne pas couper une animation FLIP en cours
          a.setAttribute("style", value);
          if (tr) a.style.transform = tr;
          if (tn) a.style.transition = tn;
        }
      } else if (a.getAttribute(name) !== value) a.setAttribute(name, value);
    }
  }
  function enfants(parent, modele) {
    const anciens = [...parent.childNodes].filter(n => !garder(n));
    const parCle = new Map();
    for (const n of anciens) { const k = cle(n); if (k) parCle.set(k, n); }
    const nouveaux = [...modele.childNodes];
    let curseur = 0;
    const libres = anciens.filter(n => !cle(n));
    const resultat = [];
    for (const m of nouveaux) {
      const k = cle(m);
      let n = k ? parCle.get(k) : null;
      if (k && n) parCle.delete(k);
      if (!k) {
        // nœud sans clé : on réutilise le prochain nœud libre de même nature
        while (curseur < libres.length && !(libres[curseur].nodeType === m.nodeType && libres[curseur].nodeName === m.nodeName)) curseur++;
        n = curseur < libres.length ? libres[curseur++] : null;
      }
      if (n) { morph(n, m); resultat.push(n); }
      else resultat.push(m.cloneNode(true));
    }
    // ordre final ; les nœuds « à garder » (badges, bannière) restent en place
    const restent = new Set(resultat);
    for (const n of anciens) if (!restent.has(n)) n.remove();
    let ref = parent.firstChild;
    for (const n of resultat) {
      while (ref && garder(ref)) ref = ref.nextSibling;
      if (n !== ref) parent.insertBefore(n, ref); else ref = ref.nextSibling;
    }
  }
  function morph(a, b) {
    if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue && !a.parentNode?.hasAttribute?.("data-defile")) a.nodeValue = b.nodeValue; return; }
    attributs(a, b);
    if (a.hasAttribute("data-defile")) return; // chiffre en train de défiler : il finit lui-même sur la bonne valeur
    enfants(a, b);
  }
  function mettreAJour(box, html) {
    const t = document.createElement("template");
    t.innerHTML = html;
    const racine = t.content;
    // premier rendu, ou structure différente : remplacement simple
    const a = [...box.children].filter(n => !garder(n)), b = [...racine.children];
    const type = n => n ? n.nodeName + "." + String(n.className).split(" ")[0] : "";
    if (!a.length || !b.length || type(a[0]) !== type(b[0])) {
      for (const n of [...box.childNodes]) if (!garder(n)) n.remove();
      box.appendChild(racine);
      return;
    }
    enfants(box, racine);
  }

  function defiler(el, de, a, fmt) {
    el.setAttribute("data-defile", "1");
    const t0 = performance.now(), d = 800;
    const pas = now => {
      if (!el.isConnected) return;
      const k = Math.min(1, (now - t0) / d), x = de + (a - de) * (1 - Math.pow(1 - k, 3));
      el.textContent = fmt(x);
      if (k < 1) requestAnimationFrame(pas); else el.removeAttribute("data-defile");
    };
    requestAnimationFrame(pas);
  }
  function badge(ligne, texte, cls) {
    const b = document.createElement("span");
    b.className = "dps-up " + cls; b.textContent = texte; b.setAttribute("data-keep", "1");
    b.addEventListener("animationend", () => b.remove());
    ligne.appendChild(b);
  }
  function retirerApresAnim(el, cls) { el.addEventListener("animationend", function f(e) { if (e.target === el) { el.classList.remove(cls); el.removeEventListener("animationend", f); } }); }

  /**
   * opts : { actif, valeur (sélecteur du DPS dans une ligne), fmt, nom(id), banniere (sélecteur de l'élément sous lequel
   * flotte la bannière), surLeader(id, ligne), debut (horodatage du combat), leaderTxt }
   */
  function rendre(box, html, opts = {}) {
    let e = ETATS.get(box);
    if (!e) { e = { rang: new Map(), vals: new Map(), combat: null }; ETATS.set(box, e); }
    if (opts.debut !== e.combat) { e.combat = opts.debut; e.rang.clear(); e.vals.clear(); }
    const actif = opts.actif !== false && !reduit();
    const avant = new Map();
    if (actif) for (const r of box.querySelectorAll("[data-jid]")) avant.set(r.dataset.jid, r.getBoundingClientRect().top);
    mettreAJour(box, html);
    const lignes = [...box.querySelectorAll("[data-jid]")];
    const calme = opts.debut && Date.now() - opts.debut < 2500;
    lignes.forEach((r, i) => {
      const id = r.dataset.jid, ancien = e.rang.get(id), v = +r.dataset.v || 0;
      for (const c of [...r.classList]) if (/^r\d$/.test(c)) r.classList.remove(c);
      r.classList.add("r" + Math.min(i + 1, 4));
      if (actif) {
        if (avant.has(id)) {
          const dy = avant.get(id) - r.getBoundingClientRect().top;
          if (Math.abs(dy) > 1) {
            r.style.transition = "none"; r.style.transform = `translate3d(0, ${dy}px, 0)`;
            requestAnimationFrame(() => requestAnimationFrame(() => {
              r.style.transition = "transform .75s cubic-bezier(.22, .9, .3, 1)"; r.style.transform = "";
              setTimeout(() => { if (!r.style.transform) r.style.transition = ""; }, 800);
            }));
          }
        } else if (e.rang.size) { r.classList.add("entre"); retirerApresAnim(r, "entre"); }
        if (ancien != null && !calme && ancien !== i) {
          const cls = ancien > i ? "monte" : "descend";
          r.classList.remove("monte", "descend"); void r.offsetWidth; r.classList.add(cls); retirerApresAnim(r, cls);
          badge(r, (ancien > i ? "▲" : "▼") + Math.abs(ancien - i), ancien > i ? "up" : "down");
          if (ancien > i && i === 0) {
            banniere(box, opts, opts.nom ? opts.nom(id) : "");
            if (opts.surLeader) opts.surLeader(id, r);
          }
        }
        const el = opts.valeur && r.querySelector(opts.valeur), pv = e.vals.get(id);
        if (el && pv != null && Math.abs(pv - v) > 0 && opts.fmt) defiler(el, pv, v, opts.fmt);
      }
      e.rang.set(id, i); e.vals.set(id, v);
    });
    const presents = new Set(lignes.map(r => r.dataset.jid));
    for (const id of [...e.rang.keys()]) if (!presents.has(id)) { e.rang.delete(id); e.vals.delete(id); }
  }
  // Bannière flottante (position absolue) : elle ne change pas la taille du widget
  function banniere(box, opts, nom) {
    const hote = opts.banniere && box.querySelector(opts.banniere);
    if (!hote) return;
    const parent = hote.parentElement;
    const ancienne = parent.querySelector(":scope > .dps-ban"); if (ancienne) ancienne.remove();
    const b = document.createElement("div");
    b.className = "dps-ban"; b.setAttribute("data-keep", "1");
    b.innerHTML = `<i>🏁</i>${opts.leaderTxt || "Nouveau leader"} : <b>${echap(nom)}</b>`;
    b.style.top = hote.offsetTop + "px";
    b.addEventListener("animationend", () => b.remove());
    parent.appendChild(b);
  }
  return { rendre };
})();
