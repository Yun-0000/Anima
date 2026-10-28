import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * A small, warm room built for one fixed front view, like a stage set: the decor sits on both sides
 * and below about 1.8 m on the back wall, so nothing is cut off and the space behind the character stays calm.
 * Palette: cream walls, warm oak, sage green (the UI accent) and dusty rose.
 */
export function addRoom(scene: THREE.Scene) {
  const materials = new Map<number, THREE.MeshStandardMaterial>()
  // A little self-light keeps the colors soft.
  const material = (color: number) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9, emissive: color, emissiveIntensity: 0.18 }))
    return materials.get(color)!
  }
  function mesh(geometry: THREE.BufferGeometry, color: number | THREE.Material, x: number, y: number, z: number, shadow = true) {
    const object = new THREE.Mesh(geometry, typeof color === 'number' ? material(color) : color)
    object.position.set(x, y, z); object.castShadow = shadow; object.receiveShadow = true
    scene.add(object); return object
  }
  const box = (w: number, h: number, d: number, color: number, x: number, y: number, z: number, shadow = true) =>
    mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d, 0.04) / 3), color, x, y, z, shadow)
  const glow = (color: number) => new THREE.MeshBasicMaterial({ color })
  const halfWidth = 2.05, back = -1.12, front = 3.2, height = 3.2
  const depth = front - back, middle = (front + back) / 2
  const colors = { wall: 0xefe4d3, wainscot: 0xe4d6c1, trim: 0xf7f1e7, side: 0xe7dac7, wood: 0xb48b66, woodDark: 0x8f6b4e, sage: 0x93a98f, rose: 0xd9b8ad }

  // Walls, wainscot and chair rail
  box(halfWidth * 2, height, 0.08, colors.wall, 0, height / 2, back, false)
  box(halfWidth * 2, 0.62, 0.06, colors.wainscot, 0, 0.31, back + 0.04, false)
  box(halfWidth * 2, 0.035, 0.05, colors.trim, 0, 0.635, back + 0.08)
  box(halfWidth * 2, 0.09, 0.04, colors.trim, 0, 0.045, back + 0.08)
  for (let x = -1.65; x <= 1.66; x += 0.825) {
    for (const [w, h, dx, dy] of [[0.62, 0.016, 0, 0.21], [0.62, 0.016, 0, -0.21], [0.016, 0.42, -0.31, 0], [0.016, 0.42, 0.31, 0]]) {
      box(w, h, 0.012, colors.trim, x + dx, 0.34 + dy, back + 0.075, false)
    }
  }
  for (const side of [-1, 1]) {
    box(0.08, height, depth, colors.side, side * halfWidth, height / 2, middle, false)
    box(0.04, 0.62, depth, colors.wainscot, side * (halfWidth - 0.04), 0.31, middle, false)
    box(0.05, 0.035, depth, colors.trim, side * (halfWidth - 0.06), 0.635, middle)
    box(0.04, 0.09, depth, colors.trim, side * (halfWidth - 0.06), 0.045, middle)
  }

  // Floor. The seam color sits well below the boards: close beneath them it depth-fights with the rug on some GPUs.
  mesh(new THREE.BoxGeometry(halfWidth * 2, 0.02, depth), colors.woodDark, 0, -0.08, middle, false)
  const boards = [0xcaa47f, 0xc39b75, 0xd0ab87, 0xc6a07b]
  for (let index = 0, x = -halfWidth + 0.09; x < halfWidth; index++, x += 0.18) {
    let z = back - (index % 3) * 0.45
    for (let piece = 0; z < front; piece++) {
      const length = [1.35, 1.1, 1.6, 1.25][(index + piece) % 4]
      const start = Math.max(z, back), end = Math.min(z + length, front)
      if (end - start > 0.05) mesh(new THREE.BoxGeometry(0.172, 0.02, end - start - 0.008), boards[(index * 3 + piece) % 4], x, 0, (start + end) / 2, false)
      z += length
    }
  }

  // Rug. Its top (0.012) is the floor the feet stand on.
  const rug = mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.012, 72), colors.sage, 0, 0.006, 0.08, false)
  rug.scale.z = 0.78
  for (const [inner, outer] of [[0, 0.69], [0.7, 0.8]]) {
    const ring = mesh(new THREE.RingGeometry(inner, outer, 72), 0xf1e8d8, 0, 0.0125, 0.08, false)
    ring.rotation.x = -Math.PI / 2; ring.scale.y = 0.78
  }

  // Left shelf
  const shelfY = 1.3
  box(1.0, 0.05, 0.22, colors.wood, -1.12, shelfY, back + 0.15)
  const spines = [[0.3, 0x657c68], [0.27, 0x566c80], [0.24, 0xeee2c8], [0.29, 0xc1a578], [0.31, 0x515b73]]
  spines.forEach(([h, color], index) => {
    const book = box(0.085, h, 0.15, color, -1.52 + index * 0.095, shelfY + 0.025 + h / 2, back + 0.15)
    if (index === 4) { book.rotation.z = -0.12; book.position.x += 0.02 }
  })
  mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 20), 0xd8c7b2, -0.8, shelfY + 0.075, back + 0.15)
  for (let index = 0; index < 5; index++) {
    const leaf = mesh(new THREE.SphereGeometry(0.045, 10, 8), [0x7f9878, 0x6f8a69][index % 2], -0.8 + Math.sin(index * 1.3) * 0.04, shelfY + 0.15 + (index % 2) * 0.03, back + 0.15 + Math.cos(index * 1.3) * 0.02)
    leaf.scale.set(0.8, 1.1, 0.6)
  }
  const bulbs = glow(0xffe2a6)
  for (let index = 0; index <= 10; index++) {
    const t = index / 10
    mesh(new THREE.SphereGeometry(0.013, 8, 6), bulbs, -1.6 + t * 0.96, shelfY - 0.05 - Math.sin(t * Math.PI * 2) ** 2 * 0.05, back + 0.27, false)
  }
  // Frames
  const frame = (w: number, h: number, x: number, y: number, paint: (cx: number, cy: number) => void) => {
    box(w, h, 0.025, colors.wood, x, y, back + 0.09)
    box(w - 0.05, h - 0.05, 0.01, 0xfaf4e8, x, y, back + 0.105, false)
    paint(x, y)
  }
  frame(0.34, 0.26, -1.3, 0.98, (x, y) => {
    box(0.26, 0.07, 0.006, 0x9fb79f, x, y - 0.045, back + 0.112, false)
    mesh(new THREE.CircleGeometry(0.025, 16), glow(0xf0c987), x + 0.07, y + 0.035, back + 0.113, false)
  })
  frame(0.2, 0.26, -0.92, 1.0, (x, y) => {
    box(0.008, 0.13, 0.006, 0x7f9878, x, y - 0.02, back + 0.112, false)
    for (const [dx, dy] of [[-0.03, 0.02], [0.03, -0.01], [-0.025, -0.04]]) mesh(new THREE.CircleGeometry(0.022, 12), glow(0x93a98f), x + dx, y + dy, back + 0.113, false)
  })

  // Console, vase and corner plant
  const consoleX = -1.32, consoleZ = back + 0.3
  box(0.95, 0.04, 0.32, colors.wood, consoleX, 0.44, consoleZ)
  box(0.91, 0.3, 0.3, colors.wood, consoleX, 0.27, consoleZ)
  for (const dx of [-0.225, 0.225]) {
    box(0.42, 0.24, 0.01, 0xbd9672, consoleX + dx, 0.27, consoleZ + 0.152, false)
    box(0.06, 0.012, 0.015, colors.woodDark, consoleX + dx, 0.3, consoleZ + 0.16, false)
  }
  for (const dx of [-0.42, 0.42]) box(0.035, 0.12, 0.035, colors.woodDark, consoleX + dx, 0.06, consoleZ)
  mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.2, 20), 0xe9e1d4, consoleX - 0.25, 0.56, consoleZ)
  for (let index = 0; index < 5; index++) {
    const lean = (index - 2) * 0.2, length = 0.34 + (index % 2) * 0.06
    const stem = mesh(new THREE.CylinderGeometry(0.004, 0.004, length, 5), colors.woodDark, consoleX - 0.25 + Math.sin(lean) * length / 2, 0.64 + Math.cos(lean) * length / 2, consoleZ, false)
    stem.rotation.z = -lean
    for (const t of [0.6, 0.8, 1]) {
      mesh(new THREE.SphereGeometry(0.018, 8, 6), glow(index % 2 ? 0xf3d9cf : 0xf7e6df), consoleX - 0.25 + Math.sin(lean) * length * t, 0.64 + Math.cos(lean) * length * t, consoleZ, false)
    }
  }
  ;[[0.26, 0x657c68], [0.23, 0xe9dcc3], [0.2, 0xb9988f]].forEach(([w, color], index) => {
    box(w, 0.045, 0.18, color, consoleX + 0.2, 0.485 + index * 0.045, consoleZ).rotation.y = [0.1, -0.08, 0.15][index]
  })
  mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.3, 24), 0xd8c7b2, -1.86, 0.15, -0.35)
  mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.01, 24), 0x6b5745, -1.86, 0.3, -0.35, false)
  for (let index = 0; index < 9; index++) {
    const angle = index * 2.4, h = 0.35 + (index % 4) * 0.09
    const stem = mesh(new THREE.CylinderGeometry(0.006, 0.006, h, 5), 0x647d52, -1.86, 0.3 + h / 2, -0.35, false)
    stem.rotation.z = Math.sin(angle) * 0.28
    const leaf = mesh(new THREE.SphereGeometry(0.1, 12, 8), [0x70845a, 0x82936b, 0x5f7853][index % 3], -1.86 + Math.sin(angle) * 0.13, 0.31 + h, -0.35 + Math.cos(angle) * 0.08)
    leaf.scale.set(0.55, 1.1, 0.16); leaf.rotation.set(0.1, angle, -Math.sin(angle) * 0.6)
  }

  // Window and curtains
  const arch = (width: number, h: number) => {
    const shape = new THREE.Shape(); const r = width / 2
    shape.moveTo(-r, 0); shape.lineTo(r, 0); shape.lineTo(r, h - r)
    shape.absarc(0, h - r, r, 0, Math.PI, false); shape.lineTo(-r, 0)
    return shape
  }
  const windowX = 1.15, sill = 0.74
  const sky = new THREE.Mesh(new THREE.ShapeGeometry(arch(0.62, 0.92)), glow(0xbcdbe6))
  sky.position.set(windowX, sill, back + 0.06); scene.add(sky)
  for (const [x, y, size] of [[1.04, 1.4, 0.06], [1.27, 1.12, 0.045]]) {
    for (let index = 0; index < 3; index++) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), glow(0xf2f8f8))
      cloud.position.set(x + (index - 1) * size * 0.65, y + (index === 1 ? size * 0.3 : 0), back + 0.065)
      cloud.scale.set(1, 0.6, 0.05); scene.add(cloud)
    }
  }
  const frameShape = arch(0.74, 1.0)
  frameShape.holes.push(new THREE.Path(arch(0.62, 0.92).getPoints().map(point => point.add(new THREE.Vector2(0, 0.04)))))
  mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.04, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.01, bevelThickness: 0.01 }), 0xf4ede2, windowX, sill - 0.04, back + 0.08)
  box(0.018, 0.9, 0.02, 0xf4ede2, windowX, sill + 0.45, back + 0.09)
  box(0.62, 0.018, 0.02, 0xf4ede2, windowX, sill + 0.5, back + 0.09)
  box(0.86, 0.045, 0.14, 0xf4ede2, windowX, sill - 0.03, back + 0.13)
  mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.07, 16), 0xc98f74, windowX + 0.24, sill + 0.03, back + 0.13)
  const succulent = mesh(new THREE.SphereGeometry(0.05, 12, 8), 0x8fa889, windowX + 0.24, sill + 0.085, back + 0.13)
  succulent.scale.y = 0.7
  box(1.42, 0.022, 0.022, colors.woodDark, windowX, 1.84, back + 0.2)
  for (const side of [-1, 1]) {
    for (let fold = 0; fold < 5; fold++) {
      box(0.075, 1.36, 0.025, fold % 2 ? 0xd2b0a5 : colors.rose, windowX + side * (0.43 + fold * 0.055), 1.15, back + 0.19 + (fold % 2) * 0.025)
    }
  }
  const beam = new THREE.Shape()
  beam.moveTo(-0.27, 0); beam.lineTo(0.27, 0); beam.lineTo(0.02, 1.05); beam.lineTo(-0.5, 1.05); beam.lineTo(-0.27, 0)
  const sunlight = new THREE.Mesh(new THREE.ShapeGeometry(beam), new THREE.MeshBasicMaterial({ color: 0xfff1cc, transparent: true, opacity: 0.28, depthWrite: false }))
  sunlight.rotation.x = -Math.PI / 2; sunlight.position.set(windowX + 0.05, 0.017, back + 0.14); scene.add(sunlight)

  // Floor lamp
  const lampX = 1.78, lampZ = -0.62
  mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.025, 24), colors.woodDark, lampX, 0.0125, lampZ)
  mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 8), colors.woodDark, lampX, 0.6, lampZ)
  const shade = mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.24, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xf6e6c6, emissive: 0xffd89a, emissiveIntensity: 0.7, side: THREE.DoubleSide }), lampX, 1.3, lampZ, false)
  shade.castShadow = false
  const lampLight = new THREE.PointLight(0xffc98a, 0.8, 2.6, 1.6)
  lampLight.position.set(lampX, 1.25, lampZ); scene.add(lampLight)

  // Pouf and books in front
  const pouf = mesh(new THREE.SphereGeometry(0.25, 40, 24), colors.sage, -1.12, 0.12, 0.7)
  pouf.scale.set(1, 0.5, 0.86)
  mesh(new THREE.SphereGeometry(0.018, 10, 8), 0x7d9479, -1.12, 0.245, 0.7, false)
  ;[[0.28, 0x8a6f8c], [0.25, 0xeee2cc], [0.22, 0x5f7a8a]].forEach(([w, color], index) => {
    box(w, 0.045, 0.2 - index * 0.015, color, 1.12, 0.03 + index * 0.045, 0.72).rotation.y = [0.2, -0.12, 0.32][index]
  })
}
