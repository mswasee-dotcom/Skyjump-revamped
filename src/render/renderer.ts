import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Quality } from '../core/save';
import { style } from './style';

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/** Owns the WebGL renderer, camera, scene and (optional) bloom post-processing. */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private quality: Quality;
  /** Field of view before speed effects; depends on aspect ratio. */
  baseFov = 62;
  onResize: ((w: number, h: number) => void) | null = null;

  constructor(private host: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x02030a);
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
    this.applyQuality(quality);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  applyQuality(q: Quality): void {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : 1);
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    if (q !== 'low' && style().bloom) {
      const size = this.renderer.getSize(new THREE.Vector2());
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const scale = q === 'high' ? 1 : 0.5;
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * scale, size.y * scale), q === 'high' ? 0.62 : 0.55, 0.4, 0.72);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
    this.resize();
  }

  resize = (): void => {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    if (this.bloom && this.quality === 'medium') this.bloom.resolution.set(w * 0.5, h * 0.5);
    this.camera.aspect = w / h;
    // Keep a sensible horizontal field of view on tall (portrait) screens.
    this.baseFov = w / h < 1 ? 78 : 62;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w, h * this.renderer.getPixelRatio());
  };

  render(): void {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
