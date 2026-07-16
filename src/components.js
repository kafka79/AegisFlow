/**
 * Lightweight component abstraction for vanilla JS views.
 * Provides state-driven rendering, lifecycle hooks, and composition.
 */

export class Component {
  constructor(props = {}) {
    this.props = props;
    this.state = {};
    this.refs = new Map();
    this._children = [];
    this._mounted = false;
    this._renderScheduled = false;
    this._cleanupFns = [];
  }

  setState(partialState) {
    this.state = { ...this.state, ...partialState };
    this.scheduleRender();
  }

  scheduleRender() {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    queueMicrotask(() => {
      this._renderScheduled = false;
      if (this._mounted) this.render();
    });
  }

  render() {
    throw new Error("Component.render() must be implemented");
  }

  onMount() {}
  onUnmount() {}
  onPropsChange(prevProps) {}

  // Hook for child components
  mount(parentEl) {
    this._mounted = true;
    this.render();
    this.onMount();
  }

  unmount() {
    this._mounted = false;
    this._cleanupFns.forEach(fn => fn());
    this._cleanupFns = [];
    this._children.forEach(child => child.unmount?.());
    this.onUnmount();
  }

  addCleanup(fn) {
    this._cleanupFns.push(fn);
  }

  // Component composition
  appendChild(child) {
    if (child instanceof Component) {
      this._children.push(child);
      if (this._mounted && child.mount) {
        child.mount(this.refs.get(child) || document.body);
      }
    }
  }

  removeChild(child) {
    const idx = this._children.indexOf(child);
    if (idx !== -1) {
      this._children.splice(idx, 1);
      child.unmount?.();
    }
  }

  // Utility for creating elements with refs
  ref(key, element) {
    this.refs.set(key, element);
    return element;
  }

  getRef(key) {
    return this.refs.get(key);
  }

  // Event binding with automatic cleanup
  on(element, event, handler, options) {
    element.addEventListener(event, handler, options);
    this.addCleanup(() => element.removeEventListener(event, handler, options));
    return handler;
  }

  // Create element with component integration
  createElement(html, context = this) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const fragment = template.content;

    // Bind events from data-wf-* attributes
    const elements = fragment.querySelectorAll('[data-wf-click], [data-wf-input], [data-wf-change], [data-wf-submit]');
    elements.forEach(el => {
      const actions = [
        ['data-wf-click', 'click'],
        ['data-wf-input', 'input'],
        ['data-wf-change', 'change'],
        ['data-wf-submit', 'submit']
      ];
      actions.forEach(([attr, event]) => {
        const action = el.getAttribute(attr);
        if (action && context[action]) {
          this.on(el, event, (e) => context[action].call(context, e, el));
        }
      });
    });

    return fragment;
  }

  // Helpers for common patterns
  h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'class') el.className = value;
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key.startsWith('data-') || key.startsWith('aria-')) el.setAttribute(key, value);
      else if (key.startsWith('on')) el.setAttribute(`data-wf-${key.slice(2).toLowerCase()}`, value);
      else if (value !== null && value !== undefined) el[key] = value;
    });
    children.flat().forEach(child => {
      if (typeof child === 'string' || typeof child === 'number') {
        el.appendChild(document.createTextNode(child));
      } else if (child instanceof Node) {
        el.appendChild(child);
      }
    });
    return el;
  }
}

// Component registry for global access
export const componentRegistry = new Map();

export function registerComponent(name, ComponentClass) {
  componentRegistry.set(name, ComponentClass);
}

export function getComponent(name) {
  return componentRegistry.get(name);
}

// Higher-order component for conditional rendering
export function createConditionalComponent(conditionFn, TrueComponent, FalseComponent = null) {
  return class ConditionalComponent extends Component {
    render() {
      if (conditionFn(this.props, this.state)) {
        return this.createElement(`<div data-component="${TrueComponent.name}"></div>`);
      }
      if (FalseComponent) {
        return this.createElement(`<div data-component="${FalseComponent.name}"></div>`);
      }
      return this.createElement('<div></div>');
    }
  };
}

// List component for rendering arrays
export class ListComponent extends Component {
  constructor(props) {
    super(props);
    this.itemComponent = props.itemComponent;
    this.itemProps = props.itemProps || ((item) => ({ item }));
    this.keyField = props.keyField || 'id';
  }

  render() {
    const items = this.props.items || [];
    return this.h('div', { class: this.props.className || '' }, 
      items.map(item => {
        const key = item[this.keyField];
        const childProps = { ...this.itemProps(item), key };
        const ChildComponent = this.itemComponent;
        const child = new ChildComponent(childProps);
        child.mount?.(document.createElement('div'));
        return child;
      })
    );
  }
}

// Form component with validation
export class FormComponent extends Component {
  constructor(props) {
    super(props);
    this.fields = props.fields || {};
    this.errors = {};
    this.touched = {};
  }

  validate() {
    const newErrors = {};
    Object.entries(this.fields).forEach(([name, config]) => {
      const value = this.state[name] || this.props.initialValues?.[name] || '';
      if (config.required && !value) newErrors[name] = config.requiredMessage || `${name} is required`;
      if (config.validate) {
        const result = config.validate(value, this.state);
        if (result) newErrors[name] = result;
      }
    });
    this.errors = newErrors;
    this.setState({ errors: newErrors });
    return Object.keys(newErrors).length === 0;
  }

  handleChange(name, value) {
    this.setState({ [name]: value });
    if (this.touched[name] && this.errors[name]) {
      this.validate();
    }
  }

  handleBlur(name) {
    this.touched[name] = true;
    this.validate();
  }

  getFormData() {
    return Object.fromEntries(
      Object.keys(this.fields).map(name => [name, this.state[name] || this.props.initialValues?.[name] || ''])
    );
  }

  handleSubmit(event) {
    event.preventDefault();
    if (this.validate() && this.props.onSubmit) {
      this.props.onSubmit(this.getFormData());
    }
  }
}

// Modal component with focus trap
export class ModalComponent extends Component {
  constructor(props) {
    super(props);
    this.state = { open: false, ...props.initialState };
  }

  open() {
    this.setState({ open: true });
  }

  close() {
    this.setState({ open: false });
    this.props.onClose?.();
  }

  render() {
    if (!this.state.open) return this.createElement('<div></div>');
    
    return this.createElement(`
      <dialog class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="${this.props.titleId || 'modal-title'}">
        <div class="modal-content glass">
          ${this.props.title ? `<h3 id="${this.props.titleId || 'modal-title'}">${this.props.title}</h3>` : ''}
          <div class="modal-body">${this.renderBody()}</div>
          <div class="modal-footer">${this.renderFooter()}</div>
        </div>
      </dialog>
    `);
  }

  renderBody() {
    return '';
  }

  renderFooter() {
    return '';
  }

  onMount() {
    if (this.state.open) {
      const dialog = document.querySelector('dialog.modal-overlay');
      if (dialog) dialog.showModal();
    }
  }

  onUnmount() {
    const dialog = document.querySelector('dialog.modal-overlay');
    if (dialog?.open) dialog.close();
  }
}

// Card component for consistent UI
export class CardComponent extends Component {
  render() {
    const { title, subtitle, icon, children, className, footer, actions } = this.props;
    return this.h('div', { class: `card glass ${className || ''}` }, 
      (title || subtitle || icon) && this.h('div', { class: 'card-header' },
        icon && this.h('span', { class: 'card-icon' }, icon),
        title && this.h('h3', { class: 'card-title' }, title),
        subtitle && this.h('p', { class: 'card-subtitle' }, subtitle)
      ),
      this.h('div', { class: 'card-body' }, children),
      footer && this.h('div', { class: 'card-footer' }, footer),
      actions && this.h('div', { class: 'card-actions' }, actions)
    );
  }
}

// Table component
export class TableComponent extends Component {
  render() {
    const { columns, data, keyField = 'id', rowActions, emptyMessage, className, sortBy, sortDir, onSort } = this.props;
    
    return this.h('div', { class: `table-container ${className || ''}` },
      this.h('table', { class: 'data-table' },
        this.h('thead', {},
          this.h('tr', {},
            columns.map(col => this.h('th', {
              class: col.sortable ? 'sortable' : '',
              'data-sort': col.field,
              'data-wf-click': onSort ? `onSort('${col.field}')` : null
            }, col.header))
          )
        ),
        this.h('tbody', {},
          data.length > 0
            ? data.map(row => this.h('tr', { 'data-id': row[keyField] },
                columns.map(col => this.h('td', {}, 
                  col.render ? col.render(row[col.field], row) : row[col.field]
                )),
                rowActions && this.h('td', { class: 'actions-cell' }, 
                  rowActions(row).map(action => 
                    this.h('button', { 
                      class: `btn btn-${action.variant || 'secondary'} btn-sm`,
                      'data-wf-click': action.handler,
                      'data-action-arg': JSON.stringify(row)
                    }, action.label)
                  )
                )
              )
            )
            : this.h('tr', {},
                this.h('td', { colspan: columns.length + (rowActions ? 1 : 0), style: 'text-align: center; color: var(--text-muted); padding: 32px;' }, emptyMessage || 'No data available')
              )
        )
      )
    );
  }
}

// Badge/status component
export function createBadge(text, variant = 'default') {
  const variants = {
    default: '',
    success: 'status-badge success',
    warning: 'status-badge warning',
    error: 'status-badge error',
    info: 'status-badge info',
    pending: 'status-badge pending'
  };
  return `<span class="${variants[variant] || variants.default}">${text}</span>`;
}

// Button component
export function createButton(label, variant = 'primary', size = '', handler = null, disabled = false, attrs = {}) {
  const handlerAttr = handler ? `data-wf-click="${handler}"` : '';
  const disabledAttr = disabled ? 'disabled' : '';
  return `<button class="btn btn-${variant} ${size ? `btn-${size}` : ''}" ${handlerAttr} ${disabledAttr} ${Object.entries(attrs).map(([k,v]) => `${k}="${v}"`).join(' ')}>${label}</button>`;
}

// Input component
export function createInput(name, type = 'text', label = '', value = '', required = false, attrs = {}) {
  const requiredAttr = required ? 'required' : '';
  const labelHtml = label ? `<label for="${name}">${label}</label>` : '';
  const inputAttrs = Object.entries(attrs).map(([k,v]) => `${k}="${v}"`).join(' ');
  return `
    <div class="form-field">
      ${labelHtml}
      <input type="${type}" id="${name}" name="${name}" value="${value}" ${requiredAttr} ${inputAttrs} />
    </div>
  `;
}

// Select component
export function createSelect(name, options, label = '', value = '', required = false, attrs = {}) {
  const requiredAttr = required ? 'required' : '';
  const labelHtml = label ? `<label for="${name}">${label}</label>` : '';
  const optionsHtml = options.map(opt => `<option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>${opt.label}</option>`).join('');
  const inputAttrs = Object.entries(attrs).map(([k,v]) => `${k}="${v}"`).join(' ');
  return `
    <div class="form-field">
      ${labelHtml}
      <select id="${name}" name="${name}" ${requiredAttr} ${inputAttrs}>${optionsHtml}</select>
    </div>
  `;
}

// Alert component
export function createAlert(message, variant = 'info', dismissible = false, onDismiss = null) {
  const variants = {
    info: 'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error: 'alert-error'
  };
  const dismissBtn = dismissible ? `<button type="button" class="alert-dismiss" data-wf-click="${onDismiss || 'closeAlert'}">&times;</button>` : '';
  return `<div class="alert ${variants[variant] || variants.info}" role="alert">${message}${dismissBtn}</div>`;
}

// Loading spinner
export function createSpinner(size = 'md') {
  const sizes = { sm: '16px', md: '24px', lg: '32px' };
  return `<div class="spinner" style="width: ${sizes[size] || sizes.md}; height: ${sizes[size] || sizes.md};"></div>`;
}

// Empty state component
export function createEmptyState(icon, title, description, action = null) {
  return `
    <div class="empty-state glass" style="text-align: center; padding: 48px 24px;">
      <div class="empty-icon" style="font-size: 48px; margin-bottom: 16px;">${icon}</div>
      <h3 style="margin-bottom: 8px;">${title}</h3>
      <p style="color: var(--text-muted); margin-bottom: 24px;">${description}</p>
      ${action ? `<button class="btn btn-primary" data-wf-click="${action.handler}">${action.label}</button>` : ''}
    </div>
  `;
}
