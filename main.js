// =====================
// BASIC SETUP
// =====================

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("gameCanvas")
});

renderer.setSize(window.innerWidth, window.innerHeight);

// =====================
// LIGHT
// =====================
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

// =====================
// FLOOR
// =====================
const floorGeo = new THREE.PlaneGeometry(100, 100);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// =====================
// PLAYER (YOU)
// =====================
const player = new THREE.Mesh(
  new THREE.BoxGeometry(1, 2, 1),
  new THREE.MeshStandardMaterial({ color: 0x00aaff })
);
player.position.y = 1;
scene.add(player);

// camera offset
camera.position.set(0, 2, 5);

// =====================
// MOVEMENT
// =====================
const keys = {};

document.addEventListener("keydown", (e) => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

// =====================
// SHOOTING
// =====================
const raycaster = new THREE.Raycaster();

document.addEventListener("click", () => {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  const hits = raycaster.intersectObjects(scene.children);
  if (hits.length > 0) {
    hits[0].object.material.color.set(0xff0000);
  }
});

// =====================
// BUILD SYSTEM (TEST WALL)
// =====================
function buildWall() {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x5555ff })
  );

  wall.position.set(
    player.position.x,
    1,
    player.position.z - 5
  );

  scene.add(wall);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "q") buildWall();
});

// =====================
// GAME LOOP
// =====================
function animate() {
  requestAnimationFrame(animate);

  // movement
  if (keys["w"]) player.position.z -= 0.1;
  if (keys["s"]) player.position.z += 0.1;
  if (keys["a"]) player.position.x -= 0.1;
  if (keys["d"]) player.position.x += 0.1;

  // camera follows player
  camera.position.x = player.position.x;
  camera.position.z = player.position.z + 5;
  camera.lookAt(player.position);

  renderer.render(scene, camera);
}

animate();
