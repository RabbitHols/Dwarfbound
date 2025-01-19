import { Application, Graphics, Rectangle } from 'pixi.js';
import { Noise } from 'noisejs';
const noise = new Noise(Math.random()); // Istanza di rumore Perlin

// Define the chunk size (e.g., 20x20 tiles)

// Constants
const gridSize = 1800;
const cellSize = 10;
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

function getPerlinNoise(row, col, scale = 0.1, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let amplitude = 1;
    let frequency = scale;
    let noiseValue = 0;
    for (let i = 0; i < octaves; i++) {
        noiseValue += amplitude * noise.perlin2(col * frequency, row * frequency);
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return noiseValue;
}

function transformSpawnAreaToRock(spawnPoint) {
    const startRow = Math.max(0, spawnPoint.y - 1); // Include the row above
    const endRow = Math.min(rows, spawnPoint.y + spawnPoint.height + 1); // Include the row below
    const startCol = Math.max(0, spawnPoint.x - 1); // Include the column to the left
    const endCol = Math.min(cols, spawnPoint.x + spawnPoint.width + 1); // Include the column to the right

    for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
            gridState[row][col].terrain = 'rock';
        }
    }
}


let spawnTimers = Array(spawnPoints.length).fill(0); // Timers for each spawn point
const spawnInterval = 300; // 10 seconds at 60 FPS

// Resource counter and dwarf tracker
const resources = {
    grass: 0,
    sand: 0,
    treesCut: 0,
    activeDwarfs: 0,
    deadDwarfs: 0
};

// Water usage tracker
const waterUsage = {};

function isLandConnected(gridState) {
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    let landTiles = 0;
    let connectedLand = 0;

    // Find the first land tile
    let startTile = null;
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (isLand(gridState[row][col].terrain)) {
                landTiles++;
                if (!startTile) {
                    startTile = { row, col };
                }
            }
        }
    }

    if (!startTile) return false; // No land found

    // Perform flood-fill from the first land tile
    const queue = [startTile];
    visited[startTile.row][startTile.col] = true;

    while (queue.length > 0) {
        const { row, col } = queue.shift();
        connectedLand++;

        // Check neighbors
        getNeighbors(row, col).forEach(neighbor => {
            if (
                isLand(neighbor.terrain) &&
                !visited[neighbor.row][neighbor.col]
            ) {
                visited[neighbor.row][neighbor.col] = true;
                queue.push({ row: neighbor.row, col: neighbor.col });
            }
        });
    }

    return connectedLand === landTiles; // Return true if all land is connected
}

function isLand(terrain) {
    return terrain === 'grass' || terrain === 'rock' || terrain === 'forest' || terrain === 'sand';
}

// Find all disconnected land regions
function findDisconnectedRegions(gridState, visited) {
    const regions = [];
    const directions = [
        { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
        { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
    ];

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            if (!visited[row][col] && isLand(gridState[row][col].terrain)) {
                const region = [];
                const queue = [{ row, col }];
                visited[row][col] = true;

                while (queue.length > 0) {
                    const { row: r, col: c } = queue.shift();
                    region.push({ row: r, col: c });

                    directions.forEach(({ dr, dc }) => {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (
                            nr >= 0 && nr < rows &&
                            nc >= 0 && nc < cols &&
                            !visited[nr][nc] &&
                            isLand(gridState[nr][nc].terrain)
                        ) {
                            visited[nr][nc] = true;
                            queue.push({ row: nr, col: nc });
                        }
                    });
                }

                regions.push(region);
            }
        }
    }

    return regions;
}

// Connect a region to the main landmass
function connectRegionToMainLand(region, gridState) {
    const mainLand = region.length > 0 ? region[0] : null;
    if (!mainLand) return;

    const directions = [
        { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
        { dr: 0, dc: -1 }, { dr: 0, dc: 1 }
    ];

    for (const tile of region) {
        for (const { dr, dc } of directions) {
            const nr = tile.row + dr;
            const nc = tile.col + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                const neighbor = gridState[nr][nc];
                if (neighbor.terrain === 'water') {
                    neighbor.terrain = 'grass'; // Turn water into grass to connect regions
                    return;
                }
            }
        }
    }
}

function ensureLandConnectivity(gridState) {
    let iterations = 0; // Prevent infinite loops in edge cases

    while (!isLandConnected(gridState)) {
        console.log(`Fixing disconnected land (Iteration ${iterations + 1})...`);
        iterations++;

        if (iterations > 100) {
            console.error("Too many iterations while fixing land connectivity.");
            break;
        }

        // Identify isolated land regions
        const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
        const regions = findDisconnectedRegions(gridState, visited);

        // Connect isolated regions to the main landmass
        regions.forEach(region => {
            connectRegionToMainLand(region, gridState);
        });
    }
}

// Grid state
const gridState = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
        terrain: getRandomTerrain(row, col),
        object: getRandomObject(getRandomTerrain(row, col), row, col)
    }))
);
ensureLandConnectivity(gridState);

spawnPoints.forEach(spawnPoint => {
    transformSpawnAreaToRock(spawnPoint);
});

// Dwarfs
const dwarfs = [];

/**
 * Generates a random terrain type for a grid cell.
 */
function getRandomTerrain(row, col) {
    const noiseValue = getPerlinNoise(row, col);
    if (noiseValue < -0.2) return 'water';
    if (noiseValue < 0.1) return 'sand';
    if (noiseValue < 0.4) return 'grass';
    if (noiseValue < 0.9) return 'forest';
    return 'rock';
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
function drawDwarfs(graphics) {
    graphics.clear();
    dwarfs.forEach(dwarf => {
        graphics.beginFill(dwarf.color);
        graphics.drawRect(
            dwarf.x * cellSize * zoomFactor + 4,
            dwarf.y * cellSize * zoomFactor + 4,
            (cellSize - 2) * zoomFactor,
            (cellSize - 2) * zoomFactor
        );
        graphics.endFill();
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
                resources.grass++;
            } else if (gridState[y][x].object === 'sand') {
                resources.sand++;
            } else if (gridState[y][x].terrain === 'sand') {
                resources.sand++;
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
            cuttableNeighbor.object === 'tree' ? 100 : 100; // Cutting time depends on type
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
        (neighbor) => neighbor.terrain === 'grass' || neighbor.object === 'tree' || neighbor.terrain === 'sand'
    );
}
function drawGrid(graphics) {
    graphics.clear();
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
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


/**
 * Gets the color based on terrain type.
 */
function getTerrainColor(terrain) {
    switch (terrain) {
        case 'grass': return 0x00AA55; // Muted green for grass
        case 'rock': return 0x555555; // Dark gray for rocks
        case 'water': return 0x3366FF; // Bright blue for water
        case 'forest': return 0x007744; // Dark teal for forest
        default: return 0xAAAAAA; // Light gray as fallback
    }
}



function getRandomObject(terrain, row, col) {
    if (terrain === 'forest') {
        return 'tree'; // Ogni terreno 'forest' ha sempre un albero
    }
    return 'empty'; // Nessun oggetto su terreni non forestali
}


/**
 * Updates the resource display in the control panel.
 */
function updateResourceDisplay() {
    const resourceCountersDiv = document.getElementById('resource-counters');
    if (!resourceCountersDiv) {
        console.error('Element with id "resource-counters" not found in the DOM');
        return;
    }
    resourceCountersDiv.innerHTML = `
        <strong>Active Dwarfs:</strong> ${resources.activeDwarfs}<br>
        <strong>Dead Dwarfs:</strong> ${resources.deadDwarfs}<br>
        <strong>Grass:</strong> ${resources.grass}<br>
        <strong>Sand:</strong> ${resources.sand}<br>
        <strong>Wood:</strong> ${resources.treesCut}<br>
    `;
}

/**
 * Main game loop setup.
 */
let isPaused = false; // Tracks whether the game is paused

(async () => {
    const app = new Application();

    await app.init({
        resolution: 1, // Ensure scaling matches pixel ratio
        antialias: false, // Disable anti-aliasing for sharp pixel edges
        autoDensity: true, resizeTo: window
    });
    document.body.appendChild(app.canvas);

    const terrainGraphics = new Graphics();
    terrainGraphics.interactive = true;

    const dwarfGraphics = new Graphics();
    dwarfGraphics.interactive = true;
    app.stage.addChild(terrainGraphics);
    app.stage.addChild(dwarfGraphics);

    // Handle grid interactions
    terrainGraphics.on('pointerdown', (event) => {
        const mouseX = event.globalX;
        const mouseY = event.globalY;
        const col = Math.floor(mouseX / (cellSize * zoomFactor));
        const row = Math.floor(mouseY / (cellSize * zoomFactor));

        if (row >= 0 && row < rows && col >= 0 && col < cols) {
            const tile = gridState[row][col];
            const description = `
                <strong>Selected Tile:</strong><br>
                <strong>Terrain:</strong> ${tile.terrain}<br>
                <strong>Object:</strong> ${tile.object}
            `;
            const tileInfoDiv = document.getElementById('tile-info');
            if (!tileInfoDiv) {
                console.error('Element with id "tile-info" not found in the DOM');
                return;
            }
            tileInfoDiv.innerHTML = description;
        }
    });
    dwarfGraphics.on('pointerdown', (event) => {
        const mouseX = event.globalX;
        const mouseY = event.globalY;
        const col = Math.floor(mouseX / (cellSize * zoomFactor));
        const row = Math.floor(mouseY / (cellSize * zoomFactor));

        if (row >= 0 && row < rows && col >= 0 && col < cols) {
            const tile = gridState[row][col];
            const dwarf = dwarfs.find(d => d.x === col && d.y === row); // Check if a dwarf exists at this location

            let description = `
                <strong>Selected Tile:</strong><br>
                <strong>Terrain:</strong> ${tile.terrain}<br>
                <strong>Object:</strong> ${tile.object}<br>
            `;

            if (dwarf) {
                description += `
                    <strong>Dwarf Info:</strong><br>
                    <strong>State:</strong> ${dwarf.state}<br>
                    <strong>Thirst:</strong> ${dwarf.thirst}<br>
                    <strong>Cutting Progress:</strong> ${dwarf.cuttingProgress}<br>
                `;
            } else {
                description += `<strong>No dwarf at this location.</strong>`;
            }

            const tileInfoDiv = document.getElementById('tile-info');
            if (!tileInfoDiv) {
                console.error('Element with id "tile-info" not found in the DOM');
                return;
            }
            tileInfoDiv.innerHTML = description;
        }
    });


    // Handle zoom input
    window.addEventListener('wheel', (event) => {
        if (event.deltaY < 0) {
            zoomFactor = Math.min(zoomFactor + 0.1, maxZoom);
        } else {
            zoomFactor = Math.max(zoomFactor - 0.1, minZoom);
        }
        event.preventDefault(); // Prevent page scroll
    });

    // Create a control panel
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
        <div id="resource-counters"></div>
        <div id="tile-info" style="margin-top: 10px;"></div>
        <button id="pause-button" style="margin-top: 10px; padding: 5px;">Pause</button>
        <button id="resume-button" style="margin-top: 5px; padding: 5px;">Resume</button>
    `;
    document.body.appendChild(controlPanel);
    // Button handlers
    const pauseButton = document.getElementById('pause-button');
    const resumeButton = document.getElementById('resume-button');

    document.getElementById('pause-button').addEventListener('click', () => {
        isPaused = true;
        pauseButton.style.display = 'none'; // Hide Pause button
        resumeButton.style.display = 'inline'; // Show Resume button
        console.log('Game Paused');
    });

    document.getElementById('resume-button').addEventListener('click', () => {
        isPaused = false;
        resumeButton.style.display = 'none'; // Hide Resume button
        pauseButton.style.display = 'inline'; // Show Pause button
        console.log('Game Resumed');
    });
    terrainGraphics.on('pointermove', (event) => {
        const mouseX = event.globalX;
        const mouseY = event.globalY;
        const col = Math.floor(mouseX / (cellSize * zoomFactor)) + startCol;
        const row = Math.floor(mouseY / (cellSize * zoomFactor)) + startRow;
        if (row >= 0 && row < rows && col >= 0 && col < cols) {
            const tile = gridState[row][col];
            console.log(`Hovered on tile: ${tile.terrain}`);
        }
    });

    // Initial state: Show only Pause button
    pauseButton.style.display = 'inline';
    resumeButton.style.display = 'none';
    // Spawn initial dwarfs
    spawnDwarfInSpawnPoint(spawnPoints[0]);
    spawnDwarfInSpawnPoint(spawnPoints[1]);
    window.addEventListener('keydown', (event) => {
        const moveStep = 10;
        if (event.key === 'ArrowUp') cameraY = Math.max(cameraY - moveStep, 0);
        if (event.key === 'ArrowDown') cameraY = Math.min(cameraY + moveStep, gridSize - viewportHeight);
        if (event.key === 'ArrowLeft') cameraX = Math.max(cameraX - moveStep, 0);
        if (event.key === 'ArrowRight') cameraX = Math.min(cameraX + moveStep, gridSize - viewportWidth);
    });
    app.ticker.speed = 0.001;

    // Game loop
    app.ticker.add(() => {
        if (isPaused) return; // Skip updates when paused

        updateSpawnPoints(); // Update all spawn points
        updateDwarfs(); // Update dwarf logic

        drawGrid(terrainGraphics); // Draw the entire grid
        drawSpawnPoints(terrainGraphics); // Draw all spawn points
        drawDwarfs(dwarfGraphics); // Draw all dwarfs on the grid
        updateResourceDisplay(); // Update resource counters
    });
})();
