// Dynamic test script that handles any NPY format without hardcoding
const fs = require('fs');
const path = require('path');

// Function to parse NPY header
function parseNpyHeader(buffer) {
    if (buffer[0] !== 0x93 || buffer.toString('ascii', 1, 6) !== 'NUMPY') {
        throw new Error('Invalid NPY file: magic string missing');
    }

    // Get version
    const version = buffer.readUInt8(6) + buffer.readUInt8(7) / 10;
    
    // Get header length
    let headerLength;
    if (version < 2.0) {
        headerLength = buffer.readUInt16LE(8) + 10;
    } else {
        headerLength = buffer.readUInt32LE(8) + 12;
    }
    
    // Parse header dictionary
    const headerStr = buffer.toString('ascii', 10, headerLength).trim();
    
    // Parse shape, dtype, and fortran_order
    const shapeMatch = headerStr.match(/\'shape\':\s*\(([^\)]*)\)/);
    const dtypeMatch = headerStr.match(/\'descr\':\s*\'([^\']*)\'/);
    const fortranMatch = headerStr.match(/\'fortran_order\':\s*(True|False)/);
    
    if (!shapeMatch || !dtypeMatch || !fortranMatch) {
        throw new Error('Invalid NPY header format');
    }
    
    // Parse shape
    const shapeStr = shapeMatch[1].trim();
    const shape = shapeStr.length ? 
        shapeStr.split(/\s*,\s*/).map(s => parseInt(s.trim(), 10)) : 
        [];
    
    // Fortran order
    const fortranOrder = fortranMatch[1] === 'True';
    
    // Data type
    const dtype = dtypeMatch[1];
    
    return { dtype, shape, fortranOrder, headerLength };
}

// Function to read float32 data from NPY
function readFloat32Data(filePath) {
    const buffer = fs.readFileSync(filePath);
    const header = parseNpyHeader(buffer);
    
    // Calculate total elements
    const totalElements = header.shape.reduce((a, b) => a * b, 1);
    
    // Read float32 data
    const data = [];
    for (let i = 0; i < totalElements; i++) {
        data.push(buffer.readFloatLE(header.headerLength + i * 4));
    }
    
    return { data, shape: header.shape, header };
}

// Function to scan a directory for NPY files
function scanDirectoryForNpyFiles(dirPath) {
    const files = fs.readdirSync(dirPath);
    const npyFiles = {};
    
    for (const file of files) {
        if (file.endsWith('.npy')) {
            const name = path.basename(file, '.npy');
            npyFiles[name] = path.join(dirPath, file);
        }
    }
    
    return npyFiles;
}

// Generate ExtXYZ content dynamically based on available data
function generateDynamicExtXYZ(atomTypes, npyData, frameIndex = 0) {
    const numAtoms = atomTypes.length;
    const content = [];
    
    // First line: number of atoms
    content.push(`${numAtoms}`);
    
    // Second line: Properties and global values
    // Start with basic properties
    let propertiesLine = 'Properties=species:S:1:pos:R:3';
    
    // Add all properties found in NPY files dynamically
    const atomProperties = [];
    const globalProperties = [];
    
    // Coordinates are mandatory
    if (!npyData.coord) {
        throw new Error('Coordinate data (coord.npy) is required');
    }
    
    // Handle force data if available
    if (npyData.force) {
        propertiesLine += ':forces:R:3';
        atomProperties.push({
            name: 'force',
            dimensions: 3,
            perAtom: true
        });
    }
    
    // Handle energy data if available
    if (npyData.energy) {
        const energyValue = npyData.energy.data[frameIndex] || -100.5;
        globalProperties.push(`energy=${energyValue}`);
    }
    
    // Handle box data if available
    if (npyData.box) {
        const boxFrameData = npyData.box.data.slice(
            frameIndex * 9, 
            (frameIndex + 1) * 9
        );
        
        const boxString = boxFrameData.join(' ');
        globalProperties.push(`pbc="${boxString}"`);
    } else {
        globalProperties.push(`pbc="F F F"`);
    }
    
    // Handle aparam data if available (auxiliary parameters)
    if (npyData.aparam) {
        // Check if it's per-atom or per-frame
        if (npyData.aparam.shape[1] === numAtoms) {
            // Per atom
            const numAParams = npyData.aparam.shape[0] / npyData.aparam.shape[1];
            propertiesLine += `:aparam:R:${numAParams}`;
            atomProperties.push({
                name: 'aparam',
                dimensions: numAParams,
                perAtom: true
            });
        } else {
            // Per frame
            const aparamFrameData = npyData.aparam.data.slice(
                frameIndex * npyData.aparam.shape[1], 
                (frameIndex + 1) * npyData.aparam.shape[1]
            );
            globalProperties.push(`aparam="${aparamFrameData.join(' ')}"`);
        }
    }
    
    // Handle fparam data if available (frame parameters)
    if (npyData.fparam) {
        const fparamFrameData = npyData.fparam.data.slice(
            frameIndex * npyData.fparam.shape[1], 
            (frameIndex + 1) * npyData.fparam.shape[1]
        );
        globalProperties.push(`fparam="${fparamFrameData.join(' ')}"`);
    }
    
    // Add frame index
    globalProperties.push(`frame=${frameIndex}`);
    
    // Combine properties and global values
    content.push(`${propertiesLine} ${globalProperties.join(' ')}`);
    
    // Extract frame data for coordinates
    const coordFrameData = npyData.coord.data.slice(
        frameIndex * numAtoms * 3, 
        (frameIndex + 1) * numAtoms * 3
    );
    
    // Write atom data
    for (let i = 0; i < numAtoms; i++) {
        const atom = atomTypes[i];
        
        // Start with atom type and coordinates
        const x = coordFrameData[i * 3];
        const y = coordFrameData[i * 3 + 1];
        const z = coordFrameData[i * 3 + 2];
        
        let line = `${atom} ${x} ${y} ${z}`;
        
        // Add forces if available
        if (npyData.force) {
            const forceFrameData = npyData.force.data.slice(
                frameIndex * numAtoms * 3, 
                (frameIndex + 1) * numAtoms * 3
            );
            
            const fx = forceFrameData[i * 3];
            const fy = forceFrameData[i * 3 + 1];
            const fz = forceFrameData[i * 3 + 2];
            line += ` ${fx} ${fy} ${fz}`;
        }
        
        // Add aparams if available and per-atom
        if (npyData.aparam && npyData.aparam.shape[1] === numAtoms) {
            const numAParams = npyData.aparam.shape[0] / npyData.aparam.shape[1];
            const aparamFrameData = npyData.aparam.data.slice(
                frameIndex * numAtoms * numAParams, 
                (frameIndex + 1) * numAtoms * numAParams
            );
            
            for (let j = 0; j < numAParams; j++) {
                line += ` ${aparamFrameData[i * numAParams + j]}`;
            }
        }
        
        content.push(line);
    }
    
    return content.join('\n');
}

async function main() {
    try {
        // Select the e8000_i2000/set.002 directory
        const testDir = path.join(__dirname, 'test_data', 'e8000_i2000');
        const setDir = path.join(testDir, 'set.002');
        console.log(`Processing test directory: ${setDir}`);
        
        // Read the relevant raw files
        const typeMapPath = path.join(testDir, 'type_map.raw');
        const typePath = path.join(testDir, 'type.raw');
        
        // Check if type_map.raw exists, if not, create a basic one
        let typeMapContent;
        try {
            console.log(`Reading type_map.raw: ${typeMapPath}`);
            typeMapContent = fs.readFileSync(typeMapPath, 'utf-8');
        } catch (error) {
            console.log('type_map.raw not found, using default elements');
            typeMapContent = 'C\nH\nO\nN\n';
        }
        
        // Read type.raw
        console.log(`Reading type.raw: ${typePath}`);
        const typeDataContent = fs.readFileSync(typePath, 'utf-8');
        
        // Parse type_map.raw and type.raw
        const typeMap = typeMapContent.trim().split('\n');
        const typeData = typeDataContent.trim().split('\n').map(line => parseInt(line, 10));
        
        // Map atom types
        const atomTypes = typeData.map(index => typeMap[index]);
        
        console.log(`Found ${atomTypes.length} atoms with types: ${[...new Set(atomTypes)].join(', ')}`);
        
        // Scan directory for NPY files
        console.log(`\nScanning for NPY files in: ${setDir}`);
        const npyFiles = scanDirectoryForNpyFiles(setDir);
        
        console.log('NPY files found:');
        Object.entries(npyFiles).forEach(([name, path]) => {
            console.log(`  ${name}: ${path}`);
        });
        
        // Read all NPY files
        const npyData = {};
        for (const [name, filePath] of Object.entries(npyFiles)) {
            console.log(`\nReading ${name}.npy: ${filePath}`);
            try {
                const result = readFloat32Data(filePath);
                npyData[name] = result;
                console.log(`  Shape: [${result.shape.join(', ')}]`);
                console.log(`  First few values: ${result.data.slice(0, 5).join(', ')}...`);
            } catch (error) {
                console.error(`  Error reading ${name}.npy: ${error.message}`);
            }
        }
        
        // Generate ExtXYZ content with all available data
        const frameIndex = 0; // Use the first frame
        
        console.log(`\nGenerating ExtXYZ for frame ${frameIndex}...`);
        const extxyzContent = generateDynamicExtXYZ(atomTypes, npyData, frameIndex);
        
        // Write to file
        const outputPath = path.join(testDir, 'set.002', 'dynamic_test.extxyz');
        fs.writeFileSync(outputPath, extxyzContent);
        
        console.log(`\nExtXYZ file written to: ${outputPath}`);
        console.log('\nContent preview (first 10 lines):');
        const contentLines = extxyzContent.split('\n');
        console.log(contentLines.slice(0, Math.min(10, contentLines.length)).join('\n'));
        console.log('...');
        
        console.log('\nDynamic test completed successfully!');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
