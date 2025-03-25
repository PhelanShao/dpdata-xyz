import gradio as gr
import numpy as np
import os
import re
import zipfile
import tempfile
import shutil
import plotly.graph_objects as go

# Code 1: .npy 转 .txt
def npy_to_txt(npy_files, type_map_file, type_file):
    temp_dir = tempfile.mkdtemp()
    try:
        # 保存上传的文件
        npy_filenames = []
        for npy_file in npy_files:
            shutil.copy(npy_file.name, temp_dir)
            npy_filenames.append(os.path.basename(npy_file.name))
        if type_map_file:
            shutil.copy(type_map_file.name, os.path.join(temp_dir, "type_map.raw"))
        if type_file:
            shutil.copy(type_file.name, os.path.join(temp_dir, "type.raw"))

        output_dir = os.path.join(temp_dir, "txt_output")
        os.makedirs(output_dir, exist_ok=True)

        # 读取 type_map.raw
        type_map = []
        if type_map_file:
            with open(os.path.join(temp_dir, "type_map.raw"), 'r') as f:
                type_map = [line.strip() for line in f]

        # 处理 .npy 文件
        real_atom_types_exists = "real_atom_types.npy" in npy_filenames
        for filename in npy_filenames:
            if filename.endswith(".npy"):
                file_path = os.path.join(temp_dir, filename)
                data = np.load(file_path)
                output_path = os.path.join(output_dir, f"{filename[:-4]}.txt")

                # 特殊处理 real_atom_types.npy
                if filename == "real_atom_types.npy" and type_map:
                    if type_file:
                        # 第一种情况：忽略 type.raw
                        np.savetxt(output_path, [[type_map[int(i)] for i in row] for row in data], fmt='%s')
                    else:
                        # 第二种情况：使用 type_map.raw 替换数字
                        np.savetxt(output_path, [[type_map[int(i)] for i in row] for row in data], fmt='%s')
                else:
                    np.savetxt(output_path, data, fmt='%s')

        # 第三种情况：处理 type.raw
        if type_file and type_map and not real_atom_types_exists:
            type_data = np.loadtxt(os.path.join(temp_dir, "type.raw"), dtype=int)
            energy_file = os.path.join(output_dir, "energy.txt")
            if os.path.exists(energy_file):
                with open(energy_file, 'r') as f:
                    num_frames = len(f.readlines())
                atom_types = [type_map[i] for i in type_data]
                output = ' '.join(atom_types) + '\n'
                output = output * num_frames
                with open(os.path.join(output_dir, "real_atom_types.txt"), 'w') as f:
                    f.write(output)

        # 创建临时压缩文件
        with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.zip') as temp_zip_file:
            zip_path = temp_zip_file.name
            with zipfile.ZipFile(temp_zip_file, 'w') as zipf:
                for root, _, files in os.walk(output_dir):
                    for file in files:
                        zipf.write(os.path.join(root, file), file)

        return zip_path

    except Exception as e:
        print(f"Error in npy_to_txt: {e}")
        return None
    finally:
        # 清理临时目录
        shutil.rmtree(temp_dir)

# 函数：读取文件并返回数据列表
def read_file(file_path):
    data = []
    with open(file_path, 'r') as f:
        for line_num, line in enumerate(f, start=1):
            stripped_line = line.strip()
            if stripped_line:
                split_line = stripped_line.split()
                data.append(split_line)
            else:
                print(f"警告：文件 {file_path} 第 {line_num} 行为空，已跳过。")
    return data

# 函数：读取标签文件并返回字符串列表
def read_label_file(file_path):
    if not os.path.exists(file_path):
        print(f"Warning: {file_path} does not exist.")
        return None
    data = []
    with open(file_path, 'r') as f:
        for line_num, line in enumerate(f, start=1):
            stripped_line = line.strip()
            if stripped_line:
                data.append(stripped_line)
            else:
                print(f"警告：文件 {file_path} 第 {line_num} 行为空，已跳过。")
    return data

# 函数：验证数据一致性
def validate_data_consistency(atom_types, coordinates, energies, forces, box, labels):
    num_frames = len(atom_types)
    errors = []

    if len(coordinates) != num_frames:
        errors.append(f"atom_types（{num_frames}）和 coordinates（{len(coordinates)}）的帧数不一致。")
    if len(energies) != num_frames:
        errors.append(f"atom_types（{num_frames}）和 energies（{len(energies)}）的帧数不一致。")
    if forces is not None and len(forces) != num_frames:
        errors.append(f"atom_types（{num_frames}）和 forces（{len(forces)}）的帧数不一致。")
    if box is not None and len(box) != num_frames:
        errors.append(f"atom_types（{num_frames}）和 box（{len(box)}）的帧数不一致。")
    for label_name, label_values in labels.items():
        if len(label_values) != num_frames:
            errors.append(f"标签 '{label_name}'（{len(label_values)}）和 atom_types（{num_frames}）的帧数不一致。")

    for i in range(num_frames):
        num_atoms = len(atom_types[i])
        expected_coord_length = num_atoms * 3
        if len(coordinates[i]) != expected_coord_length:
            errors.append(f"第 {i} 帧：预期 {expected_coord_length} 个坐标值，但得到了 {len(coordinates[i])} 个。")
        if forces is not None:
            expected_force_length = num_atoms * 3
            if len(forces[i]) != expected_force_length:
                errors.append(f"第 {i} 帧：预期 {expected_force_length} 个力值，但得到了 {len(forces[i])} 个。")

    if errors:
        for error in errors:
            print(error)
        raise ValueError("数据一致性验证失败。")

# 生成 XYZ 内容的函数
def generate_xyz_content(atom_types, coordinates, energies):
    num_frames = len(atom_types)
    content = []

    for i in range(num_frames):
        num_atoms = len(atom_types[i])
        print(f"处理第 {i} 帧：原子数 = {num_atoms}")

        if i >= len(energies):
            raise IndexError(f"第 {i} 帧：缺少能量数据。")

        content.append(f"     {num_atoms}")
        content.append(f" i = {i}, E = {energies[i][0]}")

        if i >= len(coordinates):
            raise IndexError(f"第 {i} 帧：缺少坐标数据。")
        if len(coordinates[i]) != num_atoms * 3:
            raise ValueError(f"第 {i} 帧：预期 {num_atoms * 3} 个坐标值，但得到了 {len(coordinates[i])} 个。")

        for j in range(num_atoms):
            if j >= len(atom_types[i]):
                raise IndexError(f"第 {i} 帧，第 {j} 个原子：缺少原子类型数据。")
            atom = atom_types[i][j]
            coord_start = j * 3
            coord_end = (j + 1) * 3
            if coord_end > len(coordinates[i]):
                raise IndexError(f"第 {i} 帧，第 {j} 个原子：坐标数据不完整。")
            coord = coordinates[i][coord_start:coord_end]
            content.append(f"{atom} {' '.join(coord)}")

    return "\n".join(content)

# 生成 XYZ 文件的主函数
def generate_xyz(atom_types_file, coordinates_file, energies_file):
    # 读取输入文件
    atom_types = read_file(atom_types_file.name)
    coordinates = read_file(coordinates_file.name)
    energies = read_file(energies_file.name)

    # 验证数据一致性
    forces = None
    box = None
    labels = {}
    validate_data_consistency(atom_types, coordinates, energies, forces, box, labels)

    # 生成 XYZ 内容
    try:
        xyz_content = generate_xyz_content(atom_types, coordinates, energies)
    except Exception as e:
        print(f"生成 XYZ 内容时出错：{e}")
        return None

    # 保存内容到临时文件
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.xyz') as temp_file:
        temp_file.write(xyz_content)
        temp_file_path = temp_file.name

    # 解析帧数据用于可视化
    frames = []
    for i in range(len(atom_types)):
        frame = {
            "frame": i,
            "atoms": atom_types[i],
            "coords": [list(map(float, coordinates[i][j*3:(j+1)*3])) for j in range(len(atom_types[i]))]
        }
        frames.append(frame)

    return temp_file_path, frames

# 生成 ExtXYZ 内容的函数（已修改以处理可变的原子数）
def generate_extxyz_content(atom_types, coordinates, energies, forces, box, labels, pbc_option):
    num_frames = len(atom_types)
    content = []

    for i in range(num_frames):
        num_atoms = len(atom_types[i])
        print(f"处理第 {i} 帧：原子数 = {num_atoms}")

        if i >= len(energies):
            raise IndexError(f"第 {i} 帧：缺少能量数据。")

        content.append(f"{num_atoms}")

        properties = "Properties=species:S:1:pos:R:3"
        if forces is not None:
            properties += ":forces:R:3"
        line = properties

        # 添加标签
        for label, values in labels.items():
            if values is not None and i < len(values):
                value = values[i] if values[i] != "" else "None"
                # 确保 value 是字符串
                if isinstance(value, list):
                    value = " ".join(value)
                fvalue = value.replace(" ", "_")  # 替换空格为下划线
                line += f" {label}={fvalue}"
            else:
                print(f"警告：第 {i} 帧缺少标签 '{label}' 的值。")

        line += f" energy={energies[i][0]}"

        # 添加 PBC
        if pbc_option == 'box' and box is not None:
            if i < len(box):
                pbc_value = " ".join(box[i])
            else:
                pbc_value = "F F F"
        else:
            pbc_value = "F F F"
        line += f' pbc="{pbc_value}"'

        content.append(line)

        # 检查坐标长度
        expected_coord_length = num_atoms * 3
        if len(coordinates[i]) != expected_coord_length:
            raise ValueError(f"第 {i} 帧：预期 {expected_coord_length} 个坐标值，但得到了 {len(coordinates[i])} 个。")

        # 检查力的长度
        if forces is not None:
            expected_force_length = num_atoms * 3
            if len(forces[i]) != expected_force_length:
                raise ValueError(f"第 {i} 帧：预期 {expected_force_length} 个力值，但得到了 {len(forces[i])} 个。")

        # 写入原子数据
        for j in range(num_atoms):
            if j >= len(atom_types[i]):
                raise IndexError(f"第 {i} 帧，第 {j} 个原子：缺少原子类型数据。")
            atom = atom_types[i][j]
            coord_start = j * 3
            coord_end = (j + 1) * 3
            if coord_end > len(coordinates[i]):
                raise IndexError(f"第 {i} 帧，第 {j} 个原子：坐标数据不完整。")
            coord = coordinates[i][coord_start:coord_end]
            line = f"{atom} {' '.join(map(str, coord))}"
            if forces is not None:
                force_start = j * 3
                force_end = (j + 1) * 3
                if force_end > len(forces[i]):
                    raise IndexError(f"第 {i} 帧，第 {j} 个原子：力数据不完整。")
                force = forces[i][force_start:force_end]
                line += f" {' '.join(map(str, force))}"
            content.append(line)

    return "\n".join(content)

# 生成 ExtXYZ 文件的主函数
def generate_extxyz(atom_types_file, coordinates_file, energies_file, forces_file, box_file, label_files, pbc_option):
    # 读取输入文件
    atom_types = read_file(atom_types_file.name)
    coordinates = read_file(coordinates_file.name)
    energies = read_file(energies_file.name)
    forces = read_file(forces_file.name) if forces_file else None
    box = read_file(box_file.name) if box_file else None

    # 处理标签
    labels = {}
    if label_files is not None:
        for label_file in label_files:
            label_name = os.path.splitext(os.path.basename(label_file.name))[0]
            labels[label_name] = read_label_file(label_file.name)

    # 验证数据一致性
    validate_data_consistency(atom_types, coordinates, energies, forces, box, labels)

    # 生成 ExtXYZ 内容
    try:
        extxyz_content = generate_extxyz_content(atom_types, coordinates, energies, forces, box, labels, pbc_option)
    except Exception as e:
        print(f"生成 ExtXYZ 内容时出错：{e}")
        return None

    # 保存内容到临时文件
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.extxyz') as temp_file:
        temp_file.write(extxyz_content)
        temp_file_path = temp_file.name

    # 解析帧数据用于可视化
    frames = []
    for i in range(len(atom_types)):
        frame = {
            "frame": i,
            "atoms": atom_types[i],
            "coords": [list(map(float, coordinates[i][j*3:(j+1)*3])) for j in range(len(atom_types[i]))]
        }
        frames.append(frame)

    return temp_file_path, frames

# 拆分 ExtXYZ 文件的函数
def split_extxyz(input_file):
    def parse_properties(properties_str):
        return [prop.split(':') for prop in properties_str.split('=')[1].split(':')]

    def parse_labels(line):
        labels = {}
        pattern = r'(\w+)=([^ ]+)'
        matches = re.findall(pattern, line)
        for key, value in matches:
            if key != 'Properties' and key != 'pbc':
                labels[key] = value
        return labels

    def parse_pbc(line):
        pbc_match = re.search(r'pbc="([^"]+)"', line)
        return pbc_match.group(1) if pbc_match else None

    temp_dir = tempfile.mkdtemp()
    try:
        with open(input_file.name, 'r') as f:
            frames = []
            current_frame = []
            for line in f:
                if line.strip().isdigit():
                    if current_frame:
                        frames.append(current_frame)
                        current_frame = []
                current_frame.append(line.strip())
            if current_frame:
                frames.append(current_frame)

        # 处理每一帧
        for i, frame in enumerate(frames):
            num_atoms = int(frame[0])
            properties_line = frame[1]
            properties = parse_properties(properties_line)
            labels = parse_labels(properties_line)
            pbc = parse_pbc(properties_line)

            # 写入标签文件
            for key, value in labels.items():
                with open(os.path.join(temp_dir, f"{key}.txt"), 'a') as f_label:
                    f_label.write(f"{value}\n")

            # 写入能量文件
            with open(os.path.join(temp_dir, "energy.npy.txt"), 'a') as f_energy:
                f_energy.write(f"{labels.get('energy', '')}\n")

            # 写入 box 文件（如果 pbc 不是 "F F F"）
            if pbc and pbc != "F F F":
                with open(os.path.join(temp_dir, "box.npy.txt"), 'a') as f_box:
                    f_box.write(f"{pbc}\n")

            # 写入原子数据
            species = []
            positions = []
            forces = []
            for atom_line in frame[2:]:
                atom_data = atom_line.split()
                species.append(atom_data[0])
                positions.extend(atom_data[1:4])
                if len(atom_data) > 4:
                    forces.extend(atom_data[4:7])

            # 写入 real_atom_types.npy.txt
            with open(os.path.join(temp_dir, "real_atom_types.npy.txt"), 'a') as f_species:
                f_species.write(" ".join(species) + "\n")

            # 写入 coord.npy.txt
            with open(os.path.join(temp_dir, "coord.npy.txt"), 'a') as f_coord:
                f_coord.write(" ".join(positions) + "\n")

            # 写入 force.npy.txt（如果有力数据）
            if forces:
                with open(os.path.join(temp_dir, "force.npy.txt"), 'a') as f_force:
                    f_force.write(" ".join(forces) + "\n")

        # 创建压缩文件
        with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.zip') as temp_zip_file:
            zip_path = temp_zip_file.name
            with zipfile.ZipFile(temp_zip_file, 'w') as zipf:
                for root, _, files in os.walk(temp_dir):
                    for file in files:
                        if file != os.path.basename(zip_path):
                            zipf.write(os.path.join(root, file), file)

        return zip_path

    except Exception as e:
        print(f"Error in split_extxyz: {e}")
        return None
    finally:
        # 清理临时目录
        shutil.rmtree(temp_dir)

# 可视化函数：根据选定帧生成 Plotly 图形
def visualize_frame(frame_number, frames):
    if frame_number < 0 or frame_number >= len(frames):
        return go.Figure()
    
    frame = frames[frame_number]
    atoms = frame["atoms"]
    coords = frame["coords"]

    # 定义颜色映射
    color_map = {}
    colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange', 'cyan', 'magenta', 'lime', 'pink']
    for i, atom in enumerate(sorted(set(atoms))):
        color_map[atom] = colors[i % len(colors)]

    fig = go.Figure()

    for atom, coord in zip(atoms, coords):
        fig.add_trace(go.Scatter3d(
            x=[coord[0]],
            y=[coord[1]],
            z=[coord[2]],
            mode='markers',
            marker=dict(size=5, color=color_map.get(atom, 'gray')),
            name=atom
        ))

    fig.update_layout(
        title=f"Frame {frame_number}",
        scene=dict(
            xaxis_title="X",
            yaxis_title="Y",
            zaxis_title="Z",
            aspectmode='data'
        ),
        showlegend=False
    )

    return fig

# 生成 ExtXYZ 文件的主函数
def generate_extxyz(atom_types_file, coordinates_file, energies_file, forces_file, box_file, label_files, pbc_option):
    # 读取输入文件
    atom_types = read_file(atom_types_file.name)
    coordinates = read_file(coordinates_file.name)
    energies = read_file(energies_file.name)
    forces = read_file(forces_file.name) if forces_file else None
    box = read_file(box_file.name) if box_file else None

    # 处理标签
    labels = {}
    if label_files is not None:
        for label_file in label_files:
            label_name = os.path.splitext(os.path.basename(label_file.name))[0]
            labels[label_name] = read_label_file(label_file.name)

    # 验证数据一致性
    validate_data_consistency(atom_types, coordinates, energies, forces, box, labels)

    # 生成 ExtXYZ 内容
    try:
        extxyz_content = generate_extxyz_content(atom_types, coordinates, energies, forces, box, labels, pbc_option)
    except Exception as e:
        print(f"生成 ExtXYZ 内容时出错：{e}")
        return None, None

    # 保存内容到临时文件
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.extxyz') as temp_file:
        temp_file.write(extxyz_content)
        temp_file_path = temp_file.name

    # 解析帧数据用于可视化
    frames = []
    for i in range(len(atom_types)):
        frame = {
            "frame": i,
            "atoms": atom_types[i],
            "coords": [list(map(float, coordinates[i][j*3:(j+1)*3])) for j in range(len(atom_types[i]))]
        }
        frames.append(frame)

    return temp_file_path, frames

# 生成 XYZ 文件和返回帧数据
def generate_xyz_wrapper(atom_types_file, coordinates_file, energies_file):
    xyz_path, frames = generate_xyz(atom_types_file, coordinates_file, energies_file)
    return xyz_path, frames

# 生成 ExtXYZ 文件和返回帧数据
def generate_extxyz_wrapper(atom_types_file, coordinates_file, energies_file, forces_file, box_file, label_files, pbc_option):
    extxyz_path, frames = generate_extxyz(atom_types_file, coordinates_file, energies_file, forces_file, box_file, label_files, pbc_option)
    return extxyz_path, frames

# Gradio 界面
def create_interface():
    with gr.Blocks(css="""
        /* 隐藏 Gradio 标志 */
        .gradio-container footer {visibility: hidden;}
    """) as demo:
        gr.Markdown("# xyz-dpdate工具包")

        with gr.Tab(".npy 转 .txt"):
            with gr.Row():
                npy_files = gr.File(file_count="multiple", label="上传 .npy 文件")
                type_map_file = gr.File(label="上传 type_map.raw 文件（必须）")
                type_file = gr.File(label="上传 type.raw 文件（可选）")
            convert_btn = gr.Button("转换")
            with gr.Row():
                convert_output = gr.File(label="下载转换结果", file_types=[".zip"])
            convert_btn.click(npy_to_txt, inputs=[npy_files, type_map_file, type_file], outputs=convert_output)

        with gr.Tab("生成 XYZ 文件"):
            with gr.Row():
                xyz_atom_types = gr.File(label="上传 real_atom_types.npy.txt 文件")
                xyz_coordinates = gr.File(label="上传 coord.npy.txt 文件")
            with gr.Row():
                xyz_energies = gr.File(label="上传 energy.npy.txt 文件")
            generate_xyz_btn = gr.Button("生成 XYZ 文件")
            with gr.Row():
                xyz_output = gr.File(label="下载 XYZ 文件")
            # State to hold frames data
            xyz_state = gr.State([])
            generate_xyz_btn.click(
                generate_xyz_wrapper,
                inputs=[xyz_atom_types, xyz_coordinates, xyz_energies],
                outputs=[xyz_output, xyz_state]
            )
            # 可视化组件
            with gr.Row():
                xyz_frame_slider = gr.Slider(minimum=0, step=1, label="选择帧", interactive=True)
            xyz_frame_slider.change(
                visualize_frame,
                inputs=[xyz_frame_slider, xyz_state],
                outputs=gr.Plot()
            )

        with gr.Tab("生成 ExtXYZ 文件"):
            with gr.Row():
                extxyz_atom_types = gr.File(label="上传 real_atom_types.npy.txt 文件")
                extxyz_coordinates = gr.File(label="上传 coord.npy.txt 文件")
            with gr.Row():
                extxyz_energies = gr.File(label="上传 energy.npy.txt 文件")
                extxyz_forces = gr.File(label="上传 force.npy.txt 文件（可选）")
            with gr.Row():
                extxyz_box = gr.File(label="上传 box.npy.txt 文件（可选）")
                extxyz_labels = gr.File(file_count="multiple", label="上传标签文件（可选）")
            extxyz_pbc_option = gr.Radio(["box", "fff"], label="PBC 选项", value="fff")
            generate_extxyz_btn = gr.Button("生成 ExtXYZ 文件")
            with gr.Row():
                extxyz_output = gr.File(label="下载 ExtXYZ 文件")
            # State to hold frames data
            extxyz_state = gr.State([])
            generate_extxyz_btn.click(
                generate_extxyz_wrapper,
                inputs=[extxyz_atom_types, extxyz_coordinates, extxyz_energies, extxyz_forces, extxyz_box, extxyz_labels, extxyz_pbc_option],
                outputs=[extxyz_output, extxyz_state]
            )
            # 可视化组件
            with gr.Row():
                extxyz_frame_slider = gr.Slider(minimum=0, step=1, label="选择帧", interactive=True)
            extxyz_frame_slider.change(
                visualize_frame,
                inputs=[extxyz_frame_slider, extxyz_state],
                outputs=gr.Plot()
            )

        with gr.Tab("拆分 ExtXYZ 文件"):
            split_input = gr.File(label="上传 .extxyz 文件")
            split_btn = gr.Button("拆分文件")
            split_output = gr.File(label="下载拆分结果")
            split_btn.click(split_extxyz, inputs=[split_input], outputs=split_output)

    return demo

# 运行 Gradio 应用
if __name__ == "__main__":
    demo = create_interface()
    demo.launch(server_name="0.0.0.0", server_port=50001)