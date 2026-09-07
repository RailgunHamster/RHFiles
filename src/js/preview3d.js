import * as THREE from '../vendor/three/three.module.min.js';
import { OrbitControls } from '../vendor/three/addons/controls/OrbitControls.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '../vendor/three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from '../vendor/three/addons/libs/meshopt_decoder.module.js';
import { FBXLoader } from '../vendor/three/addons/loaders/FBXLoader.js';
import { OBJLoader } from '../vendor/three/addons/loaders/OBJLoader.js';
import { MTLLoader } from '../vendor/three/addons/loaders/MTLLoader.js';
import { STLLoader } from '../vendor/three/addons/loaders/STLLoader.js';
import { PLYLoader } from '../vendor/three/addons/loaders/PLYLoader.js';
import { ThreeMFLoader } from '../vendor/three/addons/loaders/3MFLoader.js';

export const SUPPORTED_3D_EXTENSIONS = Object.freeze(['glb', 'gltf', 'obj', 'fbx', 'stl', 'ply', '3mf']);
export const MODEL_PREVIEW_MAX_BYTES = 128 * 1024 * 1024;
export const MODEL_PREVIEW_MAX_TRIANGLES = 3_000_000;

let activeViewer = null;

function makeError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function resourceBase(url) {
  try {
    return new URL('.', url).href;
  } catch (_) {
    const slash = String(url).lastIndexOf('/');
    return slash >= 0 ? String(url).slice(0, slash + 1) : '';
  }
}

async function fetchBytes(url, signal, onProgress) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw makeError('MODEL_READ_FAILED', `HTTP ${response.status}`);
  const declaredSize = Number(response.headers.get('content-length')) || 0;
  if (declaredSize > MODEL_PREVIEW_MAX_BYTES) throw makeError('MODEL_TOO_LARGE');

  if (!response.body || typeof response.body.getReader !== 'function') {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > MODEL_PREVIEW_MAX_BYTES) throw makeError('MODEL_TOO_LARGE');
    onProgress?.(data.byteLength, declaredSize || data.byteLength);
    return data;
  }

  const reader = response.body.getReader();
  let loaded = 0;
  let output = declaredSize ? new Uint8Array(declaredSize) : null;
  const chunks = output ? null : [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    loaded += value.byteLength;
    if (loaded > MODEL_PREVIEW_MAX_BYTES) {
      await reader.cancel();
      throw makeError('MODEL_TOO_LARGE');
    }
    if (output) {
      if (loaded > output.byteLength) {
        const expanded = new Uint8Array(loaded);
        expanded.set(output);
        output = expanded;
      }
      output.set(value, loaded - value.byteLength);
    } else {
      chunks.push(value);
    }
    onProgress?.(loaded, declaredSize);
  }
  if (output) return output.subarray(0, loaded);
  output = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function exactArrayBuffer(bytes) {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function loadObjMaterials(text, sourceUrl, signal) {
  const match = text.match(/^\s*mtllib\s+(.+?)\s*$/im);
  if (!match) return null;
  try {
    const base = resourceBase(sourceUrl);
    const materialUrl = new URL(match[1].trim().replace(/\\/g, '/'), base).href;
    const bytes = await fetchBytes(materialUrl, signal);
    const materials = new MTLLoader().parse(new TextDecoder().decode(bytes), resourceBase(materialUrl));
    materials.preload();
    return materials;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
}

async function parseModel(extension, bytes, sourceUrl, signal) {
  const buffer = exactArrayBuffer(bytes);
  const base = resourceBase(sourceUrl);
  switch (extension) {
    case 'glb':
    case 'gltf': {
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(new URL('vendor/three/addons/libs/draco/gltf/', document.baseURI).href);
      const loader = new GLTFLoader();
      loader.setDRACOLoader(dracoLoader);
      loader.setMeshoptDecoder(MeshoptDecoder);
      try {
        const result = await loader.parseAsync(buffer, base);
        return { object: result.scene || result.scenes?.[0], animations: result.animations || [] };
      } finally {
        dracoLoader.dispose();
      }
    }
    case 'fbx': {
      const object = new FBXLoader().parse(buffer, base);
      return { object, animations: object.animations || [] };
    }
    case 'obj': {
      const text = new TextDecoder().decode(bytes);
      const loader = new OBJLoader();
      const materials = await loadObjMaterials(text, sourceUrl, signal);
      if (materials) loader.setMaterials(materials);
      return { object: loader.parse(text), animations: [] };
    }
    case 'stl': {
      const geometry = new STLLoader().parse(buffer);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ color: 0x6ca8ff, roughness: 0.62, metalness: 0.08 });
      return { object: new THREE.Mesh(geometry, material), animations: [] };
    }
    case 'ply': {
      const geometry = new PLYLoader().parse(buffer);
      const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
      const faceCount = Number(header.match(/element\s+face\s+(\d+)/i)?.[1] || 0);
      const hasColors = !!geometry.getAttribute('color');
      if (faceCount > 0 || geometry.index) {
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({ color: hasColors ? 0xffffff : 0x6ca8ff, vertexColors: hasColors, roughness: 0.68 });
        return { object: new THREE.Mesh(geometry, material), animations: [] };
      }
      const material = new THREE.PointsMaterial({ color: hasColors ? 0xffffff : 0x6ca8ff, vertexColors: hasColors, size: 0.012, sizeAttenuation: true });
      return { object: new THREE.Points(geometry, material), animations: [] };
    }
    case '3mf':
      return { object: new ThreeMFLoader().parse(buffer), animations: [] };
    default:
      throw makeError('MODEL_UNSUPPORTED');
  }
}

function modelStats(object) {
  let vertices = 0;
  let triangles = 0;
  let meshes = 0;
  object.traverse(node => {
    const geometry = node.geometry;
    if (!geometry) return;
    const positions = geometry.getAttribute?.('position');
    if (positions) vertices += positions.count;
    if (node.isMesh) {
      meshes++;
      triangles += Math.floor((geometry.index?.count || positions?.count || 0) / 3);
    }
  });
  return { vertices, triangles, meshes };
}

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose?.();
}

function disposeObject(object) {
  object?.traverse?.(node => {
    node.geometry?.dispose?.();
    if (Array.isArray(node.material)) node.material.forEach(disposeMaterial);
    else disposeMaterial(node.material);
  });
}

function setButton(button, text, title) {
  button.textContent = text;
  button.title = title || text;
  button.setAttribute('aria-label', title || text);
}

function formatNumber(value) {
  try { return new Intl.NumberFormat().format(value); } catch (_) { return String(value); }
}

export function dispose3DPreview() {
  const viewer = activeViewer;
  if (!viewer) return;
  activeViewer = null;
  viewer.disposed = true;
  viewer.abort?.abort();
  if (viewer.raf) cancelAnimationFrame(viewer.raf);
  viewer.resizeObserver?.disconnect();
  viewer.controls?.dispose();
  viewer.mixer?.stopAllAction();
  disposeObject(viewer.object);
  viewer.scene?.clear();
  viewer.renderer?.dispose();
  viewer.renderer?.forceContextLoss?.();
}

export async function render3DPreview(options) {
  dispose3DPreview();
  const {
    container,
    extension,
    sourceUrl,
    fileName,
    labels = {},
    isCurrent = () => true,
  } = options;
  const abort = new AbortController();
  const viewer = { abort, disposed: false, raf: 0, object: null, renderer: null, scene: null, controls: null, mixer: null, resizeObserver: null };
  activeViewer = viewer;

  const shell = document.createElement('div');
  shell.className = 'preview-model-shell';
  shell.innerHTML = '<div class="preview-model-toolbar">' +
    '<button type="button" data-model-action="reset"></button>' +
    '<button type="button" data-model-action="wireframe"></button>' +
    '<button type="button" data-model-action="rotate"></button>' +
    '<button type="button" data-model-action="animation" hidden></button>' +
    '</div><div class="preview-model-stage"><div class="preview-model-progress"></div></div>' +
    '<div class="preview-model-meta"><span class="preview-model-name"></span><span class="preview-model-stats"></span></div>';
  container.replaceChildren(shell);
  const stage = shell.querySelector('.preview-model-stage');
  const progress = shell.querySelector('.preview-model-progress');
  shell.querySelector('.preview-model-name').textContent = fileName;
  const resetButton = shell.querySelector('[data-model-action="reset"]');
  const wireframeButton = shell.querySelector('[data-model-action="wireframe"]');
  const rotateButton = shell.querySelector('[data-model-action="rotate"]');
  const animationButton = shell.querySelector('[data-model-action="animation"]');
  setButton(resetButton, labels.reset || 'Reset', labels.resetTitle);
  setButton(wireframeButton, labels.wireframe || 'Wireframe', labels.wireframeTitle);
  setButton(rotateButton, labels.rotate || 'Auto rotate', labels.rotateTitle);
  progress.textContent = labels.loading || 'Loading 3D model…';

  let lastProgressUpdate = 0;
  const bytes = await fetchBytes(sourceUrl, abort.signal, (loaded, total) => {
    const now = performance.now();
    if (now - lastProgressUpdate < 80 && loaded !== total) return;
    lastProgressUpdate = now;
    const amount = total ? `${Math.round(loaded * 100 / total)}%` : `${Math.round(loaded / 1048576)} MB`;
    progress.textContent = `${labels.loading || 'Loading 3D model…'} ${amount}`;
  });
  if (viewer.disposed || !isCurrent()) return;
  progress.textContent = labels.parsing || 'Building scene…';
  await new Promise(resolve => setTimeout(resolve, 0));
  if (viewer.disposed || !isCurrent()) return;
  const result = await parseModel(String(extension).toLowerCase(), bytes, sourceUrl, abort.signal);
  if (!result.object) throw makeError('MODEL_EMPTY');
  if (viewer.disposed || !isCurrent()) {
    disposeObject(result.object);
    return;
  }

  const stats = modelStats(result.object);
  if (stats.triangles > MODEL_PREVIEW_MAX_TRIANGLES) {
    disposeObject(result.object);
    throw makeError('MODEL_TOO_COMPLEX');
  }
  viewer.object = result.object;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (error) {
    throw makeError('WEBGL_UNAVAILABLE', error?.message);
  }
  viewer.renderer = renderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.className = 'preview-model-canvas';
  stage.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  viewer.scene = scene;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000);
  const controls = new OrbitControls(camera, renderer.domElement);
  viewer.controls = controls;
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;

  const wrapper = new THREE.Group();
  wrapper.add(result.object);
  scene.add(wrapper);
  result.object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(result.object);
  if (box.isEmpty()) {
    disposeObject(result.object);
    throw makeError('MODEL_EMPTY');
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  wrapper.position.copy(center).multiplyScalar(-1);
  const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
  const distance = Math.max(maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.28, 0.1);
  camera.near = Math.max(distance / 2000, 0.0001);
  camera.far = Math.max(distance * 100, maxDimension * 100, 100);
  camera.updateProjectionMatrix();
  camera.position.set(distance * 0.72, distance * 0.52, distance);
  controls.target.set(0, 0, 0);
  controls.minDistance = Math.max(maxDimension * 0.01, 0.0001);
  controls.maxDistance = distance * 30;
  controls.update();
  const initialCamera = camera.position.clone();
  const initialTarget = controls.target.clone();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x5f6878, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
  keyLight.position.set(distance, distance * 1.4, distance * 1.2);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x8ab8ff, 1.1);
  fillLight.position.set(-distance, distance * 0.3, -distance * 0.5);
  scene.add(fillLight);
  const grid = new THREE.GridHelper(maxDimension * 2.4, 12, 0x718096, 0xa0aec0);
  grid.position.y = box.min.y - center.y;
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  scene.add(grid);

  let needsRender = true;
  let lastFrame = performance.now();
  let animationPlaying = false;
  let wireframe = false;
  const originalWireframe = new WeakMap();

  function draw(now = performance.now()) {
    viewer.raf = 0;
    if (viewer.disposed || !isCurrent() || document.hidden) return;
    const delta = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (viewer.mixer && animationPlaying) {
      viewer.mixer.update(delta);
      needsRender = true;
    }
    if (controls.autoRotate) {
      controls.update(delta);
      needsRender = true;
    }
    if (needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    if ((viewer.mixer && animationPlaying) || controls.autoRotate) viewer.raf = requestAnimationFrame(draw);
  }

  function invalidate() {
    needsRender = true;
    if (!viewer.raf) viewer.raf = requestAnimationFrame(draw);
  }

  function resize() {
    if (viewer.disposed) return;
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    invalidate();
  }

  controls.addEventListener('change', invalidate);
  viewer.resizeObserver = new ResizeObserver(resize);
  viewer.resizeObserver.observe(stage);

  resetButton.addEventListener('click', () => {
    camera.position.copy(initialCamera);
    controls.target.copy(initialTarget);
    controls.update();
    invalidate();
  });
  wireframeButton.addEventListener('click', () => {
    wireframe = !wireframe;
    result.object.traverse(node => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material || !('wireframe' in material)) continue;
        if (!originalWireframe.has(material)) originalWireframe.set(material, !!material.wireframe);
        material.wireframe = wireframe ? true : originalWireframe.get(material);
        material.needsUpdate = true;
      }
    });
    wireframeButton.classList.toggle('active', wireframe);
    invalidate();
  });
  rotateButton.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    controls.autoRotateSpeed = 2;
    rotateButton.classList.toggle('active', controls.autoRotate);
    lastFrame = performance.now();
    invalidate();
  });

  if (result.animations?.length) {
    viewer.mixer = new THREE.AnimationMixer(result.object);
    viewer.mixer.clipAction(result.animations[0]).play();
    animationPlaying = true;
    animationButton.hidden = false;
    setButton(animationButton, labels.pause || 'Pause', labels.animationTitle);
    animationButton.classList.add('active');
    animationButton.addEventListener('click', () => {
      animationPlaying = !animationPlaying;
      viewer.mixer.timeScale = animationPlaying ? 1 : 0;
      setButton(animationButton, animationPlaying ? (labels.pause || 'Pause') : (labels.play || 'Play'), labels.animationTitle);
      animationButton.classList.toggle('active', animationPlaying);
      lastFrame = performance.now();
      invalidate();
    });
  }

  const statParts = [
    `${formatNumber(stats.meshes)} ${labels.meshes || 'meshes'}`,
    `${formatNumber(stats.triangles)} ${labels.triangles || 'triangles'}`,
    `${formatNumber(stats.vertices)} ${labels.vertices || 'vertices'}`,
  ];
  shell.querySelector('.preview-model-stats').textContent = statParts.join(' · ');
  shell.title = labels.controls || 'Drag to orbit · Wheel to zoom · Right-drag to pan';
  resize();
  invalidate();
}
