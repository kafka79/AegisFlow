import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as views from '../src/views.js';

vi.mock('../src/views.js', () => ({
  renderLoginView: vi.fn(),
  renderSignupView: vi.fn(),
  renderDashboardView: vi.fn(),
  renderEmployeesView: vi.fn(),
  renderProfileView: vi.fn(),
  renderAttendanceView: vi.fn(),
  renderTimeOffView: vi.fn(),
  renderPayrollView: vi.fn(),
}));
describe('Renderer', () => {
  let patchAppDOM;
  let getCachedAvatar;
  let enableFocusTrap;
  let disableFocusTrap;
  let setAriaExpanded;
  let setAriaHidden;
  let announceToScreenReader;
  let shouldAnimate;
  let escapeHtml;
  let initDOMRenderer;
  
  beforeEach(async () => {
    vi.resetModules();
    
    document.body.innerHTML = '<div id="app"></div>';
    
    global.CSS = { escape: (str) => str.replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~]/g, '\\$&') };
    global.navigator = { onLine: true };
    
    const renderer = await import('../src/renderer.js');
    patchAppDOM = renderer.patchAppDOM;
    getCachedAvatar = renderer.getCachedAvatar;
    enableFocusTrap = renderer.enableFocusTrap;
    disableFocusTrap = renderer.disableFocusTrap;
    setAriaExpanded = renderer.setAriaExpanded;
    setAriaHidden = renderer.setAriaHidden;
    announceToScreenReader = renderer.announceToScreenReader;
    shouldAnimate = renderer.shouldAnimate;
    escapeHtml = renderer.escapeHtml;
    initDOMRenderer = renderer.initDOMRenderer;
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    delete global.CSS;
    delete global.navigator;
  });

  describe('patchAppDOM', () => {
    it('patches layout page preserving sidebar and header', () => {
      const html = `
        <div data-layout="main">
          <div class="sidebar"><a class="sidebar-link active" onclick="router.navigate('dashboard')">Dashboard</a></div>
          <div class="main-wrapper">
            <header class="top-header"><h1 class="view-title">Dashboard</h1></header>
            <div class="view-container"><p>Content</p></div>
          </div>
        </div>
      `;
      
      patchAppDOM(document.getElementById('app'), html);
      
      const app = document.getElementById('app');
      expect(app.querySelector('.sidebar')).toBeTruthy();
      expect(app.querySelector('.main-wrapper')).toBeTruthy();
      expect(app.querySelector('.view-container')).toBeTruthy();
    });

    it('updates view title in header', () => {
      const html1 = `
        <div data-layout="main">
          <div class="sidebar"></div>
          <div class="main-wrapper">
            <header class="top-header"><h1 class="view-title">Dashboard</h1></header>
            <div class="view-container"><p>Content 1</p></div>
          </div>
        </div>
      `;
      patchAppDOM(document.getElementById('app'), html1);
      
      const html2 = `
        <div data-layout="main">
          <div class="sidebar"></div>
          <div class="main-wrapper">
            <header class="top-header"><h1 class="view-title">Employees</h1></header>
            <div class="view-container"><p>Content 2</p></div>
          </div>
        </div>
      `;
      patchAppDOM(document.getElementById('app'), html2);
      
      const title = document.querySelector('.view-title');
      expect(title.textContent).toBe('Employees');
    });

    it('sanitizes HTML to prevent XSS', () => {
      const maliciousHtml = `
        <div data-layout="main">
          <div class="sidebar"></div>
          <div class="main-wrapper">
            <header class="top-header"><h1 class="view-title">Test</h1></header>
            <div class="view-container"><img src="x" onerror="alert(1)"><script>alert(1)</script></div>
          </div>
        </div>
      `;
      
      patchAppDOM(document.getElementById('app'), maliciousHtml);
      
      const container = document.querySelector('.view-container');
      expect(container.innerHTML).not.toContain('<script>');
      expect(container.innerHTML).not.toContain('onerror');
    });

    it('drops unsupported tags without crashing', () => {
      const invalidHtml = '<div data-layout="main"><invalid-tag><span>Safe</span></invalid-tag></div>';
      
      patchAppDOM(document.getElementById('app'), invalidHtml);
      
      const app = document.getElementById('app');
      expect(app.querySelector('invalid-tag')).toBeNull();
      expect(app.textContent).toContain('Safe');
      expect(app.querySelector('.error-fallback')).toBeNull();
    });
  });

  describe('getCachedAvatar', () => {
    it('generates avatar SVG', () => {
      const avatar = getCachedAvatar('JD', '6366f1', 100);
      expect(avatar).toContain('data:image/svg+xml');
      expect(avatar).toContain('JD');
      expect(avatar).toContain('6366f1');
    });

    it('caches avatars', () => {
      const avatar1 = getCachedAvatar('JD', '6366f1', 100);
      const avatar2 = getCachedAvatar('JD', '6366f1', 100);
      expect(avatar1).toBe(avatar2);
    });

    it('evicts old entries when cache is full', () => {
      for (let i = 0; i < 101; i++) {
        getCachedAvatar(`AB${i}`, '6366f1', 100);
      }
      const first = getCachedAvatar('AB0', '6366f1', 100);
      const latest = getCachedAvatar('AB100', '6366f1', 100);
      expect(first).toContain('AB0');
      expect(latest).toContain('AB10');
    });
  });

  describe('Focus Trap', () => {
    it('traps focus within modal', () => {
      const modal = document.createElement('div');
      modal.innerHTML = `
        <button id="first">First</button>
        <button id="last">Last</button>
      `;
      document.body.appendChild(modal);
      
      enableFocusTrap(modal);
      
      const first = document.getElementById('first');
      const last = document.getElementById('last');
      
      const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      first.focus();
      modal.dispatchEvent(shiftTabEvent);
      
      expect(document.activeElement).toBe(last);
      
      disableFocusTrap();
      document.body.removeChild(modal);
    });

    it('restores focus to trigger element on close', () => {
      const trigger = document.createElement('button');
      trigger.id = 'trigger';
      document.body.appendChild(trigger);
      trigger.focus();
      
      const modal = document.createElement('div');
      modal.innerHTML = '<button id="modal-btn">Modal</button>';
      document.body.appendChild(modal);
      
      enableFocusTrap(modal);
      disableFocusTrap();
      
      expect(document.activeElement).toBe(trigger);
      
      document.body.removeChild(trigger);
      document.body.removeChild(modal);
    });

    it('handles Escape key to close modal', () => {
      const modal = document.createElement('div');
      modal.innerHTML = '<button>Close</button>';
      document.body.appendChild(modal);
      
      enableFocusTrap(modal);
      
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      modal.dispatchEvent(escapeEvent);
      
      disableFocusTrap();
      document.body.removeChild(modal);
    });
  });

  describe('ARIA Utilities', () => {
    it('sets aria-expanded', () => {
      const el = document.createElement('button');
      setAriaExpanded(el, true);
      expect(el.getAttribute('aria-expanded')).toBe('true');
      
      setAriaExpanded(el, false);
      expect(el.getAttribute('aria-expanded')).toBe('false');
    });

    it('sets aria-hidden', () => {
      const el = document.createElement('div');
      setAriaHidden(el, true);
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });

    it('announces to screen reader', () => {
      announceToScreenReader('Test message', 'assertive');
      
      const announcer = document.getElementById('a11y-announcer');
      expect(announcer).toBeTruthy();
      expect(announcer.textContent).toBe('Test message');
    });
  });

  describe('Reduced Motion', () => {
    it('returns false when prefers-reduced-motion', () => {
      window.matchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }));
      expect(shouldAnimate()).toBe(false);
    });
  });

  describe('escapeHtml', () => {
    it('escapes special characters', () => {
      expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(escapeHtml('"quotes"')).toBe('&quot;quotes&quot;');
      expect(escapeHtml("'single'")).toBe('&#039;single&#039;');
      expect(escapeHtml('&')).toBe('&amp;');
    });

    it('handles null/undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });
});

describe('Router', () => {
  let Router;
  let router;
  let originalPushState;
  let originalReplaceState;
  let mockStore;
  
  beforeEach(async () => {
    vi.resetModules();
    window.history.replaceState(null, '', '/');
    document.head.innerHTML = '';
    const { registerStore } = await import('../src/app-context.js');
    mockStore = {
      getCurrentUser: vi.fn(() => ({ id: 'ODIAD20260001', role: 'HR' })),
      state: { 
        employees: [], 
        timeOff:[],
        attendance: []
      },
      getEmployee: vi.fn((id) => ({ id, name: 'Test User' })),
      getAttendanceToday: vi.fn(() => null),
    };
    registerStore(mockStore);
    originalPushState = window.history.pushState.bind(window.history);
    originalReplaceState = window.history.replaceState.bind(window.history);
    vi.spyOn(window.history, 'pushState').mockImplementation((state, title, url) => {
      originalPushState(state, title, url);
    });
    vi.spyOn(window.history, 'replaceState').mockImplementation((state, title, url) => {
      originalReplaceState(state, title, url);
    });

    const routerModule = await import('../src/router.js');
    Router = routerModule.Router;
    
    router = new Router();
  });
  
  afterEach(() => {
    if (router && typeof router.destroy === 'function') {
      router.destroy();
    }
    window.history.replaceState(null, '', '/');
    mockStore = null;
    vi.restoreAllMocks();
  });

  describe('History API Navigation', () => {
    it('uses pushState for navigation', () => {
      router.navigate('dashboard');
      expect(window.history.pushState).toHaveBeenCalled();
      expect(window.location.pathname).toBe('/dashboard');
    });

    it('supports replace option', () => {
      router.navigate('dashboard', null, { replace: true });
      expect(window.history.replaceState).toHaveBeenCalled();
      expect(window.location.pathname).toBe('/dashboard');
    });

    it('builds correct path with params', () => {
      router.navigate('profile', { id: '123' });
      expect(window.history.pushState).toHaveBeenCalledWith(
        null, '', expect.stringContaining('/profile?id=123')
      );
      expect(window.location.pathname).toBe('/profile');
      expect(window.location.search).toBe('?id=123');
    });
  });

  describe('Hash-based Fallback', () => {
    it('falls back to hash when History API unavailable', () => {
      const router2 = new Router();
      router2.useHistoryApi = false;
      router2.navigate('dashboard');
      expect(window.location.hash).toBe('#dashboard');
      router2.destroy();
    });
  });

  describe('Route Handling', () => {
    it('redirects to login when not authenticated', () => {
      mockStore.getCurrentUser.mockReturnValue(null);
      
      window.history.replaceState(null, '', '/dashboard');
      router.handleRoute();
      
      expect(window.history.replaceState).toHaveBeenCalledWith(
        null, '', expect.stringContaining('/login')
      );
      expect(window.location.pathname).toBe('/login');
    });

    it('redirects authenticated user away from login', () => {
      mockStore.getCurrentUser.mockReturnValue({ id: '1', role: 'Employee' });
      
      window.history.replaceState(null, '', '/login');
      router.handleRoute();
      
      expect(window.history.replaceState).toHaveBeenCalledWith(
        null, '', expect.stringContaining('/dashboard')
      );
      expect(window.location.pathname).toBe('/dashboard');
    });

    it('renders correct view for route', () => {
      mockStore.getCurrentUser.mockReturnValue({ id: '1', role: 'Employee' });
      
      window.history.replaceState(null, '', '/dashboard');
      router.handleRoute();
      
      expect(views.renderDashboardView).toHaveBeenCalled();
    });
  });

  describe('Deep Linking', () => {
    it('parses params from URL', () => {
      window.history.replaceState(null, '', '/profile?id=123&tab=salary');
      mockStore.getCurrentUser.mockReturnValue({ id: '1', role: 'HR' });
      mockStore.getEmployee.mockReturnValue({ id: '123', name: 'Test User' });
      
      router.handleRoute();
      
      expect(views.renderProfileView).toHaveBeenCalledWith({ id: '123', tab: 'salary' });
    });

    it('handles nested routes', () => {
      window.history.replaceState(null, '', '/employees/123');
      mockStore.getCurrentUser.mockReturnValue({ id: '1', role: 'HR' });
      
      expect(() => router.handleRoute()).not.toThrow();
      expect(window.location.pathname).toBe('/dashboard');
    });
  });

  describe('Scroll Restoration', () => {
    it('saves scroll position on unload', () => {
      Object.defineProperty(window, 'scrollX', { value: 100, configurable: true });
      Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
      
      const beforeUnloadEvent = new Event('beforeunload');
      window.dispatchEvent(beforeUnloadEvent);
      
      const saved = sessionStorage.getItem('router_scroll');
      expect(saved).toContain('100');
      expect(saved).toContain('200');
    });
  });
});
