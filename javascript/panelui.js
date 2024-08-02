import { svg_icons } from './icons/svg-icons.js'

/**
 * Daisy-chainable HTML element maker. If an array is supplied as the second
 * argument, it is interpreted as children instead of properties
 * 
 * @param {string} tagName
 * @param {Object} properties
 * @param {HTMLElement[]} children
 * @returns {HTMLElement}
 */
export const fE = (tagName, properties={}, children=[]) => {
  if(properties instanceof Array) {
    children = properties.concat(children)
    properties = {}
  }
  
  const element = document.createElement(tagName)
  for(const key in properties) {
    try {
      element[key] = properties[key]
    } catch {
      // .setAttribute() is necessary for certain attributes like <input>'s
      // list. A normal assignment is ignored in that case. This should not be
      // done in most cases (textContent and className properties cannot be set
      // by .setAttribute() for example)
      if(element[key] == null) element.setAttribute(key, properties[key])
    }
  }
  
  element.append(...children)
  return element
}
globalThis.fE = fE

/**
 * Appends result of daisy-chainable element maker fE() as child element
 * 
 * @param {string} tagName
 * @param {Object} properties
 * @param {HTMLElement[]} children
 * @returns {HTMLElement}
 */
HTMLElement.prototype.fE = function() {
  return this.appendChild(fE(...arguments))
}

/**
 * Appends result of daisy-chainable element maker fE() as child element
 * 
 * @param {string} tagName
 * @param {Object} properties
 * @param {HTMLElement[]} children
 * @returns {HTMLElement}
 */
ShadowRoot.prototype.fE = function() {
  return this.appendChild(fE(...arguments))
}

/**
 * Abbreviation for document.createTextNode()
 * 
 * @param {string} text
 * @returns {Text}
 */
export const fT = (text) => {
  return document.createTextNode(text)
}
globalThis.fT = fT

/**
 * Appends result of document.createTextNode() as child element
 * 
 * @param {string} text
 * @returns {Text}
 */
HTMLElement.prototype.fT = function(text) {
  return this.appendChild(document.createTextNode(text))
}

/**
 * Appends result of document.createTextNode() as child element
 * 
 * @param {string} text
 * @returns {Text}
 */
ShadowRoot.prototype.fT = function(text) {
  return this.appendChild(document.createTextNode(text))
}

export const default_style = new CSSStyleSheet()
default_style.replaceSync(`
:host {
  /* This is required to make internal element positions relative to the web
  component, instead of something in the external DOM */
  position: relative;
  
  /* Using a flew or inline-block display style is required for the custom
  element in the external DOM to have the correct size. Flex seems to offer more
  flexibility, as you'd expect */
  display: flex;
  flex-flow: column;
  
  /* Ensure components have exactly their specified dimensions by default */
  margin: 0;
  border: none;
  padding: 0;
  box-sizing: border-box;
  
  /* Some sane defaults */
  outline: none;
  background: none;
}
`)

export class DenCommandSlot extends HTMLElement {
  /** @type {string} */
  _key = ''
  get key() { return this._key }
  set key(v) {
    this._key = v
    this.render()
  }
  
  /** @type {DenCommand | null} */
  _command = null
  get command() { return this._command }
  set command(v) {
    if(this._command) {
      this._command.off('enable' , this._enable_listener )
      this._command.off('disable', this._disable_listener)
    }
    
    this._command = v
    
    if(this._command) {
      this._command.on('enable' , this._enable_listener )
      this._command.on('disable', this._disable_listener)
    }
    
    this.render()
  }
  
  _enable_listener  = () => { this.classList.add('enabled') }
  _disable_listener = () => { this.classList.remove('enabled') }
  
  constructor() {
    super()
    
    this.shadow = this.attachShadow({ mode: 'closed' })
    
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`
    :host {
      width: 36px;
      height: 36px;
      font-size: 14px;
      color: #aaa;
    }
    
    button {
      position: absolute;
      left: 0;
      top: 0;
      width: 36px;
      height: 36px;
      margin: 0;
      border: none;
      padding: 0;
      background: none;
    }
    
    svg {
      position: absolute;
      left: 0;
      top: 0;
      width: 24px;
      height: 24px;
      margin: 0;
      padding: 6px;
      color: #a9d;
    }
    :host(.enabled) > button > svg {
      color: #0ff;
    }
    button:hover > svg {
      color: #0f0;
    }
    button:focus {
      outline: 1px dashed #0f0;
      outline-offset: -2px;
    }
    button:focus:active {
      outline: none;
    }
    button:focus:active > svg {
      color: #c0f;
    }
    `)
    this.shadow.adoptedStyleSheets = [default_style, sheet]
  }
  
  connectedCallback() {
    this.render()
  }
  
  disconnectedCallback() {
    // Nulling out linked command removes related event listeners
    this.command = null
  }
  
  render() {
    const command = this.command
    
    this.shadow.replaceChildren(
      fT(this.key),
      fE('button', { innerHTML: command?.icon ? svg_icons[command.icon] : '' }),
    )
    
    this.setAttribute('title', [
      command?.tooltip,
      this.key ? `Key: ${this.key}` : '',
    ].filter(Boolean).join('\n\n'))
    
    this.onclick = command?.fn
    
    if(command?.enabled) this.classList.add('enabled')
    else this.classList.remove('enabled')
  }
}
customElements.define('den-command-slot', DenCommandSlot)

export class DenCommand extends EventTarget {
  /** @type {string} */
  #icon
  get icon() { return this.#icon }
  set icon(v) { this.#icon = v; this.emit('change') }
  
  /** @type {string} */
  #tooltip
  get tooltip() { return this.#tooltip }
  set tooltip(v) { this.#tooltip = v; this.emit('change') }
  
  #fn
  /** @type {function} */
  get fn() { return this.#fn }
  set fn(v) { this.#fn = v; this.emit('change') }
  
  /** @type {boolean} */
  #enabled = false
  get enabled() { return this.#enabled }
  set enabled(v) {
    this.#enabled = Boolean(v)
    this.emit(this.#enabled ? 'enable' : 'disable')
  }
  
  /**
   * @param {string} icon
   * @param {string} tooltip
   * @param {function} fn
  */
  constructor(icon, tooltip, fn) {
    if(icon.slice(-4) !== '.svg') {
      throw TypeError('icon should be a filename ending in .svg')
    }
    
    super()
    
    this.#icon = icon
    this.#tooltip = tooltip
    this.#fn = fn
  }
}

/** @type DenPanel[] Used to ensure only one panel is open at a time. Hope to
 *        remove this when I make panel movable */
const panel_sync = []

export class DenPanel extends HTMLElement {
  _heading = 'Heading Goes Here'
  get heading() { return this._heading }
  set heading(v) { this._heading = v; this.render() }
  
  _enabled = false
  get enabled() { return this._enabled }
  set enabled(v) {
    this._enabled = v
    this.render()
    
    this.command.enabled = v
    
    if(v) panel_sync.forEach(v => { if(v !== this) v.enabled = false })
    if(v) this.focus()
    
    // If a DOM element with focues is removed (or not displayed), this messes
    // with focus and tab ordering. Move focus up to a containing element
    if(!v && this.matches(':focus-within')) {
      if(this.parentNode instanceof ShadowRoot) this.parentNode.host.focus()
      else this.parentNode.focus()
    }
  }
  
  _command = new DenCommand('help-circle.svg', 'Tooltip goes here', () => {
    this.enabled = !this.enabled
  })
  get command() { return this._command }
  get command_icon() { return this.command.icon }
  set command_icon(v) { this.command.icon = v }
  get command_tooltip() { return this.command.tooltip }
  set command_tooltip(v) { this.command.tooltip = v }
  
  constructor() {
    super()
    
    panel_sync.push(this)
    
    this.shadow = this.attachShadow({ mode: 'closed' })
    
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`
    :host {
      border: 4px solid #088;
      padding: 8px;
      background: #000;
    }
    .panel_heading {
      width: 100%;
      min-height: 24px;
      margin-bottom: 6px;
      font-size: 16px;
      color: #aff;
      text-align: center;
    }
    `)
    this.shadow.adoptedStyleSheets = [default_style, sheet]
  }
  
  connectedCallback() {
    this.render()
  }
  
  render() {
    this.shadow.replaceChildren(
      fE('div', { className: 'panel_heading' }, [this.heading]),
      fE('slot', { name: 'content' }),
    )
    
    this.setAttribute('title', this.heading)
    this.setAttribute('tabIndex', 0)
    
    this.style.display = this.enabled ? '' : 'none'
  }
}
customElements.define('den-panel', DenPanel)
