export class Router {
  constructor() {
    this.routes = {
      login: () => window.renderLoginView?.(),
      signup: () => window.renderSignupView?.(),
      dashboard: () => window.renderDashboardView?.(),
      employees: () => window.renderEmployeesView?.(),
      profile: (params) => window.renderProfileView?.(params),
      attendance: () => window.renderAttendanceView?.(),
      timeoff: () => window.renderTimeOffView?.(),
      payroll: () => window.renderPayrollView?.()
    };

    this.useHistoryApi = this.supportsHistoryApi();
    this.scrollRestoration = "manual";

    if (this.useHistoryApi) {
      window.addEventListener("popstate", (e) => {
        if (e.state !== null) {
          this.handleRoute();
        }
      });
      window.history.scrollRestoration = "manual";
    } else {
      window.addEventListener("hashchange", () => this.handleRoute());
    }

    window.addEventListener("beforeunload", () => {
      if (this.useHistoryApi) {
        sessionStorage.setItem("router_scroll", JSON.stringify({
          x: window.scrollX,
          y: window.scrollY
        }));
      }
    });
  }

  supportsHistoryApi() {
    return !!(window.history && window.history.pushState);
  }

  getBasePath() {
    const base = document.querySelector("base");
    return base?.getAttribute("href") || "/";
  }

  buildPath(route, params = null) {
    const base = this.getBasePath();
    let path = `${base}${route}`.replace(/\/+/g, "/");
    if (params) {
      const query = new URLSearchParams(params).toString();
      if (query) path += `?${query}`;
    }
    return path;
  }

  navigate(route, params = null, options = {}) {
    const { replace = false, state = null } = options;

    if (this.useHistoryApi) {
      const path = this.buildPath(route, params);
      if (replace) {
        window.history.replaceState(state, "", path);
      } else {
        window.history.pushState(state, "", path);
      }
      this.handleRoute();
    } else {
      let hash = `#${route}`;
      if (params) {
        hash += `?${new URLSearchParams(params).toString()}`;
      }
      if (replace) {
        window.history.replaceState(null, "", hash);
      } else {
        window.location.hash = hash;
      }
      this.handleRoute();
    }
  }

  handleRoute() {
    let route, queryStr, params;

    if (this.useHistoryApi) {
      const path = window.location.pathname;
      const base = this.getBasePath();
      const relativePath = path.replace(base, "").replace(/^\//, "") || "login";
      route = relativePath;
      queryStr = window.location.search ? window.location.search.substring(1) : "";
    } else {
      const hash = window.location.hash.substring(1) || "login";
      [route, queryStr] = hash.split("?");
    }

    params = queryStr ? Object.fromEntries(new URLSearchParams(queryStr)) : {};

    const user = window.store?.getCurrentUser();
    const publicRoutes = ["login", "signup"];

    if (!user && !publicRoutes.includes(route)) {
      this.navigate("login", null, { replace: true });
      return;
    } else if (user && publicRoutes.includes(route)) {
      this.navigate("dashboard", null, { replace: true });
      return;
    }

    const renderFn = this.routes[route];
    if (renderFn) {
      renderFn(params);
    } else {
      this.navigate("dashboard", null, { replace: true });
    }
  }

  getCurrentRoute() {
    if (this.useHistoryApi) {
      const path = window.location.pathname;
      const base = this.getBasePath();
      return path.replace(base, "").replace(/^\//, "") || "login";
    } else {
      return window.location.hash.substring(1) || "login";
    }
  }

  getCurrentParams() {
    if (this.useHistoryApi) {
      const search = window.location.search;
      return search ? Object.fromEntries(new URLSearchParams(search)) : {};
    } else {
      const hash = window.location.hash;
      const queryStr = hash.split("?")[1];
      return queryStr ? Object.fromEntries(new URLSearchParams(queryStr)) : {};
    }
  }

  restoreScrollPosition() {
    const saved = sessionStorage.getItem("router_scroll");
    if (saved) {
      try {
        const { x, y } = JSON.parse(saved);
        window.scrollTo(x, y);
      } catch {}
      sessionStorage.removeItem("router_scroll");
    }
  }

  goBack() {
    if (this.useHistoryApi && window.history.length > 1) {
      window.history.back();
    } else if (!this.useHistoryApi) {
      window.history.back();
    }
  }
}

window.Router = Router;
window.router = new Router();
