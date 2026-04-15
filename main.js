let scene = new THREE.Scene();
let camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
let renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.z = 5;

// players
let players = {};
let myId = null;

// connect to server
const socket = new WebSocket("ws://localhost:3000");

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "init") {
        myId = data.id;
        players = data.players;

        for (let id in players) {
            createPlayer(id);
        }
    }

    if (data.type === "update") {
        players = data.players;

        for (let id in players) {
            if (!scene.getObjectByName(id)) {
                createPlayer(id);
            }

            let p = scene.getObjectByName(id);
            if (p) {
                p.position.set(players[id].x, players[id].y, players[id].z);
            }
        }
    }
};

// player mesh
function createPlayer(id) {
    let geo = new THREE.BoxGeometry();
    let mat = new THREE.MeshBasicMaterial({ color: 0x00aaff });
    let cube = new THREE.Mesh(geo, mat);
    cube.name = id;
    scene.add(cube);
}

// movement
document.addEventListener("keydown", (e) => {
    if (!players[myId]) return;

    if (e.key === "w") players[myId].z -= 0.2;
    if (e.key === "s") players[myId].z += 0.2;
    if (e.key === "a") players[myId].x -= 0.2;
    if (e.key === "d") players[myId].x += 0.2;

    socket.send(JSON.stringify({
        type: "move",
        position: players[myId]
    }));
});

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
