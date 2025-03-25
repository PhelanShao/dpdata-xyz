// Simple test script for the dpdata-xyz extension
const path = require('path');
const fs = require('fs');

async function main() {
    try {
        // Choose a test directory
        const testDir = path.join(__dirname, 'test_data', 'C3H3O4');
        console.log(`Processing test directory: ${testDir}`);
        
        // Create output directory
        const outputDir = path.join(testDir, 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Simple NPY header parsing
        const coordNpyPath = path.join(testDir, 'set.000', 'coord.npy');
        console.log(`Examining NPY file: ${coordNpyPath}`);
        
        const buffer = fs.readFileSync(coordNpyPath);
        
        // Check magic string
        const magic = buffer.toString('ascii', 0, 6);
        console.log(`NPY Magic: ${JSON.stringify(magic)}`);
        
        // Get version
        const majorVersion = buffer.readUInt8(6);
        const minorVersion = buffer.readUInt8(7);
        console.log(`NPY Version: ${majorVersion}.${minorVersion}`);
        
        // Get header length
        const headerLength = buffer.readUInt16LE(8) + 10;
        console.log(`Header Length: ${headerLength}`);
        
        // Read part of the header
        const headerStr = buffer.toString('ascii', 10, headerLength > 100 ? 100 : headerLength);
        console.log(`Header (partial): ${headerStr}...`);
        
        // Read type_map.raw and type.raw
        const typeMapPath = path.join(testDir, 'type_map.raw');
        const typePath = path.join(testDir, 'type.raw');
        
        console.log(`\nReading type_map.raw: ${typeMapPath}`);
        const typeMap = fs.readFileSync(typeMapPath, 'utf-8').trim().split('\n');
        console.log(`Type Map: ${typeMap.join(', ')}`);
        
        console.log(`\nReading type.raw: ${typePath}`);
        const typeData = fs.readFileSync(typePath, 'utf-8').trim().split('\n').map(t => parseInt(t));
        console.log(`Type Data: ${typeData.join(', ')}`);
        
        // Map atom types
        const atomTypes = typeData.map(i => typeMap[i]);
        console.log(`\nAtom Types: ${atomTypes.join(', ')}`);
        
        // Write output to demonstrate functionality
        const outputFilePath = path.join(outputDir, 'atom_types.txt');
        fs.writeFileSync(outputFilePath, atomTypes.join(' '));
        
        console.log(`\nWrote atom types to: ${outputFilePath}`);
        console.log('Test completed successfully!');
        
    } catch (error) {
        console.error('Error:', error);
    }
}

main();
