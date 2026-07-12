/**
 * Safe DOM patching and layout preservation.
 * The renderer keeps the app shell stable while replacing routed view content.
 */

const templateParser = document.createElement("template");
const avatarCache = new Map();

const SAFE_EVENT_HANDLER_PATTERN =
  /^(?:[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)\((?:[\w\s$.'"{},:?#=&%+\-]*)?\)$/;

const allowedTags = new Set([
  "div", "span", "p", "a", "button", "input", "select", "textarea", "label",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "thead",
  "tbody", "tr", "th", "td", "form", "img", "svg", "path", "circle", "text",
  "strong", "em", "small", "code", "pre", "header", "footer", "section",
  "article", "nav", "main", "aside", "dialog", "option", "optgroup",
  "fieldset", "legend"
]);

const allowedAttributes = new Set([
  "class", "id", "data-id", "data-layout", "name", "type", "value", "placeholder",
  "disabled", "readonly", "required", "href", "role", "aria-label",
  "aria-labelledby", "aria-describedby", "aria-expanded", "aria-hidden",
  "aria-live", "aria-atomic", "aria-pressed", "aria-selected", "aria-controls",
  "aria-owns", "tabindex", "style", "src", "alt", "title", "viewBox", "fill",
  "stroke", "stroke-width", "d", "cx", "cy", "r", "x", "y", "width", "height",
  "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline"
]);

const eventAttributeMap = new Map([
  ["onclick", "click"],
  ["oninput", "input"],
  ["onchange", "change"],
  ["onsubmit", "submit"]
]);

let delegatedEventsReady = false;
let eventAttributeObserver = null;

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[m]);
}

function isSafeUrl(value, attrName = "href") {
  const raw = String(value || "").trim();
  if (!raw) return true;
  if (raw.startsWith("#") || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) return true;
  try {
    const url = new URL(raw, window.location.href);
    if (attrName === "src") {
      return url.protocol === "http:" || url.protocol === "https:";
    }
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isSafeEventHandler(value) {
  const handler = String(value || "").trim();
  if (!handler || /[;<>`]/.test(handler)) return false;
  return SAFE_EVENT_HANDLER_PATTERN.test(handler);
}

function sanitizeHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const tagName = node.tagName.toLowerCase();
    if (!allowedTags.has(tagName)) {
      node.replaceWith(...node.childNodes);
      continue;
    }

    for (const attr of Array.from(node.attributes)) {
      const attrName = attr.name;
      const lowerName = attrName.toLowerCase();
      const isDataOrAria = lowerName.startsWith("data-") || lowerName.startsWith("aria-");
      const isEvent = lowerName.startsWith("on");

      if (isEvent) {
        const eventName = eventAttributeMap.get(lowerName);
        if (eventName && isSafeEventHandler(attr.value)) {
          node.setAttribute(`data-wf-${eventName}`, attr.value);
        }
        node.removeAttribute(attrName);
        continue;
      }

      if (!allowedAttributes.has(attrName) && !allowedAttributes.has(lowerName) && !isDataOrAria) {
        node.removeAttribute(attrName);
        continue;
      }

      if ((lowerName === "href" || lowerName === "src") && !isSafeUrl(attr.value, lowerName)) {
        node.removeAttribute(attrName);
      }
    }
  }

  return template.innerHTML;
}

function getActionKey(element) {
  return element?.getAttribute("data-wf-click") ||
    element?.getAttribute("onclick") ||
    element?.textContent?.trim() ||
    "";
}

function normalizeEventAttributes(root = document) {
  const elements = [];
  if (root.nodeType === Node.ELEMENT_NODE) elements.push(root);
  if (root.querySelectorAll) {
    elements.push(...root.querySelectorAll(Array.from(eventAttributeMap.keys()).map((name) => `[${name}]`).join(",")));
  }

  for (const element of elements) {
    for (const [attrName, eventName] of eventAttributeMap.entries()) {
      if (!element.hasAttribute?.(attrName)) continue;
      const value = element.getAttribute(attrName);
      if (isSafeEventHandler(value)) {
        element.setAttribute(`data-wf-${eventName}`, value);
      }
      element.removeAttribute(attrName);
    }
  }
}

function splitArguments(source) {
  const args = [];
  let current = "";
  let quote = null;
  let depth = 0;
  let escaped = false;

  for (const char of source) {
    if (quote) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === "{" || char === "[" || char === "(") depth++;
    if (char === "}" || char === "]" || char === ")") depth--;

    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

function splitKeyValue(source) {
  let quote = null;
  let depth = 0;
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "{" || char === "[" || char === "(") depth++;
    if (char === "}" || char === "]" || char === ")") depth--;
    if (char === ":" && depth === 0) {
      return [source.slice(0, i).trim(), source.slice(i + 1).trim()];
    }
  }

  return [source.trim(), ""];
}

function unquote(value) {
  const quote = value[0];
  return value
    .slice(1, -1)
    .replace(new RegExp(`\\\\${quote}`, "g"), quote)
    .replace(/\\\\/g, "\\");
}

function parseActionValue(rawValue, event, element) {
  const value = rawValue.trim();
  if (!value) return undefined;
  if (value === "event") return event;
  if (value === "this") return element;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return unquote(value);
  }
  if (value.startsWith("{") && value.endsWith("}")) {
    const object = {};
    const body = value.slice(1, -1).trim();
    if (!body) return object;
    for (const pair of splitArguments(body)) {
      const [keyRaw, valRaw] = splitKeyValue(pair);
      const key = keyRaw.replace(/^['"]|['"]$/g, "");
      object[key] = parseActionValue(valRaw, event, element);
    }
    return object;
  }
  return value;
}

function resolveActionFunction(pathValue) {
  const parts = pathValue.split(".");
  let context = window;
  for (const part of parts.slice(0, -1)) {
    context = context?.[part];
  }
  const fn = context?.[parts.at(-1)];
  return typeof fn === "function" ? { fn, context } : null;
}

function executeDelegatedAction(action, event, element) {
  if (!isSafeEventHandler(action)) return;
  const match = action.trim().match(/^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\((.*)\)$/);
  if (!match) return;

  const target = resolveActionFunction(match[1]);
  if (!target) return;

  if (event.type === "submit") event.preventDefault();
  const args = splitArguments(match[2]).map((arg) => parseActionValue(arg, event, element));
  target.fn.apply(target.context === window ? element : target.context, args);
}

function setupDelegatedEvents() {
  if (delegatedEventsReady) return;
  delegatedEventsReady = true;

  for (const eventName of eventAttributeMap.values()) {
    document.addEventListener(eventName, (event) => {
      const actionElement = event.target?.closest?.(`[data-wf-${eventName}]`);
      if (!actionElement || !document.contains(actionElement)) return;
      executeDelegatedAction(actionElement.getAttribute(`data-wf-${eventName}`), event, actionElement);
    }, true);
  }

  normalizeEventAttributes(document);
  eventAttributeObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) normalizeEventAttributes(node);
      if (record.type === "attributes") normalizeEventAttributes(record.target);
    }
  });
  eventAttributeObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: Array.from(eventAttributeMap.keys())
  });
}

function createErrorFallback(error, retryFn) {
  const fallback = document.createElement("div");
  fallback.className = "glass error-fallback animate-fade";
  fallback.style.padding = "48px";
  fallback.style.textAlign = "center";
  fallback.setAttribute("role", "alert");
  fallback.setAttribute("aria-live", "assertive");

  const title = document.createElement("h3");
  title.style.marginBottom = "8px";
  title.style.color = "var(--text-main)";
  title.textContent = "Something went wrong";
  fallback.appendChild(title);

  const message = document.createElement("p");
  message.style.color = "var(--text-muted)";
  message.style.marginBottom = "24px";
  message.textContent = error.message || String(error);
  fallback.appendChild(message);

  const button = document.createElement("button");
  button.className = "btn btn-primary";
  button.type = "button";
  button.textContent = "Try Again";
  button.addEventListener("click", () => retryFn());
  fallback.appendChild(button);

  return fallback;
}

export function setAriaExpanded(element, expanded) {
  element?.setAttribute("aria-expanded", String(expanded));
}

export function setAriaHidden(element, hidden) {
  element?.setAttribute("aria-hidden", String(hidden));
}

export function setAriaLive(element, politeness) {
  element?.setAttribute("aria-live", politeness);
}

export function announceToScreenReader(message, politeness = "polite") {
  const region = document.getElementById("a11y-announcer") || (() => {
    const el = document.createElement("div");
    el.id = "a11y-announcer";
    el.setAttribute("aria-live", politeness);
    el.setAttribute("aria-atomic", "true");
    el.style.position = "absolute";
    el.style.width = "1px";
    el.style.height = "1px";
    el.style.padding = "0";
    el.style.margin = "-1px";
    el.style.overflow = "hidden";
    el.style.clip = "rect(0, 0, 0, 0)";
    el.style.whiteSpace = "nowrap";
    el.style.border = "0";
    document.body.appendChild(el);
    return el;
  })();
  region.textContent = message;
}

export function getFocusableElements(container) {
  return Array.from(container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  )).filter((el) => el.tabIndex !== -1 && !el.disabled);
}

function getUniqueSelector(el, root) {
  if (el.id) return `#${CSS.escape(el.id)}`;
  if (el.getAttribute("data-id")) return `[data-id="${CSS.escape(el.getAttribute("data-id"))}"]`;
  if (el.getAttribute("name")) return `[name="${CSS.escape(el.getAttribute("name"))}"]`;

  const parts = [];
  let current = el;
  while (current && current !== root && parts.length < 5) {
    let selector = current.tagName.toLowerCase();
    if (current.className && typeof current.className === "string") {
      const classes = current.className.trim().split(/\s+/).filter((c) => c && !c.startsWith("animate-"));
      if (classes.length) selector += `.${classes.map((c) => CSS.escape(c)).join(".")}`;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      if (siblings.length > 1) selector += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }

    parts.unshift(selector);
    current = parent;
  }
  return parts.join(" > ");
}

function updateLayoutShell(targetEl, fragment) {
  const newSidebar = fragment.querySelector(".sidebar");
  const newHeader = fragment.querySelector(".top-header");
  const newViewContainer = fragment.querySelector(".view-container");
  const currentSidebar = targetEl.querySelector(".sidebar");
  const currentMainWrapper = targetEl.querySelector(".main-wrapper");

  if (!currentSidebar || !currentMainWrapper || !newViewContainer) return false;

  if (newSidebar) {
    const activeLink = newSidebar.querySelector(".sidebar-link.active");
    if (activeLink) {
      const activeKey = getActionKey(activeLink);
      currentSidebar.querySelectorAll(".sidebar-link").forEach((link) => {
        const linkKey = getActionKey(link);
        const isActive = linkKey === activeKey;
        link.classList.toggle("active", isActive);
        link.setAttribute("aria-current", isActive ? "page" : "false");
      });
    }
  }

  if (newHeader) {
    const currentHeader = currentMainWrapper.querySelector(".top-header");
    const pairs = [
      [".view-title", "textContent"],
      [".user-name", "textContent"],
      [".user-role", "textContent"]
    ];
    for (const [selector, prop] of pairs) {
      const next = newHeader.querySelector(selector);
      const current = currentHeader?.querySelector(selector);
      if (next && current && current[prop] !== next[prop]) current[prop] = next[prop];
    }

    const newAvatar = newHeader.querySelector(".user-avatar");
    const currentAvatar = currentHeader?.querySelector(".user-avatar");
    if (newAvatar && currentAvatar && currentAvatar.src !== newAvatar.src) {
      currentAvatar.src = newAvatar.src;
    }

    const newSync = newHeader.querySelector("#cloud-sync-status");
    const currentSync = currentHeader?.querySelector("#cloud-sync-status");
    if (newSync && currentSync) currentSync.innerHTML = sanitizeHtml(newSync.innerHTML);
  }

  const currentViewContainer = currentMainWrapper.querySelector(".view-container");
  if (!currentViewContainer) return false;

  const activeEl = document.activeElement;
  const activeSelector = activeEl && currentViewContainer.contains(activeEl)
    ? getUniqueSelector(activeEl, currentViewContainer)
    : null;

  currentViewContainer.className = "view-container animate-fade";
  currentViewContainer.innerHTML = newViewContainer.innerHTML;
  currentViewContainer.setAttribute("role", "main");

  const nextActiveEl = activeSelector ? currentViewContainer.querySelector(activeSelector) : null;
  if (nextActiveEl) nextActiveEl.focus();

  return true;
}

export function patchAppDOM(targetEl, htmlValue) {
  try {
    const sanitizedHtml = sanitizeHtml(htmlValue);
    templateParser.innerHTML = sanitizedHtml;
    const fragment = templateParser.content;
    const isLayoutPage =
      fragment.querySelector("[data-layout]") ||
      (fragment.querySelector(".sidebar") && fragment.querySelector(".main-wrapper"));

    if (isLayoutPage && updateLayoutShell(targetEl, fragment)) {
      templateParser.innerHTML = "";
      return;
    }

    targetEl.innerHTML = sanitizedHtml;
    templateParser.innerHTML = "";
  } catch (error) {
    console.error("[RENDERER] Patch failed:", error);
    targetEl.innerHTML = "";
    targetEl.appendChild(createErrorFallback(error, () => patchAppDOM(targetEl, htmlValue)));
    templateParser.innerHTML = "";
  }
}

export function getCachedAvatar(initials, color = "6366f1", size = 100) {
  const safeInitials = escapeHtml(initials).slice(0, 4);
  const safeColor = /^[0-9a-f]{3,8}$/i.test(color) ? color : "6366f1";
  const safeSize = Number.isFinite(Number(size)) ? Number(size) : 100;
  const key = `${safeInitials}-${safeColor}-${safeSize}`;

  if (avatarCache.has(key)) {
    const cached = avatarCache.get(key);
    avatarCache.delete(key);
    avatarCache.set(key, cached);
    return cached;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}"><circle cx="${safeSize / 2}" cy="${safeSize / 2}" r="${safeSize / 2}" fill="%23${safeColor}"/><text x="${safeSize / 2}" y="${safeSize / 2 + safeSize / 8}" font-family="Arial, sans-serif" font-size="${safeSize / 3}" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle">${safeInitials}</text></svg>`;
  const dataUri = `data:image/svg+xml;utf8,${svg}`;

  if (avatarCache.size >= 100) {
    avatarCache.delete(avatarCache.keys().next().value);
  }
  avatarCache.set(key, dataUri);
  return dataUri;
}

let focusTrapCleanup = null;
let lastFocusedElement = null;

export function enableFocusTrap(modalElement) {
  disableFocusTrap();
  lastFocusedElement = document.activeElement;

  function handleKeydown(e) {
    if (e.key === "Escape") {
      window.closeModal?.();
      return;
    }
    if (e.key !== "Tab") return;

    const focusableElements = getFocusableElements(modalElement);
    if (!focusableElements.length) return;

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstFocusable) {
      e.preventDefault();
      lastFocusable.focus();
    } else if (!e.shiftKey && document.activeElement === lastFocusable) {
      e.preventDefault();
      firstFocusable.focus();
    }
  }

  modalElement.addEventListener("keydown", handleKeydown);
  modalElement.setAttribute("role", "dialog");
  modalElement.setAttribute("aria-modal", "true");
  getFocusableElements(modalElement)[0]?.focus();

  focusTrapCleanup = () => {
    modalElement.removeEventListener("keydown", handleKeydown);
    modalElement.removeAttribute("role");
    modalElement.removeAttribute("aria-modal");
    lastFocusedElement?.focus?.();
  };
}

export function disableFocusTrap() {
  if (focusTrapCleanup) {
    focusTrapCleanup();
    focusTrapCleanup = null;
  }
}

export function shouldAnimate() {
  return !prefersReducedMotion();
}

export function initDOMRenderer() {
  setupDelegatedEvents();

  window.renderApp = (value) => {
    const el = document.getElementById("app");
    if (el) patchAppDOM(el, value);
  };

  window.getCachedAvatar = getCachedAvatar;
  window.enableFocusTrap = enableFocusTrap;
  window.disableFocusTrap = disableFocusTrap;
  window.setAriaExpanded = setAriaExpanded;
  window.setAriaHidden = setAriaHidden;
  window.announceToScreenReader = announceToScreenReader;
  window.shouldAnimate = shouldAnimate;
  window.escapeHtml = escapeHtml;
}
