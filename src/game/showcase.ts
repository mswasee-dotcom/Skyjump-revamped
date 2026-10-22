import * as THREE from 'three';
import { ROW_LENGTH } from '../core/constants';
import { buildTrack } from '../levels/types';
import { THEMES, ThemeId } from '../levels/themes';
import { TrackView } from '../render/trackView';
import { Environment } from '../render/environment';
import { buildShip, ShipModel } from '../render/ships';
import { Particles } from '../render/particles';
import { style } from '../render/style';
import type { Renderer } from '../render/renderer';
import type { VehicleId } from '../core/vehicles';
import type { Customization } from '../core/save';

const LOOP_ROWS = 24;
const LAYOUT = `
${`
6|  =====  |
1|  =>>>=  |
3|  =====  |
1|  ==!==  |
6|  =====  |
2|  ~===~  |
3|  =====  |
2|  %===%  |
`.repeat(12)}
`;

export type ShowcaseMode = 'menu' | 'garage';

/**
 * Animated backdrop for the menus: the selected ship hovering over an endlessly scrolling
 * neon road, with a slow orbiting camera. In garage mode the camera moves in close.
 */
export class Showcase {
  private env: Environment;
  private view: TrackView;
  private ship: ShipModel;
  private particles: Particles;
  private trackGroup = new THREE.Group();
  private t = 0;
  private scroll = 0;
  mode: ShowcaseMode = 'menu';
  private camPos = new THREE.Vector3(6, 4, 8);
  private shipId: VehicleId;

  constructor(
    private renderer: Renderer,
    vehicle: VehicleId,
    private custom: Customization,
    themeId: ThemeId,
    quality: 'low' | 'medium' | 'high',
  ) {
    const theme = THEMES[themeId];
    const scene = renderer.scene;
    scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
    this.env = new Environment(theme, quality);
    scene.add(this.env.group);
    const track = buildTrack({ width: 9, layout: LAYOUT });
    this.view = new TrackView(track, theme.neon);
    this.trackGroup.add(this.view.group);
    scene.add(this.trackGroup);
    this.view.update(20 * ROW_LENGTH, 0);
    this.shipId = vehicle;
    this.ship = buildShip(vehicle, custom);
    scene.add(this.ship.group);
    this.particles = new Particles(800, style().flat);
    scene.add(this.particles.points);
    this.particles.setViewportHeight(renderer.renderer.domElement.height);
    renderer.onResize = (_w, h) => this.particles.setViewportHeight(h);
  }

  setShip(id: VehicleId, custom: Customization): void {
    this.custom = custom;
    if (id !== this.shipId) {
      this.renderer.scene.remove(this.ship.group);
      this.ship.dispose();
      this.ship = buildShip(id, custom);
      this.renderer.scene.add(this.ship.group);
      this.shipId = id;
    } else this.ship.setCustom(custom);
  }

  frame(dt: number): void {
    this.t += dt;
    const speed = this.mode === 'garage' ? 6 : 18;
    this.scroll = (this.scroll + speed * dt) % (LOOP_ROWS * ROW_LENGTH * 2);
    this.trackGroup.position.z = this.scroll;
    const shipZ = -40;
    const g = this.ship.group;
    g.position.set(Math.sin(this.t * 0.7) * (this.mode === 'garage' ? 0 : 1.1), 0.25 + Math.sin(this.t * 2.1) * 0.08, shipZ);
    this.ship.body.rotation.z = -Math.cos(this.t * 0.7) * (this.mode === 'garage' ? 0 : 0.18);
    this.ship.body.rotation.y = this.mode === 'garage' ? this.t * 0.45 : 0;
    this.ship.setThrust(this.mode === 'garage' ? 0.3 : 0.7, false, this.t);

    // exhaust
    const w = new THREE.Vector3();
    for (const n of this.ship.nozzles) {
      w.copy(n);
      this.ship.body.localToWorld(w);
      this.particles.emit({ x: w.x, y: w.y, z: w.z, vz: speed * 0.5 + 3, spread: 0.2, color: this.custom.trail, color2: '#ffffff', size: 0.3, sizeEnd: 0.02, life: 0.4, drag: 1 });
    }
    this.particles.update(dt);

    const cam = this.renderer.camera;
    let target: THREE.Vector3;
    let look: THREE.Vector3;
    if (this.mode === 'garage') {
      target = new THREE.Vector3(2.4, 1.3, shipZ + 2.6);
      look = new THREE.Vector3(-0.9, 0.35, shipZ);
    } else {
      const a = this.t * 0.12;
      target = new THREE.Vector3(Math.sin(a) * 7 + 2, 3.2 + Math.sin(this.t * 0.3) * 0.6, shipZ + 7 + Math.cos(a) * 2);
      look = new THREE.Vector3(-1.5, 0.8, shipZ - 6);
    }
    this.camPos.lerp(target, 1 - Math.exp(-dt * 2.2));
    cam.position.copy(this.camPos);
    cam.lookAt(look);
    if (Math.abs(cam.fov - this.renderer.baseFov) > 0.01) {
      cam.fov = this.renderer.baseFov;
      cam.updateProjectionMatrix();
    }
    this.view.update(20 * ROW_LENGTH, this.t);
    this.env.update(cam, this.t);
  }

  dispose(): void {
    const scene = this.renderer.scene;
    scene.remove(this.env.group, this.trackGroup, this.ship.group, this.particles.points);
    this.env.dispose();
    this.view.dispose();
    this.ship.dispose();
    this.particles.dispose();
    this.renderer.onResize = null;
    scene.fog = null;
  }
}
