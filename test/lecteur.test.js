"use strict";
// Lecteur vidéo : type de lien, sortie de yt-dlp, arguments de VLC
const assert = require("assert");
const { source, lireSortie, lireListe, lienListe, argsVlc, formatQualite, QUALITES, FORMAT } = require("../app/lecteur");

assert.strictEqual(source("https://youtu.be/KcaGnoXHlEA?si=x"), "youtube");
assert.strictEqual(source("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube");
assert.strictEqual(source("https://www.twitch.tv/zerator"), "twitch");
assert.strictEqual(source("https://clips.twitch.tv/AbcDef"), "twitch");
assert.strictEqual(source("https://kick.com/x"), "autre");
assert.strictEqual(source("pas un lien"), null);

const yt = lireSortie("#1080\nMon titre de vidéo\nhttps://rr1.googlevideo.com/videoplayback?itag=137\nhttps://rr1.googlevideo.com/videoplayback?itag=140\n");
assert.deepStrictEqual(yt, { titre: "Mon titre de vidéo", urls: ["https://rr1.googlevideo.com/videoplayback?itag=137", "https://rr1.googlevideo.com/videoplayback?itag=140"], hauteur: 1080, largeur: 0 });
const yt2 = lireSortie("#1920x1080\nT\nhttps://a"); assert.strictEqual(yt2.largeur, 1920); assert.strictEqual(yt2.hauteur, 1080);
assert.strictEqual(lireSortie("#NAxNA\nT\nhttps://a").hauteur, 0);
assert.strictEqual(lireSortie("#NA\n1080\nhttps://a").titre, "1080", "un titre fait de chiffres reste le titre");
assert.strictEqual(lireSortie("#NA\nT\nhttps://a").hauteur, 0);
const tw = lireSortie("zerator (live) 2026-10-15 16:30\r\nhttps://video-weaver.fra05.hls.ttvnw.net/v1/playlist/abc.m3u8\r\n");
assert.strictEqual(tw.urls.length, 1); assert(tw.titre.startsWith("zerator"));
assert.deepStrictEqual(lireSortie(""), { titre: "", urls: [], hauteur: 0, largeur: 0 });
// playlists YouTube / YouTube Music
assert.deepStrictEqual(lienListe("https://music.youtube.com/playlist?list=OLAK5uy_abc"), { liste: "OLAK5uy_abc", video: null, musique: true });
assert.deepStrictEqual(lienListe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123"), { liste: "PL123", video: "dQw4w9WgXcQ", musique: false });
assert.strictEqual(lienListe("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), null);
assert.strictEqual(lienListe("https://www.twitch.tv/x?list=1"), null);
const pl = lireListe("dQw4w9WgXcQ\tChanson\t212.0\tArtiste\tMa playlist\nabcdefghijk\tNA\tNA\tNA\tMa playlist\nWARNING: x\n");
assert.strictEqual(pl.titre, "Ma playlist"); assert.strictEqual(pl.entrees.length, 2);
assert.deepStrictEqual(pl.entrees[0], { id: "dQw4w9WgXcQ", titre: "Chanson", duree: 212, auteur: "Artiste" });
assert.deepStrictEqual(pl.entrees[1], { id: "abcdefghijk", titre: "", duree: 0, auteur: "" });

const a = argsVlc({ hwnd: "123456", port: 4242, mdp: "secret", urls: ["https://v/1", "https://a/2"], titre: "T" });
assert(a.includes("--drawable-hwnd=123456") && a.includes("--http-port=4242") && a.includes("--http-password=secret") && a.includes("--http-host=127.0.0.1"));
assert(a.indexOf("https://v/1") < a.indexOf(":input-slave=https://a/2"), "l'audio est un flux secondaire de la vidéo");
assert.strictEqual(a[0], "-I"); assert.strictEqual(a[1], "dummy");
assert(!argsVlc({ hwnd: "1", port: 1, mdp: "x", urls: ["https://v"], titre: "" }).some(x => x.startsWith(":input-slave")));
assert(/avc1/.test(FORMAT) && /\/b$/.test(FORMAT) && FORMAT === formatQualite("auto") && /height<=1080/.test(FORMAT));
assert(/height<=720/.test(formatQualite("720")) && formatQualite("audio").startsWith("ba") && formatQualite("max") === "bv*+ba/b");
assert.deepStrictEqual(QUALITES, ["auto", "max", "1080", "720", "480", "360", "audio"]);
assert(argsVlc({ hwnd: "1", port: 1, mdp: "x", urls: ["https://v"], debut: 95.6 }).includes(":start-time=95"));
assert(!argsVlc({ hwnd: "1", port: 1, mdp: "x", urls: ["https://v"], debut: 0 }).some(x => x.startsWith(":start-time")));
console.log("lecteur.test ok");
