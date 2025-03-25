// Direct test script for testing specific components
const fs = require('fs');
const path = require('path');

// Create our own simplified implementations of the key functions

/**
 * Generate ExtXYZ content directly
 */
function generateExtXYZ(atomTypes, coordinates, energies, forces) {
    const numFrames = 1; // For simplicity, we'll just do one frame
    const content = [];
    
    const numAtoms = atomTypes.length;
    
    // First line: number of atoms
    content.push(`${numAtoms}`);
    
    // Second line: Properties and global values
    let propertiesLine = 'Properties=species:S:1:pos:R:3';
    if (forces) {
        propertiesLine += ':forces:R:3';
    }
    
    propertiesLine += ` energy=${energies[0]}`;
    propertiesLine += ` pbc="F F F"`;
    propertiesLine += ` frame=0`;
    
    content.push(propertiesLine);
    
    // Write atom data
    for (let i = 0; i < numAtoms; i++) {
        const atom = atomTypes[i];
        const x = coordinates[i * 3];
        const y = coordinates[i * 3 + 1];
        const z = coordinates[i * 3 + 2];
        
        let line = `${atom} ${x} ${y} ${z}`;
        
        if (forces) {
            const fx = forces[i * 3];
            const fy = forces[i * 3 + 1];
            const fz = forces[i * 3 + 2];
            line += ` ${fx} ${fy} ${fz}`;
        }
        
        content.push(line);
    }
    
    return content.join('\n');
}

async function main() {
    try {
        // Select a test directory
        const testDir = path.join(__dirname, 'test_data', 'C3H3O4');
        console.log(`Processing test directory: ${testDir}`);
        
        // Read the relevant raw files
        const typeMapContent = fs.readFileSync(path.join(testDir, 'type_map.raw'), 'utf-8');
        const typeDataContent = fs.readFileSync(path.join(testDir, 'type.raw'), 'utf-8');
        
        // Parse type_map.raw and type.raw
        const typeMap = typeMapContent.trim().split('\n');
        const typeData = typeDataContent.trim().split('\n').map(line => parseInt(line, 10));
        
        // Map atom types
        const atomTypes = typeData.map(index => typeMap[index]);
        
        console.log('Atom Types:', atomTypes);
        
        // Create sample data for testing
        const coordinates = [];
        // Just create a simple set of coordinates for demonstration
        for (let i = 0; i < atomTypes.length; i++) {
            coordinates.push(i * 0.5);     // x
            coordinates.push(i * 0.5 + 1); // y
            coordinates.push(i * 0.5 + 2); // z
        }
        
        const energies = [-100.5]; // Example energy value
        
        // Create sample forces data
        const forces = [];
        for (let i = 0; i < atomTypes.length; i++) {
            forces.push(i * 0.1);     // fx
            forces.push(i * 0.1 + 1); // fy
            forces.push(i * 0.1 + 2); // fz
        }
        
        // Generate ExtXYZ content
        const extxyzContent = generateExtXYZ(atomTypes, coordinates, energies, forces);
        
        // Write to file
        const outputPath = path.join(testDir, 'direct_test.extxyz');
        fs.writeFileSync(outputPath, extxyzContent);
        
        console.log(`\nExtXYZ file written to: ${outputPath}`);
        console.log('\nContent:');
        console.log(extxyzContent);
        
        console.log('\nDirect test completed successfully!');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
