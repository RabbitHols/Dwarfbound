import { Application, Graphics } from 'pixi.js';
import { Noise } from 'noisejs';
const noise = new Noise(Math.random()); // Istanza di rumore Perlin

// Define the chunk size (e.g., 20x20 tiles)
const CHUNK_SIZE = 100;

// Constants
const gridSize = 1800;
const cellSize = 9;
const rows = gridSize / cellSize;
const cols = gridSize / cellSize;


// Terrain and object types
const TERRAIN_TYPES = ['grass', 'rock', 'water'];
const OBJECT_TYPES = ['empty', 'tree'];

    // Define initial zoomFactor
    let zoomFactor = 1; // Initial zoom factor
    const minZoom = 0.5; // Minimum zoom level
    const maxZoom = 10; // Maximum zoom level

    // Initialize camera position (can be dynamically updated based on user input or scrolling)
let cameraX = 0;
let cameraY = 0;

// Calculate the chunk size based on the zoom factor
const viewportWidth = window.innerWidth;
const viewportHeight = window.innerHeight;

const chunkWidth = Math.ceil(viewportWidth / (cellSize * zoomFactor));  // Width in tiles
const chunkHeight = Math.ceil(viewportHeight / (cellSize * zoomFactor)); // Height in tiles

// Calculate the visible chunk area (the part of the map that should be updated)
const startRow = Math.floor(cameraY / cellSize);
const startCol = Math.floor(cameraX / cellSize);

const endRow = Math.min(startRow + chunkHeight, rows);
const endCol = Math.min(startCol + chunkWidth, cols);
// Spawn points
const spawnPoints = [
    { x: 5, y: 5, width: 2, height: 2, color: 0xff0000, id: 'spawn1' }, // Red spawn point
    { x: 45, y: 15, width: 2, height: 2, color: 0x320000, id: 'spawn2' }, // Red spawn point

];


let spawnTimers = Array(spawnPoints.length).fill(0); // Timers for each spawn point
const spawnInterval = 300; // 10 seconds at 60 FPS

// Resource counter and dwarf tracker
const resources = {
    grassConverted: 0,
    treesCut: 0,
    activeDwarfs: 0,
    deadDwarfs: 0
};

// Water usage tracker
const waterUsage = {};


// Grid state
const gridState = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
        terrain: getRandomTerrain(row, col),
        object: getRandomObject(getRandomTerrain(row, col), row, col)
    }))
);
// Dwarfs
const dwarfs = [];

// Function to calculate which chunks need to be loaded based on the active gnome's position
function getActiveChunks(dwarf) {
    const chunkRow = Math.floor(dwarf.y / CHUNK_SIZE);
    const chunkCol = Math.floor(dwarf.x / CHUNK_SIZE);
    const chunkRange = 2;
    const activeChunks = [];

    for (let row = chunkRow - chunkRange; row <= chunkRow + chunkRange; row++) {
        for (let col = chunkCol - chunkRange; col <= chunkCol + chunkRange; col++) {
            if (row >= 0 && col >= 0 && row < Math.ceil(rows / CHUNK_SIZE) && col < Math.ceil(cols / CHUNK_SIZE)) {
                activeChunks.push({ row, col });
            }
        }
    }
    return activeChunks;
}

/**
 * Generates a random terrain type for a grid cell.
 */
function getRandomTerrain(row, col) {
    const noiseScale = 0.1;
    const noiseValue = noise.perlin2(col * noiseScale, row * noiseScale);
    const waterThreshold = -0.2;
    const forestThreshold = 0.2;
    const rockThreshold = 0.5;

    if (noiseValue < waterThreshold) return 'water';
    if (noiseValue < forestThreshold) return 'forest';
    if (noiseValue < rockThreshold) return 'rock';
    return 'grass';
}


/**
 * Spawns a dwarf in a specific spawn point.
 */
function spawnDwarfInSpawnPoint(spawnPoint) {
    for (let row = spawnPoint.y; row < spawnPoint.y + spawnPoint.height; row++) {
        for (let col = spawnPoint.x; col < spawnPoint.x + spawnPoint.width; col++) {
            if (gridState[row][col].terrain === 'rock' && gridState[row][col].object === 'empty') {
                // Spawn a new dwarf only if the terrain is rock
                const newDwarf = {
                    x: col,
                    y: row,
                    state: 'idle',
                    thirst: 0,
                    cuttingProgress: 0,
                    color: spawnPoint.color, // Assign spawn point color
                    type: spawnPoint.id, // Assign spawn point ID as type
                    speed: 0.1, // Add a speed factor (smaller value = slower)
                };
                dwarfs.push(newDwarf);
                resources.activeDwarfs++;
                return; // Spawn only one dwarf per interval
            }
        }
    }
}



/**
 * Updates the spawn timers and spawns dwarfs for each spawn point.
 */
function updateSpawnPoints() {
    spawnPoints.forEach((spawnPoint, index) => {
        spawnTimers[index]++;
        if (spawnTimers[index] >= spawnInterval) {
            spawnDwarfInSpawnPoint(spawnPoint);
            spawnTimers[index] = 0; // Reset the timer
        }
    });
}

/**
 * Draws the spawn points on the grid.
 */
function drawSpawnPoints(graphics) {
    spawnPoints.forEach((spawnPoint) => {
        graphics.beginFill(spawnPoint.color, 0.5);
        graphics.drawRect(
            spawnPoint.x * cellSize * zoomFactor,
            spawnPoint.y * cellSize * zoomFactor,
            spawnPoint.width * cellSize * zoomFactor,
            spawnPoint.height * cellSize * zoomFactor
        );
        graphics.endFill();
    });
}

/**
 * Draws the dwarfs on the graphics object.
 */
function drawDwarfs(graphics, activeChunks) {
    graphics.clear();
    activeChunks.forEach(chunk => {
        dwarfs.forEach(dwarf => {
            if (dwarf.x >= chunk.col * CHUNK_SIZE && dwarf.x < (chunk.col + 1) * CHUNK_SIZE &&
                dwarf.y >= chunk.row * CHUNK_SIZE && dwarf.y < (chunk.row + 1) * CHUNK_SIZE) {
                graphics.beginFill(dwarf.color);
                graphics.drawRect(
                    dwarf.x * cellSize * zoomFactor + 4,
                    dwarf.y * cellSize * zoomFactor + 4,
                    (cellSize - 2) * zoomFactor,
                    (cellSize - 2) * zoomFactor
                );
                graphics.endFill();
            }
        });
    });
}

/**
 * Updates the dwarfs and grid state.
 */
function updateDwarfs() {
    resources.activeDwarfs = 0;
    
    // Update dwarfs and remove dead ones
    for (let i = 0; i < dwarfs.length; i++) {
        const dwarf = dwarfs[i];
        
        // If the dwarf is dead, remove it from the array and update active dwarfs count
        if (dwarf.state === 'dead') {
            resources.deadDwarfs++;
            dwarfs.splice(i, 1); // Remove the dead dwarf from the array
            i--; // Adjust the index after removing the element
            continue; // Skip further processing for this dwarf
        }
        
        // Check if dwarf is within the visible chunk before updating
        if (dwarf.y >= startRow && dwarf.y < endRow && dwarf.x >= startCol && dwarf.x < endCol) {
            resources.activeDwarfs++;
            moveDwarf(dwarf); // Move dwarf within the chunk
        }
    }
}


/**
 * Moves a dwarf to a neighboring cell based on its surroundings.
 */
function moveDwarf(dwarf) {
    if (dwarf.y < startRow || dwarf.y >= endRow || dwarf.x < startCol || dwarf.x >= endCol) {
        return; // Freeze dwarf's movement outside visible area
    }
    if (dwarf.state === 'dead') return; // Dead dwarfs do nothing

    dwarf.thirst++;

    // If the dwarf's thirst exceeds 20 turns, it dies
    if (dwarf.thirst > 11120) {
        gridState[dwarf.y][dwarf.x].terrain = 'rock';
        dwarf.state = 'dead';
        return;
    }

    // Track inactivity and kill if inactive for too long
    dwarf.inactiveTurns = dwarf.inactiveTurns || 0;

    if (dwarf.state === 'searching') {
        const waterNeighbor = getNeighbors(dwarf.y, dwarf.x).find(
            (neighbor) => neighbor.terrain === 'water'
        );
        if (waterNeighbor) {
            dwarf.x = waterNeighbor.col;
            dwarf.y = waterNeighbor.row;

            // Update water usage
            const waterKey = `${dwarf.y},${dwarf.x}`;
            waterUsage[waterKey] = (waterUsage[waterKey] || 0) + 1;

            if (waterUsage[waterKey] >= 5) {
                gridState[dwarf.y][dwarf.x].terrain = 'rock'; // Water becomes rock after 5 uses
            }

            dwarf.state = 'drinking';
            dwarf.thirst = 0; // Reset thirst
            dwarf.inactiveTurns = 0; // Reset inactivity
            return;
        }
    }

    if (dwarf.state === 'drinking') {
        dwarf.state = 'idle';
        dwarf.inactiveTurns = 0; // Reset inactivity
        return;
    }

    if (dwarf.state === 'cutting') {
        dwarf.cuttingProgress--;
        if (dwarf.cuttingProgress <= 0) {
            const { x, y } = dwarf.target;

            // Increment counters before clearing the grid
            if (gridState[y][x].object === 'tree') {
                resources.treesCut++;
            } else if (gridState[y][x].terrain === 'grass') {
                resources.grassConverted++;
            }

            // Clear the grid cell
            gridState[y][x].terrain = 'rock';
            gridState[y][x].object = 'empty';

            dwarf.state = 'idle';
            dwarf.inactiveTurns = 0; // Reset inactivity
        }
        return;
    }

    const cuttableNeighbor = getCuttableNeighbor(dwarf);
    if (cuttableNeighbor) {
        dwarf.state = 'cutting';
        dwarf.cuttingProgress =
            cuttableNeighbor.object === 'tree' ? 40 : 40; // Cutting time depends on type
        dwarf.target = { x: cuttableNeighbor.col, y: cuttableNeighbor.row };
        dwarf.inactiveTurns = 0; // Reset inactivity
        return;
    }

    const neighbors = getNeighbors(dwarf.y, dwarf.x);
    const rockNeighbors = neighbors.filter(
        (neighbor) => neighbor.terrain === 'rock' && neighbor.object === 'empty'
    );

    // Filter out neighbors where there are already dwarfs
    const freeRockNeighbors = rockNeighbors.filter(
        (neighbor) => !dwarfs.some(d => d.x === neighbor.col && d.y === neighbor.row)
    );

    if (freeRockNeighbors.length > 0) {
        const newCell = freeRockNeighbors[Math.floor(Math.random() * freeRockNeighbors.length)];
        dwarf.x = newCell.col;
        dwarf.y = newCell.row;
        dwarf.inactiveTurns = 0; // Reset inactivity since the dwarf moved
    } else {
        dwarf.inactiveTurns++; // Increment inactivity if no movement
    }

    // If the dwarf stays inactive for too long, it dies
    dwarf.inactiveTurns++; // Increment inactivity since no cutting

    if (dwarf.inactiveTurns >= 20) {
        dwarf.state = 'dead'; // Mark as dead
        resources.deadDwarfs++;
        gridState[dwarf.y][dwarf.x].terrain = 'rock'; // Convert its position to rock
        console.log(`Dwarf at (${dwarf.x}, ${dwarf.y}) died due to inactivity.`);

    }
    console.log(dwarf.inactiveTurns)
}



/**
 * Gets the neighboring cells of a given cell.
 */

function getNeighbors(row, col) {
    const neighbors = [];
    for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
            if (x === 0 && y === 0) continue;
            const neighborRow = row + y;
            const neighborCol = col + x;
            if (neighborRow >= 0 && neighborRow < rows && neighborCol >= 0 && neighborCol < cols) {
                neighbors.push({
                    ...gridState[neighborRow][neighborCol],
                    row: neighborRow,
                    col: neighborCol
                });
            }
        }
    }
    return neighbors;
}

/**
 * Checks if a dwarf has a neighboring cell with grass or a tree.
 */
function getCuttableNeighbor(dwarf) {
    const neighbors = getNeighbors(dwarf.y, dwarf.x);
    return neighbors.find(
        (neighbor) => neighbor.terrain === 'grass' || neighbor.object === 'tree' 
    );
}
function drawGrid(graphics, activeChunks) {
    graphics.clear();
    activeChunks.forEach(chunk => {
        for (let row = chunk.row * CHUNK_SIZE; row < (chunk.row + 1) * CHUNK_SIZE; row++) {
            for (let col = chunk.col * CHUNK_SIZE; col < (chunk.col + 1) * CHUNK_SIZE; col++) {
                if (row < rows && col < cols) {
                    const cell = gridState[row][col];
                    const terrainColor = getTerrainColor(cell.terrain);
                    graphics.beginFill(terrainColor);
                    graphics.drawRect(
                        col * cellSize * zoomFactor,
                        row * cellSize * zoomFactor,
                        cellSize * zoomFactor,
                        cellSize * zoomFactor
                    );
                    graphics.endFill();
                }
            }
        }
    });
}


/**
 * Gets the color based on terrain type.
 */
function getTerrainColor(terrain) {
    switch (terrain) {
        case 'grass': return 0x6B8E23; // Green for grass
        case 'rock': return 0xA9A9A9; // Gray for rock
        case 'water': return 0x1E90FF; // Blue for water
        case 'forest': return 0x228B22; // Dark green for forest
        default: return 0xFFFFFF; // White as fallback
    }
}


function getRandomObject(terrain, row, col) {
    if (terrain === 'forest') {
        return 'tree'; // Ogni terreno 'forest' ha sempre un albero
    }
    return 'empty'; // Nessun oggetto su terreni non forestali
}

/**
 * Gets the color based on object type.
 */
function getObjectColor(object) {
    switch (object) {
        case 'tree': return 0x228B22; // ForestGreen (green for trees)
        case 'empty': return 0xFFFFFF; // White (no object)
        default: return 0xFFFFFF;
    }
}

/**
 * Updates the resource display in the control panel.
 */
function updateResourceDisplay() {
    const resourcesDiv = document.getElementById('resources');
    resourcesDiv.innerHTML = `
        <strong>Active Dwarfs:</strong> ${resources.activeDwarfs}<br>
        <strong>Dead Dwarfs:</strong> ${resources.deadDwarfs}<br>
        <strong>Grass Converted:</strong> ${resources.grassConverted}<br>
        <strong>Trees Cut:</strong> ${resources.treesCut}<br>
    `;
}

/**
 * Main game loop setup.
 */
(async () => {
    const app = new Application();

    await app.init({ antialias: true, resizeTo: window });
    document.body.appendChild(app.canvas);

    const terrainGraphics = new Graphics();
    const dwarfGraphics = new Graphics();
    app.stage.addChild(terrainGraphics);
    app.stage.addChild(dwarfGraphics);
    
        // Handle zoom input (mouse wheel or buttons)
        window.addEventListener('wheel', (event) => {
            console.log('zoom')
            if (event.deltaY < 0) {
                // Zoom in
                zoomFactor = Math.min(zoomFactor + 0.1, maxZoom);
            } else {
                // Zoom out
                zoomFactor = Math.max(zoomFactor - 0.1, minZoom);
            }
            event.preventDefault(); // Prevent page scroll
        });

    const controlPanel = document.createElement('div');
    controlPanel.style.position = 'absolute';
    controlPanel.style.top = '10px';
    controlPanel.style.right = '10px';
    controlPanel.style.backgroundColor = '#222';
    controlPanel.style.padding = '10px';
    controlPanel.style.borderRadius = '8px';
    controlPanel.style.color = 'white';
    controlPanel.style.fontFamily = 'Arial';
    controlPanel.style.fontSize = '14px';
    controlPanel.innerHTML = `
        <h3>Game Info</h3>
        <div id="resources"></div>
    `;
    document.body.appendChild(controlPanel);

    spawnDwarfInSpawnPoint(spawnPoints[0]); // Adjust index for the desired spawn point
    spawnDwarfInSpawnPoint(spawnPoints[1]); // Adjust index for the desired spawn point
    app.ticker.speed = 0.1;
    app.ticker.add(() => {
        app.ticker.speed = 0.1;
        updateSpawnPoints(); // Update all spawn points
        updateDwarfs(); // Update dwarf logic
    
        // Get active chunks based on the position of the active gnome
        const activeChunks = getActiveChunks(dwarfs[0]); // Assuming we use the first gnome for this example
    
        drawGrid(terrainGraphics, activeChunks); // Draw active chunks of the grid
        drawSpawnPoints(terrainGraphics); // Draw all spawn points
        drawDwarfs(dwarfGraphics, activeChunks); // Draw dwarfs in active chunks
        updateResourceDisplay(); // Update resource counters
    });
})();
