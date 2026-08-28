# 《返潮》角色生成（Blender 4.1 headless）：
#   ~/blender-4.1.1/blender --background --python blender/gen_characters.py -- [--only a,b] \
#       [--blend blender/out] [--glb src/assets/models]
# 产出：每角色一个 .blend（可复查/续雕）+ 一个 GLB（接入 Three.js）。
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fanchao_lib as F  # noqa: E402

# ---------------- 角色规格（死魂曲读法：普通人 + 唯一主异常） ----------------
SPECS = {
    # 报数员/司仪：灰中山装、红袖章、立正、下巴微抬——口部鱼籽状钙化封死
    # r22 收敛：骨相夸张全档回拉（cheek 1.18→1.08/brow 1.10→1.04/socket→1.0，
    # lid 0.40→0.46 收掉「圆瞪」）——先读成中年干部，2m 内才读出唯一主异常=钙化口缝
    'emcee': {
        'name': 'emcee', 'seed': 4101, 'H': 1.72,
        'outfit': 'zhongshan', 'coat_rgb': (0.21, 0.225, 0.25), 'trouser_rgb': (0.115, 0.12, 0.135),
        'skin': (0.70, 0.53, 0.42), 'hair_rgb': (0.07, 0.065, 0.06), 'hair': 'short',
        'armband': True, 'belly': 0.12,
        'pose_l': 'sides', 'pose_r': 'sides', 'curl': 0.34,
        'head_pitch': -0.06,  # 下巴微抬
        'head': {'age': 0.55, 'brow_k': 1.04, 'nose_k': 1.02, 'cheek_k': 1.08, 'hollow': 0.013,
                 'jaw_k': 1.06, 'chin_k': 1.08, 'lid': 0.46, 'socket_k': 1.0,
                 'rx': 0.076, 'ry': 0.090, 'rz': 0.104},
        'stubble': 0.5, 'forehead_lines': 2,
        'anomaly': 'calcified_mouth',
    },
    # 侍应：白服务衫黑裤黑领结、托空盘——颈长一档、头垂得太低
    # r22 收敛：r21 正脸「宽颅尖颏三角脸」——颌/颏补量（jaw 0.96→1.04/chin+1.06）、
    # 年龄提到中年（0.18→0.32）、外眦挑收敛（0.15→0.07）；主异常只留颈长+头垂
    'waiter': {
        'name': 'waiter', 'seed': 4202, 'H': 1.76,
        'outfit': 'waiter', 'coat_rgb': (0.78, 0.77, 0.74), 'trouser_rgb': (0.10, 0.10, 0.11),
        'skin': (0.74, 0.57, 0.46), 'hair_rgb': (0.08, 0.075, 0.07), 'hair': 'slick',
        'neck_extra': 0.035, 'shoulder_k': 0.94,
        'pose_l': 'tray', 'pose_r': 'sides', 'curl': 0.62,
        'head_pitch': 0.38,  # 头垂得太低（迎宾鞠成一种「悬挂」）
        'head': {'age': 0.32, 'brow_k': 0.95, 'nose_k': 0.97, 'cheek_k': 1.0, 'hollow': 0.012,
                 'jaw_k': 1.04, 'chin_k': 1.06, 'lid': 0.50, 'canthal_tilt': 0.07,
                 'rx': 0.075, 'ry': 0.089, 'rz': 0.104},
        'stubble': 0.22,
        'anomaly': None,
    },
    # 守夜镇民：斗笠棉袄布鞋、驼背拢手——右颊向颈爬着盐霜
    'townsman': {
        'name': 'townsman', 'seed': 4303, 'H': 1.62,
        'outfit': 'padded', 'coat_rgb': (0.22, 0.20, 0.17), 'trouser_rgb': (0.14, 0.14, 0.15),
        'skin': (0.66, 0.50, 0.40), 'hair_rgb': (0.42, 0.42, 0.40), 'brow_rgb': (0.30, 0.29, 0.27), 'hair': 'none', 'hat': 'straw',
        'belly': 0.22, 'stoop': 0.24,
        'pose_l': 'clasped', 'pose_r': 'clasped', 'curl': 0.7,
        'head_pitch': 0.16,
        'head': {'age': 0.90, 'brow_k': 1.30, 'nose_k': 1.02, 'cheek_k': 1.32, 'hollow': 0.052,
                 'jaw_k': 0.92, 'chin_k': 0.90, 'lid': 0.58, 'naso_k': 1.6, 'socket_k': 1.15,
                 'rx': 0.075, 'ry': 0.088, 'rz': 0.102},
        'stubble': 0.7, 'forehead_lines': 4, 'age_spots': 14,
        'shoe_rgb': (0.10, 0.09, 0.08),
        'anomaly': 'salt_frost',
    },
    # 舞台报数员（宴会厅工位·gameplay 件）：与橱窗立像同一张脸（seed 同源）——
    # 「橱窗里那张脸，你会在宴会厅的台上再见到一次」。右手持麦贴near钙化口缝，
    # 麦线垂落没入舞台；左臂垂侧（运行时 ArmPivotL 周期抬起「宣布」）
    'emcee_stage': {
        'name': 'emcee_stage', 'seed': 4101, 'H': 1.72,
        'outfit': 'zhongshan', 'coat_rgb': (0.21, 0.225, 0.25), 'trouser_rgb': (0.115, 0.12, 0.135),
        'skin': (0.70, 0.53, 0.42), 'hair_rgb': (0.07, 0.065, 0.06), 'hair': 'short',
        'armband': True, 'belly': 0.12,
        'pose_l': 'sides', 'pose_r': 'mic', 'curl': 0.42, 'curl_r': 1.0,
        'head_pitch': -0.06,
        # r22：与 emcee 同步收敛（同一张脸铁律：橱窗立像=舞台报数员）
        'head': {'age': 0.55, 'brow_k': 1.04, 'nose_k': 1.02, 'cheek_k': 1.08, 'hollow': 0.013,
                 'jaw_k': 1.06, 'chin_k': 1.08, 'lid': 0.46, 'socket_k': 1.0,
                 'rx': 0.076, 'ry': 0.090, 'rz': 0.104},
        'stubble': 0.5, 'forehead_lines': 2,
        'anomaly': 'calcified_mouth',
    },
    # 理册婆（3F 工位·gameplay 件）：枣红缎袄、绾髻、拢手——眉心矿物孔板第三眼。
    # 6m 外是个普通的老太太；2m 内读出眉间那块矿是「长在皮里的」
    # r22 收敛：r21 颊沟 0.045 挖成「木雕面具」对角槽、颏 0.88 缩没读成鸟喙侧影——
    # 颊陷/法令收半档、颏颌补回（0.88→0.97）；主异常只留眉心矿盘
    'matron': {
        'name': 'matron', 'seed': 4505, 'H': 1.58,
        'outfit': 'padded', 'coat_rgb': (0.24, 0.048, 0.045), 'coat_rough': 0.52,
        'trouser_rgb': (0.085, 0.082, 0.09),
        'skin': (0.66, 0.51, 0.42), 'hair_rgb': (0.36, 0.355, 0.34),
        'brow_rgb': (0.30, 0.29, 0.27), 'hair': 'slick', 'bun': True,
        'shoulder_k': 0.88, 'belly': 0.16, 'stoop': 0.10,
        'pose_l': 'clasped', 'pose_r': 'clasped', 'curl': 0.7,
        'head_pitch': 0.06,
        'head': {'age': 0.85, 'brow_k': 1.0, 'nose_k': 0.95, 'cheek_k': 1.10, 'hollow': 0.026,
                 'jaw_k': 0.96, 'chin_k': 0.97, 'lid': 0.56, 'naso_k': 1.15, 'socket_k': 1.04,
                 'rx': 0.073, 'ry': 0.086, 'rz': 0.100},
        'forehead_lines': 3, 'age_spots': 10,
        'shoe_rgb': (0.09, 0.085, 0.08),
        'anomaly': 'third_eye',
    },
    # 湿客（人形主怪）：泡胀的镇民——衣沉色、皮青灰、眼蒙翳、赤足、肩挂海藻
    'wetguest': {
        'name': 'wetguest', 'seed': 4404, 'H': 1.78,
        'outfit': 'wet_padded', 'coat_rgb': (0.065, 0.078, 0.085), 'trouser_rgb': (0.05, 0.058, 0.066),
        'skin': (0.52, 0.58, 0.58), 'hair_rgb': (0.05, 0.06, 0.06), 'hair': 'short',
        'bloat': 1.0, 'barefoot': True, 'kelp': True, 'belly': 0.3,
        'pose_l': 'hang_heavy', 'pose_r': 'hang_heavy', 'curl': 0.25, 'spread': 0.5,
        'head_pitch': 0.10, 'head_yaw': 0.08,
        'head': {'age': 0.40, 'bloat': 1.0, 'lid': 0.76, 'mouth_open': 0.75, 'hollow': 0.0,
                 'asym': 0.015, 'rx': 0.082, 'ry': 0.097, 'rz': 0.109},
        'eye_film': 0.60, 'iris': (0.30, 0.34, 0.34),
        'anomaly': 'drowned',
    },
}


def parse_args():
    argv = sys.argv
    args = argv[argv.index('--') + 1:] if '--' in argv else []
    opts = {'only': None, 'blend': 'blender/out', 'glb': 'src/assets/models'}
    i = 0
    while i < len(args):
        if args[i] == '--only':
            opts['only'] = args[i + 1].split(',')
            i += 2
        elif args[i] == '--blend':
            opts['blend'] = args[i + 1]
            i += 2
        elif args[i] == '--glb':
            opts['glb'] = args[i + 1]
            i += 2
        else:
            i += 1
    return opts


# 场景关键件（非人形）：走独立装配器
PROPS = {
    'seagod': {'name': 'seagod', 'seed': 7101, 'builder': 'assemble_seagod'},
    # —— 宴会厅坐姿宾客三变体（r22 轻量剪影件 ≤8k tris；消灭背景球关节）——
    # 同一场还地饭的镇民：藏蓝中山装老汉 / 的确良白衬衫中年 / 绾髻蓝布衫婶
    'guest_a': {
        'name': 'guest_a', 'seed': 6101, 'H': 1.70, 'builder': 'assemble_guest',
        'coat_rgb': (0.105, 0.12, 0.16), 'trouser_rgb': (0.09, 0.095, 0.11),
        'skin': (0.68, 0.52, 0.41), 'hair_rgb': (0.14, 0.135, 0.13), 'hair': 'short',
        'belly': 0.22, 'lean': 0.12, 'head_pitch': 0.14,
        'painted_eyes': True, 'age_spots': 6, 'stubble': 0.45, 'forehead_lines': 3,
        'head': {'age': 0.72, 'cheek_k': 1.10, 'hollow': 0.026, 'naso_k': 1.2,
                 'rx': 0.075, 'ry': 0.089, 'rz': 0.103},
    },
    'guest_b': {
        'name': 'guest_b', 'seed': 6202, 'H': 1.74, 'builder': 'assemble_guest',
        'coat_rgb': (0.58, 0.585, 0.55), 'trouser_rgb': (0.125, 0.13, 0.14),
        'skin': (0.72, 0.55, 0.44), 'hair_rgb': (0.075, 0.07, 0.065), 'hair': 'short',
        'belly': 0.08, 'lean': 0.07, 'head_pitch': 0.08, 'head_yaw': 0.10,
        'painted_eyes': True, 'stubble': 0.3, 'forehead_lines': 2,
        'head': {'age': 0.45, 'jaw_k': 1.04, 'chin_k': 1.04,
                 'rx': 0.076, 'ry': 0.090, 'rz': 0.104},
    },
    'guest_c': {
        'name': 'guest_c', 'seed': 6303, 'H': 1.60, 'builder': 'assemble_guest',
        'coat_rgb': (0.24, 0.30, 0.34), 'trouser_rgb': (0.085, 0.09, 0.10),
        'skin': (0.67, 0.52, 0.42), 'hair_rgb': (0.11, 0.105, 0.10),
        'brow_rgb': (0.22, 0.21, 0.20), 'hair': 'slick', 'bun': True,
        'shoulder_k': 0.88, 'belly': 0.14, 'lean': 0.09, 'head_pitch': 0.11, 'head_yaw': -0.08,
        'painted_eyes': True, 'age_spots': 5, 'forehead_lines': 2,
        'head': {'age': 0.60, 'cheek_k': 1.06, 'hollow': 0.020, 'naso_k': 1.15,
                 'rx': 0.073, 'ry': 0.086, 'rz': 0.100},
    },
}


def main():
    opts = parse_args()
    if opts['only'] is None:
        opts['only'] = list(SPECS.keys()) + list(PROPS.keys())
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root_dir)
    for key in opts['only']:
        print('[gen] building %s ...' % key)
        F.clear_scene()
        if key in PROPS:
            getattr(F, PROPS[key]['builder'])(PROPS[key])
        else:
            F.assemble_character(SPECS[key])
        F.save_and_export(key, opts['blend'], opts['glb'])
    print('[gen] all done.')


main()
