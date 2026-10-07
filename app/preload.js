"use strict";
// Pont entre l'interface et le processus principal. L'interface ne reçoit aucun accès à Node.
const { contextBridge, ipcRenderer } = require("electron");

let etat = "{}";
try { etat = ipcRenderer.sendSync("get-state"); } catch (e) { /* réglages par défaut */ }

contextBridge.exposeInMainWorld("__bridge", {
  state: etat,
  version: ipcRenderer.sendSync("get-version"),
  call: (methode, args) => ipcRenderer.invoke("api", methode, args || []),
  onPush: callback => { ipcRenderer.on("push", (_event, message) => callback(message)); }
});
