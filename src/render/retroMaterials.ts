import * as THREE from 'three';

/** Flat-shaded Lambert material used by the Arcade look. */
export function retroMat(params: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ flatShading: true, ...params });
}
