"""Shrink a VRM without changing how it looks or moves.

Generic glTF tools drop the VRM extensions they do not know, so this rewrites only binary data:
- textures larger than --size are downscaled; opaque color textures become JPEG, anything with
  alpha (or used as a normal map) stays PNG;
- dense morph-target deltas become glTF sparse accessors (lossless: an expression moves only part of
  the face, the rest of its deltas are zero).
Rig, expressions, spring bones and all extensions are copied unchanged.

  python scripts/compress_vrm.py in.vrm out.vrm [--size 1024] [--quality 90]
"""
import argparse
import io
import json
import struct

import numpy as np

from PIL import Image


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, _ = struct.unpack('<4sII', data[:12])
    if magic != b'glTF' or version != 2: raise ValueError(f'{path} is not a glTF 2.0 binary')
    chunks, offset = {}, 12
    while offset < len(data):
        length, kind = struct.unpack('<I4s', data[offset:offset + 8])
        chunks[kind] = data[offset + 8:offset + 8 + length]
        offset += 8 + length
    return json.loads(chunks[b'JSON']), chunks.get(b'BIN\x00', b'')


def write_glb(path, gltf, binary):
    text = json.dumps(gltf, separators=(',', ':')).encode()
    text += b' ' * (-len(text) % 4)
    binary += b'\x00' * (-len(binary) % 4)
    body = struct.pack('<I4s', len(text), b'JSON') + text + struct.pack('<I4s', len(binary), b'BIN\x00') + binary
    with open(path, 'wb') as out:
        out.write(struct.pack('<4sII', b'glTF', 2, 12 + len(body)) + body)


def normal_maps(gltf):
    textures = {material['normalTexture']['index'] for material in gltf.get('materials', []) if 'normalTexture' in material}
    return {gltf['textures'][index]['source'] for index in textures if 'source' in gltf['textures'][index]}


def encode(image, keep_png, size, quality):
    if max(image.size) > size:
        image.thumbnail((size, size), Image.LANCZOS)
    has_alpha = image.mode in ('RGBA', 'LA', 'P') and image.convert('RGBA').getchannel('A').getextrema()[0] < 255
    out = io.BytesIO()
    if keep_png or has_alpha:
        image.save(out, 'PNG', optimize=True)
        return out.getvalue(), 'image/png'
    image.convert('RGB').save(out, 'JPEG', quality=quality, optimize=True)
    return out.getvalue(), 'image/jpeg'


COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def view_bytes(binary, view):
    start = view.get('byteOffset', 0)
    return binary[start:start + view['byteLength']]


def sparsify(gltf, binary, data):
    """Convert dense float morph-target accessors to sparse ones; returns the number converted."""
    views, accessors = gltf['bufferViews'], gltf['accessors']
    targets = {index for mesh in gltf['meshes'] for primitive in mesh['primitives'] for target in primitive.get('targets', []) for index in target.values()}
    converted = 0
    for index in sorted(targets):
        accessor = accessors[index]
        view_index = accessor.get('bufferView')
        if view_index is None or 'sparse' in accessor or accessor['componentType'] != 5126: continue
        view = views[view_index]
        if view.get('byteStride'): continue
        width = COMPONENTS[accessor['type']]
        start = accessor.get('byteOffset', 0)
        values = np.frombuffer(view_bytes(binary, view), np.float32, accessor['count'] * width, start).reshape(-1, width)
        rows = np.flatnonzero(np.any(values != 0, axis=1))
        # Sparse costs an index per row; only worth it when most rows are zero.
        if len(rows) * (width * 4 + 4) >= values.nbytes: continue
        index_type, index_dtype = (5123, np.uint16) if accessor['count'] < 65536 else (5125, np.uint32)
        data.append(rows.astype(index_dtype).tobytes()); views.append({'buffer': 0, 'byteLength': len(data[-1])})
        indices_view = len(views) - 1
        data.append(values[rows].astype(np.float32).tobytes()); views.append({'buffer': 0, 'byteLength': len(data[-1])})
        accessor.pop('bufferView'); accessor.pop('byteOffset', None)
        accessor['sparse'] = {'count': int(len(rows)), 'indices': {'bufferView': indices_view, 'componentType': index_type}, 'values': {'bufferView': len(views) - 1}}
        converted += 1
        if len(rows) == 0:
            # glTF requires sparse.count >= 1: keep one explicit zero.
            data[-2] = np.zeros(1, index_dtype).tobytes(); data[-1] = np.zeros(width, np.float32).tobytes()
            views[indices_view]['byteLength'] = len(data[-2]); views[-1]['byteLength'] = len(data[-1])
            accessor['sparse']['count'] = 1
    return converted


def compress(source, target, size=1024, quality=90):
    gltf, binary = read_glb(source)
    views = gltf['bufferViews']
    data = [view_bytes(binary, view) for view in views]
    normals = normal_maps(gltf)
    textures = 0
    for index, image in enumerate(gltf.get('images', [])):
        if 'bufferView' not in image: continue
        original = data[image['bufferView']]
        encoded, mime = encode(Image.open(io.BytesIO(original)), index in normals, size, quality)
        if len(encoded) < len(original):
            data[image['bufferView']] = encoded
            image['mimeType'] = mime
            textures += 1
    morphs = sparsify(gltf, binary, data)
    # Drop views nothing references any more, then re-pack the rest in order.
    used = {image['bufferView'] for image in gltf.get('images', []) if 'bufferView' in image}
    for accessor in gltf['accessors']:
        if 'bufferView' in accessor: used.add(accessor['bufferView'])
        if 'sparse' in accessor: used.update((accessor['sparse']['indices']['bufferView'], accessor['sparse']['values']['bufferView']))
    remap, kept, packed = {}, [], bytearray()
    for index, view in enumerate(views):
        if index not in used: continue
        packed += b'\x00' * (-len(packed) % 4)
        view['byteOffset'] = len(packed); view['byteLength'] = len(data[index])
        packed += data[index]
        remap[index] = len(kept); kept.append(view)
    gltf['bufferViews'] = kept
    for image in gltf.get('images', []):
        if 'bufferView' in image: image['bufferView'] = remap[image['bufferView']]
    for accessor in gltf['accessors']:
        if 'bufferView' in accessor: accessor['bufferView'] = remap[accessor['bufferView']]
        if 'sparse' in accessor:
            for part in ('indices', 'values'): accessor['sparse'][part]['bufferView'] = remap[accessor['sparse'][part]['bufferView']]
    gltf['buffers'][0]['byteLength'] = len(packed)
    write_glb(target, gltf, bytes(packed))
    return textures, morphs


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source'); parser.add_argument('target')
    parser.add_argument('--size', type=int, default=1024); parser.add_argument('--quality', type=int, default=90)
    args = parser.parse_args()
    textures, morphs = compress(args.source, args.target, args.size, args.quality)
    print(f'{args.target}: {textures} textures rewritten, {morphs} morph targets made sparse')
