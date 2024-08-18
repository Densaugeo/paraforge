import * as THREE from 'three';
export * as THREE from 'three';
import * as THREE_Den from './three.Den.js';
export * as THREE_Den from './three.Den.js';
import * as ui_panels from './ui-panels.js'
export * as ui_panels from './ui-panels.js'
import * as helpers from './helpers.js'
export * as helpers from './helpers.js'
import { GLTFLoader } from 'three.GLTFLoader'
export { GLTFLoader } from 'three.GLTFLoader'
import * as paraforge from './paraforge.js'
export * as paraforge from './paraforge.js'

THREE.ColorManagement.enabled = false
export const PI = Math.PI

if(HTMLElement.prototype.requestFullscreen == null) {
  HTMLElement.prototype.requestFullscreen = () => {
    let message = 'Sorry, your browser does not allow fullscreen mode.'
    
    if(navigator.userAgent.includes('iPhone')) {
      message += '\n\nYou appear to be using an iPhone. Apple does allow ' +
        'fullscreen on iPads, but not on iPhones.'
    }
    
    alert(message)
  }
}

export class ParaforgeViewer extends HTMLElement {
  timePrevious = 0
  timeDelta = 0
  renderNeeded = true
  
  constructor() {
    super()
    
    // Default values for custom attributes
    if(this.width  == null) this.width  = 580
    if(this.height == null) this.height = 360
    
    /////////////////
    // THREE Setup //
    /////////////////
    
    this.scene = new THREE.Scene()
    
    this.ambientLight = this.scene.f3D(THREE.AmbientLight, {
      color: new THREE.Color(0x666666),
      intensity: 3.14159,
    }),
    
    this.directionalLight = this.scene.f3D(THREE.DirectionalLight, {
      color: new THREE.Color(0x666666),
      position: [-7.1, -2.75, 10],
      intensity: 3.14159,
    })
    
    this.grid = this.scene.f3D(new THREE.GridHelper(20, 20, null, 0xc0ffff), {
      euler: [PI/2, 0, 0],
    })
    
    this.x_axis = this.scene.f3D(new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-10, 0, 0), 23, 0xff0000, 2,
    ))
    
    this.y_axis = this.scene.f3D(new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -10, 0), 23, 0x00ff00, 2,
    ))
    
    // Prevent z-fighting between axes and grid lines
    this.x_axis.children[0].material.depthFunc = THREE.AlwaysDepth
    this.y_axis.children[0].material.depthFunc = THREE.AlwaysDepth
    
    this.generated_meshes = this.scene.f3D(THREE.Group)
    
    this.renderer = new THREE.WebGLRenderer( { antialias: true } );
    this.renderer.setClearColor(0xc0c0c0, 1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    
    this.camera = f3D(THREE.PerspectiveCamera, {
      fov: 45, near: 1, far: 1000,
      matrix: fM4({ tx: -12.5, ty: -12.5, tz: 6, rz: -PI/4 }).rotateX(0.40*PI),
      matrixWorldNeedsUpdate: true,
    })
    
    this.gltf_loader = new GLTFLoader()
    
    /////////////////
    // Other Setup //
    /////////////////
    
    this.fs_command = new helpers.DenCommand('maximize.svg', 'Fullscreen',
    () => {
      if(document.fullscreenElement) document.exitFullscreen()
      else this.requestFullscreen()
    })
    
    ui_panels.shaderChanger.scene = this.generated_meshes
    ui_panels.shaderChanger.on('change', () => this.renderNeeded = true)
    
    ////////////////////////
    // Internal DOM Setup //
    ////////////////////////
    
    this.shadow = this.attachShadow({ mode: 'closed' })
    
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(`
    :host {
      background: #000;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 16px;
      color: #ddd;
      line-height: 1.42857143;
    }
    
    canvas {
      position: absolute;
      left: 36px;
    }
    
    #sidebar {
      position: absolute;
      width: 36px;
      height: 100%;
      z-index: 2;
      padding: 0;
      background: #000;
      /* This nulls out the tab selection box */
      outline: none;
      overflow-x: hidden;
      overflow-y: auto;
    }
    
    #sidebar > den-command-slot {
      border-bottom: 1px solid #444;
    }
    
    den-panel {
      position: absolute;
      left: 36px;
      top: 0;
      width: 324px;
      z-index: 2;
      min-height: 24px;
      max-height: calc(100% - 24px);
      overflow: auto;
      background: rgba(0, 0, 0, 0.75);
    }
    `)
    this.shadow.adoptedStyleSheets = [helpers.default_style, sheet]
    
    this.controls = new THREE_Den.FreeControls(this.camera, {
      keyElement: this,
      mouseElement: this.renderer.domElement,
      panMouseSpeed: 0.05, dollySpeed: 5,
    })
    this.controls.on('change', () => this.renderNeeded = true)
  }
  
  render() {
    this.shadow.replaceChildren(
      this.renderer.domElement,
      fE('div', { id: 'sidebar', tabIndex: 1, accessKey: '1' }, [
        fE('den-command-slot', { key: '1',
          command: ui_panels.helpPanel.command }),
        fE('den-command-slot', { key: '2',
          command: ui_panels.shaderPanel.command }),
        fE('den-command-slot', { key: '3',
          command: this.fs_command }),
        fE('den-command-slot', { key: '4' }),
        fE('den-command-slot', { key: '5' }),
        fE('den-command-slot', { key: '6' }),
        fE('den-command-slot', { key: '7' }),
        fE('den-command-slot', { key: '8',
          command: ui_panels.shaderPanel.toggles.local }),
        fE('den-command-slot', { key: '9',
          command: ui_panels.shaderPanel.toggles.ghost }),
        fE('den-command-slot', { key: '0' }),
      ]),
      ui_panels.helpPanel,
      ui_panels.shaderPanel,
    )
    
    // Needed to allow event listeners that return focus to this component when
    // a focus element with the shadow DOM is removed
    this.tabIndex = 0
    
    this.shadow.querySelector('#sidebar').title = 'Sidebar\n\nKey: ' +
      this.shadow.querySelector('#sidebar').accessKeyLabel
    
    this.keyCodesToSlots = {}
    this.shadow.querySelectorAll('#sidebar > den-command-slot').forEach(v => {
      this.keyCodesToSlots[v.key.charCodeAt(0)] = v
    })
  }
  
  async connectedCallback() {
    this.render()
    
    // Custom attributes set in HTML must be explicitly applied
    this._apply_dimensions()
    
    this.addEventListener('keydown', e => {
      const slot = this.keyCodesToSlots[e.keyCode]
      if(!e.altKey && !e.ctrlKey && !e.shiftKey && slot) slot.click()
    })
    
    document.addEventListener('fullscreenchange', () => {
      this.fs_command.enabled = document.fullscreenElement === this
      this._apply_dimensions()
    })
    
    this.renderer.setAnimationLoop(() => {
      if(!this.renderNeeded) return
      
      this.renderer.render(this.scene, this.camera)
      this.renderNeeded = false
    })
  }
  
  get width( ) { return this.getAttribute('width'   ) }
  set width(v) { return this.setAttribute('width', v) }
  
  get height( ) { return this.getAttribute('height'   ) }
  set height(v) { return this.setAttribute('height', v) }
  
  get generator( ) { return this.getAttribute('generator'   ) }
  set generator(v) { return this.setAttribute('generator', v) }
  
  _apply_dimensions() {
    const width = this.fs_command.enabled ? window.innerWidth :
      parseInt(this.width)
    const height = this.fs_command.enabled ? window.innerHeight :
      parseInt(this.height)
    
    this.camera.aspect = (width - 36)/height
    this.renderer.setSize(width - 36, height)
    this.style.width = width + 'px'
    this.style.height = height + 'px'
    this.camera.updateProjectionMatrix()
    this.renderNeeded = true
  }
  
  static get observedAttributes() {
    return ['width', 'height', 'generator']
  }
  
  /**
   * @param {string} name
   * @param {string} old_value
   * @param {string} new_value
   */
  attributeChangedCallback(name, _old_value, new_value) {
    if(name === 'width' || name === 'height') this._apply_dimensions()
    if(name === 'generator') this._apply_generator(new_value)
  }
  
  async init() {
    this.paraforge = new paraforge.Paraforge(0)
    await this.paraforge.init()
  }
  
  async update_scene() {
    const glb = await this.paraforge.serialize()
    this.gltf_loader.parse(glb.buffer, '', gltf => {
      this.generated_meshes.remove(this.generated_model)
      this.generated_meshes.add(this.generated_model = gltf.scene)
      this.renderNeeded = true
    }, e => { throw e })
  }
}
customElements.define('paraforge-viewer', ParaforgeViewer)
