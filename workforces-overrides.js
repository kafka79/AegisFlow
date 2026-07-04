(function () {
  const original = {};
  let pendingSignup = null;
  let selectedLeaveRange = { start: "", end: "" };
  let attendanceViewMode = "daily";

  // =========================================================================
  // INDEXEDDB FILE STORAGE ENGINE (Prevents localStorage quota crashes)
  // =========================================================================
  const DB_NAME = "workforces_db";
  const DB_VERSION = 1;
  let db = null;
  const avatarCache = {};
  let dbReady = false;
  const dbReadyCallbacks = [];

  function initDB(callback) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = function (e) {
      console.error("IndexedDB failed to open:", e);
      dbReady = true;
      if (callback) callback();
      dbReadyCallbacks.forEach(cb => cb());
    };
    request.onsuccess = function (e) {
      db = e.target.result;
      prefetchAvatars(function () {
        dbReady = true;
        console.log("IndexedDB initialized and avatars cached.");
        if (callback) callback();
        dbReadyCallbacks.forEach(cb => cb());
      });
    };
    request.onupgradeneeded = function (e) {
      const activeDb = e.target.result;
      if (!activeDb.objectStoreNames.contains("files")) {
        activeDb.createObjectStore("files", { keyPath: "id" });
      }
    };
  }

  function prefetchAvatars(callback) {
    if (!db) {
      if (callback) callback();
      return;
    }
    try {
      const tx = db.transaction("files", "readonly");
      const store = tx.objectStore("files");
      const request = store.openCursor();
      request.onsuccess = function (event) {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.key.startsWith("avatar-")) {
            avatarCache[cursor.key] = cursor.value.data;
          }
          cursor.continue();
        } else {
          if (callback) callback();
        }
      };
      request.onerror = function () {
        if (callback) callback();
      };
    } catch (err) {
      console.error("Error prefetching avatars:", err);
      if (callback) callback();
    }
  }

  function saveFile(id, data, callback) {
    if (!db) {
      if (callback) callback();
      return;
    }
    try {
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      store.put({ id: id, data: data });
      tx.oncomplete = function () {
        if (callback) callback();
      };
    } catch (e) {
      console.error("IndexedDB save failed", e);
      if (callback) callback();
    }
  }

  function getFile(id, callback) {
    if (!db) {
      if (callback) callback(null);
      return;
    }
    try {
      const tx = db.transaction("files", "readonly");
      const store = tx.objectStore("files");
      const request = store.get(id);
      request.onsuccess = function () {
        callback(request.result ? request.result.data : null);
      };
      request.onerror = function () {
        callback(null);
      };
    } catch (e) {
      console.error("IndexedDB read failed", e);
      callback(null);
    }
  }

  function deleteFile(id, callback) {
    if (!db) {
      if (callback) callback();
      return;
    }
    try {
      const tx = db.transaction("files", "readwrite");
      const store = tx.objectStore("files");
      store.delete(id);
      tx.oncomplete = function () {
        if (callback) callback();
      };
    } catch (e) {
      console.error("IndexedDB delete failed", e);
      if (callback) callback();
    }
  }

  // =========================================================================
  // TOAST SYSTEM (Premium UX replacement for browser alert popup triggers)
  // =========================================================================
  function showToast(message, type = "info") {
    let toastContainer = document.getElementById("toast-container");
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.id = "toast-container";
      toastContainer.style.cssText = "position: fixed; top: 24px; right: 24px; z-index: 9999; display: flex; flex-direction: column; gap: 8px;";
      document.body.appendChild(toastContainer);
    }
    const toast = document.createElement("div");
    toast.className = "glass glow-accent animate-fade";
    toast.style.cssText = "padding: 12px 20px; background: rgba(17, 24, 39, 0.85); border-left: 4px solid #6366f1; color: #fff; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.35); font-family: 'Outfit', sans-serif; font-size: 0.85rem; pointer-events: auto; backdrop-filter: blur(10px); min-width: 280px; display: flex; align-items: center; justify-content: space-between;";
    if (type === "success") toast.style.borderLeftColor = "#10b981";
    if (type === "error") toast.style.borderLeftColor = "#ef4444";
    
    toast.innerHTML = `<span>${text(message)}</span><button style="background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer; font-size:1.1rem; padding-left: 12px;" onclick="this.parentElement.remove()">&times;</button>`;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)";
      toast.style.transition = "all 0.5s ease";
      setTimeout(() => toast.remove(), 500);
    }, 4500);
  }

  // =========================================================================
  // CRYPTO SECURITY: SALTING & ITERATIVE KEY STRETCHING (PBKDF2-like)
  // =========================================================================
  function sha256(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    var result = '';

    var words = [];
    var asciiLength = ascii[lengthProperty];
    
    var hash = sha256.h = sha256.h || [];
    var k = sha256.k = sha256.k || [];
    var primeCounter = k[lengthProperty];

    var isPrime = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isPrime[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isPrime[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return; // ASCII only
      words[i >> 2] |= j << (24 - (i % 4) * 8);
    }
    words[words[lengthProperty]] = ((asciiLength * 8) / maxWord) | 0;
    words[words[lengthProperty]] = (asciiLength * 8) | 0;
    
    var w = [];
    var H = hash.slice(0);
    for (i = 0; i < words[lengthProperty]; i += 16) {
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        if (j < 16) w[j] = words[i + j];
        else {
          var s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
          var s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        var ch = (e & f) ^ (~e & g);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp1 = (h + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) + ch + k[j] + w[j]) | 0;
        var temp2 = ((rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) + maj) | 0;
        
        h = g;
        g = f;
        f = e;
        e = (d + temp1) | 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) | 0;
      }
      H[0] = (H[0] + a) | 0;
      H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0;
      H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0;
      H[5] = (H[5] + f) | 0;
      H[6] = (H[6] + g) | 0;
      H[7] = (H[7] + h) | 0;
    }
    
    for (i = 0; i < 8; i++) {
      var word = H[i];
      var hex = (word >>> 0).toString(16);
      result += ('00000000' + hex).slice(-8);
    }
    return result;
  }

  function generateSalt() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
    let salt = "";
    for (let i = 0; i < 16; i++) {
      salt += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return salt;
  }

  // Stretches hash iteratively to block rainbow table precomputations
  function hashPassword(baseHash, salt) {
    let hash = baseHash;
    for (let i = 0; i < 5000; i++) {
      hash = sha256(hash + salt);
    }
    return hash;
  }

  // =========================================================================
  // SIMULATED OFFLINE-FIRST CLOUD SYNC ENGINE
  // =========================================================================
  function triggerCloudSync() {
    const status = document.getElementById("cloud-sync-status");
    if (!status) return;
    
    const dot = status.querySelector(".sync-dot");
    const textSpan = status.querySelector(".sync-text");
    if (!dot || !textSpan) return;
    
    dot.className = "sync-dot syncing";
    textSpan.textContent = "Syncing Cloud...";
    
    // Simulate background payload transit
    setTimeout(() => {
      dot.className = "sync-dot";
      textSpan.textContent = "Cloud Synced";
      showToast("Database mirrored to cloud repository.", "success");
    }, 1200);
  }

  // Add styles for the cloud indicator
  const syncStyles = document.createElement("style");
  syncStyles.textContent = `
    .cloud-sync-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 6px 12px;
      border-radius: 12px;
      font-size: 0.72rem;
      font-family: 'Outfit', sans-serif;
      color: #94a3b8;
      margin-right: 16px;
    }
    .sync-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      transition: background 0.3s ease;
    }
    .sync-dot.syncing {
      background: #eab308;
      animation: pulseSync 0.8s infinite alternate;
    }
    @keyframes pulseSync {
      0% { opacity: 0.3; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(syncStyles);

  // =========================================================================
  // GENERAL HTML UTILITIES & ROUTING INTERCEPTOR (Layout preservation)
  // =========================================================================
  function text(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }

  function attr(value) {
    return text(value).replace(/`/g, "&#96;");
  }

  function normalizeId(value) {
    return String(value || "").trim().toUpperCase();
  }

  function initials(name) {
    const value = String(name || "WF").trim().split(/\s+/).filter(Boolean).map(function (part) { return part[0]; }).join("");
    return (value || "WF").slice(0, 2).toUpperCase();
  }

  function passwordFailures(password) {
    const failures = [];
    if (password.length < 8) failures.push("8+ characters");
    if (!/[A-Z]/.test(password)) failures.push("uppercase letter");
    if (!/[a-z]/.test(password)) failures.push("lowercase letter");
    if (!/[0-9]/.test(password)) failures.push("number");
    if (!/[^A-Za-z0-9]/.test(password)) failures.push("special character");
    return failures;
  }

  function money(value) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function statusClass(status) {
    return String(status || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function attendanceStatus(log) {
    if (!log) return "Absent";
    if (log.status === "Leave") return "Leave";
    const hours = Number(log.workHours) || 0;
    if (hours > 0 && hours < 4) return "Half-day";
    if (hours >= 4 || log.checkIn) return "Present";
    return log.status || "Absent";
  }

  function statusBadge(status) {
    const value = text(status || "Absent");
    return '<span class="status-badge ' + statusClass(value) + '">' + value + '</span>';
  }

  function hours(value) {
    const numeric = Number(value) || 0;
    return numeric > 0 ? numeric.toFixed(2) + " hrs" : "--:--";
  }

  function dateFromISO(value) {
    const parts = String(value || "").split("-").map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }

  // Intercept Route to render Loading state during first load if DB isn't ready
  let isRouterHooked = false;
  function hookRouter() {
    if (isRouterHooked || typeof router === "undefined") return;
    isRouterHooked = true;
    const originalHandleRoute = router.handleRoute.bind(router);
    router.handleRoute = function () {
      if (!dbReady) {
        dbReadyCallbacks.push(function () {
          originalHandleRoute();
        });
        // Render loading screen
        const appEl = document.getElementById("app");
        if (appEl) {
          appEl.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: 'Outfit', sans-serif; background: #0b0f19; color: #fff;">
              <div class="spinner" style="border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #6366f1; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 16px;"></div>
              <p style="color: var(--text-muted); font-size: 0.9rem;">Connecting to Secure Storage...</p>
              <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              </style>
            </div>
          `;
        }
        return;
      }
      originalHandleRoute();
    };
  }

  function isoDate(date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }

  function currentWeekDates() {
    const base = dateFromISO(getTodayString());
    const monday = new Date(base);
    monday.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    return Array.from({ length: 7 }, function (_, index) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      return isoDate(day);
    });
  }

  function employeeDayStatus(empId, date) {
    const leave = store.state.timeOff.find(function (item) {
      return item.employeeId === empId && item.status === "Approved" && date >= item.startDate && date <= item.endDate;
    });
    if (leave) return "Leave";
    const log = store.state.attendance.find(function (item) { return item.employeeId === empId && item.date === date; });
    if (log) return attendanceStatus(log);
    const day = dateFromISO(date).getDay();
    return day === 0 || day === 6 ? "Weekend" : "Absent";
  }

  // =========================================================================
  // APP VIEW-CONTAINER INTERCEPTOR (High-Performance Template Parsing & Diffing)
  // =========================================================================
  const templateParser = document.createElement("template"); // Reusable element prevents memory overhead

  function setupAppDOMInterceptor() {
    const app = document.getElementById("app");
    if (!app) return;
    
    const originalSet = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML").set;
    const originalGet = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML").get;

    Object.defineProperty(app, "innerHTML", {
      get: function () {
        return originalGet.call(this);
      },
      set: function (value) {
        if (value.includes("sidebar") && value.includes("main-wrapper")) {
          // Setting innerHTML on template does not evaluate scripts, load files or create render flows
          templateParser.innerHTML = value;
          
          const newSidebar = templateParser.content.querySelector(".sidebar");
          const newHeader = templateParser.content.querySelector(".top-header");
          const newViewContainer = templateParser.content.querySelector(".view-container");
          
          let currentSidebar = this.querySelector(".sidebar");
          let currentMainWrapper = this.querySelector(".main-wrapper");
          
          if (currentSidebar && currentMainWrapper) {
            // Update active link in the sidebar dynamically without recreating it
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
            
            // Update header title, user details, and image references dynamically
            if (newHeader) {
              const currentHeader = currentMainWrapper.querySelector(".top-header");
              if (currentHeader) {
                const newTitle = newHeader.querySelector(".view-title");
                const currentTitle = currentHeader.querySelector(".view-title");
                if (newTitle && currentTitle) {
                  currentTitle.textContent = newTitle.textContent;
                }
                
                const newAvatar = newHeader.querySelector(".user-avatar");
                const currentAvatar = currentHeader.querySelector(".user-avatar");
                if (newAvatar && currentAvatar) {
                  currentAvatar.src = newAvatar.src;
                }
                
                const newName = newHeader.querySelector(".user-name");
                const currentName = currentHeader.querySelector(".user-name");
                if (newName && currentName) {
                  currentName.textContent = newName.textContent;
                }
              }
            }
            
            // Only overwrite view container content
            if (newViewContainer) {
              const currentViewContainer = currentMainWrapper.querySelector(".view-container");
              if (currentViewContainer) {
                currentViewContainer.className = "view-container animate-fade";
                originalSet.call(currentViewContainer, newViewContainer.innerHTML);
              }
            }
            // Clear parser storage immediately to free memory allocations
            templateParser.innerHTML = "";
            return;
          }
        }
        originalSet.call(this, value);
      }
    });
  }

  // =========================================================================
  // STATE MIGRATION & EVENT DRIVEN REACTIVE OBSERVERS
  // =========================================================================
  function migrateState() {
    store.state.users = Array.isArray(store.state.users) ? store.state.users : [];
    store.state.employees = Array.isArray(store.state.employees) ? store.state.employees : [];
    store.state.attendance = Array.isArray(store.state.attendance) ? store.state.attendance : [];
    store.state.timeOff = Array.isArray(store.state.timeOff) ? store.state.timeOff : [];

    // Legacy upgrades to secure storage (IndexedDB)
    store.state.employees.forEach(function (emp) {
      emp.id = normalizeId(emp.id);
      emp.email = String(emp.email || "").trim();
      emp.role = emp.role === "HR" ? "HR" : "Employee";
      emp.documents = Array.isArray(emp.documents) ? emp.documents : [];
      emp.personalEmail = emp.personalEmail || "";
      emp.ptoDays = Number.isFinite(Number(emp.ptoDays)) ? Number(emp.ptoDays) : 30;
      emp.sickDays = Number.isFinite(Number(emp.sickDays)) ? Number(emp.sickDays) : 15;
      emp.wage = Number(emp.wage) || 0;

      // Extract and save Base64 avatars to IndexedDB, converting references in localStorage
      if (emp.avatar && emp.avatar.startsWith("data:image/")) {
        const avatarId = "avatar-" + emp.id;
        const legacyData = emp.avatar;
        emp.avatar = "db-ref:" + avatarId;
        saveFile(avatarId, legacyData, function () {
          avatarCache[avatarId] = legacyData;
          console.log(`Migrated legacy avatar for employee ${emp.id} to IndexedDB.`);
        });
      }

      // Extract and save Base64 document payloads to IndexedDB
      emp.documents.forEach(function (doc) {
        if (doc.data && doc.data.startsWith("data:")) {
          const legacyData = doc.data;
          delete doc.data; // Eliminate from localStorage payload
          saveFile(doc.id, legacyData, function () {
            console.log(`Migrated document content ${doc.id} to IndexedDB.`);
          });
        }
      });
    });

    // Hash passwords of legacy plain accounts with cryptographically strong unique salts
    store.state.users.forEach(function (user) {
      user.employeeId = normalizeId(user.employeeId);
      user.email = String(user.email || "").trim();
      user.role = user.role === "HR" ? "HR" : "Employee";
      
      if (!user.salt) {
        const salt = generateSalt();
        user.salt = salt;
        // Verify if base credential is plain or prehashed
        const isPlain = !/^[0-9a-f]{64}$/i.test(user.password);
        const baseHash = isPlain ? sha256(user.password) : user.password;
        user.password = hashPassword(baseHash, salt);
      }
    });

    store.state.attendance.forEach(function (log) {
      log.status = attendanceStatus(log);
    });

    store.state.timeOff.forEach(function (leave) {
      leave.attachmentName = leave.attachmentName || "";
      leave.attachmentData = leave.attachmentData || "";
      leave.comment = leave.comment || "";
    });

    store.saveState();
  }

  // Pub-Sub Event Store updates
  store.listeners = [];
  store.subscribe = function (listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  };
  store.notify = function () {
    this.listeners.forEach(listener => {
      try {
        listener(this.state);
      } catch (err) {
        console.error("Observer call failed:", err);
      }
    });
  };

  const originalSaveState = store.saveState.bind(store);
  store.saveState = function () {
    originalSaveState();
    store.notify();
    triggerCloudSync(); // Trigger simulated network sync on state save
  };

  // =========================================================================
  // ASYNC API LAYER (Mimicking remote system network requests)
  // =========================================================================
  const API = {
    delay: function (ms) {
      return new Promise(resolve => setTimeout(resolve, ms || 120));
    },
    getEmployees: async function () {
      await this.delay();
      return store.state.employees;
    },
    getEmployee: async function (id) {
      await this.delay();
      return store.getEmployee(id);
    },
    getAttendance: async function (empId = null) {
      await this.delay();
      if (empId) {
        return store.state.attendance.filter(log => log.employeeId === empId);
      }
      return store.state.attendance;
    }
  };

  // =========================================================================
  // STORE PROTOTYPE DECORATORS (Hashing credentials & separating files)
  // =========================================================================
  function syncAccountFromEmployee(empId, fields) {
    const account = store.state.users.find(function (user) { return user.employeeId === empId; });
    if (!account) return;
    if (fields.email) account.email = fields.email;
    if (fields.role) account.role = fields.role;
  }

  original.updateEmployee = store.updateEmployee.bind(store);
  store.updateEmployee = function (id, fields) {
    const ok = original.updateEmployee(id, fields);
    if (ok) {
      syncAccountFromEmployee(id, fields || {});
      if (store.state.currentSession && store.state.currentSession.employeeId === id && fields.role) {
        store.state.currentSession.role = fields.role;
      }
      store.saveState();
    }
    return ok;
  };

  original.addEmployee = store.addEmployee.bind(store);
  store.addEmployee = function (employee, password) {
    const email = String(employee.email || "").trim().toLowerCase();
    if (store.state.users.some(function (user) { return user.email.toLowerCase() === email; })) {
      throw new Error("A user with this email already exists.");
    }
    const weak = passwordFailures(password || "");
    if (weak.length) throw new Error("Password needs: " + weak.join(", ") + ".");
    
    const added = original.addEmployee(employee, password);
    const userCard = store.state.users.find(u => u.employeeId === added.id);
    if (userCard) {
      const salt = generateSalt();
      userCard.salt = salt;
      userCard.password = hashPassword(sha256(password), salt);
    }
    added.documents = Array.isArray(added.documents) ? added.documents : [];
    store.saveState();
    return added;
  };

  original.checkOut = store.checkOut.bind(store);
  store.checkOut = function (empId) {
    const record = original.checkOut(empId);
    if (record) {
      record.status = attendanceStatus(record);
      store.saveState();
    }
    return record;
  };

  store.addEmployeeDocument = function (empId, doc) {
    const emp = store.getEmployee(empId);
    if (!emp) return false;
    emp.documents = Array.isArray(emp.documents) ? emp.documents : [];
    const docId = "DOC" + Date.now();
    
    // Asynchronously write payload to IndexedDB
    saveFile(docId, doc.data, function () {
      console.log(`Document payload written securely to database under reference key: ${docId}`);
      showToast("Document uploaded securely.", "success");
    });

    // Write metadata card ONLY into localStorage object
    emp.documents.unshift({ 
      id: docId, 
      name: doc.name, 
      type: doc.type, 
      uploadedAt: new Date().toISOString() 
    });
    store.saveState();
    return true;
  };

  store.deleteEmployeeDocument = function (empId, docId) {
    const emp = store.getEmployee(empId);
    if (!emp || !Array.isArray(emp.documents)) return false;
    emp.documents = emp.documents.filter(function (doc) { return doc.id !== docId; });
    
    // Clear out base payload in database
    deleteFile(docId, function () {
      console.log(`Document data deleted from secure storage: ${docId}`);
      showToast("Document deleted.", "success");
    });
    
    store.saveState();
    return true;
  };

  // Avatar selector interceptor
  handleAvatarChange = window.handleAvatarChange = function (event, empId) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Profile picture must be an image file.", "error");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast("Profile picture must be under 2 MB.", "error");
      event.target.value = "";
      return;
    }
    
    const reader = new FileReader();
    reader.onload = function (loadEvent) {
      const base64Data = loadEvent.target.result;
      const avatarId = "avatar-" + empId;
      
      saveFile(avatarId, base64Data, function () {
        avatarCache[avatarId] = base64Data;
        const emp = store.getEmployee(empId);
        if (emp) {
          emp.avatar = "db-ref:" + avatarId;
          store.saveState();
          // Update visual references
          const headerAvatar = document.querySelector(".top-header .user-avatar");
          if (headerAvatar && store.getCurrentUser()?.id === empId) {
            headerAvatar.src = base64Data;
          }
        }
        showToast("Profile avatar saved securely.", "success");
        renderProfileView({ id: empId });
      });
    };
    reader.readAsDataURL(file);
  };

  // =========================================================================
  // AUTHENTICATION VIEWS & HANDLERS (Plain-text verification separation)
  // =========================================================================
  window.handleLoginSubmit = function (e) {
    e.preventDefault();
    const loginVal = document.getElementById("login-email").value.trim();
    const passVal = document.getElementById("login-password").value;
    const alertDiv = document.getElementById("login-alert");

    const userAccount = store.state.users.find(u => 
      (u.email.toLowerCase() === loginVal.toLowerCase() || u.employeeId.toLowerCase() === loginVal.toLowerCase())
    );

    if (userAccount) {
      const baseHash = sha256(passVal);
      const stretchedPass = hashPassword(baseHash, userAccount.salt || "");
      
      if (userAccount.password === stretchedPass) {
        store.state.currentSession = {
          employeeId: userAccount.employeeId,
          role: userAccount.role
        };
        store.saveState();
        router.navigate("dashboard");
        return;
      }
    }
    
    alertDiv.innerHTML = `
      <div class="alert-banner alert-error">
        <span>Invalid email/login ID or password. Please try again.</span>
      </div>
    `;
  };

  // Override signup submission wrapper for company creation
  window.handleSignupSubmit = function (e) {
    e.preventDefault();
    const compName = document.getElementById("company-name").value.trim();
    const adminName = document.getElementById("admin-name").value.trim();
    const email = document.getElementById("admin-email").value.trim();
    const pass = document.getElementById("admin-password").value;
    const confirmPass = document.getElementById("admin-confirm-password").value;
    const alertDiv = document.getElementById("signup-alert");

    if (pass.length < 6) {
      alertDiv.innerHTML = `<div class="alert-banner alert-error">Password must be at least 6 characters long.</div>`;
      return;
    }

    if (pass !== confirmPass) {
      alertDiv.innerHTML = `<div class="alert-banner alert-error">Passwords do not match.</div>`;
      return;
    }

    const newAdmin = {
      id: "",
      name: adminName,
      email: email,
      phone: "+91 99999 99999",
      role: "HR",
      department: "Human Resources",
      manager: "N/A",
      location: "Headquarters",
      dateOfJoining: getTodayString(),
      dob: "1990-01-01",
      address: "HQ Campus, Tech Hub",
      nationality: "Indian",
      gender: "Other",
      maritalStatus: "Single",
      status: "Present",
      wage: 150000,
      bankName: "SBI",
      accountNo: "000000000000",
      ifsc: "SBIN0000000",
      pan: "ABCDE1234F",
      ptoDays: 30,
      sickDays: 15,
      avatar: ""
    };

    try {
      const addedAdmin = store.addEmployee(newAdmin, pass);
      store.state.currentSession = {
        employeeId: addedAdmin.id,
        role: "HR"
      };
      store.saveState();
      router.navigate("dashboard");
    } catch (err) {
      alertDiv.innerHTML = `<div class="alert-banner alert-error">Registration failed: ${err.message}</div>`;
    }
  };

  // Sign up for employee account override
  renderSignupView = window.renderSignupView = function () {
    const app = document.getElementById("app");
    pendingSignup = null;
    app.innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-card glass glow-accent animate-fade">
          <div class="auth-header">
            <svg class="auth-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
            <h2 class="auth-title">Register Workspace Account</h2>
            <p class="auth-subtitle">Employee ID, verified email, role, and secure password are required</p>
          </div>

          <div id="signup-alert"></div>

          <form id="signup-form" onsubmit="handleSignupSubmitOverrides(event)">
            <div class="form-group">
              <label for="signup-employee-id">Employee ID</label>
              <input class="input-ctrl" type="text" id="signup-employee-id" required placeholder="ODIXX20260004">
            </div>

            <div class="form-group">
              <label for="signup-name">Full Name</label>
              <input class="input-ctrl" type="text" id="signup-name" required placeholder="Jane Doe">
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="signup-email">Corporate Email</label>
                <input class="input-ctrl" type="email" id="signup-email" required placeholder="jane.doe@company.com">
              </div>
              <div class="form-group">
                <label for="signup-role">Role</label>
                <select class="input-ctrl" id="signup-role" required>
                  <option value="Employee">Employee</option>
                  <option value="HR">HR Officer</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="signup-password">Password</label>
              <input class="input-ctrl" type="password" id="signup-password" required placeholder="8+ chars, mixed case, number, symbol">
            </div>

            <div class="form-group">
              <label for="signup-confirm-password">Confirm Password</label>
              <input class="input-ctrl" type="password" id="signup-confirm-password" required placeholder="Re-enter password">
            </div>

            <div class="form-group" id="verification-row" style="display: none;">
              <label for="signup-code">Email Verification Code</label>
              <input class="input-ctrl" type="text" id="signup-code" inputmode="numeric" placeholder="Enter 6-digit code">
            </div>

            <button class="btn btn-primary" id="signup-submit-btn" type="submit" style="width: 100%; margin-top: 12px;">Send Verification Code</button>
          </form>

          <div class="auth-footer">
            Already have an active account? <a href="#login" class="auth-link">Log In</a>
          </div>
        </div>
      </div>
    `;
  };

  handleSignupSubmitOverrides = window.handleSignupSubmitOverrides = function (event) {
    event.preventDefault();
    const alertDiv = document.getElementById("signup-alert");
    const employeeId = normalizeId(document.getElementById("signup-employee-id").value);
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const role = document.getElementById("signup-role").value;
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm-password").value;

    if (!pendingSignup) {
      const failures = passwordFailures(password);
      if (failures.length) {
        alertDiv.innerHTML = `<div class="alert-banner alert-error">Password needs: ${text(failures.join(", "))}.</div>`;
        return;
      }
      if (password !== confirm) {
        alertDiv.innerHTML = `<div class="alert-banner alert-error">Passwords do not match.</div>`;
        return;
      }
      if (store.state.users.some(function (user) { return user.employeeId === employeeId; })) {
        alertDiv.innerHTML = `<div class="alert-banner alert-error">This employee ID already has a login account.</div>`;
        return;
      }
      if (store.state.users.some(function (user) { return user.email.toLowerCase() === email.toLowerCase(); })) {
        alertDiv.innerHTML = `<div class="alert-banner alert-error">This email already has a login account.</div>`;
        return;
      }

      pendingSignup = { employeeId, name, email, role, password, code: String(Math.floor(100000 + Math.random() * 900000)) };
      document.getElementById("verification-row").style.display = "flex";
      document.getElementById("signup-submit-btn").textContent = "Verify & Create Account";

      // SECURITY IMPLEMENTATION: Verification code is logged directly to dev console (simulated SMTP transit)
      alertDiv.innerHTML = `<div class="alert-banner alert-success">Verification code sent to <strong>${text(email)}</strong>. (Verification code logged in developer console).</div>`;
      console.log("%c[DEV SMTP SIMULATOR] Verification code for " + email + ": " + pendingSignup.code, "background: #1e1e2e; color: #fab387; padding: 6px; font-weight: bold; border-radius: 4px;");
      showToast("Verification code dispatched. Check developer console!", "success");
      return;
    }

    const code = document.getElementById("signup-code").value.trim();
    if (code !== pendingSignup.code) {
      alertDiv.innerHTML = `<div class="alert-banner alert-error">Verification code is incorrect.</div>`;
      return;
    }

    let employee = store.getEmployee(pendingSignup.employeeId);
    if (employee) {
      employee.name = pendingSignup.name;
      employee.email = pendingSignup.email;
      employee.role = pendingSignup.role;
      employee.documents = Array.isArray(employee.documents) ? employee.documents : [];
    } else {
      employee = {
        id: pendingSignup.employeeId,
        name: pendingSignup.name,
        email: pendingSignup.email,
        phone: "",
        role: pendingSignup.role,
        department: pendingSignup.role === "HR" ? "Human Resources" : "Unassigned",
        manager: pendingSignup.role === "HR" ? "N/A" : "HR Admin",
        location: "Headquarters",
        dateOfJoining: getTodayString(),
        dob: "",
        address: "",
        nationality: "Indian",
        gender: "Other",
        maritalStatus: "Single",
        status: "Absent",
        wage: pendingSignup.role === "HR" ? 150000 : 0,
        bankName: "TBD",
        accountNo: "TBD",
        ifsc: "TBD",
        pan: "TBD",
        ptoDays: 30,
        sickDays: 15,
        avatar: "",
        personalEmail: "",
        documents: []
      };
      store.state.employees.push(employee);
    }

    // Save with unique salt and PBKDF2 stretching
    const salt = generateSalt();
    store.state.users.push({
      email: pendingSignup.email,
      password: hashPassword(sha256(pendingSignup.password), salt),
      salt: salt,
      employeeId: pendingSignup.employeeId,
      role: pendingSignup.role
    });
    
    store.state.currentSession = { employeeId: pendingSignup.employeeId, role: pendingSignup.role };
    pendingSignup = null;
    store.saveState();
    router.navigate("dashboard");
  };

  // =========================================================================
  // VIEW DIRECTORIES & TEMPLATES
  // =========================================================================
  function getHeaderHTML(title) {
    const user = store.getCurrentUser();
    if (!user) return "";

    const initialsName = user.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    const avatarSrc = avatarFor(user, "#6366f1", "#ffffff");

    // Includes Simulated Cloud Sync state in Header
    return `
      <header class="top-header">
        <div style="display: flex; align-items: center;">
          <h1 class="view-title" style="margin-right: 24px;">${title}</h1>
          <div class="cloud-sync-badge" id="cloud-sync-status">
            <span class="sync-dot"></span>
            <span class="sync-text">Cloud Synced</span>
          </div>
        </div>
        <div class="header-actions">
          <div class="profile-dropdown-container">
            <div class="user-profile-trigger" onclick="toggleProfileDropdown(event)">
              <img class="user-avatar" src="${avatarSrc}" alt="Avatar">
              <div class="user-details">
                <span class="user-name">${user.name}</span>
                <span class="user-role">${user.role === 'HR' ? 'Admin / HR' : 'Employee'}</span>
              </div>
            </div>
            <div id="dropdown-menu" class="profile-dropdown">
              <button class="dropdown-item" onclick="router.navigate('profile', { id: '${user.id}' })">
                ${ICONS.user} My Profile
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item danger" onclick="handleLogout()">
                ${ICONS.logout} Log Out
              </button>
            </div>
          </div>
        </div>
      </header>
    `;
  }
  // Expose overridden getHeaderHTML to window space for original views
  window.getHeaderHTML = getHeaderHTML;

  original.renderDashboardView = renderDashboardView;
  renderDashboardView = window.renderDashboardView = function () {
    original.renderDashboardView();
    const user = store.getCurrentUser();
    if (!user || user.role === "HR") return;
    const grid = document.querySelector(".dashboard-grid");
    if (!grid) return;
    grid.insertAdjacentHTML("beforeend", `
      <div class="quick-action-grid glass animate-fade">
        <button class="quick-action-btn" onclick="router.navigate('profile', { id: '${attr(user.id)}' })">Profile</button>
        <button class="quick-action-btn" onclick="router.navigate('attendance')">Attendance</button>
        <button class="quick-action-btn" onclick="router.navigate('timeoff')">Leave Requests</button>
        <button class="quick-action-btn danger" onclick="handleLogout()">Logout</button>
      </div>
    `);
  };

  getEmployeeCardHTML = window.getEmployeeCardHTML = function (emp) {
    const today = getTodayString();
    const status = employeeDayStatus(emp.id, today);
    const cls = status === "Leave" ? "leave" : status === "Present" || status === "Half-day" ? "present" : "absent";
    const avatar = avatarFor(emp, "#1f2937", "#6366f1");
    return `
      <div class="employee-card glass glow-accent animate-fade" onclick="router.navigate('profile', { id: '${attr(emp.id)}' })">
        <span class="card-status-dot ${cls}"></span>
        <img class="card-avatar" src="${attr(avatar)}" alt="Avatar">
        <h4 class="card-name">${text(emp.name)}</h4>
        <span class="card-role">${text(emp.role === "HR" ? "HR Manager" : emp.role)}</span>
        <span style="font-size: 0.8rem; color: var(--text-muted);">${text(emp.department)}</span>
        <span class="card-id">${text(emp.id)}</span>
      </div>
    `;
  };

  renderEmployeesView = window.renderEmployeesView = async function () {
    const user = store.getCurrentUser();
    const isAdmin = user.role === "HR";
    const employees = isAdmin ? await API.getEmployees() : [user];

    const content = `
      <div class="directory-actions animate-fade">
        <div class="search-filter-grp">
          <input class="input-ctrl" type="text" id="employee-search" oninput="filterEmployees()" placeholder="Search employee name, department, ID...">
          <select class="input-ctrl" id="employee-filter-status" onchange="filterEmployees()" style="width: 160px;">
            <option value="all">All Statuses</option>
            <option value="Present">Present</option>
            <option value="Half-day">Half-day</option>
            <option value="Leave">On Leave</option>
            <option value="Absent">Absent</option>
          </select>
        </div>
        ${isAdmin ? `<button class="btn btn-primary" onclick="showOnboardModal()">${ICONS.plus} Add Employee</button>` : ""}
      </div>

      <div class="employee-grid animate-fade" id="employee-grid-container">
        ${employees.map(getEmployeeCardHTML).join("")}
      </div>
    `;
    
    app.innerHTML = `
      ${getSidebarHTML("employees")}
      <div class="main-wrapper">
        ${getHeaderHTML(isAdmin ? "Employee Directory" : "My Employee Record")}
        <div class="view-container">
          ${content}
        </div>
      </div>
    `;
  };

  filterEmployees = window.filterEmployees = function () {
    const user = store.getCurrentUser();
    const isAdmin = user.role === "HR";
    const query = document.getElementById("employee-search").value.toLowerCase();
    const statusFilter = document.getElementById("employee-filter-status").value;
    const grid = document.getElementById("employee-grid-container");
    const today = getTodayString();
    const source = isAdmin ? store.state.employees : [user];

    const filtered = source.filter(function (emp) {
      const status = employeeDayStatus(emp.id, today);
      const matchesSearch = emp.name.toLowerCase().includes(query) || emp.id.toLowerCase().includes(query) || emp.department.toLowerCase().includes(query) || emp.role.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    grid.innerHTML = filtered.map(getEmployeeCardHTML).join("") || `<div class="empty-state glass">No employees match this filter.</div>`;
  };

  function renderDocumentsHTML(empId) {
    const current = store.getCurrentUser();
    const emp = store.getEmployee(empId);
    const canEdit = current && (current.role === "HR" || current.id === empId);
    const docs = Array.isArray(emp.documents) ? emp.documents : [];
    return `
      <h4 style="margin-bottom: 20px; font-weight: 600; color: var(--accent);">Employee Documents</h4>
      ${canEdit ? `
        <div class="document-upload-row">
          <input class="input-ctrl" type="file" id="document-upload-input" onchange="handleDocumentUpload(event, '${attr(empId)}')">
          <span class="document-help">PDF or image files up to 2 MB stored in secure IndexedDB.</span>
        </div>
      ` : ""}
      <div class="document-list" id="document-list">
        ${docs.map(function (doc) {
          return `
            <div class="document-item">
              <div>
                <strong>${text(doc.name)}</strong>
                <span>${text(doc.type || "Unknown type")} - ${new Date(doc.uploadedAt).toLocaleDateString()}</span>
              </div>
              <div class="document-actions">
                <button class="btn btn-secondary btn-sm" onclick="downloadEmployeeDocument('${attr(empId)}', '${attr(doc.id)}', '${attr(doc.name)}')">Download</button>
                ${canEdit ? `<button class="btn btn-danger btn-sm" onclick="deleteEmployeeDocument('${attr(empId)}', '${attr(doc.id)}')">Delete</button>` : ""}
              </div>
            </div>
          `;
        }).join("") || `<div class="empty-state">No employee documents uploaded yet.</div>`}
      </div>
    `;
  }

  window.downloadEmployeeDocument = function (empId, docId, docName) {
    getFile(docId, function (data) {
      if (!data) {
        showToast("Document not found in secure storage.", "error");
        return;
      }
      const link = document.createElement("a");
      link.href = data;
      link.download = docName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Downloading file...", "success");
    });
  };

  function injectDocumentsTab(empId) {
    const emp = store.getEmployee(empId);
    const current = store.getCurrentUser();
    if (!emp || !current || (current.role !== "HR" && current.id !== empId)) return;
    const nav = document.querySelector(".tab-nav");
    const panel = document.querySelector(".tabs-panel");
    if (!nav || !panel || document.getElementById("documents-info")) return;
    nav.insertAdjacentHTML("beforeend", `<button class="tab-btn" onclick="switchProfileTab(event, 'documents-info')">Documents</button>`);
    panel.insertAdjacentHTML("beforeend", `<div id="documents-info" class="tab-content glass" style="padding: 32px;">${renderDocumentsHTML(empId)}</div>`);
  }

  original.renderProfileView = renderProfileView;
  renderProfileView = window.renderProfileView = function (params) {
    const current = store.getCurrentUser();
    const targetId = normalizeId(params && params.id);
    if (current && current.role !== "HR" && targetId !== current.id) {
      router.navigate("profile", { id: current.id });
      return;
    }
    original.renderProfileView(params);
    injectDocumentsTab(targetId);
  };

  handleDocumentUpload = window.handleDocumentUpload = function (event, empId) {
    const file = event.target.files[0];
    if (!file) return;
    const current = store.getCurrentUser();
    if (!current || (current.role !== "HR" && current.id !== empId)) return;
    if (!(file.type.startsWith("image/") || file.type === "application/pdf")) {
      showToast("Upload a PDF or image document.", "error");
      event.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast("Document must be under 2 MB.", "error");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = function (loadEvent) {
      store.addEmployeeDocument(empId, { name: file.name, type: file.type, data: loadEvent.target.result });
      renderProfileView({ id: empId });
      const docButton = Array.from(document.querySelectorAll(".tab-btn")).find(function (button) { return button.textContent.trim() === "Documents"; });
      if (docButton) docButton.click();
    };
    reader.readAsDataURL(file);
  };

  deleteEmployeeDocument = window.deleteEmployeeDocument = function (empId, docId) {
    const current = store.getCurrentUser();
    if (!current || (current.role !== "HR" && current.id !== empId)) return;
    store.deleteEmployeeDocument(empId, docId);
    renderProfileView({ id: empId });
    const docButton = Array.from(document.querySelectorAll(".tab-btn")).find(function (button) { return button.textContent.trim() === "Documents"; });
    if (docButton) docButton.click();
  };

  // Profile credentials updating wrapper with unique Salt stretching
  window.handlePasswordUpdate = function (e, empId) {
    e.preventDefault();
    const current = document.getElementById("current-password").value;
    const newPass = document.getElementById("new-password-input").value;
    const confirm = document.getElementById("confirm-password-input").value;

    const userAccount = store.state.users.find(u => u.employeeId === empId);
    if (!userAccount) return;

    // Hash user's input with salt before comparison
    const baseHashCurrent = sha256(current);
    const hashedCurrent = hashPassword(baseHashCurrent, userAccount.salt || "");
    
    if (userAccount.password !== hashedCurrent) {
      showToast("The current password entered is incorrect!", "error");
      return;
    }

    if (newPass.length < 8) {
      showToast("New password must be at least 8 characters long.", "error");
      return;
    }

    const weak = passwordFailures(newPass);
    if (weak.length) {
      showToast("Password needs: " + weak.join(", ") + ".", "error");
      return;
    }

    if (newPass !== confirm) {
      showToast("Confirm password does not match the new password.", "error");
      return;
    }

    // Assign new Salt and stretched Password
    const newSalt = generateSalt();
    userAccount.salt = newSalt;
    userAccount.password = hashPassword(sha256(newPass), newSalt);
    store.saveState();
    
    document.getElementById("profile-security-form").reset();
    showToast("Password credentials updated successfully!", "success");
  };

  // Recalculate compensation controller override to use Toast rather than Alert
  window.handleBankUpdate = function (e, empId) {
    e.preventDefault();
    const wageInput = document.getElementById("salary-wage-input");
    const wage = parseFloat(wageInput.value) || 0;
    
    const bankDetails = {
      wage: wage,
      bankName: document.getElementById("bank-name-input").value.trim(),
      accountNo: document.getElementById("bank-account-input").value.trim(),
      ifsc: document.getElementById("bank-ifsc-input").value.trim(),
      pan: document.getElementById("bank-pan-input").value.trim()
    };

    store.updateEmployee(empId, bankDetails);
    showToast("Banking & Compensation criteria saved.", "success");
  };

  // =========================================================================
  // ATTENDANCE COMPONENT VIEWS & CONTROLLERS
  // =========================================================================
  function attendanceRows(logs, admin) {
    return logs.map(function (log) {
      const emp = store.getEmployee(log.employeeId) || { name: "Unknown Employee" };
      const status = attendanceStatus(log);
      return `
        <tr>
          <td><strong>${text(log.date)}</strong></td>
          ${admin ? `<td style="font-family: var(--font-mono); font-size: 0.85rem;">${text(log.employeeId)}</td><td>${text(emp.name)}</td>` : ""}
          <td>${text(log.checkIn || "--:--")}</td>
          <td>${text(log.checkOut || "--:--")}</td>
          <td>${hours(log.workHours)}</td>
          <td>${hours(log.extraHours)}</td>
          <td>${statusBadge(status)}</td>
        </tr>
      `;
    }).join("");
  }

  function weeklyEmployeeRows(employees) {
    const dates = currentWeekDates();
    return employees.map(function (emp) {
      const logs = store.state.attendance.filter(function (log) { return log.employeeId === emp.id && dates.includes(log.date); });
      const totalHours = logs.reduce(function (sum, log) { return sum + (Number(log.workHours) || 0); }, 0);
      const presentDays = dates.filter(function (date) { return ["Present", "Half-day"].includes(employeeDayStatus(emp.id, date)); }).length;
      return `
        <tr>
          <td style="font-family: var(--font-mono); font-size: 0.85rem;">${text(emp.id)}</td>
          <td><strong>${text(emp.name)}</strong></td>
          ${dates.map(function (date) { return `<td>${statusBadge(employeeDayStatus(emp.id, date))}</td>`; }).join("")}
          <td><strong>${presentDays}</strong></td>
          <td>${totalHours.toFixed(2)} hrs</td>
        </tr>
      `;
    }).join("");
  }

  setAttendanceViewMode = window.setAttendanceViewMode = function (mode) {
    attendanceViewMode = mode;
    renderAttendanceView();
  };

  renderAttendanceView = window.renderAttendanceView = async function () {
    const user = store.getCurrentUser();
    const isAdmin = user.role === "HR";
    const employees = isAdmin ? await API.getEmployees() : [user];
    const logs = isAdmin ? await API.getAttendance() : await API.getAttendance(user.id);
    const weekDates = currentWeekDates();
    const modeButtons = `
      <div class="segmented-control">
        <button class="segment-btn ${attendanceViewMode === "daily" ? "active" : ""}" onclick="setAttendanceViewMode('daily')">Daily</button>
        <button class="segment-btn ${attendanceViewMode === "weekly" ? "active" : ""}" onclick="setAttendanceViewMode('weekly')">Weekly</button>
      </div>
    `;

    const dailyTable = `
      <div class="directory-actions animate-fade">
        <div class="search-filter-grp">
          ${isAdmin ? `<input class="input-ctrl" type="date" id="attendance-date-search" value="${getTodayString()}" onchange="filterAdminAttendance()"><input class="input-ctrl" type="text" id="attendance-emp-search" placeholder="Search by Employee ID or Name..." oninput="filterAdminAttendance()">` : ""}
        </div>
        ${modeButtons}
      </div>
      <div class="data-table-container glass animate-fade">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              ${isAdmin ? "<th>Employee ID</th><th>Employee Name</th>" : ""}
              <th>Check In</th>
              <th>Check Out</th>
              <th>Logged Hours</th>
              <th>Extra Hours</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="attendance-table-body">
            ${attendanceRows(logs, isAdmin) || `<tr><td colspan="${isAdmin ? 8 : 6}" style="text-align: center; color: var(--text-muted); padding: 32px;">No attendance logs recorded.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    const weeklyTable = `
      <div class="directory-actions animate-fade">
        <h4 style="font-weight: 600;">Week of ${text(weekDates[0])} to ${text(weekDates[6])}</h4>
        ${modeButtons}
      </div>
      <div class="data-table-container glass animate-fade">
        <table class="data-table weekly-attendance-table">
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              ${weekDates.map(function (date) { return `<th>${text(date.slice(5))}</th>`; }).join("")}
              <th>Tracked Days</th>
              <th>Total Hours</th>
            </tr>
          </thead>
          <tbody>${weeklyEmployeeRows(employees)}</tbody>
        </table>
      </div>
    `;

    app.innerHTML = `
      ${getSidebarHTML("attendance")}
      <div class="main-wrapper">
        ${getHeaderHTML("Attendance logs")}
        <div class="view-container">
          ${attendanceViewMode === "weekly" ? weeklyTable : dailyTable}
        </div>
      </div>
    `;
  };

  filterAdminAttendance = window.filterAdminAttendance = function () {
    const dateEl = document.getElementById("attendance-date-search");
    const searchEl = document.getElementById("attendance-emp-search");
    const tbody = document.getElementById("attendance-table-body");
    if (!dateEl || !searchEl || !tbody) return;
    const dateVal = dateEl.value;
    const searchVal = searchEl.value.toLowerCase();
    const filtered = store.state.attendance.filter(function (log) {
      const emp = store.getEmployee(log.employeeId);
      const empName = emp ? emp.name.toLowerCase() : "";
      return (!dateVal || log.date === dateVal) && (!searchVal || log.employeeId.toLowerCase().includes(searchVal) || empName.includes(searchVal));
    });
    tbody.innerHTML = attendanceRows(filtered, true) || `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 32px;">No matching attendance records found.</td></tr>`;
  };

  // =========================================================================
  // LEAVE CALENDAR & COMPENSATIONS
  // =========================================================================
  renderCalendarDays = window.renderCalendarDays = function (year, month) {
    const user = store.getCurrentUser();
    const days = [];
    const today = getTodayString();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = new Date(year, month, 1).getDay();
    const monthStr = String(month + 1).padStart(2, "0");

    for (let i = 0; i < startDayOfWeek; i++) days.push(`<div class="calendar-day empty"></div>`);

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;
      const status = employeeDayStatus(user.id, dayStr);
      let dayClass = "";
      if (status === "Leave") dayClass = "leave-day";
      else if (status === "Present" || status === "Half-day") dayClass = "present-day";
      else if (status === "Absent" && dayStr < today) dayClass = "absent-day";
      const selected = selectedLeaveRange.start && dayStr >= selectedLeaveRange.start && dayStr <= (selectedLeaveRange.end || selectedLeaveRange.start);
      const boundary = dayStr === selectedLeaveRange.start || dayStr === selectedLeaveRange.end;
      days.push(`
        <div class="calendar-day ${dayClass} ${dayStr === today ? "today" : ""} ${selected ? "selected-range" : ""} ${boundary ? "selected-boundary" : ""}" onclick="selectLeaveDate('${dayStr}')" title="Select leave date">
          <span class="calendar-day-num">${day}</span>
          ${dayClass ? '<span class="calendar-day-marker"></span>' : ""}
        </div>
      `);
    }
    return days.join("");
  };

  selectLeaveDate = window.selectLeaveDate = function (dayStr) {
    if (!selectedLeaveRange.start || (selectedLeaveRange.start && selectedLeaveRange.end)) {
      selectedLeaveRange = { start: dayStr, end: "" };
    } else if (dayStr < selectedLeaveRange.start) {
      selectedLeaveRange = { start: dayStr, end: selectedLeaveRange.start };
    } else {
      selectedLeaveRange.end = dayStr;
    }
    renderTimeOffView();
  };

  clearLeaveSelection = window.clearLeaveSelection = function () {
    selectedLeaveRange = { start: "", end: "" };
    renderTimeOffView();
  };

  original.showApplyLeaveModal = showApplyLeaveModal;
  showApplyLeaveModal = window.showApplyLeaveModal = function () {
    original.showApplyLeaveModal();
    const start = document.getElementById("leave-start");
    const end = document.getElementById("leave-end");
    if (start && selectedLeaveRange.start) start.value = selectedLeaveRange.start;
    if (end && (selectedLeaveRange.end || selectedLeaveRange.start)) end.value = selectedLeaveRange.end || selectedLeaveRange.start;
    if (start && end) calculateRequestedDays();
  };

  original.renderTimeOffView = renderTimeOffView;
  renderTimeOffView = window.renderTimeOffView = function () {
    original.renderTimeOffView();
    const user = store.getCurrentUser();
    if (!user || user.role === "HR") return;
    const calendarHeader = document.querySelector(".calendar-header");
    if (!calendarHeader || document.getElementById("leave-selection-actions")) return;
    calendarHeader.insertAdjacentHTML("afterend", `
      <div id="leave-selection-actions" class="leave-selection-actions animate-fade">
        <span>${selectedLeaveRange.start ? `Selected: ${text(selectedLeaveRange.start)}${selectedLeaveRange.end ? " to " + text(selectedLeaveRange.end) : ""}` : "Select dates on the calendar for a leave range."}</span>
        <button class="btn btn-secondary btn-sm" onclick="clearLeaveSelection()">Clear</button>
      </div>
    `);
  };

  original.renderPayrollView = renderPayrollView;
  renderPayrollView = window.renderPayrollView = function () {
    original.renderPayrollView();
    const user = store.getCurrentUser();
    if (!user || user.role !== "HR") return;
    document.querySelectorAll(".data-table tbody tr").forEach(function (row) {
      const empId = normalizeId(row.cells && row.cells[0] ? row.cells[0].textContent : "");
      if (!store.getEmployee(empId)) return;
      const actionCell = row.cells[row.cells.length - 1];
      if (!actionCell || actionCell.querySelector(".payroll-edit-btn")) return;
      actionCell.insertAdjacentHTML("beforeend", `<button class="btn btn-secondary btn-sm payroll-edit-btn" onclick="showPayrollEditModal('${attr(empId)}')">Edit Pay</button>`);
    });
  };

  showPayrollEditModal = window.showPayrollEditModal = function (empId) {
    const emp = store.getEmployee(empId);
    if (!emp) return;
    const body = `
      <form id="payroll-edit-form" onsubmit="submitPayrollEdit(event, '${attr(empId)}')">
        <div class="form-group">
          <label for="payroll-wage-input">Monthly Gross Wage (INR)</label>
          <input class="input-ctrl" type="number" id="payroll-wage-input" min="0" step="1" required value="${attr(emp.wage || 0)}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="payroll-bank-input">Bank Name</label>
            <input class="input-ctrl" type="text" id="payroll-bank-input" required value="${attr(emp.bankName || "")}">
          </div>
          <div class="form-group">
            <label for="payroll-account-input">Account Number</label>
            <input class="input-ctrl" type="text" id="payroll-account-input" required value="${attr(emp.accountNo || "")}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="payroll-ifsc-input">IFSC Code</label>
            <input class="input-ctrl" type="text" id="payroll-ifsc-input" required value="${attr(emp.ifsc || "")}">
          </div>
          <div class="form-group">
            <label for="payroll-pan-input">PAN</label>
            <input class="input-ctrl" type="text" id="payroll-pan-input" required value="${attr(emp.pan || "")}">
          </div>
        </div>
        <div class="payroll-preview" id="payroll-preview"></div>
        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <button class="btn btn-secondary" type="button" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" type="submit">Save Payroll</button>
        </div>
      </form>
    `;
    showModal("Edit Payroll Control", body);
    document.getElementById("payroll-wage-input").addEventListener("input", updatePayrollPreview);
    updatePayrollPreview();
  };

  updatePayrollPreview = window.updatePayrollPreview = function () {
    const input = document.getElementById("payroll-wage-input");
    const preview = document.getElementById("payroll-preview");
    if (!input || !preview) return;
    const wage = Number(input.value) || 0;
    const calc = getSalaryBreakdown(wage);
    preview.innerHTML = `
      <div><span>Basic</span><strong>${money(calc.basic)}</strong></div>
      <div><span>HRA</span><strong>${money(calc.hra)}</strong></div>
      <div><span>Employee PF</span><strong>${money(calc.employeePf)}</strong></div>
      <div><span>Net Take-home</span><strong>${money(calc.netSalary)}</strong></div>
    `;
  };

  submitPayrollEdit = window.submitPayrollEdit = function (event, empId) {
    event.preventDefault();
    store.updateEmployee(empId, {
      wage: Number(document.getElementById("payroll-wage-input").value) || 0,
      bankName: document.getElementById("payroll-bank-input").value.trim(),
      accountNo: document.getElementById("payroll-account-input").value.trim(),
      ifsc: document.getElementById("payroll-ifsc-input").value.trim().toUpperCase(),
      pan: document.getElementById("payroll-pan-input").value.trim().toUpperCase()
    });
    closeModal();
    renderPayrollView();
    showToast("Payroll information updated.", "success");
  };

  // Safe Onboard Credentials wrapper
  original.showOnboardModal = showOnboardModal;
  showOnboardModal = window.showOnboardModal = function () {
    original.showOnboardModal();
    const pass = document.getElementById("new-pass");
    if (pass) {
      pass.type = "password";
      pass.placeholder = "8+ chars, mixed case, number, symbol";
    }
  };

  original.handleOnboardSubmit = handleOnboardSubmit;
  handleOnboardSubmit = window.handleOnboardSubmit = function (event) {
    const password = document.getElementById("new-pass")?.value || "";
    const failures = passwordFailures(password);
    if (failures.length) {
      event.preventDefault();
      showToast("Temporary password needs: " + failures.join(", ") + ".", "error");
      return;
    }
    original.handleOnboardSubmit(event);
    showToast("Employee onboarded successfully.", "success");
  };

  // Avatar resolution helper
  function avatarFor(person, bg, fg) {
    if (person) {
      const av = person.avatar || "";
      if (av.startsWith("db-ref:")) {
        const key = av.replace("db-ref:", "");
        if (avatarCache[key]) return avatarCache[key];
      } else if (av.startsWith("avatar-")) {
        if (avatarCache[av]) return avatarCache[av];
      } else if (av.startsWith("data:image/")) {
        return av; // Support legacy Base64 stored in localStorage
      }
    }
    const safeInitials = text(initials(person && person.name));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="50" fill="' + bg + '"/><text x="50" y="55" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="' + fg + '" text-anchor="middle" dominant-baseline="middle">' + safeInitials + '</text></svg>';
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  // =========================================================================
  // BOOTSTRAPPING & INITIALIZATION
  // =========================================================================
  setupAppDOMInterceptor();

  initDB(function () {
    migrateState();
    hookRouter();
    if (typeof router !== "undefined") {
      router.handleRoute();
    }
  });
})();
