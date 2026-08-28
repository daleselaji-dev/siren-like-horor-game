# 《返潮》CLI 渲染验证（Cycles CPU，验证 .blend 有效性与模型质量）：
#   ~/blender-4.1.1/blender --background --python blender/render_verify.py -- \
#       [--chars a,b] [--round r1] [--samples 48] [--scale 1.0] [--blend blender/out] [--out verify/blender]
# 每角色出两图：full（全身 3/4 侧）与 face（0.6m 头肩近景）。
import sys
import os
import math

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv
    args = argv[argv.index('--') + 1:] if '--' in argv else []
    opts = {'chars': ['emcee', 'waiter', 'townsman', 'wetguest', 'seagod'], 'round': 'r1',
            'samples': 48, 'scale': 1.0, 'blend': 'blender/out', 'out': 'verify/blender',
            'views': None}
    i = 0
    while i < len(args):
        k = args[i]
        if k == '--chars':
            opts['chars'] = args[i + 1].split(',')
            i += 2
        elif k == '--views':
            opts['views'] = args[i + 1].split(',')
            i += 2
        elif k in ('--round', '--blend', '--out'):
            opts[k[2:]] = args[i + 1]
            i += 2
        elif k == '--samples':
            opts['samples'] = int(args[i + 1])
            i += 2
        elif k == '--scale':
            opts['scale'] = float(args[i + 1])
            i += 2
        else:
            i += 1
    return opts


def look_at(cam, target):
    d = target - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def setup_and_render(blend_path, out_dir, tag, name, samples, scale, only_views=None):
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(blend_path))
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Filmic'
    sc.view_settings.look = 'Medium Contrast'
    sc.view_settings.exposure = -0.25

    # 世界底光：阴天夜镇的低照度青灰
    w = bpy.data.worlds.new('W')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.020, 0.026, 0.032, 1)
    bg.inputs[1].default_value = 1.0

    # 三点布光：暖主光（钨丝）+ 冷补 + 背缘
    def lamp(name, kind, loc, energy, color, size=0.5):
        ld = bpy.data.lights.new(name, kind)
        ld.energy = energy
        ld.color = color
        if kind == 'AREA':
            ld.size = size
        lo = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(lo)
        lo.location = loc
        return lo

    key = lamp('Key', 'AREA', Vector((1.3, -1.8, 1.9)), 68, (1.0, 0.82, 0.62), 0.9)
    look_at(key, Vector((0, 0, 1.35)))
    fill = lamp('Fill', 'AREA', Vector((-1.7, -1.1, 1.2)), 17, (0.62, 0.72, 0.82), 1.4)
    look_at(fill, Vector((0, 0, 1.2)))
    rim = lamp('Rim', 'AREA', Vector((-0.4, 1.9, 2.1)), 55, (0.75, 0.85, 0.95), 0.7)
    look_at(rim, Vector((0, 0, 1.4)))

    # 地台
    import bmesh
    me = bpy.data.meshes.new('floor')
    bmf = bmesh.new()
    bmesh.ops.create_grid(bmf, x_segments=1, y_segments=1, size=4)
    bmf.to_mesh(me)
    bmf.free()
    fl = bpy.data.objects.new('floor', me)
    sc.collection.objects.link(fl)
    fm = bpy.data.materials.new('floorm')
    fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.055, 0.055, 0.06, 1)
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.5
    me.materials.append(fm)

    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam

    # 头位：直接取 Head/GodHead 网格的世界包围盒中心（r17 教训：对准 HeadPivot
    # 会在头抬升后从下巴底仰拍，face 机位读成「仰视鼻孔」）
    head_p = None
    top_z = 0.0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in sc.objects:
        if o.type == 'MESH' and o.name.split('.')[0] in ('Head', 'GodHead'):
            bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
            head_p = sum(bb, Vector()) / 8.0
        if o.type == 'MESH':
            for c in o.bound_box:
                top_z = max(top_z, (o.matrix_world @ Vector(c)).z)
    if head_p is None:
        head_p = Vector((0, -0.05, max(0.6, top_z - 0.115)))
    else:
        head_p.z += 0.024   # 包围盒中心含颌下颈锥（偏低）——机位对准面部中心
    hy, head_z = head_p.y, head_p.z

    views = {
        'full': {'loc': Vector((1.35, -2.6, 1.35)), 'aim': Vector((0, 0, 0.92)), 'lens': 42,
                 'res': (int(720 * scale), int(1080 * scale))},
        'face': {'loc': Vector((0.16, hy - 0.56, head_z + 0.02)), 'aim': Vector((0, hy, head_z + 0.02)), 'lens': 62,
                 'res': (int(760 * scale), int(860 * scale))},
        'front': {'loc': Vector((0.0, hy - 0.62, head_z)), 'aim': Vector((0, hy, head_z)), 'lens': 70,
                  'res': (int(760 * scale), int(860 * scale))},
        'prof': {'loc': Vector((0.55, hy - 0.06, head_z + 0.01)), 'aim': Vector((0, hy, head_z + 0.01)), 'lens': 62,
                 'res': (int(700 * scale), int(820 * scale))},
        'back': {'loc': Vector((-1.1, 2.5, 1.5)), 'aim': Vector((0, 0, 1.0)), 'lens': 45,
                 'res': (int(640 * scale), int(960 * scale))},
    }
    os.makedirs(out_dir, exist_ok=True)
    for vname, v in views.items():
        if only_views and vname not in only_views:
            continue
        cam.location = v['loc']
        cam_data.lens = v['lens']
        look_at(cam, v['aim'])
        sc.render.resolution_x, sc.render.resolution_y = v['res']
        sc.render.filepath = os.path.abspath(os.path.join(out_dir, '%s_%s_%s.png' % (tag, name, vname)))
        bpy.ops.render.render(write_still=True)
        print('[render] %s' % sc.render.filepath)


def main():
    opts = parse_args()
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root_dir)
    for name in opts['chars']:
        bp = os.path.join(opts['blend'], name + '.blend')
        if not os.path.exists(bp):
            print('[render] skip %s (no blend)' % name)
            continue
        setup_and_render(bp, opts['out'], opts['round'], name, opts['samples'], opts['scale'], opts['views'])
    print('[render] done.')


main()
