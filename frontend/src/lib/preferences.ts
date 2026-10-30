/**
 * Theme and sidebar preferences. Both live as attributes on <html>, which the boot script in
 * layout.tsx sets before first paint (no flash); React subscribes to them.
 */

import type { WorkspaceId } from "./routes";

export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "gatekeeper.theme";
export const SIDEBAR_KEY = "gatekeeper.sidebar";
const WORKSPACE_KEY = "gatekeeper.workspace";
/** Below this width the sidebar starts collapsed to icons. */
export const SIDEBAR_COLLAPSE_QUERY = "(max-width: 1023px)";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs inline in <head> before paint: applies ?theme=dark|light or the stored theme, sets the
 * sidebar state, and forwards old links (/#staff, /#spe, /#privacy, /privacy/) to their routes.
 * Storage reads are guarded one by one so blocked storage still gets the system theme.
 */
export const BOOT_SCRIPT = `(function(){var d=document.documentElement,q=new URLSearchParams(location.search);function g(k){try{return localStorage.getItem(k)}catch(e){return null}}var t=q.get("theme");if(t!=="dark"&&t!=="light")t=g("${THEME_KEY}")||"system";var k=t==="dark"||(t==="system"&&matchMedia("${DARK_QUERY}").matches);d.classList.toggle("dark",k);d.style.colorScheme=k?"dark":"light";var l=q.get("lang");if(l!=="de"&&l!=="en")l=g("gatekeeper.locale")||((navigator.language||"").toLowerCase().indexOf("de")===0?"de":"en");d.lang=l;d.dataset.sidebarState=matchMedia("${SIDEBAR_COLLAPSE_QUERY}").matches||g("${SIDEBAR_KEY}")==="collapsed"?"collapsed":"expanded";var p=location.pathname,h=location.hash.slice(1),m={staff:"/staff/",spe:"/spe/",privacy:"/staff/privacy/"};if(p==="/"&&q.get("decision"))location.replace("/requests/?id="+encodeURIComponent(q.get("decision")));else if(p==="/"&&m[h])location.replace(m[h]+location.search);else if(p==="/privacy"||p==="/privacy/")location.replace("/staff/privacy/"+location.search)})()`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the preference then lasts for this page only.
  }
}

const themeListeners = new Set<() => void>();

export function storedTheme(): Theme {
  const value = read(THEME_KEY);
  return value === "light" || value === "dark" ? value : "system";
}

export function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia(DARK_QUERY).matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  write(THEME_KEY, theme);
  applyTheme(theme);
  themeListeners.forEach((listener) => {
    listener();
  });
}

export function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  // Follow the operating system while the preference is "system".
  const media = window.matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (storedTheme() === "system") applyTheme("system");
  };
  media.addEventListener("change", onSystemChange);
  return () => {
    themeListeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
  };
}

export type SidebarState = "expanded" | "collapsed";

export function sidebarState(): SidebarState {
  return document.documentElement.dataset.sidebarState === "collapsed" ? "collapsed" : "expanded";
}

export function setSidebarState(state: SidebarState, remember: boolean): void {
  document.documentElement.dataset.sidebarState = state;
  if (remember) write(SIDEBAR_KEY, state);
}

export function storedSidebarState(): SidebarState {
  return read(SIDEBAR_KEY) === "collapsed" ? "collapsed" : "expanded";
}

export function subscribeSidebar(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-sidebar-state"] });
  return () => {
    observer.disconnect();
  };
}

/** The workspace last used, for pages outside both workspaces (such as the 404 page). */
export function storedWorkspace(): WorkspaceId {
  return read(WORKSPACE_KEY) === "staff" ? "staff" : "applicant";
}

export function rememberWorkspace(workspace: WorkspaceId): void {
  write(WORKSPACE_KEY, workspace);
}
