/**
 * =================================================================================================
 * BIOMORPH EVOLUTION SIMULATOR - WITH GENETIC ALGORITHM TARGETING
 * =================================================================================================
 */

let progenitor;
let offspring = [];
let isAnimationRunning = true;

// Timing and Simulation Variables
let t = 0;
let durationSeconds = 5.0;
let totalFrames = 300; 
let maturityIterations = 150; 

// UI and State Variables
let generationCount = 1;
let sidebarWidth = 320;
let isAutoMode = false;
let autoTimer = 0;
let populationRadius = 260;

// Genetic Algorithm Variables
let targetShape = "NONE"; 
let targetPoints = [];
let progenitorFitness = 0.0;

function setup() {
  createCanvas(1200, 850);
  background(0); 
  totalFrames = durationSeconds * 60;

  let initialDNA = new DNA();
  let simCenterX = sidebarWidth + (width - sidebarWidth) / 2;
  progenitor = new Bioforma(simCenterX, height / 2, initialDNA, true);
  
  generateTargetPoints();
  progenitorFitness = progenitor.getFitness();

  generateNewGeneration();
}

function draw() {
  // 1. ARTISTIC TRAIL (Simulation Zone)
  fill(0, 0, 0, 3); 
  noStroke();
  rect(sidebarWidth, 0, width - sidebarWidth, height);

  // 2. CLEAN SIDEBAR (Left Panel)
  fill(0);
  rect(0, 0, sidebarWidth, height);
  stroke(40);
  strokeWeight(2);
  line(sidebarWidth, 0, sidebarWidth, height);

  // 3. TIME AND AUTO-EVOLUTION LOGIC
  if (isAnimationRunning) {
    t++;
    if (t >= totalFrames) {
      t = totalFrames;
      isAnimationRunning = false;
    }
  } else if (isAutoMode) {
    autoTimer++;
    if (autoTimer > 45) { 
      selectBestOffspring();
    }
  }

  // 4. RENDER TARGET SILHOUETTE
  if (targetShape !== "NONE") {
    stroke(50, 255, 100, 50); // Neon green silhouette
    strokeWeight(2);
    noFill();
    beginShape();
    for (let p of targetPoints) {
      vertex(p.x, p.y);
    }
    endShape(CLOSE);
  }

  // 5. RENDER BIOMORPHS
  progenitor.display();
  for (let biomorph of offspring) {
    biomorph.display();
  }

  // 6. RENDER NATIVE UI
  drawSidebarUI();
}

// =================================================================================================
// SIDEBAR UI - GENETIC MONITOR & CONTROLS
// =================================================================================================
function drawSidebarUI() {
  fill(255);
  noStroke();
  textAlign(LEFT, TOP);

  // HEADER
  textSize(18);
  text("PHYLOGENETIC SYSTEM", 25, 30);

  textSize(12);
  fill(150);
  text("CURRENT GENERATION", 25, 70);
  textSize(28);
  fill(255);
  text(generationCount, 25, 85);

  // TIME CONTROLS 
  textSize(12);
  fill(150);
  text("GROWTH DURATION", 25, 140);
  drawButton(25, 160, 35, 30, "-");
  drawButton(155, 160, 35, 30, "+");
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(14);
  text(durationSeconds.toFixed(1) + " s", 107, 175);

  // MODE TOGGLE
  let modeTxt = isAutoMode ? "MODE: AUTOMATIC" : "MODE: MANUAL";
  let modeCol = isAutoMode ? color(50, 255, 100) : color(255);
  drawButton(25, 210, 165, 30, modeTxt, modeCol);

  // ACTION BUTTONS
  drawButton(25, 260, 165, 30, "REPLAY GROWTH");
  drawButton(25, 300, 165, 30, "NEW SIMULATION");

  // --- VISUAL DNA MONITOR ---
  textAlign(LEFT, TOP);
  textSize(12);
  fill(150);
  text("PROGENITOR GENOTYPE", 25, 370);
  stroke(60);
  line(25, 390, sidebarWidth - 25, 390);

  // 1. BRANCH LENGTHS
  noStroke();
  fill(150);
  text("BRANCH LENGTHS", 25, 405);
  for (let i = 0; i < 5; i++) {
    let yPos = 425 + (i * 20);
    let l_gene = progenitor.dna.lengthGenes[i];
    let v_gene = progenitor.dna.velocityGenes[i];
    let finalLen = l_gene + (v_gene * 10);
    
    strokeWeight(2);
    stroke(progenitor.getLevelColor(i)); 
    line(25, yPos, 25 + (finalLen * 3), yPos);
    noStroke();
    fill(255, 100);
    ellipse(25, yPos, 4, 4);
  }

  // 2. BRANCHING ANGLES
  noStroke();
  fill(150);
  text("FORK ANGLES", 160, 405);
  for (let i = 0; i < 4; i++) {
    let xCenter = 180 + (i % 2) * 60;
    let yCenter = 435 + floor(i / 2) * 50;
    let angleVal = progenitor.dna.angleGenes[i];
    
    stroke(200);
    strokeWeight(1.5);
    noFill();
    push();
    translate(xCenter, yCenter);
    line(0, 0, cos(-HALF_PI - angleVal) * 15, sin(-HALF_PI - angleVal) * 15);
    line(0, 0, cos(-HALF_PI + angleVal) * 15, sin(-HALF_PI + angleVal) * 15);
    pop();
  }

  // 3. MULTI-LEVEL COLOR PALETTE
  noStroke();
  fill(150);
  text("LEVEL-BASED PIGMENTATION", 25, 540);
  stroke(60);
  line(25, 560, sidebarWidth - 25, 560);
  
  for (let i = 0; i < 5; i++) {
    let c = progenitor.getLevelColor(i);
    fill(c);
    noStroke();
    rect(25 + (i * 45), 575, 35, 35, 4);
    fill(100);
    textSize(9);
    textAlign(CENTER);
    text("L" + i, 25 + (i * 45) + 17, 620);
  }
  
  // 4. EVOLUTIONARY TARGET (FITNESS)
  textAlign(LEFT, TOP);
  fill(150);
  textSize(12);
  text("EVOLUTIONARY TARGET & FITNESS", 25, 660);
  stroke(60);
  line(25, 680, sidebarWidth - 25, 680);
  
  let activeCol = color(50, 255, 100);
  let cNone = targetShape === "NONE" ? activeCol : color(255);
  let cCirc = targetShape === "CIRCLE" ? activeCol : color(255);
  let cTri = targetShape === "TRIANGLE" ? activeCol : color(255);
  let cSqua = targetShape === "SQUARE" ? activeCol : color(255);
  let cPent = targetShape === "PENTAGON" ? activeCol : color(255);
  let cHexa = targetShape === "HEXAGON" ? activeCol : color(255);
  
  // ROW 1
  drawButton(25, 695, 80, 25, "NONE", cNone);
  drawButton(115, 695, 80, 25, "CIRCLE", cCirc);
  drawButton(205, 695, 85, 25, "TRIANGLE", cTri);
  // ROW 2
  drawButton(25, 730, 80, 25, "SQUARE", cSqua);
  drawButton(115, 730, 80, 25, "PENTAGON", cPent);
  drawButton(205, 730, 85, 25, "HEXAGON", cHexa);
  
  fill(255);
  textSize(13);
  if (targetShape !== "NONE") {
     text("FITNESS SCORE: " + progenitorFitness.toFixed(2), 25, 775);
  } else {
     fill(100);
     text("FITNESS SCORE: N/A (Random Mode)", 25, 775);
  }

  fill(80);
  textSize(10);
  text("Evaluates node proximity and full shape coverage.", 25, 810);
}

function drawButton(x, y, w, h, label, labelCol = 255) {
  let isHover = mouseX > x && mouseX < x + w && mouseY > y && mouseY < y + h;
  fill(isHover ? 40 : 20);
  stroke(isHover ? 100 : 50);
  strokeWeight(1);
  rect(x, y, w, h, 4);
  
  fill(labelCol);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(11);
  text(label, x + w/2, y + h/2);
}

// =================================================================================================
// INTERACTIONS & TARGET LOGIC
// =================================================================================================
function mousePressed() {
  if (clickInside(25, 160, 35, 30)) {
    durationSeconds = max(0.1, durationSeconds - 0.5);
    totalFrames = durationSeconds * 60;
    resetAnimationTrail(); return;
  }
  if (clickInside(155, 160, 35, 30)) {
    durationSeconds = min(20.0, durationSeconds + 0.5);
    totalFrames = durationSeconds * 60;
    resetAnimationTrail(); return;
  }
  if (clickInside(25, 210, 165, 30)) {
    isAutoMode = !isAutoMode;
    if (isAutoMode && !isAnimationRunning) autoTimer = 45; 
    return;
  }
  if (clickInside(25, 260, 165, 30)) { resetAnimationTrail(); return; }
  if (clickInside(25, 300, 165, 30)) {
    generationCount = 1;
    progenitor = new Bioforma(sidebarWidth + (width - sidebarWidth) / 2, height / 2, new DNA(), true);
    progenitorFitness = progenitor.getFitness();
    generateNewGeneration(); resetAnimationTrail(); return;
  }
  
  // Target Shape Buttons
  if (clickInside(25, 695, 80, 25)) setTargetShape("NONE");
  if (clickInside(115, 695, 80, 25)) setTargetShape("CIRCLE");
  if (clickInside(205, 695, 85, 25)) setTargetShape("TRIANGLE");
  
  if (clickInside(25, 730, 80, 25)) setTargetShape("SQUARE");
  if (clickInside(115, 730, 80, 25)) setTargetShape("PENTAGON");
  if (clickInside(205, 730, 85, 25)) setTargetShape("HEXAGON");
  
  if (!isAutoMode) {
    for (let child of offspring) {
      if (child.isMouseOver(mouseX, mouseY)) {
        evolveTo(child); break; 
      }
    }
  }
}

function keyPressed() { if (key === ' ') resetAnimationTrail(); }
function clickInside(x, y, w, h) { return (mouseX > x && mouseX < x + w && mouseY > y && mouseY < y + h); }

function setTargetShape(type) {
  targetShape = type;
  generateTargetPoints();
  progenitorFitness = progenitor.getFitness();
  resetAnimationTrail();
}

function selectBestOffspring() {
  if (targetShape === "NONE") {
    evolveTo(random(offspring));
  } else {
    let bestChild = offspring[0];
    let bestFitness = -1;
    for (let child of offspring) {
      let currentFitness = child.getFitness();
      if (currentFitness > bestFitness) {
        bestFitness = currentFitness;
        bestChild = child;
      }
    }
    evolveTo(bestChild);
  }
}

function evolveTo(chosenBiomorph) {
  let simCenterX = sidebarWidth + (width - sidebarWidth) / 2;
  progenitor = new Bioforma(simCenterX, height / 2, chosenBiomorph.dna, true);
  progenitorFitness = progenitor.getFitness(); 
  generationCount++;
  generateNewGeneration();
  resetAnimationTrail();
}

function generateNewGeneration() {
  offspring = []; 
  let simCenterX = sidebarWidth + (width - sidebarWidth) / 2;
  let simCenterY = height / 2;
  
  for (let i = 0; i < 6; i++) {
    let anglePos = (i * Math.PI) / 3;
    let posX = simCenterX + populationRadius * cos(anglePos);
    let posY = simCenterY + populationRadius * sin(anglePos);
    offspring.push(new Bioforma(posX, posY, progenitor.dna.mutate(), false));
  }
}

function resetAnimationTrail() {
  t = 0; autoTimer = 0; isAnimationRunning = true;
  push(); fill(0); rect(sidebarWidth, 0, width - sidebarWidth, height); pop();
}

// Helper para generar polígonos regulares
function getPolygonPoints(cx, cy, radius, sides, numPoints) {
  let pts = [];
  let pointsPerSide = ceil(numPoints / sides);
  for (let s = 0; s < sides; s++) {
    let angle1 = (s * TWO_PI) / sides - HALF_PI;
    let angle2 = ((s + 1) * TWO_PI) / sides - HALF_PI;
    let p1 = createVector(cx + cos(angle1) * radius, cy + sin(angle1) * radius);
    let p2 = createVector(cx + cos(angle2) * radius, cy + sin(angle2) * radius);
    for (let i = 0; i < pointsPerSide; i++) {
      pts.push(p5.Vector.lerp(p1, p2, i / pointsPerSide));
    }
  }
  return pts;
}

function generateTargetPoints() {
  targetPoints = [];
  if (targetShape === "NONE") return;
  
  let cx = sidebarWidth + (width - sidebarWidth) / 2;
  let cy = height / 2;
  
  // Tamaño reducido a 100 para permitir "sobrecrecimiento" y dejar que el algoritmo penalice.
  // El hábitat del progenitor sigue siendo 140.
  let r = 100; 
  
  if (targetShape === "CIRCLE") {
    for (let i = 0; i < 32; i++) {
      let a = (i * TWO_PI) / 32;
      targetPoints.push(createVector(cx + cos(a) * r, cy + sin(a) * r));
    }
  } else if (targetShape === "TRIANGLE") {
    targetPoints = getPolygonPoints(cx, cy, r + 20, 3, 32); // Un poco más grande para compensar área visual
  } else if (targetShape === "SQUARE") {
    targetPoints = getPolygonPoints(cx, cy, r + 10, 4, 32);
  } else if (targetShape === "PENTAGON") {
    targetPoints = getPolygonPoints(cx, cy, r, 5, 32);
  } else if (targetShape === "HEXAGON") {
    targetPoints = getPolygonPoints(cx, cy, r, 6, 32);
  }
}

// =================================================================================================
// DNA CLASS 
// =================================================================================================
class DNA {
  constructor(parentDNA = null) {
    this.lengthGenes = new Array(5);
    this.velocityGenes = new Array(5);
    this.angleGenes = new Array(4);
    
    if (parentDNA === null) {
      for (let i = 0; i < 5; i++) {
        this.lengthGenes[i] = random(2, 10);
        this.velocityGenes[i] = random(-2, 2);
      }
      for (let i = 0; i < 4; i++) this.angleGenes[i] = random(0.2, 0.8);
      
      this.r = int(random(60, 200)); this.g = int(random(60, 200)); this.b = int(random(60, 200));
      this.incrR = int(random(-20, 30)); this.incrG = int(random(-20, 30)); this.incrB = int(random(-20, 30));
    } else {
      for (let i = 0; i < 5; i++) {
        this.lengthGenes[i] = parentDNA.lengthGenes[i];
        this.velocityGenes[i] = parentDNA.velocityGenes[i];
      }
      for (let i = 0; i < 4; i++) this.angleGenes[i] = parentDNA.angleGenes[i];
      
      this.r = parentDNA.r; this.g = parentDNA.g; this.b = parentDNA.b;
      this.incrR = parentDNA.incrR; this.incrG = parentDNA.incrG; this.incrB = parentDNA.incrB;
    }
  }
  
  mutate() {
    let mDNA = new DNA(this);
    for (let i = 0; i < 5; i++) {
      mDNA.lengthGenes[i] = constrain(mDNA.lengthGenes[i] + random(-1.5, 1.5), 2, 22);
      mDNA.velocityGenes[i] = constrain(mDNA.velocityGenes[i] + random(-0.5, 0.5), -2.5, 2.5);
    }
    for (let i = 0; i < 4; i++) {
      mDNA.angleGenes[i] = constrain(mDNA.angleGenes[i] + random(-0.1, 0.1), 0.05, 1.5);
    }
    mDNA.r = constrain(mDNA.r + random(-15, 15), 40, 255);
    mDNA.g = constrain(mDNA.g + random(-15, 15), 40, 255);
    mDNA.b = constrain(mDNA.b + random(-15, 15), 40, 255);
    mDNA.incrR = constrain(mDNA.incrR + random(-5, 5), -40, 60);
    mDNA.incrG = constrain(mDNA.incrG + random(-5, 5), -40, 60);
    mDNA.incrB = constrain(mDNA.incrB + random(-5, 5), -40, 60);
    return mDNA;
  }
}

// =================================================================================================
// BIOFORMA CLASS
// =================================================================================================
class Bioforma {
  constructor(x, y, dna, isProgenitor) {
    this.x = x; this.y = y; this.dna = dna;
    this.isProgenitor = isProgenitor; 
    this.habitatRadius = isProgenitor ? 140 : 95; 
  }

  getLevelColor(level) {
    let red = constrain(this.dna.r + this.dna.incrR * level, 0, 255);
    let grn = constrain(this.dna.g + this.dna.incrG * level, 0, 255);
    let blu = constrain(this.dna.b + this.dna.incrB * level, 0, 255);
    return color(red, grn, blu);
  }

  // --- NEW BIDIRECTIONAL FITNESS ALGORITHM ---
  getFitness() {
    if (targetShape === "NONE" || targetPoints.length === 0) return 0;
    
    let k = maturityIterations;
    let lengths = new Array(5);
    let angles = new Array(4);
    
    for (let i = 0; i < 5; i++) {
      let r = 0.9; 
      let growthFactor = (1 - Math.pow(r, k)) * 10;
      let baseLen = this.dna.lengthGenes[i] + (this.dna.velocityGenes[i] * growthFactor);
      lengths[i] = baseLen * 1.8; 
    }
    for (let i = 0; i < 4; i++) angles[i] = this.dna.angleGenes[i] + (0.001 * (i+1) * k);
    
    let px = new Array(32); let py = new Array(32);
    let an = new Array(31);
    let a1 = angles[0]; let a2 = angles[1]; let a3 = angles[2]; let a4 = angles[3];
    
    an[0] = 0;
    an[1] = a1;     an[2] = -a1;
    an[3] = a1+a2;  an[4] = a1-a2;  an[5] = -a1+a2;  an[6] = -a1-a2;
    an[7] = a1+a2+a3; an[8] = a1+a2-a3; an[9] = a1-a2+a3; an[10] = a1-a2-a3;
    an[11] = -a1+a2+a3; an[12] = -a1+a2-a3; an[13] = -a1-a2+a3; an[14] = -a1-a2-a3;
    an[15] = a1+a2+a3+a4; an[16] = a1+a2+a3-a4; an[17] = a1+a2-a3+a4; an[18] = a1+a2-a3-a4;
    an[19] = a1-a2+a3+a4; an[20] = a1-a2+a3-a4; an[21] = a1-a2-a3+a4; an[22] = a1-a2-a3-a4;
    an[23] = -a1+a2+a3+a4; an[24] = -a1+a2+a3-a4; an[25] = -a1+a2-a3+a4; an[26] = -a1+a2-a3-a4;
    an[27] = -a1-a2+a3+a4; an[28] = -a1-a2+a3-a4; an[29] = -a1-a2-a3+a4; an[30] = -a1-a2-a3-a4;
    
    let simCenterX = sidebarWidth + (width - sidebarWidth) / 2;
    let simCenterY = height / 2;
    let virtualHabitat = 140; 
    
    px[0] = simCenterX; py[0] = simCenterY;
    
    // 1. Calcular las coordenadas finales de los nodos
    for (let i = 1; i < 32; i++) {
      let level = 4;
      if (i < 16) level = 3; if (i < 8) level = 2; if (i < 4) level = 1; if (i < 2) level = 0;
      let parentIdx = floor(i / 2);
      let nextX = px[parentIdx] + lengths[level] * sin(an[i-1]);
      let nextY = py[parentIdx] + lengths[level] * cos(an[i-1]);
      
      let distToCenter = dist(nextX, nextY, simCenterX, simCenterY);
      if (distToCenter > virtualHabitat) {
        let edgeAngle = atan2(nextY - simCenterY, nextX - simCenterX);
        px[i] = simCenterX + virtualHabitat * cos(edgeAngle);
        py[i] = simCenterY + virtualHabitat * sin(edgeAngle);
      } else {
        px[i] = nextX; py[i] = nextY;
      }
    }
    
    // 2. ERROR A: Precisión (¿Se salen las ramas de la figura?)
    let errorNodesToTarget = 0;
    for (let i = 1; i < 32; i++) {
      let minDistance = Infinity;
      for (let tp of targetPoints) {
        let d = dist(px[i], py[i], tp.x, tp.y);
        if (d < minDistance) minDistance = d;
      }
      errorNodesToTarget += minDistance;
    }

    // 3. ERROR B: Cobertura (¿Están todos los puntos de la figura cubiertos por ramas?)
    let errorTargetToNodes = 0;
    for (let tp of targetPoints) {
      let minDistance = Infinity;
      for (let i = 1; i < 32; i++) {
        let d = dist(px[i], py[i], tp.x, tp.y);
        if (d < minDistance) minDistance = d;
      }
      errorTargetToNodes += minDistance;
    }
    
    // Sumamos ambos errores. Multiplico la cobertura por 1.5 para forzar a la IA a expandirse.
    let totalError = errorNodesToTarget + (errorTargetToNodes * 1.5);
    
    return 100000 / (1 + totalError);
  }
  
  display() {
    let k = (t / totalFrames) * maturityIterations;
    let lengths = new Array(5);
    let angles = new Array(4);
    
    for (let i = 0; i < 5; i++) {
      let r = 0.9; 
      let growthFactor = (1 - Math.pow(r, k)) * 10;
      let baseLen = this.dna.lengthGenes[i] + (this.dna.velocityGenes[i] * growthFactor);
      lengths[i] = baseLen * (this.isProgenitor ? 1.8 : 1.0);
    }
    
    for (let i = 0; i < 4; i++) angles[i] = this.dna.angleGenes[i] + (0.001 * (i+1) * k);
    
    let px = new Array(32); let py = new Array(32);
    let an = new Array(31);
    let a1 = angles[0]; let a2 = angles[1]; let a3 = angles[2]; let a4 = angles[3];
    
    an[0] = 0;
    an[1] = a1;     an[2] = -a1;
    an[3] = a1+a2;  an[4] = a1-a2;  an[5] = -a1+a2;  an[6] = -a1-a2;
    an[7] = a1+a2+a3; an[8] = a1+a2-a3; an[9] = a1-a2+a3; an[10] = a1-a2-a3;
    an[11] = -a1+a2+a3; an[12] = -a1+a2-a3; an[13] = -a1-a2+a3; an[14] = -a1-a2-a3;
    an[15] = a1+a2+a3+a4; an[16] = a1+a2+a3-a4; an[17] = a1+a2-a3+a4; an[18] = a1+a2-a3-a4;
    an[19] = a1-a2+a3+a4; an[20] = a1-a2+a3-a4; an[21] = a1-a2-a3+a4; an[22] = a1-a2-a3-a4;
    an[23] = -a1+a2+a3+a4; an[24] = -a1+a2+a3-a4; an[25] = -a1+a2-a3+a4; an[26] = -a1+a2-a3-a4;
    an[27] = -a1-a2+a3+a4; an[28] = -a1-a2+a3-a4; an[29] = -a1-a2-a3+a4; an[30] = -a1-a2-a3-a4;
    
    px[0] = this.x; py[0] = this.y;
    
    for (let i = 1; i < 32; i++) {
      let level = 4;
      if (i < 16) level = 3; if (i < 8) level = 2; if (i < 4) level = 1; if (i < 2) level = 0;
      
      let parentIdx = floor(i / 2);
      let nextX = px[parentIdx] + lengths[level] * sin(an[i-1]);
      let nextY = py[parentIdx] + lengths[level] * cos(an[i-1]);
      
      let distToCenter = dist(nextX, nextY, this.x, this.y);
      if (distToCenter > this.habitatRadius) {
        let edgeAngle = atan2(nextY - this.y, nextX - this.x);
        px[i] = this.x + this.habitatRadius * cos(edgeAngle);
        py[i] = this.y + this.habitatRadius * sin(edgeAngle);
      } else {
        px[i] = nextX; py[i] = nextY;
      }
    }
    
    noFill();
    if (this.isProgenitor) {
      stroke(200, 200, 200, 40); 
      strokeWeight(1.5);
    } else {
      stroke(60, 60, 60, 100);   
      strokeWeight(1);
    }
    ellipse(this.x, this.y, this.habitatRadius * 2, this.habitatRadius * 2);
    
    for (let i = 0; i < 32; i++) {
      let level = 4;
      if (i < 32) level = 4; if (i < 16) level = 3; if (i < 8) level = 2; if (i < 4) level = 1; if (i < 2) level = 0;
      let parentIdx = floor(i / 2);
      let c = this.getLevelColor(level);
      
      stroke(red(c), green(c), blue(c), 15);
      ellipse(px[i], py[i], lengths[level] / 3, lengths[level] / 3); 
      
      stroke(red(c), green(c), blue(c), 180);
      strokeWeight(1.5);
      line(px[parentIdx], py[parentIdx], px[i], py[i]);
      
      stroke(red(c), green(c), blue(c), 140);
      ellipse(px[i], py[i], lengths[level] / 12, lengths[level] / 12); 
    }
  }
  
  isMouseOver(mx, my) { return dist(mx, my, this.x, this.y) < this.habitatRadius; }
}
