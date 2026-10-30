// Gatekeeper secure viewer: the web app in a desktop window that the operating system leaves out of
// every screenshot, screen recording and screen share. A web page cannot do this; a window can
// (BrowserWindow.setContentProtection: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) on Windows 10
// 2004 and later, NSWindowSharingNone on macOS). Print Screen, Snipping Tool, Game Bar, OBS and
// Teams or Zoom sharing get the desktop behind the window, or black, instead of the page.
//
//   GATEKEEPER_URL                     the site to open (default: the local container on port 8000)
//   GATEKEEPER_CONTENT_PROTECTION=off  show the window in captures, e.g. to present over a screen share
const { app, BrowserWindow, Menu, session, shell } = require("electron");

const START_URL = process.env.GATEKEEPER_URL || "http://127.0.0.1:8000";
const PROTECTED = process.env.GATEKEEPER_CONTENT_PROTECTION !== "off";
const ORIGIN = new URL(START_URL).origin;

function openOutside(url) {
  // Links to other sites (EUR-Lex, GitHub) open in the normal browser, never inside the viewer.
  if (/^https?:/.test(url)) shell.openExternal(url);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "Gatekeeper",
    backgroundColor: "#08090a",
    webPreferences: { contextIsolation: true, sandbox: true, devTools: false, spellcheck: false },
  });
  win.setContentProtection(PROTECTED);
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === ORIGIN) return;
    event.preventDefault();
    openOutside(url);
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`Could not load ${url}: ${description} (${code}). Is Gatekeeper running?`);
  });
  win.loadURL(START_URL);
  console.log(`Gatekeeper secure viewer: ${START_URL}, content protection ${PROTECTED ? "on" : "off"}`);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // Nothing leaves through downloads either.
  session.defaultSession.on("will-download", (event) => event.preventDefault());
  createWindow();
});
app.on("window-all-closed", () => app.quit());
