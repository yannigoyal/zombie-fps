(function () {
  "use strict";

  const CONFIG = {
    arenaSize: 80,
    playerSpeed: 14,
    sprintMultiplier: 1.55,
    playerHeight: 1.7,
    maxHealth: 100,
    bodyHitsToKill: 3,
    baseZombieSpeed: 2.8,
    baseZombieDamage: 10,
    zombieAttackCooldown: 1.0,
    spawnRadiusMin: 28,
    spawnRadiusMax: 38,
    scorePerKill: 100,
    headshotBonus: 50,
    waveBonus: 250,
    shootCooldown: 0.18,
    waveBreakDuration: 4,
    baseSpawnInterval: 1.8,
    playerRadius: 0.45,
    difficultyInterval: 30,
  };

  const SKIN_TONES = [0x6b7f5e, 0x5a6b52, 0x7a8a6a, 0x4d5e48, 0x8a7d6b, 0x556b4a];
  const CLOTH_COLORS = [0x3d4a5c, 0x4a3728, 0x2f3b2f, 0x5c4033, 0x1e2a3a, 0x4a3f35];

  const keys = {};
  let scene, camera, renderer, clock;
  let player, obstacles = [];
  let zombies = [];
  let raycaster, mouseVec;
  let isPlaying = false;
  let health = CONFIG.maxHealth;
  let displayHealth = CONFIG.maxHealth;
  let score = 0;
  let totalKills = 0;
  let wave = 1;
  let waveZombiesTotal = 0;
  let waveZombiesSpawned = 0;
  let waveZombiesKilled = 0;
  let waveState = "break";
  let waveBreakTimer = 0;
  let spawnTimer = 0;
  let survivalTime = 0;
  let difficultyTier = 1;
  let shootTimer = 0;
  let yaw = 0;
  let pitch = 0;
  let damageFlash;

  const container = document.getElementById("game-container");
  const hud = document.getElementById("hud");
  const startScreen = document.getElementById("start-screen");
  const gameOverScreen = document.getElementById("game-over-screen");
  const healthBar = document.getElementById("health-bar");
  const healthBarDamage = document.getElementById("health-bar-damage");
  const healthText = document.getElementById("health-text");
  const scoreText = document.getElementById("score-text");
  const killsText = document.getElementById("kills-text");
  const waveText = document.getElementById("wave-text");
  const remainingText = document.getElementById("remaining-text");
  const waveBanner = document.getElementById("wave-banner");
  const waveBannerTitle = document.getElementById("wave-banner-title");
  const waveBannerSub = document.getElementById("wave-banner-sub");
  const finalScoreText = document.getElementById("final-score");
  const finalWaveText = document.getElementById("final-wave");
  const finalKillsText = document.getElementById("final-kills");
  const startBtn = document.getElementById("start-btn");
  const restartBtn = document.getElementById("restart-btn");

  function getDifficultyConfig(tier) {
    const t = tier - 1;
    return {
      spawnInterval: Math.max(
        0.25,
        CONFIG.baseSpawnInterval * Math.pow(0.85, t)
      ),
      zombieSpeed: CONFIG.baseZombieSpeed + t * 0.25,
      zombieDamage: CONFIG.baseZombieDamage + Math.floor(t / 2) * 2,
    };
  }

  function getWaveConfig(w) {
    const diff = getDifficultyConfig(difficultyTier);
    return {
      count: 5 + (w - 1) * 4,
      spawnInterval: diff.spawnInterval,
      zombieSpeed: diff.zombieSpeed,
      zombieDamage: diff.zombieDamage,
    };
  }

  function updateDifficulty(dt) {
    survivalTime += dt;
    const newTier = 1 + Math.floor(survivalTime / CONFIG.difficultyInterval);
    if (newTier <= difficultyTier) return;

    difficultyTier = newTier;
    const diff = getDifficultyConfig(difficultyTier);
    showWaveBanner(
      "Difficulty Up — Tier " + difficultyTier,
      "Spawn " + diff.spawnInterval.toFixed(1) + "s · speed " + diff.zombieSpeed.toFixed(1)
    );
    updateHUD();
  }

  function setKeyState(e, pressed) {
    keys[e.code] = pressed;
    const k = e.key.toLowerCase();
    if (k === "w") keys.KeyW = pressed;
    if (k === "a") keys.KeyA = pressed;
    if (k === "s") keys.KeyS = pressed;
    if (k === "d") keys.KeyD = pressed;
  }

  function clearKeys() {
    Object.keys(keys).forEach((k) => {
      keys[k] = false;
    });
  }

  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f18);
    scene.fog = new THREE.Fog(0x0a0f18, 20, 95);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.rotation.order = "YXZ";

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    clock = new THREE.Clock();
    raycaster = new THREE.Raycaster();
    mouseVec = new THREE.Vector2(0, 0);

    damageFlash = document.createElement("div");
    damageFlash.className = "damage-flash";
    document.body.appendChild(damageFlash);

    setupLights();
    buildArena();
    createPlayer();

    window.addEventListener("resize", onResize);
    window.addEventListener("blur", clearKeys);
    window.addEventListener("keydown", (e) => {
      setKeyState(e, true);
      if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => {
      setKeyState(e, false);
    });
    renderer.domElement.addEventListener("click", () => {
      if (isPlaying && document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    });
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChange);

    startBtn.addEventListener("click", startGame);
    restartBtn.addEventListener("click", restartGame);

    animate();
  }

  function setupLights() {
    scene.add(new THREE.AmbientLight(0x607090, 0.55));

    const moon = new THREE.DirectionalLight(0xaac4ff, 0.65);
    moon.position.set(30, 50, 20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 120;
    moon.shadow.camera.left = -50;
    moon.shadow.camera.right = 50;
    moon.shadow.camera.top = 50;
    moon.shadow.camera.bottom = -50;
    scene.add(moon);

    const fill = new THREE.PointLight(0xff5533, 0.35, 60);
    fill.position.set(0, 8, 0);
    scene.add(fill);
  }

  function buildArena() {
    const half = CONFIG.arenaSize / 2;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(CONFIG.arenaSize, CONFIG.arenaSize, 32, 32),
      new THREE.MeshStandardMaterial({ color: 0x1a2433, roughness: 0.92, metalness: 0.05 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(CONFIG.arenaSize, 40, 0x2a3a55, 0x1e2a3d);
    grid.position.y = 0.02;
    scene.add(grid);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3545, roughness: 0.85, metalness: 0.1 });
    const wallHeight = 4;
    const wallThickness = 1;
    const walls = [
      [0, wallHeight / 2, -half, CONFIG.arenaSize, wallHeight, wallThickness],
      [0, wallHeight / 2, half, CONFIG.arenaSize, wallHeight, wallThickness],
      [-half, wallHeight / 2, 0, wallThickness, wallHeight, CONFIG.arenaSize],
      [half, wallHeight / 2, 0, wallThickness, wallHeight, CONFIG.arenaSize],
    ];

    walls.forEach(([x, y, z, w, h, d]) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(x, y, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
      obstacles.push(wall);
    });

    const crateMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
    const cratePositions = [
      [-18, 1, -12], [15, 1, 18], [-8, 1, 22], [22, 1, -8],
      [-25, 1, 8], [10, 1, -20], [-12, 1, -25],
      [20, 1, 12], [-20, 1, 20], [5, 1, -5], [-5, 1, 15],
    ];

    cratePositions.forEach(([x, y, z]) => {
      const size = 1.4 + Math.random() * 1.2;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
      crate.position.set(x, y + size / 2 - 0.5, z);
      crate.rotation.y = Math.random() * Math.PI;
      crate.castShadow = true;
      crate.receiveShadow = true;
      scene.add(crate);
      obstacles.push(crate);
    });
  }

  function createPlayer() {
    player = new THREE.Object3D();
    player.position.set(0, CONFIG.playerHeight, 0);
    scene.add(player);
    player.add(camera);
    camera.position.set(0, 0, 0);
  }

  function skinMat(color) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      metalness: 0.02,
    });
  }

  function clothMat(color) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.95,
      metalness: 0,
    });
  }

  function bloodMat() {
    return new THREE.MeshStandardMaterial({
      color: 0x5a1515,
      roughness: 0.7,
      metalness: 0.05,
    });
  }

  function addLimb(group, geo, mat, pos, rot, name, hitZone) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.userData.hitZone = hitZone || "body";
    group.add(mesh);
    return mesh;
  }

  function createZombie() {
    const group = new THREE.Group();
    const cfg = getWaveConfig(wave);
    const skinColor = SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)];
    const clothColor = CLOTH_COLORS[Math.floor(Math.random() * CLOTH_COLORS.length)];
    const skin = skinMat(skinColor);
    const cloth = clothMat(clothColor);
    const blood = bloodMat();
    const hunch = 0.12 + Math.random() * 0.1;
    const armReach = 0.6 + Math.random() * 0.35;

    const torso = addLimb(
      group,
      new THREE.CylinderGeometry(0.32, 0.38, 0.95, 10),
      cloth,
      [0, 1.15, 0],
      [hunch, 0, (Math.random() - 0.5) * 0.15],
      "torso"
    );

    const pelvis = addLimb(
      group,
      new THREE.CylinderGeometry(0.3, 0.34, 0.35, 8),
      cloth,
      [0, 0.72, 0],
      [0, 0, 0],
      "pelvis"
    );

    const neck = addLimb(
      group,
      new THREE.CylinderGeometry(0.1, 0.13, 0.18, 8),
      skin,
      [0, 1.72, 0.04],
      [-0.25, 0, (Math.random() - 0.5) * 0.2],
      "neck",
      "head"
    );

    const head = addLimb(
      group,
      new THREE.SphereGeometry(0.28, 12, 10),
      skin,
      [0, 1.98, 0.06],
      [(Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, 0],
      "head",
      "head"
    );
    head.scale.set(1, 1.08, 0.92);

    addLimb(
      group,
      new THREE.BoxGeometry(0.22, 0.1, 0.18),
      skin,
      [0, 1.84, 0.2],
      [0.35, 0, 0],
      "jaw",
      "head"
    );

    [-0.09, 0.09].forEach((x) => {
      addLimb(
        group,
        new THREE.SphereGeometry(0.05, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 1 }),
        [x, 2.02, 0.2],
        null,
        "eyeSocket",
        "head"
      );
      const pupil = addLimb(
        group,
        new THREE.SphereGeometry(0.025, 6, 6),
        new THREE.MeshStandardMaterial({
          color: 0xff1111,
          emissive: 0xaa0000,
          emissiveIntensity: 1.2,
        }),
        [x, 2.02, 0.24],
        null,
        "eye",
        "head"
      );
      pupil.scale.set(1, 1.2, 0.5);
    });

    const upperArmGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.42, 8);
    const foreArmGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.4, 8);
    const legGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.48, 8);
    const shinGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.46, 8);

    const leftUpperArm = addLimb(group, upperArmGeo, skin, [-0.42, 1.35, 0.1], [-0.5, 0, -0.4], "leftUpperArm");
    const leftForeArm = addLimb(group, foreArmGeo, skin, [-0.55, 1.0, 0.35 + armReach * 0.2], [-1.2, 0, -0.2], "leftForeArm");
    const rightUpperArm = addLimb(group, upperArmGeo, skin, [0.42, 1.35, 0.1], [-0.5, 0, 0.4], "rightUpperArm");
    const rightForeArm = addLimb(group, foreArmGeo, skin, [0.55, 1.0, 0.35 + armReach * 0.2], [-1.2, 0, 0.2], "rightForeArm");

    const leftThigh = addLimb(group, legGeo, cloth, [-0.18, 0.52, 0], [0, 0, 0.08], "leftThigh");
    const leftShin = addLimb(group, shinGeo, skin, [-0.2, 0.05, 0.05], [0, 0, 0], "leftShin");
    const rightThigh = addLimb(group, legGeo, cloth, [0.18, 0.52, 0], [0, 0, -0.08], "rightThigh");
    const rightShin = addLimb(group, shinGeo, skin, [0.2, 0.05, -0.05], [0, 0, 0], "rightShin");

    const handGeo = new THREE.SphereGeometry(0.07, 6, 6);
    addLimb(group, handGeo, skin, [-0.58, 0.78, 0.5 + armReach * 0.3], null, "leftHand");
    addLimb(group, handGeo, skin, [0.58, 0.78, 0.5 + armReach * 0.3], null, "rightHand");

    if (Math.random() > 0.4) {
      const stain = addLimb(
        group,
        new THREE.CircleGeometry(0.12 + Math.random() * 0.1, 8),
        blood,
        [
          (Math.random() - 0.5) * 0.3,
          1.1 + Math.random() * 0.5,
          0.32 + Math.random() * 0.05,
        ],
        [-hunch + 0.2, 0, 0],
        "bloodStain"
      );
      stain.rotation.x = -Math.PI / 2 + hunch;
    }

    if (Math.random() > 0.65) {
      addLimb(
        group,
        new THREE.CylinderGeometry(0.04, 0.05, 0.2, 6),
        new THREE.MeshStandardMaterial({ color: 0xd4c4a8, roughness: 0.6 }),
        [(Math.random() - 0.5) * 0.25, 1.2, 0.34],
        [0.3, 0, 0],
        "bone"
      );
    }

    const spawnPos = getSpawnPosition();
    group.position.copy(spawnPos);
    group.userData = {
      bodyHits: 0,
      speed: cfg.zombieSpeed + (Math.random() - 0.5) * 0.4,
      damage: cfg.zombieDamage,
      attackTimer: 0,
      walkPhase: Math.random() * Math.PI * 2,
      limbs: {
        leftThigh,
        rightThigh,
        leftShin,
        rightShin,
        leftForeArm,
        rightForeArm,
        torso,
        head,
      },
      baseY: 0,
    };

    scene.add(group);
    zombies.push(group);
    return group;
  }

  function getSpawnPosition() {
    const angle = Math.random() * Math.PI * 2;
    const dist = CONFIG.spawnRadiusMin + Math.random() * (CONFIG.spawnRadiusMax - CONFIG.spawnRadiusMin);
    const x = player.position.x + Math.cos(angle) * dist;
    const z = player.position.z + Math.sin(angle) * dist;
    const half = CONFIG.arenaSize / 2 - 2;
    return new THREE.Vector3(
      THREE.MathUtils.clamp(x, -half, half),
      0,
      THREE.MathUtils.clamp(z, -half, half)
    );
  }

  function showWaveBanner(title, sub, duration) {
    waveBannerTitle.textContent = title;
    waveBannerSub.textContent = sub;
    waveBanner.classList.remove("hidden", "fade-out");
    clearTimeout(showWaveBanner._timer);
    showWaveBanner._timer = setTimeout(() => {
      waveBanner.classList.add("fade-out");
      setTimeout(() => waveBanner.classList.add("hidden"), 600);
    }, duration || 2800);
  }

  function startWave() {
    const cfg = getWaveConfig(wave);
    waveZombiesTotal = cfg.count;
    waveZombiesSpawned = 0;
    waveZombiesKilled = 0;
    waveState = "spawning";
    spawnTimer = 0.5;
    showWaveBanner("Wave " + wave, cfg.count + " zombies incoming");
    updateHUD();
  }

  function completeWave() {
    waveState = "break";
    score += CONFIG.waveBonus * wave;
    wave++;
    waveBreakTimer = CONFIG.waveBreakDuration;
    showWaveBanner("Wave " + (wave - 1) + " Cleared!", "+" + CONFIG.waveBonus * (wave - 1) + " bonus — next wave in " + CONFIG.waveBreakDuration + "s");
    updateHUD();
  }

  function startGame() {
    resetState();
    clock = new THREE.Clock();
    startScreen.classList.add("hidden");
    gameOverScreen.classList.add("hidden");
    hud.classList.remove("hidden");
    isPlaying = true;
    waveBreakTimer = 2;
    waveState = "break";
    renderer.domElement.requestPointerLock();
  }

  function restartGame() {
    clearZombies();
    startGame();
  }

  function resetState() {
    health = CONFIG.maxHealth;
    displayHealth = CONFIG.maxHealth;
    score = 0;
    totalKills = 0;
    wave = 1;
    waveZombiesTotal = 0;
    waveZombiesSpawned = 0;
    waveZombiesKilled = 0;
    waveState = "break";
    waveBreakTimer = 0;
    spawnTimer = 0;
    survivalTime = 0;
    difficultyTier = 1;
    shootTimer = 0;
    yaw = 0;
    pitch = 0;
    player.position.set(0, CONFIG.playerHeight, 0);
    camera.rotation.set(0, 0, 0);
    updateHUD();
  }

  function clearZombies() {
    zombies.forEach((z) => scene.remove(z));
    zombies = [];
  }

  function gameOver() {
    isPlaying = false;
    clearTimeout(showWaveBanner._timer);
    document.exitPointerLock();
    hud.classList.add("hidden");
    waveBanner.classList.add("hidden");
    finalScoreText.textContent = score;
    finalWaveText.textContent = Math.max(0, wave - 1);
    finalKillsText.textContent = totalKills;
    gameOverScreen.classList.remove("hidden");
  }

  function getRemainingCount() {
    if (waveState === "break") return 0;
    return waveZombiesTotal - waveZombiesKilled;
  }

  function updateHUD() {
    const pct = (health / CONFIG.maxHealth) * 100;
    const displayPct = (displayHealth / CONFIG.maxHealth) * 100;

    healthBar.style.width = pct + "%";
    healthBarDamage.style.width = displayPct + "%";
    healthBar.classList.remove("low", "mid");
    if (pct <= 25) healthBar.classList.add("low");
    else if (pct <= 55) healthBar.classList.add("mid");

    healthText.textContent = Math.max(0, Math.ceil(health)) + " / " + CONFIG.maxHealth;
    scoreText.textContent = score;
    killsText.textContent = totalKills;
    waveText.textContent = wave;
    remainingText.textContent = getRemainingCount();
  }

  function flashDamage() {
    damageFlash.classList.add("active");
    setTimeout(() => damageFlash.classList.remove("active"), 120);
  }

  function takeDamage(amount) {
    health -= amount;
    displayHealth = health;
    flashDamage();
    updateHUD();
    if (health <= 0) {
      health = 0;
      displayHealth = 0;
      gameOver();
    }
  }

  function findZombieFromHit(mesh) {
    let current = mesh;
    while (current) {
      if (zombies.includes(current)) return current;
      current = current.parent;
    }
    return null;
  }

  function getHitZone(mesh) {
    let current = mesh;
    while (current) {
      if (current.userData && current.userData.hitZone) {
        return current.userData.hitZone;
      }
      current = current.parent;
    }
    return "body";
  }

  function shoot() {
    if (!isPlaying || shootTimer > 0) return;
    shootTimer = CONFIG.shootCooldown;

    raycaster.setFromCamera(mouseVec, camera);
    const hits = raycaster.intersectObjects(zombies, true);

    if (hits.length > 0) {
      const hitMesh = hits[0].object;
      const zombie = findZombieFromHit(hitMesh);
      if (zombie) {
        const zone = getHitZone(hitMesh);
        applyShotDamage(zombie, zone, hits[0].point);
      }
    }

    muzzleFlash();
  }

  function applyShotDamage(zombie, zone, hitPoint) {
    if (zone === "head") {
      flashHit(hitPoint, 0xff2222);
      applyHitReaction(zombie, true);
      score += CONFIG.headshotBonus;
      killZombie(zombie);
      return;
    }

    zombie.userData.bodyHits += 1;
    flashHit(hitPoint, 0xff8844);
    applyHitReaction(zombie, false);

    if (zombie.userData.bodyHits >= CONFIG.bodyHitsToKill) {
      killZombie(zombie);
    }
  }

  function applyHitReaction(zombie, isHeadshot) {
    const ud = zombie.userData;
    if (ud.limbs && ud.limbs.head) {
      ud.limbs.head.rotation.x -= isHeadshot ? 0.45 : 0.15;
      setTimeout(() => {
        if (ud.limbs && ud.limbs.head) ud.limbs.head.rotation.x += isHeadshot ? 0.2 : 0.1;
      }, 100);
    }
  }

  function flashHit(position, color) {
    const flash = new THREE.PointLight(color || 0xff4444, 2.5, 5);
    flash.position.copy(position);
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 60);
  }

  function muzzleFlash() {
    const flash = new THREE.PointLight(0xffaa44, 3, 6);
    flash.position.set(0.25, -0.1, -0.5);
    camera.add(flash);
    setTimeout(() => camera.remove(flash), 50);
  }

  function killZombie(zombie) {
    const idx = zombies.indexOf(zombie);
    if (idx === -1) return;
    zombies.splice(idx, 1);
    scene.remove(zombie);
    totalKills++;
    waveZombiesKilled++;
    score += CONFIG.scorePerKill;
    updateHUD();

    if (
      waveState !== "break" &&
      waveZombiesSpawned >= waveZombiesTotal &&
      waveZombiesKilled >= waveZombiesTotal &&
      zombies.length === 0
    ) {
      completeWave();
    }
  }

  function onMouseDown(e) {
    if (!isPlaying || e.button !== 0) return;
    shoot();
  }

  function onMouseMove(e) {
    if (!isPlaying || document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = THREE.MathUtils.clamp(pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    camera.rotation.set(pitch, yaw, 0);
  }

  function onPointerLockChange() {}

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function getMoveDirection() {
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, yaw, 0));
    const move = new THREE.Vector3();

    if (keys.KeyW) move.add(forward);
    if (keys.KeyS) move.sub(forward);
    if (keys.KeyD) move.add(right);
    if (keys.KeyA) move.sub(right);

    if (move.lengthSq() > 0) move.normalize();
    return move;
  }

  function collidesAt(x, z, radius) {
    const box = new THREE.Box3();
    for (const obs of obstacles) {
      box.setFromObject(obs);
      if (
        x >= box.min.x - radius &&
        x <= box.max.x + radius &&
        z >= box.min.z - radius &&
        z <= box.max.z + radius
      ) {
        return true;
      }
    }
    return false;
  }

  function updatePlayerWithCollision(dt) {
    const move = getMoveDirection();
    if (move.lengthSq() === 0) return;

    let speed = CONFIG.playerSpeed;
    if (keys.ShiftLeft || keys.ShiftRight) speed *= CONFIG.sprintMultiplier;

    const step = move.clone().multiplyScalar(speed * dt);
    const next = player.position.clone();
    const radius = CONFIG.playerRadius;

    const tryAxis = (axis) => {
      next[axis] += step[axis];
      if (collidesAt(next.x, next.z, radius)) {
        next[axis] -= step[axis];
      }
    };

    tryAxis("x");
    tryAxis("z");

    const half = CONFIG.arenaSize / 2 - 1.5;
    next.x = THREE.MathUtils.clamp(next.x, -half, half);
    next.z = THREE.MathUtils.clamp(next.z, -half, half);
    player.position.copy(next);
  }

  function animateZombie(zombie, dt, dist) {
    const ud = zombie.userData;
    const limbs = ud.limbs;
    if (!limbs) return;

    ud.walkPhase += dt * (2.5 + ud.speed * 0.15);
    const swing = Math.sin(ud.walkPhase);
    const sway = Math.sin(ud.walkPhase * 0.5) * 0.04;

    limbs.leftThigh.rotation.x = swing * 0.45;
    limbs.rightThigh.rotation.x = -swing * 0.45;
    limbs.leftShin.rotation.x = Math.max(0, swing) * 0.35;
    limbs.rightShin.rotation.x = Math.max(0, -swing) * 0.35;

    limbs.leftForeArm.rotation.x = -1.2 + swing * 0.12;
    limbs.rightForeArm.rotation.x = -1.2 - swing * 0.12;
    limbs.torso.rotation.z = sway;
    limbs.head.rotation.y = Math.sin(ud.walkPhase * 0.7) * 0.08;

    zombie.position.y = Math.abs(swing) * 0.04;

    if (dist < 2.5) {
      limbs.leftForeArm.rotation.x = -1.55 + Math.sin(ud.walkPhase * 2) * 0.08;
      limbs.rightForeArm.rotation.x = -1.55 + Math.sin(ud.walkPhase * 2 + Math.PI) * 0.08;
    }
  }

  function updateZombies(dt) {
    const playerPos = new THREE.Vector3(player.position.x, 0, player.position.z);

    zombies.forEach((zombie) => {
      const pos = zombie.position;
      const dir = playerPos.clone().sub(new THREE.Vector3(pos.x, 0, pos.z));
      const dist = dir.length();
      const ud = zombie.userData;

      if (dist > 0.5) {
        dir.normalize();
        const speed = ud.speed + Math.min(dist * 0.015, 1.5);
        pos.x += dir.x * speed * dt;
        pos.z += dir.z * speed * dt;
        zombie.lookAt(playerPos.x, pos.y + 1.2, playerPos.z);
      }

      animateZombie(zombie, dt, dist);

      ud.attackTimer -= dt;
      if (dist < 1.5 && ud.attackTimer <= 0) {
        ud.attackTimer = CONFIG.zombieAttackCooldown;
        takeDamage(ud.damage);
      }
    });
  }

  function updateWaves(dt) {
    if (waveState === "break") {
      waveBreakTimer -= dt;
      if (waveBreakTimer <= 0) {
        startWave();
      }
      return;
    }

    if (waveState === "spawning" || waveState === "active") {
      const cfg = getWaveConfig(wave);

      if (waveZombiesSpawned < waveZombiesTotal) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
          createZombie();
          waveZombiesSpawned++;
          spawnTimer = cfg.spawnInterval * (0.75 + Math.random() * 0.5);
          if (waveZombiesSpawned >= waveZombiesTotal) {
            waveState = "active";
          }
        }
      }

      updateHUD();
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (isPlaying) {
      shootTimer = Math.max(0, shootTimer - dt);

      if (displayHealth > health) {
        displayHealth = Math.max(health, displayHealth - dt * 35);
        updateHUD();
      }

      updateDifficulty(dt);
      updatePlayerWithCollision(dt);
      updateZombies(dt);
      updateWaves(dt);
    }

    renderer.render(scene, camera);
  }

  init();
})();
