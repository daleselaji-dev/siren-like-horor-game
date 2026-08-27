# 《返潮》Blender 4.1 bpy 角色构建库（headless 管线）
# 设计要点：
#   · 全程序化：放样人体（躯干/四肢/分指手）+ 参数化头雕（单位球场沉积变形）
#   · 皮肤贴图：numpy 直绘 1024×512 球面展开画布（骨相阴影/唇色/胡茬/盐霜/尸斑）
#   · 死魂曲读法：6 米外是 2001 年的普通中国人，2 米内才读出「唯一主异常」
#   · 坐标约定：Z 上，-Y 为脸朝向（glTF 导出后 = three.js 的 +Z），原点在双脚间地面
import bpy
import bmesh
import math
import numpy as np
from mathutils import Vector, Matrix, Euler

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
    _fbm_cache.clear()


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


def flat_mat(name, rgb, rough=0.8, metal=0.0, sheen=0.0):
    key = name
    if key in _mat_cache:
        return _mat_cache[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
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


# ============================= numpy 贴图基元 =============================

def vnoise(rng, h, w, cells):
    """值噪声：随机格点 + 双线性上采样。"""
    g = rng.random((cells + 1, cells + 1))
    ys = np.linspace(0, cells, h, endpoint=False)
    xs = np.linspace(0, cells, w, endpoint=False)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = (ys - y0)[:, None]
    fx = (xs - x0)[None, :]
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    a = g[np.ix_(y0, x0)]
    b = g[np.ix_(y0, x0 + 1)]
    c = g[np.ix_(y0 + 1, x0)]
    d = g[np.ix_(y0 + 1, x0 + 1)]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy


def fbm(rng, h, w, base_cells=4, octaves=4):
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    cells = base_cells
    for _ in range(octaves):
        out += vnoise(rng, h, w, cells) * amp
        total += amp
        amp *= 0.5
        cells *= 2
    return out / total


def blob(U, V, u0, v0, ru, rv, hard=2.0):
    """软椭圆斑：中心 1 → 边缘 0。U/V 为 meshgrid。"""
    d = ((U - u0) / ru) ** 2 + ((V - v0) / rv) ** 2
    return np.exp(-(d ** (hard / 2)))


def tint(canvas, mask, rgb, k=1.0):
    for i in range(3):
        canvas[:, :, i] += mask * (rgb[i] - canvas[:, :, i]) * k


# ============================= 皮肤贴图（球面展开） =============================
# 头部 UV：u = 0.5 + atan2(x, -y)/τ（脸中线 u=0.5），v = 0.5 + asin(z)/π
# 关键刻度（单位球）：眼线 v≈0.51，眉 v≈0.565，鼻尖 v≈0.455，唇 v≈0.40，颌底 v≈0.28

def make_face_texture(spec, seed):
    W, H = 1024, 512
    rng = rng_stream(seed)
    us = (np.arange(W) + 0.5) / W
    vs = (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(us, vs)

    base = np.array(spec.get('skin', (0.72, 0.55, 0.44)))
    canvas = np.zeros((H, W, 3))
    canvas[:, :] = base

    # 大区域血色/明暗不均（活皮不是一张色卡）
    mott = fbm(rng, H, W, 6, 4) - 0.5
    for i, k in enumerate((0.10, 0.07, 0.05)):
        canvas[:, :, i] += mott * k
    fine = fbm(rng, H, W, 48, 3) - 0.5
    canvas += fine[:, :, None] * 0.045

    dark = np.array([c * 0.55 for c in base])
    warm = np.array([min(1, base[0] * 1.18), base[1] * 0.92, base[2] * 0.85])

    def L(mask, rgb, k):
        tint(canvas, mask, np.array(rgb), k)

    # —— 骨相阴影（贴图承担一半的立体感）——
    eye_v, eye_du = 0.512, 0.076
    for s in (-1, 1):
        ue = 0.5 + s * eye_du
        L(blob(U, V, ue, eye_v, 0.052, 0.052), dark, 0.34)            # 眼窝
        L(blob(U, V, ue, eye_v + 0.048, 0.055, 0.020), dark, 0.20)    # 上睑褶
        L(blob(U, V, ue, eye_v - 0.052, 0.045, 0.022), dark * 1.1 + 0.04, spec.get('eyebag', 0.16))  # 眼袋
        L(blob(U, V, ue + s * 0.035, 0.40, 0.016, 0.055, 1.4), dark, spec.get('nasolabial', 0.14))   # 法令纹
    # 眉（几何眉上再垫一层根影）
    brow_v = 0.565
    for s in (-1, 1):
        L(blob(U, V, 0.5 + s * 0.075, brow_v, 0.055, 0.017), np.array(spec.get('brow', (0.16, 0.12, 0.10))), 0.55)
    # 鼻
    L(blob(U, V, 0.5, 0.50, 0.017, 0.075), base * 1.10, 0.30)          # 鼻梁提亮
    L(blob(U, V, 0.5, 0.452, 0.026, 0.020), warm, 0.35)                # 鼻头血色
    for s in (-1, 1):
        L(blob(U, V, 0.5 + s * 0.026, 0.447, 0.012, 0.013), dark, 0.30)  # 鼻翼沟
        L(blob(U, V, 0.5 + s * 0.012, 0.437, 0.007, 0.008, 3), dark * 0.4, 0.6)  # 鼻孔
    # 唇（上唇深、下唇饱、口裂线）
    lip = np.array(spec.get('lip', (0.62, 0.36, 0.32)))
    L(blob(U, V, 0.5, 0.408, 0.042, 0.013), lip, 0.55)
    L(blob(U, V, 0.5, 0.386, 0.036, 0.014), lip * 1.12, 0.62)
    L(blob(U, V, 0.5, 0.397, 0.044, 0.0035, 3), dark * 0.5, 0.75)
    L(blob(U, V, 0.5, 0.428, 0.014, 0.010), base * 1.08, 0.4)         # 人中提亮
    # 颧骨微光 + 颊陷
    for s in (-1, 1):
        L(blob(U, V, 0.5 + s * 0.115, 0.47, 0.045, 0.035), base * 1.07, 0.22)
        L(blob(U, V, 0.5 + s * 0.125, 0.41, 0.038, 0.035), dark, spec.get('cheek_hollow', 0.10))
    # 下颌/颈影
    L(blob(U, V, 0.5, 0.30, 0.10, 0.045), dark, 0.18)
    # 额纹（老年）
    for k in range(spec.get('forehead_lines', 0)):
        lv = 0.62 + k * 0.022
        line = np.exp(-(((V - lv - 0.006 * np.sin((U - 0.5) * 9)) / 0.0032) ** 2)) * \
            np.exp(-(((U - 0.5) / 0.09) ** 2))
        L(line, dark, 0.30)
    # 胡茬（男性）：下面颊+颌带蓝灰噪声
    if spec.get('stubble', 0) > 0:
        sm = (blob(U, V, 0.5, 0.34, 0.11, 0.075) +
              blob(U, V, 0.42, 0.42, 0.05, 0.07) + blob(U, V, 0.58, 0.42, 0.05, 0.07))
        sm = np.clip(sm, 0, 1) * (fbm(rng, H, W, 80, 2) * 0.7 + 0.3)
        # 唇区不长胡茬的读法交给唇色覆盖
        L(sm, np.array((0.30, 0.28, 0.27)), 0.30 * spec['stubble'])
    # 老年斑
    for _ in range(spec.get('age_spots', 0)):
        su = 0.5 + (rng.random() - 0.5) * 0.42
        sv = 0.36 + rng.random() * 0.34
        L(blob(U, V, su, sv, 0.006 + rng.random() * 0.008, 0.005 + rng.random() * 0.007),
          np.array((0.38, 0.28, 0.20)), 0.35)
    # 耳区偏红
    for s in (-1, 1):
        L(blob(U, V, 0.5 + s * 0.25, 0.50, 0.045, 0.06), warm, 0.25)
    # 发际过渡（发根青影——贴图上先铺一层，几何发壳盖在外面）
    hl = spec.get('hairline_v', 0.70)
    hz = np.clip((V - hl) / 0.05, 0, 1) * (np.abs(U - 0.5) < 0.30)
    L(hz, np.array(spec.get('hair_rgb', (0.09, 0.08, 0.07))) + 0.05, 0.55)
    # 后脑整片发色（球面背面 u<0.25 / u>0.75）
    backm = np.clip((np.abs(U - 0.5) - 0.24) / 0.05, 0, 1) * (V > 0.40)
    L(backm, np.array(spec.get('hair_rgb', (0.09, 0.08, 0.07))) + 0.04, 0.60 * spec.get('back_hair', 1.0))

    # —— 主异常层 ——
    if spec.get('anomaly') == 'calcified_mouth':
        # 报数员：口部鱼籽状钙化——珍珠灰瘤粒环唇一圈，唇色被盖掉
        pearl = np.array((0.78, 0.76, 0.70))
        ring = np.clip(blob(U, V, 0.5, 0.398, 0.055, 0.028) - blob(U, V, 0.5, 0.398, 0.020, 0.008), 0, 1)
        gr = vnoise(rng, H, W, 160)
        nodules = np.clip((gr - 0.52) * 5, 0, 1) * ring
        L(ring, pearl * 0.82, 0.62)
        L(nodules, pearl * 1.05, 0.95)
        L(blob(U, V, 0.5, 0.397, 0.030, 0.004, 3), pearl * 0.7, 0.9)   # 口裂被封成一道灰缝
    elif spec.get('anomaly') == 'salt_frost':
        # 守夜镇民：盐霜沿右颊向颈爬——结晶白斑，边缘碎晶
        sf = blob(U, V, 0.640, 0.40, 0.055, 0.10, 1.6) + blob(U, V, 0.60, 0.30, 0.07, 0.06, 1.6)
        sf = np.clip(sf, 0, 1)
        cry = np.clip((vnoise(rng, H, W, 120) - 0.45) * 3, 0, 1)
        L(sf * (0.5 + cry * 0.5), np.array((0.88, 0.90, 0.90)), 0.75)
        L(np.clip(sf - 0.4, 0, 1) * cry, np.array((0.96, 0.97, 0.97)), 0.9)
    elif spec.get('anomaly') == 'drowned':
        # 湿客：整脸泡发青灰 + 尸斑沉积 + 皮下暗脉
        cold = np.array((0.45, 0.52, 0.53))
        canvas[:, :] = canvas * 0.35 + cold * 0.65
        liv = fbm(rng, H, W, 10, 3)
        L(np.clip((liv - 0.52) * 3, 0, 1), np.array((0.33, 0.30, 0.40)), 0.5)   # 青紫尸斑
        vein = fbm(rng, H, W, 26, 2)
        veinm = np.exp(-((np.abs(vein - 0.5) / 0.015) ** 2))
        L(veinm * 0.7, np.array((0.28, 0.33, 0.36)), 0.5)                        # 暗脉网
        L(blob(U, V, 0.5, 0.398, 0.062, 0.026), np.array((0.15, 0.17, 0.23)), 0.85)  # 唇发绀
        for s in (-1, 1):
            L(blob(U, V, 0.5 + s * eye_du, eye_v, 0.055, 0.055), np.array((0.30, 0.34, 0.38)), 0.5)

    return np.clip(canvas, 0, 1)


def make_eye_texture(name, iris_rgb=(0.32, 0.20, 0.12), filmed=0.0, seed=7):
    """64² 眼球贴图：UV 球默认展开，虹膜画在前极（v 顶部）。"""
    S = 64
    rng = rng_stream(seed)
    us = (np.arange(S) + 0.5) / S
    U, V = np.meshgrid(us, us)
    sclera = np.array((0.83, 0.80, 0.77))
    canvas = np.zeros((S, S, 3))
    canvas[:, :] = sclera
    # 眼球UV：极点在 v=1（我们把虹膜建到 -Y 前极，UV 由代码另行计算：v=前向角度）
    ang = (1 - V)  # 0=前极
    iris_r, pupil_r = 0.16, 0.066
    irm = np.clip((iris_r - ang) / 0.02, 0, 1)
    ir = np.array(iris_rgb)
    fib = vnoise(rng, S, S, 24) * 0.35 + 0.825
    for i in range(3):
        canvas[:, :, i] = canvas[:, :, i] * (1 - irm) + ir[i] * fib * irm
    # 限缘暗环
    rim = np.exp(-(((ang - iris_r) / 0.018) ** 2))
    canvas *= (1 - rim[:, :, None] * 0.55)
    pum = np.clip((pupil_r - ang) / 0.012, 0, 1)
    canvas *= (1 - pum[:, :, None] * 0.93)
    # 巩膜血丝 + 周边变暗
    red = vnoise(rng, S, S, 20)
    redm = np.clip((red - 0.62) * 3, 0, 1) * np.clip((ang - iris_r) / 0.2, 0, 1)
    tint(canvas, redm, np.array((0.62, 0.30, 0.26)), 0.4)
    canvas *= (1 - np.clip((ang - 0.42) / 0.5, 0, 0.5))[:, :, None]
    if filmed > 0:  # 湿客：整眼蒙白翳
        film = np.array((0.50, 0.55, 0.54))
        canvas = canvas * (1 - filmed) + film * filmed
    return np_to_image(name, np.clip(canvas, 0, 1))


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


# ============================= 头部 =============================

def sculpt_field(vs, center_dir, radius, amp, power=1.6, along=None):
    """单位球顶点场沉积：center_dir 附近 radius 角内沿法向(或 along)推 amp。"""
    c = Vector(center_dir).normalized()
    for v in vs:
        d = v.co.normalized()
        ang = math.acos(max(-1.0, min(1.0, d.dot(c))))
        if ang < radius:
            w = smoothstep(1 - ang / radius) ** power
            disp = (Vector(along) if along else d)
            v.co += disp * (amp * w)


def band_field(vs, z0, zr, amp, front_only=True, power=1.6):
    """纬度带场：z0 附近 zr 内沿法向推 amp（front_only 时仅前半球）。"""
    for v in vs:
        d = v.co.normalized()
        if front_only and d.y > -0.05:
            continue
        w = max(0.0, 1 - abs(d.z - z0) / zr)
        v.co += d * (amp * smoothstep(w) ** power)


def build_head(spec, seed, mats):
    """返回 head_obj（含耳），及眼球/眉/发帽等子件列表。全部在头局部空间：
    头中心为原点，单位=米。之后统一移动到颈顶。"""
    rng = rng_stream(seed + 13)
    g = spec.get('head', {})
    rx = g.get('rx', 0.076)   # 半宽
    ry = g.get('ry', 0.084)   # 半深
    rz = g.get('rz', 0.101)   # 半高
    bloat = g.get('bloat', 0.0)

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=28, radius=1.0)
    vs = list(bm.verts)

    # —— 单位球上的骨相沉积（顺序有意义）——
    # 颌部收窄成蛋形
    for v in vs:
        z = v.co.z
        if z < 0:
            s = smoothstep(min(1.0, -z / 0.95))
            v.co.x *= 1 - (0.19 - bloat * 0.14) * s
            v.co.y *= 1 - 0.06 * s
    # 颅顶略平 + 后脑饱满
    sculpt_field(vs, (0, 0.15, 1), 0.9, -0.05)
    sculpt_field(vs, (0, 0.75, 0.25), 0.8, 0.06)
    # 眉弓
    sculpt_field(vs, (0, -0.92, 0.30), 0.52, g.get('brow_amp', 0.045))
    # 眼窝（左右）
    for s in (-1, 1):
        sculpt_field(vs, (s * 0.40, -0.86, 0.16), 0.30, -g.get('socket_amp', 0.055))
    # 鼻：梁带 + 尖 + 翼
    sculpt_field(vs, (0, -1, 0.10), 0.20, 0.05, along=(0, -1, 0))
    sculpt_field(vs, (0, -1, -0.06), 0.15, g.get('nose_amp', 0.11), power=1.3, along=(0, -0.96, -0.28))
    for s in (-1, 1):
        sculpt_field(vs, (s * 0.14, -0.99, -0.10), 0.10, 0.035, along=(0, -1, 0))
    # 颧骨 / 颊陷
    for s in (-1, 1):
        sculpt_field(vs, (s * 0.72, -0.60, 0.02), 0.38, g.get('cheekbone', 0.028))
        sculpt_field(vs, (s * 0.80, -0.42, -0.28), 0.30, -g.get('hollow', 0.020) + bloat * 0.05)
    # 唇带：上唇/下唇/口裂
    sculpt_field(vs, (0, -1, -0.40), 0.16, 0.045, power=1.3, along=(0, -1, 0))
    sculpt_field(vs, (0, -1, -0.50), 0.14, 0.038, power=1.3, along=(0, -1, 0))
    mouth_open = g.get('mouth_open', 0.0)
    sculpt_field(vs, (0, -1, -0.45), 0.07, -0.030 - mouth_open * 0.05, power=1.2, along=(0, -1, 0))
    # 颏（下巴前凸）
    sculpt_field(vs, (0, -0.80, -0.60), 0.30, g.get('chin_amp', 0.05))
    # 颌角
    for s in (-1, 1):
        sculpt_field(vs, (s * 0.68, -0.30, -0.52), 0.26, 0.030)
    # 太阳穴微陷
    for s in (-1, 1):
        sculpt_field(vs, (s * 0.85, -0.30, 0.42), 0.30, -0.018)
    # 泡发（湿客）：整体外鼓
    if bloat > 0:
        for v in vs:
            d = v.co.normalized()
            if d.z < 0.3:
                v.co += d * (bloat * 0.05 * smoothstep((0.3 - d.z) / 1.2))
    # 不对称翘曲（普通人都是歪的）
    warp = g.get('asym', 0.010)
    for v in vs:
        v.co.x += warp * math.sin(v.co.z * 3.1 + 0.7) * (0.4 + 0.6 * abs(v.co.y))

    # —— 球面 UV（脸中线 u=0.5；处理经线接缝）——
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.material_index = 0
        us_face = []
        for lp in f.loops:
            d = lp.vert.co.normalized()
            lon = math.atan2(d.x, -d.y)
            u = 0.5 + lon / TAU
            v = 0.5 + math.asin(max(-1, min(1, d.z))) / math.pi
            lp[uv].uv = (u, v)
            us_face.append(u)
        if max(us_face) - min(us_face) > 0.5:  # 接缝面：低侧 +1
            for lp in f.loops:
                if lp[uv].uv[0] < 0.5:
                    lp[uv].uv = (lp[uv].uv[0] + 1.0, lp[uv].uv[1])

    # 缩放到真实头型
    for v in bm.verts:
        v.co = Vector((v.co.x * rx, v.co.y * ry, v.co.z * rz))

    # —— 耳（贴附椭球，同一网格）——
    for s in (-1, 1):
        ear = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1.0)
        eco = Vector((s * rx * 0.94, ry * 0.16, -rz * 0.06))
        for v in ear['verts']:
            v.co = Vector((v.co.x * 0.008, v.co.y * 0.016, v.co.z * 0.024))
            # 外缘略卷
            v.co += Vector((s * 0.004 * smoothstep(v.co.z / 0.03 + 0.5), 0, 0))
            v.co += eco
        for f in bm.faces:
            if f.material_index != 0:
                continue
        for v in ear['verts']:
            for f in v.link_faces:
                f.material_index = 0
                for lp in f.loops:
                    lp[uv].uv = (0.5 + s * 0.25, 0.50)  # 采耳区红color

    head = finish_mesh('Head', bm, [mats['skin']], subsurf=1)
    return head


def add_eyeball(name, side, spec, mats):
    """独立眼球（含球面UV：v=1-前向角/π 的近似——直接算）。"""
    g = spec.get('head', {})
    rx = g.get('rx', 0.076)
    ry = g.get('ry', 0.084)
    rz = g.get('rz', 0.101)
    r = 0.0129
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=r)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.material_index = 0
        for lp in f.loops:
            d = lp.vert.co.normalized()
            ang = math.acos(max(-1, min(1, d.dot(Vector((0, -1, 0))))))  # 0=前极
            lon = math.atan2(d.x, d.z)
            lp[uv].uv = (0.5 + lon / TAU, 1.0 - ang / math.pi)
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = new_object(name, me)
    obj.data.materials.append(mats['eye'])
    shade_smooth(obj)
    # 眼位：单位球 (±0.40,-0.86,0.16) 处、略沉
    pos = Vector((side * 0.40 * rx * 0.92, -0.86 * ry * 0.92, 0.16 * rz * 0.74))
    obj.location = pos
    lid = spec.get('head', {}).get('lid', 0.45)
    # 睑壳：包眼球的上/下皮盖（削出眼裂）
    bm2 = bmesh.new()
    bmesh.ops.create_uvsphere(bm2, u_segments=18, v_segments=12, radius=r * 1.08)
    kill = []
    for v in bm2.verts:
        d = v.co.normalized()
        openness = 1 - lid
        # 眼裂：前向 & |z| 小的区域挖空
        if d.y < -0.20 and abs(d.z) < 0.55 * openness + 0.16:
            kill.append(v)
    bmesh.ops.delete(bm2, geom=kill, context='VERTS')
    uv2 = bm2.loops.layers.uv.verify()
    for f in bm2.faces:
        f.material_index = 0
        for lp in f.loops:
            lp[uv2].uv = (0.5 + side * 0.076, 0.512)  # 采眼窝皮色
    me2 = bpy.data.meshes.new(name + '_lid')
    bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
    bm2.to_mesh(me2)
    bm2.free()
    lid_obj = new_object(name + '_lid', me2)
    lid_obj.data.materials.append(mats['skin'])
    shade_smooth(lid_obj)
    add_subsurf(lid_obj, 1)
    lid_obj.location = pos
    return obj, lid_obj


def add_brow(side, spec, mats):
    g = spec.get('head', {})
    rx, ry, rz = g.get('rx', 0.076), g.get('ry', 0.084), g.get('rz', 0.101)
    bm = bmesh.new()
    segs = 7
    pts = []
    for i in range(segs + 1):
        t = i / segs
        a = (0.16 + t * 0.42) * side  # 从眉头到眉梢的经度
        lon_dir = Vector((math.sin(a), -math.cos(a), 0))
        z = 0.30 + 0.06 * math.sin(t * math.pi) - t * t * 0.10 + g.get('brow_tilt', 0.0) * t * side * 0 
        d = Vector((lon_dir.x, lon_dir.y, z)).normalized()
        p = Vector((d.x * rx, d.y * ry, d.z * rz)) * 1.012
        pts.append(p)
    th = 0.0042
    rings = []
    for i, p in enumerate(pts):
        n = p.normalized()
        tdir = (pts[min(i + 1, segs)] - pts[max(i - 1, 0)]).normalized()
        up2 = n.cross(tdir).normalized()
        w = th * (0.75 + 0.5 * math.sin(min(1, i / segs) * math.pi))
        ring = [bm.verts.new(p + up2 * w + n * 0.0005), bm.verts.new(p - up2 * w + n * 0.0005),
                bm.verts.new(p - up2 * w * 0.4 + n * 0.0022), bm.verts.new(p + up2 * w * 0.4 + n * 0.0022)]
        rings.append(ring)
    for i in range(segs):
        r0, r1 = rings[i], rings[i + 1]
        for k in range(4):
            k2 = (k + 1) % 4
            bm.faces.new((r0[k], r0[k2], r1[k2], r1[k]))
    me = bpy.data.meshes.new('Brow')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = new_object('Brow', me)
    obj.data.materials.append(mats['brow'])
    shade_smooth(obj)
    return obj


def add_hair_cap(spec, mats, seed):
    """短发壳：头球副本裁出发区，沿法向抬 5mm + 噪声。"""
    g = spec.get('head', {})
    rx, ry, rz = g.get('rx', 0.076), g.get('ry', 0.084), g.get('rz', 0.101)
    rng = rng_stream(seed + 31)
    style = spec.get('hair', 'short')
    if style == 'none':
        return None
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=30, v_segments=22, radius=1.0)
    kill = []
    for v in bm.verts:
        d = v.co.normalized()
        lon = math.atan2(d.x, -d.y)  # 0=正前
        front = math.cos(lon)        # 1 前 → -1 后
        # 发际线：前高后低；鬓角沿耳前垂下
        hl = 0.52 * max(0.0, front) ** 1.5 + 0.10 - 0.42 * max(0.0, -front)
        sideburn = (abs(abs(lon) - TAU / 4) < 0.28) and d.z > -0.18
        if not (d.z > hl or sideburn):
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    lift = 0.032 if style == 'short' else 0.022
    for v in bm.verts:
        d = v.co.normalized()
        n = fbm_scalar(rng, v.co)
        v.co = Vector((d.x * rx, d.y * ry, d.z * rz)) + d * (lift * rz * (0.55 + 0.45 * n))
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.material_index = 0
        for lp in f.loops:
            lp[uv].uv = (0.1, 0.9)
    me = bpy.data.meshes.new('Hair')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = new_object('Hair', me)
    obj.data.materials.append(mats['hair'])
    shade_smooth(obj)
    add_subsurf(obj, 1)
    return obj


_fbm_cache = {}


def fbm_scalar(rng, co):
    """轻量逐点噪声（发壳蓬松用）。"""
    key = (round(co.x * 23), round(co.y * 23), round(co.z * 23))
    if key not in _fbm_cache:
        _fbm_cache[key] = rng.random()
    return _fbm_cache[key]


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
        if t > 0.90:
            w *= 1 - smoothstep((t - 0.90) / 0.10) * 0.22
        d = 0.070 * m['H'] / 1.72 * (1 + belly * math.sin(min(1, t / 0.55) * math.pi) * 0.5)
        d *= (0.96 + 0.22 * smoothstep(max(0, t - 0.5) / 0.5))  # 胸廓
        w *= 1 + bloat * 0.13
        d *= 1 + bloat * 0.22
        return w, d
    return prof


def build_clothed_torso(spec, m, mats, seed):
    """外衣即躯干表面（内里不建）：立式放样 + 下摆 + 领 + 扣/袋。"""
    rng = rng_stream(seed + 57)
    prof = torso_profile(spec, m)
    outfit = spec.get('outfit', 'zhongshan')
    pad = {'zhongshan': 0.016, 'waiter': 0.013, 'padded': 0.034, 'wet_padded': 0.030}[outfit]
    hem = {'zhongshan': m['hip'] - 0.10, 'waiter': m['hip'] - 0.04,
           'padded': m['hip'] - 0.16, 'wet_padded': m['hip'] - 0.14}[outfit]
    zs = []
    n_sec = 11
    for i in range(n_sec):
        zs.append(hem + (m['shoulder'] + 0.012 - hem) * (i / (n_sec - 1)))
    path, widths, depths, yoffs = [], [], [], []
    for z in zs:
        w, d = prof(max(z, m['hip'] - 0.02))
        flare = max(0.0, (m['hip'] - z) / 0.16) * 0.014  # 下摆散
        widths.append(w + pad + flare)
        depths.append(d + pad + flare * 0.7)
        yo = stoop_off(spec, m, z)
        path.append(Vector((0, 0, z)))
        yoffs.append(yo)
    quilt = outfit in ('padded', 'wet_padded')
    wrinkle = rng.random(64)
    def bulge(i, a):
        r = 1.0
        z = zs[i]
        if quilt:
            r *= 1 + 0.035 * math.sin(z * 52)          # 横向绗缝棱
        r *= 1 + 0.018 * (wrinkle[int(a / TAU * 16) % 16] - 0.5)  # 竖褶不匀
        return r
    bm = bmesh.new()
    tube(bm, path, widths, depths, ring_n=18, cap_start=True, cap_end=True,
         mat_index=0, bulge=bulge, y_off=yoffs)
    torso = finish_mesh('Torso', bm, [mats['coat']], subsurf=1)

    extras = []
    # —— 领 ——
    neck_r = 0.036 * m['H'] / 1.72
    zc = m['shoulder'] + 0.008
    yo = stoop_off(spec, m, zc)
    bm = bmesh.new()
    if outfit in ('zhongshan', 'waiter'):
        # 立领 + 翻领沿
        tube(bm, [Vector((0, yo, zc)), Vector((0, yo, zc + 0.022))],
             [neck_r + 0.005, neck_r + 0.0045], [neck_r + 0.005, neck_r + 0.0045], ring_n=14)
        tube(bm, [Vector((0, yo, zc + 0.022)), Vector((0, yo + 0.003, zc + 0.013))],
             [neck_r + 0.0045, neck_r + 0.012], [neck_r + 0.0045, neck_r + 0.012], ring_n=14)
    else:
        tube(bm, [Vector((0, yo, zc)), Vector((0, yo, zc + 0.018))],
             [neck_r + 0.004, neck_r + 0.006], [neck_r + 0.004, neck_r + 0.006], ring_n=14)
    collar = finish_mesh('Collar', bm, [mats['coat']], subsurf=1)
    extras.append(collar)

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
    # —— 中山装四袋 ——
    if outfit == 'zhongshan':
        for (px, pz, pw, ph) in [(-0.055, m['chest'] + 0.030, 0.052, 0.055), (0.055, m['chest'] + 0.030, 0.052, 0.055),
                                 (-0.075, m['waist'] - 0.020, 0.070, 0.080), (0.075, m['waist'] - 0.020, 0.070, 0.080)]:
            w, d = prof(max(pz, m['hip']))
            yo2 = stoop_off(spec, m, pz)
            bm = bmesh.new()
            r = bmesh.ops.create_cube(bm, size=1)
            for v in r['verts']:
                v.co = Vector((v.co.x * pw, v.co.y * 0.008, v.co.z * ph))
                v.co += Vector((px, -(d + pad) - 0.004 + yo2, pz))
            pk = finish_mesh('Pocket', bm, [mats['coat']], subsurf=1)
            extras.append(pk)
    return torso, extras


def build_arm(side, spec, m, mats, pose):
    """袖管沿臂折线放样；返回（袖obj, 腕位置Vector, 手朝向dict）。"""
    yo_sh = stoop_off(spec, m, m['shoulder'])
    sh = Vector((side * m['sw'], yo_sh, m['shoulder'] - 0.012))
    outfit = spec.get('outfit', 'zhongshan')
    pad = 0.011 if outfit in ('zhongshan', 'waiter') else 0.022
    bloat = spec.get('bloat', 0.0)
    upper_r = 0.040 * m['H'] / 1.72 * (1 + bloat * 0.2)
    fore_r = 0.031 * m['H'] / 1.72 * (1 + bloat * 0.25)
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
    else:  # sides：垂手贴缝
        el = sh + Vector((side * 0.012, 0.004, -0.148 * m['H']))
        wr = el + Vector((side * 0.004, -0.028, -0.150 * m['H']))
        hand = {'dir': Vector((0, -0.10, -1)).normalized(), 'palm': Vector((-side, -0.25, 0)).normalized()}
    mid_u = (sh + el) / 2 + Vector((side * 0.006, -0.004, 0))
    mid_f = (el + wr) / 2
    path = [sh, mid_u, el, mid_f, wr]
    rads = [upper_r + pad, upper_r * 0.95 + pad, fore_r + pad + 0.004, fore_r * 0.92 + pad, wrist_r + pad]
    bm = bmesh.new()
    tube(bm, path, rads, rads, ring_n=12, cap_start=True, cap_end=True, ref=Vector((0, -1, 0)))
    sleeve = finish_mesh('Sleeve' + ('L' if side < 0 else 'R'), bm, [mats['coat']], subsurf=1)
    return sleeve, wr, hand


def build_hand(side, wrist, hand_frame, spec, mats, curl=0.55, spread=0.0):
    """分指手：掌放样 + 四指三节 + 拇指。"""
    d = hand_frame['dir']
    palm_n = hand_frame['palm']
    sidev = d.cross(palm_n).normalized()
    bloat = spec.get('bloat', 0.0)
    S = (1 + bloat * 0.28) * spec.get('H', 1.72) / 1.72
    bm = bmesh.new()
    p0 = wrist
    p1 = wrist + d * 0.045 * S
    p2 = wrist + d * 0.092 * S
    tube(bm, [p0, p1, p2],
         [0.026 * S, 0.036 * S, 0.040 * S], [0.013 * S, 0.015 * S, 0.014 * S],
         ring_n=10, ref=palm_n, cap_start=True, cap_end=True)
    fl = [0.88, 1.0, 0.94, 0.74]
    for i in range(4):
        off = sidev * ((i - 1.5) * 0.019 * S)
        base = p2 + off + palm_n * 0.001
        L = 0.078 * fl[i] * S
        dir1 = (d + sidev * (spread * (i - 1.5) * 0.16)).normalized()
        seg1 = base + dir1 * (L * 0.4)
        dir2 = (dir1 - palm_n * curl * 0.9).normalized()
        seg2 = seg1 + dir2 * (L * 0.35)
        dir3 = (dir2 - palm_n * curl * 1.1).normalized()
        seg3 = seg2 + dir3 * (L * 0.25)
        r = 0.0085 * S
        tube(bm, [base, seg1, seg2, seg3],
             [r, r * 0.92, r * 0.82, r * 0.62], [r * 0.9, r * 0.85, r * 0.75, r * 0.55],
             ring_n=8, ref=palm_n, cap_start=True, cap_end=True)
    tb = p1 - sidev * 0.030 * S - palm_n * 0.004
    t1 = tb - sidev * 0.026 * S + d * 0.020 * S - palm_n * 0.012
    t2 = t1 - sidev * 0.014 * S + d * 0.026 * S - palm_n * 0.014 * curl
    r = 0.0095 * S
    tube(bm, [tb, t1, t2], [r, r * 0.85, r * 0.65], [r * 0.9, r * 0.8, r * 0.6],
         ring_n=8, ref=palm_n, cap_start=True, cap_end=True)
    hand = finish_mesh('Hand' + ('L' if side < 0 else 'R'), bm, [mats['skin_flat']], subsurf=1)
    return hand


def build_legs(spec, m, mats):
    outfit = spec.get('outfit', 'zhongshan')
    loose = 0.020 if outfit in ('padded', 'wet_padded') else 0.013
    bloat = spec.get('bloat', 0.0)
    objs = []
    for side in (-1, 1):
        hx = side * m['hipw'] * 0.52
        thigh_r = 0.058 * m['H'] / 1.72 * (1 + bloat * 0.15)
        calf_r = 0.043 * m['H'] / 1.72 * (1 + bloat * 0.2)
        ankle_r = 0.027 * m['H'] / 1.72 * (1 + bloat * 0.25)
        path = [Vector((hx, 0, m['hip'] + 0.04)),
                Vector((hx, -0.006, m['knee'] + 0.05)),
                Vector((hx, 0.004, m['knee'] - 0.03)),
                Vector((hx, -0.004, 0.10)),
                Vector((hx, -0.004, 0.078))]
        cuff = ankle_r + loose + 0.007
        rads = [thigh_r + loose, (thigh_r * 0.8 + calf_r * 0.2) + loose, calf_r + loose, cuff, cuff]
        bm = bmesh.new()
        wrk = np.random.default_rng(spec.get('seed', 1) + side).random(16)
        def bulge(i, a):
            return 1 + 0.02 * (wrk[int(a / TAU * 8) % 8] - 0.5) * i
        tube(bm, path, rads, rads, ring_n=12, cap_start=True, cap_end=True, bulge=bulge)
        objs.append(finish_mesh('Leg' + ('L' if side < 0 else 'R'), bm, [mats['trouser']], subsurf=1))
    return objs


def build_feet(spec, m, mats):
    """鞋（或湿客赤足）。放样沿 -Y。"""
    bare = spec.get('barefoot', False)
    mat = mats['skin_flat'] if bare else mats['shoe']
    bloat = spec.get('bloat', 0.0)
    S = (1 + (bloat * 0.3 if bare else 0)) * m['H'] / 1.72
    objs = []
    for side in (-1, 1):
        hx = side * m['hipw'] * 0.52
        zb = 0.058 * S
        path = [Vector((hx, 0.034 * S, zb * 1.12)),
                Vector((hx, 0.02, zb * 1.02)),
                Vector((hx, -0.06 * S, zb * 0.80)),
                Vector((hx, -0.12 * S, zb * 0.56)),
                Vector((hx, -0.152 * S, zb * 0.40))]
        w = [0.031 * S, 0.039 * S, 0.042 * S, 0.039 * S, 0.025 * S]
        dep = [0.034 * S, 0.036 * S, 0.030 * S, 0.022 * S, 0.013 * S]
        bm = bmesh.new()
        tube(bm, path, w, dep, ring_n=10, ref=Vector((0, 0, 1)), cap_start=True, cap_end=True)
        objs.append(finish_mesh('Foot' + ('L' if side < 0 else 'R'), bm, [mat], subsurf=1))
    return objs


def build_neck(spec, m, mats):
    r = 0.030 * m['H'] / 1.72 * (1 + spec.get('bloat', 0.0) * 0.3)
    z0 = m['shoulder'] - 0.01
    z1 = m['neck_top'] + 0.005
    yo0, yo1 = stoop_off(spec, m, z0), stoop_off(spec, m, z1)
    pitch = spec.get('head_pitch', 0.0)
    y_lean = -math.sin(pitch) * 0.02
    bm = bmesh.new()
    tube(bm, [Vector((0, yo0, z0)), Vector((0, (yo0 + yo1) / 2, (z0 + z1) / 2)), Vector((0, yo1 + y_lean, z1))],
         [r * 1.25, r, r * 0.96], [r * 1.15, r, r * 0.94], ring_n=12, cap_start=True, cap_end=True)
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

    face_img = np_to_image(name + '_face', make_face_texture(spec, seed))
    eye_img = make_eye_texture(name + '_eyetex', iris_rgb=spec.get('iris', (0.30, 0.19, 0.12)),
                               filmed=spec.get('eye_film', 0.0), seed=seed)
    skin_rgb = spec.get('skin', (0.72, 0.55, 0.44))
    wet = spec.get('outfit') == 'wet_padded'
    mats = {
        'skin': tex_mat(name + '_skin', face_img, rough=0.62 if wet else 0.72),
        'skin_flat': flat_mat(name + '_skinf',
                              tuple(min(1, c * (0.58 if wet else 0.94) + (0.03 if wet else 0)) for c in skin_rgb),
                              rough=0.55 if wet else 0.75),
        'eye': tex_mat(name + '_eye', eye_img, rough=0.34 if wet else 0.15),
        'hair': flat_mat(name + '_hair', spec.get('hair_rgb', (0.09, 0.08, 0.07)), rough=0.85),
        'brow': flat_mat(name + '_brow', spec.get('brow_rgb', tuple(c * 0.7 for c in spec.get('hair_rgb', (0.09, 0.08, 0.07)))), rough=0.9),
        'coat': flat_mat(name + '_coat', spec.get('coat_rgb', (0.30, 0.32, 0.34)),
                         rough=0.42 if wet else 0.88),
        'trouser': flat_mat(name + '_trouser', spec.get('trouser_rgb', (0.16, 0.17, 0.19)),
                            rough=0.5 if wet else 0.9),
        'shoe': flat_mat(name + '_shoe', spec.get('shoe_rgb', (0.06, 0.055, 0.05)), rough=0.45),
        'button': flat_mat(name + '_btn', (0.35, 0.33, 0.28), rough=0.4, metal=0.6),
        'band': flat_mat(name + '_bandm', (0.55, 0.08, 0.07), rough=0.75),
        'straw': flat_mat(name + '_straw', (0.55, 0.44, 0.26), rough=0.9),
        'tray': flat_mat(name + '_tray', (0.30, 0.20, 0.12), rough=0.55),
        'bowl': flat_mat(name + '_bowl', (0.85, 0.83, 0.78), rough=0.25),
        'kelp': flat_mat(name + '_kelp', (0.10, 0.14, 0.10), rough=0.5),
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
    slv_l, wr_l, hf_l = build_arm(-1, spec, m, mats, poseL)
    slv_r, wr_r, hf_r = build_arm(1, spec, m, mats, poseR)
    parts += [slv_l, slv_r]
    parts.append(build_hand(-1, wr_l, hf_l, spec, mats,
                            curl=spec.get('curl', 0.55), spread=spec.get('spread', 0.0)))
    parts.append(build_hand(1, wr_r, hf_r, spec, mats,
                            curl=spec.get('curl', 0.55), spread=spec.get('spread', 0.0)))

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
            L = 0.18 + rng.random() * 0.22
            bm = bmesh.new()
            pth = [Vector((x0 + math.sin(t * 4 + i) * 0.015, -0.045 - t * 0.02, z0 - L * t)) for t in np.linspace(0, 1, 4)]
            tube(bm, pth, [0.014, 0.012, 0.009, 0.004], [0.003, 0.003, 0.002, 0.001], ring_n=6,
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

    g = spec.get('head', {})
    rz = g.get('rz', 0.106)
    head_lift = rz * 0.55
    head_objs = [build_head(spec, seed, mats)]
    for s in (-1, 1):
        eye, lid = add_eyeball('Eye' + ('L' if s < 0 else 'R'), s, spec, mats)
        head_objs += [eye, lid]
        head_objs.append(add_brow(s, spec, mats))
    hair = add_hair_cap(spec, mats, seed)
    if hair:
        head_objs.append(hair)
    if spec.get('hat') == 'straw':
        hat = add_straw_hat(mats)
        hat.location = Vector((0, 0.010, rz * 0.72 - 0.018))
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

def assemble_seagod(spec):
    """塌祠里请出来的木胎神像：袍是剥落的朱漆，脸被手一天一天抹平。
    做法：放样袍身+交袖，球头削平脸，逐面材质散布「漆-露木」斑驳（免UV的风化读法）。"""
    seed = spec.get('seed', 7)
    rng = rng_stream(seed)
    name = spec['name']
    mats = {
        'lacquer': flat_mat(name + '_lacquer', (0.27, 0.055, 0.045), rough=0.6),
        'wood': flat_mat(name + '_wood', (0.21, 0.175, 0.14), rough=0.85),
        'woodface': flat_mat(name + '_woodface', (0.37, 0.305, 0.235), rough=0.55),
        'stone': flat_mat(name + '_stone', (0.21, 0.21, 0.22), rough=0.9),
        'gilt': flat_mat(name + '_gilt', (0.55, 0.42, 0.18), rough=0.45, metal=0.7),
        'ash': flat_mat(name + '_ash', (0.20, 0.19, 0.18), rough=0.95),
        'ember': flat_mat(name + '_ember', (0.9, 0.35, 0.12), rough=0.4),
    }
    root = bpy.data.objects.new(name + '_root', None)
    bpy.context.collection.objects.link(root)
    parts = []

    def weather(obj, ratio=0.45, cell=9.0):
        """逐面掉漆：以面心噪声把部分面换成露木材质。"""
        obj.data.materials.append(mats['wood'])
        for poly in obj.data.polygons:
            c = poly.center
            n = math.sin(c.x * cell * 7.1 + seed) + math.sin(c.z * cell + c.y * cell * 3.3 + seed * 2)
            if (n + 2) / 4 < ratio:
                poly.material_index = 1

    # 底座（石）
    bm = bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r['verts']:
        v.co = Vector((v.co.x * 0.56, v.co.y * 0.46, v.co.z * 0.26))
        v.co.z += 0.13
    parts.append(finish_mesh('Plinth', bm, [mats['stone']], subsurf=0))

    # 袍身放样（略前倾——像在听）
    prof = [(0.26, 0.205), (0.34, 0.19), (0.52, 0.148), (0.70, 0.125),
            (0.86, 0.135), (0.97, 0.142), (1.04, 0.085), (1.075, 0.055)]
    path = [Vector((0, -(z - 0.26) * 0.045, z)) for z, _ in prof]
    widths = [pr for _, pr in prof]
    depths = [pr * 0.82 for _, pr in prof]
    wr = rng.random(16)
    def bulge(i, a):
        # 竖向衣褶
        return 1 + 0.04 * math.sin(a * 7 + wr[i % 16] * 6) * min(1, (len(prof) - i) / 4)
    bm = bmesh.new()
    tube(bm, path, widths, depths, ring_n=18, cap_start=True, cap_end=True, bulge=bulge)
    robe = finish_mesh('Robe', bm, [mats['lacquer']], subsurf=1)
    weather(robe, 0.42)
    parts.append(robe)

    # 交袖（双手拢在袖里）
    for sgn in (-1, 1):
        sh = Vector((sgn * 0.135, -0.075, 0.94))
        mid = Vector((sgn * 0.10, -0.19, 0.78))
        end = Vector((-sgn * 0.03, -0.225, 0.66))
        bm = bmesh.new()
        tube(bm, [sh, mid, end], [0.052, 0.048, 0.042], [0.046, 0.042, 0.038],
             ring_n=12, cap_start=True, cap_end=True)
        slv = finish_mesh('Sleeve', bm, [mats['lacquer']], subsurf=1)
        weather(slv, 0.40)
        parts.append(slv)

    # 头（木胎）：脸削平 + 抹痕
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=18, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 0.072, v.co.y * 0.076, v.co.z * 0.092))
        # 无面：前脸推平成一块磨光的木板面，边缘留一点没抹净的起伏
        lim = -0.030 - 0.006 * math.sin(v.co.z * 60 + seed)
        if v.co.y < lim:
            v.co.y = lim + (v.co.y - lim) * 0.06
    me = bpy.data.meshes.new('GodHead')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    head = new_object('GodHead', me)
    head.data.materials.append(mats['woodface'])
    shade_smooth(head)
    add_subsurf(head, 1)
    head.location = Vector((0, -0.045, 1.155))
    # 抹平的脸是「woodface」，颅侧仍带漆
    head.data.materials.append(mats['lacquer'])
    for poly in head.data.polygons:
        if poly.center.y > 0.01:
            poly.material_index = 1
    parts.append(head)

    # 冕板 + 旒（垂珠简化为细柱）
    bm = bmesh.new()
    r = bmesh.ops.create_cube(bm, size=1)
    for v in r['verts']:
        v.co = Vector((v.co.x * 0.085, v.co.y * 0.13, v.co.z * 0.014))
        v.co += Vector((0, -0.045, 1.26))
    parts.append(finish_mesh('Crown', bm, [mats['gilt']], subsurf=0))
    for sgn in (-1, 1):
        for k in range(3):
            bm = bmesh.new()
            r = bmesh.ops.create_cube(bm, size=1)
            for v in r['verts']:
                v.co = Vector((v.co.x * 0.004, v.co.y * 0.004, v.co.z * 0.05))
                v.co += Vector((sgn * (0.02 + k * 0.025), -0.115, 1.19))
            parts.append(finish_mesh('Tassel', bm, [mats['gilt']], subsurf=0))

    # 香炉 + 三炷插着的香（一炷还没烧完——有人天天来）
    bm = bmesh.new()
    tube(bm, [Vector((0, -0.42, 0.0)), Vector((0, -0.42, 0.05)), Vector((0, -0.42, 0.10))],
         [0.055, 0.07, 0.058], [0.055, 0.07, 0.058], ring_n=12, cap_start=True, cap_end=True)
    parts.append(finish_mesh('Censer', bm, [mats['ash']], subsurf=1))
    for k in range(3):
        bm = bmesh.new()
        ang = (k - 1) * 0.16
        r = bmesh.ops.create_cube(bm, size=1)
        for v in r['verts']:
            v.co = Vector((v.co.x * 0.0035, v.co.y * 0.0035, v.co.z * 0.085))
            v.co = Matrix.Rotation(ang, 4, 'Y') @ v.co
            v.co += Vector(((k - 1) * 0.02, -0.42, 0.16))
        stick = finish_mesh('Incense', bm, [mats['ash'] if k != 1 else mats['ember']], subsurf=0)
        parts.append(stick)

    for o in parts:
        o.parent = root
    return root
