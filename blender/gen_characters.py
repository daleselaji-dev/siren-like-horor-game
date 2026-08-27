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
    'emcee': {
        'name': 'emcee', 'seed': 4101, 'H': 1.72,
        'outfit': 'zhongshan', 'coat_rgb': (0.21, 0.225, 0.25), 'trouser_rgb': (0.115, 0.12, 0.135),
        'skin': (0.70, 0.53, 0.42), 'hair_rgb': (0.07, 0.065, 0.06), 'hair': 'short',
        'armband': True, 'belly': 0.12,
        'pose_l': 'sides', 'pose_r': 'sides', 'curl': 0.5,
        'head_pitch': -0.06,  # 下巴微抬
        'head': {'brow_amp': 0.05, 'socket_amp': 0.06, 'nose_amp': 0.11, 'chin_amp': 0.055,
                 'hollow': 0.024, 'lid': 0.38},
        'stubble': 0.5, 'nasolabial': 0.22, 'eyebag': 0.22, 'forehead_lines': 2,
        'anomaly': 'calcified_mouth',
    },
    # 侍应：白服务衫黑裤黑领结、托空盘——颈长一档、头垂得太低
    'waiter': {
        'name': 'waiter', 'seed': 4202, 'H': 1.76,
        'outfit': 'waiter', 'coat_rgb': (0.78, 0.77, 0.74), 'trouser_rgb': (0.10, 0.10, 0.11),
        'skin': (0.74, 0.57, 0.46), 'hair_rgb': (0.08, 0.075, 0.07), 'hair': 'short',
        'neck_extra': 0.035, 'shoulder_k': 0.94,
        'pose_l': 'tray', 'pose_r': 'sides', 'curl': 0.62,
        'head_pitch': 0.38,  # 头垂得太低（迎宾鞠成一种「悬挂」）
        'head': {'brow_amp': 0.04, 'socket_amp': 0.05, 'nose_amp': 0.095, 'chin_amp': 0.045,
                 'hollow': 0.016, 'lid': 0.52},
        'stubble': 0.25, 'eyebag': 0.12,
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
        'head': {'brow_amp': 0.055, 'socket_amp': 0.065, 'nose_amp': 0.10, 'chin_amp': 0.05,
                 'hollow': 0.030, 'cheekbone': 0.034, 'lid': 0.55},
        'stubble': 0.7, 'nasolabial': 0.30, 'eyebag': 0.30, 'forehead_lines': 4, 'age_spots': 14,
        'shoe_rgb': (0.10, 0.09, 0.08),
        'anomaly': 'salt_frost',
    },
    # 湿客（人形主怪）：泡胀的镇民——衣沉色、皮青灰、眼蒙翳、赤足、肩挂海藻
    'wetguest': {
        'name': 'wetguest', 'seed': 4404, 'H': 1.78,
        'outfit': 'wet_padded', 'coat_rgb': (0.065, 0.078, 0.085), 'trouser_rgb': (0.05, 0.058, 0.066),
        'skin': (0.52, 0.58, 0.58), 'hair_rgb': (0.05, 0.06, 0.06), 'hair': 'short',
        'bloat': 1.0, 'barefoot': True, 'kelp': True, 'belly': 0.3,
        'pose_l': 'hang_heavy', 'pose_r': 'hang_heavy', 'curl': 0.25, 'spread': 0.5,
        'head_pitch': 0.10, 'head_yaw': 0.08,
        'head': {'brow_amp': 0.03, 'socket_amp': 0.04, 'nose_amp': 0.08, 'chin_amp': 0.035,
                 'hollow': 0.0, 'bloat': 1.0, 'lid': 0.62, 'mouth_open': 0.8,
                 'rx': 0.083, 'ry': 0.091, 'rz': 0.108},
        'eye_film': 0.75, 'iris': (0.30, 0.34, 0.34),
        'anomaly': 'drowned',
    },
}


def parse_args():
    argv = sys.argv
    args = argv[argv.index('--') + 1:] if '--' in argv else []
    opts = {'only': list(SPECS.keys()), 'blend': 'blender/out', 'glb': 'src/assets/models'}
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


def main():
    opts = parse_args()
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root_dir)
    for key in opts['only']:
        spec = SPECS[key]
        print('[gen] building %s ...' % key)
        F.clear_scene()
        F.assemble_character(spec)
        F.save_and_export(key, opts['blend'], opts['glb'])
    print('[gen] all done.')


main()
