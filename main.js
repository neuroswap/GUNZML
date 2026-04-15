'use strict';
/* ═══════════════════════════════════════
   GunzML v2 — main.js
   Fixes: camera inversion, better models,
   Fortnite-style building, settings/sens,
   skins system, practice range
═══════════════════════════════════════ */

/* ── CONFIG ── */
const CONFIG = {
  SERVER_URL:'ws://localhost:3000',
  DISCORD_WEBHOOK:'YOUR_WEBHOOK_HERE',
  ADMIN_PASSWORD:'GunzML@Admin#2024',
  GRAVITY:-22,
  GRID_SIZE:4,
  GROUND_SIZE:220,
  PLAYER_MASS:70,
  PLAYER_RADIUS:0.42,
  PLAYER_HEIGHT:1.8,
  PLAYER_SPEED:11,
  SPRINT_MULT:1.65,
  JUMP_FORCE:10,
  FOV:75,
  CAM_DISTANCE:5.5,
  CAM_HEIGHT:2.6,
  CAM_PITCH_MIN:-0.5,
  CAM_PITCH_MAX:1.15,
  MOUSE_SENS:3.0,         // user-settable (1-15 scale)
  ADS_SENS:1.5,
  INVERT_Y:false,
  MAX_HEALTH:100,
  BULLET_DAMAGE:22,
  HEADSHOT_MULT:1.75,
  SHOOT_COOLDOWN:110,
  RELOAD_TIME:2000,
  MAX_AMMO:30,
  RESERVE_AMMO:120,
  SHOOT_RANGE:600,
  BUILD_REACH:20,
  NET_TICK:50,
  RESPAWN_POS:{x:0,y:5,z:0},
};

/* ── DEFAULT KEYBINDS ── */
const DEFAULT_BINDS = {
  forward:'KeyW', backward:'KeyS', left:'KeyA', right:'KeyD',
  jump:'Space', sprint:'ShiftLeft', reload:'KeyR',
  build:'KeyB', wall:'KeyQ', floor:'KeyC', ramp:'KeyV', stair:'KeyZ',
  shoot:'Mouse0',
};

/* ── SKINS DEFINITIONS ── */
const SKINS = [
  {id:'default',  name:'DEFAULT',   body:0x2255aa, head:0xd4a96a, legs:0x1a3d7a},
  {id:'red',      name:'RED OPS',   body:0xaa2222, head:0xd4a96a, legs:0x881111},
  {id:'green',    name:'GHOST',     body:0x2a6634, head:0xb5c99a, legs:0x1e4d27},
  {id:'black',    name:'SHADOW',    body:0x1a1a1a, head:0xc8a882, legs:0x111111},
  {id:'gold',     name:'ELITE',     body:0xcc9900, head:0xd4a96a, legs:0x997700},
  {id:'cyan',     name:'CYBER',     body:0x006688, head:0xb8d4dc, legs:0x004455},
  {id:'purple',   name:'WRAITH',    body:0x551a8b, head:0xd4a96a, legs:0x3d1266},
  {id:'camo',     name:'JUNGLE',    body:0x4a6741, head:0xb5a898, legs:0x3d5538},
  {id:'arctic',   name:'ARCTIC',    body:0xc8d8e8, head:0xf0e8dc, legs:0xa8b8c8},
];

/* ── STATE ── */
const State = {
  phase:'loading',
  playerName:'Operator',
  localId:null,
  health:CONFIG.MAX_HEALTH,
  ammo:CONFIG.MAX_AMMO,
  reserveAmmo:CONFIG.RESERVE_AMMO,
  kills:0, shots:0, hits:0,
  buildMode:false,
  buildType:'wall',
  isAdmin:false,
  players:{},
  structures:[],
  reports:[],
  bannedIds:[],
  config:{},
  selectedSkin:'default',
  equippedSkin:'default',
  binds:{...DEFAULT_BINDS},
  isPractice:false,
  practiceHits:0,
  practiceShots:0,
  practiceStart:0,
  practiceTargets:[],
};

/* ═══════════════════════════════════════
   STORAGE
═══════════════════════════════════════ */
const StorageManager = {
  load(){
    try{
      const cfg=JSON.parse(localStorage.getItem('gz_cfg')||'{}');
      const bans=JSON.parse(localStorage.getItem('gz_bans')||'[]');
      const reports=JSON.parse(localStorage.getItem('gz_reports')||'[]');
      State.bannedIds=bans;
      State.reports=reports;
      State.config=cfg;
      State.playerName=localStorage.getItem('gz_name')||'Operator';
      State.equippedSkin=localStorage.getItem('gz_skin')||'default';
      State.selectedSkin=State.equippedSkin;
      if(cfg.adminPassword) CONFIG.ADMIN_PASSWORD=cfg.adminPassword;
      if(cfg.discordWebhook) CONFIG.DISCORD_WEBHOOK=cfg.discordWebhook;
      if(cfg.serverUrl) CONFIG.SERVER_URL=cfg.serverUrl;
      // Load settings
      if(cfg.sens!==undefined) CONFIG.MOUSE_SENS=cfg.sens;
      if(cfg.adsSens!==undefined) CONFIG.ADS_SENS=cfg.adsSens;
      if(cfg.invertY!==undefined) CONFIG.INVERT_Y=cfg.invertY;
      if(cfg.fov!==undefined) CONFIG.FOV=cfg.fov;
      if(cfg.binds) State.binds={...DEFAULT_BINDS,...cfg.binds};
    }catch(e){console.warn('[Storage]',e);}
  },
  saveBans(){localStorage.setItem('gz_bans',JSON.stringify(State.bannedIds));},
  saveReports(){localStorage.setItem('gz_reports',JSON.stringify(State.reports));},
  saveConfig(c){State.config={...State.config,...c};localStorage.setItem('gz_cfg',JSON.stringify(State.config));},
  saveName(n){localStorage.setItem('gz_name',n);},
  saveSkin(id){localStorage.setItem('gz_skin',id);},
  saveSettings(s){this.saveConfig(s);},
  saveStats(){
    const s=JSON.parse(localStorage.getItem('gz_stats')||'{}');
    s.kills=(s.kills||0)+State.kills;
    s.shots=(s.shots||0)+State.shots;
    localStorage.setItem('gz_stats',JSON.stringify(s));
  },
};

/* ═══════════════════════════════════════
   INPUT
═══════════════════════════════════════ */
const Input = {
  keys:{},
  mouse:{dx:0,dy:0,lmb:false,rmb:false,lmbJustDown:false},
  locked:false,
  _rebinding:null,

  init(){
    document.addEventListener('keydown',e=>{
      if(this._rebinding){this._finishRebind(e.code);return;}
      this.keys[e.code]=true;
      this._special(e);
    });
    document.addEventListener('keyup',e=>{this.keys[e.code]=false;});
    document.addEventListener('mousemove',e=>{
      if(this.locked){this.mouse.dx+=e.movementX||0;this.mouse.dy+=e.movementY||0;}
    });
    document.addEventListener('mousedown',e=>{
      if(e.button===0){this.mouse.lmb=true;this.mouse.lmbJustDown=true;}
      if(e.button===2) this.mouse.rmb=true;
    });
    document.addEventListener('mouseup',e=>{
      if(e.button===0) this.mouse.lmb=false;
      if(e.button===2) this.mouse.rmb=false;
    });
    document.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('pointerlockchange',()=>{
      this.locked=document.pointerLockElement===Game.renderer.domElement;
      if(!this.locked&&State.phase==='playing') UIManager.showPause();
    });
  },

  _special(e){
    const b=State.binds;
    if(e.code===b.build&&State.phase==='playing') BuildingSystem.toggle();
    if(State.buildMode&&State.phase==='playing'){
      if(e.code===b.wall)  BuildingSystem.setType('wall');
      if(e.code===b.floor) BuildingSystem.setType('floor');
      if(e.code===b.ramp)  BuildingSystem.setType('ramp');
      if(e.code===b.stair) BuildingSystem.setType('stair');
    }
    if(e.code===b.reload&&State.phase==='playing') CombatSystem.startReload();
    if(e.code==='Escape'){
      if(State.phase==='playing') UIManager.showPause();
      else if(State.phase==='paused') UIManager.resumeGame();
    }
    if(e.code==='Tab'){e.preventDefault();UIManager.togglePlayerList(true);}
    if(e.shiftKey&&e.code==='Backquote') AdminSystem.toggleConsole();
  },

  consumeMouse(){
    const d={...this.mouse};
    this.mouse.dx=0;this.mouse.dy=0;
    this.mouse.lmbJustDown=false;
    return d;
  },

  startRebind(action,callback){
    this._rebinding={action,callback};
  },

  _finishRebind(code){
    if(!this._rebinding) return;
    const {action,callback}=this._rebinding;
    this._rebinding=null;
    // Remove old binding if duplicate
    for(const k in State.binds){if(State.binds[k]===code) State.binds[k]='';} 
    State.binds[action]=code;
    callback(code);
  },

  requestLock(){Game.renderer.domElement.requestPointerLock();},
  releaseLock(){document.exitPointerLock();},
  isDown(action){return !!this.keys[State.binds[action]];}
};

document.addEventListener('keyup',e=>{if(e.code==='Tab') UIManager.togglePlayerList(false);});

/* ═══════════════════════════════════════
   PHYSICS
═══════════════════════════════════════ */
const PhysicsManager = {
  world:null,bodies:[],
  groundMat:null,playerMat:null,buildMat:null,

  init(){
    this.world=new CANNON.World();
    this.world.gravity.set(0,CONFIG.GRAVITY,0);
    this.world.broadphase=new CANNON.NaiveBroadphase();
    this.world.solver.iterations=10;
    this.world.allowSleep=true;

    this.groundMat=new CANNON.Material('ground');
    this.playerMat=new CANNON.Material('player');
    this.buildMat=new CANNON.Material('build');

    this.world.addContactMaterial(new CANNON.ContactMaterial(this.groundMat,this.playerMat,{friction:0.35,restitution:0}));
    this.world.addContactMaterial(new CANNON.ContactMaterial(this.buildMat,this.playerMat,{friction:0.3,restitution:0}));

    const groundBody=new CANNON.Body({mass:0,material:this.groundMat});
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1,0,0),-Math.PI/2);
    this.world.addBody(groundBody);
  },

  step(dt){
    this.world.step(1/60,dt,3);
    for(const p of this.bodies){
      if(!p.body||!p.mesh) continue;
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);
    }
  },

  addSync(body,mesh){this.bodies.push({body,mesh});},

  createBoxBody(w,h,d,mass,position,material){
    const body=new CANNON.Body({mass:mass||0,material:material||this.buildMat});
    body.addShape(new CANNON.Box(new CANNON.Vec3(w/2,h/2,d/2)));
    if(position) body.position.set(position.x,position.y,position.z);
    this.world.addBody(body);
    return body;
  },

  removeBody(body){
    this.world.remove(body);
    this.bodies=this.bodies.filter(p=>p.body!==body);
  },
};

/* ═══════════════════════════════════════
   CHARACTER MODEL BUILDER
═══════════════════════════════════════ */
const ModelBuilder = {
  buildPlayer(skinId,isLocal){
    const skin=SKINS.find(s=>s.id===skinId)||SKINS[0];
    const group=new THREE.Group();

    const bodyMat =new THREE.MeshLambertMaterial({color:skin.body});
    const headMat =new THREE.MeshLambertMaterial({color:skin.head});
    const legMat  =new THREE.MeshLambertMaterial({color:skin.legs});
    const darkMat =new THREE.MeshLambertMaterial({color:0x111111});

    // TORSO
    const torso=new THREE.Mesh(new THREE.BoxGeometry(0.65,0.75,0.38),bodyMat);
    torso.position.y=0.85;
    group.add(torso);

    // HEAD
    const head=new THREE.Mesh(new THREE.BoxGeometry(0.52,0.5,0.48),headMat);
    head.position.y=1.52;
    group.add(head);

    // Eyes
    const eyeGeo=new THREE.BoxGeometry(0.1,0.06,0.05);
    const eyeMat=new THREE.MeshLambertMaterial({color:0x111122});
    const eyeL=new THREE.Mesh(eyeGeo,eyeMat);eyeL.position.set(-0.13,1.56,0.25);group.add(eyeL);
    const eyeR=new THREE.Mesh(eyeGeo,eyeMat);eyeR.position.set(0.13,1.56,0.25);group.add(eyeR);

    // Helmet visor strip
    const visor=new THREE.Mesh(new THREE.BoxGeometry(0.54,0.14,0.02),darkMat);
    visor.position.set(0,1.58,0.25);
    group.add(visor);

    // LEFT ARM
    const armL=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.65,0.22),bodyMat);
    armL.position.set(-0.435,0.82,0);
    group.add(armL);
    // LEFT HAND
    const handL=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.18,0.2),headMat);
    handL.position.set(-0.435,0.47,0.05);
    group.add(handL);

    // RIGHT ARM
    const armR=new THREE.Mesh(new THREE.BoxGeometry(0.2,0.65,0.22),bodyMat);
    armR.position.set(0.435,0.82,0);
    group.add(armR);
    // RIGHT HAND / GUN stub
    const handR=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.18,0.2),headMat);
    handR.position.set(0.435,0.47,0.05);
    group.add(handR);

    // Weapon (visible on remote players)
    if(!isLocal){
      const gunBody=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.1,0.45),darkMat);
      gunBody.position.set(0.44,0.44,0.28);
      group.add(gunBody);
    }

    // LEFT LEG
    const legL=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.65,0.28),legMat);
    legL.position.set(-0.19,0.27,0);
    group.add(legL);
    // LEFT FOOT
    const footL=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.12,0.34),darkMat);
    footL.position.set(-0.19,-0.08,0.04);
    group.add(footL);

    // RIGHT LEG
    const legR=new THREE.Mesh(new THREE.BoxGeometry(0.26,0.65,0.28),legMat);
    legR.position.set(0.19,0.27,0);
    group.add(legR);
    // RIGHT FOOT
    const footR=new THREE.Mesh(new THREE.BoxGeometry(0.24,0.12,0.34),darkMat);
    footR.position.set(0.19,-0.08,0.04);
    group.add(footR);

    // Backpack
    const pack=new THREE.Mesh(new THREE.BoxGeometry(0.45,0.55,0.2),legMat);
    pack.position.set(0,0.9,-0.29);
    group.add(pack);

    group.traverse(c=>{if(c.isMesh){c.castShadow=true;c.receiveShadow=true;}});
    return group;
  },
};

/* ═══════════════════════════════════════
   PLAYER CONTROLLER
═══════════════════════════════════════ */
const PlayerController = {
  body:null,mesh:null,
  camYaw:0,camPitch:0.25,
  isGrounded:false,canJump:true,
  reloading:false,
  _lmbWasDown:false,

  init(scene){
    this.body=new CANNON.Body({
      mass:CONFIG.PLAYER_MASS,
      material:PhysicsManager.playerMat,
      linearDamping:0.92,
      angularDamping:1,
      fixedRotation:true,
    });
    this.body.addShape(new CANNON.Sphere(CONFIG.PLAYER_RADIUS));
    this.body.position.set(CONFIG.RESPAWN_POS.x,CONFIG.RESPAWN_POS.y,CONFIG.RESPAWN_POS.z);
    PhysicsManager.world.addBody(this.body);

    this.body.addEventListener('collide',(e)=>{
      if(Math.abs(e.contact.ni.y)>0.5){
        this.isGrounded=true;this.canJump=true;
      }
    });

    this.mesh=ModelBuilder.buildPlayer(State.equippedSkin,true);
    scene.add(this.mesh);
  },

  update(dt){
    if(State.phase!=='playing'&&State.phase!=='practice') return;
    const mouse=Input.consumeMouse();

    // SENS scaling: range 0.5-15 → multiply by 0.0004 base factor
    const sensFactor=CONFIG.MOUSE_SENS*0.00052;
    const invertMult=CONFIG.INVERT_Y?1:-1;

    this.camYaw  -=mouse.dx*sensFactor;
    this.camPitch +=mouse.dy*sensFactor*invertMult;
    this.camPitch =Math.max(CONFIG.CAM_PITCH_MIN,Math.min(CONFIG.CAM_PITCH_MAX,this.camPitch));

    const sprint=Input.isDown('sprint');
    const speed =CONFIG.PLAYER_SPEED*(sprint?CONFIG.SPRINT_MULT:1);
    const fwdX=-Math.sin(this.camYaw),fwdZ=-Math.cos(this.camYaw);
    const rgtX= Math.cos(this.camYaw),rgtZ=-Math.sin(this.camYaw);

    let mx=0,mz=0;
    if(Input.isDown('forward'))  {mx+=fwdX;mz+=fwdZ;}
    if(Input.isDown('backward')) {mx-=fwdX;mz-=fwdZ;}
    if(Input.isDown('left'))     {mx-=rgtX;mz-=rgtZ;}
    if(Input.isDown('right'))    {mx+=rgtX;mz+=rgtZ;}

    const len=Math.sqrt(mx*mx+mz*mz);
    if(len>0){mx/=len;mz/=len;}
    this.body.velocity.x=mx*speed;
    this.body.velocity.z=mz*speed;

    if(Input.isDown('jump')&&this.isGrounded&&this.canJump){
      this.body.velocity.y=CONFIG.JUMP_FORCE;
      this.isGrounded=false;this.canJump=false;
      setTimeout(()=>{this.canJump=true;},380);
    }
    this.isGrounded=false;

    const pos=this.body.position;
    this.mesh.position.set(pos.x,pos.y-CONFIG.PLAYER_RADIUS,pos.z);
    this.mesh.rotation.y=this.camYaw;

    this._updateCamera();
    if(pos.y<-60) this.respawn();
  },

  _updateCamera(){
    const pos=this.body.position;
    const dist=CONFIG.CAM_DISTANCE*(Input.mouse.rmb?0.4:1);
    const pitch=this.camPitch;
    const yaw=this.camYaw;
    Game.camera.position.set(
      pos.x+dist*Math.sin(yaw)*Math.cos(pitch),
      pos.y+CONFIG.CAM_HEIGHT+dist*Math.sin(pitch),
      pos.z+dist*Math.cos(yaw)*Math.cos(pitch)
    );
    Game.camera.lookAt(pos.x,pos.y+CONFIG.CAM_HEIGHT*0.45,pos.z);
    if(Game.camera.fov!==CONFIG.FOV){Game.camera.fov=CONFIG.FOV;Game.camera.updateProjectionMatrix();}
  },

  respawn(){
    this.body.position.set(CONFIG.RESPAWN_POS.x,CONFIG.RESPAWN_POS.y,CONFIG.RESPAWN_POS.z);
    this.body.velocity.set(0,0,0);
    State.health=CONFIG.MAX_HEALTH;
    State.ammo=CONFIG.MAX_AMMO;
    State.phase='playing';
    UIManager.updateHealth();UIManager.updateAmmo();
    UIManager.hideScreen('deathScreen');
  },

  takeDamage(amount,attackerName){
    State.health=Math.max(0,State.health-amount);
    UIManager.updateHealth();
    UIManager.flashDamage();
    if(State.health<=0){
      State.phase='dead';
      StorageManager.saveStats();
      UIManager.showDeath(attackerName||'an enemy');
    }
  },
};

/* ═══════════════════════════════════════
   BUILDING SYSTEM — Fortnite-style
═══════════════════════════════════════ */
const BuildingSystem = {
  scene:null,ghostMesh:null,ghostMat:null,
  placements:[],raycaster:null,
  _lastPlace:0,

  init(scene){
    this.scene=scene;
    this.raycaster=new THREE.Raycaster();
    this.ghostMat=new THREE.MeshBasicMaterial({
      color:0x39ff8f,opacity:0.35,transparent:true,depthWrite:false,side:THREE.DoubleSide
    });
    // Click on build slots in HUD
    document.querySelectorAll('.bslot').forEach(el=>{
      el.addEventListener('click',()=>{
        if(!State.buildMode) this.toggle();
        this.setType(el.dataset.type);
      });
    });
  },

  toggle(){
    State.buildMode=!State.buildMode;
    UIManager.toggleBuildHUD(State.buildMode);
    if(!State.buildMode&&this.ghostMesh){this.scene.remove(this.ghostMesh);this.ghostMesh=null;}
    if(State.buildMode) this.setType(State.buildType);
  },

  setType(type){
    State.buildType=type;
    document.querySelectorAll('.bslot').forEach(el=>el.classList.toggle('active',el.dataset.type===type));
    if(this.ghostMesh){this.scene.remove(this.ghostMesh);this.ghostMesh=null;}
  },

  _dims(){
    switch(State.buildType){
      case'wall':  return{w:4,h:3.2,d:0.3};
      case'floor': return{w:4,h:0.25,d:4};
      case'ramp':  return{w:4,h:3.2,d:4};
      case'stair': return{w:4,h:3.2,d:4};
    }
    return{w:4,h:3.2,d:0.3};
  },

  _makeGeo(){
    const{w,h,d}=this._dims();
    if(State.buildType==='ramp'||State.buildType==='stair'){
      return this._wedgeGeo(w,h,d,State.buildType==='stair');
    }
    return new THREE.BoxGeometry(w,h,d);
  },

  _wedgeGeo(w,h,d,stair){
    const geo=new THREE.BufferGeometry();
    if(stair){
      // Simple stepped look via box (full box for collision simplicity)
      return new THREE.BoxGeometry(w,h*0.5,d);
    }
    // Ramp wedge
    const v=new Float32Array([
      -w/2,0,-d/2, w/2,0,-d/2, w/2,0,d/2, -w/2,0,d/2,   // bottom
      -w/2,h,-d/2, w/2,h,-d/2,                             // top back edge
    ]);
    const idx=[
      0,1,2, 0,2,3,       // bottom
      0,4,5, 0,5,1,       // back
      0,3,4, 3,4,4,       // wrong, fix:
    ];
    // Use simple approach: BoxGeometry rotated for ramp appearance
    return new THREE.BoxGeometry(w,h*0.15,d);
  },

  _snap(pos){
    const g=CONFIG.GRID_SIZE;
    return new THREE.Vector3(
      Math.round(pos.x/g)*g,
      Math.round(pos.y/g)*g,
      Math.round(pos.z/g)*g
    );
  },

  update(){
    if(!State.buildMode||(State.phase!=='playing'&&State.phase!=='practice')) return;
    this.raycaster.setFromCamera(new THREE.Vector2(0,0),Game.camera);
    const targets=[Game.groundMesh,...this.placements.map(p=>p.mesh)];
    const hits=this.raycaster.intersectObjects(targets,false);

    let placePos=null;
    if(hits.length>0&&hits[0].distance<CONFIG.BUILD_REACH){
      placePos=this._snap(hits[0].point);
    }

    if(placePos){
      const{h}=this._dims();
      if(!this.ghostMesh){
        this.ghostMesh=new THREE.Mesh(this._makeGeo(),this.ghostMat);
        this.scene.add(this.ghostMesh);
      }
      this.ghostMesh.position.set(placePos.x,placePos.y+h/2,placePos.z);
      if(State.buildType==='wall') this.ghostMesh.rotation.y=PlayerController.camYaw;
      else this.ghostMesh.rotation.y=0;
    } else if(this.ghostMesh){
      this.scene.remove(this.ghostMesh);this.ghostMesh=null;
    }

    // Place on LMB (only once per click)
    if(Input.mouse.lmbJustDown&&placePos) this.place(placePos);
  },

  _buildColor(){
    switch(State.buildType){
      case'wall':  return 0xd4c4a8;
      case'floor': return 0xa89880;
      case'ramp':  return 0xb8aa94;
      case'stair': return 0xc4b89c;
    }
    return 0xd4c4a8;
  },

  place(pos){
    const now=Date.now();
    if(now-this._lastPlace<160) return;
    this._lastPlace=now;

    const{w,h,d}=this._dims();
    const yaw=State.buildType==='wall'?PlayerController.camYaw:0;

    const geo=State.buildType==='ramp'||State.buildType==='stair'
      ?new THREE.BoxGeometry(w,h*0.5,d)
      :new THREE.BoxGeometry(w,h,d);

    const mat=new THREE.MeshLambertMaterial({color:this._buildColor()});
    const mesh=new THREE.Mesh(geo,mat);
    const actualH=State.buildType==='ramp'||State.buildType==='stair'?h*0.5:h;
    mesh.position.set(pos.x,pos.y+actualH/2,pos.z);
    mesh.rotation.y=yaw;
    mesh.castShadow=true;mesh.receiveShadow=true;
    this.scene.add(mesh);

    const body=PhysicsManager.createBoxBody(w,actualH,d,0,
      {x:pos.x,y:pos.y+actualH/2,z:pos.z},PhysicsManager.buildMat);
    if(yaw!==0) body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),yaw);

    const entry={mesh,body,type:State.buildType};
    this.placements.push(entry);
    State.structures.push(entry);
    NetworkManager.sendBuild({type:State.buildType,x:pos.x,y:pos.y,z:pos.z,yaw});
  },

  addRemote(data){
    const savedType=State.buildType;
    const savedYaw=PlayerController.camYaw;
    State.buildType=data.type;
    PlayerController.camYaw=data.yaw||0;
    this.place(new THREE.Vector3(data.x,data.y,data.z));
    State.buildType=savedType;
    PlayerController.camYaw=savedYaw;
  },

  clearAll(){
    for(const p of this.placements){
      this.scene.remove(p.mesh);
      PhysicsManager.removeBody(p.body);
    }
    this.placements=[];
    State.structures=[];
  },
};

/* ═══════════════════════════════════════
   COMBAT
═══════════════════════════════════════ */
const CombatSystem = {
  raycaster:null,lastShot:0,reloading:false,
  _reloadStart:0,_reloadTimer:null,

  init(){this.raycaster=new THREE.Raycaster();},

  update(){
    if(State.phase!=='playing'&&State.phase!=='practice') return;
    if(this.reloading) return;
    if(State.buildMode){
      // In build mode only place, don't shoot
      return;
    }
    if(Input.mouse.lmbJustDown) this.tryShoot();
  },

  tryShoot(){
    const now=Date.now();
    if(now-this.lastShot<CONFIG.SHOOT_COOLDOWN) return;
    if(State.ammo<=0){this.startReload();return;}
    this.lastShot=now;
    State.ammo--;State.shots++;
    UIManager.updateAmmo();
    this._shootSound();

    this.raycaster.setFromCamera(new THREE.Vector2(0,0),Game.camera);
    const targets=[];
    for(const id in State.players){if(State.players[id].mesh) targets.push(State.players[id].mesh);}
    BuildingSystem.placements.forEach(p=>targets.push(p.mesh));
    targets.push(Game.groundMesh);
    // Practice targets
    if(State.isPractice) State.practiceTargets.forEach(t=>{if(t.mesh) targets.push(t.mesh);});

    const allMeshes=[];
    targets.forEach(t=>{allMeshes.push(t);t.children&&t.children.forEach(c=>allMeshes.push(c));});
    const hits=this.raycaster.intersectObjects(allMeshes,false);

    if(hits.length>0){
      this._spawnImpact(hits[0].point);

      // Practice target hit?
      if(State.isPractice){
        for(const pt of State.practiceTargets){
          if(!pt.mesh) continue;
          if(hits[0].object===pt.mesh||pt.mesh.children.includes(hits[0].object)){
            PracticeRange.registerHit(pt);
            UIManager.showHitMarker();
            break;
          }
        }
      }

      // Remote player hit?
      for(const id in State.players){
        const p=State.players[id];if(!p.mesh) continue;
        let found=false;
        p.mesh.traverse(c=>{if(c===hits[0].object) found=true;});
        if(found){
          const isHead=hits[0].object.position.y>0.8;
          const dmg=Math.round(CONFIG.BULLET_DAMAGE*(isHead?CONFIG.HEADSHOT_MULT:1));
          State.hits++;
          UIManager.showHitMarker();
          NetworkManager.sendHit({targetId:id,damage:dmg});
          break;
        }
      }
    }

    if(State.isPractice){State.practiceShots++;UIManager.updatePracticeHUD();}
    if(State.ammo<=0) setTimeout(()=>this.startReload(),300);
  },

  startReload(){
    if(this.reloading||State.reserveAmmo<=0||State.ammo===CONFIG.MAX_AMMO) return;
    this.reloading=true;this._reloadStart=Date.now();
    UIManager.showReloadBar(true);
    this._reloadTimer=setTimeout(()=>{
      const need=CONFIG.MAX_AMMO-State.ammo;
      const take=Math.min(need,State.reserveAmmo);
      State.ammo+=take;State.reserveAmmo-=take;
      this.reloading=false;
      UIManager.updateAmmo();UIManager.showReloadBar(false);
    },CONFIG.RELOAD_TIME);
  },

  _spawnImpact(point){
    const m=new THREE.Mesh(
      new THREE.SphereGeometry(0.07,4,4),
      new THREE.MeshBasicMaterial({color:0xffaa44})
    );
    m.position.copy(point);
    Game.scene.add(m);
    setTimeout(()=>Game.scene.remove(m),280);
  },

  _shootSound(){
    try{
      const ctx=new(window.AudioContext||window.webkitAudioContext)();
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      const dist=ctx.createWaveShaper();
      // Simple distortion
      const curve=new Float32Array(256);
      for(let i=0;i<256;i++){const x=i*2/256-1;curve[i]=x<0?-Math.pow(-x,0.5):Math.pow(x,0.5);}
      dist.curve=curve;
      osc.connect(dist);dist.connect(gain);gain.connect(ctx.destination);
      osc.type='sawtooth';
      osc.frequency.setValueAtTime(160,ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(55,ctx.currentTime+0.09);
      gain.gain.setValueAtTime(0.22,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.14);
      osc.start();osc.stop(ctx.currentTime+0.14);
    }catch(_){}
  },
};

/* ═══════════════════════════════════════
   PRACTICE RANGE
═══════════════════════════════════════ */
const PracticeRange = {
  targets:[],_interval:null,_timerInterval:null,

  build(scene){
    this.scene=scene;
    this.targets=[];
    State.practiceTargets=[];

    // Static targets — bullseye boards
    const positions=[
      {x:-15,z:-25,moving:false},
      {x:0,  z:-28,moving:false},
      {x:15, z:-25,moving:false},
      {x:-8, z:-22,moving:true,axis:'x',range:8,speed:2},
      {x:8,  z:-22,moving:true,axis:'x',range:6,speed:3},
      {x:0,  z:-18,moving:true,axis:'y',range:2,speed:1.5},
    ];

    positions.forEach(p=>{
      const t=this._makeTarget(p.x,p.z,p.moving);
      t.moving=p.moving||false;
      t.axis=p.axis||'x';
      t.range=p.range||0;
      t.speed=p.speed||0;
      t.origin={x:p.x,y:2.2,z:p.z};
      t.phase=Math.random()*Math.PI*2;
      scene.add(t.mesh);
      this.targets.push(t);
      State.practiceTargets.push(t);
    });

    // Distance markers
    [10,20,30,40].forEach(dist=>{
      const geo=new THREE.PlaneGeometry(0.8,0.3);
      const mat=new THREE.MeshBasicMaterial({color:0x39ff8f,transparent:true,opacity:0.7});
      const m=new THREE.Mesh(geo,mat);
      m.position.set(0,0.02,-dist);m.rotation.x=-Math.PI/2;
      scene.add(m);
    });

    // Platform for the range
    const platGeo=new THREE.BoxGeometry(60,0.2,40);
    const platMat=new THREE.MeshLambertMaterial({color:0x2a3a4a});
    const plat=new THREE.Mesh(platGeo,platMat);
    plat.position.set(0,0.1,-15);plat.receiveShadow=true;
    scene.add(plat);
    PhysicsManager.createBoxBody(60,0.2,40,0,{x:0,y:0.1,z:-15},PhysicsManager.groundMat);

    // Barriers
    [-30,30].forEach(x=>{
      const bGeo=new THREE.BoxGeometry(0.3,3,40);
      const bMesh=new THREE.Mesh(bGeo,new THREE.MeshLambertMaterial({color:0x334455}));
      bMesh.position.set(x,1.5,-15);
      scene.add(bMesh);
    });

    State.practiceHits=0;State.practiceShots=0;
    State.practiceStart=Date.now();
    UIManager.showPracticeHUD(true);
    this._timerInterval=setInterval(()=>UIManager.updatePracticeHUD(),500);
  },

  _makeTarget(x,z,moving){
    const group=new THREE.Group();
    // Post
    const post=new THREE.Mesh(
      new THREE.CylinderGeometry(0.06,0.06,2.2,8),
      new THREE.MeshLambertMaterial({color:0x555555})
    );
    post.position.y=1.1;group.add(post);
    // Board
    const board=new THREE.Mesh(
      new THREE.BoxGeometry(1.2,1.2,0.08),
      new THREE.MeshLambertMaterial({color:0xffffff})
    );
    board.position.y=2.2;group.add(board);
    // Rings
    [0.55,0.4,0.25,0.12].forEach((r,i)=>{
      const ring=new THREE.Mesh(
        new THREE.CircleGeometry(r,20),
        new THREE.MeshBasicMaterial({color:[0xff3333,0xffffff,0x3333ff,0xffcc00][i],side:THREE.DoubleSide})
      );
      ring.position.set(0,2.2,0.05+i*0.001);
      group.add(ring);
    });
    group.position.set(x,0,z);
    group.castShadow=true;
    return{mesh:group,alive:true,x,z};
  },

  registerHit(target){
    State.practiceHits++;
    // Flash
    target.mesh.traverse(c=>{
      if(c.isMesh&&c.material&&c.material.color){
        const orig=c.material.color.getHex();
        c.material.color.setHex(0xffff00);
        setTimeout(()=>c.material.color.setHex(orig),180);
      }
    });
    UIManager.updatePracticeHUD();
  },

  update(t){
    for(const target of this.targets){
      if(!target.moving) continue;
      const elapsed=t-State.practiceStart;
      if(target.axis==='x'){
        target.mesh.position.x=target.origin.x+Math.sin(elapsed*0.001*target.speed+target.phase)*target.range;
      } else {
        target.mesh.position.y=Math.sin(elapsed*0.001*target.speed+target.phase)*target.range*0.5;
      }
    }
  },

  cleanup(scene){
    clearInterval(this._timerInterval);
    for(const t of this.targets){scene.remove(t.mesh);}
    this.targets=[];
    State.practiceTargets=[];
    UIManager.showPracticeHUD(false);
  },
};

/* ═══════════════════════════════════════
   NETWORK
═══════════════════════════════════════ */
const NetworkManager = {
  socket:null,connected:false,_tick:0,

  init(){
    if(window.__socketStub){console.info('[Net] Offline mode');return;}
    try{
      this.socket=io(CONFIG.SERVER_URL,{transports:['websocket'],reconnection:true});
      this._bind();
    }catch(e){console.warn('[Net]',e);}
  },

  _bind(){
    const s=this.socket;
    s.on('connect',()=>{
      this.connected=true;State.localId=s.id;UIManager.setNetStatus(true);
      s.emit('join',{name:State.playerName,id:s.id,skin:State.equippedSkin});
    });
    s.on('disconnect',()=>{this.connected=false;UIManager.setNetStatus(false);});
    s.on('state',(data)=>{
      (data.players||[]).forEach(p=>{if(p.id!==State.localId) this._addRemote(p);});
      (data.structures||[]).forEach(b=>BuildingSystem.addRemote(b));
    });
    s.on('player_joined',(p)=>{
      if(p.id===State.localId) return;
      this._addRemote(p);
      UIManager.addKillFeed(`${p.name} joined`);
    });
    s.on('player_left',(d)=>{
      const p=State.players[d.id];
      if(p){if(p.mesh) Game.scene.remove(p.mesh);delete State.players[d.id];UIManager.renderPlayerList();}
    });
    s.on('player_move',(d)=>{
      const p=State.players[d.id];
      if(p&&p.mesh){p.mesh.position.set(d.x,d.y,d.z);p.mesh.rotation.y=d.ry;}
    });
    s.on('hit',(d)=>{CombatSystem.applyDamage(d.damage);});
    s.on('kill',(d)=>{
      State.kills++;UIManager.updateKills();
      UIManager.addKillFeed(`${State.playerName} > ${d.victimName}`);
      UIManager.showHitMarker();
    });
    s.on('build',(d)=>BuildingSystem.addRemote(d));
    s.on('kicked',(d)=>{
      if(d.id===State.localId){UIManager.showToast(`Kicked: ${d.reason}`,'error');Game.returnToMenu();}
    });
  },

  _addRemote(p){
    const mesh=ModelBuilder.buildPlayer(p.skin||'default',false);
    if(p.x!==undefined) mesh.position.set(p.x,p.y,p.z);
    Game.scene.add(mesh);
    State.players[p.id]={name:p.name,mesh,health:CONFIG.MAX_HEALTH};
    UIManager.renderPlayerList();
  },

  sendMove(){
    if(!this.connected) return;
    const pos=PlayerController.body.position;
    this.socket.emit('move',{x:pos.x,y:pos.y,z:pos.z,ry:PlayerController.camYaw});
  },
  sendHit(d){if(this.connected) this.socket.emit('hit',d);},
  sendBuild(d){if(this.connected) this.socket.emit('build',d);},
  sendKick(id,reason){if(this.connected) this.socket.emit('admin_kick',{targetId:id,reason,adminId:State.localId});},

  tick(now){
    if(!this.connected) return;
    if(now-this._tick>CONFIG.NET_TICK){this._tick=now;this.sendMove();}
  },
};

/* ═══════════════════════════════════════
   SETTINGS SYSTEM
═══════════════════════════════════════ */
const SettingsSystem = {
  BIND_LABELS:{
    forward:'Move Forward',backward:'Move Backward',
    left:'Strafe Left',right:'Strafe Right',
    jump:'Jump',sprint:'Sprint',reload:'Reload',
    build:'Toggle Build',wall:'Build Wall',
    floor:'Build Floor',ramp:'Build Ramp',stair:'Build Stair',
  },

  init(){
    const sl=(id,key,valId)=>{
      const el=document.getElementById(id);
      if(!el) return;
      el.value=CONFIG[key];
      document.getElementById(valId).textContent=parseFloat(CONFIG[key]).toFixed(1);
      el.addEventListener('input',()=>{document.getElementById(valId).textContent=parseFloat(el.value).toFixed(1);});
    };
    sl('sensSl','MOUSE_SENS','sensVal');
    sl('adsSl','ADS_SENS','adsVal');
    const fovEl=document.getElementById('fovSl');
    if(fovEl){fovEl.value=CONFIG.FOV;document.getElementById('fovVal').textContent=CONFIG.FOV;fovEl.addEventListener('input',()=>{document.getElementById('fovVal').textContent=fovEl.value;});}
    const invEl=document.getElementById('invertY');
    if(invEl) invEl.checked=CONFIG.INVERT_Y;
    const shEl=document.getElementById('shadows');
    if(shEl) shEl.checked=Game.renderer&&Game.renderer.shadowMap.enabled;

    this.renderKeybinds();

    document.getElementById('btnSaveSettings').addEventListener('click',()=>this.save());
    document.getElementById('btnResetSettings').addEventListener('click',()=>this.reset());
    document.getElementById('btnBackSettings').addEventListener('click',()=>{
      UIManager.hideScreen('settingsScreen');
      if(State.phase==='menu') UIManager.showScreen('mainMenu');
      else UIManager.showScreen('pauseMenu');
    });
    document.getElementById('btnCancelRebind').addEventListener('click',()=>{
      Input._rebinding=null;
      document.getElementById('rebindModal').classList.add('hidden');
    });
  },

  renderKeybinds(){
    const grid=document.getElementById('keybindsGrid');
    if(!grid) return;
    grid.innerHTML='';
    for(const action in this.BIND_LABELS){
      const row=document.createElement('div');row.className='kb-row';
      const lbl=document.createElement('span');lbl.className='kb-action';lbl.textContent=this.BIND_LABELS[action];
      const key=document.createElement('span');key.className='kb-key';
      key.textContent=this._displayKey(State.binds[action]);
      key.dataset.action=action;
      key.addEventListener('click',()=>this.startRebind(action,key));
      row.appendChild(lbl);row.appendChild(key);
      grid.appendChild(row);
    }
  },

  startRebind(action,keyEl){
    document.getElementById('rebindAction').textContent=this.BIND_LABELS[action];
    document.getElementById('rebindModal').classList.remove('hidden');
    keyEl.classList.add('listening');
    keyEl.textContent='...';
    Input.startRebind(action,(code)=>{
      document.getElementById('rebindModal').classList.add('hidden');
      keyEl.classList.remove('listening');
      keyEl.textContent=this._displayKey(code);
    });
  },

  _displayKey(code){
    if(!code) return '—';
    return code.replace('Key','').replace('Digit','').replace('Arrow','').replace('Left','L').replace('Right','R');
  },

  save(){
    const sens=parseFloat(document.getElementById('sensSl').value);
    const ads=parseFloat(document.getElementById('adsSl').value);
    const fov=parseInt(document.getElementById('fovSl').value);
    const inv=document.getElementById('invertY').checked;
    const shad=document.getElementById('shadows').checked;
    CONFIG.MOUSE_SENS=sens;CONFIG.ADS_SENS=ads;CONFIG.FOV=fov;CONFIG.INVERT_Y=inv;
    if(Game.renderer) Game.renderer.shadowMap.enabled=shad;
    if(Game.camera){Game.camera.fov=fov;Game.camera.updateProjectionMatrix();}
    StorageManager.saveSettings({sens,adsSens:ads,fov,invertY:inv,binds:{...State.binds}});
    UIManager.showToast('Settings saved!','success');
  },

  reset(){
    State.binds={...DEFAULT_BINDS};
    CONFIG.MOUSE_SENS=3;CONFIG.ADS_SENS=1.5;CONFIG.FOV=75;CONFIG.INVERT_Y=false;
    document.getElementById('sensSl').value=3;document.getElementById('sensVal').textContent='3.0';
    document.getElementById('adsSl').value=1.5;document.getElementById('adsVal').textContent='1.5';
    document.getElementById('fovSl').value=75;document.getElementById('fovVal').textContent='75';
    document.getElementById('invertY').checked=false;
    this.renderKeybinds();
    UIManager.showToast('Settings reset to defaults','success');
  },
};

/* ═══════════════════════════════════════
   SKINS SYSTEM
═══════════════════════════════════════ */
const SkinsSystem = {
  init(){
    this.renderGrid();
    document.getElementById('btnEquipSkin').addEventListener('click',()=>{
      State.equippedSkin=State.selectedSkin;
      StorageManager.saveSkin(State.equippedSkin);
      UIManager.showToast(`Skin equipped: ${SKINS.find(s=>s.id===State.equippedSkin).name}`,'success');
      document.querySelectorAll('.skin-card').forEach(c=>c.classList.toggle('equipped',c.dataset.id===State.equippedSkin));
    });
    document.getElementById('btnBackSkins').addEventListener('click',()=>{
      UIManager.hideScreen('skinsScreen');UIManager.showScreen('mainMenu');
    });
  },

  renderGrid(){
    const grid=document.getElementById('skinsGrid');
    if(!grid) return;
    grid.innerHTML='';
    SKINS.forEach(skin=>{
      const card=document.createElement('div');
      card.className='skin-card'+(State.selectedSkin===skin.id?' selected':'')+(State.equippedSkin===skin.id?' equipped':'');
      card.dataset.id=skin.id;
      // Color swatch
      const swatch=document.createElement('div');swatch.className='skin-swatch';
      swatch.style.cssText=`background:#${skin.body.toString(16).padStart(6,'0')};border-radius:4px`;
      const head=document.createElement('div');head.className='skin-swatch-head';
      head.style.cssText=`background:#${skin.head.toString(16).padStart(6,'0')};width:24px;height:24px;border-radius:50%;margin:0 auto 4px`;
      swatch.appendChild(head);
      const lbl=document.createElement('div');lbl.className='skin-name';lbl.textContent=skin.name;
      if(State.equippedSkin===skin.id){
        const eq=document.createElement('div');eq.style.cssText='font-size:.58rem;color:var(--accent2);letter-spacing:.1em;margin-top:2px';
        eq.textContent='EQUIPPED';card.appendChild(eq);
      }
      card.appendChild(swatch);card.appendChild(lbl);
      card.addEventListener('click',()=>{
        State.selectedSkin=skin.id;
        document.querySelectorAll('.skin-card').forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
        document.getElementById('skinPreviewName').textContent=skin.name;
        this.drawPreview(skin);
      });
      grid.appendChild(card);
    });
    this.drawPreview(SKINS.find(s=>s.id===State.selectedSkin)||SKINS[0]);
  },

  drawPreview(skin){
    const canvas=document.getElementById('skinPreviewCanvas');
    if(!canvas) return;
    const ctx=canvas.getContext('2d');
    const W=canvas.width,H=canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='rgba(255,255,255,0.02)';ctx.fillRect(0,0,W,H);

    const bodyC='#'+skin.body.toString(16).padStart(6,'0');
    const headC='#'+skin.head.toString(16).padStart(6,'0');
    const legC ='#'+skin.legs.toString(16).padStart(6,'0');

    // Draw simple character front-view
    const cx=W/2,top=20;
    // Head
    ctx.fillStyle=headC;ctx.fillRect(cx-22,top,44,40);
    // Eyes
    ctx.fillStyle='#111122';ctx.fillRect(cx-14,top+14,10,8);ctx.fillRect(cx+4,top+14,10,8);
    // Helmet
    ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(cx-22,top+10,44,12);
    // Torso
    ctx.fillStyle=bodyC;ctx.fillRect(cx-28,top+44,56,52);
    // Belt
    ctx.fillStyle='rgba(0,0,0,0.35)';ctx.fillRect(cx-28,top+88,56,6);
    // Arms
    ctx.fillStyle=bodyC;
    ctx.fillRect(cx-46,top+46,16,48);// left
    ctx.fillRect(cx+30,top+46,16,48);// right
    // Hands
    ctx.fillStyle=headC;
    ctx.fillRect(cx-46,top+90,16,16);ctx.fillRect(cx+30,top+90,16,16);
    // Legs
    ctx.fillStyle=legC;
    ctx.fillRect(cx-28,top+97,24,60);ctx.fillRect(cx+4,top+97,24,60);
    // Feet
    ctx.fillStyle='#111';
    ctx.fillRect(cx-30,top+154,28,14);ctx.fillRect(cx+2,top+154,28,14);
    // Backpack hint
    ctx.fillStyle=legC;ctx.globalAlpha=0.5;ctx.fillRect(cx+28,top+46,8,44);ctx.globalAlpha=1;
  },
};

/* ═══════════════════════════════════════
   ADMIN SYSTEM
═══════════════════════════════════════ */
const AdminSystem = {
  visible:false,unlocked:false,

  init(){
    document.getElementById('btnAdminAuth').addEventListener('click',()=>this.tryAuth());
    document.getElementById('adminPassInput').addEventListener('keydown',e=>{if(e.code==='Enter') this.tryAuth();});
    document.getElementById('btnAdminClose').addEventListener('click',()=>this.hide());
    document.getElementById('btnAdminLock').addEventListener('click',()=>this.lock());
    document.querySelectorAll('.admin-tab').forEach(btn=>{
      btn.addEventListener('click',()=>{
        document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c=>c.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById(`adminTab-${btn.dataset.tab}`).classList.remove('hidden');
        if(btn.dataset.tab==='players') this.renderPlayers();
        if(btn.dataset.tab==='bans') this.renderBans();
        if(btn.dataset.tab==='reports') this.renderReports();
      });
    });
    document.getElementById('btnAddBan').addEventListener('click',()=>this.addBan());
    document.getElementById('btnClearReports').addEventListener('click',()=>{State.reports=[];StorageManager.saveReports();this.renderReports();});
    document.getElementById('btnSaveConfig').addEventListener('click',()=>this.saveConfig());
  },

  toggleConsole(){this.visible?this.hide():this.show();},

  show(){
    this.visible=true;
    document.getElementById('adminConsole').classList.remove('hidden');
    Input.releaseLock();
    if(!this.unlocked) document.getElementById('adminPassInput').focus();
    this.renderPlayers();
  },
  hide(){
    this.visible=false;
    document.getElementById('adminConsole').classList.add('hidden');
    if(State.phase==='playing'||State.phase==='practice') Input.requestLock();
  },
  tryAuth(){
    const pass=document.getElementById('adminPassInput').value;
    const msg=document.getElementById('adminAuthMsg');
    if(pass===CONFIG.ADMIN_PASSWORD){
      this.unlocked=true;State.isAdmin=true;
      document.getElementById('adminLock').classList.add('hidden');
      document.getElementById('adminPanel').classList.remove('hidden');
      msg.textContent='';this.renderPlayers();this.loadConfig();
    } else {
      msg.textContent='Incorrect password.';msg.className='admin-msg err';
      document.getElementById('adminPassInput').value='';
    }
  },
  lock(){
    this.unlocked=false;State.isAdmin=false;
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('adminLock').classList.remove('hidden');
    document.getElementById('adminPassInput').value='';
    document.getElementById('adminAuthMsg').textContent='';
  },
  renderPlayers(){
    const list=document.getElementById('adminPlayerList');list.innerHTML='';
    list.appendChild(this._entry(State.localId||'local',State.playerName+' (you)',false));
    for(const id in State.players) list.appendChild(this._entry(id,State.players[id].name,true));
  },
  _entry(id,name,canAct){
    const div=document.createElement('div');div.className='admin-entry';
    div.innerHTML=`<span class="admin-entry-name">${this._e(name)}</span><span class="admin-entry-id">${this._e(id)}</span>
    ${canAct?`<button class="btn-danger" data-a="kick" data-id="${this._e(id)}" data-n="${this._e(name)}">KICK</button>
    <button class="btn-danger" data-a="ban" data-id="${this._e(id)}" data-n="${this._e(name)}">BAN</button>`:''}`;
    div.querySelectorAll('[data-a]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const r=prompt(`Reason to ${btn.dataset.a} ${btn.dataset.n}?`)||'No reason';
        if(btn.dataset.a==='kick') this.kick(btn.dataset.id,btn.dataset.n,r);
        if(btn.dataset.a==='ban')  this.ban(btn.dataset.id,btn.dataset.n,r);
      });
    });
    return div;
  },
  kick(id,name,reason){NetworkManager.sendKick(id,reason);UIManager.showToast(`Kicked: ${name}`,'success');this.renderPlayers();},
  ban(id,name,reason){
    if(!State.bannedIds.find(b=>b.id===id)) State.bannedIds.push({id,name,reason,date:new Date().toISOString()});
    StorageManager.saveBans();this.kick(id,name,`Banned: ${reason}`);this.renderBans();
  },
  unban(id){State.bannedIds=State.bannedIds.filter(b=>b.id!==id);StorageManager.saveBans();this.renderBans();UIManager.showToast('Unbanned','success');},
  renderBans(){
    const list=document.getElementById('adminBanList');list.innerHTML='';
    if(!State.bannedIds.length){list.innerHTML='<p style="color:var(--text-dim);font-size:.75rem;padding:8px 0">No bans.</p>';return;}
    State.bannedIds.forEach(b=>{
      const div=document.createElement('div');div.className='admin-entry';
      div.innerHTML=`<span class="admin-entry-name">${this._e(b.name)}</span><span class="admin-entry-id">${this._e(b.reason)}</span><button class="btn-danger" data-id="${this._e(b.id)}">UNBAN</button>`;
      div.querySelector('[data-id]').addEventListener('click',()=>this.unban(b.id));
      list.appendChild(div);
    });
  },
  renderReports(){
    const list=document.getElementById('adminReportList');list.innerHTML='';
    if(!State.reports.length){list.innerHTML='<p style="color:var(--text-dim);font-size:.75rem;padding:8px 0">No reports.</p>';return;}
    State.reports.forEach(r=>{
      const div=document.createElement('div');div.className='admin-entry';div.style.flexDirection='column';div.style.alignItems='flex-start';
      div.innerHTML=`<strong style="color:var(--accent3)">${this._e(r.reporter)} → ${this._e(r.target)}</strong>
      <span style="color:var(--text-dim);font-size:.7rem">${this._e(r.reason)}: ${this._e(r.details||'')}</span>
      <span style="color:var(--text-dim);font-size:.62rem">${new Date(r.date).toLocaleString()}</span>`;
      list.appendChild(div);
    });
  },
  addBan(){
    const id=document.getElementById('banIdInput').value.trim();
    const reason=document.getElementById('banReasonInput').value.trim();
    if(!id) return;
    this.ban(id,id,reason||'Manual ban');
    document.getElementById('banIdInput').value='';document.getElementById('banReasonInput').value='';
  },
  loadConfig(){
    document.getElementById('cfgServer').value=CONFIG.SERVER_URL||'';
    document.getElementById('cfgWebhook').value=CONFIG.DISCORD_WEBHOOK||'';
  },
  saveConfig(){
    const server=document.getElementById('cfgServer').value.trim();
    const webhook=document.getElementById('cfgWebhook').value.trim();
    const newPass=document.getElementById('cfgNewPass').value.trim();
    const cfg={};
    if(server){CONFIG.SERVER_URL=server;cfg.serverUrl=server;}
    if(webhook){CONFIG.DISCORD_WEBHOOK=webhook;cfg.discordWebhook=webhook;}
    if(newPass){CONFIG.ADMIN_PASSWORD=newPass;cfg.adminPassword=newPass;}
    StorageManager.saveConfig(cfg);
    document.getElementById('cfgMsg').textContent='Saved.';document.getElementById('cfgMsg').className='admin-msg ok';
    document.getElementById('cfgNewPass').value='';
  },
  _e(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
};

/* ═══════════════════════════════════════
   REPORT SYSTEM
═══════════════════════════════════════ */
const ReportSystem = {
  init(){
    document.getElementById('btnReport').addEventListener('click',()=>this.open());
    document.getElementById('btnSubmitReport').addEventListener('click',()=>this.submit());
    document.getElementById('btnCancelReport').addEventListener('click',()=>this.close());
  },
  open(){
    const sel=document.getElementById('reportTarget');
    sel.innerHTML='<option value="">-- Select --</option>';
    for(const id in State.players){
      const o=document.createElement('option');o.value=id;o.textContent=State.players[id].name;sel.appendChild(o);
    }
    document.getElementById('reportModal').classList.remove('hidden');
    if(Input.locked) Input.releaseLock();
  },
  close(){
    document.getElementById('reportModal').classList.add('hidden');
    document.getElementById('reportDetails').value='';
    if(State.phase==='playing'||State.phase==='practice') Input.requestLock();
  },
  async submit(){
    const targetId=document.getElementById('reportTarget').value;
    const reason=document.getElementById('reportReason').value;
    const details=document.getElementById('reportDetails').value.trim();
    if(!targetId){UIManager.showToast('Select a player to report','error');return;}
    const target=State.players[targetId];
    const report={reporter:State.playerName,target:target?target.name:targetId,targetId,reason,details,date:new Date().toISOString()};
    State.reports.push(report);StorageManager.saveReports();
    if(CONFIG.DISCORD_WEBHOOK&&CONFIG.DISCORD_WEBHOOK!=='YOUR_WEBHOOK_HERE'){
      try{await fetch(CONFIG.DISCORD_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({embeds:[{title:'GunzML Report',color:0xff3333,fields:[{name:'Reporter',value:report.reporter,inline:true},{name:'Reported',value:report.target,inline:true},{name:'Reason',value:reason,inline:true},{name:'Details',value:details||'N/A'}]}]})});}catch(_){}
    }
    this.close();UIManager.showToast('Report submitted. Thank you.','success');
  },
};

/* ═══════════════════════════════════════
   UI MANAGER
═══════════════════════════════════════ */
const UIManager = {
  _hitTO:null,_dmgTO:null,

  init(){
    document.getElementById('btnPlay').addEventListener('click',()=>{
      const n=document.getElementById('playerNameInput').value.trim()||'Operator';
      State.playerName=n;StorageManager.saveName(n);
      Game.startGame(false,false);
    });
    document.getElementById('btnPractice').addEventListener('click',()=>{
      const n=document.getElementById('playerNameInput').value.trim()||'Operator';
      State.playerName=n;StorageManager.saveName(n);
      Game.startGame(false,true);
    });
    document.getElementById('btnSettings').addEventListener('click',()=>{
      this.hideScreen('mainMenu');this.showScreen('settingsScreen');
    });
    document.getElementById('btnSkins').addEventListener('click',()=>{
      this.hideScreen('mainMenu');this.showScreen('skinsScreen');
      SkinsSystem.renderGrid();
    });
    document.getElementById('btnControls').addEventListener('click',()=>{
      this.hideScreen('mainMenu');this.showScreen('controlsScreen');
    });
    document.getElementById('btnBackControls').addEventListener('click',()=>{
      this.hideScreen('controlsScreen');this.showScreen('mainMenu');
    });
    document.getElementById('btnResume').addEventListener('click',()=>this.resumeGame());
    document.getElementById('btnPauseSettings').addEventListener('click',()=>{
      this.hideScreen('pauseMenu');this.showScreen('settingsScreen');
    });
    document.getElementById('btnQuit').addEventListener('click',()=>Game.returnToMenu());
    document.getElementById('btnRespawn').addEventListener('click',()=>{PlayerController.respawn();});
    document.getElementById('btnDeathQuit').addEventListener('click',()=>Game.returnToMenu());
    document.getElementById('btnExitPractice').addEventListener('click',()=>Game.returnToMenu());
    document.getElementById('playerNameInput').value=State.playerName;
  },

  showScreen(id){const e=document.getElementById(id);if(e) e.classList.remove('hidden');},
  hideScreen(id){const e=document.getElementById(id);if(e) e.classList.add('hidden');},
  showHUD(v){const h=document.getElementById('hud');v?h.classList.remove('hidden'):h.classList.add('hidden');},
  showPause(){State.phase='paused';this.showScreen('pauseMenu');Input.releaseLock();},
  resumeGame(){State.phase='playing';this.hideScreen('pauseMenu');Input.requestLock();},

  showDeath(killer){
    document.getElementById('deathMsg').textContent=`Eliminated by ${killer}`;
    document.getElementById('deathKills').textContent=State.kills;
    document.getElementById('deathShots').textContent=State.shots;
    const acc=State.shots>0?Math.round(State.hits/State.shots*100):0;
    document.getElementById('deathAcc').textContent=acc+'%';
    this.showScreen('deathScreen');Input.releaseLock();
  },

  updateHealth(){
    const pct=(State.health/CONFIG.MAX_HEALTH)*100;
    document.getElementById('healthFill').style.width=pct+'%';
    document.getElementById('healthVal').textContent=State.health;
    const f=document.getElementById('healthFill');
    f.style.background=State.health>50?'var(--accent2)':State.health>25?'var(--accent)':'var(--danger)';
  },

  updateAmmo(){
    document.getElementById('ammoCount').textContent=State.ammo;
    document.getElementById('ammoReserve').textContent=State.reserveAmmo;
  },

  updateKills(){document.getElementById('killCount').textContent=State.kills;},

  showHitMarker(){
    const e=document.getElementById('hitMarker');
    e.classList.remove('hidden');
    clearTimeout(this._hitTO);
    this._hitTO=setTimeout(()=>e.classList.add('hidden'),220);
  },

  flashDamage(){
    document.body.style.boxShadow='inset 0 0 70px rgba(255,0,0,0.45)';
    clearTimeout(this._dmgTO);
    this._dmgTO=setTimeout(()=>{document.body.style.boxShadow='';},280);
  },

  addKillFeed(text){
    const feed=document.getElementById('killFeed');
    const el=document.createElement('div');el.className='kf-entry';el.textContent=text;
    feed.appendChild(el);
    setTimeout(()=>{if(el.parentNode) el.parentNode.removeChild(el);},3100);
    while(feed.children.length>6) feed.removeChild(feed.firstChild);
  },

  toggleBuildHUD(show){
    const e=document.getElementById('buildHUD');
    show?e.classList.remove('hidden'):e.classList.add('hidden');
    document.querySelectorAll('.bslot').forEach(s=>s.classList.toggle('active',s.dataset.type===State.buildType));
  },

  showReloadBar(show){
    const e=document.getElementById('reloadBar');
    show?e.classList.remove('hidden'):e.classList.add('hidden');
  },

  setReloadProgress(pct){document.getElementById('reloadFill').style.width=(pct*100)+'%';},

  setNetStatus(online){
    const e=document.getElementById('netStatus');
    e.className=online?'net-online':'net-offline';
    e.textContent=online?`ONLINE — ${Object.keys(State.players).length+1}p`:'OFFLINE';
  },

  renderPlayerList(){
    const ul=document.getElementById('plList');ul.innerHTML='';
    const mk=(name,local)=>{const li=document.createElement('li');li.innerHTML=`<span>${local?'▶ ':''}${name}</span>`;ul.appendChild(li);};
    mk(State.playerName,true);
    for(const id in State.players) mk(State.players[id].name,false);
    this.setNetStatus(NetworkManager.connected);
  },

  togglePlayerList(show){const e=document.getElementById('playerList');show?e.classList.remove('hidden'):e.classList.add('hidden');},

  showPracticeHUD(show){
    const e=document.getElementById('practiceHUD');
    show?e.classList.remove('hidden'):e.classList.add('hidden');
  },

  updatePracticeHUD(){
    document.getElementById('pracHits').textContent=State.practiceHits;
    document.getElementById('pracShots').textContent=State.practiceShots;
    const acc=State.practiceShots>0?Math.round(State.practiceHits/State.practiceShots*100):0;
    document.getElementById('pracAcc').textContent=acc+'%';
    const secs=Math.round((Date.now()-State.practiceStart)/1000);
    document.getElementById('pracTimer').textContent=secs+'s';
  },

  showToast(msg,type=''){
    const c=document.getElementById('toastContainer');
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;
    c.appendChild(el);
    setTimeout(()=>{if(el.parentNode) el.parentNode.removeChild(el);},3100);
  },

  setLoadProgress(pct,status){
    document.getElementById('loadBar').style.width=pct+'%';
    document.getElementById('loadStatus').textContent=status;
  },

  hideLoadingScreen(){
    const el=document.getElementById('loadingScreen');
    el.style.transition='opacity .5s';el.style.opacity='0';
    setTimeout(()=>el.style.display='none',520);
  },
};

/* ═══════════════════════════════════════
   GAME
═══════════════════════════════════════ */
const Game = {
  scene:null,camera:null,renderer:null,clock:null,groundMesh:null,_raf:null,

  async init(){
    StorageManager.load();

    this.renderer=new THREE.WebGLRenderer({canvas:document.getElementById('gameCanvas'),antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setSize(window.innerWidth,window.innerHeight);
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;

    window.addEventListener('resize',()=>{
      this.renderer.setSize(window.innerWidth,window.innerHeight);
      this.camera.aspect=window.innerWidth/window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    UIManager.setLoadProgress(10,'Scene setup...');
    await this._delay(60);

    this.scene=new THREE.Scene();
    this.scene.background=new THREE.Color(0x87ceeb);
    this.scene.fog=new THREE.FogExp2(0x87ceeb,0.011);
    this.camera=new THREE.PerspectiveCamera(CONFIG.FOV,window.innerWidth/window.innerHeight,0.1,600);
    this.clock=new THREE.Clock();

    UIManager.setLoadProgress(28,'Physics...');
    await this._delay(60);
    try{PhysicsManager.init();}catch(e){console.error('[PhysicsMgr]',e);}

    UIManager.setLoadProgress(50,'World...');
    await this._delay(60);
    try{this._setupLighting();this._setupWorld();}catch(e){console.error('[World]',e);}

    UIManager.setLoadProgress(70,'Systems...');
    await this._delay(60);
    try{
      BuildingSystem.init(this.scene);
      CombatSystem.init();
      Input.init();
    }catch(e){console.error('[Systems]',e);}

    UIManager.setLoadProgress(88,'UI...');
    await this._delay(60);
    try{
      UIManager.init();
      SettingsSystem.init();
      SkinsSystem.init();
      AdminSystem.init();
      ReportSystem.init();
    }catch(e){console.error('[UI]',e);}

    UIManager.setLoadProgress(100,'Ready!');
    await this._delay(450);
    UIManager.hideLoadingScreen();
    State.phase='menu';
    UIManager.showScreen('mainMenu');
    this._loop();
  },

  _setupLighting(){
    this.scene.add(new THREE.AmbientLight(0xffffff,0.55));
    const sun=new THREE.DirectionalLight(0xfff4dd,1.1);
    sun.position.set(80,120,60);sun.castShadow=true;
    sun.shadow.mapSize.width=sun.shadow.mapSize.height=2048;
    sun.shadow.camera.near=0.5;sun.shadow.camera.far=500;
    sun.shadow.camera.left=-100;sun.shadow.camera.right=100;
    sun.shadow.camera.top=100;sun.shadow.camera.bottom=-100;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x87ceeb,0x3d5c2b,0.38));
  },

  _setupWorld(){
    // Ground
    const groundGeo=new THREE.PlaneGeometry(CONFIG.GROUND_SIZE,CONFIG.GROUND_SIZE,48,48);
    const groundMat=new THREE.MeshLambertMaterial({color:0x4a7c3b});
    this.groundMesh=new THREE.Mesh(groundGeo,groundMat);
    this.groundMesh.rotation.x=-Math.PI/2;this.groundMesh.receiveShadow=true;
    this.scene.add(this.groundMesh);
    const grid=new THREE.GridHelper(CONFIG.GROUND_SIZE,CONFIG.GROUND_SIZE/CONFIG.GRID_SIZE,0x2a5c2a,0x2a5c2a);
    grid.position.y=0.01;this.scene.add(grid);

    // Terrain boxes (decorative obstacles)
    [[-20,3,-20],[18,4,-32],[-35,2,28],[30,3,22],[0,2,-45],[42,2,-10]].forEach(([x,h,z])=>{
      const w=4+Math.random()*8,d=4+Math.random()*8;
      const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshLambertMaterial({color:0x7a6a5a}));
      m.position.set(x,h/2,z);m.castShadow=true;m.receiveShadow=true;
      this.scene.add(m);
      try{PhysicsManager.createBoxBody(w,h,d,0,{x,y:h/2,z},PhysicsManager.buildMat);}catch(e){}
    });
  },

  async startGame(connectToServer,isPractice){
    UIManager.hideScreen('mainMenu');UIManager.hideScreen('controlsScreen');
    State.isPractice=isPractice||false;
    State.kills=0;State.shots=0;State.hits=0;
    State.health=CONFIG.MAX_HEALTH;State.ammo=CONFIG.MAX_AMMO;State.reserveAmmo=CONFIG.RESERVE_AMMO;

    try{PlayerController.init(this.scene);}catch(e){console.error('[PlayerCtrl]',e);}

    if(connectToServer) NetworkManager.init();

    UIManager.showHUD(true);
    UIManager.updateHealth();UIManager.updateAmmo();UIManager.updateKills();UIManager.renderPlayerList();

    if(isPractice){
      State.phase='practice';
      // Spawn at range start position
      PlayerController.body.position.set(0,2,5);
      try{PracticeRange.build(this.scene);}catch(e){console.error('[PracticeRange]',e);}
    } else {
      State.phase='playing';
    }

    setTimeout(()=>Input.requestLock(),300);
  },

  returnToMenu(){
    const prevPhase=State.phase;
    State.phase='menu';
    Input.releaseLock();
    UIManager.showHUD(false);
    UIManager.hideScreen('pauseMenu');UIManager.hideScreen('deathScreen');
    UIManager.toggleBuildHUD(false);State.buildMode=false;

    if(State.isPractice) try{PracticeRange.cleanup(this.scene);}catch(_){}

    if(PlayerController.mesh&&PlayerController.mesh.parent) this.scene.remove(PlayerController.mesh);
    if(PlayerController.body) try{PhysicsManager.world.remove(PlayerController.body);}catch(_){}
    PlayerController.body=null;PlayerController.mesh=null;

    for(const id in State.players){
      const p=State.players[id];if(p.mesh&&p.mesh.parent) this.scene.remove(p.mesh);
    }
    State.players={};
    BuildingSystem.clearAll();

    if(NetworkManager.socket) try{NetworkManager.socket.disconnect();}catch(_){}
    NetworkManager.connected=false;
    UIManager.setNetStatus(false);

    UIManager.showScreen('mainMenu');
  },

  _loop(){
    this._raf=requestAnimationFrame(()=>this._loop());
    const dt=Math.min(this.clock.getDelta(),0.05);
    const now=Date.now();

    if(State.phase==='playing'||State.phase==='practice'){
      try{PhysicsManager.step(dt);}catch(_){}
      try{PlayerController.update(dt);}catch(_){}
      try{BuildingSystem.update();}catch(_){}
      try{CombatSystem.update();}catch(_){}
      if(State.phase==='practice') try{PracticeRange.update(now);}catch(_){}
      NetworkManager.tick(now);

      // Animate reload bar
      if(CombatSystem.reloading){
        const prog=(Date.now()-CombatSystem._reloadStart)/CONFIG.RELOAD_TIME;
        UIManager.setReloadProgress(Math.min(prog,1));
      }
    }

    this.renderer.render(this.scene,this.camera);
  },

  _delay(ms){return new Promise(r=>setTimeout(r,ms));}
};

window.addEventListener('load',()=>Game.init().catch(e=>console.error('[Game.init]',e)));
