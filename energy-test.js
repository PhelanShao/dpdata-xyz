// Special test for energy.npy files
const fs = require('fs');
const path = require('path');

// Create a function to dump the raw header of an NPY file
function dumpNpyHeaderRaw(filePath) {
    console.log(`Examining raw header for: ${filePath}`);
    
    try {
        const buffer = fs.readFileSync(filePath);
        
        // Get the header length (10th and 11th bytes after magic string)
        const headerLength = buffer.readUInt16LE(8) + 10;
        console.log(`Header length: ${headerLength}`);
        
        // Extract raw header
        const rawHeader = buffer.slice(0, headerLength);
        console.log('Raw header (hex):', Array.from(rawHeader).map(b => b.toString(16).padStart(2, '0')).join(' '));
        
        // Print header as ASCII
        const headerStr = buffer.toString('ascii', 10, headerLength);
        console.log('Header string:', headerStr);
        
        // Extract shape part
        const shapeMatch = headerStr.match(/\'shape\':\s*\(([^\)]*)\)/);
        if (shapeMatch) {
            const shapeStr = shapeMatch[1].trim();
            console.log('Shape string:', shapeStr.length > 0 ? `"${shapeStr}"` : '(empty)');
            
            // Check for characters in the shape string
            console.log('Shape string characters:');
            for (let i = 0; i < shapeStr.length; i++) {
                const charCode = shapeStr.charCodeAt(i);
                console.log(`  [${i}] '${shapeStr[i]}' (ASCII: ${charCode})`);
            }
        } else {
            console.log('Unable to find shape in header');
        }
        
        // Try various regex patterns to match the shape
        const patterns = [
            /\'shape\':\s*\(([^\)]*)\)/,
            /\'shape\':\s*\((.*?)\)/,
            /shape.*?\((.*?)\)/
        ];
        
        console.log('\nTrying different regex patterns:');
        patterns.forEach((pattern, index) => {
            const match = headerStr.match(pattern);
            console.log(`Pattern ${index + 1}: ${match ? `Found: "${match[1]}"` : 'No match'}`);
        });
        
        return true;
    } catch (error) {
        console.error(`Error analyzing file: ${error.message}`);
        return false;
    }
}

// Modified parser designed to work with numpy's unique format for shape
function parseEnergyFile(filePath) {
    console.log(`\nParsing energy file: ${filePath}`);
    
    try {
        const buffer = fs.readFileSync(filePath);
        
        // Validation
        if (buffer[0] !== 0x93 || buffer.toString('ascii', 1, 6) !== 'NUMPY') {
            throw new Error('Invalid NPY file: missing magic string');
        }
        
        // Get version and header length
        const version = buffer.readUInt8(6) + buffer.readUInt8(7) / 10;
        const headerLength = buffer.readUInt16LE(8) + 10;
        
        console.log(`Version: ${version}, Header length: ${headerLength}`);
        
        // Get header string
        const headerStr = buffer.toString('ascii', 10, headerLength);
        console.log(`Header: ${headerStr}`);
        
        // Special parsing for shape - handle the case where there's no comma
        const shapeRegex = /\'shape\':\s*\(([^\)]*)\)/;
        const shapeMatch = headerStr.match(shapeRegex);
        
        if (!shapeMatch) {
            throw new Error('Could not find shape information in header');
        }
        
        const shapeStr = shapeMatch[1].trim();
        console.log(`Raw shape string: "${shapeStr}"`);
        
        // Try to parse the shape
        let shape = [];
        
        if (shapeStr.includes(',')) {
            // If there's a comma, split by comma
            shape = shapeStr.split(/\s*,\s*/)
                .filter(s => s.trim().length > 0)
                .map(s => parseInt(s.trim(), 10));
        } else if (/^\d+$/.test(shapeStr)) {
            // If it's just a single number without comma, it's a 1D array
            shape = [parseInt(shapeStr, 10)];
        } else {
            console.log('WARNING: Could not parse shape string, using empty shape');
        }
        
        console.log(`Parsed shape: [${shape.join(', ')}]`);
        
        // Read data based on shape
        const dtype = '<f8'; // Assume double for energy
        const dtypeSize = 8;
        
        const totalElements = shape.reduce((a, b) => a * b, 1);
        console.log(`Total elements expected: ${totalElements}`);
        
        const expectedDataSize = totalElements * dtypeSize;
        const actualDataSize = buffer.length - headerLength;
        
        console.log(`Expected data size: ${expectedDataSize}, Actual: ${actualDataSize}`);
        
        // Parse the actual data
        const data = [];
        for (let i = 0; i < totalElements; i++) {
            const pos = headerLength + i * dtypeSize;
            if (pos + dtypeSize <= buffer.length) {
                const value = buffer.readDoubleLE(pos);
                data.push(value);
            } else {
                console.error(`WARNING: Buffer overrun at position ${pos}`);
                break;
            }
        }
        
        console.log(`Read ${data.length} elements`);
        console.log('First few values:', data.slice(0, 5));
        
        return { shape, data };
    } catch (error) {
        console.error(`Error parsing energy file: ${error.message}`);
        return null;
    }
}

// Process the energy.npy file in all available test directories
function processEnergyFiles() {
    // For data_0
    const data0EnergyPath = path.join(__dirname, 'test_data', 'data_0', 'set.000', 'energy.npy');
    console.log('\n=== ANALYZING DATA_0 ENERGY FILE ===');
    dumpNpyHeaderRaw(data0EnergyPath);
    parseEnergyFile(data0EnergyPath);
    
    // For C3H3O4
    const c3h3o4EnergyPath = path.join(__dirname, 'test_data', 'C3H3O4', 'set.000', 'energy.npy');
    console.log('\n=== ANALYZING C3H3O4 ENERGY FILE ===');
    dumpNpyHeaderRaw(c3h3o4EnergyPath);
    parseEnergyFile(c3h3o4EnergyPath);
    
    // For e8000_i2000
    const e8000EnergyPath = path.join(__dirname, 'test_data', 'e8000_i2000', 'set.000', 'energy.npy');
    console.log('\n=== ANALYZING E8000_I2000 ENERGY FILE ===');
    dumpNpyHeaderRaw(e8000EnergyPath);
    parseEnergyFile(e8000EnergyPath);
}

// Run the analysis
processEnergyFiles();
