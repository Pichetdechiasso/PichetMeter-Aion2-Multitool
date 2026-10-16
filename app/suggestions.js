"use strict";
/**
 * Vidéos recommandées par YouTube pour le volet du lecteur vidéo : lues dans la page publique de la vidéo
 * (données « ytInitialData » de la colonne de droite), comme le ferait un navigateur. Aucun compte, aucune clé.
 * Le format de YouTube change souvent : la lecture parcourt tout l'arbre et reconnaît les anciennes vignettes
 * (compactVideoRenderer) comme les nouvelles (lockupViewModel).
 */
const texte = t => !t ? "" : typeof t === "string" ? t : t.simpleText || t.content || (Array.isArray(t.runs) ? t.runs.map(r => r.text || "").join("") : "") || "";

/** Objet ytInitialData d'une page de vidéo YouTube, ou null. */
function lireInitialData(html) {
  const s = String(html || "");
  const i = s.search(/(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*\{/);
  if (i < 0) return null;
  const debut = s.indexOf("{", i);
  // fin de l'objet : on compte les accolades hors chaînes de caractères
  let prof = 0, dansChaine = false, echap = false;
  for (let j = debut; j < s.length; j++) {
    const c = s[j];
    if (dansChaine) { if (echap) echap = false; else if (c === "\\") echap = true; else if (c === '"') dansChaine = false; continue; }
    if (c === '"') dansChaine = true;
    else if (c === "{") prof++;
    else if (c === "}" && --prof === 0) { try { return JSON.parse(s.slice(debut, j + 1)); } catch { return null; } }
  }
  return null;
}

/** Durée affichée sur une vignette (« 12:34 »), cherchée dans un sous-arbre. */
function badgeDuree(o, prof = 0) {
  if (!o || typeof o !== "object" || prof > 12) return "";
  if (o.thumbnailBadgeViewModel && /^\d+(:\d\d){1,2}$/.test(String(o.thumbnailBadgeViewModel.text || "").trim())) return o.thumbnailBadgeViewModel.text.trim();
  for (const k in o) { const r = badgeDuree(o[k], prof + 1); if (r) return r; }
  return "";
}

/** Vidéos trouvées dans un arbre de données YouTube : { id, titre, auteur, duree, vues }. */
function extraireVideos(racine, { max = 30, sauf = "" } = {}) {
  const out = [], vus = new Set(sauf ? [sauf] : []);
  (function visite(o, prof) {
    if (!o || typeof o !== "object" || out.length >= max || prof > 60) return;
    if (Array.isArray(o)) { for (const x of o) visite(x, prof + 1); return; }
    const r = o.compactVideoRenderer || o.videoRenderer || o.playlistPanelVideoRenderer || o.playlistVideoRenderer;
    if (r && /^[\w-]{11}$/.test(r.videoId || "") && !vus.has(r.videoId)) {
      vus.add(r.videoId);
      out.push({ id: r.videoId, titre: texte(r.title), auteur: texte(r.shortBylineText || r.longBylineText || r.ownerText), duree: texte(r.lengthText), vues: texte(r.shortViewCountText || r.viewCountText) });
      return;
    }
    const l = o.lockupViewModel;
    if (l && /^[\w-]{11}$/.test(l.contentId || "") && /VIDEO/i.test(l.contentType || "") && !vus.has(l.contentId)) {
      vus.add(l.contentId);
      const meta = ((l.metadata || {}).lockupMetadataViewModel) || {};
      const lignes = (((meta.metadata || {}).contentMetadataViewModel || {}).metadataRows) || [];
      const parts = lignes.map(r => (r.metadataParts || []).map(p => texte(p.text)).filter(Boolean));
      out.push({ id: l.contentId, titre: texte(meta.title), auteur: (parts[0] || [])[0] || "", duree: badgeDuree(l.contentImage), vues: (parts[1] || [])[0] || "" });
      return;
    }
    for (const k in o) visite(o[k], prof + 1);
  })(racine, 0);
  return out.filter(v => v.titre);
}

/** Recommandations de la colonne de droite d'une page de vidéo (sinon, de toute la page). */
function recommandations(data, id) {
  const cote = data && data.contents && data.contents.twoColumnWatchNextResults && data.contents.twoColumnWatchNextResults.secondaryResults;
  return extraireVideos(cote || data, { sauf: id });
}

module.exports = { lireInitialData, extraireVideos, recommandations, texte };
