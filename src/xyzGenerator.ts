import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * 处理XYZ和ExtXYZ文件生成
 */
export class XyzGenerator {
    /**
     * 读取文件内容并返回数据数组
     * @param filePath 文本文件路径
     * @returns 处理后的数据数组
     */
    public static async readFile(filePath: string): Promise<string[][]> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n');
            
            const data: string[][] = [];
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    const items = trimmedLine.split(/\s+/);
                    data.push(items);
                }
            }
            
            return data;
        } catch (error) {
            throw new Error(`Failed to read file ${filePath}: ${error}`);
        }
    }

    /**
     * 获取目录中的所有属性文件
     * @param txtDir 包含文本文件的目录
     * @returns 属性名到文件路径的映射
     */
    public static async findPropertyFiles(txtDir: string): Promise<{[key: string]: string}> {
        try {
            // 基本属性，XYZ/ExtXYZ必需的
            const essentialProps = ['real_atom_types', 'coord', 'energy', 'force', 'box'];
            const result: {[key: string]: string} = {};
            
            // 如果目录不存在，返回空结果
            if (!fs.existsSync(txtDir)) {
                return result;
            }
            
            const files = await fs.promises.readdir(txtDir);
            
            // 首先查找基本属性
            for (const propName of essentialProps) {
                const fileName = `${propName}.txt`;
                if (files.includes(fileName)) {
                    result[propName] = path.join(txtDir, fileName);
                }
            }
            
            // 然后添加其它属性文件
            for (const file of files) {
                if (file.endsWith('.txt')) {
                    const propName = file.replace('.txt', '');
                    // 跳过已添加的
                    if (!result[propName]) {
                        result[propName] = path.join(txtDir, file);
                    }
                }
            }
            
            return result;
        } catch (error) {
            console.error('Error finding property files:', error);
            return {};
        }
    }

    /**
     * 完全基于数据推断属性的组件数量，不依赖属性名称
     * @param data 属性数据
     * @param numAtoms 原子数量
     * @returns 每个原子的组件数量，或0表示全局属性
     */
    private static getPropertyComponents(data: string[][], numAtoms: number): number {
        // 确保有数据
        if (!data || data.length === 0 || data[0].length === 0) {
            return 0;
        }

        // 获取第一帧的数据长度
        const dataLength = data[0].length;
        
        // 如果数据长度是原子数的整数倍，则可能是每原子属性
        if (dataLength % numAtoms === 0) {
            const componentsPerAtom = dataLength / numAtoms;
            
            // 常见的组件数：1(标量)，3(向量)，9(3x3张量)
            if (componentsPerAtom === 1 || componentsPerAtom === 3 || componentsPerAtom === 9) {
                return componentsPerAtom;
            }
            
            // 不常见但有效的组件数
            if (componentsPerAtom > 0 && componentsPerAtom <= 12) { // 设置一个合理的上限
                return componentsPerAtom;
            }
        }
        
        // 检查是否有多帧可以比较
        if (data.length > 1) {
            // 如果所有帧的数据长度都相同，可能是全局属性
            const allSameLength = data.every(frame => frame.length === dataLength);
            
            if (allSameLength && dataLength <= 10) { // 全局属性通常不会太长
                return 0; // 表示全局属性
            }
        }
        
        // 如果无法确定，尝试一些启发式方法
        
        // 1. 检查数据中的值范围，物理属性通常有特定范围
        const sampleValues = data[0].slice(0, Math.min(30, data[0].length))
            .map(v => parseFloat(v))
            .filter(v => !isNaN(v));
        
        if (sampleValues.length > 0) {
            const min = Math.min(...sampleValues);
            const max = Math.max(...sampleValues);
            
            // 小数据范围通常表示物理属性（如位置，力等）
            if (Math.abs(min) < 1000 && Math.abs(max) < 1000) {
                // 尝试最接近的整数倍
                const closestMultiple = Math.round(dataLength / numAtoms);
                if (Math.abs(dataLength - numAtoms * closestMultiple) / dataLength < 0.1) { // 10%误差容忍
                    return closestMultiple;
                }
            }
        }
        
        // 2. 尝试常见的组件数
        for (const components of [3, 1, 9, 6]) {
            if (Math.abs(dataLength - numAtoms * components) / dataLength < 0.1) { // 10%误差容忍
                return components;
            }
        }
        
        // 如果依然无法确定，保守地返回0（作为全局属性处理）
        return 0;
    }

    /**
     * 验证数据一致性，使用自动推断的属性组件
     * @param atomTypes 原子类型数据
     * @param coordinates 坐标数据
     * @param energies 能量数据
     * @param additionalProperties 额外属性数据
     * @returns 验证是否通过
     */
    public static validateDataConsistency(
        atomTypes: string[][], 
        coordinates: string[][], 
        energies: string[][],
        additionalProperties: {[key: string]: string[][]} = {}
    ): boolean {
        const numFrames = atomTypes.length;
        const warnings: string[] = [];
        const errors: string[] = [];

        // 检查帧数是否一致
        if (coordinates.length !== numFrames) {
            errors.push(`Mismatch in frame count: atomTypes (${numFrames}) vs coordinates (${coordinates.length})`);
        }
        
        if (energies.length !== numFrames) {
            errors.push(`Mismatch in frame count: atomTypes (${numFrames}) vs energies (${energies.length})`);
        }
        
        // 检查所有额外属性的帧数
        for (const [propName, propData] of Object.entries(additionalProperties)) {
            if (propData.length !== numFrames) {
                errors.push(`Mismatch in frame count: atomTypes (${numFrames}) vs ${propName} (${propData.length})`);
            }
        }

        // 存储属性组件映射
        const propertyComponents: {[key: string]: number} = {};
        
        // 第一遍：推断所有属性的组件数
        for (const [propName, propData] of Object.entries(additionalProperties)) {
            if (!propData || propData.length === 0) continue;
            
            try {
                // 使用第一帧数据和原子数来推断
                const numAtoms = atomTypes[0].length;
                const components = this.getPropertyComponents(propData, numAtoms);
                propertyComponents[propName] = components;
                
                if (components > 0) {
                    console.log(`属性 '${propName}' 推断为每原子 ${components} 个分量`);
                } else {
                    console.log(`属性 '${propName}' 推断为全局属性`);
                }
            } catch (error) {
                warnings.push(`无法确定属性 '${propName}' 的性质: ${error}`);
                propertyComponents[propName] = 0; // 默认为全局属性
            }
        }
        
        // 第二遍：检查数据一致性
        for (let i = 0; i < numFrames; i++) {
            if (i >= coordinates.length || i >= atomTypes.length) continue;

            const numAtoms = atomTypes[i].length;
            const expectedCoordLength = numAtoms * 3;
            
            // 检查坐标数据长度
            if (coordinates[i].length !== expectedCoordLength) {
                errors.push(`Frame ${i}: expected ${expectedCoordLength} coordinates, but got ${coordinates[i].length}`);
            }
            
            // 检查每个额外属性
            for (const [propName, propData] of Object.entries(additionalProperties)) {
                if (!propData || i >= propData.length) continue;
                
                const components = propertyComponents[propName] || 0;
                
                // 只验证原子属性（组件数>0）
                if (components > 0) {
                    const expectedLength = numAtoms * components;
                    const actualLength = propData[i].length;
                    
                    // 如果不匹配但很接近，生成警告而非错误
                    if (actualLength !== expectedLength) {
                        // 计算误差百分比
                        const errorPercent = Math.abs(actualLength - expectedLength) / expectedLength * 100;
                        
                        if (errorPercent < 10) { // 10%以内的误差可以接受
                            warnings.push(`Frame ${i}: ${propName} 长度为 ${actualLength}，与预期的 ${expectedLength} 相差 ${errorPercent.toFixed(1)}%`);
                        } else {
                            errors.push(`Frame ${i}: expected ${expectedLength} ${propName} values, but got ${actualLength}`);
                        }
                    }
                }
            }
        }

        // 只输出警告，不中断处理
        if (warnings.length > 0) {
            console.warn("数据验证警告:\n" + warnings.join("\n"));
        }

        // 错误会导致处理终止
        if (errors.length > 0) {
            throw new Error(`Data consistency validation failed:\n${errors.join('\n')}`);
        }
        
        return true;
    }

    /**
     * 生成XYZ文件内容
     * @param atomTypes 原子类型数据
     * @param coordinates 坐标数据
     * @param energies 能量数据
     * @returns XYZ文件内容
     */
    public static generateXyzContent(
        atomTypes: string[][], 
        coordinates: string[][], 
        energies: string[][]
    ): string {
        const numFrames = atomTypes.length;
        const content: string[] = [];

        for (let i = 0; i < numFrames; i++) {
            const numAtoms = atomTypes[i].length;
            
            if (i >= energies.length) {
                throw new Error(`Frame ${i}: Missing energy data`);
            }

            content.push(`     ${numAtoms}`);
            content.push(` i = ${i}, E = ${energies[i][0]}`);

            if (i >= coordinates.length) {
                throw new Error(`Frame ${i}: Missing coordinate data`);
            }
            
            if (coordinates[i].length !== numAtoms * 3) {
                throw new Error(`Frame ${i}: expected ${numAtoms * 3} coordinates, but got ${coordinates[i].length}`);
            }

            for (let j = 0; j < numAtoms; j++) {
                if (j >= atomTypes[i].length) {
                    throw new Error(`Frame ${i}, Atom ${j}: Missing atom type data`);
                }
                
                const atom = atomTypes[i][j];
                const coordStart = j * 3;
                const coordEnd = (j + 1) * 3;
                
                if (coordEnd > coordinates[i].length) {
                    throw new Error(`Frame ${i}, Atom ${j}: Incomplete coordinate data`);
                }
                
                const coords = coordinates[i].slice(coordStart, coordEnd);
                content.push(`${atom} ${coords.join(' ')}`);
            }
        }

        return content.join('\n');
    }

    /**
     * 生成ExtXYZ文件内容，支持各种属性类型
     * @param atomTypes 原子类型数据
     * @param coordinates 坐标数据
     * @param energies 能量数据
     * @param additionalProperties 额外属性数据
     * @param pbcOption 周期性边界条件选项
     * @returns ExtXYZ文件内容
     */
    public static generateExtXyzContent(
        atomTypes: string[][], 
        coordinates: string[][], 
        energies: string[][],
        additionalProperties: {[key: string]: string[][]} = {},
        pbcOption: 'box' | 'fff' = 'fff'
    ): string {
        const numFrames = atomTypes.length;
        const content: string[] = [];

        // 确定每个额外属性的性质（原子属性或全局属性）
        const propertyTypes: {[key: string]: {isPerAtom: boolean, components: number}} = {};
        
        // 第一帧用于推断属性性质
        if (numFrames > 0) {
            const numAtoms = atomTypes[0].length;
            
            for (const [propName, propData] of Object.entries(additionalProperties)) {
                if (propData.length === 0) continue;
                
                // 计算每个原子的分量数
                const components = this.getPropertyComponents(propData, numAtoms);
                
                if (components > 0) {
                    // 原子属性
                    propertyTypes[propName] = { isPerAtom: true, components };
                    console.log(`'${propName}' 被确定为每原子 ${components} 分量的属性`);
                } else {
                    // 全局属性
                    propertyTypes[propName] = { isPerAtom: false, components: 0 };
                    console.log(`'${propName}' 被确定为全局属性`);
                }
            }
        }

        // 生成每一帧的内容
        for (let i = 0; i < numFrames; i++) {
            const numAtoms = atomTypes[i].length;
            
            if (i >= energies.length) {
                throw new Error(`Frame ${i}: Missing energy data`);
            }

            // 第一行：原子数量
            content.push(`${numAtoms}`);

            // 第二行：属性定义和全局值
            // 格式: Properties=species:S:1:pos:R:3:其他属性... 全局属性=值
            let propertiesLine = 'Properties=species:S:1:pos:R:3';
            
            // 添加原子属性到Properties定义
            for (const [propName, propInfo] of Object.entries(propertyTypes)) {
                if (propInfo.isPerAtom && additionalProperties[propName] && i < additionalProperties[propName].length) {
                    propertiesLine += `:${propName}:R:${propInfo.components}`;
                }
            }
            
            // 添加能量作为全局属性
            propertiesLine += ` energy=${energies[i][0]}`;
            
            // 添加其他全局属性
            for (const [propName, propInfo] of Object.entries(propertyTypes)) {
                if (!propInfo.isPerAtom && additionalProperties[propName] && i < additionalProperties[propName].length) {
                    // 使用属性的第一个值作为全局值
                    const value = additionalProperties[propName][i][0];
                    if (value !== undefined) {
                        propertiesLine += ` ${propName}=${value}`;
                    }
                }
            }
            
            // 添加周期性边界条件信息
            let pbcValue = 'F F F';
            if (pbcOption === 'box' && additionalProperties['box'] && 
                i < additionalProperties['box'].length) {
                // 确保box数据长度正确
                const boxData = additionalProperties['box'][i];
                if (boxData.length >= 9) {
                    pbcValue = boxData.join(' ');
                }
            }
            propertiesLine += ` pbc="${pbcValue}"`;
            
            // 添加帧索引作为全局属性
            propertiesLine += ` frame=${i}`;
            
            content.push(propertiesLine);

            // 检查坐标数据长度
            if (i >= coordinates.length || coordinates[i].length !== numAtoms * 3) {
                throw new Error(`Frame ${i}: Invalid coordinate data`);
            }

            // 写入每个原子的数据
            for (let j = 0; j < numAtoms; j++) {
                if (j >= atomTypes[i].length) {
                    throw new Error(`Frame ${i}, Atom ${j}: Missing atom type data`);
                }
                
                const atom = atomTypes[i][j];
                const coordStart = j * 3;
                const coordEnd = (j + 1) * 3;
                
                if (coordEnd > coordinates[i].length) {
                    throw new Error(`Frame ${i}, Atom ${j}: Incomplete coordinate data`);
                }
                
                // 添加原子类型和坐标
                const coords = coordinates[i].slice(coordStart, coordEnd);
                let line = `${atom} ${coords.join(' ')}`;
                
                // 添加每个原子的属性值
                for (const [propName, propInfo] of Object.entries(propertyTypes)) {
                    if (propInfo.isPerAtom && additionalProperties[propName] && i < additionalProperties[propName].length) {
                        try {
                            const propData = additionalProperties[propName][i];
                            const components = propInfo.components;
                            const valueStart = j * components;
                            const valueEnd = valueStart + components;
                            
                            // 确保数据边界正确
                            if (valueEnd <= propData.length) {
                                const values = propData.slice(valueStart, valueEnd);
                                line += ` ${values.join(' ')}`;
                            } else {
                                // 数据不足时发出警告但继续处理
                                console.warn(`Frame ${i}, Atom ${j}: ${propName}数据不足，跳过`);
                            }
                        } catch (error) {
                            console.warn(`处理属性 ${propName} 时出错: ${error}`);
                        }
                    }
                }
                
                content.push(line);
            }
        }

        return content.join('\n');
    }

    /**
     * 生成XYZ文件
     * @param atomTypesPath 原子类型文件路径
     * @param coordinatesPath 坐标文件路径
     * @param energiesPath 能量文件路径
     * @param outputPath 输出文件路径
     * @returns 生成的XYZ文件路径
     */
    public static async generateXyz(
        atomTypesPath: string, 
        coordinatesPath: string, 
        energiesPath: string, 
        outputPath?: string
    ): Promise<string> {
        try {
            // 读取输入文件
            const atomTypes = await this.readFile(atomTypesPath);
            const coordinates = await this.readFile(coordinatesPath);
            const energies = await this.readFile(energiesPath);
            
            // 验证数据一致性
            this.validateDataConsistency(atomTypes, coordinates, energies);
            
            // 生成XYZ内容
            const xyzContent = this.generateXyzContent(atomTypes, coordinates, energies);
            
            // 确定输出路径
            const finalOutputPath = outputPath || path.join(
                path.dirname(atomTypesPath), 
                `output_${Date.now()}.xyz`
            );
            
            // 写入文件
            await fs.promises.writeFile(finalOutputPath, xyzContent);
            
            return finalOutputPath;
        } catch (error) {
            throw new Error(`Failed to generate XYZ file: ${error}`);
        }
    }

    /**
     * 生成ExtXYZ文件，支持所有可用属性
     * @param atomTypesPath 原子类型文件路径
     * @param coordinatesPath 坐标文件路径
     * @param energiesPath 能量文件路径
     * @param forcesPath 力文件路径
     * @param boxPath 周期性边界盒文件路径
     * @param pbcOption 周期性边界条件选项
     * @param outputPath 输出文件路径
     * @param includeAllProperties 是否包含目录中找到的所有属性
     * @returns 生成的ExtXYZ文件路径
     */
    public static async generateExtXyz(
        atomTypesPath: string, 
        coordinatesPath: string, 
        energiesPath: string, 
        forcesPath?: string, 
        boxPath?: string,
        pbcOption: 'box' | 'fff' = 'fff',
        outputPath?: string,
        includeAllProperties: boolean = false
    ): Promise<string> {
        try {
            // 读取输入文件
            const atomTypes = await this.readFile(atomTypesPath);
            const coordinates = await this.readFile(coordinatesPath);
            const energies = await this.readFile(energiesPath);
            
            // 额外属性
            const additionalProperties: {[key: string]: string[][]} = {};
            
            // 添加力数据（如果提供）
            if (forcesPath && fs.existsSync(forcesPath)) {
                additionalProperties['force'] = await this.readFile(forcesPath);
            }
            
            // 添加周期性边界盒数据（如果提供）
            if (boxPath && fs.existsSync(boxPath)) {
                additionalProperties['box'] = await this.readFile(boxPath);
            }
            
            // 如果includeAllProperties为true，查找并包含所有属性文件
            if (includeAllProperties) {
                console.log("查找额外属性文件...");
                
                // 在同一目录中查找其他属性文件
                const txtDir = path.dirname(atomTypesPath);
                const propertyFiles = await this.findPropertyFiles(txtDir);
                
                // 加载每个属性文件
                for (const [propName, filePath] of Object.entries(propertyFiles)) {
                    // 跳过已加载的基本文件
                    if (propName === 'real_atom_types' || 
                        propName === 'coord' || 
                        propName === 'energy' || 
                        (propName === 'force' && forcesPath) || 
                        (propName === 'box' && boxPath)) {
                        continue;
                    }
                    
                    // 加载属性数据
                    try {
                        additionalProperties[propName] = await this.readFile(filePath);
                        console.log(`加载额外属性: ${propName} 从 ${filePath}`);
                    } catch (error) {
                        console.warn(`加载属性文件 ${filePath} 失败: ${error}`);
                    }
                }
            }
            
            // 验证数据一致性
            this.validateDataConsistency(atomTypes, coordinates, energies, additionalProperties);
            
            // 生成ExtXYZ内容
            const extxyzContent = this.generateExtXyzContent(
                atomTypes, coordinates, energies, additionalProperties, pbcOption
            );
            
            // 确定输出路径
            const finalOutputPath = outputPath || path.join(
                path.dirname(atomTypesPath), 
                `output_${Date.now()}.extxyz`
            );
            
            // 写入文件
            await fs.promises.writeFile(finalOutputPath, extxyzContent);
            
            return finalOutputPath;
        } catch (error) {
            throw new Error(`Failed to generate ExtXYZ file: ${error}`);
        }
    }
}