// Direct XYZ file creation test script
const path = require('path');
const fs = require('fs');

// Parse NPY header
function parseNpyHeader(buffer) {
    // Check magic string - NPY files start with the bytes [0x93, 'N', 'U', 'M', 'P', 'Y']
    // The first byte is 0x93 which is not ASCII, so we need to check it separately
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

// Parse float32 data
function parseFloatData(buffer, offset, count) {
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(buffer.readFloatLE(offset + i * 4));
    }
    return result;
}

async function main() {
    try {
        // Choose a test directory
        const testDir = path.join(__dirname, 'test_data', 'C3H3O4');
        console.log(`Processing test directory: ${testDir}`);
        
        // Read type_map.raw and type.raw
        const typeMapPath = path.join(testDir, 'type_map.raw');
        const typePath = path.join(testDir, 'type.raw');
        
        console.log(`Reading type_map.raw: ${typeMapPath}`);
        const typeMap = fs.readFileSync(typeMapPath, 'utf-8').trim().split('\n');
        console.log(`Type Map: ${typeMap.join(', ')}`);
        
        console.log(`Reading type.raw: ${typePath}`);
        const typeData = fs.readFileSync(typePath, 'utf-8').trim().split('\n').map(t => parseInt(t));
        console.log(`Type Data: ${typeData.join(', ')}`);
        
        // Map atom types
        const atomTypeLabels = typeData.map(i => typeMap[i]);
        console.log(`Atom Types: ${atomTypeLabels.join(', ')}`);
        
        // Read NPY files
        const coordNpyPath = path.join(testDir, 'set.000', 'coord.npy');
        const energyNpyPath = path.join(testDir, 'set.000', 'energy.npy');
        
        console.log(`\nReading coordinates NPY: ${coordNpyPath}`);
        const coordBuffer = fs.readFileSync(coordNpyPath);
        const coordHeader = parseNpyHeader(coordBuffer);
        console.log(`Coord shape: [${coordHeader.shape.join(', ')}]`);
        
        console.log(`Reading energy NPY: ${energyNpyPath}`);
        const energyBuffer = fs.readFileSync(energyNpyPath);
        const energyHeader = parseNpyHeader(energyBuffer);
        console.log(`Energy shape: [${energyHeader.shape.join(', ')}]`);
        
        // Parse data
        console.log(`\nParsing NPY data...`);
        const numFrames = coordHeader.shape[0];
        const numAtoms = atomTypeLabels.length;
        const numCoords = numAtoms * 3;
        
        // Verify dimensions
        if (coordHeader.shape[1] !== numCoords) {
            throw new Error(`Coordinate dimension mismatch: expected ${numCoords} but got ${coordHeader.shape[1]}`);
        }
        
        // Extract sample data for the first frame
        console.log(`\nExtracting sample data for frame 0...`);
        const coordData = parseFloatData(coordBuffer, coordHeader.headerLength, coordHeader.shape[0] * coordHeader.shape[1]);
        const energyData = parseFloatData(energyBuffer, energyHeader.headerLength, energyHeader.shape[0] * energyHeader.shape[1]);
        
        console.log(`First frame energy: ${energyData[0]}`);
        
        // Generate XYZ content
        const xyzContent = [];
        // Number of atoms
        xyzContent.push(`     ${numAtoms}`);
        // Comment line with energy
        xyzContent.push(` i = 0, E = ${energyData[0]}`);
        
        // Atom data
        for (let i = 0; i < numAtoms; i++) {
            const atomType = atomTypeLabels[i];
            const x = coordData[i * 3];
            const y = coordData[i * 3 + 1];
            const z = coordData[i * 3 + 2];
            xyzContent.push(`${atomType} ${x} ${y} ${z}`);
        }
        
        // Write XYZ file
        const outputPath = path.join(testDir, 'sample.xyz');
        fs.writeFileSync(outputPath, xyzContent.join('\n'));
        
        console.log(`\nWrote XYZ file to: ${outputPath}`);
        console.log('Done');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
