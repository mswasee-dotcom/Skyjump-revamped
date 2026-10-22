import * as THREE from 'three';

export interface EmitOptions {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Random velocity added on each axis (± spread). */
  spread?: number;
  /** Spread only in the XZ plane (rings). */
  ring?: number;
  count?: number;
  color: THREE.ColorRepresentation;
  /** Optional second colour; each particle picks a random mix. */
  color2?: THREE.ColorRepresentation;
  size?: number;
  sizeEnd?: number;
  life?: number;
  lifeJitter?: number;
  gravity?: number;
  drag?: number;
  alpha?: number;
}

/**
 * One pooled, additive point-sprite system for every effect in the game: exhaust trails,
 * sparks, explosions, landing dust, orb pickups and crumbling tiles. Fixed capacity, no
 * allocation per frame; the oldest particles are recycled when the pool is full.
 */
export class Particles {
  readonly points: THREE.Points;
  private readonly cap: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size0: Float32Array;
  private size1: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private a0: Float32Array;
  private next = 0;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private c1 = new THREE.Color();
  private c2 = new THREE.Color();

  constructor(capacity: number) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.a0 = new Float32Array(capacity);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color;
        varying float vAlpha; varying vec3 vColor; uniform float scale;
        void main(){
          vAlpha = alpha; vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha; varying vec3 vColor;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          a *= a;
          if (vAlpha * a < 0.003) discard;
          gl_FragColor = vec4(vColor * (1.0 + (1.0 - d) * 0.8), vAlpha * a);
        }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  setViewportHeight(h: number): void {
    this.mat.uniforms.scale.value = h * 0.9;
  }

  emit(o: EmitOptions): void {
    const n = o.count ?? 1;
    this.c1.set(o.color);
    if (o.color2 !== undefined) this.c2.set(o.color2);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      const s = o.spread ?? 0;
      let vx = (o.vx ?? 0) + (Math.random() * 2 - 1) * s;
      let vy = (o.vy ?? 0) + (Math.random() * 2 - 1) * s;
      let vz = (o.vz ?? 0) + (Math.random() * 2 - 1) * s;
      if (o.ring) {
        const a = Math.random() * Math.PI * 2;
        vx += Math.cos(a) * o.ring;
        vz += Math.sin(a) * o.ring;
        vy *= 0.3;
      }
      this.pos[i * 3] = o.x;
      this.pos[i * 3 + 1] = o.y;
      this.pos[i * 3 + 2] = o.z;
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      const t = o.color2 !== undefined ? Math.random() : 0;
      this.col[i * 3] = this.c1.r + (this.c2.r - this.c1.r) * t;
      this.col[i * 3 + 1] = this.c1.g + (this.c2.g - this.c1.g) * t;
      this.col[i * 3 + 2] = this.c1.b + (this.c2.b - this.c1.b) * t;
      const life = (o.life ?? 0.6) * (1 + (Math.random() * 2 - 1) * (o.lifeJitter ?? 0.25));
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size0[i] = o.size ?? 0.3;
      this.size1[i] = o.sizeEnd ?? (o.size ?? 0.3) * 0.2;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 0;
      this.a0[i] = o.alpha ?? 1;
      this.size[i] = this.size0[i];
      this.alpha[i] = this.a0[i];
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= dr;
      this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt;
      this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.size[i] = this.size1[i] + (this.size0[i] - this.size1[i]) * t;
      this.alpha[i] = this.a0[i] * Math.min(1, t * 1.6);
    }
    const a = this.geo.attributes;
    (a.position as THREE.BufferAttribute).needsUpdate = true;
    (a.color as THREE.BufferAttribute).needsUpdate = true;
    (a.size as THREE.BufferAttribute).needsUpdate = true;
    (a.alpha as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.alpha.fill(0);
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
