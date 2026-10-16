"use strict";
// Volet du lecteur vidéo : vidéos recommandées lues dans la page YouTube (anciens et nouveaux formats)
const assert = require("assert");
const { lireInitialData, recommandations, extraireVideos } = require("../app/suggestions");
const data = { contents: { twoColumnWatchNextResults: {
  results: { results: { contents: [{ videoPrimaryInfoRenderer: { title: { runs: [{ text: "Vidéo courante" }] } } }] } },
  secondaryResults: { secondaryResults: { results: [
    { compactVideoRenderer: { videoId: "aaaaaaaaaaa", title: { simpleText: "Ancienne vignette" }, shortBylineText: { runs: [{ text: "Chaîne A" }] }, lengthText: { simpleText: "4:20" } } },
    { lockupViewModel: { contentId: "bbbbbbbbbbb", contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
      contentImage: { thumbnailViewModel: { overlays: [{ thumbnailOverlayBadgeViewModel: { thumbnailBadges: [{ thumbnailBadgeViewModel: { text: "12:05" } }] } }] } },
      metadata: { lockupMetadataViewModel: { title: { content: "Nouvelle vignette \"guillemets\" {accolade}" },
        metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: "Chaîne B" } }] }, { metadataParts: [{ text: { content: "12 k vues" } }] }] } } } } } },
    { lockupViewModel: { contentId: "PLxxxxxxxxxx", contentType: "LOCKUP_CONTENT_TYPE_PLAYLIST", metadata: { lockupMetadataViewModel: { title: { content: "Une playlist" } } } } },
    { compactVideoRenderer: { videoId: "ccccccccccc", title: { simpleText: "La vidéo elle-même" } } }
  ] } } } } };
const html = `<html><script>var ytInitialData = ${JSON.stringify(data)};</script><script>var autre = {};</script></html>`;
const lu = lireInitialData(html);
assert(lu, "ytInitialData lu malgré les accolades dans les titres");
const r = recommandations(lu, "ccccccccccc");
assert.strictEqual(r.length, 2, "la vidéo courante et les playlists sont écartées");
assert.deepStrictEqual(r[0], { id: "aaaaaaaaaaa", titre: "Ancienne vignette", auteur: "Chaîne A", duree: "4:20", vues: "" });
assert.deepStrictEqual(r[1], { id: "bbbbbbbbbbb", titre: "Nouvelle vignette \"guillemets\" {accolade}", auteur: "Chaîne B", duree: "12:05", vues: "12 k vues" });
assert.strictEqual(lireInitialData("<html>rien</html>"), null);
// accueil YouTube (« Pour toi ») : grille de vignettes, les shorts sont ignorés
const accueil = { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { richGridRenderer: { contents: [
  { richItemRenderer: { content: { videoRenderer: { videoId: "ddddddddddd", title: { runs: [{ text: "Pour toi 1" }] }, ownerText: { runs: [{ text: "Chaîne D" }] }, lengthText: { simpleText: "9:59" } } } } },
  { richSectionRenderer: { content: { richShelfRenderer: { contents: [{ richItemRenderer: { content: { shortsLockupViewModel: { entityId: "x", overlayMetadata: { primaryText: { content: "Un short" } } } } } }] } } } },
  { richItemRenderer: { content: { lockupViewModel: { contentId: "eeeeeeeeeee", contentType: "LOCKUP_CONTENT_TYPE_VIDEO", metadata: { lockupMetadataViewModel: { title: { content: "Pour toi 2" } } } } } } }
] } } } }] } };
assert.deepStrictEqual(extraireVideos(accueil).map(v => v.id), ["ddddddddddd", "eeeeeeeeeee"]);
console.log("suggestions.test ok");
