import { createApp } from './bridge.js';
import * as appMod from './src/main.js';

let FRONTEND;
try {
  FRONTEND = decodeURIComponent(new URL('./frontend', import.meta.url).pathname);
  if (/^\/[A-Za-z]:\//.test(FRONTEND)) FRONTEND = FRONTEND.slice(1); // windows /C:/…
} catch { FRONTEND = tjs.exePath.replace(/[\\/][^\\/]*$/, '') + '/frontend'; }

const app = await createApp({
  htmlPath: FRONTEND + '/index.html',
  title: "F1 Next Race",
  size: "820x860",
  version: "1.1.0",
  tinyjsVersion: "v0.42.0",
  id: "com.tinijs.f1-next",
  api: appMod.api ?? {},
  onMenu: appMod.onMenu,
  onTray: appMod.onTray,
  onHotkey: appMod.onHotkey,
  onContextMenu: appMod.onContextMenu,
  onSystem: appMod.onSystem,
  onOpenUrl: appMod.onOpenUrl,
  onOpenFiles: appMod.onOpenFiles,
  onNotificationClick: appMod.onNotificationClick,
  onNotificationAction: appMod.onNotificationAction,
  onMediaKey: appMod.onMediaKey,
  onWindowClosed: appMod.onWindowClosed,
  onWindowState: appMod.onWindowState,
  onClipboardChange: appMod.onClipboardChange,
  onUpdateAvailable: appMod.onUpdateAvailable,
  onAudioTap: appMod.onAudioTap,
  onLocale: appMod.onLocale,
  onNavigate: appMod.onNavigate,
  onDownload: appMod.onDownload,
  onWindowOpen: appMod.onWindowOpen,
  url: null,
  downloads: null,
  popups: null,
  apiAccess: null,
  inject: null,
  chrome: null,
  update: null,
  activation: "regular",
  readAccess: null,
  userAgent: null,
  audioTap: null,
  windowPlacement: null,
  contextMenu: true,
  browserAccelerators: false,
  debug: false,
  about: "menu",
  urlScheme: null,
  fileExtensions: null,
  openFolders: false,
  permissions: null,
  offscreenRescue: null,
});
if (appMod.init) appMod.init(app);

await app.done;
tjs.exit(0);
