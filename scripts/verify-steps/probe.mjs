// 临时探针：同一次运行先拍基线A（未传送），传送酒店/宴会厅后拍B——dump差分定位洗白源
import fs from 'node:fs';

export async function run(page, h) {
  await page.click('#title-start');
  await h.sleep(1200);
  await h.tapKey('Space');
  await h.sleep(400);

  const look = async (px, pz, tx, tz, yHint, pitch = 0) => {
    await page.evaluate(({ px, pz, tx, tz, yHint, pitch }) => {
      const g = window.__game;
      const yaw = Math.atan2(-(tx - px), -(tz - pz));
      g.player.setPosition(px, pz, yaw, yHint);
      g.player.pitch = pitch;
      g.player.syncCamera(0);
    }, { px, pz, tx, tz, yHint, pitch });
    await page.evaluate(() => new Promise((r) => {
      let i = 0; const t = () => (++i >= 3 ? r() : requestAnimationFrame(t));
      requestAnimationFrame(t);
    }));
  };

  const busShot = async (tag) => {
    await page.evaluate(() => {
      const g = window.__game;
      const bus = g.world.dynamic.bus;
      bus.visible = true;
      bus.position.set(64.5, g.world.heightAt(64.5, -1.3) + 0.06, -1.3);
      g.sky.setBloodTide(false);
      g.sky.blood = 0; g.sky._bloodTarget = 0;
      if (g.sky._envSwapped) { g.sky._envSwapped = false; g.engine.scene.environment = g.sky.envNormal; }
      g.ocean.setBloodTide(false);
      g.engine.finalPass.uniforms.uTint.value.set(1, 1, 1);
      g.sky.update(0.05, g.player.pos);
      for (const f of g.sky.fogCards) {
        const dx = f.sp.position.x - bus.position.x, dz = f.sp.position.z - bus.position.z;
        if (dx * dx + dz * dz < 3600) { f.sp.position.x += 120; f.sp.position.z += 120; }
      }
      g.story.busGo = false;
      g.story._busV = 1.2;
      g.story.flags.intro = false;
      g.story.beginIntro();
    });
    await page.evaluate((t) => new Promise((res) => {
      const g = window.__game;
      g.game.state = 'PAUSE';
      g.story.introSeq.t0 = performance.now() - t;
      g.story.updateIntro(0);
      g.sky.flashSeq = null; g.sky.flash = 0; g.sky.boltMesh.visible = false;
      const u = g.engine.finalPass.uniforms;
      u.uFlash.value = 0; u.uRedShift.value = 0; u.uPulse.value = 0; u.uDistort.value = 0;
      requestAnimationFrame(() => requestAnimationFrame(res));
    }), 620);
    const dump = await page.evaluate(() => {
      const g = window.__game;
      const u = g.engine.finalPass.uniforms;
      const bus = g.world.dynamic.bus;
      const cards = [];
      for (const f of g.sky.fogCards) {
        const dx = f.sp.position.x - bus.position.x, dz = f.sp.position.z - bus.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 140) cards.push({ d: +d.toFixed(1), y: +f.sp.position.y.toFixed(1), w: +f.sp.scale.x.toFixed(1), op: +f.sp.material.opacity.toFixed(3) });
      }
      const lights = [];
      bus.traverse((o) => { if (o.isPointLight) lights.push({ int: +o.intensity.toFixed(2), pos: o.position.toArray().map((v) => +v.toFixed(2)) }); });
      const extLights = [];
      g.engine.scene.traverse((o) => {
        if ((o.isPointLight || o.isSpotLight) && o.parent !== bus) {
          const wp = o.getWorldPosition(new bus.position.constructor());
          const d = wp.distanceTo(bus.position);
          if (d < 25) extLights.push({ type: o.type, int: +o.intensity.toFixed(2), d: +d.toFixed(1), y: +wp.y.toFixed(1) });
        }
      });
      const un = {};
      for (const k of Object.keys(u)) {
        const v = u[k].value;
        un[k] = v?.isVector3 ? v.toArray().map((x) => +x.toFixed(3)) : (typeof v === 'number' ? +v.toFixed(4) : String(v));
      }
      return {
        uniforms: un,
        sky: {
          flash: g.sky.flash, blood: +g.sky.blood.toFixed(3),
          fogDensity: +g.engine.scene.fog.density.toFixed(4),
          fogColor: g.engine.scene.fog.color.getHexString(),
          envInt: +g.engine.scene.environmentIntensity.toFixed(3),
          envIsBlood: g.engine.scene.environment === g.sky.envBlood,
          hemi: +g.sky.hemi.intensity.toFixed(2), sun: +g.sky.sun.intensity.toFixed(2),
          motesOp: +g.sky.motes.material.opacity.toFixed(3),
          motesPos: g.sky.motes.position.toArray().map((v) => +v.toFixed(0)),
        },
        exposure: g.engine.renderer.toneMappingExposure,
        cards, lights, extLights,
        agendaStage: g.agenda?.stage,
        state: g.game.state, dead: g.player.dead,
        playerPos: [+g.player.pos.x.toFixed(1), +g.player.pos.z.toFixed(1)],
      };
    });
    fs.writeFileSync(`verify/buscam/${tag}.json`, JSON.stringify(dump, null, 1));
    await h.shot(`buscam/${tag}`);
    // 恢复 PLAY 以便下一段流程
    await page.evaluate(() => {
      const g = window.__game;
      g.game.state = 'PLAY';
      g.story.endIntro();
    });
  };

  await busShot('probeA');

  const HO = await page.evaluate(() => {
    const o = window.__game.world.dynamic.hotelInfo.origin;
    return { x: o.x, y: o.y, z: o.z };
  });
  await look(HO.x + 1, HO.z + 39, HO.x, HO.z + 11, undefined, 0.15);
  await look(HO.x + 14, HO.z + 17.5, HO.x - 2, HO.z + 11, undefined, 0.3);
  await look(HO.x - 1, HO.z + 21, HO.x, HO.z + 11.5, undefined, 0.12);
  await look(HO.x - 2, HO.z + 36, HO.x - 3, HO.z + 8, undefined, 0.24);
  await look(-15.68, -63.82, -16.5, -64.6, 3.5, 0.05);
  await h.sleep(1500);

  await busShot('probeB');
  console.log('[verify] probe A/B done');
}
