import { escapeHtml } from "../renderer.js";

export function showInlineAlert(container, message, type = "error") {
  if (!container) return;
  container.innerHTML = "";
  const alert = document.createElement("div");
  alert.className = `alert-banner alert-${type}`;
  const span = document.createElement("span");
  span.textContent = message;
  alert.appendChild(span);
  container.appendChild(alert);
}

export let selectedCalendarDate = new Date();
