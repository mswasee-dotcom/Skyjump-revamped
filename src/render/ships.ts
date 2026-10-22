import * as THREE from 'three';
import type { VehicleId } from '../core/vehicles';
import type { Customization } from '../core/save';
import { radialTexture } from './textures';

/** Ships are modelled facing -Z with the hull bottom at y = 0 (the physics contact point). */
export interface ShipModel {
  group: THREE.Group;
  /** Inner group that banks and pitches; the outer group is positioned by the game. */
  body: THREE.Group;
  /** Engine exhaust points in body space. */
  nozzles: THREE.Vector3[];
  setCustom(c: Customization): void;
  /** 0..1 engine intensity; boost adds an extra flare. */
  setThrust(t: number, boost: boolean, time: number): void;
  dispose(): void;
}

const HOVER = 0.14;

let glowTex: THREE.Texture | null = null;
function glow(): THREE.Texture {
  if (!glowTex) glowTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
  return glowTex;
}

function extrude(points: Array<[number, number]>, depth: number, bevel: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  // Shape Y -> world forward (-Z); extrusion -> world up (+Y)
  g.rotateX(-Math.PI / 2);
  return g;
}

function mirror(half: Array<[number, number]>): Array<[number, number]> {
  const right = half;
  const left = [...half].reverse().map(([x, y]) => [-x, y] as [number, number]);
  return [...right, ...left.filter(([x]) => x !== 0)];
}

export function buildShip(id: VehicleId, custom: Customization): ShipModel {
  const group = new THREE.Group();
  const body = new THREE.Group();
  // Drawn a little larger than the physics hull so the ship reads clearly at speed.
  body.scale.setScalar(1.22);
  group.add(body);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const hull = new THREE.MeshStandardMaterial({ color: custom.body, metalness: 0.65, roughness: 0.32 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x10131f, metalness: 0.7, roughness: 0.45 });
  const accent = new THREE.MeshStandardMaterial({ color: custom.accent, emissive: custom.accent, emissiveIntensity: 1.6, roughness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1020, emissive: custom.accent, emissiveIntensity: 0.25, metalness: 0.9, roughness: 0.08 });
  const nozzleMat = new THREE.MeshBasicMaterial({ color: custom.trail, toneMapped: false });
  mats.push(hull, trim, accent, glass, nozzleMat);

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos?: [number, number, number], rot?: [number, number, number], scale?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    if (scale) m.scale.set(...scale);
    m.castShadow = false;
    body.add(m);
    geos.push(geo);
    return m;
  };

  const nozzles: THREE.Vector3[] = [];

  if (id === 'comet') {
    add(extrude(mirror([[0, 0.7], [0.17, 0.22], [0.44, -0.34], [0.42, -0.5], [0.2, -0.46], [0, -0.52]]), 0.1, 0.04), hull, [0, HOVER + 0.02, 0]);
    add(extrude(mirror([[0, 0.48], [0.1, 0.1], [0.14, -0.42], [0, -0.5]]), 0.08, 0.03), trim, [0, HOVER + 0.16, 0]);
    add(new THREE.SphereGeometry(1, 20, 12), glass, [0, HOVER + 0.26, -0.12], undefined, [0.1, 0.075, 0.24]);
    // wing accents
    for (const s of [-1, 1]) {
      const a = add(new THREE.BoxGeometry(0.03, 0.03, 0.64), accent, [s * 0.29, HOVER + 0.17, 0.05]);
      a.rotation.y = s * 0.47;
      add(new THREE.CylinderGeometry(0.07, 0.085, 0.3, 14), trim, [s * 0.14, HOVER + 0.13, 0.42], [Math.PI / 2, 0, 0]);
      add(new THREE.CircleGeometry(0.06, 16), nozzleMat, [s * 0.14, HOVER + 0.13, 0.575]);
      nozzles.push(new THREE.Vector3(s * 0.14, HOVER + 0.13, 0.6));
    }
    add(new THREE.BoxGeometry(0.03, 0.16, 0.22), trim, [0, HOVER + 0.3, 0.38], [0.4, 0, 0]);
    add(new THREE.BoxGeometry(0.035, 0.05, 0.2), accent, [0, HOVER + 0.36, 0.42], [0.4, 0, 0]);
  } else if (id === 'wisp') {
    add(new THREE.ConeGeometry(0.11, 0.85, 16), hull, [0, HOVER + 0.16, -0.25], [-Math.PI / 2, 0, 0]);
    add(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 16), hull, [0, HOVER + 0.16, 0.37], [Math.PI / 2, 0, 0]);
    add(new THREE.SphereGeometry(1, 16, 10), glass, [0, HOVER + 0.25, -0.08], undefined, [0.07, 0.06, 0.2]);
    for (const s of [-1, 1]) {
      // forward-swept blade wings
      add(extrude([[0, 0.1], [s * 0.42, 0.32], [s * 0.45, 0.22], [s * 0.05, -0.2]].map(([x, y]) => [x, y] as [number, number]), 0.015, 0.01), hull, [0, HOVER + 0.12, 0.25]);
      const tip = add(new THREE.BoxGeometry(0.025, 0.025, 0.3), accent, [s * 0.36, HOVER + 0.15, 0.0]);
      tip.rotation.y = -s * 0.5;
      const fin = add(new THREE.BoxGeometry(0.02, 0.2, 0.18), trim, [s * 0.12, HOVER + 0.3, 0.48]);
      fin.rotation.z = s * 0.35;
      add(new THREE.BoxGeometry(0.022, 0.06, 0.16), accent, [s * 0.15, HOVER + 0.39, 0.5], [0, 0, s * 0.35]);
    }
    add(new THREE.CircleGeometry(0.1, 18), nozzleMat, [0, HOVER + 0.16, 0.625]);
    nozzles.push(new THREE.Vector3(0, HOVER + 0.16, 0.65));
  } else {
    add(extrude(mirror([[0, 0.66], [0.3, 0.56], [0.4, 0.2], [0.4, -0.45], [0.3, -0.58], [0, -0.58]]), 0.14, 0.05), hull, [0, HOVER + 0.02, 0]);
    add(new THREE.BoxGeometry(0.5, 0.08, 0.2), glass, [0, HOVER + 0.27, -0.2]);
    add(new THREE.BoxGeometry(0.62, 0.035, 0.035), accent, [0, HOVER + 0.24, -0.58]);
    for (const s of [-1, 1]) {
      add(new THREE.BoxGeometry(0.035, 0.035, 0.95), accent, [s * 0.43, HOVER + 0.12, 0]);
      for (const zz of [-0.32, 0.38]) {
        add(new THREE.CylinderGeometry(0.1, 0.12, 0.34, 14), trim, [s * 0.36, HOVER + 0.1, zz], [Math.PI / 2, 0, 0]);
      }
      add(new THREE.CircleGeometry(0.085, 16), nozzleMat, [s * 0.36, HOVER + 0.1, 0.56]);
      nozzles.push(new THREE.Vector3(s * 0.36, HOVER + 0.1, 0.58));
    }
    add(new THREE.BoxGeometry(0.4, 0.12, 0.3), trim, [0, HOVER + 0.24, 0.32]);
  }

  // Engine flares (additive sprites) and an underglow.
  const flareMats: THREE.SpriteMaterial[] = [];
  const flares: THREE.Sprite[] = [];
  for (const n of nozzles) {
    const m = new THREE.SpriteMaterial({ map: glow(), color: custom.trail, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const s = new THREE.Sprite(m);
    s.position.copy(n);
    body.add(s);
    flares.push(s);
    flareMats.push(m);
  }
  const underMat = new THREE.MeshBasicMaterial({ map: glow(), color: custom.accent, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const underGeo = new THREE.PlaneGeometry(1.2, 1.6);
  const under = new THREE.Mesh(underGeo, underMat);
  under.rotation.x = -Math.PI / 2;
  under.position.y = 0.02;
  body.add(under);
  geos.push(underGeo);
  mats.push(underMat, ...flareMats);

  return {
    group,
    body,
    nozzles,
    setCustom(c: Customization) {
      hull.color.set(c.body);
      accent.color.set(c.accent);
      accent.emissive.set(c.accent);
      glass.emissive.set(c.accent);
      nozzleMat.color.set(c.trail);
      underMat.color.set(c.accent);
      for (const m of flareMats) m.color.set(c.trail);
    },
    setThrust(t: number, boost: boolean, time: number) {
      const flick = 0.85 + Math.sin(time * 60) * 0.08 + Math.sin(time * 37) * 0.07;
      const size = (0.22 + t * 0.32 + (boost ? 0.45 : 0)) * flick;
      for (const f of flares) f.scale.set(size, size, 1);
      underMat.opacity = 0.2 + t * 0.15;
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
