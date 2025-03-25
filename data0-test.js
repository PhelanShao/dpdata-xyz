// Specialized test script for data_0 directory
const fs = require('fs');
const path = require('path');

// Function to parse NPY header with improved error handling
function parseNpyHeader(buffer) {
    console.log(`Buffer size: ${buffer.length}`);
    
    // More detailed validation with more helpful error messages
    if (buffer.length < 10) {
        throw new Error(`Buffer too small: ${buffer.length} bytes (needs at least 10 bytes)`);
    }
    
    // Check magic number and string separately for better diagnostics
    if (buffer[0] !== 0x93) {
        throw new Error(`First byte is not 0x93, it's: 0x${buffer[0].toString(16)}`);
    }
    
    const magicString = buffer.toString('ascii', 1, 6);
    if (magicString !== 'NUMPY') {
        throw new Error(`Magic string is not "NUMPY", it's: "${magicString}"`);
    }
    
    // Get version
    const majorVersion = buffer.readUInt8(6);
    const minorVersion = buffer.readUInt8(7);
    const version = majorVersion + minorVersion / 10;
    console.log(`NPY version: ${version}`);
    
    // Get header length
    let headerLength;
    if (version < 2.0) {
        headerLength = buffer.readUInt16LE(8) + 10;
    } else {
        headerLength = buffer.readUInt32LE(8) + 12;
    }
    console.log(`Header length: ${headerLength} bytes`);
    
    if (headerLength > buffer.length) {
        throw new Error(`Header length (${headerLength}) exceeds buffer size (${buffer.length})`);
    }
    
    // Parse header dictionary
    const headerStr = buffer.toString('ascii', 10, headerLength).trim();
    console.log(`Header string: ${headerStr}`);
    
    try {
        // Parse shape, dtype, and fortran_order
        const shapeMatch = headerStr.match(/\'shape\':\s*\(([^\)]*)\)/);
        const dtypeMatch = headerStr.match(/\'descr\':\s*\'([^\']*)\'/);
        const fortranMatch = headerStr.match(/\'fortran_order\':\s*(True|False)/);
        
        if (!shapeMatch) {
            throw new Error(`Could not parse shape from header: ${headerStr}`);
        }
        if (!dtypeMatch) {
            throw new Error(`Could not parse dtype from header: ${headerStr}`);
        }
        if (!fortranMatch) {
            throw new Error(`Could not parse fortran_order from header: ${headerStr}`);
        }
        
        // Parse shape
        const shapeStr = shapeMatch[1].trim();
        let shape = [];
        if (shapeStr.length > 0) {
            shape = shapeStr.split(/\s*,\s*/).map(s => {
                const parsed = parseInt(s.trim(), 10);
                if (isNaN(parsed)) {
                    throw new Error(`Invalid shape dimension: "${s}"`);
                }
                return parsed;
            });
        }
        
        console.log(`Shape: [${shape.join(', ')}]`);
        
        // Fortran order
        const fortranOrder = fortranMatch[1] === 'True';
        console.log(`Fortran order: ${fortranOrder}`);
        
        // Data type
        const dtype = dtypeMatch[1];
        console.log(`Data type: ${dtype}`);
        
        return { dtype, shape, fortranOrder, headerLength };
    } catch (error) {
        console.error(`Error parsing header: ${error.message}`);
        throw error;
    }
}

// Function to test a single NPY file with detailed diagnostics
function testNpyFile(filePath) {
    console.log(`\nTesting NPY file: ${filePath}`);
    
    try {
        const buffer = fs.readFileSync(filePath);
        console.log(`File loaded: ${buffer.length} bytes`);
        
        const header = parseNpyHeader(buffer);
        console.log('Header successfully parsed!');
        
        // Calculate total elements
        const totalElements = header.shape.reduce((a, b) => a * b, 1) || 1;
        console.log(`Total elements: ${totalElements}`);
        
        // Verify the data section exists
        const expectedDataSize = getTotalDataSize(header.dtype, totalElements);
        const actualDataSize = buffer.length - header.headerLength;
        
        console.log(`Expected data size: ${expectedDataSize} bytes`);
        console.log(`Actual data size: ${actualDataSize} bytes`);
        
        if (actualDataSize < expectedDataSize) {
            console.error(`WARNING: Buffer appears to be truncated! Expected at least ${header.headerLength + expectedDataSize} bytes`);
        }
        
        console.log('✅ File validation complete');
        return true;
    } catch (error) {
        console.error(`❌ Error testing file: ${error.message}`);
        return false;
    }
}

// Helper function to get total data size based on dtype
function getTotalDataSize(dtype, numElements) {
    // Extract size from dtype string
    const match = dtype.match(/[<>|]?([a-zA-Z])(\d+)/);
    if (!match) return numElements * 4; // Default to 4 bytes
    
    // Get size in bytes
    const typeSize = parseInt(match[2], 10);
    return numElements * typeSize;
}

// Process specific directories in data_0
async function runTest() {
    const data0Dir = path.join(__dirname, 'test_data', 'data_0');
    const setDir = path.join(data0Dir, 'set.000');
    
    console.log(`Testing directory: ${setDir}\n`);
    
    // Test each file in data_0/set.000
    const files = fs.readdirSync(setDir);
    const npyFiles = files.filter(f => f.endsWith('.npy'));
    
    console.log(`Found ${npyFiles.length} NPY files\n`);
    
    const results = {};
    for (const file of npyFiles) {
        const filePath = path.join(setDir, file);
        results[file] = testNpyFile(filePath);
    }
    
    // Summary
    console.log('\n=== SUMMARY ===');
    for (const [file, success] of Object.entries(results)) {
        console.log(`${file}: ${success ? '✅ Success' : '❌ Failed'}`);
    }
    
    // Test parent directory files
    console.log('\nTesting files in parent directory:');
    try {
        const typeRawPath = path.join(data0Dir, 'type.raw');
        if (fs.existsSync(typeRawPath)) {
            const content = fs.readFileSync(typeRawPath, 'utf-8');
            console.log(`type.raw exists: ${content.length} bytes, ${content.trim().split('\n').length} lines`);
        } else {
            console.log('type.raw does not exist!');
        }
        
        const typeMapPath = path.join(data0Dir, 'type_map.raw');
        if (fs.existsSync(typeMapPath)) {
            const content = fs.readFileSync(typeMapPath, 'utf-8');
            console.log(`type_map.raw exists: ${content.length} bytes, ${content.trim().split('\n').length} lines`);
        } else {
            console.log('type_map.raw does not exist!');
        }
    } catch (error) {
        console.error(`Error checking parent directory files: ${error.message}`);
    }
}

// Run the test
runTest();
