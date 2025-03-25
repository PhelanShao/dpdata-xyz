# DPData-XYZ

一个用于处理分子模拟数据文件的VS Code插件，可以将NPY文件转换为TXT文件，生成XYZ和ExtXYZ格式文件。

## 功能

- 🔄 将NPY文件批量转换为TXT文件
- 📊 生成标准XYZ格式文件
- 📈 生成扩展ExtXYZ格式文件
  - 标准ExtXYZ：基本原子属性
  - 完整ExtXYZ：包含所有额外属性
- 🔍 监视文件夹变化，自动处理新的NPY文件
- 🖱️ 右键菜单集成，方便快速处理单个文件

## 安装

从VS Code扩展市场安装，或下载.vsix文件手动安装。

## 使用方法

### 处理文件夹中的NPY文件

1. 右键点击包含NPY文件的文件夹
2. 选择"Process DPData Directory to XYZ"
3. 根据提示选择输出格式和选项
4. 查看生成的XYZ/ExtXYZ文件

### 处理单个NPY文件

1. 右键点击NPY文件
2. 选择"Generate XYZ/ExtXYZ from NPY"
3. 按照向导进行设置
4. 完成后自动生成对应格式文件

## 支持的文件格式

- 输入：NPY、RAW
- 输出：XYZ、ExtXYZ

## 许可证

MIT