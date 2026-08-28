# 头部侧影/正面轮廓探针（不渲染，纯数值）：
#   ~/blender-4.1.1/blender --background --python blender/probe_head.py -- [--char emcee]
# 输出两张 ASCII 剪影图：
#   · prof：脸中线带（|lon|<0.30）每 z 档的最大前凸 -y —— 必须读出
#     额→眉弓台阶→鼻根凹→鼻梁→鼻尖→小柱回收→人中→唇→颏唇沟→颏
#   · front：前半球每 z 档的最大 |x| —— 颧宽>颅宽>下颌宽，无「花生腰」
import sys
import os
import math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import head_forge as HF  # noqa: E402
from gen_characters import SPECS  # noqa: E402


def probe(char='emcee'):
    spec = SPECS[char]
    field = HF.HeadField(spec, spec['seed'])
    # 密集方向网格
    n_lon, n_z = 240, 160
    lons = np.linspace(-math.pi, math.pi, n_lon)
    zs = np.linspace(-0.985, 0.985, n_z)
    LO, ZZ = np.meshgrid(lons, zs)
    CL = np.sqrt(np.clip(1 - ZZ ** 2, 0, 1))
    D = np.stack([np.sin(LO) * CL, -np.cos(LO) * CL, ZZ], axis=-1).reshape(-1, 3)
    P = field.unit_pos(D.copy()) * np.array([field.rx, field.ry, field.rz])
    Pz = P[:, 2]
    lon_f = np.arctan2(D[:, 0], -D[:, 1])

    def ascii_plot(title, vals_mm, z_mm, marks):
        print('\n== %s（毫米） ==' % title)
        zbins = np.linspace(z_mm.max() + 1, z_mm.min() - 1, 72)
        vmax = np.nanmax(vals_mm)
        width = 64
        for i in range(len(zbins) - 1):
            m = (z_mm <= zbins[i]) & (z_mm > zbins[i + 1])
            if not m.any():
                continue
            v = np.nanmax(vals_mm[m])
            col = int(v / vmax * (width - 1))
            zc = (zbins[i] + zbins[i + 1]) / 2
            tag = ''
            for mk_z, mk_name in marks:
                if abs(zc - mk_z) < (zbins[0] - zbins[1]) * 0.6:
                    tag = ' <- ' + mk_name
            print('%7.1f |%s#%s' % (zc, ' ' * col, tag))

    # —— 侧影：中线带最大前凸 ——（r17：地标 z 经 vstretch 映射到拉伸后空间）
    band = np.abs(lon_f) < 0.30
    prof_y = np.where(band, -P[:, 1], np.nan) * 1000
    z_mm = Pz * 1000
    LM = HF.LM
    rz = field.rz
    stretch_k = spec.get('head', {}).get('stretch', 0.12)

    def vz(zc):
        return HF.vstretch(zc, stretch_k)
    marks = [(vz(LM['brow_z']) * rz * 1000, 'brow'), (vz(LM['nasion_z']) * rz * 1000, 'nasion'),
             (vz(LM['tip_z']) * rz * 1000, 'tip'), (vz(LM['philtrum_z']) * rz * 1000, 'philtrum'),
             (vz(LM['lip_up_z']) * rz * 1000, 'lip_up'), (vz(LM['seam_z']) * rz * 1000, 'seam'),
             (vz(LM['lip_dn_z']) * rz * 1000, 'lip_dn'), (vz(LM['sulcus_z']) * rz * 1000, 'sulcus'),
             (vz(LM['chin_z']) * rz * 1000, 'chin')]
    sel = ~np.isnan(prof_y)
    ascii_plot('侧影 -y(z) %s' % char, prof_y[sel], z_mm[sel], marks)

    # 关键台阶量化
    def max_at(zc, dz=0.02):
        m = sel & (np.abs(Pz / rz - vz(zc)) < dz * (1 + stretch_k))
        return np.nanmax(prof_y[m]) if m.any() else float('nan')
    brow = max_at(LM['brow_z'])
    nas = max_at(LM['nasion_z'], 0.018)
    tip = max_at(LM['tip_z'])
    phil = max_at(LM['philtrum_z'], 0.015)
    lip_u = max_at(LM['lip_up_z'], 0.015)
    seam = max_at(LM['seam_z'], 0.010)
    lip_d = max_at(LM['lip_dn_z'], 0.015)
    sul = max_at(LM['sulcus_z'], 0.015)
    chin = max_at(LM['chin_z'])
    print('\n[量化] brow=%.1f nasion=%.1f (凹 %.1f)  tip=%.1f (出 %.1f)' % (brow, nas, brow - nas, tip, tip - nas))
    print('[量化] philtrum=%.1f lip_up=%.1f (唇凸 %.1f) seam=%.1f lip_dn=%.1f sulcus=%.1f chin=%.1f (颏凸 %.1f)'
          % (phil, lip_u, lip_u - phil, seam, lip_d, sul, chin, chin - sul))
    ry = field.ry
    print('[达标] 鼻梁突出量 = %.3f 单位（tip-nasion, 要求≥0.08）  颏前凸 = %.3f 单位（chin-sulcus, 要求≥0.06）'
          % ((tip - nas) / 1000 / ry, (chin - sul) / 1000 / ry))
    head_w = 2 * np.nanmax(np.abs(P[:, 0])) * 1000
    print('[达标] 头全宽 = %.1f mm（颈宽上限 0.42×头宽 = %.1f mm）' % (head_w, head_w * 0.42))

    # —— 正面：每 z 档最大 |x|（前半球） ——
    fr = np.cos(lon_f) > -0.1
    wx = np.where(fr, np.abs(P[:, 0]), np.nan) * 1000
    sel2 = ~np.isnan(wx)
    marks2 = [(vz(LM['eye_z']) * rz * 1000, 'eye'), (vz(LM['cheek_z']) * rz * 1000, 'cheek'),
              (vz(LM['gonion_z']) * rz * 1000, 'gonion'), (vz(LM['chin_z']) * rz * 1000, 'chin')]
    ascii_plot('正面半宽 |x|(z) %s' % char, wx[sel2], z_mm[sel2], marks2)


argv = sys.argv
args = argv[argv.index('--') + 1:] if '--' in argv else []
char = args[args.index('--char') + 1] if '--char' in args else 'emcee'
probe(char)
