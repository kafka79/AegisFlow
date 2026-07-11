/**
 * Safe DOM Patching and Layout Preservation Module
 * Intercepts writes to the #app container to preserve layout components (sidebar, header)
 * without polluting Element.prototype.
 */

const templateParser = document.createElement("template");

// Patch and update the target DOM tree cleanly without destructive re-renders
export function patchAppDOM(targetEl, htmlValue) {
  // Check if this HTML value represents a layout page containing sidebar and main wrapper
  if (htmlValue.includes("sidebar") && htmlValue.includes("main-wrapper")) {
    templateParser.innerHTML = htmlValue;
    
    const newSidebar = templateParser.content.querySelector(".sidebar");
    const newHeader = templateParser.content.querySelector(".top-header");
    const newViewContainer = templateParser.content.querySelector(".view-container");
    
    const currentSidebar = targetEl.querySelector(".sidebar");
    const currentMainWrapper = targetEl.querySelector(".main-wrapper");
    
    if (currentSidebar && currentMainWrapper) {
      // 1. Update active sidebar link
      if (newSidebar) {
        const activeLink = newSidebar.querySelector(".sidebar-link.active");
        if (activeLink) {
          const activeText = activeLink.textContent.trim();
          currentSidebar.querySelectorAll(".sidebar-link").forEach(link => {
            if (link.textContent.trim() === activeText) {
              link.classList.add("active");
            } else {
              link.classList.remove("active");
            }
          });
        }
      }
      
      // 2. Update Header details dynamically
      if (newHeader) {
        const currentHeader = currentMainWrapper.querySelector(".top-header");
        if (currentHeader) {
          const newTitle = newHeader.querySelector(".view-title");
          const currentTitle = currentHeader.querySelector(".view-title");
          if (newTitle && currentTitle && currentTitle.textContent !== newTitle.textContent) {
            currentTitle.textContent = newTitle.textContent;
          }
          
          const newAvatar = newHeader.querySelector(".user-avatar");
          const currentAvatar = currentHeader.querySelector(".user-avatar");
          if (newAvatar && currentAvatar && currentAvatar.src !== newAvatar.src) {
            currentAvatar.src = newAvatar.src;
          }
          
          const newName = newHeader.querySelector(".user-name");
          const currentName = currentHeader.querySelector(".user-name");
          if (newName && currentName && currentName.textContent !== newName.textContent) {
            currentName.textContent = newName.textContent;
          }
          
          // Sync sync badge container if present
          const newSync = newHeader.querySelector("#cloud-sync-status");
          const currentSync = currentHeader.querySelector("#cloud-sync-status");
          if (newSync && currentSync) {
            currentSync.innerHTML = newSync.innerHTML;
          }
        }
      }
      
      // 3. Update view-container contents cleanly
      if (newViewContainer) {
        const currentViewContainer = currentMainWrapper.querySelector(".view-container");
        if (currentViewContainer) {
          currentViewContainer.className = "view-container animate-fade";
          
          // Record current active element focus and selection coordinates to prevent layout jumps/resets
          const activeEl = document.activeElement;
          let activeInfo = null;
          if (activeEl && currentViewContainer.contains(activeEl)) {
            activeInfo = {
              path: getElementPath(currentViewContainer, activeEl),
              value: activeEl.value,
              selectionStart: activeEl.selectionStart,
              selectionEnd: activeEl.selectionEnd
            };
          }
          
          // Clear current contents cleanly
          while (currentViewContainer.firstChild) {
            currentViewContainer.removeChild(currentViewContainer.firstChild);
          }
          
          currentViewContainer.innerHTML = newViewContainer.innerHTML;
          
          // Restore focus and cursor selection coordinates
          if (activeInfo) {
            const newActiveEl = findElementByPath(currentViewContainer, activeInfo.path);
            if (newActiveEl) {
              newActiveEl.focus();
              try {
                if (activeInfo.value !== undefined) {
                  newActiveEl.value = activeInfo.value;
                }
                if (activeInfo.selectionStart !== null && activeInfo.selectionEnd !== null) {
                  newActiveEl.setSelectionRange(activeInfo.selectionStart, activeInfo.selectionEnd);
                }
              } catch (e) {
                // Ignore errors for elements that don't support text selections
              }
            }
          }
        }
      }
      
      // Free memory allocations immediately
      templateParser.innerHTML = "";
      return;
    }
  }
  
  // Default fallback: direct write to element innerHTML
  targetEl.innerHTML = htmlValue;
  templateParser.innerHTML = "";
}

// ponytail: use clean global renderApp function instead of prototype pollution
export function initDOMRenderer() {
  window.renderApp = (value) => {
    const el = document.getElementById("app");
    if (el) {
      patchAppDOM(el, value);
    }
  };
}

// Tree path utilities for active element focus preservation
function getElementPath(root, target) {
  const path = [];
  let curr = target;
  while (curr && curr !== root) {
    const parent = curr.parentElement;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(curr);
    path.unshift(index);
    curr = parent;
  }
  return path;
}

function findElementByPath(root, path) {
  let curr = root;
  for (const index of path) {
    if (!curr || !curr.children[index]) return null;
    curr = curr.children[index];
  }
  return curr;
}
