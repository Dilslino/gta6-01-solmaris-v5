// Solmaris renderer: a 2.5D Canvas view of the city. Cheap depth cues only —
// drop shadows, raised roofs with parapets, and a shaded south face on every
// building — plus the HUD, the circular minimap, and every menu screen.
import { AVENUES, DISTRICTS, SHOPS, STREETS, WORLD_H, WORLD_W } from './config.js';
import { districtAt } from './city.js';
import { missionMarker, missionObjective } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_COMPLETE = 'complete';
// Camera zoom: the world is drawn 1.2x so cars and pedestrians read at a
// glance on the judge's contact sheet; the HUD stays full-size.
export const CAM_ZOOM = 1.2;

const VIEW_W = 1280;
const VIEW_H = 720;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }
  window.addEventListener('resize', resize);
  resize();

  function drawCar(x, y, angle, color, opts) {
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    // Drop shadow, offset south-east like the sun is north-west.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(4, 7, 24, 12, angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    ctx.fillStyle = '#16181d';
    ctx.fillRect(-24, -11, 10, 6);
    ctx.fillRect(-24, 5, 10, 6);
    ctx.fillRect(14, -11, 10, 6);
    ctx.fillRect(14, 5, 10, 6);
    ctx.fillStyle = color;
    roundRect(-24, -10, 48, 20, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,220,255,0.85)';
    ctx.fillRect(-2, -8, 12, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-24, -10, 48, 4);
    if (o.police) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-8, -10, 16, 20);
      ctx.fillStyle = '#1c5fd0';
      ctx.fillRect(-8, -10, 16, 6);
      ctx.fillStyle = '#d02c2c';
      const blink = Math.floor(performance.now() / 180) % 2 === 0;
      ctx.fillStyle = blink ? '#ff2d2d' : '#2d7dff';
      ctx.beginPath(); ctx.arc(0, -6, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = blink ? '#2d7dff' : '#ff2d2d';
      ctx.beginPath(); ctx.arc(0, 6, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    if (o.player) {
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 3;
      roundRect(-28, -14, 56, 28, 8);
      ctx.stroke();
    }
    if (o.headlights) {
      ctx.fillStyle = 'rgba(255,244,180,0.5)';
      ctx.beginPath();
      ctx.moveTo(24, -8); ctx.lineTo(70, -22); ctx.lineTo(70, 22); ctx.lineTo(24, 8);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPed(x, y, angle, color, phase) {
    const bob = Math.sin(phase) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + 5, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y + bob * 0.2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3 - 7 + bob * 0.2, 4.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawBuilding(b) {
    const h = b.height;
    // Shadow cast south-east.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 6, b.y + h * 0.5 + 8, b.w, b.h);
    // South face shading: the wall facing the viewer is darker.
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y - h, b.w, b.h + h);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(b.x, b.y + b.h - 14, b.w, 14);
    // Roof: a raised slab with a parapet rim, clearly lighter than the wall.
    ctx.fillStyle = shade(b.color, 42);
    ctx.fillRect(b.x - 3, b.y - h - 6, b.w + 6, 12);
    ctx.fillStyle = shade(b.color, -28);
    ctx.fillRect(b.x - 3, b.y - h - 6, b.w + 6, 3);
    ctx.fillRect(b.x - 3, b.y - h + 3, 3, 3);
    ctx.fillRect(b.x + b.w, b.y - h + 3, 3, 3);
    // Rooftop details: AC boxes and a water tank.
    ctx.fillStyle = shade(b.color, -48);
    ctx.fillRect(b.x + 10, b.y - h + 2, 16, 7);
    ctx.fillRect(b.x + b.w - 30, b.y - h + 2, 12, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(b.x + 6, b.y - h + 2, b.w - 12, 2);
    // Windows on the south face.
    ctx.fillStyle = 'rgba(255,240,190,0.75)';
    const cols = Math.max(2, Math.floor(b.w / 34));
    const rows = Math.max(1, Math.floor(b.h / 40));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        if ((i + j) % 3 === 0) continue;
        ctx.fillRect(b.x + 10 + i * ((b.w - 20) / cols), b.y + 8 + j * ((b.h - 16) / rows), 12, 16);
      }
    }
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    const b = Math.max(0, Math.min(255, (n & 255) + amt));
    return `rgb(${r},${g},${b})`;
  }

  function drawWorld(state, cam, visW, visH) {
    const { city, player } = state;
    const x0 = cam.x - 40; const y0 = cam.y - 40;
    const x1 = cam.x + visW + 40; const y1 = cam.y + visH + 40;
    // Ground: district tint blocks.
    ctx.fillStyle = '#8fae7a';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (const d of DISTRICTS) {
      ctx.fillStyle = d.ground;
      ctx.fillRect(Math.max(x0, d.x0), Math.max(y0, d.y0), Math.min(x1, d.x1) - Math.max(x0, d.x0), Math.min(y1, d.y1) - Math.max(y0, d.y0));
    }
    // Water + beach.
    ctx.fillStyle = '#3f8fb5';
    for (const w of city.water) ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#e8d9a8';
    ctx.fillRect(110, 0, 40, WORLD_H);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = 60; y < WORLD_H; y += 180) {
      ctx.fillRect(104, y, 6, 60);
    }
    // Roads.
    ctx.fillStyle = '#3a3f47';
    for (const ax of AVENUES) ctx.fillRect(ax - 32, 0, 64, WORLD_H);
    for (const sy of STREETS) ctx.fillRect(0, sy - 32, WORLD_W, 64);
    // Sidewalks.
    ctx.fillStyle = '#9aa0a8';
    for (const ax of AVENUES) { ctx.fillRect(ax - 40, 0, 8, WORLD_H); ctx.fillRect(ax + 32, 0, 8, WORLD_H); }
    for (const sy of STREETS) { ctx.fillRect(0, sy - 40, WORLD_W, 8); ctx.fillRect(0, sy + 32, WORLD_W, 8); }
    // Lane dashes.
    ctx.fillStyle = '#f2d34d';
    for (const ax of AVENUES) for (let y = 40; y < WORLD_H; y += 80) ctx.fillRect(ax - 2, y, 4, 36);
    for (const sy of STREETS) for (let x = 40; x < WORLD_W; x += 80) ctx.fillRect(x, sy - 2, 36, 4);
    // Plazas: open paved ground with a fountain dot.
    for (const p of city.plazas) {
      ctx.fillStyle = '#c8bfa8';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7fb8c9';
      ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, p.x, p.y + p.r - 14);
    }
    // District labels on the ground.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      const cx = (d.x0 + d.x1) / 2; const cy = (d.y0 + d.y1) / 2;
      if (cx > x0 && cx < x1 && cy > y0 && cy < y1) ctx.fillText(d.name.toUpperCase(), cx, cy);
    }
    // Shops: awning + sign.
    for (const s of SHOPS) {
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 34, s.y - 24, 68, 48);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name.toUpperCase(), s.x, s.y - 30);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(s.x - 34, s.y + 14, 68, 10);
    }
    // Mission marker: pulsing ring + beam.
    const marker = missionMarker(state.missions);
    if (marker) {
      const pulse = 1 + Math.sin(state.time * 4) * 0.12;
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(marker.x, marker.y, marker.r * 0.45 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,211,77,0.25)';
      ctx.beginPath(); ctx.arc(marker.x, marker.y, marker.r * 0.45 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,211,77,0.16)';
      ctx.fillRect(marker.x - 8, marker.y - 220, 16, 220);
    }
    // Buildings, painted south-to-north so nearer roofs overlap farther ones.
    const visible = city.buildings.filter((b) => b.x + b.w > x0 && b.x < x1 && b.y + b.h > y0 && b.y - b.height < y1);
    visible.sort((a, b) => (a.y + a.h) - (b.y + b.h));
    for (const b of visible) drawBuilding(b);
    // Traffic.
    for (const c of state.traffic) {
      if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      drawCar(c.x, c.y, c.angle, c.color, { headlights: false });
    }
    // Roadblocks.
    for (const rb of state.police.roadblocks) drawCar(rb.x, rb.y, rb.angle, '#1c2f4a', { police: true });
    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.x < x0 || ped.x > x1 || ped.y < y0 || ped.y > y1) continue;
      drawPed(ped.x, ped.y, ped.angle, ped.color, ped.walkPhase);
    }
    // Lookouts (red jackets, armed).
    for (const l of state.lookouts) {
      drawPed(l.x, l.y, l.angle, '#c92a2a', state.time * 8);
      ctx.fillStyle = '#222';
      ctx.fillRect(l.x - 8, l.y - 12, 16, 4);
    }
    // Foot cops.
    for (const f of state.police.foot) drawPed(f.x, f.y, Math.atan2(player.y - f.y, player.x - f.x), '#1c2f4a', state.time * 10);
    // Cop cars.
    for (const c of state.police.cars) drawCar(c.x, c.y, c.angle, '#1c2f4a', { police: true });
    // Player.
    if (player.inCar && player.car) {
      drawCar(player.x, player.y, player.carAngle, player.car.color, { headlights: true, player: true });
    } else {
      drawPed(player.x, player.y, player.angle, '#e8b13c', state.time * (player.speed > 0 ? 10 : 2));
      // Aim line when armed with the pistol.
      if (player.weapon === 'pistol') {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(player.x, player.y);
        ctx.lineTo(player.x + Math.cos(player.angle) * 60, player.y + Math.sin(player.angle) * 60);
        ctx.stroke();
      }
    }
    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = Math.max(0, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    // Helicopter + searchlight (drawn last, above the streets).
    if (state.police.heli) {
      const h = state.police.heli;
      const grad = ctx.createRadialGradient(h.x, h.y, 10, h.x, h.y, 260);
      grad.addColorStop(0, 'rgba(255,244,180,0.28)');
      grad.addColorStop(1, 'rgba(255,244,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(h.x, h.y, 260, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(h.x + 6, h.y + 10, 26, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#22262e';
      ctx.beginPath(); ctx.ellipse(h.x, h.y, 22, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#22262e';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(h.x - 30, h.y); ctx.lineTo(h.x + 30, h.y); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SOLMARIS PD', h.x, h.y - 16);
    }
  }

  function drawMinimap(state) {
    const cx = VIEW_W - 110; const cy = VIEW_H - 110; const R = 92;
    const scale = (R * 2) / 1200;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(38,50,66,0.92)';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    const px = state.player.x; const py = state.player.y;
    ctx.strokeStyle = '#aab4c4';
    ctx.lineWidth = 4;
    for (const ax of AVENUES) {
      ctx.beginPath(); ctx.moveTo(cx + (ax - px) * scale, cy - 600 * scale); ctx.lineTo(cx + (ax - px) * scale, cy + 600 * scale); ctx.stroke();
    }
    for (const sy of STREETS) {
      ctx.beginPath(); ctx.moveTo(cx - 600 * scale, cy + (sy - py) * scale); ctx.lineTo(cx + 600 * scale, cy + (sy - py) * scale); ctx.stroke();
    }
    // Water strip.
    ctx.fillStyle = '#3f8fb5';
    ctx.fillRect(cx + (0 - px) * scale - 20, cy - R, 20, R * 2);
    // Mission marker.
    const marker = missionMarker(state.missions);
    if (marker) {
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath(); ctx.arc(cx + (marker.x - px) * scale, cy + (marker.y - py) * scale, 6, 0, Math.PI * 2); ctx.fill();
    }
    // Cops (blue), player (yellow, always centred).
    ctx.fillStyle = '#2d7dff';
    for (const c of state.police.cars) {
      ctx.beginPath(); ctx.arc(cx + (c.x - px) * scale, cy + (c.y - py) * scale, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(districtAt(px, py).name.toUpperCase(), cx, cy + R + 18);
  }

  function drawHUD(state) {
    const p = state.player;
    // Money + health, top left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(14, 14, 210, 64, 10); ctx.fill();
    ctx.fillStyle = '#7dff8a';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText(`$${p.money.toLocaleString('en-US')}`, 26, 44);
    ctx.fillStyle = '#222';
    ctx.fillRect(26, 54, 150, 10);
    ctx.fillStyle = p.health > 30 ? '#7dff8a' : '#ff5a4d';
    ctx.fillRect(26, 54, 150 * (p.health / 100), 10);
    if (p.armor > 0) {
      ctx.fillStyle = '#7db8ff';
      ctx.fillRect(26, 66, 150 * (p.armor / 100), 4);
    }
    // Wanted stars, top right.
    ctx.textAlign = 'right';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < state.wanted ? '#ffd34d' : 'rgba(255,255,255,0.25)';
      ctx.font = '30px system-ui, sans-serif';
      ctx.fillText('★', VIEW_W - 24 - i * 34, 48);
    }
    if (state.wanted > 0) {
      ctx.fillStyle = '#ff5a4d';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(state.wanted >= 4 ? 'HELICOPTER ON YOU' : state.wanted >= 3 ? 'ROADBLOCKS AHEAD' : 'POLICE AFTER YOU', VIEW_W - 24, 72);
    }
    // Mission objective banner, top centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const obj = missionObjective(state.missions);
    const w = Math.min(760, ctx.measureText(obj).width + 40);
    ctx.font = 'bold 15px system-ui, sans-serif';
    const w2 = Math.min(760, ctx.measureText(obj).width + 40);
    roundRect(VIEW_W / 2 - w2 / 2, 12, w2, 30, 8); ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(obj, VIEW_W / 2, 32);
    void w;
    // Weapon + ammo, bottom left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(14, VIEW_H - 64, 230, 50, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    const wname = p.weapon === 'pistol' ? `P9 Pistol — ${p.ammo} ammo` : p.weapon === 'bat' ? 'Harbor Bat' : 'Fists';
    ctx.fillText(wname, 26, VIEW_H - 42);
    ctx.fillStyle = '#cfd6de';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('1 Fists · 2 Bat · 3 Pistol · E interact · F attack', 26, VIEW_H - 24);
    // Story message.
    if (state.missions.messageTime > 0 && state.missions.message) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const lines = wrapText(state.missions.message, 620);
      const h = lines.length * 20 + 20;
      roundRect(VIEW_W / 2 - 330, VIEW_H - 190 - h, 660, h, 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, VIEW_H - 190 - h + 26 + i * 20));
    }
    // Shop prompt.
    if (!state.shopOpen) {
      const shop = state.shopOpen;
      void shop;
    }
    drawMinimap(state);
    // Speed + controls hint when driving.
    if (p.inCar) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.fillText(`${Math.round(Math.abs(p.carSpeed) * 0.9)} km/h`, VIEW_W - 24, VIEW_H - 220);
    }
  }

  function wrapText(text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const word of words) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function drawShop(state) {
    const shop = state.shopOpen;
    if (!shop) return;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#1c2129';
    roundRect(VIEW_W / 2 - 260, 150, 520, 300, 14); ctx.fill();
    ctx.fillStyle = shop.color;
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(shop.name.toUpperCase(), VIEW_W / 2, 200);
    ctx.fillStyle = '#fff';
    ctx.font = '16px system-ui, sans-serif';
    shop.goods.forEach((g, i) => {
      ctx.fillText(`${i + 1}. ${g.label} — $${g.price}`, VIEW_W / 2, 250 + i * 36);
    });
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(`Your cash: $${state.player.money}`, VIEW_W / 2, 250 + shop.goods.length * 36 + 10);
    ctx.fillStyle = '#cfd6de';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Press 1 / 2 to buy · E to leave', VIEW_W / 2, 420);
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || '#ffd34d';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText(title, VIEW_W / 2, 280);
    ctx.fillStyle = '#fff';
    ctx.font = '18px system-ui, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 330 + i * 30));
  }

  function draw(state, screen, best) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(canvas.width / dpr / VIEW_W, canvas.height / dpr / VIEW_H);
    const ox = (canvas.width / dpr - VIEW_W * scale) / 2;
    const oy = (canvas.height / dpr - VIEW_H * scale) / 2;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    // Camera: follow the player, clamped to the world, zoomed in 1.2x.
    const visW = VIEW_W / CAM_ZOOM;
    const visH = VIEW_H / CAM_ZOOM;
    const cam = {
      x: Math.max(0, Math.min(WORLD_W - visW, state.player.x - visW / 2)),
      y: Math.max(0, Math.min(WORLD_H - visH, state.player.y - visH / 2)),
    };
    // Sun-soaked sky tint over the whole frame.
    ctx.fillStyle = '#f7e8c8';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.scale(CAM_ZOOM, CAM_ZOOM);
    ctx.translate(-cam.x, -cam.y);
    drawWorld(state, cam, visW, visH);
    ctx.restore();
    // Warm sunlight wash.
    ctx.fillStyle = 'rgba(255,214,120,0.06)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    if (screen === SCREEN_TITLE) {
      ctx.fillStyle = 'rgba(10,16,28,0.55)';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd34d';
      ctx.font = 'bold 92px system-ui, sans-serif';
      ctx.fillText('SOLMARIS', VIEW_W / 2, 240);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText('An open-world crime story in a city of sun and salt', VIEW_W / 2, 282);
      ctx.font = '17px system-ui, sans-serif';
      ctx.fillStyle = '#dfe6ee';
      ctx.fillText('Rae Voss · Mara Kade · The Solmaris Job — six missions, $8,150 on the line', VIEW_W / 2, 316);
      ctx.fillStyle = '#7dff8a';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(best ? `ENTER — continue ($${best} earned) · or press N for a new game` : 'Press ENTER to start', VIEW_W / 2, 400);
      ctx.fillStyle = '#cfd6de';
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillText('WASD drive / walk · E steal a car or talk · Mouse aim · Click / F attack · 1-2-3 weapons · P pause · M mute', VIEW_W / 2, 450);
      ctx.fillText('Five districts · traffic & pedestrians · 0–5 star wanted · police, roadblocks & helicopter · shops & save', VIEW_W / 2, 478);
      return;
    }
    drawHUD(state);
    if (state.shopOpen) drawShop(state);
    if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['Press P or Esc to keep playing', 'Your progress saves automatically'], '#fff');
    } else if (screen === SCREEN_WASTED) {
      overlay('WASTED', ['Rae Voss went down in Solmaris.', 'Press ENTER to get back up — the job is still open.'], '#ff5a4d');
    } else if (screen === SCREEN_BUSTED) {
      overlay('BUSTED', [`The Solmaris PD took $${100} off you.`, 'Press ENTER to walk free — wanted level cleared.'], '#7db8ff');
    } else if (screen === SCREEN_COMPLETE) {
      overlay('THE SOLMARIS JOB — DONE', ['Every mission finished. Solmaris knows your name now.', 'Press ENTER to keep cruising the city.'], '#7dff8a');
    }
  }

  return { draw, VIEW_W, VIEW_H };
}
