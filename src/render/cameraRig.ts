import * as THREE from 'three';

export interface CameraTarget {
  x: number;
  y: number;
  d: number;
  speed: number;
  vx: number;
  grounded: boolean;
  lost: boolean;
}

/**
 * Third-person chase camera: sits behind and above the ship, follows sideways and vertically
 * with separate damping (so jumps read as jumps), widens the field of view with speed, banks a
 * little into turns, and supports trauma-based screen shake.
 */
export class CameraRig {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private trauma = 0;
  private roll = 0;
  private fovKick = 0;
  private initialized = false;
  stiffness = 1;
  shakeScale = 1;

  constructor(private camera: THREE.PerspectiveCamera, private baseFov: () => number) {}

  /** Pull back and up on portrait screens so the full road width stays visible. */
  private portraitBoost(): number {
    return this.camera.aspect < 1 ? Math.min(1, 1 - this.camera.aspect) : 0;
  }

  snap(t: CameraTarget): void {
    this.initialized = false;
    this.update(1 / 60, t);
  }

  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.shakeScale);
  }

  update(dt: number, t: CameraTarget): void {
    const z = -t.d;
    const pb = this.portraitBoost();
    const desired = new THREE.Vector3(t.x * (0.82 - pb * 0.3), t.y + 2.35 + pb * 2.8 + Math.min(0.6, t.speed * 0.012), z + 5.6 + pb * 4.5 + t.speed * 0.035);
    const lookAt = new THREE.Vector3(t.x * 0.9, t.y + 0.55, z - 9 - t.speed * 0.12);
    if (t.lost) {
      // Stop chasing: let the ship fall away from a camera that stays above the track.
      desired.y = Math.max(this.pos.y, desired.y);
      desired.z = Math.max(this.pos.z - 2 * dt, desired.z);
      lookAt.set(t.x, t.y, z);
    }
    if (!this.initialized) {
      this.pos.copy(desired);
      this.look.copy(lookAt);
      this.initialized = true;
    }
    const k = this.stiffness;
    const ax = 1 - Math.exp(-dt * 6 * k);
    const ay = 1 - Math.exp(-dt * (t.grounded ? 5.5 : 2.6) * k);
    const az = 1 - Math.exp(-dt * 14);
    this.pos.x += (desired.x - this.pos.x) * ax;
    this.pos.y += (desired.y - this.pos.y) * ay;
    this.pos.z += (desired.z - this.pos.z) * az;
    const al = 1 - Math.exp(-dt * 9 * k);
    this.look.x += (lookAt.x - this.look.x) * al;
    this.look.y += (lookAt.y - this.look.y) * (1 - Math.exp(-dt * 4 * k));
    this.look.z = lookAt.z;

    this.roll += (-t.vx * 0.012 - this.roll) * (1 - Math.exp(-dt * 5));
    const kick = Math.max(0, Math.min(14, (t.speed - 16) * 0.55));
    this.fovKick += (kick - this.fovKick) * (1 - Math.exp(-dt * 3));

    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.camera.rotateZ(this.roll);
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      this.camera.position.x += (Math.random() * 2 - 1) * 0.35 * s;
      this.camera.position.y += (Math.random() * 2 - 1) * 0.25 * s;
      this.camera.rotateZ((Math.random() * 2 - 1) * 0.03 * s);
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }
    const fov = this.baseFov() + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
