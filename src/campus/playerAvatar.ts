import * as THREE from 'three';

export interface PlayerAvatarRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  updateAnimation: (speedRatio: number, isGrounded: boolean, elapsed: number, delta: number) => void;
}

export function createStudentAvatar(contactShadowTex: THREE.Texture): PlayerAvatarRig {
  const root = new THREE.Group();
  root.name = 'ChitkaraStudentAvatar';

  // Soft ground contact shadow
  const shadowGeo = new THREE.PlaneGeometry(1.5, 1.5);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.03;
  root.add(shadowMesh);

  // Body pivot for bobbing & jump squash
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Materials with clear roughness/metalness contrast
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe6b89c, roughness: 0.75, metalness: 0.0 });
  const hoodieMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.85, metalness: 0.05 }); // Chitkara Crimson
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6, metalness: 0.05 });
  const denimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9, metalness: 0.02 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55, metalness: 0.05 });
  const soleMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, metalness: 0.0 });
  const packMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8, metalness: 0.1 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85, metalness: 0.05 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.1 });

  // Helper to build articulated leg pivoted at hip (y = 0.82)
  const buildLeg = (offsetX: number): THREE.Group => {
    const hip = new THREE.Group();
    hip.position.set(offsetX, 0.82, 0);

    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.25), denimMat);
    thigh.position.y = -0.36;
    thigh.castShadow = true;
    hip.add(thigh);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.34), shoeMat);
    shoe.position.set(0, -0.76, 0.04);
    shoe.castShadow = true;
    hip.add(shoe);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.36), soleMat);
    sole.position.set(0, -0.81, 0.04);
    hip.add(sole);

    return hip;
  };

  const leftLeg = buildLeg(-0.16);
  const rightLeg = buildLeg(0.16);
  bodyPivot.add(leftLeg, rightLeg);

  // Torso (Chitkara Varsity Hoodie)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.76, 0.36), hoodieMat);
  torso.position.y = 1.22;
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyPivot.add(torso);

  // Varsity chest stripe
  const chestStripe = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.37), stripeMat);
  chestStripe.position.y = 1.32;
  bodyPivot.add(chestStripe);

  // Backpack
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.22), packMat);
  backpack.position.set(0, 1.24, -0.27);
  backpack.castShadow = true;
  bodyPivot.add(backpack);

  const packAccent = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.04), hoodieMat);
  packAccent.position.set(0, 1.38, -0.39);
  bodyPivot.add(packAccent);

  // Articulated Arms pivoted at shoulders (y = 1.52)
  const buildArm = (offsetX: number): THREE.Group => {
    const shoulder = new THREE.Group();
    shoulder.position.set(offsetX, 1.52, 0);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.54, 0.2), hoodieMat);
    sleeve.position.y = -0.25;
    sleeve.castShadow = true;
    shoulder.add(sleeve);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.16), skinMat);
    hand.position.y = -0.56;
    hand.castShadow = true;
    shoulder.add(hand);

    return shoulder;
  };

  const leftArm = buildArm(-0.42);
  const rightArm = buildArm(0.42);
  bodyPivot.add(leftArm, rightArm);

  // Head + Hair + Cap visor
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skinMat);
  head.position.y = 1.86;
  head.castShadow = true;
  bodyPivot.add(head);

  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.16, 0.47), hairMat);
  hair.position.set(0, 2.04, -0.02);
  bodyPivot.add(hair);

  const capCrown = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.48), capMat);
  capCrown.position.set(0, 2.1, 0);
  bodyPivot.add(capCrown);

  const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.22), hoodieMat);
  capVisor.position.set(0, 2.04, 0.28);
  bodyPivot.add(capVisor);

  let walkPhase = 0;

  const updateAnimation = (
    speedRatio: number,
    isGrounded: boolean,
    elapsed: number,
    delta: number,
  ) => {
    if (speedRatio > 0.05 && isGrounded) {
      walkPhase += delta * (7 + speedRatio * 5.5);
      const swing = Math.sin(walkPhase) * Math.min(0.85, 0.25 + speedRatio * 0.65);
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      leftArm.rotation.x = -swing * 0.85;
      rightArm.rotation.x = swing * 0.85;
      bodyPivot.position.y = Math.abs(Math.sin(walkPhase)) * 0.07 * speedRatio;
      bodyPivot.rotation.x = THREE.MathUtils.damp(bodyPivot.rotation.x, 0.08 * speedRatio, 10, delta);
    } else if (!isGrounded) {
      leftLeg.rotation.x = THREE.MathUtils.damp(leftLeg.rotation.x, 0.35, 12, delta);
      rightLeg.rotation.x = THREE.MathUtils.damp(rightLeg.rotation.x, -0.25, 12, delta);
      leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, -0.5, 12, delta);
      rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, -0.5, 12, delta);
      bodyPivot.position.y = THREE.MathUtils.damp(bodyPivot.position.y, 0, 12, delta);
      bodyPivot.rotation.x = THREE.MathUtils.damp(bodyPivot.rotation.x, 0, 10, delta);
    } else {
      // Gentle idle breathing
      leftLeg.rotation.x = THREE.MathUtils.damp(leftLeg.rotation.x, 0, 12, delta);
      rightLeg.rotation.x = THREE.MathUtils.damp(rightLeg.rotation.x, 0, 12, delta);
      leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, Math.sin(elapsed * 1.8) * 0.04, 10, delta);
      rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, -Math.sin(elapsed * 1.8) * 0.04, 10, delta);
      bodyPivot.position.y = Math.sin(elapsed * 2.2) * 0.015;
      bodyPivot.rotation.x = THREE.MathUtils.damp(bodyPivot.rotation.x, 0, 10, delta);
    }
  };

  return {
    root,
    bodyPivot,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    updateAnimation,
  };
}
