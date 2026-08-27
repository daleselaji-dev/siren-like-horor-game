# 《返潮》Blender 4.1 bpy 角色构建库（headless 管线）
# 设计要点：
#   · 全程序化：放样人体（躯干/四肢/分指手）+ 参数化头雕（单位球场沉积变形）
#   · 皮肤贴图：numpy 直绘 1024×512 球面展开画布（骨相阴影/唇色/胡茬/盐霜/尸斑）
#   · 死魂曲读法：6 米外是 2001 年的普通中国人，2 米内才读出「唯一主异常」
#   · 坐标约定：Z 上，-Y 为脸朝向（glTF 导出后 = three.js 的 +Z），原点在双脚间地面
import bpy
import bmesh
import math
import os
import sys
import numpy as np
from mathutils import Vector, Matrix, Euler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import head_forge as HF  # noqa: E402  头部锻造 v2（几何/贴图单一地标源）

TAU = math.pi * 2


# ============================= 基础工具 =============================

def rng_stream(seed):
    return np.random.default_rng(seed)


def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # 场景单位：米
    bpy.context.scene.unit_settings.system = 'METRIC'
    _mat_cache.clear()


def new_object(name, mesh):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def shade_smooth(obj):
    me = obj.data
    smooth = [True] * len(me.polygons)
    me.polygons.foreach_set('use_smooth', smooth)


def add_subsurf(obj, levels=1):
    md = obj.modifiers.new('Subsurf', 'SUBSURF')
    md.levels = levels
    md.render_levels = levels
    return md


def parent_to(child, parent):
    child.parent = parent


# ============================= 材质 =============================

_mat_cache = {}


def srgb_to_linear(c):
    """把 sRGB 数值转线性。np_to_image 的画布按 sRGB 解码渲染（被压暗），
    而 Principled Base Color 是线性直出——采样贴图色喂平色材质时必须转换，否则平色偏亮。"""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def flat_mat(name, rgb, rough=0.8, metal=0.0, sheen=0.0, bump=0.0, bump_scale=240.0):
    key = name
    if key in _mat_cache:
        return _mat_cache[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if bump > 0:
        # 布纹微凸（渲染自查用；glTF 导出器会忽略程序纹理链，不影响 GLB）
        nt = m.node_tree
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = bump_scale
        noise.inputs['Detail'].default_value = 5.0
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        nt.links.new(noise.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], bsdf.inputs['Normal'])
    _mat_cache[key] = m
    return m


def tex_mat(name, img, rough=0.7, metal=0.0):
    key = name
    if key in _mat_cache:
        return _mat_cache[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.location = (-350, 200)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    _mat_cache[key] = m
    return m


def np_to_image(name, arr):
    """arr: (h, w, 3) float [0,1] → 打包进 .blend 的 Image（导出 GLB 时随行）。"""
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[:, :, :3] = np.clip(arr, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    try:
        img.pack()
    except Exception:
        img.filepath_raw = f'/tmp/{name}.png'
        img.file_format = 'PNG'
        img.save()
        img.pack()
    return img


# ============================= 几何：放样 =============================

def frame_for(t, ref):
    t = t.normalized()
    side = t.cross(ref)
    if side.length < 1e-5:
        side = t.cross(Vector((0, 0, 1)))
    side.normalize()
    up2 = side.cross(t)
    return side, up2


def tube(bm, path, widths, depths, ring_n=14, ref=Vector((0, -1, 0)),
         cap_start=False, cap_end=False, mat_index=0, bulge=None, uv_name=None,
         y_off=None):
    """沿折线放样椭圆截面。path: [Vector]；widths/depths: 每节半宽/半深。
    bulge(i, a) 可选：对第 i 节、角 a 的半径乘数（衣褶/肌腹）。返回（首环, 尾环）。"""
    rings = []
    n = len(path)
    for i, p in enumerate(path):
        if i == 0:
            t = path[1] - path[0]
        elif i == n - 1:
            t = path[-1] - path[-2]
        else:
            t = path[i + 1] - path[i - 1]
        side, up2 = frame_for(t, ref)
        ring = []
        yo = y_off[i] if y_off else 0.0
        for k in range(ring_n):
            a = k / ring_n * TAU
            r = 1.0 if bulge is None else bulge(i, a)
            co = p + side * (math.cos(a) * widths[i] * r) + up2 * (math.sin(a) * depths[i] * r) + Vector((0, yo, 0))
            ring.append(bm.verts.new(co))
        rings.append(ring)
    faces = []
    for i in range(n - 1):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(ring_n):
            k2 = (k + 1) % ring_n
            f = bm.faces.new((r0[k], r0[k2], r1[k2], r1[k]))
            f.material_index = mat_index
            faces.append((f, i, k))
    if cap_start:
        f = bm.faces.new(tuple(reversed(rings[0])))
        f.material_index = mat_index
    if cap_end:
        f = bm.faces.new(tuple(rings[-1]))
        f.material_index = mat_index
    if uv_name:
        uv = bm.loops.layers.uv.verify()
        for f, i, k in faces:
            for lp in f.loops:
                pass  # 简化：衣料材质为弱纹理/纯色，UV 精度不敏感
    return rings


def finish_mesh(name, bm, mats, subsurf=1):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = new_object(name, me)
    for m in mats:
        obj.data.materials.append(m)
    shade_smooth(obj)
    if subsurf:
        add_subsurf(obj, subsurf)
    return obj


# ============================= 头部（v2 见 head_forge.py） =============================


def add_straw_hat(mats):
    """斗笠：浅锥双层 + 缘口。"""
    bm = bmesh.new()
    prof = [(0.0, 0.062), (0.055, 0.050), (0.12, 0.026), (0.18, 0.000), (0.23, -0.020), (0.242, -0.028)]
    rings = []
    N = 24
    for r, z in prof:
        ring = [bm.verts.new(Vector((math.cos(a / N * TAU) * r, math.sin(a / N * TAU) * r, z))) for a in range(N)]
        rings.append(ring)
    for i in range(len(prof) - 1):
        for k in range(N):
            k2 = (k + 1) % N
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bm.faces.new(tuple(reversed(rings[0])))
    me = bpy.data.meshes.new('Hat')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = new_object('Hat', me)
    obj.data.materials.append(mats['straw'])
    shade_smooth(obj)
    add_subsurf(obj, 1)
    return obj


# ============================= 身体与服装 =============================

def body_metrics(spec):
    H = spec.get('H', 1.72)
    m = {
        'H': H,
        'ankle': 0.045 * H, 'knee': 0.285 * H, 'hip': 0.525 * H,
        'waist': 0.60 * H, 'chest': 0.72 * H, 'shoulder': 0.828 * H,
        'neck_top': 0.878 * H + spec.get('neck_extra', 0.0),
        'sw': 0.114 * H * spec.get('shoulder_k', 1.0),   # 肩半宽
        'hipw': 0.062 * H,
    }
    return m


def stoop_off(spec, m, z):
    """驼背前倾：hip 以上逐渐向 -Y 位移。返回该高度的 y 偏移。"""
    st = spec.get('stoop', 0.0)
    if st <= 0 or z <= m['hip']:
        return 0.0
    t = (z - m['hip']) / (m['neck_top'] - m['hip'])
    return -st * t * t * (m['neck_top'] - m['hip'])


def torso_profile(spec, m):
    """躯干轮廓：z → (半宽, 半深)。体型参数：belly / broad / bloat。"""
    belly = spec.get('belly', 0.0)
    bloat = spec.get('bloat', 0.0)
    def prof(z):
        t = (z - m['hip']) / (m['shoulder'] - m['hip'])
        t = max(0.0, min(1.0, t))
        w = (m['hipw'] * (1.06 - 0.10 * t)
             + (m['sw'] * 0.97 - m['hipw']) * smoothstep(max(0, t - 0.42) / 0.58))
        if t > 0.84:
            w *= 1 - smoothstep((t - 0.84) / 0.16) * 0.22  # 肩头圆坡（收太狠会在袖包内侧裂出鞍形豁口）
        d = 0.070 * m['H'] / 1.72 * (1 + belly * math.sin(min(1, t / 0.55) * math.pi) * 0.5)
        d *= (0.96 + 0.22 * smoothstep(max(0, t - 0.5) / 0.5))  # 胸廓
        w *= 1 + bloat * 0.13
        d *= 1 + bloat * 0.22
        return w, d
    return prof


def cloth_noise(p, seed, freq=22.0, amp=0.004, octaves=2):
    """单点布褶噪声（HF.vnoise3 包装）。p: Vector。"""
    v = HF.fbm3(np.array([[p.x * freq, p.y * freq, p.z * freq]]), seed, octaves=octaves, base=1.0)[0]
    return (v - 0.5) * 2 * amp


def build_clothed_torso(spec, m, mats, seed):
    """外衣即躯干表面：高密放样 + 门襟棱 + 下摆卷边 + 立翻领 + 肩胛/胸/腰褶。"""
    rng = rng_stream(seed + 57)
    prof = torso_profile(spec, m)
    outfit = spec.get('outfit', 'zhongshan')
    pad = {'zhongshan': 0.016, 'waiter': 0.013, 'padded': 0.034, 'wet_padded': 0.030}[outfit]
    hem = {'zhongshan': m['hip'] - 0.10, 'waiter': m['hip'] - 0.04,
           'padded': m['hip'] - 0.16, 'wet_padded': m['hip'] - 0.14}[outfit]
    quilt = outfit in ('padded', 'wet_padded')
    n_sec = 24
    ring_n = 36
    zs = [hem + (m['shoulder'] + 0.012 - hem) * (i / (n_sec - 1)) for i in range(n_sec)]
    path, widths, depths, yoffs = [], [], [], []
    for z in zs:
        w, d = prof(max(z, m['hip'] - 0.02))
        flare = max(0.0, (m['hip'] - z) / 0.16) * 0.014  # 下摆散
        widths.append(w + pad + flare)
        depths.append(d + pad + flare * 0.7)
        path.append(Vector((0, 0, z)))
        yoffs.append(stoop_off(spec, m, z))
    wrk = rng.random(48)
    waist_t = (m['waist'] - hem) / (m['shoulder'] - hem)

    def bulge(i, a):
        z = zs[i]
        t = i / (n_sec - 1)
        r = 1.0
        fr = math.sin(a)          # 1=正前（a=TAU/4），-1=正后
        frontness = max(0.0, fr)
        backness = max(0.0, -fr)
        if quilt:
            r *= 1 + 0.028 * math.sin(z * 30 + 0.8) * (1 + 0.3 * wrk[i % 16])   # 绗缝横棱（打散规整感）
            r *= 1 + 0.016 * math.sin(a * 5 + wrk[i % 16] * 6) * (1 - t * 0.5)  # 竖绗道
        else:
            # 门襟棱（前中一条竖脊 + 两侧缝线沟）
            da = abs(a - TAU / 4)
            r += 0.012 * math.exp(-(da / 0.10) ** 2) * frontness
            r -= 0.005 * math.exp(-((da - 0.16) / 0.05) ** 2) * frontness
        # 腰部横褶（背/侧明显）——幅度要大到柔光渲染下仍可读，否则又是光滑锥筒
        r += 0.016 * math.exp(-((t - waist_t) / 0.09) ** 2) * math.sin(z * 120 + a * 2) * (0.3 + backness)
        # 肩胛两瓣（背面上部）
        r += 0.016 * math.exp(-((t - 0.78) / 0.10) ** 2) * backness * math.exp(-((abs(a - 3 * TAU / 4) - 0.5) / 0.28) ** 2)
        # 腋下→前胸斜拉褶（袖根牵出的放射纹）
        r += 0.011 * math.exp(-((t - 0.72) / 0.14) ** 2) * math.sin(a * 6 + z * 60 + wrk[(i + 9) % 48] * 5) * (0.3 + 0.7 * frontness)
        # 布面低频不匀
        r += 0.015 * (wrk[int(a / TAU * 24) % 24] - 0.5) * (1 - t * 0.4)
        r += 0.011 * math.sin(a * 5 + z * 33 + wrk[(i * 3 + 1) % 48] * 7) * (0.4 + 0.6 * backness)
        return r
    bm = bmesh.new()
    rings = tube(bm, path, widths, depths, ring_n=ring_n, cap_start=True, cap_end=True,
                 mat_index=0, bulge=bulge, y_off=yoffs)
    # 肩坡场：把躯干上部的外侧角向下压——斜方肌从颈根斜下到肩峰（板箱→人肩的关键）
    slope = 0.062 if outfit in ('zhongshan', 'waiter') else 0.050   # 棉袄垫厚坡缓
    x_in = 0.055
    for v in bm.verts:
        zz = v.co.z
        if zz > m['waist']:
            tz = smoothstep((zz - m['waist']) / (m['shoulder'] + 0.012 - m['waist']))
            tx = smoothstep(max(0.0, abs(v.co.x) - x_in) / max(1e-5, m['sw'] + pad - x_in))
            v.co.z -= slope * (tx ** 1.6) * (tz ** 2.2)
    # 下摆卷边：底环向外下再折入（布有厚度）
    r0 = rings[0]
    out_ring, in_ring = [], []
    for v in r0:
        p = v.co
        rad = Vector((p.x, p.y - yoffs[0], 0))
        rl = max(rad.length, 1e-6)
        out_ring.append(bm.verts.new(p + rad * (0.004 / rl) + Vector((0, 0, -0.006))))
        in_ring.append(bm.verts.new(p + rad * (-0.004 / rl) + Vector((0, 0, -0.004))))
    nn = len(r0)
    for k in range(nn):
        k2 = (k + 1) % nn
        bm.faces.new((out_ring[k], out_ring[k2], r0[k2], r0[k]))
        bm.faces.new((in_ring[k], in_ring[k2], out_ring[k2], out_ring[k]))
    torso = finish_mesh('Torso', bm, [mats['coat']], subsurf=1)

    extras = []
    # —— 领（立翻领：立带 + 翻沿 + 边厚，前开 V 口）——
    # 领内径必须贴实际颈围（与 build_neck 同源公式），差 1cm 就是「悬浮垫圈」
    nr_neck = 0.0345 * m['H'] / 1.72 * (1 + spec.get('bloat', 0.0) * 0.3)
    neck_r = nr_neck * 1.02
    zc = m['shoulder'] + 0.016
    yo = stoop_off(spec, m, zc)
    bm = bmesh.new()
    collar_subsurf = 1
    if outfit in ('zhongshan', 'waiter'):
        collar_subsurf = 0   # 开放条带+端盖经 subsurf 必收缩（窄缝被拉成大 V），自身密度已够
        # 中山装立领：贴颈立带（气缝 6mm、布厚 3mm）——r10 的 stand=neck*1.12+7.5mm
        # 在颈四周留出 1cm 空气壕，正面读成「两块悬浮护板」
        stand = neck_r + 0.006
        prof_pts = [(stand + 0.0025, -0.007), (stand + 0.0004, 0.004), (stand - 0.0006, 0.014),
                    (stand + 0.0006, 0.0225), (stand + 0.0026, 0.0245), (stand + 0.0034, 0.013),
                    (stand + 0.0028, -0.005)]
        a0, a1 = TAU / 4 + 0.05, TAU / 4 + TAU - 0.05   # 前方留一道窄缝（不是敞开的 V）
        # 高角密度（40 环）：立带曲率要顺；r12 教训——端头把截面向质心整体塌陷会在
        # 缝区留出一截「矮桥」，正面读成两块板夹一段空缺。端头只允许收布厚。
        angs = [a0, a0 + 0.012] + [a0 + 0.035 + (a1 - a0 - 0.07) * i / 39 for i in range(40)] + [a1 - 0.012, a1]
        ringsC = []
        for a in angs:
            ca, sa = math.cos(a), math.sin(a)
            edge_d = min(a - a0, a1 - a)
            tk = 0.55 + 0.45 * smoothstep(min(1.0, edge_d / 0.05))   # 端头布厚渐收（圆角断口）
            row = []
            for rr, dz in prof_pts:
                rr2 = stand + (rr - stand) * tk + max(0.0, 0.006 - dz) * 0.30  # 底缘外扩贴顺颈根锥度
                dip = -0.003 * max(0.0, math.sin(a)) ** 3   # 领口前缘微下潜（真立领前低后高）
                row.append(bm.verts.new(Vector((ca * rr2, -sa * rr2 + yo, zc + dz + sa * 0.004 + dip))))
            ringsC.append(row)
        for ia in range(len(ringsC) - 1):
            for j in range(len(prof_pts) - 1):
                bm.faces.new((ringsC[ia][j], ringsC[ia][j + 1], ringsC[ia + 1][j + 1], ringsC[ia + 1][j]))
        for row in (ringsC[0], ringsC[-1]):   # 领端封口
            try:
                bm.faces.new(tuple(row))
            except ValueError:
                pass
    else:
        # 棉袄披领：贴着躯干顶的一圈厚滚边（略锥形收向颈）
        zc2 = m['shoulder'] + 0.010
        yo2 = stoop_off(spec, m, zc2)
        tube(bm, [Vector((0, yo2, zc2 - 0.010)), Vector((0, yo2 - 0.002, zc2 + 0.012)),
                  Vector((0, yo2 - 0.004, zc2 + 0.026))],
             [neck_r + 0.016, neck_r + 0.010, neck_r + 0.005],
             [neck_r + 0.015, neck_r + 0.009, neck_r + 0.004], ring_n=18)
    collar = finish_mesh('Collar', bm, [mats['coat']], subsurf=collar_subsurf)
    extras.append(collar)
    if outfit == 'waiter':
        # 黑领结：两翼 + 中结，贴在立领正前
        yf = yo - (neck_r + 0.018)
        for sgn in (-1, 1):
            bm = bmesh.new()
            r = bmesh.ops.create_cube(bm, size=1)
            for v in r['verts']:
                v.co = Vector((v.co.x * 0.030, v.co.y * 0.010, v.co.z * (0.016 + 0.008 * (0.5 + sgn * v.co.x))))
                v.co += Vector((sgn * 0.020, yf, zc + 0.010))
            extras.append(finish_mesh('BowWing', bm, [mats['shoe']], subsurf=1))
        bm = bmesh.new()
        r = bmesh.ops.create_cube(bm, size=1)
        for v in r['verts']:
            v.co = Vector((v.co.x * 0.009, v.co.y * 0.009, v.co.z * 0.012))
            v.co += Vector((0, yf - 0.002, zc + 0.010))
        extras.append(finish_mesh('BowKnot', bm, [mats['shoe']], subsurf=1))

    # —— 前襟扣 ——
    if outfit in ('zhongshan', 'waiter'):
        for i in range(5):
            z = m['shoulder'] - 0.035 - i * (m['shoulder'] - hem - 0.10) / 4.6
            w, d = prof(max(z, m['hip'] - 0.02))
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.0065)
            for v in bm.verts:
                v.co += Vector((0, -(d + pad) - 0.002 + stoop_off(spec, m, z), z))
            btn = finish_mesh('Btn', bm, [mats['button']], subsurf=0)
            extras.append(btn)
    # —— 中山装四袋（矩形贴袋 + 袋盖 + 袋扣）——
    if outfit == 'zhongshan':
        for (px, pz, pw, ph) in [(-0.055, m['chest'] + 0.030, 0.050, 0.052), (0.055, m['chest'] + 0.030, 0.050, 0.052),
                                 (-0.075, m['waist'] - 0.020, 0.066, 0.076), (0.075, m['waist'] - 0.020, 0.066, 0.076)]:
            w, d = prof(max(pz, m['hip']))
            yo2 = stoop_off(spec, m, pz)
            # 贴袋必须落在椭圆面上：y 深随 |x| 收（平深度会让侧袋悬空 1.5cm）
            ell = math.sqrt(max(0.15, 1 - (px / (w + pad)) ** 2))
            yf = -(d + pad) * ell - 0.004 + yo2
            bm = bmesh.new()
            r = bmesh.ops.create_cube(bm, size=1)
            for v in r['verts']:
                bulge_y = 0.006 if v.co.y < 0 else 0.0   # 袋身鼓
                v.co = Vector((v.co.x * pw / 2, v.co.y * 0.005 - bulge_y * (1 - abs(v.co.x)) , v.co.z * ph / 2))
                v.co += Vector((px, yf, pz - 0.008))
            # 袋盖（斜切楔）
            r2 = bmesh.ops.create_cube(bm, size=1)
            for v in r2['verts']:
                v.co = Vector((v.co.x * (pw / 2 + 0.004), v.co.y * 0.004 - 0.004, v.co.z * 0.010))
                v.co.y += v.co.z * 0.5   # 盖向外斜
                v.co += Vector((px, yf, pz + ph / 2 - 0.006))
            pk = finish_mesh('Pocket', bm, [mats['coat']], subsurf=0)
            extras.append(pk)
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.004)
            for v in bm.verts:
                v.co += Vector((px, yf - 0.004, pz + ph / 2 - 0.017))
            extras.append(finish_mesh('PBtn', bm, [mats['button']], subsurf=0))
    return torso, extras


def build_arm(side, spec, m, mats, pose, seed=1):
    """袖管：袖山三角肌鼓 + 肘内侧挤褶 + 翻边袖口（开口见内里）+ 腕内衬皮肤管。
    返回（[obj...], 腕位置Vector, 手朝向dict）。"""
    yo_sh = stoop_off(spec, m, m['shoulder'])
    # 袖根内收下沉：肩峰在斜方肌坡的下端，袖山必须塞进坡底而不是并排搭板
    sh = Vector((side * m['sw'] * 0.90, yo_sh, m['shoulder'] - 0.034))
    outfit = spec.get('outfit', 'zhongshan')
    pad = 0.011 if outfit in ('zhongshan', 'waiter') else 0.022
    bloat = spec.get('bloat', 0.0)
    upper_r = 0.038 * m['H'] / 1.72 * (1 + bloat * 0.2)
    fore_r = 0.030 * m['H'] / 1.72 * (1 + bloat * 0.25)
    wrist_r = 0.024 * m['H'] / 1.72 * (1 + bloat * 0.3)
    if pose == 'tray':
        el = sh + Vector((side * 0.015, -0.035, -(m['shoulder'] - m['waist']) * 0.62))
        wr = el + Vector((-side * 0.06, -0.24, 0.045))
        hand = {'dir': (wr - el).normalized(), 'palm': Vector((0, 0, 1))}
    elif pose == 'clasped':
        el = sh + Vector((side * 0.022, -0.020, -0.155 * m['H']))
        wr = Vector((side * 0.035, -0.148 + stoop_off(spec, m, m['waist']), m['waist'] - 0.045))
        hand = {'dir': Vector((-side * 0.9, -0.25, -0.25)).normalized(), 'palm': Vector((0, 0.2, -1)).normalized()}
    elif pose == 'hang_heavy':  # 湿客：垂手微外张，指微张
        el = sh + Vector((side * 0.030, 0.008, -0.150 * m['H']))
        wr = el + Vector((side * 0.030, -0.030, -0.148 * m['H']))
        hand = {'dir': Vector((side * 0.10, -0.06, -1)).normalized(), 'palm': Vector((-side, -0.3, 0)).normalized()}
    else:  # sides：垂手贴缝（肘微屈、腕略前——死直管是玩具站姿）
        el = sh + Vector((side * 0.012, -0.006, -0.148 * m['H']))
        wr = el + Vector((side * 0.006, -0.034, -0.150 * m['H']))
        hand = {'dir': Vector((0, -0.10, -1)).normalized(), 'palm': Vector((-side, -0.25, 0)).normalized()}
    # 9 节点路径（肩帽→袖口）。袖山顶环必须是「正上方的水平小环」：
    # 任何侧向偏移都会让首环平面立起来，整个环半径变成竖直方向的出头量——
    # r10–r12 的「肩角」全部源于此。水平环的顶=cap.z，确定压在肩坡线以下。
    cap = sh + Vector((0.0, 0.0, 0.010))
    mid_u1 = sh.lerp(el, 0.33) + Vector((side * 0.009, -0.004, 0))
    mid_u2 = sh.lerp(el, 0.66) + Vector((side * 0.005, -0.002, 0))
    mid_f1 = el.lerp(wr, 0.35)
    mid_f2 = el.lerp(wr, 0.72)
    path = [cap, sh, mid_u1, mid_u2, el, mid_f1, mid_f2, wr]
    rads = [upper_r * 0.30 + pad * 0.3, upper_r * 1.00 + pad, upper_r + pad, upper_r * 0.93 + pad,
            fore_r + pad + 0.005, fore_r * 0.97 + pad, fore_r * 0.88 + pad, wrist_r + pad + 0.003]
    axis = (wr - sh).normalized()
    eln = 4  # 肘节点下标
    rng = rng_stream(seed + 71 + side)
    wk = rng.random(24)

    def bulge(i, a):
        r = 1.0
        t = i / (len(path) - 1)
        # 三角肌袖山鼓（幅度收敛：只留外侧下坡的一点肌量，不再顶出肩角）
        if i <= 2:
            r += 0.035 * math.exp(-((t - 0.20) / 0.14) ** 2) * max(0.0, math.cos(a - (TAU / 2 if side < 0 else 0.0))) * 0.8
        # 肘弯内侧挤褶（环向波纹）
        r += 0.055 * math.exp(-((i - eln) / 1.1) ** 2) * math.sin(a * 4 + wk[i % 8] * 6) * 0.5
        # 布面低频
        r += 0.016 * (wk[int(a / TAU * 12) % 12] - 0.5)
        r += 0.012 * math.sin(a * 3 + i * 2.2 + wk[(i + 5) % 24] * 7)
        return r
    bm = bmesh.new()
    rings = tube(bm, path, rads, rads, ring_n=18, cap_start=True, cap_end=False,
                 ref=Vector((0, -1, 0)), bulge=bulge)
    # 袖口：外翻边（一圈外鼓短环）+ 内收口（见内里、腕从中伸出）
    rN = rings[-1]
    cuff_out, cuff_in = [], []
    for v in rN:
        p = v.co
        rad = p - wr
        rad = rad - axis * rad.dot(axis)
        rl = max(rad.length, 1e-6)
        cuff_out.append(bm.verts.new(p + rad * (0.0045 / rl) + axis * 0.012))
        cuff_in.append(bm.verts.new(wr + rad * ((wrist_r + 0.004) / rl) + axis * 0.010))
    nn = len(rN)
    for k in range(nn):
        k2 = (k + 1) % nn
        bm.faces.new((rN[k], rN[k2], cuff_out[k2], cuff_out[k]))
        bm.faces.new((cuff_out[k], cuff_out[k2], cuff_in[k2], cuff_in[k]))
    sleeve = finish_mesh('Sleeve' + ('L' if side < 0 else 'R'), bm, [mats['coat']], subsurf=1)
    # 腕内衬皮肤管（袖口里的手腕）
    bm = bmesh.new()
    tube(bm, [wr - hand['dir'] * 0.01, wr + hand['dir'] * 0.030],
         [wrist_r * 0.82, wrist_r * 0.78], [wrist_r * 0.72, wrist_r * 0.68],
         ring_n=12, ref=hand['palm'], cap_start=True, cap_end=True)
    wrist_skin = finish_mesh('Wrist' + ('L' if side < 0 else 'R'), bm, [mats['skin_flat']], subsurf=1)
    return [sleeve, wrist_skin], wr, hand


def _meta_to_mesh(obj, name, mat, decimate=0.55):
    """metaball → mesh，附材质/平滑/减面。"""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    mo = bpy.context.view_layer.objects.active
    mo.name = name
    mo.data.name = name
    mo.data.materials.append(mat)
    shade_smooth(mo)
    if decimate < 1.0 and len(mo.data.polygons) > 500:
        md = mo.modifiers.new('Dec', 'DECIMATE')
        md.ratio = decimate
    return mo


def build_hand(side, wrist, hand_frame, spec, mats, curl=0.55, spread=0.0):
    """metaball 连续皮肤手：掌腹/鱼际/四指三节（关节鼓）/拇指——无木节缝。
    指梢背面贴指甲盖。返回 [手, 指甲] obj 列表。"""
    d = Vector(hand_frame['dir']).normalized()
    palm_n = Vector(hand_frame['palm']).normalized()
    sidev = d.cross(palm_n).normalized()
    bloat = spec.get('bloat', 0.0)
    S = (1 + bloat * 0.28) * spec.get('H', 1.72) / 1.72 * 1.10   # 真人手长 ~0.105H；r13 小一号=火柴棍
    key = 'HandMeta' + ('L' if side < 0 else 'R')
    mb = bpy.data.metaballs.new(key)
    mb.resolution = 0.0028
    mb.render_resolution = 0.0028
    obj = bpy.data.objects.new(key, mb)
    bpy.context.collection.objects.link(obj)

    def ball(p, r):
        el = mb.elements.new(type='BALL')
        el.co = p
        el.radius = r

    def chain(p0, p1, r0, r1):
        """密排球链（步长 ≤0.45r，metaball 影响域=半径，必须密排才融合）。"""
        L = (p1 - p0).length
        rmin = min(r0, r1)
        n = max(2, int(math.ceil(L / max(rmin * 0.45, 1e-5))))
        for i in range(n + 1):
            t = i / n
            ball(p0.lerp(p1, t), r0 + (r1 - r0) * t)

    # 掌体：2D 密网格布球（两个方向步长都 ≤0.5R，保证成一块连续掌）
    n_rows = 9
    for ir in range(n_rows):
        t = ir / (n_rows - 1)
        tpalm = 0.004 + t * 0.080
        wpalm = (0.0092 + t * 0.0075) * S
        rpalm = (0.0135 - t * 0.0025) * S
        nk = max(2, int(math.ceil(2 * wpalm / (rpalm * 0.5))))
        for ik in range(nk + 1):
            kx = -1 + 2 * ik / nk
            ball(wrist + d * tpalm * S + sidev * kx * wpalm - palm_n * 0.001, rpalm)
    # 鱼际（拇指根肉）
    ball(wrist + d * 0.030 * S - sidev * 0.022 * S - palm_n * 0.005, 0.0125 * S)
    # 四指：三节密链 + 关节微鼓；记录指梢帧给指甲
    fl = [0.86, 1.0, 0.95, 0.74]
    nail_frames = []
    for i in range(4):
        off = sidev * ((i - 1.5) * 0.0190 * S)
        base = wrist + d * 0.086 * S + off
        chain(wrist + d * 0.076 * S + off * 0.9, base, 0.0088 * S, 0.0080 * S)  # 掌指过渡
        L = 0.066 * fl[i] * S
        dir1 = (d + sidev * (spread * (i - 1.5) * 0.16) - palm_n * curl * 0.30).normalized()
        dir2 = (dir1 - palm_n * curl * 0.85).normalized()
        dir3 = (dir2 - palm_n * curl * 1.05).normalized()
        p = Vector(base)
        for dseg, frac, rr in ((dir1, 0.42, 0.0074), (dir2, 0.34, 0.0066), (dir3, 0.24, 0.0058)):
            q = p + dseg * (L * frac)
            chain(p, q, rr * S, rr * S)
            ball(q, rr * S * 1.14)   # 关节微鼓
            p = q
        nail_frames.append((Vector(q), dir3, 0.0058 * S))
    # 拇指：两节
    tb = wrist + d * 0.028 * S - sidev * 0.030 * S - palm_n * 0.004
    t1 = tb - sidev * 0.020 * S + d * 0.024 * S - palm_n * 0.010
    t2 = t1 - sidev * 0.008 * S + d * 0.030 * S - palm_n * 0.014 * curl
    chain(tb, t1, 0.0100 * S, 0.0085 * S)
    chain(t1, t2, 0.0082 * S, 0.0064 * S)
    nail_frames.append((Vector(t2), (t2 - t1).normalized(), 0.0064 * S))
    hand = _meta_to_mesh(obj, 'Hand' + ('L' if side < 0 else 'R'), mats['skin_flat'], decimate=0.62)
    # —— 指甲盖：指梢背面的一片微曲甲板（横向微拱、指向指尖） ——
    bm = bmesh.new()
    for tip, tdir, rr in nail_frames:
        back_n = (-palm_n - tdir * (-palm_n).dot(tdir)).normalized()   # 甲面朝手背
        sside = tdir.cross(back_n).normalized()
        c0 = tip - tdir * rr * 0.55 + back_n * rr * 0.72
        nw, nl = rr * 0.72, rr * 1.15
        rows = []
        for iu in range(4):
            tu = iu / 3
            rowv = []
            for iv in range(4):
                tv = iv / 3 - 0.5
                arch = (1 - (tv * 2) ** 2) * rr * 0.16
                pt = (c0 + tdir * (tu * nl) + sside * (tv * 2 * nw) +
                      back_n * (arch - tu * tu * rr * 0.34))
                rowv.append(bm.verts.new(pt))
            rows.append(rowv)
        for iu in range(3):
            for iv in range(3):
                bm.faces.new((rows[iu][iv], rows[iu][iv + 1], rows[iu + 1][iv + 1], rows[iu + 1][iv]))
    nails = finish_mesh('Nails' + ('L' if side < 0 else 'R'), bm, [mats['nail']], subsurf=1)
    nails.data.materials[0].use_backface_culling = False
    return [hand, nails]


def build_legs(spec, m, mats):
    """裤管：大腿肌量→膝→小腿肚→踝；前中烫迹线棱 + 裤脚断褶 + 布噪声。"""
    outfit = spec.get('outfit', 'zhongshan')
    loose = 0.020 if outfit in ('padded', 'wet_padded') else 0.013
    bloat = spec.get('bloat', 0.0)
    objs = []
    for side in (-1, 1):
        hx = side * m['hipw'] * 0.60
        thigh_r = 0.058 * m['H'] / 1.72 * (1 + bloat * 0.15)
        knee_r = 0.040 * m['H'] / 1.72 * (1 + bloat * 0.18)
        calf_r = 0.044 * m['H'] / 1.72 * (1 + bloat * 0.2)
        ankle_r = 0.027 * m['H'] / 1.72 * (1 + bloat * 0.25)
        kz = m['knee']
        path = [Vector((hx, 0.004, m['hip'] + 0.04)),
                Vector((hx, -0.002, m['hip'] - 0.05)),
                Vector((hx, -0.008, kz + 0.09)),
                Vector((hx, 0.002, kz)),
                Vector((hx, 0.010, kz - 0.10)),        # 小腿肚偏后
                Vector((hx, 0.002, 0.16)),
                Vector((hx, -0.002, 0.105)),
                Vector((hx, -0.002, 0.080))]
        cuff = ankle_r + loose + 0.008
        rads = [thigh_r + loose, thigh_r * 0.97 + loose, (thigh_r * 0.6 + knee_r * 0.4) + loose,
                knee_r + loose + 0.003, calf_r + loose, (calf_r * 0.5 + ankle_r * 0.5) + loose,
                cuff, cuff + 0.002]
        wrk = np.random.default_rng(spec.get('seed', 1) + side).random(24)

        def bulge(i, a):
            r = 1.0
            fr = math.sin(a)
            if outfit in ('zhongshan', 'waiter'):
                # 前中烫迹线
                r += 0.011 * math.exp(-((abs(a - TAU / 4)) / 0.075) ** 2)
            # 大腿前布面松垂
            r += 0.020 * math.exp(-((i - 1.2) / 0.9) ** 2) * max(0.0, fr) * math.sin(a * 3 + wrk[(i + 5) % 8] * 5) * 0.5
            # 膝后横褶
            r += 0.045 * math.exp(-((i - 3.4) / 0.9) ** 2) * max(0.0, -fr) * math.sin(a * 5 + wrk[i % 8] * 6) * 0.6
            # 裤脚断褶（堆在鞋面）
            r += 0.062 * math.exp(-((i - 6.5) / 0.7) ** 2) * math.sin(a * 6 + wrk[(i + 3) % 8] * 7) * 0.5
            r += 0.018 * (wrk[int(a / TAU * 12) % 12] - 0.5)
            return r
        bm = bmesh.new()
        tube(bm, path, rads, rads, ring_n=20, cap_start=True, cap_end=True, bulge=bulge)
        objs.append(finish_mesh('Leg' + ('L' if side < 0 else 'R'), bm, [mats['trouser']], subsurf=1))
    return objs


def build_feet(spec, m, mats):
    """鞋：楦头放样 + 独立鞋底沿条；湿客赤足走 metaball（有脚趾）。"""
    bare = spec.get('barefoot', False)
    bloat = spec.get('bloat', 0.0)
    S = (1 + (bloat * 0.3 if bare else 0)) * m['H'] / 1.72
    objs = []
    for side in (-1, 1):
        hx = side * m['hipw'] * 0.60
        if bare:
            key = 'FootMeta' + ('L' if side < 0 else 'R')
            mb = bpy.data.metaballs.new(key)
            mb.resolution = 0.0034
            mb.render_resolution = 0.0034
            obj = bpy.data.objects.new(key, mb)
            bpy.context.collection.objects.link(obj)

            def ball(p, r):
                el = mb.elements.new(type='BALL')
                el.co = p
                el.radius = r

            def chain(p0, p1, r0, r1):
                L = (p1 - p0).length
                n = max(2, int(math.ceil(L / max(min(r0, r1) * 0.45, 1e-5))))
                for i in range(n + 1):
                    t = i / n
                    ball(p0.lerp(p1, t), r0 + (r1 - r0) * t)
            heel = Vector((hx, 0.026 * S, 0.030 * S))
            arch = Vector((hx, -0.045 * S, 0.024 * S))
            fball = Vector((hx, -0.098 * S, 0.020 * S))
            ankle = Vector((hx, 0.026 * S, 0.062 * S))
            chain(ankle, heel, 0.026 * S, 0.028 * S)      # 踝→跟
            chain(heel, arch, 0.028 * S, 0.024 * S)       # 跟→弓
            chain(arch, fball, 0.024 * S, 0.021 * S)      # 弓→跖球
            for i in range(5):
                tx = hx + side * (i - 2) * (-0.0105) * S
                ty = -0.128 * S - [0.008, 0.011, 0.008, 0.003, -0.003][i] * S
                toe = Vector((tx, ty, 0.0095 * S))
                start = fball + Vector((side * (i - 2) * (-0.008) * S, 0, -0.004 * S))
                chain(start, toe, 0.012 * S, (0.0085 - i * 0.0007) * S)  # 跖→五趾
            objs.append(_meta_to_mesh(obj, 'Foot' + ('L' if side < 0 else 'R'),
                                      mats['skin_flat'], decimate=0.6))
            continue
        zb = 0.054 * S
        path = [Vector((hx, 0.042 * S, zb * 1.10)),
                Vector((hx, 0.022, zb * 1.00)),
                Vector((hx, -0.038 * S, zb * 0.84)),
                Vector((hx, -0.094 * S, zb * 0.66)),
                Vector((hx, -0.148 * S, zb * 0.52)),
                Vector((hx, -0.185 * S, zb * 0.42))]
        w = [0.032 * S, 0.039 * S, 0.043 * S, 0.043 * S, 0.038 * S, 0.023 * S]
        dep = [0.035 * S, 0.037 * S, 0.034 * S, 0.028 * S, 0.022 * S, 0.012 * S]
        bm = bmesh.new()
        tube(bm, path, w, dep, ring_n=14, ref=Vector((0, 0, 1)), cap_start=True, cap_end=True)
        # 鞋底沿条：沿足底一圈的扁放样（鞋帮厚度=沿条外扩 3mm）
        sole_path = [Vector((hx, 0.050 * S, 0.011)), Vector((hx, -0.025 * S, 0.010)),
                     Vector((hx, -0.11 * S, 0.009)), Vector((hx, -0.192 * S, 0.009))]
        sw = [0.038 * S, 0.045 * S, 0.045 * S, 0.027 * S]
        sd = [0.011, 0.011, 0.010, 0.009]
        tube(bm, sole_path, sw, sd, ring_n=10, ref=Vector((0, 0, 1)), cap_start=True, cap_end=True)
        objs.append(finish_mesh('Foot' + ('L' if side < 0 else 'R'), bm, [mats['shoe']], subsurf=1))
    return objs


def build_neck(spec, m, mats):
    """颈：底部张进斜方肌/锁骨窝，中段圆柱微前倾，喉结鼓包——不是插棍。"""
    r = 0.0345 * m['H'] / 1.72 * (1 + spec.get('bloat', 0.0) * 0.3)
    z0 = m['shoulder'] - 0.028
    z1 = m['neck_top'] + 0.008
    yo0, yo1 = stoop_off(spec, m, z0), stoop_off(spec, m, z1)
    pitch = spec.get('head_pitch', 0.0)
    y_lean = -math.sin(pitch) * 0.02
    path = [Vector((0, yo0, z0)),
            Vector((0, yo0 * 0.7 + yo1 * 0.3, z0 + (z1 - z0) * 0.30)),
            Vector((0, yo0 * 0.4 + yo1 * 0.6 + y_lean * 0.4, z0 + (z1 - z0) * 0.62)),
            Vector((0, yo1 + y_lean, z1))]
    rads_w = [r * 1.70, r * 1.14, r * 1.02, r * 1.04]
    rads_d = [r * 1.35, r * 1.06, r * 0.99, r * 1.00]
    male = spec.get('anomaly') != 'drowned'

    def bulge(i, a):
        b = 1.0
        fr = math.sin(a)
        # 斜方肌后坡（底环后侧加宽）
        if i == 0:
            b += 0.28 * max(0.0, -fr)
        # 喉结（中上段前面）
        if male and i == 2:
            b += 0.10 * math.exp(-((a - TAU / 4) / 0.5) ** 2)
        # 胸锁乳突肌两条（前侧斜带）
        b += 0.05 * math.exp(-((abs(math.cos(a)) - 0.55) / 0.22) ** 2) * max(0.0, fr) * (1 if i in (1, 2) else 0)
        return b
    bm = bmesh.new()
    tube(bm, path, rads_w, rads_d, ring_n=16, cap_start=True, cap_end=True, bulge=bulge)
    return finish_mesh('Neck', bm, [mats['skin_flat']], subsurf=1)


def build_tray(mats):
    """侍应托盘：圆盘 + 沿 + 一只空碗。"""
    bm = bmesh.new()
    N = 20
    def ring_at(r, z):
        return [bm.verts.new(Vector((math.cos(a / N * TAU) * r, math.sin(a / N * TAU) * r, z))) for a in range(N)]
    rs = [ring_at(0.165, 0), ring_at(0.165, 0.010), ring_at(0.150, 0.018), ring_at(0.148, 0.006)]
    for i in range(len(rs) - 1):
        for k in range(N):
            k2 = (k + 1) % N
            bm.faces.new((rs[i][k], rs[i][k2], rs[i + 1][k2], rs[i + 1][k]))
    bm.faces.new(tuple(reversed(rs[0])))
    bm.faces.new(tuple(rs[-1]))
    tray = finish_mesh('TrayDisc', bm, [mats['tray']], subsurf=1)
    bm = bmesh.new()
    prof = [(0.020, 0.008), (0.045, 0.018), (0.055, 0.042), (0.048, 0.040)]
    rings = []
    for r, z in prof:
        rings.append([bm.verts.new(Vector((math.cos(a / N * TAU) * r + 0.03, math.sin(a / N * TAU) * r - 0.02, z + 0.008))) for a in range(N)])
    for i in range(len(prof) - 1):
        for k in range(N):
            k2 = (k + 1) % N
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bm.faces.new(tuple(reversed(rings[0])))
    bowl = finish_mesh('Bowl', bm, [mats['bowl']], subsurf=1)
    bowl.parent = tray
    return tray


def build_armband(spec, m, mats):
    """左臂红袖章。"""
    yo = stoop_off(spec, m, m['shoulder'])
    sh = Vector((-m['sw'], yo, m['shoulder'] - 0.012))
    el = sh + Vector((-0.012, 0.004, -0.148 * m['H']))
    c = sh.lerp(el, 0.42)
    axis = (el - sh).normalized()
    r0 = 0.040 * m['H'] / 1.72 + 0.011 + 0.005
    bm = bmesh.new()
    tube(bm, [c - axis * 0.032, c + axis * 0.032], [r0, r0], [r0, r0], ring_n=12)
    return finish_mesh('Armband', bm, [mats['band']], subsurf=1)


# ============================= 装配与导出 =============================

def assemble_character(spec):
    """在当前（空）场景装配一名角色。返回 root Empty。"""
    seed = spec.get('seed', 1)
    name = spec['name']
    m = body_metrics(spec)

    face_arr = HF.paint_face(spec, seed)
    face_img = np_to_image(name + '_face', face_arr)
    eye_img = np_to_image(name + '_eyetex', HF.paint_eye(iris_rgb=spec.get('iris', (0.30, 0.19, 0.12)),
                                                         filmed=spec.get('eye_film', 0.0), seed=seed))
    skin_rgb = spec.get('skin', (0.72, 0.55, 0.44))
    wet = spec.get('outfit') == 'wet_padded'
    mats = {
        'skin': tex_mat(name + '_skin', face_img, rough=0.62 if wet else 0.72),
        # 颈/手的平色皮肤直接采样脸部画布下颌区平均色（v≈0.25–0.33 为颌底带），
        # 任何按公式估的颜色都追不上年龄斑/尸变图层——r9 的「贴纸下巴」就是这么来的
        'skin_flat': flat_mat(name + '_skinf',
                              tuple(srgb_to_linear(float(np.clip(c, 0, 1))) for c in
                                    face_arr[int(face_arr.shape[0] * 0.25):int(face_arr.shape[0] * 0.33),
                                             int(face_arr.shape[1] * 0.42):int(face_arr.shape[1] * 0.58)].mean(axis=(0, 1))),
                              rough=0.62 if wet else 0.72),
        'eye': tex_mat(name + '_eye', eye_img, rough=0.34 if wet else 0.15),
        # 睑缘线（睫毛读法）与内眦泪阜
        'lidline': flat_mat(name + '_lidline',
                            tuple(srgb_to_linear(float(np.clip(c * 0.42, 0, 1))) for c in skin_rgb), rough=0.55),
        'caruncle': flat_mat(name + '_caruncle', (srgb_to_linear(0.50), srgb_to_linear(0.22), srgb_to_linear(0.20)),
                             rough=0.35),
        'hair': flat_mat(name + '_hair', spec.get('hair_rgb', (0.09, 0.08, 0.07)), rough=0.85),
        'hair_dk': flat_mat(name + '_hairdk', tuple(c * 0.55 for c in spec.get('hair_rgb', (0.09, 0.08, 0.07))), rough=0.92),
        'hair_lt': flat_mat(name + '_hairlt', tuple(min(1, c * 1.7 + 0.03) for c in spec.get('hair_rgb', (0.09, 0.08, 0.07))), rough=0.8),
        'brow': flat_mat(name + '_brow', spec.get('brow_rgb', tuple(c * 0.7 for c in spec.get('hair_rgb', (0.09, 0.08, 0.07)))), rough=0.9),
        'coat': flat_mat(name + '_coat', spec.get('coat_rgb', (0.30, 0.32, 0.34)),
                         rough=0.42 if wet else 0.88, bump=0.10 if wet else 0.16, bump_scale=230.0),
        'trouser': flat_mat(name + '_trouser', spec.get('trouser_rgb', (0.16, 0.17, 0.19)),
                            rough=0.5 if wet else 0.9, bump=0.09 if wet else 0.14, bump_scale=280.0),
        'shoe': flat_mat(name + '_shoe', spec.get('shoe_rgb', (0.06, 0.055, 0.05)), rough=0.45),
        'button': flat_mat(name + '_btn', (0.35, 0.33, 0.28), rough=0.4, metal=0.6),
        'nail': flat_mat(name + '_nail',
                         tuple(srgb_to_linear(float(np.clip(c * 1.06 + 0.04, 0, 1))) for c in
                               ((0.52, 0.58, 0.58) if wet else skin_rgb)), rough=0.30),
        'band': flat_mat(name + '_bandm', (0.55, 0.08, 0.07), rough=0.75),
        'straw': flat_mat(name + '_straw', (0.55, 0.44, 0.26), rough=0.9),
        'tray': flat_mat(name + '_tray', (0.30, 0.20, 0.12), rough=0.55),
        'bowl': flat_mat(name + '_bowl', (0.85, 0.83, 0.78), rough=0.25),
        'kelp': flat_mat(name + '_kelp', (0.115, 0.165, 0.105), rough=0.45),
        'pearl': flat_mat(name + '_pearl', (0.78, 0.74, 0.63), rough=0.38),
        'salt': flat_mat(name + '_salt', (0.92, 0.94, 0.94), rough=0.55),
    }

    root = bpy.data.objects.new(name + '_root', None)
    bpy.context.collection.objects.link(root)
    parts = []

    torso, extras = build_clothed_torso(spec, m, mats, seed)
    parts += [torso] + extras
    parts += build_legs(spec, m, mats)
    parts += build_feet(spec, m, mats)
    parts.append(build_neck(spec, m, mats))

    poseL = spec.get('pose_l', 'sides')
    poseR = spec.get('pose_r', 'sides')
    slv_l, wr_l, hf_l = build_arm(-1, spec, m, mats, poseL, seed)
    slv_r, wr_r, hf_r = build_arm(1, spec, m, mats, poseR, seed)
    parts += slv_l + slv_r
    parts += build_hand(-1, wr_l, hf_l, spec, mats,
                        curl=spec.get('curl', 0.55), spread=spec.get('spread', 0.0))
    parts += build_hand(1, wr_r, hf_r, spec, mats,
                        curl=spec.get('curl', 0.55), spread=spec.get('spread', 0.0))

    if spec.get('armband'):
        parts.append(build_armband(spec, m, mats))
    if poseL == 'tray':
        tray = build_tray(mats)
        tray.location = wr_l + Vector((0.02, -0.05, 0.035))
        parts.append(tray)
    if spec.get('kelp'):
        rng = rng_stream(seed + 99)
        for i in range(3):
            x0 = (-1 if i % 2 else 1) * (0.05 + rng.random() * 0.07)
            z0 = m['shoulder'] + 0.01
            L = 0.26 + rng.random() * 0.30
            bm = bmesh.new()
            pth = [Vector((x0 + math.sin(t * 4 + i) * 0.015, -0.045 - t * 0.02, z0 - L * t)) for t in np.linspace(0, 1, 4)]
            tube(bm, pth, [0.026, 0.021, 0.015, 0.006], [0.005, 0.0045, 0.003, 0.0015], ring_n=6,
                 cap_start=True, cap_end=True)
            parts.append(finish_mesh('Kelp%d' % i, bm, [mats['kelp']], subsurf=1))

    # —— 头组（HeadPivot 供运行时转头）——
    pitch = spec.get('head_pitch', 0.0)
    yaw = spec.get('head_yaw', 0.0)
    yo = stoop_off(spec, m, m['neck_top'])
    pivot = bpy.data.objects.new('HeadPivot', None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = Vector((0, yo - math.sin(pitch) * 0.02, m['neck_top']))
    pivot.rotation_euler = Euler((pitch, 0, yaw), 'XYZ')
    pivot.parent = root

    field, head_objs = HF.forge_head(spec, seed, mats)
    head_lift = field.rz * 0.41   # 头压低：下颌落到领口，不露木偶长颈
    if spec.get('hat') == 'straw':
        hat = add_straw_hat(mats)
        crown = field.pos(Vector((0, -0.12, 1.0)))
        hat.location = Vector((0, 0.008, crown.z - 0.009))
        head_objs.append(hat)
    for o in head_objs:
        o.location = Vector(o.location) + Vector((0, 0, head_lift))
        o.parent = pivot

    for o in parts:
        o.parent = root
    return root


def save_and_export(name, blend_dir, glb_dir):
    import os
    os.makedirs(blend_dir, exist_ok=True)
    os.makedirs(glb_dir, exist_ok=True)
    blend_path = os.path.join(blend_dir, name + '.blend')
    glb_path = os.path.join(glb_dir, name + '.glb')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend_path), compress=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(glb_path), export_format='GLB',
        export_apply=True, export_yup=True, export_animations=False,
        export_skins=False, export_morph=False,
        export_image_format='JPEG', export_jpeg_quality=82)
    print('[fanchao] saved %s + %s' % (blend_path, glb_path))
    return blend_path, glb_path


# ============================= 场景关键件：无面海神像 =============================

def _flake_weather(obj, mats_pair, seed, freq=30.0, ratio=0.48, relief=0.0013, cuts=3):
    """漆面剥落（几何+材质对齐）：先把 subsurf 提到 2 级真实应用得到平滑密网，
    再三角化 + 切向抖动打散网格走向（材质逐面赋值，边界只能沿棱走——规则四边网格
    必成数字迷彩，不规则三角网才像漆片沿棱角崩裂），最后用中频 fbm 连片成岛：
    顶点噪声抬出漆层台地（有台阶厚度），同阈值把露木面换材质。"""
    for m in obj.modifiers:
        if m.type == 'SUBSURF':
            m.levels = 3
            m.render_levels = 3
    dg = bpy.context.evaluated_depsgraph_get()
    me_new = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    old = obj.data
    obj.data = me_new
    obj.modifiers.clear()
    bpy.data.meshes.remove(old)
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me)
    bm.free()
    n_v = len(me.vertices)
    co = np.empty(n_v * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    nrm = np.empty(n_v * 3)
    me.vertices.foreach_get('normal', nrm)
    nrm = nrm.reshape(-1, 3)
    # 切向抖动 ~7mm：打断规则网格线，让剥落边界成不规则多边形
    J = np.stack([HF.fbm3(co * 41.0 + off, seed + k * 7, octaves=2) - 0.5
                  for k, off in enumerate((13.7, 71.3, 29.1))], axis=1) * 2.0
    J -= nrm * (J * nrm).sum(axis=1, keepdims=True)
    co = co + J * 0.0075
    me.vertices.foreach_set('co', co.ravel())
    def flake_noise(pts):
        # 域扭曲是关键：值噪声的等值线贴着立方晶格走，直接采样必出轴对齐的
        # 「数码迷彩」方块；先用低频场把采样域揉弯，岛的边界才像漆片崩裂。
        # 中频定岛 + 高频锯碎边缘（同一公式喂顶点和面心，几何台地与材质边严格对齐）
        warp = np.stack([HF.fbm3(pts * (freq * 0.55) + o, seed + 31 + k * 5, octaves=2) - 0.5
                         for k, o in enumerate((5.2, 17.8, 43.1))], axis=1) * (2.3 / freq)
        q = pts + warp
        base = HF.fbm3(q * freq, seed, octaves=4)
        edge = (HF.fbm3(q * (freq * 4.6), seed + 11, octaves=2) - 0.5) * 0.17
        return base + edge
    n = flake_noise(co)
    lift = np.clip((n - ratio) / 0.030, 0, 1)
    co2 = co + nrm * (lift * relief)[:, None]
    me.vertices.foreach_set('co', co2.ravel())
    me.materials.append(mats_pair[1])   # index1 = 露木
    cen = np.array([p.center[:] for p in me.polygons])
    nf = flake_noise(cen)
    for poly, v in zip(me.polygons, nf):
        if v <= ratio:
            poly.material_index = 1
    me.update()


def assemble_seagod(spec):
    """塌祠里请出来的木胎海神像。核心读法：那张脸不是没雕过——
    眉弓、鼻梁、闭着的眼、唇缝都还剩三成起伏，是被手掌一天一天顺着往下抹平的，
    脸上留着五道竖向的指痕槽。朱漆剥落成真实台地，衣褶是深放样密度。"""
    seed = spec.get('seed', 7)
    rng = rng_stream(seed)
    name = spec['name']
    mats = {
        'lacquer': flat_mat(name + '_lacquer', (0.27, 0.055, 0.045), rough=0.62),
        'wood': flat_mat(name + '_wood', (0.21, 0.175, 0.14), rough=0.88),
        'woodface': flat_mat(name + '_woodface', (0.40, 0.33, 0.25), rough=0.42),  # 被摸出包浆
        'stone': flat_mat(name + '_stone', (0.20, 0.20, 0.21), rough=0.92),
        'gilt': flat_mat(name + '_gilt', (0.55, 0.42, 0.18), rough=0.45, metal=0.7),
        'ash': flat_mat(name + '_ash', (0.20, 0.19, 0.18), rough=0.95),
        'ember': flat_mat(name + '_ember', (0.9, 0.35, 0.12), rough=0.4),
    }
    root = bpy.data.objects.new(name + '_root', None)
    bpy.context.collection.objects.link(root)
    parts = []

    # —— 底座（石，錾边 + 风化噪声）——
    bm = bmesh.new()
    prof = [(0.30, 0.00), (0.315, 0.035), (0.285, 0.06), (0.27, 0.20), (0.295, 0.235), (0.30, 0.26)]
    N = 4  # 方形四角
    rings = []
    for (rr, zz) in prof:
        ring = []
        for k in range(N * 4):
            a = (k + 0.5) / (N * 4) * TAU
            # 方中带圆的截面
            ca, sa = math.cos(a), math.sin(a)
            mx = max(abs(ca), abs(sa))
            ring.append(bm.verts.new(Vector((ca / mx * rr * 0.92, sa / mx * rr * 0.76, zz))))
        rings.append(ring)
    for i in range(len(prof) - 1):
        for k in range(N * 4):
            k2 = (k + 1) % (N * 4)
            bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))
    plinth = finish_mesh('Plinth', bm, [mats['stone']], subsurf=0)
    parts.append(plinth)

    # —— 袍身（深垂褶放样 + 下摆厚边）——
    prof = [(0.26, 0.210), (0.32, 0.198), (0.45, 0.165), (0.58, 0.140), (0.70, 0.126),
            (0.80, 0.128), (0.88, 0.134), (0.95, 0.140), (1.01, 0.118), (1.045, 0.082), (1.075, 0.056)]
    path = [Vector((0, -(z - 0.26) * 0.045, z)) for z, _ in prof]
    widths = [pr for _, pr in prof]
    depths = [pr * 0.82 for _, pr in prof]
    wr = rng.random(24)

    def bulge(i, a):
        t = i / (len(prof) - 1)
        r = 1.0
        # 深垂褶：下摆深、上身浅；相位打散；前面开襟两道对称大褶
        r += 0.115 * abs(math.sin(a * 4.5 + wr[i % 12] * 2.2)) ** 0.6 * (1 - t) ** 1.2 - 0.055 * (1 - t)
        r += 0.05 * math.exp(-((abs(a - TAU / 4) - 0.35) / 0.16) ** 2) * (1 - t) * 0.8   # 开襟折
        r += 0.028 * math.sin(a * 9 + i * 1.7 + wr[(i + 7) % 24] * 5) * (1 - t * 0.6)    # 碎褶
        return r
    bm = bmesh.new()
    ringsR = tube(bm, path, widths, depths, ring_n=30, cap_start=True, cap_end=True, bulge=bulge)
    r0 = ringsR[0]
    out_ring = []
    for v in r0:
        p = v.co
        rad = Vector((p.x, p.y, 0))
        rl = max(rad.length, 1e-6)
        out_ring.append(bm.verts.new(p + rad * (0.006 / rl) + Vector((0, 0, -0.008))))
    nn = len(r0)
    for k in range(nn):
        k2 = (k + 1) % nn
        bm.faces.new((out_ring[k], out_ring[k2], r0[k2], r0[k]))
    robe = finish_mesh('Robe', bm, [mats['lacquer']], subsurf=1)
    parts.append(robe)

    # —— 交袖（垂褶密环 + 袖口黑洞——手是看不见的）——
    for sgn in (-1, 1):
        sh = Vector((sgn * 0.135, -0.070, 0.945))
        mid = Vector((sgn * 0.105, -0.185, 0.79))
        end = Vector((-sgn * 0.035, -0.222, 0.665))
        drop = Vector((sgn * 0.075, -0.205, 0.60))   # 袖口垂角
        wk = rng.random(12)

        def sbulge(i, a):
            return 1 + 0.13 * abs(math.sin(a * 3.5 + wk[i % 6] * 3)) ** 0.7 * (0.4 + i / 4)
        bm = bmesh.new()
        tube(bm, [sh, mid, end, drop], [0.055, 0.050, 0.046, 0.030], [0.048, 0.044, 0.040, 0.026],
             ring_n=18, cap_start=True, cap_end=True, bulge=sbulge)
        slv = finish_mesh('Sleeve', bm, [mats['lacquer']], subsurf=1)
        parts.append(slv)

    # —— 头：曾经有脸（低幅五官场 + 抹平 + 五道指痕竖槽 + 闭目丘）——
    god_head_spec = {'head': {'age': 0.0, 'brow_k': 1.0, 'nose_k': 1.0, 'cheek_k': 1.0,
                              'hollow': 0.012, 'jaw_k': 1.0, 'chin_k': 1.0,
                              'rx': 0.070, 'ry': 0.080, 'rz': 0.094, 'asym': 0.004}}
    field = HF.HeadField(god_head_spec, seed + 3)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=72, v_segments=54, radius=1.0)
    vs = list(bm.verts)
    D = np.array([v.co[:] for v in vs])
    D /= np.linalg.norm(D, axis=1, keepdims=True)
    P = field.unit_pos(D)
    # 抹平：五官幅度衰到 42%（往单位球回退），只在脸区——「曾经是脸」要读得出
    lon = np.arctan2(D[:, 0], -D[:, 1])
    frontm = np.clip(np.cos(lon), 0, 1) ** 1.2 * (D[:, 2] < 0.55) * (D[:, 2] > -0.9)
    P = P + (D - P) * (0.58 * frontm)[:, None]
    # 指痕：五道竖槽（手掌顺着脸往下抹的方向）
    for k, xg in enumerate((-0.30, -0.15, 0.0, 0.15, 0.30)):
        gm = np.exp(-((lon - xg) / 0.050) ** 2) * frontm * np.clip((0.38 - np.abs(D[:, 2] + 0.05)) / 0.38, 0, 1)
        P[:, 1] += gm * 0.026
    # 闭目丘（眼睑鼓包，闭着）
    for sgn in (-1, 1):
        E = np.array(field.eye_dirs[sgn])
        ang = np.arccos(np.clip(D @ E, -1, 1))
        P += D * (np.exp(-(ang / 0.20) ** 2) * 0.038)[:, None]
        # 睑缝横线
        seam = np.exp(-(ang / 0.22) ** 2) * np.exp(-((D[:, 2] - HF.LM['eye_z'] + 0.03) / 0.022) ** 2)
        P[:, 1] += seam * 0.011
    P *= np.array([field.rx, field.ry, field.rz])
    for v, p in zip(vs, P):
        v.co = Vector(p)
    me = bpy.data.meshes.new('GodHead')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    head = new_object('GodHead', me)
    head.data.materials.append(mats['woodface'])
    shade_smooth(head)
    head.location = Vector((0, -0.048, 1.145))
    # 颅侧/后仍带漆（脸被摸成包浆露木）
    head.data.materials.append(mats['lacquer'])
    for poly in head.data.polygons:
        c = poly.center
        plon = math.atan2(c.x, -c.y)
        if abs(plon) > 1.05 or c.z > 0.062:
            poly.material_index = 1
    parts.append(head)

    # 颈（袍领接头）
    bm = bmesh.new()
    tube(bm, [Vector((0, -0.040, 1.05)), Vector((0, -0.046, 1.13))],
         [0.040, 0.036], [0.037, 0.034], ring_n=14, cap_start=True, cap_end=True)
    parts.append(finish_mesh('GodNeck', bm, [mats['wood']], subsurf=1))

    # —— 冕板 + 珠旒（前后各五串×5珠）——
    bm = bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r['verts']:
        v.co = Vector((v.co.x * 0.082, v.co.y * 0.125, v.co.z * 0.010))
        v.co += Vector((0, -0.048, 1.240))
    parts.append(finish_mesh('Crown', bm, [mats['gilt']], subsurf=0))
    bm = bmesh.new()
    for sy in (-1, 1):   # 前后垂旒
        for k in range(5):
            x0 = (k - 2) * 0.028
            for j in range(5):
                ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.0038)
                off = Vector((x0, -0.048 - 0.118 if sy > 0 else -0.048 + 0.115, 1.234 - j * 0.0105))
                for v in ret['verts']:
                    v.co += off
    beads = finish_mesh('Tassels', bm, [mats['gilt']], subsurf=0)
    parts.append(beads)

    # —— 三足香炉 + 香灰丘 + 三炷香（中间一炷还红着）——
    bm = bmesh.new()
    tube(bm, [Vector((0, -0.42, 0.035)), Vector((0, -0.42, 0.055)), Vector((0, -0.42, 0.085)),
              Vector((0, -0.42, 0.105))],
         [0.052, 0.068, 0.062, 0.066], [0.052, 0.068, 0.062, 0.066],
         ring_n=16, cap_start=True, cap_end=False)
    for k in range(3):
        a = k / 3 * TAU + 0.5
        leg0 = Vector((math.cos(a) * 0.045, -0.42 + math.sin(a) * 0.045, 0.04))
        leg1 = Vector((math.cos(a) * 0.055, -0.42 + math.sin(a) * 0.055, 0.0))
        tube(bm, [leg0, leg1], [0.010, 0.007], [0.010, 0.007], ring_n=8, cap_end=True)
    parts.append(finish_mesh('Censer', bm, [mats['ash']], subsurf=1))
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.055)
    for v in bm.verts:
        v.co = Vector((v.co.x, v.co.y, max(v.co.z * 0.35, 0)))
        v.co += Vector((0, -0.42, 0.095))
    parts.append(finish_mesh('AshMound', bm, [mats['ash']], subsurf=1))
    for k in range(3):
        bm = bmesh.new()
        ang = (k - 1) * 0.14
        r = bmesh.ops.create_cube(bm, size=1)
        for v in r['verts']:
            v.co = Vector((v.co.x * 0.0032, v.co.y * 0.0032, v.co.z * 0.080))
            v.co = Matrix.Rotation(ang, 4, 'Y') @ v.co
            v.co += Vector(((k - 1) * 0.02, -0.42, 0.165))
        stick = finish_mesh('Incense', bm, [mats['ash'] if k != 1 else mats['ember']], subsurf=0)
        parts.append(stick)

    # —— 漆面剥落（几何台地 + 材质对齐）——
    wi = 0
    for o in parts:
        if o.name.startswith(('Robe', 'Sleeve')):
            wi += 1
            _flake_weather(o, (mats['lacquer'], mats['wood']), seed + wi * 37,
                           freq=21.0, ratio=0.415, relief=0.0018, cuts=4)

    for o in parts:
        o.parent = root
    return root
