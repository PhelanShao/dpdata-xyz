import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as util from 'util';
import { exec } from 'child_process';

const execPromise = util.promisify(exec);

/**
 * Custom implementation for parsing NPY files with fallback to Python
 */
export class NpyParser {
    /**
     * Parse NumPy array header
     * @param buffer Buffer containing the NPY file data
     * @returns Object with parsed header information
     */
    private static parseNpyHeader(buffer: Buffer): { 
        dtype: string; 
        shape: number[]; 
        fortranOrder: boolean;
        headerLength: number;
    } {
        try {
            // Check magic string - first byte should be 0x93, followed by ASCII "NUMPY"
            if (buffer[0] !== 0x93 || buffer.toString('ascii', 1, 6) !== 'NUMPY') {
                throw new Error('Invalid NPY file: magic string missing');
            }
    
            // Get version
            const version = buffer.readUInt8(6) + buffer.readUInt8(7) / 10;
            
            // Get header length
            let headerLength: number;
            if (version < 2.0) {
                headerLength = buffer.readUInt16LE(8) + 10;
            } else {
                headerLength = buffer.readUInt32LE(8) + 12;
            }
            
            // Parse header dictionary
            const headerStr = buffer.toString('ascii', 10, headerLength).trim();
            
            // Parse shape, dtype, and fortran_order from header string
            const shapeMatch = headerStr.match(/\'shape\':\s*\(([^\)]*)\)/);
            const dtypeMatch = headerStr.match(/\'descr\':\s*\'([^\']*)\'/);
            const fortranMatch = headerStr.match(/\'fortran_order\':\s*(True|False)/);
            
            if (!shapeMatch || !dtypeMatch || !fortranMatch) {
                throw new Error('Invalid NPY header format');
            }
            
            // Parse shape: convert from '10, 20, 30' to [10, 20, 30]
            // Handle special case for single-dimension array without trailing comma: (10) -> [10]
            let shapeStr = shapeMatch[1].trim();
            let shape: number[] = [];
            
            if (shapeStr.length) {
                // Check if it's a single-dimension array without trailing comma
                if (!shapeStr.includes(',') && /^\d+$/.test(shapeStr)) {
                    // Single number without comma - e.g. (10)
                    shape = [parseInt(shapeStr, 10)];
                } else {
                    // Normal case with commas - e.g. (10, 20, 30) or (10,)
                    shape = shapeStr.split(/\s*,\s*/)
                        .filter(s => s.trim().length > 0)  // Filter out empty strings
                        .map(s => parseInt(s.trim(), 10));
                }
            }
            
            // Fortran order (column-major vs row-major)
            const fortranOrder = fortranMatch[1] === 'True';
            
            // Get data type descriptor
            const dtype = dtypeMatch[1];
            
            return { dtype, shape, fortranOrder, headerLength };
        } catch (error) {
            console.error('Error parsing NPY header:', error);
            throw error;
        }
    }

    /**
     * Get data size in bytes for a given NumPy data type
     * @param dtype NumPy data type string
     * @returns Size in bytes
     */
    private static getDtypeSize(dtype: string): number {
        // Extract the size from dtype string (e.g., '<f8' -> 8, '|S10' -> 10)
        const match = dtype.match(/[<>|]?([a-zA-Z])(\d+)/);
        if (!match) return 4; // Default to 4 bytes
        
        // Handle special cases
        if (match[1] === 'S' || match[1] === 'U') {
            // String or Unicode, size is specified directly
            return parseInt(match[2], 10);
        }
        
        // Standard numeric type, size is in bytes
        return parseInt(match[2], 10);
    }

    /**
     * Parse NumPy data based on data type
     * @param buffer Buffer containing the data
     * @param offset Start offset in the buffer
     * @param dtype NumPy data type
     * @param size Number of elements to read
     * @returns Array of parsed values
     */
    private static parseData(buffer: Buffer, offset: number, dtype: string, size: number): (number | string)[] {
        const result: (number | string)[] = [];
        const dtypeSize = this.getDtypeSize(dtype);
        const typecode = dtype.charAt(dtype.length - 1);
        
        // Check endianness
        const littleEndian = dtype.charAt(0) === '<' || (dtype.charAt(0) !== '>' && 
                           os.endianness() === 'LE');
        
        // Make sure we don't try to read past the buffer
        const actualSize = Math.min(size, Math.floor((buffer.length - offset) / dtypeSize));
        if (actualSize < size) {
            console.warn(`Buffer too small for expected data size. Expected ${size} elements, but can only read ${actualSize}.`);
        }
                           
        for (let i = 0; i < actualSize; i++) {
            const pos = offset + i * dtypeSize;
            
            // Parse based on data type
            switch (typecode) {
                case 'f': // float
                    if (dtypeSize === 4) {
                        result.push(littleEndian ? buffer.readFloatLE(pos) : buffer.readFloatBE(pos));
                    } else if (dtypeSize === 8) {
                        result.push(littleEndian ? buffer.readDoubleLE(pos) : buffer.readDoubleBE(pos));
                    }
                    break;
                case 'i': // integer
                    if (dtypeSize === 1) {
                        result.push(buffer.readInt8(pos));
                    } else if (dtypeSize === 2) {
                        result.push(littleEndian ? buffer.readInt16LE(pos) : buffer.readInt16BE(pos));
                    } else if (dtypeSize === 4) {
                        result.push(littleEndian ? buffer.readInt32LE(pos) : buffer.readInt32BE(pos));
                    } else if (dtypeSize === 8) {
                        const val = littleEndian ? buffer.readBigInt64LE(pos) : buffer.readBigInt64BE(pos);
                        result.push(Number(val)); // Convert BigInt to Number
                    }
                    break;
                case 'u': // unsigned integer
                    if (dtypeSize === 1) {
                        result.push(buffer.readUInt8(pos));
                    } else if (dtypeSize === 2) {
                        result.push(littleEndian ? buffer.readUInt16LE(pos) : buffer.readUInt16BE(pos));
                    } else if (dtypeSize === 4) {
                        result.push(littleEndian ? buffer.readUInt32LE(pos) : buffer.readUInt32BE(pos));
                    } else if (dtypeSize === 8) {
                        const val = littleEndian ? buffer.readBigUInt64LE(pos) : buffer.readBigUInt64BE(pos);
                        result.push(Number(val)); // Convert BigInt to Number
                    }
                    break;
                case 'b': // boolean
                    result.push(buffer.readUInt8(pos) !== 0 ? 1 : 0); // Convert boolean to number
                    break;
                case 'S': // string (ASCII)
                    let str = '';
                    for (let j = 0; j < dtypeSize; j++) {
                        const charCode = buffer.readUInt8(pos + j);
                        if (charCode === 0) break; // Null terminator
                        str += String.fromCharCode(charCode);
                    }
                    result.push(str);
                    break;
                default:
                    // Default to float
                    result.push(littleEndian ? buffer.readFloatLE(pos) : buffer.readFloatBE(pos));
            }
        }
        
        return result;
    }

    /**
     * Parse a NumPy file and return the data
     * @param buffer Buffer containing the NPY file data
     * @returns Object with parsed data and metadata
     */
    public static parseNpy(buffer: Buffer): { data: (number | string)[]; shape: number[]; dtype: string } {
        try {
            // Parse header
            const { dtype, shape, fortranOrder, headerLength } = this.parseNpyHeader(buffer);
            
            // Calculate total number of elements
            const totalElements = shape.reduce((a, b) => a * b, 1) || 1;
            
            // Parse the data
            const data = this.parseData(buffer, headerLength, dtype, totalElements);
            
            return { data, shape, dtype };
        } catch (error) {
            console.error('Error parsing NPY data:', error);
            throw error;
        }
    }

    /**
     * Check if Python with NumPy is available
     * @returns Promise<boolean> True if Python with NumPy is available
     */
    private static async isPythonWithNumpyAvailable(): Promise<boolean> {
        try {
            await execPromise('python -c "import numpy"');
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Create a temporary Python script to convert NPY to text
     * @param scriptPath Path where to save the script
     */
    private static async createPythonScript(scriptPath: string): Promise<void> {
        const pythonScript = `
import sys
import numpy as np

def convert_npy_to_text(npy_path, output_path=None):
    try:
        # Load the NPY file
        data = np.load(npy_path)
        
        # Determine output format based on shape
        if len(data.shape) == 1:
            # 1D array - each item on a separate line
            np.savetxt(output_path or sys.stdout, data, fmt='%s')
        elif len(data.shape) == 2:
            # 2D array - space-separated values, rows separated by newlines
            np.savetxt(output_path or sys.stdout, data, fmt='%s')
        else:
            # For higher dimensions, flatten and output space-separated
            flat_data = data.flatten()
            if output_path:
                with open(output_path, 'w') as f:
                    f.write(' '.join(map(str, flat_data)))
            else:
                print(' '.join(map(str, flat_data)))
    except Exception as e:
        sys.stderr.write(f"Error: {str(e)}\\n")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("Usage: python script.py input.npy [output.txt]\\n")
        sys.exit(1)
    
    npy_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    convert_npy_to_text(npy_path, output_path)
`;
        await fs.promises.writeFile(scriptPath, pythonScript);
    }

    /**
     * Parse NPY file using Python fallback
     * @param npyFilePath Path to the NPY file
     * @param outputPath Path where to save the output text
     * @returns Promise<void>
     */
    private static async parseNpyWithPython(npyFilePath: string, outputPath: string): Promise<void> {
        const tempDir = path.join(os.tmpdir(), 'dpdata-xyz');
        await fs.promises.mkdir(tempDir, { recursive: true });
        
        const scriptPath = path.join(tempDir, 'convert_npy.py');
        await this.createPythonScript(scriptPath);
        
        try {
            await execPromise(`python "${scriptPath}" "${npyFilePath}" "${outputPath}"`);
        } catch (error) {
            console.error('Error executing Python script:', error);
            throw new Error(`Failed to convert NPY file with Python: ${error}`);
        }
    }

    /**
     * Reads a .npy file and returns its data as a string
     * @param filePath Path to the .npy file
     * @returns Promise resolving to the data as a string
     */
    public static async parseNpyToString(filePath: string): Promise<string> {
        // First try using JavaScript implementation
        try {
            // Read the binary data from the .npy file
            const buffer = await fs.promises.readFile(filePath);
            
            // Parse the NPY data
            const npyData = this.parseNpy(buffer);
            
            // Convert to a string based on shape
            if (npyData.shape.length === 1) {
                // 1D array - each item on a separate line
                return npyData.data.join('\n');
            } else if (npyData.shape.length === 2) {
                // 2D array - rows separated by newlines
                const rows = [];
                const [numRows, numCols] = npyData.shape;
                for (let i = 0; i < numRows; i++) {
                    const rowItems = [];
                    for (let j = 0; j < numCols; j++) {
                        rowItems.push(npyData.data[i * numCols + j]);
                    }
                    rows.push(rowItems.join(' '));
                }
                return rows.join('\n');
            } else {
                // For higher dimensions, return a flattened representation
                return npyData.data.join(' ');
            }
        } catch (error) {
            console.warn('JavaScript NPY parsing failed, trying Python fallback:', error);
            
            // Check if Python with NumPy is available
            if (await this.isPythonWithNumpyAvailable()) {
                // Use Python fallback
                const tempOutputPath = path.join(os.tmpdir(), `temp_${Date.now()}.txt`);
                await this.parseNpyWithPython(filePath, tempOutputPath);
                
                // Read the output file
                const result = await fs.promises.readFile(tempOutputPath, 'utf-8');
                
                // Clean up
                try {
                    await fs.promises.unlink(tempOutputPath);
                } catch (err) {
                    console.warn('Failed to delete temporary file:', err);
                }
                
                return result;
            } else {
                throw new Error(`Failed to parse NPY file: ${error}. Python with NumPy not available as fallback.`);
            }
        }
    }

    /**
     * Converts a .npy file to a .txt file
     * @param npyFilePath Path to the input .npy file
     * @param outputDir Directory where the output .txt file will be saved
     * @returns Path to the created .txt file
     */
    public static async convertNpyToTxt(npyFilePath: string, outputDir?: string): Promise<string> {
        try {
            const fileName = path.basename(npyFilePath, '.npy');
            const dirPath = outputDir || path.dirname(npyFilePath);
            const outputPath = path.join(dirPath, `${fileName}.txt`);
            
            // Check if Python with NumPy is available first
            const pythonAvailable = await this.isPythonWithNumpyAvailable();
            
            if (pythonAvailable) {
                // Use Python directly for better reliability
                await this.parseNpyWithPython(npyFilePath, outputPath);
            } else {
                // Fallback to JavaScript implementation
                const dataString = await this.parseNpyToString(npyFilePath);
                
                // Write to text file
                await fs.promises.mkdir(dirPath, { recursive: true });
                await fs.promises.writeFile(outputPath, dataString);
            }
            
            return outputPath;
        } catch (error) {
            console.error('Error converting NPY to TXT:', error);
            throw new Error(`Failed to convert NPY to TXT: ${error}`);
        }
    }

    /**
     * Reads a .raw file and returns its content
     * @param filePath Path to the .raw file
     * @returns Promise resolving to the file content as array of lines
     */
    public static async readRawFile(filePath: string): Promise<string[]> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            return content.trim().split('\n').map(line => line.trim());
        } catch (error) {
            console.error('Error reading RAW file:', error);
            throw new Error(`Failed to read RAW file: ${error}`);
        }
    }

    /**
     * Process a set of NPY files in a directory along with type_map.raw and type.raw
     * @param npyFiles Array of NPY file paths
     * @param typeMapPath Path to type_map.raw file
     * @param typePath Path to type.raw file (optional)
     * @param outputDir Output directory for txt files
     * @returns Object with paths to the created text files
     */
    public static async processNpyFiles(
        npyFiles: string[], 
        typeMapPath: string, 
        typePath?: string, 
        outputDir?: string
    ): Promise<{[key: string]: string}> {
        const results: {[key: string]: string} = {};
        
        // Ensure output directory exists
        const dirPath = outputDir || path.dirname(npyFiles[0]);
        await fs.promises.mkdir(dirPath, { recursive: true });

        // Read type_map.raw
        let typeMap: string[] = [];
        if (typeMapPath) {
            typeMap = await this.readRawFile(typeMapPath);
        }

        // Process type.raw if it exists
        let typeData: number[] = [];
        if (typePath) {
            const typeLines = await this.readRawFile(typePath);
            typeData = typeLines.map(line => parseInt(line, 10));
        }

        // Process NPY files
        for (const npyFile of npyFiles) {
            const fileName = path.basename(npyFile);
            const outputPath = await this.convertNpyToTxt(npyFile, dirPath);
            results[fileName] = outputPath;
        }

        // Special processing for real_atom_types if needed
        const energyTxtPath = results['energy.npy'];
        if (typeMap.length > 0 && typeData.length > 0 && energyTxtPath && !results['real_atom_types.npy']) {
            const energyContent = await fs.promises.readFile(energyTxtPath, 'utf-8');
            const numFrames = energyContent.trim().split('\n').length;
            
            // Create real_atom_types
            const atomTypes = typeData.map(i => typeMap[i]);
            const atomTypesStr = atomTypes.join(' ');
            const realAtomTypesPath = path.join(dirPath, 'real_atom_types.txt');
            
            // Repeat for each frame
            const content = Array(numFrames).fill(atomTypesStr).join('\n');
            await fs.promises.writeFile(realAtomTypesPath, content);
            
            results['real_atom_types'] = realAtomTypesPath;
        }

        return results;
    }
}