import * as THREE from 'three';
import type { Theme } from '../levels/themes';
import { planetTexture, radialTexture, ringTexture } from './textures';

/**
 * Deep-space backdrop: gradient sky dome, star field, nebula glows, planets with rings, and a
 * cloud of drifting dust near the camera that sells the speed. The backdrop follows the camera
 * so it reads as infinitely far away; only the dust is in world space.
 */
export class Environment {
  readonly group = new THREE.Group();
  readonly backdrop = new THREE.Group();
  private disposables: Array<{ dispose(): void }> = [];
  private dust: THREE.Points;
  private dustPositions: Float32Array;
  private readonly dustCount: number;
  private readonly dustBox = { x: 40, y: 24, z: 120 };
  private planets: THREE.Object3D[] = [];
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;

  constructor(theme: Theme, quality: 'low' | 'medium' | 'high') {
    this.group.add(this.backdrop);

    // Sky dome
    const skyGeo = new THREE.SphereGeometry(1500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(theme.skyTop) },
        horizon: { value: new THREE.Color(theme.sky) },
        glow: { value: new THREE.Color(theme.nebula) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y * 1.4 + 0.15, 0.0, 1.0);
          vec3 c = mix(horizon, top, pow(h, 0.7));
          float band = exp(-pow((vDir.y + 0.05) * 6.0, 2.0));
          c += glow * band * 0.35;
          float below = clamp(-vDir.y * 2.0, 0.0, 1.0);
          c = mix(c, top * 0.6, below);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.renderOrder = -10;
    this.backdrop.add(sky);
    this.disposables.push(skyGeo, skyMat);

    // Stars
    const starCount = Math.round((quality === 'low' ? 1500 : 3500) * theme.starDensity);
    const sp = new Float32Array(starCount * 3);
    const sc = new Float32Array(starCount * 3);
    const col = new THREE.Color();
    for (let i = 0; i < starCount; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 1200;
      const s = Math.sqrt(1 - u * u);
      sp.set([r * s * Math.cos(th), r * Math.abs(u) * (Math.random() < 0.85 ? 1 : -1), r * s * Math.sin(th)], i * 3);
      col.setHSL(0.55 + Math.random() * 0.25, 0.6, 0.6 + Math.random() * 0.4);
      sc.set([col.r, col.g, col.b], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const starTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32);
    const starMat = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, map: starTex, transparent: true, depthWrite: false, fog: false });
    const stars = new THREE.Points(starGeo, starMat);
    this.backdrop.add(stars);
    this.disposables.push(starGeo, starMat, starTex);

    // Nebula glows
    const nebTex = radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)', 256);
    this.disposables.push(nebTex);
    const nebColor = new THREE.Color(theme.nebula);
    const placements: Array<[number, number, number, number]> = [
      [-500, 120, -900, 900],
      [600, -50, -1000, 1100],
      [100, 300, -1100, 700],
      [-300, -200, -800, 600],
    ];
    for (const [x, y, z, s] of placements) {
      const mat = new THREE.SpriteMaterial({ map: nebTex, color: nebColor, transparent: true, opacity: 0.35, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
      const spr = new THREE.Sprite(mat);
      spr.position.set(x, y, z);
      spr.scale.set(s, s * 0.6, 1);
      this.backdrop.add(spr);
      this.disposables.push(mat);
    }

    // Planets
    theme.planets.forEach((p, i) => {
      const tex = planetTexture(p.a, p.b, 7 + i * 13);
      const geo = new THREE.SphereGeometry(p.r, 48, 24);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, emissive: new THREE.Color(p.b), emissiveIntensity: 0.25, fog: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...p.pos);
      mesh.rotation.z = 0.35 * (i % 2 ? -1 : 1);
      this.backdrop.add(mesh);
      this.planets.push(mesh);
      this.disposables.push(tex, geo, mat);
      // atmosphere halo
      const haloMat = new THREE.SpriteMaterial({ map: nebTex, color: new THREE.Color(p.a), transparent: true, opacity: 0.45, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
      const halo = new THREE.Sprite(haloMat);
      halo.position.copy(mesh.position);
      halo.scale.setScalar(p.r * 2.9);
      this.backdrop.add(halo);
      this.disposables.push(haloMat);
      if (p.ring) {
        const rt = ringTexture(p.a);
        const rg = new THREE.RingGeometry(p.r * 1.35, p.r * 2.1, 96, 1);
        // map the ring texture radially
        const pos = rg.attributes.position as THREE.BufferAttribute;
        const uv = rg.attributes.uv as THREE.BufferAttribute;
        for (let k = 0; k < pos.count; k++) {
          const rr = Math.hypot(pos.getX(k), pos.getY(k));
          uv.setXY(k, (rr - p.r * 1.35) / (p.r * 0.75), 0.5);
        }
        const rm = new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
        const ring = new THREE.Mesh(rg, rm);
        ring.position.copy(mesh.position);
        ring.rotation.x = -Math.PI / 2 + 0.35;
        ring.rotation.y = 0.25;
        this.backdrop.add(ring);
        this.disposables.push(rt, rg, rm);
      }
    });

    // Lighting
    this.hemi = new THREE.HemisphereLight(new THREE.Color(theme.neon2).lerp(new THREE.Color(0xffffff), 0.6), new THREE.Color(theme.sky), 1.1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(-30, 60, 40);
    this.group.add(this.hemi, this.sun, this.sun.target);

    // Speed dust
    this.dustCount = quality === 'low' ? 250 : 600;
    this.dustPositions = new Float32Array(this.dustCount * 3);
    for (let i = 0; i < this.dustCount; i++) {
      this.dustPositions.set(
        [(Math.random() - 0.5) * this.dustBox.x * 2, (Math.random() - 0.6) * this.dustBox.y * 2, -Math.random() * this.dustBox.z],
        i * 3,
      );
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    const dustTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32);
    const dm = new THREE.PointsMaterial({ size: 0.18, color: new THREE.Color(theme.neon).lerp(new THREE.Color(0xffffff), 0.5), map: dustTex, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(dg, dm);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
    this.disposables.push(dg, dm, dustTex);
  }

  /** Keep the backdrop centred on the camera and wrap dust particles around it. */
  update(camera: THREE.Camera, time: number): void {
    this.backdrop.position.copy(camera.position);
    for (const p of this.planets) p.rotation.y = time * 0.01;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const P = this.dustPositions;
    const { x: bx, y: by, z: bz } = this.dustBox;
    for (let i = 0; i < this.dustCount; i++) {
      const k = i * 3;
      if (P[k + 2] > cz + 6) P[k + 2] -= bz;
      else if (P[k + 2] < cz - bz + 6) P[k + 2] += bz;
      if (P[k] > cx + bx) P[k] -= bx * 2;
      else if (P[k] < cx - bx) P[k] += bx * 2;
      if (P[k + 1] > cy + by) P[k + 1] -= by * 2;
      else if (P[k + 1] < cy - by * 1.4) P[k + 1] += by * 2;
    }
    (this.dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.sun.target.position.set(camera.position.x, camera.position.y, camera.position.z - 20);
    this.sun.position.set(camera.position.x - 30, camera.position.y + 60, camera.position.z + 40);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
