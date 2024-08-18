import * as THREE from 'three'
import * as THREE_Densaugeo from './three.Densaugeo.js';
import * as helpers from './helpers.js'

// Collection of shaders to switch between. The String 'original' designates
// materials orignally defined on each object individually
export const shaders = {
  global     : new THREE_Densaugeo.CoordinateMaterial(),
  local      : new THREE_Densaugeo.CoordinateMaterial({ local: true,
               showAxes: new THREE.Vector3(0, 0, 0) }),
  ghost      : new THREE_Densaugeo.PositionMaterial({ alpha: 0.8 }),
  normals    : new THREE_Densaugeo.NormalMaterial(),
}
for(const [key, value] of Object.entries(shaders)) {
  value.name = key
  value.transparent = true
  value.side = THREE.DoubleSide
}

/**
 * @module CastleModules.ShaderChanger inherits EventEmitter
 * @description Switches out materials for every child on a given THREE.Object3D
 * 
 * @example var shaderChanger = new CastleModules.ShaderChanger();
 * @example shaderChanger.nextMaterial(scene);
 */
export class ShaderChanger extends EventTarget {
  _setMaterial(object, material) {
    if(object instanceof THREE.Mesh) {
      if(object.originalMaterial == null) {
        object.originalMaterial = object.material
      }
      
      object.material = material ?? object.originalMaterial
    }
    
    if(object instanceof THREE.Object3D) {
      for(var i = 0, endi = object.children.length; i < endi; ++i) {
        this._setMaterial(object.children[i], material)
      }
    }
  }
  
  setMaterial(object, /*string*/ shaderName) {
    this._setMaterial(object, shaders[shaderName])
    
    this.emit('change', { currentShader: shaderName })
  }
}
export const shaderChanger = new ShaderChanger()

/** @type helpers.DenPanel */
export const helpPanel = fE('den-panel', {
  heading: 'Controls',
  command_icon: 'help-circle.svg',
  command_tooltip: 'Help',
}, [
  fE('div', { slot: 'content' }, [
    'Touchscreen:',
    fE('br'),
    'First finger drag - Pan',
    fE('br'),
    'Second finger drag - Rotate',
    fE('br'),
    'Slide along right edge - Throttle',
    fE('br'),
    fE('br'),
    'Mouse:',
    fE('br'),
    'Left click and drag - Pan',
    fE('br'),
    'Right click and drag - Rotate',
    fE('br'),
    'Scroll wheel - Dolly',
    fE('br'),
    'Shift click - Activate mouse look',
    fE('br'),
    'Esc - Exit mouse look',
    fE('br'),
    fE('br'),
    'Keyboard:',
    fE('br'),
    'W/S - Fly forward/backward',
    fE('br'),
    'A/D - Strafe left/right',
    fE('br'),
    'E/C - Ascend/Descend',
    fE('br'),
    'Arrows - Turn',
    fE('br'),
    fE('br'),
    'Gamepad (press any face button to activate):',
    fE('br'),
    'Left stick - Pan',
    fE('br'),
    'Right stick - Turn',
    fE('br'),
    'Left/right trigger - Throttle back/forward',
  ]),
])

export class DenShaderUI extends HTMLElement {
  /** @type {THREE.Material | null} */
  _currentShader = null
  get currentShader() { return this._currentShader }
  set currentShader(v) {
    this._currentShader = v
    
    for(const [name, toggle] of Object.entries(this.toggles)) {
      if(name === 'original') toggle.enabled = v == null
      else                    toggle.enabled = v?.name === name
    }
    
    this.render()
  }
  
  constructor() {
    super()
    
    this.shadow = this.attachShadow({ mode: 'closed' })
    
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`
    #shader-toggles {
      display: flex;
      flex-flow: row;
    }
    
    table {
      border-spacing: 0;
    }
    
    input {
      color: #0ff;
    }
    `)
    this.shadow.adoptedStyleSheets = [sheet]
    
    this.toggles = {
      original   : new helpers.DenCommand('camera.svg', 'Default'),
      global     : new helpers.DenCommand('globe.svg',
                                          'Global coordinate grid'),
      local      : new helpers.DenCommand('grid.svg', 'Local coordinate grid'),
      ghost      : new helpers.DenCommand('ghost.svg', 'Ghostly'),
      normals    : new helpers.DenCommand('right-angle.svg',
                                          'RBG-encoded normals'),
    }
    for(let [key, value] of Object.entries(this.toggles)) {
      value.fn = () => {
        shaderChanger.setMaterial(shaderChanger.scene,
          value.enabled ? 'original' : key)
      }
    }
    this.toggles.original.enabled = true
  }
  
  connectedCallback() {
    this.render()
    
    shaderChanger.on('change', e => {
      this.currentShader = shaders[e.currentShader] ?? null
    })
    
    this.shadow.on('input', e => {
      if(this.currentShader == null) return
      
      const uniform_name = e.target.id
      
      if(this.currentShader[uniform_name] instanceof THREE.Vector3) {
        this.currentShader[uniform_name].fromString(e.target.value)
      } else {
        this.currentShader[uniform_name] = e.target.value
      }
      this.currentShader.updateUniforms()
    })
    
    // Disable all keyboard shortcuts inside textboxes, and arrow keys inside
    // sliders
    this.shadow.on('keydown', e => {
      if(e.target.type === 'text') {
        e.stopPropagation()
      }
      
      if(e.target.type === 'range' && 37 <= e.keyCode && e.keyCode <= 40) {
        e.stopPropagation()
      }
    })
  }
  
  render() {
    this.shadow.replaceChildren(
      'Select Shader:',
      fE('div', { id: 'shader-toggles' }, [
        fE('den-command-slot', { command: this.toggles.original    }),
        fE('den-command-slot', { command: this.toggles.global      }),
        fE('den-command-slot', { command: this.toggles.local       }),
        fE('den-command-slot', { command: this.toggles.ghost       }),
        fE('den-command-slot', { command: this.toggles.normals     }),
      ]),
    )
    
    if(!(this.currentShader instanceof THREE.Material)) return
    
    this.shadow.append(
      fE('br'),
      'Shader-Specific Settings:',
      fE('table'),
    )
    
    for(let key in this.currentShader.uniforms) {
      // Time uniform is used for time-depndent behavior like water ripples, and
      // is updated by a clock. No need to add it to the settings panel
      if(key === 'time') continue
      
      const type = this.currentShader.uniforms[key].type
      if(!['i', 'f', 'v3'].includes(type)) continue
      
      let formatted_name = key.replace(/([A-Z])/g, ' $1')
      formatted_name = formatted_name[0].toUpperCase() + formatted_name.slice(1)
      
      let attributes = { id: key, type: type === 'v3' ? 'text' : 'range' }
      if(type === 'i') Object.assign(attributes, { min: 0, max: 1, step: 1    })
      if(type === 'f') Object.assign(attributes, { min: 0, max: 1, step: 0.01 })
      // Value must be set after step for sliders to handle it correctly
      attributes.value = this.currentShader[key].toString()
      
      this.shadow.querySelector('table').fE('tr', {}, [
        fE('td', [`${formatted_name}:`]),
        fE('td', [fE('input', attributes)]),
      ])
    }
  }
}
customElements.define('den-shader-ui', DenShaderUI)

/** @type helpers.DenPanel */
export const shaderPanel = fE('den-panel', {
  heading: 'Shader Settings',
  command_icon: 'eye.svg',
  command_tooltip: 'Shader Settings',
}, [
  fE('den-shader-ui', { slot: 'content' }),
])
shaderPanel.toggles = shaderPanel.querySelector('den-shader-ui').toggles

/** @type helpers.DenPanel */
export const inspectorPanel = fE('den-panel', {
  heading: 'Inspector',
  command_icon: 'search.svg',
  command_tooltip: 'Inspector',
}, [
  fE('div', { slot: 'content' }),
])

const inspector_content = inspectorPanel.querySelector('div')
const inspector_actions = []

document.body.on('keydown', e => {
  if(!e.altKey && !e.ctrlKey && e.shiftKey && 49 <= e.keyCode && e.keyCode <= 56) {
    e.stopPropagation()
    
    inspector_actions[e.keyCode - 49].emit('click')
  }
})

// The inspector is a good candidate for refactoring into a web component, since
// its select handler is already a lot like a render function. However, I want
// to wait until I've sorted out how to define the actions on each object
inspectorPanel.selectHandler = e => {
  inspector_content.replaceChildren(fE('div', [
    'Inspecting ',
    fE('text', { textContent: e.selection.name, style: 'color:#0ff' }),
    '. Hold shift to use these shortcuts:',
  ]))
  
  // Empties array in place
  inspector_actions.splice(0)
  
  Object.keys(e.selection.controls).forEach((v, i, a) => {
    inspector_actions[i] = inspector_content.fE('div', {
      textContent: (i + 1) +  ' - ' + v,
      tabIndex: 0,
      onclick: e.selection.controls[v],
    })
  })
}
