import * as THREE from 'three'

/**
 * Daisy-chainable THREE.Object3D maker
 * 
 * If an array is supplied as the second argument, it is interpreted as children
 * instead of properties
 * 
 * Position, euler, quaternion, and scale properties receive special handling to
 * allow setting them with plain arrays. Matrix property receives special
 * handling to disable Three's matrix auto update
 * 
 * @param {function | THREE.Object3D} type
 * @param {Object} properties
 * @param {THREE.Object3D[]} children
 * @returns {THREE.Object3D}
 */
export function f3D(type, properties={}, children=[]) {
  if(properties instanceof Array) {
    children = properties.concat(children)
    properties = {}
  }
  
  /** @type {THREE.Object3D} */
  const o3D = typeof type === 'function' ? new type() : type
  
  // Euler is processed before quaternion, so that if both are supplied
  // quaternion will overwrite euler
  if(properties.euler) {
    switch(properties.euler.constructor) {
      case Array:
        const euler = new THREE.Euler().fromArray(properties.euler)
        o3D.quaternion.setFromEuler(euler)
        break
      case THREE.Euler:
        o3D.quaternion.setFromEuler(properties.euler)
        break
      default:
        throw new Error('properties.euler must be an Array or THREE.Euler')
    }
    
    delete properties.euler
  }
  
  for(let key of ['position', 'quaternion', 'scale']) {
    if(!(key in properties)) continue
    
    switch(properties[key].constructor) {
      case Array               : o3D[key].fromArray(properties[key]); break
      case o3D[key].constructor: o3D[key].copy     (properties[key]); break
      default: throw new Error(`properties.${key} must be an Array or ` +
        `THREE.${o3D[key].constructor.name}`)
    }
    
    delete properties[key]
  }
  
  if(properties.matrix) o3D.matrixAutoUpdate = false
  
  for(const key in properties) {
    o3D[key] = properties[key]
  }
  
  if(children.length) o3D.add(...children)
  return o3D
}
// Backwards compatibility, remove when stuff that refers to forgeObject3D is
// refactored
export const forgeObject3D = f3D

/**
 * Appends result of daisy-chainable element maker f3D() as child object
 * 
 * @param {function | THREE.Object3D} type
 * @param {Object} properties
 * @param {THREE.Object3D[]} children
 * @returns {THREE.Object3D}
 */
THREE.Object3D.prototype.f3D = function() {
  const result = f3D(...arguments)
  this.add(result)
  return result
}

// forgeObject3D specialized for making meshes. Expects clonable meshes/groups to be prepared in advance
// forgeMesh.meshes.yourMesh = someMesh;
// forgeMesh('yourMesh', {position: [-5, 0, 5]}, [child_one, child_two]);
// Probably going to get rid of this when I refactor castleMap.js, in favor of
// passing o3Ds straight into f3D. Really this function is probably only around
// because it mimiks the old structure I used for the meshmaker, which is now
// long obsolete
// The .clone() call should probably be moved into f3D, but castleMap's current
// layout makes that difficult
export function forgeMesh(meshKey, properties, children) {
  if(forgeMesh.meshes[meshKey] == null) {
    throw new Error('No mesh in THREE_Densaugeo.forgeMesh.meshes for mesh name "' + meshKey + '".');
  }
  
  return forgeObject3D(forgeMesh.meshes[meshKey].clone(), properties, children);
}
forgeMesh.meshes = {};

THREE.Vector3.prototype.rotateZ90 = function(count) {
  let previous_x
  
  for(let i = 0; i < count % 4; ++i) {
    previous_x = this.x
    
    this.x = -this.y
    this.y = previous_x
  }
  
  return this
}

// THREE.Matrix4 manipulators. Most of these used to be in THREE, but were removed
// (probably to reduce file size)
THREE.Matrix4.prototype.translateX = function(x) {var a = this.elements; a[12] += a[0]*x; a[13] += a[1]*x; a[14] += a[ 2]*x; return this}
THREE.Matrix4.prototype.translateY = function(y) {var a = this.elements; a[12] += a[4]*y; a[13] += a[5]*y; a[14] += a[ 6]*y; return this}
THREE.Matrix4.prototype.translateZ = function(z) {var a = this.elements; a[12] += a[8]*z; a[13] += a[9]*z; a[14] += a[10]*z; return this}

THREE.Matrix4.prototype.rotateX = function(angle) {
  var te = this.elements;
  
  var m12 = te[4];
  var m22 = te[5];
  var m32 = te[6];
  var m42 = te[7];
  var m13 = te[8];
  var m23 = te[9];
  var m33 = te[10];
  var m43 = te[11];
  
  var c = Math.cos( angle );
  var s = Math.sin( angle );
  
  te[4] = c * m12 + s * m13;
  te[5] = c * m22 + s * m23;
  te[6] = c * m32 + s * m33;
  te[7] = c * m42 + s * m43;
  
  te[8] = c * m13 - s * m12;
  te[9] = c * m23 - s * m22;
  te[10] = c * m33 - s * m32;
  te[11] = c * m43 - s * m42;
  
  return this;
}

THREE.Matrix4.prototype.rotateY = function(angle) {
  var te = this.elements;
  
  var m11 = te[0];
  var m21 = te[1];
  var m31 = te[2];
  var m41 = te[3];
  var m13 = te[8];
  var m23 = te[9];
  var m33 = te[10];
  var m43 = te[11];
  
  var c = Math.cos( angle );
  var s = Math.sin( angle );
  
  te[0] = c * m11 - s * m13;
  te[1] = c * m21 - s * m23;
  te[2] = c * m31 - s * m33;
  te[3] = c * m41 - s * m43;
  
  te[8] = c * m13 + s * m11;
  te[9] = c * m23 + s * m21;
  te[10] = c * m33 + s * m31;
  te[11] = c * m43 + s * m41;
  
  return this;
}

THREE.Matrix4.prototype.rotateZ = function (angle) {
  var te = this.elements;
  
  var m11 = te[0];
  var m21 = te[1];
  var m31 = te[2];
  var m41 = te[3];
  var m12 = te[4];
  var m22 = te[5];
  var m32 = te[6];
  var m42 = te[7];
  
  var c = Math.cos( angle );
  var s = Math.sin( angle );
  
  te[0] = c * m11 + s * m12;
  te[1] = c * m21 + s * m22;
  te[2] = c * m31 + s * m32;
  te[3] = c * m41 + s * m42;
  
  te[4] = c * m12 - s * m11;
  te[5] = c * m22 - s * m21;
  te[6] = c * m32 - s * m31;
  te[7] = c * m42 - s * m41;
  
  return this;
}

THREE.Matrix4.prototype.equals = function(m) {
  var r = true, a = this.elements, b = m.elements;
  
  for(var i = 0, endi = 16; i < endi; ++i) {
    r = r && a[i] === b[i];
  }
  
  return r;
}

/**
 * @param {Object} a
 * @returns {THREE.Matrix4}
 */
THREE.Matrix4.prototype.forge = function(a) {
  var tx = a.tx || 0, ty = a.ty || 0, tz = a.tz || 0;
  var θx = a.rx || 0, θy = a.ry || 0, θz = a.rz || 0;
  var sx = a.sx || 1, sy = a.sy || 1, sz = a.sz || 1;
  
  var e = this.elements;
  var sin = Math.sin;
  var cos = Math.cos;
  
  e[0] = sx*cos(θy)*cos(θz);
  e[1] = sx*sin(θx)*sin(θy)*cos(θz) + sx*cos(θx)*sin(θz);
  e[2] = sx*sin(θx)*sin(θz) - sx*cos(θx)*sin(θy)*cos(θz);
  e[3] = 0;
  
  e[4] = -sy*cos(θy)*sin(θz);
  e[5] = sy*cos(θx)*cos(θz) - sy*sin(θx)*sin(θy)*sin(θz);
  e[6] = sy*sin(θx)*cos(θz) + sy*cos(θx)*sin(θy)*sin(θz);
  e[7] = 0;
  
  e[8] = sz*sin(θy);
  e[9] = -sz*sin(θx)*cos(θy);
  e[10] = sz*cos(θx)*cos(θy);
  e[11] = 0;
  
  e[12] = tx;
  e[13] = ty;
  e[14] = tz;
  e[15] = 1;
  
  return this;
}

/**
 * @param {Object} options
 * @returns {THREE.Matrix4}
 */
export const fM4 = function(options) {
  return new THREE.Matrix4().forge(options);
}

// keyElement            - Event target for keyup/down events
// mouseElement          - Event target for mouse / touch / scroll whell events
// panKeySpeed           - Units/ms
// panMouseSpeed         - Units/px
// rotationKeySpeed      - Radians/ms
// rotationMouseSpeed    - Radians/px
// rotationAccelSpeed    - Radians/radian
// dollySpeed            - Units/click
// touchThrottleSpeed    - Units/ms per px displaced
// joystickPanSpeed      - Units/ms per fraction displaced
// joystickRotSpeed      - Radians/ms per fraction displaced
// joystickThrottleSpeed - Units/ms per fraction displaced

export function FreeControls(camera, options) {
  var self = this;
  
  const { keyElement, mouseElement } = options
  
  if(keyElement == null) {
    throw new TypeError('options.keyElement must be supplied')
  }
  if(mouseElement == null) {
    throw new TypeError('options.mouseElement must be supplied')
  }
  
  for(var i in options) {
    this[i] = options[i];
  }
  
  camera.matrixAutoUpdate = false;
  camera.rotation.order = 'ZYX';
  
  var inputs = {}; // This particular ; really is necessary
  
  keyElement.addEventListener('keydown', function(e) {
    // Added later mainly to prevent arrow key events inside viewer elemnts
    // from scrolling the page they're on. Should move the watched keys onto
    // their own object whenever I refactor FreeControls
    if(!e.altKey && !e.ctrlKey && !e.shiftKey) {
      for(const key in self) {
        if(key.slice(0, 3) === 'key' && self[key] === e.keyCode) {
          e.preventDefault()
        }
      }
      
      inputs[e.keyCode] = true;
    }
  });
  
  keyElement.addEventListener('keyup', function(e) {
    delete inputs[e.keyCode];
  });
  
  // FF doesn't support standard mousewheel event
  mouseElement.addEventListener('mousewheel', function(e) {
    e.preventDefault()
    camera.matrix.translateZ(-e.wheelDelta*self.dollySpeed/360);
  });
  mouseElement.addEventListener('DOMMouseScroll', function(e) {
    e.preventDefault()
    camera.matrix.translateZ(e.detail*self.dollySpeed/3);
  });
  
  // Context menu interferes with mouse control
  mouseElement.addEventListener('contextmenu', function(e) {
    e.preventDefault();
  });
  
  // Only load mousemove handler while mouse is depressed
  mouseElement.addEventListener('mousedown', function(e) {
    if(e.shiftKey) {
      var requestPointerLock = mouseElement.requestPointerLock || mouseElement.mozRequestPointerLock || mouseElement.webkitRequestPointerLock;
      requestPointerLock.call(mouseElement);
    } else if(e.which === 1) {
      mouseElement.addEventListener('mousemove', mousePanHandler);
    } else if(e.which === 3) {
      mouseElement.addEventListener('mousemove', mouseRotHandler);
    }
  });
  
  mouseElement.addEventListener('mouseup', function() {
    mouseElement.removeEventListener('mousemove', mousePanHandler);
    mouseElement.removeEventListener('mousemove', mouseRotHandler);
  });
  
  mouseElement.addEventListener('mouseleave', function() {
    mouseElement.removeEventListener('mousemove', mousePanHandler);
    mouseElement.removeEventListener('mousemove', mouseRotHandler);
  });
  
  var pointerLockHandler = function(e) {
    var pointerLockElement = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement;
    
    if(pointerLockElement === mouseElement) {
      document.addEventListener('mousemove', mouseRotHandler);
    } else {
      document.removeEventListener('mousemove', mouseRotHandler);
    }
  }
  
  document.addEventListener('pointerlockchange'      , pointerLockHandler);
  document.addEventListener('mozpointerlockchange'   , pointerLockHandler);
  document.addEventListener('webkitpointerlockchange', pointerLockHandler);
  
  var mousePanHandler = function(e) {
    translateX += (e.movementX || e.mozMovementX || e.webkitMovementX || 0)*self.panMouseSpeed;
    translateY -= (e.movementY || e.mozMovementY || e.webkitMovementY || 0)*self.panMouseSpeed;
  }
  
  var mouseRotHandler = function(e) {
    rotateGlobalZ -= (e.movementX || e.mozMovementX || e.webkitMovementX || 0)*self.rotationMouseSpeed;
    rotateX       -= (e.movementY || e.mozMovementY || e.webkitMovementY || 0)*self.rotationMouseSpeed;
  }
  
  // Touchmove events do not work when directly added, they have to be added by a touchstart listener
  // I think this has to do with the default touch action being scrolling
  mouseElement.addEventListener('touchstart', function(e) {
    e.preventDefault();
    
    if(e.touches.length === 1) {
      accelActive = true;
      
      var rect = mouseElement.getBoundingClientRect();
      var lateralFraction = (e.touches[0].clientX - rect.left)/rect.width;
      
      if(lateralFraction < 0.9) {
        touchZeroPrevious = e.touches[0];
        mouseElement.addEventListener('touchmove', TouchHandler);
      } else {
        throttleZero = e.touches[0].clientY;
        mouseElement.addEventListener('touchmove', touchThrottleHandler);
      }
    } else if(e.touches.length === 2) {
      touchOnePrevious = e.touches[1];
    }
  });
  
  mouseElement.addEventListener('touchend', function(e) {
    if(e.touches.length === 0) {
      mouseElement.removeEventListener('touchmove', TouchHandler);
      mouseElement.removeEventListener('touchmove', touchThrottleHandler);
      touchThrottle = rotationRatePitch = rotationRateYaw = rotationRateRoll = 0;
      accelActive = false;
    }
  });
  
  var TouchHandler = function(e) {
    e.preventDefault(); // Should be called at least on every touchmove event
    
    if(touchZeroPrevious) {
      translateX += (e.touches[0].clientX - touchZeroPrevious.clientX)*self.  panTouchSpeed;
      translateY -= (e.touches[0].clientY - touchZeroPrevious.clientY)*self.  panTouchSpeed;
    }
    
    touchZeroPrevious = e.touches[0];
    
    if(e.touches.length === 2) {
      if(touchOnePrevious) {
        rotateX       -= (e.touches[1].clientY - touchOnePrevious.clientY)*self.rotatationTouchSpeed;
        rotateGlobalZ -= (e.touches[1].clientX - touchOnePrevious.clientX)*self.rotatationTouchSpeed;
      }
      
      touchOnePrevious = e.touches[1];
    }
  }
  
  var touchThrottleHandler = function(e) {
    e.preventDefault(); // Should be called at least on every touchmove event
    
    if(throttleZero) {
      touchThrottle = (e.touches[0].clientY - throttleZero)*self.touchThrottleSpeed;
    }
    
    if(e.touches.length === 2) {
      translateX += (e.touches[1].clientX - touchOnePrevious.clientX)*self.panTouchSpeed;
      translateY -= (e.touches[1].clientY - touchOnePrevious.clientY)*self.panTouchSpeed;
      
      touchOnePrevious = e.touches[1];
    }
  }
  
  screen.orientation.addEventListener('change', () => {
    touchZeroPrevious = null
    touchOnePrevious = null
    throttleZero = null
    
    const orientation = getOrientation()
    camera.matrix.multiply(new THREE.Matrix4().makeRotationZ(
      Math.PI/180*(orientationPrevious - orientation)
    ))
    orientationPrevious = orientation
  })
  
  var rotationRateConversion = 0.000017453292519943296;
  
  // Browser detection shim for Chome, since they use different units for DeviceRotationRate without
  // providing any documentation or other way of detecting what units are being used
  if(window.chrome) {
    rotationRateConversion = 0.001;
  }
  
  var accelHandler = function(e) {
    if(accelActive) {
      var orientation = getOrientation()
      
      // Constant = Math.PI/180/1000
      if(orientation === 0) {
        rotationRatePitch = -e.rotationRate.alpha*rotationRateConversion*self.rotationAccelSpeed;
        rotationRateYaw   =  e.rotationRate.beta *rotationRateConversion*self.rotationAccelSpeed;
      } else if(orientation === 90)  {
        rotationRateYaw   =  e.rotationRate.alpha*rotationRateConversion*self.rotationAccelSpeed;
        rotationRatePitch =  e.rotationRate.beta *rotationRateConversion*self.rotationAccelSpeed;
      } else {
        rotationRateYaw   = -e.rotationRate.alpha*rotationRateConversion*self.rotationAccelSpeed;
        rotationRatePitch = -e.rotationRate.beta *rotationRateConversion*self.rotationAccelSpeed;
      }
      rotationRateRoll  = e.rotationRate.gamma*rotationRateConversion*self.rotationAccelSpeed;
    }
  }
  
  var getOrientation = () => {
    let orientation = screen.orientation.angle
    if(navigator.userAgent.includes('iPhone')) orientation = 360 - orientation
    return orientation % 360
  }
  
  // Attach devicemotion listener on startup because attaching it during a touchstart event is horribly buggy in FF. Except on iPhone, then permission has to be requested (which is also inconsistent)
  if(typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    mouseElement.addEventListener('touchend', () => {
      DeviceMotionEvent.requestPermission().then((a, b, c) => {
        if(a === 'denied') alert(
          'Accelerometer permissions denied, touch-look disabled.' +
          location.protocol === 'https:' ? '' :
          '\n\nNOTE: HTTPS needed to use DeviceMotionEvent in Safari.'
        )
        
        window.addEventListener('devicemotion', accelHandler);
      });
    }, { 'once': true });
  } else {
    // This gets a deprecation warning in Firefox. However, the associated MDN
    // page shows it is not deprecated. A StackOverflow discussion suggests the
    // notice is due to some issue with the W3C standard being technically
    // unmaintained but also still the standard. In any case, the notice has
    // been present for at least 6 years and the devicemotion event still shows
    // no signs of going away
    // 
    // MDN page: https://developer.mozilla.org/en-US/docs/Web/API/Window/devicemotion_event
    // StackOverflow thread: https://stackoverflow.com/questions/51110881/use-of-deviceorientation-events-in-firefox-give-warning
    window.addEventListener('devicemotion', accelHandler);
  }
  
  var gamepads = [];
  
  window.addEventListener('gamepadconnected', function(e) {
    gamepads.push(e.gamepad.index);
  });
  
  window.addEventListener('gamepaddisconnected', function(e) {
    if(gamepads.indexOf(e.gamepad) > -1) {
      gamepads.splice(gamepads.indexOf(e.gamepad), 1);
    }
  });
  
  var touchZeroPrevious;
  var touchOnePrevious;
  var orientationPrevious = getOrientation();
  var throttleZero, touchThrottle = 0;
  var rotationRatePitch = 0, rotationRateYaw = 0, rotationRateRoll = 0, accelActive = false;
  
  var timePrevious = Date.now();
  var time = 0;
  
  // Working variables for camLoop
  var translateX = 0, translateY = 0, translateZ = 0, translateGlobalZ = 0;
  var rotateX = 0, rotateY = 0, rotateZ = 0, rotateGlobalZ = 0, gp, axes;
  
  var camLoop = function() {
    time = Date.now() - timePrevious;
    timePrevious += time;
    
    if(inputs[self.keyStrafeLeft ]) translateX       -= time*self.panKeySpeed;
    if(inputs[self.keyStrafeRight]) translateX       += time*self.panKeySpeed;
    if(inputs[self.keyForward    ]) translateZ       -= time*self.panKeySpeed;
    if(inputs[self.keyBackward   ]) translateZ       += time*self.panKeySpeed;
    if(inputs[self.keyStrafeUp   ]) translateGlobalZ += time*self.panKeySpeed;
    if(inputs[self.keyStrafeDown ]) translateGlobalZ -= time*self.panKeySpeed;
    if(inputs[self.keyTurnUp     ]) rotateX          += time*self.rotationKeySpeed;
    if(inputs[self.keyTurnDown   ]) rotateX          -= time*self.rotationKeySpeed;
    if(inputs[self.keyTurnLeft   ]) rotateGlobalZ    += time*self.rotationKeySpeed;
    if(inputs[self.keyTurnRight  ]) rotateGlobalZ    -= time*self.rotationKeySpeed;
    
    for(var i = 0, endi = gamepads.length; i < endi; ++i) {
      gp = navigator.getGamepads()[i];
      axes = gp.axes;
      
      if(gp.mapping === '') {
        if(Math.abs(axes[0]) > 0.05) translateX    += axes[0]*time*self.joystickPanSpeed;
        if(Math.abs(axes[1]) > 0.05) translateY    -= axes[1]*time*self.joystickPanSpeed;
        if(Math.abs(axes[3]) > 0.05) rotateGlobalZ -= axes[3]*time*self.joystickRotSpeed;
        if(Math.abs(axes[4]) > 0.05) rotateX       -= axes[4]*time*self.joystickRotSpeed;
        
        if(axes[2] > -0.95 || axes[5] > -0.95) translateZ -= (axes[5] - axes[2])*time*self.joystickThrottleSpeed/2;
      } else if(gp.mapping === 'standard') {
        if(Math.abs(axes[0]) > 0.05) translateX    += axes[0]*time*self.joystickPanSpeed;
        if(Math.abs(axes[1]) > 0.05) translateY    -= axes[1]*time*self.joystickPanSpeed;
        if(Math.abs(axes[2]) > 0.05) rotateGlobalZ -= axes[2]*time*self.joystickRotSpeed;
        if(Math.abs(axes[3]) > 0.05) rotateX       -= axes[3]*time*self.joystickRotSpeed;
        
        if(gp.buttons[6].value > 0.025 || gp.buttons[7].value > 0.025) translateZ -= (gp.buttons[7].value - gp.buttons[6].value)*time*self.joystickThrottleSpeed;
      }
    }
    
    if(translateX) {
      camera.matrix.translateX(translateX);
    }
    
    if(translateY) {
      camera.matrix.translateY(translateY);
    }
    
    if(translateZ || touchThrottle) {
      camera.matrix.translateZ(translateZ + time*touchThrottle);
    }
    
    if(translateGlobalZ) {
      camera.matrix.elements[14] += translateGlobalZ;
    }
    
    if(rotateX || rotationRatePitch) {
      camera.matrix.multiply(new THREE.Matrix4().makeRotationX(rotateX - time*rotationRatePitch));
    }
    
    if(rotateY || rotationRateYaw) {
      camera.matrix.multiply(new THREE.Matrix4().makeRotationY(rotateY + time*rotationRateYaw));
    }
    
    if(rotateZ || rotationRateRoll) {
      camera.matrix.multiply(new THREE.Matrix4().makeRotationZ(rotateZ + time*rotationRateRoll));
    }
    
    if(rotateGlobalZ) {
      // Global Z rotation retains global position
      var position = THREE.Vector3.prototype.setFromMatrixPosition(camera.matrix);
      camera.matrix.multiplyMatrices(new THREE.Matrix4().makeRotationZ(rotateGlobalZ), camera.matrix);
      camera.matrix.setPosition(position);
    }
    
    camera.matrixWorldNeedsUpdate = true;
    
    requestAnimationFrame(camLoop);
    
    translateX = translateY = translateZ = translateGlobalZ = rotateX = rotateY = rotateZ = rotateGlobalZ = 0;
  }
  camLoop();
}
FreeControls.prototype.panKeySpeed = 0.01;
FreeControls.prototype.rotationKeySpeed = 0.001;
FreeControls.prototype.panMouseSpeed = 0.1;
FreeControls.prototype.rotationMouseSpeed = 0.002;
FreeControls.prototype.panTouchSpeed = 0.1;
FreeControls.prototype.rotatationTouchSpeed = 0.002;
FreeControls.prototype.rotationAccelSpeed = 1;
FreeControls.prototype.dollySpeed = 1;
FreeControls.prototype.touchThrottleSpeed = 0.0005;
FreeControls.prototype.joystickPanSpeed = 0.05;
FreeControls.prototype.joystickRotSpeed = 0.003;
FreeControls.prototype.joystickThrottleSpeed = 0.05;
FreeControls.prototype.keyTurnLeft = 37; // Left arrow
FreeControls.prototype.keyTurnRight = 39; // Right arrow
FreeControls.prototype.keyTurnUp = 38; // Up arrow
FreeControls.prototype.keyTurnDown = 40; // Down arrow
FreeControls.prototype.keyStrafeLeft = 65; // A
FreeControls.prototype.keyStrafeRight = 68; // D
FreeControls.prototype.keyStrafeUp = 69; // E
FreeControls.prototype.keyStrafeDown = 67; // C
FreeControls.prototype.keyForward = 87; // W
FreeControls.prototype.keyBackward = 83; // S

/**
 * @module THREE_Densaugeo.IntObject inherits THREE.Object3D
 * @description Clickable object for three.js scenes
 * 
 * @example var clickable = new THREE_Densaugeo.IntObject({name: 'Clickable'});
 * @example clickable.select.forge({sx: 4, sy: 4});
 * @example clickable.controls.Click = function() {alert('You clicked me!')}
 */
export class IntObject extends THREE.Object3D {
  constructor(options) {
    super(options);
    
    // @prop Object controls -- An index of the functions to be controlled by a UI element
    this.controls = {};
    
    // @prop THREE.Matrix4 select -- Matrix transform for visual indication object added by THREE_Densaugeo.Picker
    // @option THREE.Matrix4 select -- Sets .indicatorMatrix
    this.select = options && options.select || new THREE.Matrix4();
    
    // @option String name -- Sets .name inherited from THREE.Object3D
    if(options && options.name) {
      this.name = options.name;
    }
  }
}

/**
 * @module THREE_Densaugeo.Picker inherites EventEmitter
 * @description Allows selecting objects in a three.js scene by clicking on meshes
 * 
 * @example var picker = new THREE_Densaugeo.Picker();
 * @example someRenderer.domElement.addEventListener('click', picker.clickHandler);
 * @example picker.intObjects.push(someClickableObject);
 * @example picker.on('select', function(e) {console.log('Selected: ');console.log(e.target)});
 */
export class Picker extends EventTarget {
  constructor(options) {
    super()
  
  var self = this;
  
  // @prop THREE.WebGLRenderer renderer -- May be an empty object if not set
  this.renderer = {};
  
  this.camera = {}
  
  // @prop [THREE_Densaugeo.IntObject] intObjects -- Objects which can be picked (interacted with)
  this.intObjects = [];
  
  // @prop THREE_Densaugeo.IntObject currentlySelected -- As the name suggests (undefined if no object is selected)
  this.currentlySelected = undefined;
  
  // @prop THREE.Mesh indicator -- three.js object appended to selection to provide a visual cue
  // @option THREE.Mesh indicator -- Sets .indicator
  this.indicator = options && options.indicator || new THREE.Mesh(new THREE.RingGeometry(1.1, 1.2, 16), new THREE.MeshBasicMaterial({color: 0x00FFFF, side: THREE.DoubleSide}));
  this.indicator.matrixAutoUpdate = false;
  
  // @method undefined unselect() -- Unselects current object
  // @event unselect {} -- Fired after unselecting
  this.unselect = function() {
    if(self.currentlySelected) {
      self.currentlySelected.remove(self.indicator);
    }
    
    self.currentlySelected = undefined;
    
    self.emit('unselect');
  }
  
  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();
  
  // @method undefined clickHandler(e) -- Handles click events; scans a three.js scene
  // @event select {THREE_Densaugeo.IntObject target} -- Emitted when a target's child mesh has been clicked
  this.clickHandler = function(e) {
    e.preventDefault();
    
    var boundingRect = self.renderer.domElement.getBoundingClientRect();
    
    mouse.x = (e.clientX - boundingRect.left)/boundingRect.width*2 - 1;
    mouse.y = (boundingRect.top - e.clientY)/boundingRect.height*2 + 1;
    
    raycaster.setFromCamera(mouse, self.camera);
    
    var intersections = raycaster.intersectObjects(self.intObjects, true);
    
    if(intersections.length > 0) {
      var target = intersections[0].object;
      
      while(!(target instanceof IntObject)) {
        target = target.parent;
      }
      
      if(self.currentlySelected) {
        self.currentlySelected.remove(self.indicator);
      }
      
      self.currentlySelected = target;
      self.indicator.matrix.copy(target.select);
      target.add(self.indicator);
      
      self.emit('select', {selection: target});
    }
  }
  
  // @method undefined touchHandler(e) -- Maps touch events onto click events. Uses touchstart's first detected touch
  this.touchHandler = function(e) {
    if(e.touches.length > 0) {
      e.clientX = e.touches[0].clientX;
      e.clientY = e.touches[0].clientY;
      
      self.clickHandler(e);
    }
  }
  
  // @method undefined setRenderer() -- Attach a three.js renderer
  this.setRenderer = function(renderer) {
    self.renderer = renderer;
    
    renderer.domElement.addEventListener('click', self.clickHandler);
    renderer.domElement.addEventListener('touchstart', self.touchHandler);
  }
  }
}

/**
 * @module THREE.Raycaster
 * @description Bug fix for camera matrix handling. No, upstream won't accept the patch, because "users shouldn't use matrix transforms" WTF?!!!!
 */
// @method proto undefined setFromCamera(THREE.Vector2 coords, THREE.Camera camera) -- Responds correctly to cameras with mutated matrices
THREE.Raycaster.prototype.setFromCamera = function ( coords, camera ) {
  // camera is assumed _not_ to be a child of a transformed object
  if ( camera instanceof THREE.PerspectiveCamera ) {
    this.ray.origin.setFromMatrixPosition(camera.matrix);
    this.ray.direction.set( coords.x, coords.y, 0.5 ).unproject( camera ).sub( this.ray.origin ).normalize();
  } else if ( camera instanceof THREE.OrthographicCamera ) {
    this.ray.origin.set( coords.x, coords.y, - 1 ).unproject( camera );
    this.ray.direction.set( 0, 0, - 1 ).transformDirection( camera.matrixWorld );
  } else {
    console.error( 'THREE.Raycaster: Unsupported camera type.' );
  }
}

THREE.Vector3.prototype.fromColor = function(/*THREE.Color*/ a) {
  this.x = a.r;
  this.y = a.g;
  this.z = a.b;
  
  return this;
}

// Expects string as comma-separated numbers
THREE.Vector3.prototype.fromString = function(/*string*/ a) {
  var b = a.split(',');
  
  this.x = Number(b[0]);
  this.y = Number(b[1]);
  this.z = Number(b[2]);
  
  return this;
}

THREE.Vector3.prototype.toString = function() {
  return this.x + ', ' + this.y + ', ' + this.z;
}

THREE.Color.prototype.fromVector3 = function(/*THREE.Vector3*/ a) {
  this.r = a.x;
  this.g = a.y;
  this.b = a.z;
  
  return this;
}

// Expects string in hex format
THREE.Color.prototype.fromString = function(/*string*/ a) {
  return this.copy(new THREE.Color(a));
}

THREE.Color.prototype.toString = function() {
  return '#' + this.getHexString().toUpperCase();
}

/**
 * A collection of shaders:
 * 
 * WaterMaterial      - Basic water material, includes transparency, phong shading, and wave-like surafce distortion
 * CoordinateMaterial - Shader for showing a coordinate grid
 * PositionMaterial   - Sets colors based on position
 * NormalMaterial     - Sets colors based on normal vector
 * PsychMaterial      - Psychedelic shader
 * 
 * To create a material:
 * var yourMaterial = new THREE_Densaugeo.WaterMaterial(options);
 * 
 * Surface distortion on the WaterMaterial and motion on the PsychMaterial require adding this line to your render loop:
 * yourMaterial.tick(seconds_since_last_loop);
 * 
 * All THREE.ShaderMaterial options are supported
 * 
 * Additional options:
 * Material                  Type          Name            Description
 * -------------------------------------------------------------------
 * All                       Number         alpha        - Opacity
 * 
 * All except WaterMaterial  Number         local        - If zero, use global coordinates. Else use local coordinates
 * 
 * WaterMaterial             THREE.Vector3  sunDirection - Direction of light for specular lighting
 *                           THREE.Color    ambient      - Phong ambient color
 *                           THREE.Color    diffuse      - Phong diffuse color
 *                           THREE.Color    specular     - Phong specular color
 * 
 * CoordinateMaterial        THREE.Vector3  showAxes     - Basically three 'boolean' numbers
 *                           THREE.Vector3  axisWeight   - Color fade distance from center of each axis to zero
 *                           THREE.Vector3  showGrid     - Basically three 'boolean' numbers
 *                           THREE.Vector3  gridWeight   - Color fade distance from center of each gridline to zero
 *                           THREE.Vector3  gridSpacing  - Spacing for each grid dimension
 * 
 * PositionMaterial          THREE.Vector3  fadeDistance - Distance along an axis to fade its associated color from one to zero
 * 
 * NormalMaterial            Number         mode         - Changes how colors are calculated, not sure how to describe
 * 
 * PsychMaterial             THREE.Vector3  wavelength   - Distance along each axes between its associated color peaks
 *                           THREE.Vector3  frequency    - Frequency of color peaks as they travel along each axis
 * 
 * If you change any of the additional options after instantiation, changes will take effect after calling .updateUniforms()
 */
export class WaterMaterial extends THREE.ShaderMaterial {
  constructor(/*Object*/ options) {
    super();
    
    this.type = 'WaterMaterial';
    
    this.vertexShader   = THREE.ShaderLib.densWater.vertexShader;
    this.fragmentShader = THREE.ShaderLib.densWater.fragmentShader;
    this.transparent = true;
    this.alpha = 0.8
    this.sunDirection = new THREE.Vector3(4, 4, 10);
    this.ambient  = new THREE.Color(0x050A14);
    this.diffuse  = new THREE.Color(0x193366);
    this.specular = new THREE.Color(0x193366);
    
    this.uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.densWater.uniforms);
    this.uniforms.normalSampler.value = new THREE.TextureLoader().load(new URL('waternormals.jpg', import.meta.url).href);
    this.uniforms.normalSampler.value.wrapS = this.uniforms.normalSampler.value.wrapT = THREE.RepeatWrapping;
    
    this.setValues(options);
    this.updateUniforms();
  }
}

WaterMaterial.prototype.updateUniforms = function(values) {
  this.uniforms.alpha.value = this.alpha;
  this.uniforms.sunDirection.value.copy(this.sunDirection).normalize();
  this.uniforms.ambient.value.fromColor(this.ambient);
  this.uniforms.diffuse.value.fromColor(this.diffuse);
  this.uniforms.specular.value.fromColor(this.specular);
}

WaterMaterial.prototype.tick = function(seconds) {
  this.uniforms.time.value += seconds;
}

THREE.ShaderLib.densWater = {
  uniforms: {
    normalSampler: {type: 't', value: null},
    time         : {type: 'f', value: 0},
    alpha        : {type: 'f', value: 0},
    sunDirection: {type: 'v3', value: new THREE.Vector3()},
    ambient     : {type: 'v3', value: new THREE.Vector3()},
    diffuse     : {type: 'v3', value: new THREE.Vector3()},
    specular    : {type: 'v3', value: new THREE.Vector3()},
  },
  
  vertexShader: [
   'varying vec3 worldPosition;',
    
   'void main() {',
     'worldPosition = vec3(modelMatrix*vec4(position,1.0));',
      
     'gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);',
   '}'
  ].join('\n'),
  
  fragmentShader: [
   'uniform sampler2D normalSampler;',
   'uniform float time;',
   'uniform float alpha;',
   'uniform vec3 sunDirection;',
   'uniform vec3 ambient;',
   'uniform vec3 diffuse;',
   'uniform vec3 specular;',
    
   'varying vec3 worldPosition;',
    
   'vec4 getNoise(vec2 uv) {',
     'vec2 uv0 = (uv/51.5)+vec2(time/17.0, time/29.0);',
     'vec2 uv1 = uv/53.5-vec2(time/-19.0, time/31.0);',
     'vec2 uv2 = uv/vec2(448.5, 491.5)+vec2(time/101.0, time/97.0);',
     'vec2 uv3 = uv/vec2(495.5, 438.5)-vec2(time/109.0, time/-113.0);',
     'vec4 noise = (texture2D(normalSampler, uv0)) +',
     '(texture2D(normalSampler, uv1)) +',
     '(texture2D(normalSampler, uv2)) +',
     '(texture2D(normalSampler, uv3));',
     'return noise*0.5-1.0;',
   '}',
    
   'void main() {',
     'vec4 noise = getNoise(worldPosition.xy);',
     'vec3 surfaceNormal = normalize(noise.xyz*vec3(1.0, 1.0, 2.0));',
      
     'float diffuseMag = max(dot(sunDirection, surfaceNormal),0.0);',
      
     'vec3 eyeDirection = normalize(cameraPosition - worldPosition);',
     'vec3 reflection = normalize(reflect(-sunDirection, surfaceNormal));',
     'float direction = max(0.0, dot(eyeDirection, reflection));',
     'float specularMag = pow(direction, 100.0)*4.0;',
      
     'gl_FragColor = vec4(ambient + diffuse*diffuseMag + specular*specularMag, alpha);',
   '}'
  ].join('\n'),
}

export class CoordinateMaterial extends THREE.ShaderMaterial {
  constructor(/*Object*/ options) {
    super();
    
    this.type = 'CoordinateMaterial';
    
    this.vertexShader   = THREE.ShaderLib.densCoordinate.vertexShader;
    this.fragmentShader = THREE.ShaderLib.densCoordinate.fragmentShader;
    this.local = 0;
    this.alpha = 1;
    this.showAxes    = new THREE.Vector3( 1  ,  1  ,  1  );
    this.axisWeight  = new THREE.Vector3( 2  ,  2  ,  2  );
    this.showGrid    = new THREE.Vector3( 1  ,  1  ,  1  );
    this.gridWeight  = new THREE.Vector3( 0.5,  0.5,  0.5);
    this.gridSpacing = new THREE.Vector3(16  , 16  , 16  );
    this.uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.densCoordinate.uniforms);
    
    this.setValues(options);
    this.updateUniforms();
  }
}

CoordinateMaterial.prototype.updateUniforms = function(values) {
  this.uniforms.local.value = this.local;
  this.uniforms.alpha.value = this.alpha;
  this.uniforms.showAxes   .value.copy(this.showAxes   );
  this.uniforms.axisWeight .value.copy(this.axisWeight );
  this.uniforms.showGrid   .value.copy(this.showGrid   );
  this.uniforms.gridWeight .value.copy(this.gridWeight );
  this.uniforms.gridSpacing.value.copy(this.gridSpacing);
}

THREE.ShaderLib.densCoordinate = {
  uniforms: {
    local: {type: 'i', value: 0},
    alpha: {type: 'f', value: 0},
    showAxes   : {type: 'v3', value: new THREE.Vector3()},
    axisWeight : {type: 'v3', value: new THREE.Vector3()},
    showGrid   : {type: 'v3', value: new THREE.Vector3()},
    gridWeight : {type: 'v3', value: new THREE.Vector3()},
    gridSpacing: {type: 'v3', value: new THREE.Vector3()},
  },
  
  vertexShader: [
   'uniform int local;',
    
   'varying vec3 vPosition;',
    
   'void main() {',
     'if(local != 0) {',
       'vPosition = position;',
     '}',
     'else {',
       'vPosition = vec3(modelMatrix*vec4(position,1.0));',
     '}',
      
     'gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);',
   '}'
  ].join('\n'),
  
  fragmentShader: [
   'uniform float alpha;',
   'uniform vec3 showAxes;',
   'uniform vec3 axisWeight;',
   'uniform vec3 showGrid;',
   'uniform vec3 gridWeight;',
   'uniform vec3 gridSpacing;',
    
   'varying vec3 vPosition;',
    
   'void main() {',
     'vec3 result = vec3(0.0);',
      
     'result = showGrid - min(mod(vPosition, gridSpacing), gridSpacing - mod(vPosition, gridSpacing))/gridWeight;',
      
     'result = max(result, showAxes - abs(vPosition)/axisWeight);',
      
     'gl_FragColor = vec4(result, alpha);',
   '}'
  ].join('\n'),
}

export class PositionMaterial extends THREE.ShaderMaterial {
  constructor(/*Object*/ options) {
    super();
    
    this.type = 'PositionMaterial';
    
    this.vertexShader   = THREE.ShaderLib.densPosition.vertexShader;
    this.fragmentShader = THREE.ShaderLib.densPosition.fragmentShader;

    this.local = 0;
    this.alpha = 1;
    this.fadeDistance = new THREE.Vector3(64, 64, 64);
    this.uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.densPosition.uniforms);
    
    this.setValues(options);
    this.updateUniforms();
  }
}

PositionMaterial.prototype.updateUniforms = function(values) {
  this.uniforms.local.value = this.local;
  this.uniforms.alpha.value = this.alpha;
  this.uniforms.fadeDistance.value.copy(this.fadeDistance);
}

THREE.ShaderLib.densPosition = {
  uniforms: {
    local: {type: 'i', value: 0},
    alpha: {type: 'f', value: 0},
    fadeDistance: {type: 'v3', value: new THREE.Vector3()},
  },
  
  vertexShader: THREE.ShaderLib.densCoordinate.vertexShader,
  
  fragmentShader: [
   'uniform float alpha;',
   'uniform vec3 fadeDistance;',
    
   'varying vec3 vPosition;',
    
   'void main() {',
     'gl_FragColor = vec4(abs(mod(vPosition, fadeDistance)*2.0/fadeDistance - 1.0), alpha);',
   '}'
  ].join('\n'),
}

export class NormalMaterial extends THREE.ShaderMaterial {
  constructor(/*Object*/ options) {
    super();
    
    this.type = 'NormalMaterial';
    
    this.vertexShader   = THREE.ShaderLib.densNormal.vertexShader;
    this.fragmentShader = THREE.ShaderLib.densNormal.fragmentShader;
    this.local = 0;
    this.alpha = 1;
    this.mode  = 0;
    this.uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.densNormal.uniforms);
    
    this.setValues(options);
    this.updateUniforms();
  }
}

NormalMaterial.prototype.updateUniforms = function(values) {
  this.uniforms.local.value = this.local;
  this.uniforms.alpha.value = this.alpha;
  this.uniforms.mode .value = this.mode ;
}

THREE.ShaderLib.densNormal = {
  uniforms: {
    local: {type: 'i', value: 0},
    alpha: {type: 'f', value: 0},
    mode : {type: 'i', value: 0},
  },
  
  vertexShader: [
   'uniform int local;',
    
   'varying vec3 vNormal;',
    
   'void main() {',
     'if(local != 0) {',
       'vNormal = normal;',
     '}',
     'else {',
       'vNormal = vec3(modelMatrix*vec4(position + normal, 1.0)) - vec3(modelMatrix*vec4(position,1.0));',
     '}',
      
     'gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);',
   '}'
  ].join('\n'),
  
  fragmentShader: [
   'uniform float alpha;',
   'uniform int mode;',
    
   'varying vec3 vNormal;',
    
   'void main() {',
     'if(mode == 0) {',
       'gl_FragColor = vec4(abs(vNormal), alpha);',
     '}',
     'else {',
       'gl_FragColor = vec4((vNormal + 1.0)/2.0, alpha);',
     '}',
   '}'
  ].join('\n'),
}

export class PsychMaterial extends THREE.ShaderMaterial {
  constructor(/*Object*/ options) {
    super();
    
    this.type = 'PsychMaterial';
    
    this.vertexShader   = THREE.ShaderLib.densPsych.vertexShader;
    this.fragmentShader = THREE.ShaderLib.densPsych.fragmentShader;
    this.local = 0;
    this.alpha = 1;
    this.wavelength = new THREE.Vector3(8    , 4   , 2  );
    this.frequency  = new THREE.Vector3(0.125, 0.25, 0.5);
    this.uniforms = THREE.UniformsUtils.clone(THREE.ShaderLib.densPsych.uniforms);
    
    this.setValues(options);
    this.updateUniforms();
  }
}

PsychMaterial.prototype.updateUniforms = function(values) {
  this.uniforms.local.value = this.local;
  this.uniforms.alpha.value = this.alpha;
  this.uniforms.wavelength.value.copy(this.wavelength);
  this.uniforms.frequency .value.copy(this.frequency );
}

PsychMaterial.prototype.tick = function(seconds) {
  this.uniforms.time.value += seconds;
}

THREE.ShaderLib.densPsych = {
  uniforms: {
    local: {type: 'i', value: 0},
    time : {type: 'f', value: 0},
    alpha: {type: 'f', value: 0},
    wavelength: {type: 'v3', value: new THREE.Vector3()},
    frequency : {type: 'v3', value: new THREE.Vector3()},
  },
  
  vertexShader: THREE.ShaderLib.densCoordinate.vertexShader,
  
  fragmentShader: [
   'uniform float time;',
   'uniform float alpha;',
   'uniform vec3 wavelength;',
   'uniform vec3 frequency;',
    
   'varying vec3 vPosition;',
    
   'void main() {',
     'gl_FragColor = vec4(sin(vPosition*2.0*3.14159/wavelength + time*2.0*3.14159*frequency), alpha);',
   '}'
  ].join('\n'),
}
