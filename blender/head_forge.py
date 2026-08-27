# 《返潮》头部锻造 v2（r7+）：高密网格 + 解剖位移场 + 贴图/几何单一地标源
#
# 设计（回应「椭圆头/扁鼻/壳发」驳回）：
#   · 头网格 112×84 UV 球（~18.6k tris），全部特征来自 HeadField 位移堆栈——
#     侧影必须直接读出：额坡→眉弓台阶→鼻根凹→鼻梁直脊→鼻尖→人中回收→
#     唇体积→颏唇沟→下巴前凸→下颌缘折角（gonion）→颈。
#   · LM 地标表是唯一事实源：几何场与 numpy 皮肤贴图共用 (lon, z) 坐标，
#     贴图特征永远落在几何特征上（uv_of() 推导 UV）。
#   · 眼：眼球沉进眶（眶缘由头网格塌陷成窝），睑壳贴着眼球球面包裹，
#     睑缘有翻边厚度，杏仁形眼裂带内外眦；禁止白珠贴面。
#   · 发：头皮壳（发际线噪声化）+ 每头 200+ 碎发卡（梳向场+重力+贴头约束），
#     鬓角/颈后碎发越过发际线，打掉「光滑头盔」剪影。
#   · 耳：参数化耳廓（轮匝 helix / 对耳轮 / 耳甲腔 / 耳垂 / 耳屏）。
# 坐标：单位球场空间，-Y 为脸前方，Z 上；lon = atan2(x, -y)（0=正前）。
import bpy
import bmesh
import math
import numpy as np
from mathutils import Vector

TAU = math.pi * 2

# ------------------------- 地标表（几何/贴图共用） -------------------------
LM = {
    'eye_lon': 0.44, 'eye_z': 0.115,          # 眼窝中心
    'brow_lon': 0.38, 'brow_z': 0.295,        # 眉弓双峰
    'nasion_z': 0.200,                        # 鼻根
    'tip_z': -0.055,                          # 鼻尖
    'alae_lon': 0.185, 'alae_z': -0.100,      # 鼻翼（r13 的 0.115 只有真人鼻宽一半→锥刺鼻）
    'nostril_lon': 0.095, 'nostril_z': -0.150,
    'philtrum_z': -0.235,
    'lip_up_z': -0.297, 'seam_z': -0.348, 'lip_dn_z': -0.402,
    'mouth_lon': 0.315,                       # 嘴角（口裂全宽 ~4.8cm）
    'sulcus_z': -0.472, 'chin_z': -0.575,
    'gonion_lon': 0.98, 'gonion_z': -0.30,    # 下颌角
    'cheek_lon': 0.62, 'cheek_z': 0.035,      # 颧骨
    'hollow_lon': 0.76, 'hollow_z': -0.20,    # 颊陷
    'ear_lon': 1.60, 'ear_z': -0.02,          # 耳中心
}


def uv_of(lon, z):
    """地标 → 球面展开 UV（脸中线 u=0.5）。贴图绘制唯一入口。"""
    return 0.5 + lon / TAU, 0.5 + math.asin(max(-1.0, min(1.0, z))) / math.pi


# ------------------------- numpy 基元 -------------------------

def _hash3(ix, iy, iz, seed):
    n = (ix * 374761393 + iy * 668265263 + iz * 1440662683 + seed * 974711) & 0x7fffffff
    n = ((n ^ (n >> 13)) * 1274126177) & 0x7fffffff
    return ((n ^ (n >> 16)) % 1048576) / 1048576.0


def vnoise3(p, seed=0):
    """(N,3) → (N,) 值噪声 [0,1]，三线性插值。"""
    pi = np.floor(p).astype(np.int64)
    pf = p - pi
    pf = pf * pf * (3 - 2 * pf)
    out = np.zeros(len(p))
    for dz in (0, 1):
        for dy in (0, 1):
            for dx in (0, 1):
                h = _hash3(pi[:, 0] + dx, pi[:, 1] + dy, pi[:, 2] + dz, seed)
                w = (pf[:, 0] if dx else 1 - pf[:, 0]) * \
                    (pf[:, 1] if dy else 1 - pf[:, 1]) * \
                    (pf[:, 2] if dz else 1 - pf[:, 2])
                out += h * w
    return out


def fbm3(p, seed=0, octaves=3, base=1.0):
    out = np.zeros(len(p))
    amp, tot, f = 1.0, 0.0, base
    for o in range(octaves):
        out += vnoise3(p * f, seed + o * 7) * amp
        tot += amp
        amp *= 0.5
        f *= 2.1
    return out / tot


def smooth(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


# ------------------------- HeadField：位移堆栈 -------------------------

class HeadField:
    """unit_pos(D)：单位方向 (N,3) → 单位空间位置；pos(D)：米制头局部位置。
    所有附着物（眉/发根/帽/钙化粒）都经 pos() 查询表面，保证贴合。"""

    def __init__(self, spec, seed):
        g = spec.get('head', {})
        self.g = g
        self.rx = g.get('rx', 0.078)
        self.ry = g.get('ry', 0.092)
        self.rz = g.get('rz', 0.105)
        self.seed = seed
        self.bloat = g.get('bloat', 0.0)
        self.age = g.get('age', 0.35)
        # 细节场整体幅度（泡胀角色的骨相被水肿吃掉一部分）
        self.damp = 1.0 - 0.38 * self.bloat
        self.mouth_open = g.get('mouth_open', 0.0)
        rng = np.random.default_rng(seed + 5)
        self.asym_phase = rng.random() * TAU
        self.asym = g.get('asym', 0.006)   # 0.010 在颊侧读成单边肿腮（r10 司仪）
        # 眼方向（附着计算用）
        el, ez = LM['eye_lon'], LM['eye_z']
        cl = math.sqrt(1 - ez * ez)
        self.eye_dirs = {s: Vector((math.sin(el) * cl * s, -math.cos(el) * cl, ez)) for s in (-1, 1)}

    # ---- 场堆栈本体 ----
    def unit_pos(self, D):
        g, dmp = self.g, self.damp
        x, y, z = D[:, 0], D[:, 1], D[:, 2]
        lon = np.arctan2(x, -y)
        al = np.abs(lon)
        front = np.clip(np.cos(lon), 0, 1)
        P = D.copy()

        def G(t, s):
            return np.exp(-(t / s) ** 2)

        def g2(l0, z0, sl, sz, mirror=True):
            m = G(lon - l0, sl) * G(z - z0, sz)
            if mirror and l0 != 0:
                m = m + G(lon + l0, sl) * G(z - z0, sz)
            return m

        def push_y(m, amp):  # -Y 为前：amp>0 = 前凸
            P[:, 1] -= m * amp

        def push_r(m, amp):
            P[:, :] += D * (m * amp)[:, None]

        k_brow = g.get('brow_k', 1.0) * dmp
        k_nose = g.get('nose_k', 1.0) * dmp
        k_lip = g.get('lip_k', 1.0)
        k_chin = g.get('chin_k', 1.0) * dmp
        k_cheek = g.get('cheek_k', 1.0) * dmp
        hollow = g.get('hollow', 0.020) * dmp
        k_jaw = g.get('jaw_k', 1.0)

        # ---------- 1 颅型 ----------
        back = np.clip(-np.cos(lon), 0, 1)
        push_r(back * G(z - 0.10, 0.40), 0.055)                    # 枕后饱满
        push_r(g2(1.26, 0.36, 0.30, 0.26), -0.030)                 # 颞侧收平（太阳穴是平面不是球面）
        push_r(g2(1.95, 0.42, 0.55, 0.30), 0.020)                  # 顶结节（颅侧最宽点在耳后上方）
        push_r(g2(0.90, 0.74, 0.42, 0.22), -0.016)                 # 额侧上收（颅前部略窄于顶宽）
        push_y(g2(0.30, 0.50, 0.30, 0.16), 0.016)                  # 额结节双丘
        P[:, 1] += np.clip(z - 0.36, 0, None) * front * 0.20       # 额向后斜（不是蛋壳正圆）
        P[:, 2] -= np.clip(z - 0.64, 0, None) * 0.07               # 颅顶略平

        # ---------- 2 面平面 ----------
        fm = front ** 1.15 * G(z + 0.08, 0.54) * (y < 0)
        P[:, 1] += (-y) * 0.085 * fm                               # 前脸压平（脸不是球面）
        push_r(g2(1.02, -0.16, 0.30, 0.22), -0.016)                # 颊侧平面（颧下到颌角上方收平）

        # ---------- 3 下颌 ----------
        s = smooth(np.clip(-z, 0, 1) / 1.05)
        P[:, 0] *= 1 - (0.150 - self.bloat * 0.09) * s             # 颌区侧向收窄（缓锥，不掐花生腰）
        P[:, 1] *= 1 - 0.040 * s
        alc = np.minimum(al, 1.35)
        jz = LM['chin_z'] - 0.03 + 0.37 * smooth(alc / 1.10) ** 1.25   # 下颌缘曲线：颏→耳下
        below = np.clip(jz - z, 0, None)
        npull = smooth(below / 0.26) * smooth(np.clip((1.75 - al) / 0.45, 0, 1))  # 耳侧平滑淡出（布尔截断=颊上硬折痕）
        P[:, 0] *= 1 - 0.18 * npull * k_jaw
        P[:, 1] = np.where(y < 0, P[:, 1] * (1 - 0.15 * npull * k_jaw), P[:, 1])
        # 颌底压平：下颌缘以下的球底向上抬成下颌底平面（否则侧影是垂囊）
        P[:, 2] += below * 0.62 * np.clip(front * 0.55 + 0.62, 0, 1) * smooth(below / 0.10)
        # 颌下颈锥：下颌缘以下整圈向颈轴收拢——头底不再是挂在领口上的垂球
        deep = smooth(below / 0.22)
        P[:, 0] *= 1 - 0.26 * deep
        P[:, 1] = np.where(y < 0, P[:, 1] * (1 - 0.22 * deep), P[:, 1] * (1 - 0.15 * deep))
        # 前下面部宽度锥收：从颧下向颏收窄前半脸（否则窄吻柱两侧的颊壁读成肿袋）
        P[:, 0] *= 1 - 0.10 * smooth(np.clip(-0.05 - z, 0, 1) / 0.55) * front * (1 - deep * 0.5)
        push_r(G(z - jz, 0.070) * smooth(np.clip((1.42 - al) / 0.30, 0, 1)) * front ** 0.3,
               0.014 * k_jaw)                                      # 下颌缘棱线
        push_r(g2(LM['gonion_lon'], LM['gonion_z'], 0.22, 0.13), 0.020 * k_jaw)  # 下颌角
        push_r(g2(0.92, -0.24, 0.18, 0.14), 0.007 * k_jaw)         # 咬肌体量（颌角上方）
        # 颏：前凸台 + 侧收（颏是方的不是溜的）
        push_y(g2(0, LM['chin_z'], 0.21, 0.095, False), 0.094 * k_chin)
        push_y(g2(0.14, LM['chin_z'] + 0.01, 0.10, 0.09), 0.018 * k_chin)   # 颏结节双点
        push_y(g2(0, LM['sulcus_z'], 0.16, 0.040, False), -0.034)  # 颏唇沟
        # 老年下颌松弛（jowl）
        push_r(g2(0.55, -0.50, 0.17, 0.10), 0.011 * self.age)

        # ---------- 4 眉弓（台阶读法：眉上平坡、眉峰前凸、眉下急收进眶） ----------
        bl = LM['brow_lon']
        bipeak = G(lon - bl, 0.32) + G(lon + bl, 0.32) + 0.50 * G(lon, 0.22)
        push_y(bipeak * G(z - LM['brow_z'], 0.062), 0.062 * k_brow)
        push_y(bipeak * G(z - LM['brow_z'] - 0.06, 0.05), 0.022 * k_brow)   # 眉上缓坡（不是孤立香肠棱）
        push_y(g2(0.44, 0.225, 0.30, 0.042), -0.020)               # 眉下急收（眶顶阴影带）
        push_y(G(lon, 0.15) * G(z - LM['nasion_z'], 0.048), -0.052)  # 鼻根深凹（侧影的第一个台阶）

        # ---------- 5 眶窝 ----------
        for sgn in (-1, 1):
            E = np.array(self.eye_dirs[sgn])
            ang = np.arccos(np.clip(D @ E, -1, 1))
            push_r(-0.062 * G(ang, 0.225) ** 1.35 * dmp * g.get('socket_k', 1.0), 1.0)
            # 眶下缘（颧突上沿）
            push_r(G(ang - 0.285, 0.07) * G(z - (LM['eye_z'] - 0.16), 0.09), 0.013)
        push_y(g2(0.20, 0.085, 0.075, 0.075), -0.022)              # 内眦泪槽加深
        # 眼袋（年长者）
        push_y(g2(0.42, -0.045, 0.12, 0.045), 0.012 * self.age + 0.02 * self.bloat)

        # ---------- 6 鼻 ----------
        nz, tz = LM['nasion_z'], LM['tip_z']
        t = np.clip((nz - z) / (nz - tz), 0, 1)
        wz = smooth((z - (tz - 0.035)) / 0.05) * smooth((nz + 0.03 - z) / 0.07)
        push_y(G(lon, 0.100 - 0.022 * t) * wz * (0.024 + 0.062 * t), k_nose)   # 鼻梁直脊（窄脊，非整脸隆坡）
        push_y(g2(0.19, 0.06, 0.075, 0.10), -0.024)                # 梁侧壁凹（鼻梁要从脸里「立起来」）
        push_y(g2(0, tz, 0.100, 0.052, False), 0.084 * k_nose)     # 鼻尖球（紧凑，不是锥刺）
        push_y(g2(0, tz + 0.048, 0.080, 0.028, False), -0.015)     # supratip 微断（尖与梁分界）
        P[:, 2] -= g2(0, tz - 0.005, 0.06, 0.045, False) * 0.016   # 尖微垂
        push_y(g2(0, -0.112, 0.045, 0.032, False), 0.038 * k_nose)  # 鼻小柱
        push_y(g2(0, -0.178, 0.075, 0.028, False), -0.020)         # 鼻底回收（subnasale 台阶）
        push_y(g2(LM['alae_lon'], LM['alae_z'], 0.070, 0.042), 0.078 * k_nose)  # 鼻翼球
        push_y(g2(0.245, -0.092, 0.030, 0.050), -0.026)            # 鼻翼沟（翼与颊分界）
        push_y(g2(LM['nostril_lon'], LM['nostril_z'], 0.036, 0.018), -0.052)   # 鼻孔（几何凹）

        # ---------- 7 人中/唇 ----------
        push_y(g2(0, LM['philtrum_z'], 0.060, 0.062, False), 0.022)
        push_y(g2(0, LM['philtrum_z'] + 0.005, 0.018, 0.050, False), -0.014)   # 人中沟
        push_y(G(lon, 0.36) * G(z + 0.35, 0.105), 0.024)           # 口轮匝肌基座（唇丘）
        cup = g2(0.065, LM['lip_up_z'], 0.105, 0.038) + 0.55 * G(lon, 0.055) * G(z - (LM['lip_up_z'] + 0.006), 0.040)
        push_y(cup, 0.040 * k_lip)                                 # 上唇（丘比特弓双峰）
        push_y(g2(0.07, LM['lip_dn_z'], 0.11, 0.046), 0.044 * k_lip)  # 下唇
        push_y(g2(0, LM['lip_dn_z'] - 0.004, 0.020, 0.030, False), -0.008)     # 下唇中缝微凹
        mo = self.mouth_open
        push_y(G(lon, 0.22) * G(z - LM['seam_z'], 0.014), -(0.046 + 0.03 * mo))  # 口裂缝（锐）
        push_y(g2(LM['mouth_lon'], -0.352, 0.045, 0.035), -0.020)  # 嘴角回收
        push_r(g2(LM['mouth_lon'], -0.352, 0.05, 0.04), -0.006)
        if mo > 0:  # 溺亡者微张的下颌
            m = G(lon, 0.26) * G(z + 0.44, 0.11)
            P[:, 2] -= m * 0.055 * mo
            push_y(m * mo, -0.018)

        # ---------- 8 颧/颊 ----------
        push_r(g2(LM['cheek_lon'], LM['cheek_z'], 0.26, 0.13), 0.040 * k_cheek)   # 颧体
        for i in range(4):                                          # 颧弓棱：颧体→耳屏的一道骨桥
            tt = i / 3
            push_r(g2(0.72 + 0.52 * tt, 0.030 - 0.035 * tt, 0.16, 0.075), 0.014 * k_cheek * (1 - tt * 0.35))
        push_r(g2(1.10, 0.30, 0.24, 0.16), -0.016)                 # 颧弓上方颞窝
        push_r(g2(LM['hollow_lon'], LM['hollow_z'], 0.24, 0.14), -hollow)
        for i in range(5):                                          # 法令沟（线状）
            tt = i / 4
            push_y(g2(0.20 + 0.14 * tt, -0.11 - 0.21 * tt, 0.024, 0.030), -0.010 * g.get('naso_k', 1.0))

        # ---------- 9 泡胀（湿客） ----------
        if self.bloat > 0:
            push_r(G(z + 0.25, 0.60), 0.055 * self.bloat)
            for sgn in (-1, 1):                                     # 睑肿成缝
                E = np.array(self.eye_dirs[sgn])
                ang = np.arccos(np.clip(D @ E, -1, 1))
                push_r(G(ang, 0.16), 0.030 * self.bloat)

        # ---------- 10 不对称 + 皮肤微形 ----------
        # 眼区豁免：不对称横移若扫过眶窝，眼球/睑壳（对称摆放）就会单边错位成「歪眼」
        eye_guard = np.ones(len(D))
        for sgn in (-1, 1):
            E = np.array(self.eye_dirs[sgn])
            ang_e = np.arccos(np.clip(D @ E, -1, 1))
            eye_guard *= 1 - np.exp(-(ang_e / 0.30) ** 2)
        P[:, 0] += self.asym * np.sin(z * 3.1 + self.asym_phase) * (0.4 + 0.6 * np.abs(y)) * eye_guard
        mid = fbm3(D * 5.0, self.seed + 11, octaves=2) - 0.5
        fine = vnoise3(D * 16.0, self.seed + 23) - 0.5
        micro = (0.005 + 0.004 * self.age) * mid + 0.0025 * fine
        P[:, :] += D * micro[:, None]
        return P

    def pos(self, D):
        """(N,3) 或 Vector → 头局部米制表面位置。"""
        one = False
        if not isinstance(D, np.ndarray):
            D = np.array([list(D)], dtype=float)
            one = True
        D = D / np.linalg.norm(D, axis=1, keepdims=True)
        P = self.unit_pos(D) * np.array([self.rx, self.ry, self.rz])
        return Vector(P[0]) if one else P

    def normal(self, d, eps=0.02):
        """表面法向（数值差分）。d: Vector。"""
        d = Vector(d).normalized()
        t1 = d.cross(Vector((0, 0, 1)))
        if t1.length < 1e-4:
            t1 = d.cross(Vector((0, -1, 0)))
        t1.normalize()
        t2 = d.cross(t1)
        p0 = self.pos(d)
        pa = self.pos((d + t1 * eps).normalized())
        pb = self.pos((d + t2 * eps).normalized())
        n = (pa - p0).cross(pb - p0)
        n.normalize()
        if n.dot(d) < 0:
            n = -n
        return n


# ------------------------- 头网格 -------------------------

def _new_obj(name, me, mats):
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    for m in mats:
        obj.data.materials.append(m)
    sm = [True] * len(me.polygons)
    me.polygons.foreach_set('use_smooth', sm)
    return obj


def build_head_mesh(field, mats, useg=112, vseg=84):
    """高密头网格：UV 球拓扑 + HeadField 位移；UV 用原始方向（贴图对齐）。"""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=useg, v_segments=vseg, radius=1.0)
    vs = list(bm.verts)
    D = np.array([v.co[:] for v in vs])
    D /= np.linalg.norm(D, axis=1, keepdims=True)
    # 先算 UV 参数（位移前的方向）
    lon = np.arctan2(D[:, 0], -D[:, 1])
    uvu = 0.5 + lon / TAU
    uvv = 0.5 + np.arcsin(np.clip(D[:, 2], -1, 1)) / math.pi
    uv_map = {}
    for v, uu, vv in zip(vs, uvu, uvv):
        uv_map[v] = (uu, vv)
    P = field.unit_pos(D) * np.array([field.rx, field.ry, field.rz])
    for v, p in zip(vs, P):
        v.co = Vector(p)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.material_index = 0
        us_face = [uv_map[lp.vert][0] for lp in f.loops]
        seam = max(us_face) - min(us_face) > 0.5
        for lp in f.loops:
            uu, vv = uv_map[lp.vert]
            if seam and uu < 0.5:
                uu += 1.0
            lp[uvl].uv = (uu, vv)
    me = bpy.data.meshes.new('Head')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return _new_obj('Head', me, [mats['skin']])


# ------------------------- 眼球 + 睑 -------------------------

EYE_R = 0.0122


def eye_anchor(field, sgn):
    """眼球中心：眶面往里退，球从眼裂里探出来。"""
    d = field.eye_dirs[sgn]
    surf = field.pos(d)
    return surf + Vector(d) * (-EYE_R * 0.38) + Vector((0, 0.0015, 0))


def gaze_dir(sgn):
    """视轴：正前方微内聚微垂——不跟随眶向（否则外斜视）。"""
    return Vector((-sgn * 0.045, -1.0, -0.02)).normalized()


def build_eyeball(field, sgn, mats):
    c = eye_anchor(field, sgn)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=18, radius=EYE_R)
    fwd = gaze_dir(sgn)
    for v in bm.verts:  # 角膜隆起
        d = v.co.normalized()
        ca = math.acos(max(-1, min(1, d.dot(fwd))))
        if ca < 0.42:
            v.co += d * (EYE_R * 0.10 * (1 - ca / 0.42) ** 1.5)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.material_index = 0
        for lp in f.loops:
            d = lp.vert.co.normalized()
            ang = math.acos(max(-1, min(1, d.dot(fwd))))
            lon2 = math.atan2(d.x, d.z)
            lp[uvl].uv = (0.5 + lon2 / TAU, 1.0 - ang / math.pi)
    me = bpy.data.meshes.new('Eye')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = _new_obj('Eye' + ('L' if sgn < 0 else 'R'), me, [mats['eye']])
    obj.location = c
    return obj


def build_lids(field, sgn, mats):
    """参数化睑壳：上/下睑各是一张贴着眼球球面的曲面片，
    眼裂边缘落在光滑杏仁曲线上（无锯齿），睑缘第一排内收出厚度并用深色睑线材质
    （远看=睫毛线），上睑带睑板褶；外侧行逐渐吸附回头面——壳与眶窝无缝合一，
    杜绝「贴脸护目镜」。两片在内外眦相接，内眦处加泪阜。"""
    g = field.g
    lidc = g.get('lid', 0.42)            # 0=大睁 1=闭
    tilt = g.get('canthal_tilt', 0.10)   # 外眦上挑
    c = eye_anchor(field, sgn)
    fwd = Vector(field.eye_dirs[sgn])
    up = Vector((0, 0, 1))
    sidev = fwd.cross(up).normalized() * sgn   # 指向外眦
    up2 = sidev.cross(fwd).normalized()

    phi_max = 0.93                        # 眼裂横向半开角（两眦收进皮里，不露黑缝）
    open_up = (1 - lidc) * 0.42 + 0.10    # 上睑提起角
    open_dn = (1 - lidc) * 0.15 + 0.055   # 下睑下垂角
    n_u, n_v = 26, 8

    def on_sphere(phi, psi, r):
        d = (fwd + sidev * math.tan(phi) + up2 * math.tan(psi)).normalized()
        return d * r

    bm = bmesh.new()
    lid_faces = []
    for which, opn, ext in ((1, open_up, 0.62), (-1, open_dn, 0.46)):
        grid = []
        for i in range(n_u + 1):
            t = i / n_u
            phi = -phi_max + 2 * phi_max * t
            shape = max(0.0, 1 - (phi / phi_max) ** 2) ** 0.72
            psi_edge = which * opn * shape + tilt * phi * 0.5 * (0.8 if which > 0 else 1.0)
            row = []
            for j in range(n_v + 1):
                s = j / n_v
                psi = psi_edge + which * ext * (s ** 1.15)
                # 半径：睑缘贴球（含缘厚翻边），向外逐渐加皮厚
                if j == 0:
                    r = EYE_R * 1.010
                elif j == 1:
                    r = EYE_R * 1.035
                else:
                    r = EYE_R * (1.035 + 0.10 * ((j - 1) / (n_v - 1)) ** 1.3)
                # 上睑板褶：中段外鼓 + 睑板上缘折痕（双眼皮沟）
                if which > 0 and 2 <= j <= n_v - 1:
                    r += EYE_R * 0.05 * math.sin((j - 1.2) / (n_v - 1) * math.pi) * shape
                    if j == n_v - 2:
                        r -= EYE_R * 0.035 * shape   # 睑褶沟
                p = on_sphere(phi, psi, r)
                # 外侧行吸附回头面：j 从 n_v-2 起与眶面混合（壳长进皮里）
                if j >= n_v - 2:
                    wq = (j - (n_v - 2)) / 2.0
                    dw = Vector(c + p)
                    if dw.length > 1e-6:
                        surf = field.pos(dw.normalized()) + field.normal(dw.normalized()) * 0.0006
                        p = p.lerp(surf - c, 0.45 + 0.55 * wq)
                row.append(p)
            grid.append(row)
        vrows = [[bm.verts.new(p) for p in row] for row in grid]
        for i in range(n_u):
            for j in range(n_v):
                a, b = vrows[i][j], vrows[i][j + 1]
                c2, d2 = vrows[i + 1][j + 1], vrows[i + 1][j]
                try:
                    f = bm.faces.new((a, b, c2, d2) if which > 0 else (d2, c2, b, a))
                    lid_faces.append((f, j))
                except ValueError:
                    pass
    uvl = bm.loops.layers.uv.verify()
    uu, vv = uv_of(LM['eye_lon'] * sgn, LM['eye_z'])
    for fce, j in lid_faces:
        fce.material_index = 1 if j == 0 else 0   # 睑缘第一环 = 睑线（睫毛读法）
        for lp in fce.loops:
            d = lp.vert.co.normalized()
            lp[uvl].uv = (uu + d.dot(sidev) * 0.012 * sgn, vv + d.dot(up2) * 0.012)
    # 泪阜：内眦里的一粒淡红小丘
    inner = on_sphere(-phi_max - 0.045, -0.01, EYE_R * 1.005)
    ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=EYE_R * 0.14)
    for v in ret['verts']:
        v.co = Vector((v.co.x, v.co.y * 0.7, v.co.z * 0.8)) + inner
        for lp2 in v.link_loops:
            lp2[uvl].uv = (uu, vv)
    for f in bm.faces:
        if f.material_index not in (0, 1):
            f.material_index = 2
    # icosphere 面默认 material_index=0，改成泪阜材质
    for v in ret['verts']:
        for f in v.link_faces:
            f.material_index = 2
    me = bpy.data.meshes.new('Lid')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = _new_obj('Lid' + ('L' if sgn < 0 else 'R'), me, [mats['skin'], mats['lidline'], mats['caruncle']])
    obj.location = c
    return obj


# ------------------------- 眉：羽状簇 -------------------------

def build_brow(field, sgn, mats):
    """沿眉弓的碎毛簇（不是一根漂浮胶条）。"""
    rng = np.random.default_rng(field.seed + 41 + sgn)
    bm = bmesh.new()
    n = 22
    for i in range(n + 1):
        t = i / n
        lon = sgn * (0.14 + t * 0.55)
        zz = LM['brow_z'] - 0.045 + 0.10 * math.sin(t * math.pi) ** 0.8 - t * t * 0.10
        cl = math.sqrt(max(0.0, 1 - zz * zz))
        d = Vector((math.sin(lon) * cl, -math.cos(lon) * cl, zz)).normalized()
        p = field.pos(d) + field.normal(d) * 0.0008
        nrm = field.normal(d)
        # 毛流：眉头向上、眉身向外、眉梢向外下
        flow = (Vector((sgn * (0.35 + t * 0.75), -0.15, 0.55 - t * 1.05)).normalized())
        flow = (flow - nrm * flow.dot(nrm)).normalized()
        side = flow.cross(nrm).normalized()
        L = 0.0060 * (0.7 + 0.6 * math.sin(t * math.pi) ** 0.7)
        w = 0.0007 + 0.0005 * math.sin(t * math.pi)
        for k in range(4):  # 每站 4 根小簇（叠瓦覆盖，不露皮）
            j = (rng.random() - 0.5)
            q0 = p + side * (j * 0.005) + nrm * 0.0002
            fl = (flow + side * (rng.random() - 0.5) * 0.5 + nrm * 0.15).normalized()
            q1 = q0 + fl * L * 0.6 + nrm * 0.0008
            q2 = q1 + fl * L * 0.4 - nrm * 0.0002
            a = bm.verts.new(q0 - side * w)
            b = bm.verts.new(q0 + side * w)
            c2 = bm.verts.new(q1 + side * w * 0.7)
            d2 = bm.verts.new(q1 - side * w * 0.7)
            e2 = bm.verts.new(q2 + side * w * 0.2)
            f2 = bm.verts.new(q2 - side * w * 0.2)
            bm.faces.new((a, b, c2, d2))
            bm.faces.new((d2, c2, e2, f2))
    me = bpy.data.meshes.new('Brow')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = _new_obj('Brow' + ('L' if sgn < 0 else 'R'), me, [mats['brow']])
    obj.data.materials[0].use_backface_culling = False
    return obj


# ------------------------- 头发：头皮壳 + 碎发卡 -------------------------

def _hairline_z(lon, style):
    """发际线高度（单位球 z）随经度；style 微调。"""
    front = math.cos(lon)
    if style == 'slick':   # 侍应油头：发际线更高更整齐
        return 0.46 * max(0.0, front) ** 1.4 + 0.16 - 0.46 * max(0.0, -front)
    return 0.42 * max(0.0, front) ** 1.5 + 0.10 - 0.50 * max(0.0, -front)


def _shell_lift_arr(field, D, style):
    """发壳厚度场（壳/卡同源）：底厚 + 绺团噪声起伏 + 顺梳向的条状沟壑。
    D: (N,3) 单位方向。返回 (N,) 米制 lift（发际线以下平滑降为负=沉入头内）。"""
    sd = field.seed
    lift = 0.0026 if style == 'slick' else 0.0038
    clump = vnoise3(D * 9.0, sd + 77)
    # 顺梳向条状沟壑：对短发≈经度向条纹（发丝束的走向感），中频+高频两层
    strand = vnoise3(np.stack([D[:, 0] * 26.0, D[:, 1] * 26.0, D[:, 2] * 5.0], axis=1), sd + 78)
    fine = vnoise3(np.stack([D[:, 0] * 60.0, D[:, 1] * 60.0, D[:, 2] * 9.0], axis=1), sd + 79)
    lon = np.arctan2(D[:, 0], -D[:, 1])
    hl = np.array([_hairline_z(l, style) for l in lon])
    hl = hl + 0.009 * np.sin(lon * 7 + sd) + 0.005 * np.sin(lon * 13 + sd * 2)
    t = np.clip((D[:, 2] - hl + 0.02) / 0.09, 0, 1)
    t = t * t * (3 - 2 * t)
    amp = 1.0 if style != 'slick' else 0.45
    lf = (lift * (0.50 + 1.05 * clump) + 0.0016 * (strand - 0.5) * 2 * amp +
          0.0008 * (fine - 0.5) * 2 * amp + 0.002)
    return -0.002 + lf * t


def _shell_lift_one(field, d, style):
    return float(_shell_lift_arr(field, np.array([list(d)]), style)[0])


def build_scalp(field, spec, mats):
    """打底头皮壳：发际线噪声化、绺团+发束条纹起伏——壳本身的剪影就得是毛的，
    发卡在壳上再加碎口。"""
    style = spec.get('hair', 'short')
    if style == 'none':
        return None
    sd = field.seed
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=88, v_segments=64, radius=1.0)

    def hl_at(lon):  # 平滑起伏的发际线（不出锯齿；起伏过深会在缺口处剩下孤立发卡「陶片」）
        return _hairline_z(lon, style) + 0.009 * math.sin(lon * 7 + sd) + 0.005 * math.sin(lon * 13 + sd * 2)

    # 只裁掉远低于发区的顶点；发际线交线交给「沉入头内」的连续 lift 过渡（无锯齿）
    kill = []
    for v in bm.verts:
        d = v.co.normalized()
        lon = math.atan2(d.x, -d.y)
        sideburn = (abs(abs(lon) - TAU / 4) < 0.22) and d.z > -0.12
        if not (d.z > hl_at(lon) - 0.14 or sideburn):
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    D = np.array([v.co[:] for v in bm.verts])
    if len(D) == 0:
        bm.free()
        return None
    D /= np.linalg.norm(D, axis=1, keepdims=True)
    base = field.unit_pos(D) * np.array([field.rx, field.ry, field.rz])
    lifts = _shell_lift_arr(field, D, style)
    for v, p, d, lf in zip(bm.verts, base, D, lifts):
        v.co = Vector(p) + Vector(d) * float(lf)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        f.material_index = 0
        for lp in f.loops:
            lp[uvl].uv = (0.1, 0.9)
    me = bpy.data.meshes.new('Scalp')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return _new_obj('Scalp', me, [mats.get('hair_dk', mats['hair'])])


def build_hair_cards(field, spec, mats, count=560):
    """碎发卡群（≥300/头）：卡骑在发壳表面（根部厚度=壳厚场同源），沿梳向走全头，
    梢部收尖微翘；发际线/鬓角/颈后另加细碎越线短茬。湿客改为重力垂落贴脸的湿绺。"""
    style = spec.get('hair', 'short')
    if style == 'none':
        return build_nape_wisps(field, spec, mats)
    wet = spec.get('anomaly') == 'drowned'
    rng = np.random.default_rng(field.seed + 63)
    bm = bmesh.new()
    made = 0
    tries = 0
    while made < count and tries < count * 30:
        tries += 1
        u = rng.random() * TAU
        zz = rng.random() * 1.9 - 0.9
        cl = math.sqrt(max(0.0, 1 - zz * zz))
        d = Vector((math.sin(u) * cl, -math.cos(u) * cl, zz))
        lon = math.atan2(d.x, -d.y)
        hl = _hairline_z(lon, style)
        edge_zone = abs(d.z - hl) < 0.14
        sideburn_root = (abs(abs(lon) - TAU / 4) < 0.20 and -0.10 < d.z < hl)
        if not (d.z > hl - 0.03 or sideburn_root):
            continue
        made += 1
        nrm = field.normal(d)
        base_lift = max(0.0004, _shell_lift_one(field, d, style))
        p = field.pos(d) + nrm * (base_lift + 0.0004)   # 根部贴壳面（壳厚同源，不悬浮不沉没）
        front = math.cos(lon)
        # 梳向（切向场）：前额向后上、顶部向后、侧面向后下、后脑向下
        if style == 'slick':
            comb = Vector((d.x * 0.2, 0.95, -0.12))
        else:
            comb = Vector((d.x * 0.45, 0.55 * front + 0.35, -0.15 - 0.45 * max(0.0, -front) - 0.3 * max(0.0, 0.3 - d.z)))
        comb = (comb - nrm * comb.dot(nrm)).normalized()
        comb = (comb + Vector((rng.random() - 0.5, rng.random() - 0.5, rng.random() - 0.5)) * 0.35).normalized()
        L = (0.012 + rng.random() * 0.014) * (0.92 if edge_zone else 1.0)
        if sideburn_root:
            if rng.random() < 0.5:
                made -= 1
                continue
            L = 0.006 + rng.random() * 0.007   # 鬓角只留短茬
        if wet and math.cos(lon) > 0.45 and rng.random() < 0.45:
            made -= 1
            continue  # 湿客：前帘稀疏（别糊死眉眼）
        segs = 5
        if wet:
            L = (0.030 + rng.random() * 0.028) * (0.55 if math.cos(lon) > 0.45 else 1.0)
            comb = (comb * 0.4 + Vector((0, 0, -1)) + Vector((d.x, d.y, 0)).normalized() * 0.35).normalized()
        w0 = (0.0013 if not wet else 0.0040) + rng.random() * 0.0008
        pts = [Vector(p)]
        dirv = comb.copy()
        for sgi in range(segs):
            q = pts[-1] + dirv * (L / segs)
            dq = Vector(q).normalized()
            surf = field.pos(dq)
            nq = field.normal(dq)
            if wet:
                # 湿绺：垂落但不穿头；过发际线后自由下垂贴脸
                rmin = surf.length + 0.0018
                if q.length < rmin:
                    q = q * (rmin / max(q.length, 1e-6))
                dirv = (dirv + Vector((0, 0, -1.2)) * (sgi + 1) / segs).normalized()
            else:
                # 干短发：骑壳投影（壳面 + 梢部渐翘），杜绝飘出脸颊的散卡
                t = (sgi + 1) / segs
                sl = max(0.0004, _shell_lift_one(field, dq, style))
                lift = sl + 0.0004 + 0.0009 * (t ** 2) + rng.random() * 0.0002
                q = surf + nq * lift
                lon_q = math.atan2(dq.x, -dq.y)
                if dq.z < -0.24 or (dq.z < _hairline_z(lon_q, style) - 0.06 and abs(abs(lon_q) - TAU / 4) > 0.28):
                    break  # 滑进面颊/颌区：截断
                dirv = (q - pts[-1]).normalized()
                dirv = (dirv - nq * dirv.dot(nq) * 0.65).normalized()
            pts.append(q)
        if len(pts) < 3:
            continue
        segs = len(pts) - 1
        side = dirv.cross(nrm).normalized()
        rows = []
        for i2, q in enumerate(pts):
            wk = w0 * (1 - 0.85 * (i2 / segs) ** 1.3)   # 梢部收尖
            rows.append((bm.verts.new(q - side * wk), bm.verts.new(q + side * wk)))
        mi = int(rng.choice([0, 0, 0, 1, 1, 2]))   # 发色抖动：基/深/浅
        if edge_zone and front > 0.15:
            mi = int(rng.choice([0, 1, 1, 1]))     # 前额发际卡压深：亮卡在额头上读成碎瓷片
        for i2 in range(segs):
            a, b = rows[i2]
            b2, a2 = rows[i2 + 1][1], rows[i2 + 1][0]
            try:
                f2 = bm.faces.new((a, b, b2, a2))
                f2.material_index = mi
            except ValueError:
                pass
    # —— 发际线越线细茬：前额/鬓角/颈后（打掉「头盔分界线」的关键） ——
    if not wet:
        for i in range(130):
            which = rng.random()
            L_cap = 1.0
            if which < 0.45:      # 前发际
                lon = (rng.random() - 0.5) * 1.6
                zz = _hairline_z(lon, style) + (rng.random() - 0.62) * 0.07
            elif which < 0.75:    # 鬓角（短茬贴皮，长了在颊侧剪影上读成天线）
                lon = (1 if rng.random() < 0.5 else -1) * (TAU / 4 + (rng.random() - 0.5) * 0.30)
                zz = -0.14 + rng.random() * 0.26
                L_cap = 0.0045
            else:                 # 颈后
                lon = math.pi + (rng.random() - 0.5) * 1.6
                zz = -0.52 + rng.random() * 0.22
            cl = math.sqrt(max(0.0, 1 - zz * zz))
            d = Vector((math.sin(lon) * cl, -math.cos(lon) * cl, zz))
            nrm = field.normal(d)
            p = field.pos(d) + nrm * 0.0006
            downv = Vector((d.x * 0.3, d.y * 0.3, -1.0)).normalized()
            if which < 0.45:
                downv = Vector((d.x * 0.3, -0.25, -0.75)).normalized()   # 前茬向下贴额
            downv = (downv - nrm * downv.dot(nrm)).normalized()
            downv = (downv + Vector((rng.random() - 0.5, rng.random() - 0.5, rng.random() - 0.5)) * 0.4).normalized()
            L = min(0.004 + rng.random() * 0.006, L_cap)
            side = downv.cross(nrm).normalized()
            w = 0.0004 + rng.random() * 0.0004
            q1 = p + downv * L * 0.6 + nrm * 0.0003
            q2 = q1 + downv * L * 0.4 - nrm * 0.0001
            a = bm.verts.new(p - side * w)
            b = bm.verts.new(p + side * w)
            c2 = bm.verts.new(q1 + side * w * 0.5)
            d2 = bm.verts.new(q1 - side * w * 0.5)
            e2 = bm.verts.new(q2)
            try:
                f2 = bm.faces.new((a, b, c2, d2))
                f2.material_index = 1
                f3 = bm.faces.new((d2, c2, e2))
                f3.material_index = 1
            except ValueError:
                pass
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = (0.1, 0.9)
    me = bpy.data.meshes.new('HairCards')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = _new_obj('HairCards', me, [mats['hair'],
                                     mats.get('hair_dk', mats['hair']),
                                     mats.get('hair_lt', mats['hair'])])
    for m in obj.data.materials:
        m.use_backface_culling = False
    return obj


def build_nape_wisps(field, spec, mats):
    """光头/戴帽老者：颈后与耳上的灰白碎发。"""
    rng = np.random.default_rng(field.seed + 65)
    bm = bmesh.new()
    for i in range(70):
        u = math.pi + (rng.random() - 0.5) * 2.4   # 后侧
        zz = -0.32 + rng.random() * 0.42
        cl = math.sqrt(max(0.0, 1 - zz * zz))
        d = Vector((math.sin(u) * cl, -math.cos(u) * cl, zz))
        p = field.pos(d) + field.normal(d) * 0.0015
        nrm = field.normal(d)
        dirv = (Vector((d.x * 0.4, 0.3, -1.0)) + Vector((rng.random() - 0.5, rng.random() - 0.5, 0)) * 0.5).normalized()
        L = 0.014 + rng.random() * 0.014
        side = dirv.cross(nrm).normalized()
        w = 0.002
        q1 = p + dirv * L * 0.6
        q2 = q1 + (dirv + Vector((0, 0, -0.5))).normalized() * L * 0.4
        a = bm.verts.new(p - side * w)
        b = bm.verts.new(p + side * w)
        c2 = bm.verts.new(q1 + side * w * 0.6)
        d2 = bm.verts.new(q1 - side * w * 0.6)
        e2 = bm.verts.new(q2 + side * w * 0.15)
        f2 = bm.verts.new(q2 - side * w * 0.15)
        bm.faces.new((a, b, c2, d2))
        bm.faces.new((d2, c2, e2, f2))
    me = bpy.data.meshes.new('NapeWisps')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = _new_obj('NapeWisps', me, [mats['hair']])
    obj.data.materials[0].use_backface_culling = False
    return obj


# ------------------------- 耳廓 -------------------------

def build_ear(field, sgn, mats):
    """参数化耳（真人尺寸 ~5.8×3.6cm）：helix 轮匝卷缘 / scapha 舟状沟 /
    antihelix 对耳轮脊 / concha 耳甲深腔 / 耳垂 / 耳屏。
    七级径向环带：外缘背折→rim 峰→scapha 谷→antihelix 脊→内坡→腔壁→腔底。"""
    n_sec = 26
    #            t 半径衰减 , 高度
    rings = [(0.00, -0.0012),   # 外缘背折（rim 有厚度，不是纸片）
             (0.10, 0.0078),    # helix 峰
             (0.28, 0.0022),    # scapha 谷
             (0.46, 0.0062),    # antihelix 脊
             (0.62, 0.0026),    # 内坡
             (0.82, -0.0026),   # 腔壁
             (1.00, -0.0078)]   # concha 底（贴头）
    a, b = 0.0290, 0.0180   # 半高/半宽（真人：耳高 ~6cm）
    d0 = Vector((math.sin(LM['ear_lon']) * sgn, -math.cos(LM['ear_lon']), LM['ear_z'])).normalized()
    base = field.pos(d0)
    nrm = Vector((sgn, 0.26, 0.06)).normalized()    # 耳平面外法向（贴颅、微外张）
    upv = Vector((0, -0.36, 1)).normalized()        # 耳轴后仰 ~20°
    fwdv = upv.cross(nrm).normalized() * (1 if sgn > 0 else 1)   # 头部前向切向
    base = base - nrm * 0.0030                      # 根部埋进头侧
    bm = bmesh.new()
    grid = []
    for ri, (t, h) in enumerate(rings):
        ring = []
        for k in range(n_sec):
            th = k / n_sec * TAU
            ca, sa = math.cos(th), math.sin(th)   # ca>0 = 朝脸前方；sa>0 = 朝上
            # 外缘轮廓：上宽下窄的 D 形，耳垂圆
            rr = 1.0 - 0.22 * max(0.0, -sa) * (abs(ca) ** 0.6) + 0.06 * max(0.0, sa) * abs(ca)
            ea = a * rr * (1 - t * 0.90)
            eb = b * rr * (1 - t * 0.86)
            zloc = sa * ea
            xloc = ca * eb
            hh = h
            lobe = sa < -0.60
            if lobe and ri <= 3:      # 耳垂：厚软无沟
                hh = 0.0038 - 0.0008 * ri
            front_sec = ca > 0.55 and -0.35 < sa < 0.4
            if front_sec and ri == 3:
                hh = 0.0008            # antihelix 不越过腔前口
            if front_sec and ri in (4, 5):
                hh = h - 0.0012        # 腔前口向耳屏开敞
            # 上前段 helix 根扎进颊侧（crus of helix）
            if ri <= 1 and ca > 0.7 and sa > 0.1:
                hh -= 0.0030
            p = base + fwdv * (-xloc) + upv * zloc + nrm * (hh + 0.0022)
            ring.append(bm.verts.new(p))
        grid.append(ring)
    for ri in range(len(grid) - 1):
        for k in range(n_sec):
            k2 = (k + 1) % n_sec
            bm.faces.new((grid[ri][k], grid[ri][k2], grid[ri + 1][k2], grid[ri + 1][k]))
    # 封耳甲腔底
    bm.faces.new(tuple(reversed(grid[-1])))
    # 耳屏：腔前口上的小瓣（挡住耳道）
    trag = base + fwdv * (-b * 0.86) + upv * (-a * 0.10) + nrm * 0.0012
    ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.0052)
    for v in ret['verts']:
        v.co = Vector((v.co.x, v.co.y, v.co.z)) * 1.0
        v.co = trag + fwdv * v.co.x * 0.55 + upv * v.co.z * 0.9 + nrm * v.co.y * 0.55
    # 背面壳（耳背，嵌进头侧）
    back = []
    for k in range(n_sec):
        v = grid[0][k]
        back.append(bm.verts.new(v.co - nrm * 0.0095 + (base - v.co) * 0.10))
    for k in range(n_sec):
        k2 = (k + 1) % n_sec
        bm.faces.new((back[k2], back[k], grid[0][k], grid[0][k2]))
    bm.faces.new(tuple(back))
    uvl = bm.loops.layers.uv.verify()
    uu, vv = uv_of(LM['ear_lon'] * sgn, LM['ear_z'])
    for f in bm.faces:
        f.material_index = 0
        for lp in f.loops:
            lp[uvl].uv = (uu, vv)
    me = bpy.data.meshes.new('Ear')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return _new_obj('Ear' + ('L' if sgn < 0 else 'R'), me, [mats['skin']])


# ------------------------- 主异常几何 -------------------------

def build_calcified_nodules(field, mats):
    """司仪：鱼籽状钙化——沿唇缘（红唇轮廓线）密排一圈瘤粒，再在口缝上补一列封死。
    唇体本身要露出来（钙化在封缝，不是泡沫糊嘴）。"""
    rng = np.random.default_rng(field.seed + 87)
    bm = bmesh.new()

    def put(lon, zz, r):
        cl = math.sqrt(max(0.0, 1 - zz * zz))
        d = Vector((math.sin(lon) * cl, -math.cos(lon) * cl, zz))
        p = field.pos(d)
        nrm = field.normal(d)
        ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        off = p + nrm * (r * 0.10)
        for v in ret['verts']:
            v.co += off

    # 唇缘环：椭圆轮廓（上唇缘略高，下唇缘略低），沿弧长密排
    n_ring = 34
    for i in range(n_ring):
        ang = i / n_ring * TAU + rng.random() * 0.08
        lon = math.cos(ang) * (0.155 + rng.random() * 0.02)
        zz = LM['seam_z'] + math.sin(ang) * (0.062 + rng.random() * 0.014)
        put(lon, zz, 0.0013 + rng.random() * 0.0014)
    # 口缝封条：沿缝一列（略越过嘴角），粒大一档——「被封死」的读法在这里
    for i in range(11):
        tt = (i / 10 - 0.5) * 2
        lon = tt * 0.15 + (rng.random() - 0.5) * 0.014
        zz = LM['seam_z'] + (rng.random() - 0.5) * 0.014
        put(lon, zz, 0.0017 + rng.random() * 0.0015)
    me = bpy.data.meshes.new('Calc')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return _new_obj('Calc', me, [mats['pearl']])


def build_salt_crystals(field, mats):
    """守夜镇民：右颊向颈的盐霜晶簇。"""
    rng = np.random.default_rng(field.seed + 93)
    bm = bmesh.new()
    for i in range(34):
        t = rng.random()
        lon = 0.55 + rng.random() * 0.45
        zz = -0.10 - t * 0.52 + (rng.random() - 0.5) * 0.12
        cl = math.sqrt(max(0.0, 1 - zz * zz))
        d = Vector((math.sin(lon) * cl, -math.cos(lon) * cl, zz))
        p = field.pos(d)
        nrm = field.normal(d)
        r = 0.0008 + rng.random() * 0.0016
        ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        off = p + nrm * (r * 0.25)
        sq = 0.5 + rng.random()
        for v in ret['verts']:
            v.co = Vector((v.co.x, v.co.y, v.co.z * sq)) + off
    me = bpy.data.meshes.new('Salt')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    return _new_obj('Salt', me, [mats['salt']])


# ------------------------- 装配入口 -------------------------

def forge_head(spec, seed, mats):
    """返回（HeadField, 头组 obj 列表）。obj 均在头局部空间（头中心原点）。"""
    field = HeadField(spec, seed)
    objs = [build_head_mesh(field, mats)]
    for sgn in (-1, 1):
        objs.append(build_eyeball(field, sgn, mats))
        objs.append(build_lids(field, sgn, mats))
        objs.append(build_brow(field, sgn, mats))
        objs.append(build_ear(field, sgn, mats))
    scalp = build_scalp(field, spec, mats)
    if scalp:
        objs.append(scalp)
    cards = build_hair_cards(field, spec, mats)
    if cards:
        objs.append(cards)
    if spec.get('anomaly') == 'calcified_mouth':
        objs.append(build_calcified_nodules(field, mats))
    elif spec.get('anomaly') == 'salt_frost':
        objs.append(build_salt_crystals(field, mats))
    return field, objs


# ------------------------- 皮肤贴图（与几何同地标） -------------------------

def _vnoise2(rng, h, w, cells):
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


def _fbm2(rng, h, w, base_cells=4, octaves=4):
    out = np.zeros((h, w))
    amp, total, cells = 1.0, 0.0, base_cells
    for _ in range(octaves):
        out += _vnoise2(rng, h, w, cells) * amp
        total += amp
        amp *= 0.5
        cells *= 2
    return out / total


def _blob(U, V, u0, v0, ru, rv, hard=2.0):
    d = ((U - u0) / ru) ** 2 + ((V - v0) / rv) ** 2
    return np.exp(-(d ** (hard / 2)))


def _tint(canvas, mask, rgb, k=1.0):
    for i in range(3):
        canvas[:, :, i] += mask * (rgb[i] - canvas[:, :, i]) * k


def paint_face(spec, seed):
    """1280×640 皮肤画布：所有特征坐标由 uv_of(LM) 推导（对齐几何）。"""
    W, H = 1280, 640
    rng = np.random.default_rng(seed + 3)
    us = (np.arange(W) + 0.5) / W
    vs = (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(us, vs)

    base = np.array(spec.get('skin', (0.72, 0.55, 0.44)))
    canvas = np.zeros((H, W, 3))
    canvas[:, :] = base
    g = spec.get('head', {})
    age = g.get('age', 0.35)

    # 活皮基底：大区血色不均 + 中频斑驳 + 毛孔
    mott = _fbm2(rng, H, W, 6, 4) - 0.5
    for i, k in enumerate((0.10, 0.065, 0.045)):
        canvas[:, :, i] += mott * k
    fine = _fbm2(rng, H, W, 60, 3) - 0.5
    canvas += fine[:, :, None] * 0.032
    pore = _vnoise2(rng, H, W, 220) - 0.5
    canvas += pore[:, :, None] * (0.012 + 0.008 * age)

    dark = base * 0.52
    warm = np.array([min(1, base[0] * 1.20), base[1] * 0.90, base[2] * 0.82])

    def L(mask, rgb, k):
        _tint(canvas, mask, np.array(rgb), k)

    # ---- 地标 UV ----
    ue, ve = uv_of(LM['eye_lon'], LM['eye_z'])
    due = ue - 0.5
    ub, vb = uv_of(LM['brow_lon'], LM['brow_z'])
    _, vtip = uv_of(0, LM['tip_z'])
    uno, vno = uv_of(LM['nostril_lon'], LM['nostril_z'])
    ual, val = uv_of(LM['alae_lon'], LM['alae_z'])
    _, vup = uv_of(0, LM['lip_up_z'])
    _, vseam = uv_of(0, LM['seam_z'])
    _, vdn = uv_of(0, LM['lip_dn_z'])
    umo, vmo = uv_of(LM['mouth_lon'], -0.350)
    _, vchin = uv_of(0, LM['chin_z'])
    uck, vck = uv_of(LM['cheek_lon'], LM['cheek_z'])
    uhl, vhl = uv_of(LM['hollow_lon'], LM['hollow_z'])
    uear, vear = uv_of(LM['ear_lon'], LM['ear_z'])

    # ---- 骨相 AO（几何为主，贴图补阴影缝）----
    for s in (-1, 1):
        uex = 0.5 + s * due
        L(_blob(U, V, uex, ve, 0.045, 0.038), dark, 0.30)                       # 眶窝
        L(_blob(U, V, uex, ve + 0.035, 0.048, 0.014), dark, 0.28)               # 上睑褶沟
        L(_blob(U, V, uex, ve - 0.038, 0.040, 0.016), dark * 1.1 + 0.03, 0.12 + 0.25 * age)  # 眼袋沟
        L(_blob(U, V, uex - s * 0.028, ve - 0.006, 0.010, 0.012), np.array((0.55, 0.25, 0.22)), 0.4)  # 内眦红
        # 法令沟（鼻翼→嘴角折线）
        for i in range(5):
            t = i / 4
            L(_blob(U, V, 0.5 + s * (0.027 + 0.014 * t), val - 0.010 - t * 0.055, 0.006, 0.014, 1.5),
              dark, (0.10 + 0.30 * age) * (1 - t * 0.3))
        L(_blob(U, V, 0.5 + s * (ual - 0.5) * 1.35, val, 0.008, 0.010), dark, 0.35)   # 鼻翼沟
        L(_blob(U, V, 0.5 + s * (uno - 0.5), vno, 0.0065, 0.0075, 2.6), dark * 0.30, 0.85)  # 鼻孔深斑
        L(_blob(U, V, 0.5 + s * (uck - 0.5), vck, 0.045, 0.032), base * 1.07, 0.22)   # 颧光
        L(_blob(U, V, 0.5 + s * (uhl - 0.5), vhl, 0.038, 0.033), dark, 0.10 + 0.22 * age)  # 颊陷
        L(_blob(U, V, 0.5 + s * (uear - 0.5), vear, 0.040, 0.055), warm, 0.30)        # 耳血色
        L(_blob(U, V, 0.5 + s * (uear - 0.5) * 0.96, vear, 0.012, 0.028), dark, 0.35)  # 耳甲腔影
    L(_blob(U, V, 0.5, (ve + vb) / 2 - 0.01, 0.016, 0.05), base * 1.10, 0.30)   # 鼻梁高光
    L(_blob(U, V, 0.5, vtip, 0.022, 0.016), warm, 0.40)                          # 鼻头血色
    L(_blob(U, V, 0.5, vchin - 0.055, 0.09, 0.035), dark, 0.22)                  # 颌底影
    L(_blob(U, V, 0.5, vchin + 0.02, 0.020, 0.014), base * 1.06, 0.25)           # 颏高光

    # ---- 唇（体积交给几何；贴图给色与竖纹）----
    lip = np.array(spec.get('lip', (0.60, 0.34, 0.30)))
    upm = _blob(U, V, 0.5, vup, 0.036, 0.011)
    dnm = _blob(U, V, 0.5, vdn, 0.031, 0.013)
    L(upm, lip * 0.92, 0.60)
    L(dnm, lip * 1.10, 0.65)
    creases = (np.sin(U * TAU * 160) * 0.5 + 0.5) * (upm + dnm)
    L(np.clip(creases, 0, 1) * 0.5, lip * 0.7, 0.30)                              # 唇竖纹
    L(_blob(U, V, 0.5, vseam, 0.038, 0.0030, 3), dark * 0.45, 0.8)                # 口裂线
    for s in (-1, 1):
        L(_blob(U, V, 0.5 + s * (umo - 0.5), vmo, 0.007, 0.006), dark, 0.5)       # 嘴角点
    L(_blob(U, V, 0.5, (vup + vtip) / 2, 0.010, 0.014), base * 1.07, 0.35)        # 人中柱光

    # ---- 眉根影（几何毛簇下垫色）----
    brow_rgb = np.array(spec.get('brow_rgb', (0.16, 0.12, 0.10)))
    for s in (-1, 1):
        L(_blob(U, V, 0.5 + s * (ub - 0.5), vb, 0.045, 0.013), brow_rgb, 0.40)

    # ---- 额纹 / 老年斑 / 胡茬 ----
    for k in range(g.get('forehead_lines', spec.get('forehead_lines', 0))):
        lv = vb + 0.035 + k * 0.024
        line = np.exp(-(((V - lv - 0.006 * np.sin((U - 0.5) * 9)) / 0.0030) ** 2)) * \
            np.exp(-(((U - 0.5) / 0.10) ** 2))
        L(line, dark, 0.28)
    for _ in range(spec.get('age_spots', 0)):
        su = 0.5 + (rng.random() - 0.5) * 0.44
        sv = 0.33 + rng.random() * 0.36
        L(_blob(U, V, su, sv, 0.005 + rng.random() * 0.008, 0.004 + rng.random() * 0.007),
          np.array((0.38, 0.28, 0.20)), 0.35)
    if spec.get('stubble', 0) > 0:
        sm = (_blob(U, V, 0.5, vchin + 0.035, 0.11, 0.075) +
              _blob(U, V, 0.42, vseam + 0.01, 0.05, 0.07) + _blob(U, V, 0.58, vseam + 0.01, 0.05, 0.07))
        sm = np.clip(sm, 0, 1) * (_fbm2(rng, H, W, 90, 2) * 0.7 + 0.3)
        L(sm * (1 - np.clip(upm + dnm, 0, 1)), np.array((0.30, 0.28, 0.27)), 0.30 * spec['stubble'])

    # ---- 发际过渡与后脑发色 ----
    hl_v = 0.5 + math.asin(0.42) / math.pi - 0.02
    hz = np.clip((V - hl_v) / 0.05, 0, 1) * (np.abs(U - 0.5) < 0.30)
    hair_rgb = np.array(spec.get('hair_rgb', (0.09, 0.08, 0.07)))
    L(hz, hair_rgb + 0.05, 0.55)
    backm = np.clip((np.abs(U - 0.5) - 0.235) / 0.05, 0, 1) * (V > 0.40)
    L(backm, hair_rgb + 0.04, 0.60 * spec.get('back_hair', 1.0))

    # ---- 主异常层 ----
    if spec.get('anomaly') == 'calcified_mouth':
        pearl = np.array((0.78, 0.76, 0.70))
        ring = np.clip(_blob(U, V, 0.5, vseam, 0.055, 0.030) - _blob(U, V, 0.5, vseam, 0.015, 0.006), 0, 1)
        gr = _vnoise2(rng, H, W, 180)
        L(ring, pearl * 0.80, 0.55)
        L(np.clip((gr - 0.45) * 4.5, 0, 1) * ring, pearl * 1.05, 0.9)
        L(_blob(U, V, 0.5, vseam, 0.028, 0.0035, 3), pearl * 0.68, 0.9)
    elif spec.get('anomaly') == 'salt_frost':
        sf = _blob(U, V, uhl + 0.02, vhl + 0.02, 0.05, 0.09, 1.6) + _blob(U, V, uhl - 0.02, vchin - 0.02, 0.065, 0.06, 1.6)
        sf = np.clip(sf, 0, 1)
        cry = np.clip((_vnoise2(rng, H, W, 140) - 0.45) * 3, 0, 1)
        # 晶界侵蚀边缘：斑块由晶粒向外「爬」，不许出现光滑贴纸硬边
        grow = np.clip(sf * (0.30 + 0.70 * cry) - 0.05, 0, 1)
        L(grow, np.array((0.88, 0.90, 0.90)), 0.62)
        L(np.clip(sf - 0.45, 0, 1) * cry, np.array((0.96, 0.97, 0.97)), 0.9)
    elif spec.get('anomaly') == 'drowned':
        cold = np.array((0.44, 0.52, 0.53))
        canvas[:, :] = canvas * 0.34 + cold * 0.66
        liv = _fbm2(rng, H, W, 10, 3)
        L(np.clip((liv - 0.52) * 3, 0, 1), np.array((0.33, 0.30, 0.40)), 0.5)
        vein = _fbm2(rng, H, W, 26, 2)
        veinm = np.exp(-((np.abs(vein - 0.5) / 0.013) ** 2))
        L(veinm * 0.7, np.array((0.28, 0.33, 0.36)), 0.5)
        L(_blob(U, V, 0.5, vseam, 0.042, 0.018), np.array((0.14, 0.16, 0.22)), 0.85)   # 唇发绀
        L(_blob(U, V, 0.5, vseam - 0.012, 0.020, 0.008, 2.5), np.array((0.05, 0.06, 0.08)), 0.9)  # 微张口内的黑
        for s in (-1, 1):
            L(_blob(U, V, 0.5 + s * due, ve, 0.05, 0.045), np.array((0.30, 0.34, 0.38)), 0.5)

    return np.clip(canvas, 0, 1)


def paint_eye(iris_rgb=(0.32, 0.20, 0.12), filmed=0.0, seed=7):
    """128² 眼球画布：放射状虹膜纤维 + 角膜缘环 + 巩膜血丝。前极 = v 顶。"""
    S = 128
    rng = np.random.default_rng(seed)
    us = (np.arange(S) + 0.5) / S
    U, V = np.meshgrid(us, us)
    sclera = np.array((0.78, 0.74, 0.70))
    canvas = np.zeros((S, S, 3))
    canvas[:, :] = sclera
    ang = (1 - V)     # 0=前极（与几何 UV 一致）
    theta = U * TAU
    iris_r, pupil_r = 0.24, 0.095
    irm = np.clip((iris_r - ang) / 0.015, 0, 1)
    ir = np.array(iris_rgb)
    fib = (np.sin(theta * 38 + rng.random() * 9) * 0.5 + 0.5) * 0.30 + \
        _vnoise2(rng, S, S, 26) * 0.35 + 0.42                                  # 放射纤维+杂色
    ring = np.exp(-(((ang - iris_r * 0.55) / 0.03) ** 2)) * 0.35               # 虹膜内环
    for i in range(3):
        canvas[:, :, i] = canvas[:, :, i] * (1 - irm) + np.clip(ir[i] * (fib + ring), 0, 1) * irm
    rim = np.exp(-(((ang - iris_r) / 0.016) ** 2))
    canvas *= (1 - rim[:, :, None] * 0.6)                                       # 角膜缘暗环
    pum = np.clip((pupil_r - ang) / 0.010, 0, 1)
    canvas *= (1 - pum[:, :, None] * 0.95)
    red = _vnoise2(rng, S, S, 22)
    redm = np.clip((red - 0.60) * 3, 0, 1) * np.clip((ang - iris_r) / 0.2, 0, 1)
    _tint(canvas, redm, np.array((0.62, 0.30, 0.26)), 0.42)
    canvas *= (1 - np.clip((ang - 0.40) / 0.5, 0, 0.55))[:, :, None]            # 眼白周边转暗（睑影）
    if filmed > 0:
        film = np.array((0.52, 0.57, 0.56))
        canvas = canvas * (1 - filmed) + film[None, None, :] * filmed
    return np.clip(canvas, 0, 1)
