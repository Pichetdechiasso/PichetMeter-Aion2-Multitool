"use strict";
// Lecteur vidéo : type de lien, sortie de yt-dlp, arguments de VLC
const assert = require("assert");
const { source, lireSortie, argsVlc, FORMAT } = require("../app/lecteur");

assert.strictEqual(source("https://youtu.be/KcaGnoXHlEA?si=x"), "youtube");
assert.strictEqual(source("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube");
assert.strictEqual(source("https://www.twitch.tv/zerator"), "twitch");
assert.strictEqual(source("https://clips.twitch.tv/AbcDef"), "twitch");
assert.strictEqual(source("https://kick.com/x"), "autre");
assert.strictEqual(source("pas un lien"), null);

const yt = lireSortie("Mon titre de vidéo\nhttps://rr1.googlevideo.com/videoplayback?itag=137\nhttps://rr1.googlevideo.com/videoplayback?itag=140\n");
assert.deepStrictEqual(yt, { titre: "Mon titre de vidéo", urls: ["https://rr1.googlevideo.com/videoplayback?itag=137", "https://rr1.googlevideo.com/videoplayback?itag=140"] });
const tw = lireSortie("zerator (live) 2026-10-15 16:30\r\nhttps://video-weaver.fra05.hls.ttvnw.net/v1/playlist/abc.m3u8\r\n");
assert.strictEqual(tw.urls.length, 1); assert(tw.titre.startsWith("zerator"));
assert.deepStrictEqual(lireSortie(""), { titre: "", urls: [] });

const a = argsVlc({ hwnd: "123456", port: 4242, mdp: "secret", urls: ["https://v/1", "https://a/2"], titre: "T" });
assert(a.includes("--drawable-hwnd=123456") && a.includes("--http-port=4242") && a.includes("--http-password=secret") && a.includes("--http-host=127.0.0.1"));
assert(a.indexOf("https://v/1") < a.indexOf(":input-slave=https://a/2"), "l'audio est un flux secondaire de la vidéo");
assert.strictEqual(a[0], "-I"); assert.strictEqual(a[1], "dummy");
assert(!argsVlc({ hwnd: "1", port: 1, mdp: "x", urls: ["https://v"], titre: "" }).some(x => x.startsWith(":input-slave")));
assert(/avc1/.test(FORMAT) && /\/b$/.test(FORMAT));
console.log("lecteur.test ok");
