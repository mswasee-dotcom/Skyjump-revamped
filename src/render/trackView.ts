import * as THREE from 'three';
import { BlockKind, TileType, TILE_INFO } from '../core/tiles';
import { Track, laneToX, orbHeight } from '../core/track';
import {
  HEIGHT_UNIT,
  LANE_WIDTH,
  LOW_BLOCK_HEIGHT,
  ROW_LENGTH,
  TILE_THICKNESS,
  WALL_HEIGHT,
} from '../core/constants';
import { canvasTexture, drawSide, drawTile } from './textures';

const CHUNK_ROWS = 24;
const VIEW_BEHIND = 2; // chunks
const VIEW_AHEAD = 6; // chunks

type Kind = 'slab' | 'block' | 'wall';

interface InstanceRef {
  mesh: THREE.InstancedMesh;
  id: number;
  matrix: THREE.Matrix4;
}

interface Chunk {
  index: number;
  group: THREE.Group;
  meshes: THREE.InstancedMesh[];
  fragile: Map<number, InstanceRef>;
  orbs: Map<number, InstanceRef>;
  orbMesh: THREE.InstancedMesh | null;
  orbBase: Array<{ cell: number; x: number; y: number; z: number }>;
}

/** Materials shared by every chunk of a track. Built once per theme. */
class TileMaterials {
  private cache = new Map<string, THREE.Material[]>();
  private textures: THREE.Texture[] = [];
  private mats: THREE.Material[] = [];
  hazardMats: THREE.MeshStandardMaterial[] = [];
  boostMats: THREE.MeshStandardMaterial[] = [];

  constructor(private neon: string) {}

  get(type: TileType, kind: Kind): THREE.Material[] {
    const key = `${type}:${kind}`;
    let m = this.cache.get(key);
    if (m) return m;
    const topCanvas = drawTile(type);
    // Re-tint the standard tile to this sector's neon colour.
    if (type === TileType.Standard || type === TileType.Checkpoint) this.retint(topCanvas, TILE_INFO[TileType.Standard].color);
    const topTex = canvasTexture(topCanvas);
    const sideColor = type === TileType.Standard || type === TileType.Checkpoint ? this.neon : TILE_INFO[type].color;
    const sideTex = canvasTexture(drawSide(kind === 'wall' ? '#ff2d6f' : sideColor, kind === 'wall'));
    this.textures.push(topTex, sideTex);
    const emissiveBoost = type === TileType.Boost ? 1.6 : type === TileType.Hazard ? 1.3 : type === TileType.Finish ? 0.5 : 1;
    const top = new THREE.MeshStandardMaterial({
      map: topTex,
      emissiveMap: topTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.55 * emissiveBoost,
      roughness: type === TileType.Ice ? 0.15 : 0.55,
      metalness: type === TileType.Ice ? 0.4 : 0.3,
    });
    const side = new THREE.MeshStandardMaterial({
      map: sideTex,
      emissiveMap: sideTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: kind === 'wall' ? 0.9 : 0.7,
      roughness: 0.6,
      metalness: 0.5,
    });
    const bottom = new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 0.9 });
    if (type === TileType.Hazard) this.hazardMats.push(top);
    if (type === TileType.Boost) this.boostMats.push(top);
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z
    m = [side, side, top, bottom, side, side];
    this.mats.push(top, side, bottom);
    this.cache.set(key, m);
    return m;
  }

  private retint(c: HTMLCanvasElement, from: string): void {
    if (from.toLowerCase() === this.neon.toLowerCase()) return;
    const ctx = c.getContext('2d')!;
    ctx.globalCompositeOperation = 'color';
    ctx.fillStyle = this.neon;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = 'source-over';
  }

  dispose(): void {
    for (const t of this.textures) t.dispose();
    for (const m of this.mats) m.dispose();
    this.cache.clear();
  }
}

/**
 * Renders a Track as streamed chunks of instanced slabs. Only the chunks near the camera exist,
 * which keeps draw calls and memory flat however long a course (or an endless run) gets.
 */
export class TrackView {
  readonly group = new THREE.Group();
  private chunks = new Map<number, Chunk>();
  private mats: TileMaterials;
  private box = new THREE.BoxGeometry(1, 1, 1);
  private orbGeo = new THREE.IcosahedronGeometry(0.26, 1);
  private orbMat = new THREE.MeshStandardMaterial({ color: 0xbffcff, emissive: 0x6ff6ff, emissiveIntensity: 2.2, roughness: 0.2 });
  private pylonMat: THREE.MeshStandardMaterial;
  /** Warning strip drawn on the front lip of any tile that ends at a gap or a drop. */
  private ledgeMat = new THREE.MeshBasicMaterial({ color: 0xffc23d, toneMapped: false });
  private gateMat: THREE.MeshStandardMaterial;
  private finishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 });
  private obstacleMeshes: THREE.Mesh[] = [];
  private obstacleMat: THREE.MeshStandardMaterial;
  private tmp = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private cracking = new Map<number, number>();
  private now = 0;
  /** Called when a fragile tile drops so the effects layer can spawn debris. */
  onCrumble: ((pos: THREE.Vector3) => void) | null = null;

  constructor(private track: Track, neon: number) {
    const neonHex = `#${new THREE.Color(neon).getHexString()}`;
    this.mats = new TileMaterials(neonHex);
    this.pylonMat = new THREE.MeshStandardMaterial({ color: 0x0a0e1c, emissive: neon, emissiveIntensity: 0.08, roughness: 0.8, metalness: 0.6 });
    this.gateMat = new THREE.MeshStandardMaterial({ color: neon, emissive: neon, emissiveIntensity: 1.8 });
    const obsTex = canvasTexture(drawSide('#ff2d6f', true));
    this.obstacleMat = new THREE.MeshStandardMaterial({
      map: obsTex,
      emissiveMap: obsTex,
      emissive: 0xffffff,
      emissiveIntensity: 1.1,
      roughness: 0.4,
      metalness: 0.6,
    });
    for (const o of track.obstacles) {
      const m = new THREE.Mesh(this.box, this.obstacleMat);
      m.scale.set(o.width * LANE_WIDTH - 0.1, o.height, o.rows * ROW_LENGTH - 0.1);
      this.group.add(m);
      this.obstacleMeshes.push(m);
    }
    track.onFragileChange = (row, lane, state) => this.fragileChanged(row, lane, state);
    track.onOrbChange = (row, lane, taken) => this.orbChanged(row, lane, taken);
  }

  /** Stream chunks around the given forward distance and animate dynamic parts. */
  update(d: number, time: number): void {
    this.now = time;
    const centre = Math.floor(d / ROW_LENGTH / CHUNK_ROWS);
    const lo = Math.max(0, centre - VIEW_BEHIND);
    const hi = centre + VIEW_AHEAD;
    const maxChunk = Math.floor((this.track.length - 1) / CHUNK_ROWS);
    for (const [i, ch] of this.chunks) {
      if (i < lo || i > hi) this.disposeChunk(ch);
    }
    let built = 0;
    for (let i = lo; i <= Math.min(hi, maxChunk); i++) {
      if (!this.chunks.has(i)) {
        this.chunks.set(i, this.buildChunk(i));
        // Spread construction over frames, except when the near chunks are missing.
        if (++built >= 2 && i > centre + 1) break;
      }
    }

    // Moving obstacles
    this.track.obstacles.forEach((o, k) => {
      const m = this.obstacleMeshes[k];
      const lane = this.track.obstaclePosition(o, time);
      m.position.set(laneToX(lane, this.track.width), this.track.rowY(o.row) + o.height / 2, -(o.row + o.rows / 2) * ROW_LENGTH);
    });

    // Pulsing materials
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    for (const m of this.mats.hazardMats) m.emissiveIntensity = 0.9 + pulse * 0.9;
    for (const m of this.mats.boostMats) m.emissiveIntensity = 1.2 + (0.5 + 0.5 * Math.sin(time * 14)) * 0.8;
    this.gateMat.emissiveIntensity = 1.4 + pulse * 0.6;

    // Orbs bob and spin
    for (const ch of this.chunks.values()) {
      if (!ch.orbMesh) continue;
      for (let k = 0; k < ch.orbBase.length; k++) {
        const b = ch.orbBase[k];
        if (this.track.orbTaken[b.cell]) continue;
        this.tmpQ.setFromAxisAngle(this.tmpV.set(0, 1, 0), time * 2 + k);
        this.tmp.compose(this.tmpV.set(b.x, b.y + Math.sin(time * 3 + k) * 0.08, b.z), this.tmpQ, this.tmpS.set(1, 1, 1));
        ch.orbMesh.setMatrixAt(k, this.tmp);
      }
      ch.orbMesh.instanceMatrix.needsUpdate = true;
    }

    // Cracking fragile tiles flicker
    for (const [cell, start] of this.cracking) {
      const ref = this.findFragile(cell);
      if (!ref) continue;
      const flick = Math.sin((time - start) * 50) > 0 ? 1 : 0.35;
      ref.mesh.setColorAt(ref.id, new THREE.Color(flick, flick * 0.8, flick));
      if (ref.mesh.instanceColor) ref.mesh.instanceColor.needsUpdate = true;
    }
  }

  private findFragile(cell: number): InstanceRef | undefined {
    const row = Math.floor(cell / this.track.width);
    return this.chunks.get(Math.floor(row / CHUNK_ROWS))?.fragile.get(cell);
  }

  private fragileChanged(row: number, lane: number, state: number): void {
    const cell = this.track.index(row, lane);
    const ref = this.findFragile(cell);
    if (state === 1) this.cracking.set(cell, this.now);
    else this.cracking.delete(cell);
    if (!ref) return;
    if (state === 2) {
      this.tmp.makeScale(0, 0, 0);
      ref.mesh.setMatrixAt(ref.id, this.tmp);
      ref.mesh.instanceMatrix.needsUpdate = true;
      const p = new THREE.Vector3();
      p.setFromMatrixPosition(ref.matrix);
      this.onCrumble?.(p);
    } else if (state === 0) {
      ref.mesh.setMatrixAt(ref.id, ref.matrix);
      ref.mesh.instanceMatrix.needsUpdate = true;
      ref.mesh.setColorAt(ref.id, new THREE.Color(1, 1, 1));
      if (ref.mesh.instanceColor) ref.mesh.instanceColor.needsUpdate = true;
    }
  }

  private orbChanged(row: number, lane: number, taken: boolean): void {
    const ch = this.chunks.get(Math.floor(row / CHUNK_ROWS));
    const ref = ch?.orbs.get(this.track.index(row, lane));
    if (!ref) return;
    this.tmp.makeScale(taken ? 0 : 1, taken ? 0 : 1, taken ? 0 : 1);
    if (!taken) this.tmp.copy(ref.matrix);
    ref.mesh.setMatrixAt(ref.id, this.tmp);
    ref.mesh.instanceMatrix.needsUpdate = true;
  }

  private buildChunk(index: number): Chunk {
    const t = this.track;
    const group = new THREE.Group();
    const r0 = index * CHUNK_ROWS;
    const r1 = Math.min(t.length, r0 + CHUNK_ROWS);
    const buckets = new Map<string, Array<{ m: THREE.Matrix4; cell: number; type: TileType }>>();
    const orbBase: Chunk['orbBase'] = [];
    const pylons: THREE.Matrix4[] = [];
    const ledges: THREE.Matrix4[] = [];
    const gates: Array<{ row: number; finish: boolean }> = [];

    for (let r = r0; r < r1; r++) {
      const row = t.rows[r];
      const z = -(r + 0.5) * ROW_LENGTH;
      let minLane = -1;
      let maxLane = -1;
      let hasCheckpoint = false;
      for (let l = 0; l < t.width; l++) {
        const c = row.cells[l];
        const cell = t.index(r, l);
        if (c.orb && !t.orbTaken[cell]) orbBase.push({ cell, x: laneToX(l, t.width), y: orbHeight(t, r, l), z });
        if (c.type === TileType.Empty) continue;
        if (minLane < 0) minLane = l;
        maxLane = l;
        if (c.type === TileType.Checkpoint) hasCheckpoint = true;
        const x = laneToX(l, t.width);
        const m = new THREE.Matrix4();
        let kind: Kind = 'slab';
        if (c.block === BlockKind.Wall || c.block === BlockKind.Low) {
          kind = c.block === BlockKind.Wall ? 'wall' : 'block';
          const h = (c.block === BlockKind.Wall ? WALL_HEIGHT : LOW_BLOCK_HEIGHT) + TILE_THICKNESS;
          m.compose(
            this.tmpV.set(x, row.y + h / 2 - TILE_THICKNESS, z),
            this.tmpQ.identity(),
            this.tmpS.set(LANE_WIDTH * 0.97, h, ROW_LENGTH * 0.985),
          );
        } else if (c.rise !== 0) {
          const rise = c.rise * HEIGHT_UNIT;
          const ang = Math.atan2(rise, ROW_LENGTH);
          const len = Math.hypot(rise, ROW_LENGTH);
          this.tmpQ.setFromAxisAngle(this.tmpS.set(1, 0, 0), ang);
          const off = new THREE.Vector3(0, -TILE_THICKNESS / 2, 0).applyQuaternion(this.tmpQ);
          m.compose(
            this.tmpV.set(x, row.y + rise / 2 + off.y, z + off.z),
            this.tmpQ,
            this.tmpS.set(LANE_WIDTH * 0.97, TILE_THICKNESS, len * 1.0),
          );
        } else {
          m.compose(
            this.tmpV.set(x, row.y - TILE_THICKNESS / 2, z),
            this.tmpQ.identity(),
            this.tmpS.set(LANE_WIDTH * 0.97, TILE_THICKNESS, ROW_LENGTH * 0.985),
          );
        }
        // Ledge cue: this tile ends at a gap or a drop of more than a step.
        if (kind !== 'wall' && r + 1 < t.length) {
          const next = t.rows[r + 1];
          const nc = next.cells[l];
          const top = c.block === BlockKind.Low ? row.y + LOW_BLOCK_HEIGHT : row.y + c.rise * HEIGHT_UNIT;
          const nextTop = nc.type === TileType.Empty ? -Infinity : nc.block === BlockKind.Low ? next.y + LOW_BLOCK_HEIGHT : next.y;
          if (nc.type === TileType.Empty || nextTop < top - 0.5) {
            const lm = new THREE.Matrix4();
            lm.compose(this.tmpV.set(x, top + 0.012, -(r + 1) * ROW_LENGTH + 0.16), this.tmpQ.identity(), this.tmpS.set(LANE_WIDTH * 0.9, 0.03, 0.2));
            ledges.push(lm);
          }
        }
        const key = `${c.type}:${kind}`;
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = []));
        b.push({ m, cell, type: c.type });
      }
      if (r % 6 === 0 && minLane >= 0) {
        for (const l of minLane === maxLane ? [minLane] : [minLane, maxLane]) {
          const pm = new THREE.Matrix4();
          const h = 40;
          pm.compose(this.tmpV.set(laneToX(l, t.width), row.y - TILE_THICKNESS - h / 2, z), this.tmpQ.identity(), this.tmpS.set(0.16, h, 0.16));
          pylons.push(pm);
        }
      }
      if (hasCheckpoint && (r === 0 || !t.rows[r - 1].cells.some((c) => c.type === TileType.Checkpoint))) gates.push({ row: r, finish: false });
      if (r === t.finishRow) gates.push({ row: r, finish: true });
    }

    const meshes: THREE.InstancedMesh[] = [];
    const fragile = new Map<number, InstanceRef>();
    for (const [key, list] of buckets) {
      const [typeStr, kind] = key.split(':');
      const type = Number(typeStr) as TileType;
      const mesh = new THREE.InstancedMesh(this.box, this.mats.get(type, kind as Kind), list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        if (type === TileType.Fragile) {
          fragile.set(it.cell, { mesh, id: i, matrix: it.m });
          mesh.setColorAt(i, new THREE.Color(1, 1, 1));
          if (t.fragileState[it.cell] === 2) mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      group.add(mesh);
      meshes.push(mesh);
    }

    let orbMesh: THREE.InstancedMesh | null = null;
    const orbs = new Map<number, InstanceRef>();
    if (orbBase.length) {
      orbMesh = new THREE.InstancedMesh(this.orbGeo, this.orbMat, orbBase.length);
      orbBase.forEach((o, i) => {
        const m = new THREE.Matrix4().makeTranslation(o.x, o.y, o.z);
        orbMesh!.setMatrixAt(i, m);
        orbs.set(o.cell, { mesh: orbMesh!, id: i, matrix: m });
      });
      orbMesh.frustumCulled = false;
      group.add(orbMesh);
      meshes.push(orbMesh);
    }

    if (pylons.length) {
      const pm = new THREE.InstancedMesh(this.box, this.pylonMat, pylons.length);
      pylons.forEach((m, i) => pm.setMatrixAt(i, m));
      pm.frustumCulled = false;
      group.add(pm);
      meshes.push(pm);
    }

    if (ledges.length) {
      const lm = new THREE.InstancedMesh(this.box, this.ledgeMat, ledges.length);
      ledges.forEach((m, i) => lm.setMatrixAt(i, m));
      lm.frustumCulled = false;
      group.add(lm);
      meshes.push(lm);
    }

    for (const g of gates) group.add(this.buildGate(g.row, g.finish));

    this.group.add(group);
    return { index, group, meshes, fragile, orbs, orbMesh, orbBase };
  }

  private buildGate(row: number, finish: boolean): THREE.Group {
    const t = this.track;
    const g = new THREE.Group();
    const y = t.rows[row].y;
    const span = t.width * LANE_WIDTH + 0.8;
    const h = finish ? 4.2 : 3.4;
    const mat = finish ? this.finishMat : this.gateMat;
    const thick = finish ? 0.32 : 0.16;
    const z = -row * ROW_LENGTH - 0.2;
    const left = new THREE.Mesh(this.box, mat);
    left.scale.set(thick, h, thick);
    left.position.set(-span / 2, y + h / 2 - 0.3, z);
    const right = left.clone();
    right.position.x = span / 2;
    const top = new THREE.Mesh(this.box, mat);
    top.scale.set(span + thick, thick, thick);
    top.position.set(0, y + h - 0.3, z);
    g.add(left, right, top);
    if (finish) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.6, 0.7), new THREE.MeshBasicMaterial({ map: this.finishBanner(), transparent: true, toneMapped: false }));
      banner.position.set(0, y + h - 0.95, z);
      g.add(banner);
    }
    return g;
  }

  private bannerTex: THREE.CanvasTexture | null = null;
  private finishBanner(): THREE.CanvasTexture {
    if (this.bannerTex) return this.bannerTex;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 64;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, 512, 64);
    ctx.font = '700 44px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#2de2ff';
    ctx.shadowBlur = 16;
    ctx.fillText('FINISH', 256, 34);
    this.bannerTex = canvasTexture(c);
    return this.bannerTex;
  }

  private disposeChunk(ch: Chunk): void {
    this.group.remove(ch.group);
    for (const m of ch.meshes) m.dispose();
    ch.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o.geometry !== this.box) o.geometry.dispose();
    });
    this.chunks.delete(ch.index);
  }

  dispose(): void {
    for (const ch of [...this.chunks.values()]) this.disposeChunk(ch);
    this.mats.dispose();
    this.box.dispose();
    this.orbGeo.dispose();
    this.orbMat.dispose();
    this.pylonMat.dispose();
    this.ledgeMat.dispose();
    this.gateMat.dispose();
    this.finishMat.dispose();
    this.obstacleMat.map?.dispose();
    this.obstacleMat.dispose();
    this.bannerTex?.dispose();
    this.track.onFragileChange = null;
    this.track.onOrbChange = null;
  }
}
