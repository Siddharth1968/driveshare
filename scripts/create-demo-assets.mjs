import { mkdir, writeFile } from 'node:fs/promises';
const dir = 'apps/web/public/demo';
await mkdir(dir, { recursive: true });
const tree = (x, y, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="30" rx="28" ry="11" fill="#47674b" opacity=".1"/><path d="M0 28V-30" stroke="#8b8b68" stroke-width="5"/><ellipse cy="-32" rx="25" ry="37" fill="#9fae80"/><ellipse cx="-6" cy="-40" rx="18" ry="26" fill="#b7c49a"/></g>`;
const car = (x, y, s = 1, color = '#5e8f80') =>
  `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cy="14" rx="45" ry="11" fill="#3e5946" opacity=".13"/><rect x="-40" y="-10" width="80" height="23" rx="9" fill="${color}"/><path d="M-26-8l10-18h33l15 18" fill="${color}"/><path d="M-20-9l8-13h12v13zm25 0v-13h10l10 13" fill="#d7e4dd"/><circle cx="-25" cy="13" r="9" fill="#52665e"/><circle cx="-25" cy="13" r="4" fill="#c9d2c3"/><circle cx="25" cy="13" r="9" fill="#52665e"/><circle cx="25" cy="13" r="4" fill="#c9d2c3"/><path d="M-37-5h8m56 0h9" stroke="#eef1da" stroke-width="4"/></g>`;
const building = (x, y, w, h, color = '#e7deca') =>
  `<g transform="translate(${x} ${y})"><path d="M0 0h${w}v-${h}H0z" fill="${color}"/><path d="M0-${h}l${w / 2}-${h * 0.3} ${w / 2} ${h * 0.3}" fill="#afb99e"/><path d="M${w} 0l35-20v-${h}l-35 20" fill="#c7c9b2"/><rect x="${w * 0.15}" y="-${h * 0.73}" width="${w * 0.22}" height="${h * 0.27}" rx="2" fill="#98b2a4"/><rect x="${w * 0.61}" y="-${h * 0.73}" width="${w * 0.22}" height="${h * 0.27}" rx="2" fill="#98b2a4"/><rect x="${w * 0.36}" y="-${h * 0.32}" width="${w * 0.28}" height="${h * 0.32}" fill="#8fa392"/></g>`;
const wrap = (w, h, content, bg = '#edf0e3') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img"><rect width="${w}" height="${h}" fill="${bg}"/>${content}</svg>`;
const hero = `<defs><pattern id="p" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r=".6" fill="#d5ddc5"/></pattern></defs><rect width="800" height="660" fill="url(#p)" opacity=".45"/><ellipse cx="410" cy="430" rx="330" ry="160" fill="#dde5cc" opacity=".5"/><path d="M80 405l310-150 330 155-310 165z" fill="#d3dcc2"/><path d="M55 470l355-171 340 160-355 176z" fill="#e4e8db"/><path d="M55 470l355-171 340 160" fill="none" stroke="#c1ccb6" stroke-width="5"/><path d="M82 493l328-159 310 147" fill="none" stroke="#f7f8ee" stroke-width="3" stroke-dasharray="16 14"/><path d="M240 390l150-73 133 64-150 74z" fill="#b6c4aa"/><path d="M250 398l145-70 117 56-145 70z" fill="#e7e9de"/><path d="M280 390l95-45m-55 64l95-45m-55 64l95-45" stroke="#fafbf3" stroke-width="3"/>${building(370, 315, 155, 150)}${building(130, 390, 120, 108, '#e2ddcb')}${building(530, 415, 122, 100, '#dfdfca')}${tree(298, 268, 1.3)}${tree(640, 300, 1.4)}${tree(114, 420, 1.1)}${tree(534, 500, 0.8)}${tree(246, 507, 0.9)}${car(383, 409, 0.9)}${car(552, 493, 0.8, '#c2b591')}<rect x="304" y="302" width="30" height="36" rx="5" fill="#587c63"/><text x="319" y="327" text-anchor="middle" font-family="Arial" font-size="24" fill="white">P</text><path d="M319 338v26" stroke="#7b8e72" stroke-width="4"/><g fill="#f4f6eb"><path d="M90 157h46a15 15 0 00-27-10 12 12 0 00-19 10"/><path d="M500 110h70a22 22 0 00-40-12 18 18 0 00-30 12"/></g><path d="M582 160q7-8 14 0m-8-6q7-8 14 0" fill="none" stroke="#b2bda6" stroke-width="2"/>`;
await writeFile(`${dir}/hero-neighborhood.svg`, wrap(800, 660, hero, '#f4f5ed'));
for (let i = 1; i <= 3; i++) {
  const bg = ['#e8ecdf', '#e5e9df', '#ede9dd'][i - 1];
  let scene = `<rect y="360" width="900" height="220" fill="#d6ddcc"/><path d="M0 485h900" stroke="#eef1e7" stroke-width="50"/><path d="M0 485h900" stroke="#c4ccb9" stroke-width="2" stroke-dasharray="28 24"/>${building(120, 360, 230, 230, i === 2 ? '#e1d7c0' : '#e4dfcf')}${building(590, 350, 150, 160, '#d2d9c7')}<path d="M350 365h235v89H350z" fill="#c2cbbb"/><path d="M370 375v65m90-65v65m100-65v65" stroke="#f1f3e9" stroke-width="4"/>`;
  if (i === 1)
    scene +=
      '<path d="M330 265h278v24H330z" fill="#9aab91"/><path d="M340 289v141m258-141v141" stroke="#7f937d" stroke-width="8"/><path d="M315 267l170-59 140 59" fill="#b9c5a5"/>';
  if (i === 2)
    scene +=
      '<g stroke="#90a485" stroke-width="7"><path d="M350 340v80m28-80v80m28-80v80m28-80v80m28-80v80m28-80v80m28-80v80m28-80v80m28-80v80"/><path d="M350 355h224"/></g>';
  scene += `${car(475, 404, 1.35, ['#7b9f94', '#a3b49b', '#b9b393'][i - 1])}${tree(85, 390, 1.9)}${tree(805, 380, 2.2)}${tree(700, 428, 1.05)}<g><rect x="310" y="331" width="25" height="31" rx="3" fill="#658163"/><text x="323" y="354" text-anchor="middle" fill="white" font-family="Arial" font-size="22">P</text><path d="M323 362v39" stroke="#8a9d7b" stroke-width="4"/></g><text x="25" y="555" fill="#a4b093" font-family="Arial" font-size="10" letter-spacing="2">FICTIONAL DEMONSTRATION · ILLUSTRATED PARKING</text>`;
  await writeFile(`${dir}/parking-${i}.svg`, wrap(900, 580, scene, bg));
}
let map =
  '<defs><pattern id="grid" width="160" height="120" patternUnits="userSpaceOnUse"><rect x="12" y="12" width="136" height="96" rx="12" fill="#e2e9d6"/><path d="M0 0h160v120H0z" fill="none" stroke="#f5f6ee" stroke-width="10"/></pattern></defs><rect width="1000" height="1000" fill="url(#grid)"/><path d="M-50 740Q200 620 400 700T1100 490" fill="none" stroke="#cfddcf" stroke-width="55"/><path d="M-50 740Q200 620 400 700T1100 490" fill="none" stroke="#e4eee2" stroke-width="38"/><path d="M-20 270l1040 400M520-50L330 1050" stroke="#cdd5c0" stroke-width="35"/><path d="M-20 270l1040 400M520-50L330 1050" stroke="#fafaf2" stroke-width="28"/><path d="M-20 270l1040 400M520-50L330 1050" stroke="#dde2cf" stroke-width="2" stroke-dasharray="10 15"/><rect x="400" y="350" width="230" height="200" rx="45" fill="#d1dfbf"/><ellipse cx="535" cy="440" rx="65" ry="48" fill="#dce8cf"/>';
for (let i = 0; i < 60; i++) {
  const x = (i * 137 + 51) % 1000,
    y = (i * 193 + 70) % 1000;
  map += `<circle cx="${x}" cy="${y}" r="${8 + (i % 5)}" fill="#c0d0ad" opacity=".7"/>`;
}
map +=
  '<g fill="#a7b395" font-family="Arial" font-size="9" letter-spacing="2"><text x="80" y="180">ADYAR</text><text x="650" y="780">COLLEGE ROAD</text><text x="100" y="860">MANGALURU</text><text x="660" y="250">SAHYADRI AREA</text></g>';
await writeFile(`${dir}/campus-map.svg`, wrap(1000, 1000, map, '#e9edde'));
console.log('Created five local, fictional SVG demonstration assets.');
