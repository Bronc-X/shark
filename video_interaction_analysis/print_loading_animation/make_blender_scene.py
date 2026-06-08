from __future__ import annotations

import math
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent
OUT = ROOT / "renders"
OUT.mkdir(parents=True, exist_ok=True)

FPS = 30
DURATION_SECONDS = 16
END_FRAME = FPS * DURATION_SECONDS


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    alpha: float = 1.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.blend_method = "BLEND" if alpha < 1 else "OPAQUE"
    mat.use_screen_refraction = alpha < 1
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Alpha"].default_value = alpha
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.28 if alpha < 1 else 0
        if emission:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def cube(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    mat: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def curve_poly(
    name: str,
    points: list[tuple[float, float, float]],
    mat: bpy.types.Material,
    bevel: float,
    closed: bool = False,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = bevel
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (co[0], co[1], co[2], 1.0)
    spline.use_cyclic_u = closed
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def key_visibility(obj: bpy.types.Object, start: int, end: int = END_FRAME) -> None:
    obj.hide_viewport = True
    obj.hide_render = True
    obj.keyframe_insert("hide_viewport", frame=max(1, start - 2))
    obj.keyframe_insert("hide_render", frame=max(1, start - 2))
    obj.hide_viewport = False
    obj.hide_render = False
    obj.keyframe_insert("hide_viewport", frame=start)
    obj.keyframe_insert("hide_render", frame=start)
    obj.keyframe_insert("hide_viewport", frame=end)
    obj.keyframe_insert("hide_render", frame=end)


def animate_location(obj: bpy.types.Object, keys: list[tuple[int, tuple[float, float, float]]]) -> None:
    for frame, loc in keys:
        obj.location = loc
        obj.keyframe_insert("location", frame=frame)
    if obj.animation_data and obj.animation_data.action:
        for fcurve in obj.animation_data.action.fcurves:
            for key in fcurve.keyframe_points:
                key.interpolation = "SINE"


def aircraft_width(x: float) -> float:
    nose = 1 / (1 + math.exp(-(x + 2.45) / 0.22))
    tail = 1 / (1 + math.exp((x - 2.05) / 0.34))
    body = 0.42 * nose * tail
    cockpit = 0.15 * math.exp(-((x + 0.8) / 0.48) ** 2)
    return body + cockpit


def make_aircraft_layer(layer: int, total: int, mat: bpy.types.Material) -> bpy.types.Object:
    p = layer / (total - 1)
    z = 0.03 + p * 1.18
    section_scale = 0.72 + 0.28 * math.sin(p * math.pi)
    xs = [(-2.75 + i * (5.35 / 100)) for i in range(101)]
    top: list[tuple[float, float, float]] = []
    bottom: list[tuple[float, float, float]] = []
    for x in xs:
        wobble = 0.015 * math.sin(x * 8 + layer * 0.31)
        half = aircraft_width(x) * section_scale + wobble
        top.append((x, -half, z))
        bottom.append((x, half, z))
    return curve_poly(f"aircraft printed layer {layer:03d}", top + list(reversed(bottom)), mat, 0.008, True)


def make_wing_outline(name: str, side: float, mat: bpy.types.Material, z: float) -> bpy.types.Object:
    pts = [
        (-0.22, side * 0.42, z),
        (0.95, side * 2.85, z - 0.05),
        (1.72, side * 2.66, z - 0.08),
        (0.62, side * 0.42, z - 0.02),
    ]
    return curve_poly(name, pts, mat, 0.014, True)


def make_tail_outline(name: str, side: float, mat: bpy.types.Material, z: float) -> bpy.types.Object:
    pts = [
        (1.88, side * 0.30, z),
        (2.68, side * 1.44, z + 0.05),
        (2.42, side * 0.32, z - 0.08),
    ]
    return curve_poly(name, pts, mat, 0.013, True)


def create_scene() -> None:
    clear_scene()

    mat_bed = material("matte graphite bed", (0.018, 0.021, 0.024, 1), 0.46, 0.2)
    mat_grid = material("muted cyan technical lines", (0.18, 0.75, 0.78, 1), 0.22, 0, 1, (0.08, 0.9, 1, 1), 0.42)
    mat_layer = material("translucent amber printed resin", (1.0, 0.52, 0.16, 1), 0.2, 0, 0.78, (1.0, 0.42, 0.06, 1), 0.18)
    mat_hot = material("fresh amber extrusion", (1.0, 0.66, 0.22, 1), 0.18, 0, 1, (1.0, 0.52, 0.08, 1), 1.7)
    mat_cyan = material("cyan scan glass", (0.16, 0.88, 1.0, 1), 0.16, 0, 0.34, (0.02, 0.8, 1.0, 1), 0.9)
    mat_head = material("dark ceramic print head", (0.045, 0.052, 0.06, 1), 0.28, 0.35)

    bed = cube("thin graphite print bed", (0, 0, -0.05), (6.6, 4.4, 0.08), mat_bed)
    bed.modifiers.new("small bed bevel", "BEVEL").width = 0.035
    bed.modifiers.new("weighted bed normals", "WEIGHTED_NORMAL")

    for x in [i * 0.65 for i in range(-5, 6)]:
        curve_poly("print bed vertical guide", [(x, -2.0, 0.012), (x, 2.0, 0.012)], mat_grid, 0.003)
    for y in [i * 0.55 for i in range(-4, 5)]:
        curve_poly("print bed horizontal guide", [(-3.0, y, 0.014), (3.0, y, 0.014)], mat_grid, 0.003)

    total_layers = 70
    for idx in range(total_layers):
        layer_mat = mat_hot if idx > total_layers - 8 else mat_layer
        layer = make_aircraft_layer(idx, total_layers, layer_mat)
        key_visibility(layer, 34 + int((idx / (total_layers - 1)) * (END_FRAME - 96)))

    for obj in (
        make_wing_outline("left wing luminous outline", -1, mat_hot, 0.66),
        make_wing_outline("right wing luminous outline", 1, mat_hot, 0.66),
        make_tail_outline("left tailplane luminous outline", -1, mat_hot, 0.92),
        make_tail_outline("right tailplane luminous outline", 1, mat_hot, 0.92),
        curve_poly("vertical stabilizer luminous outline", [(1.75, 0, 0.78), (2.18, 0, 1.72), (2.46, 0, 0.82)], mat_hot, 0.014, True),
        curve_poly("cockpit cyan canopy outline", [(-1.36, -0.18, 1.02), (-0.7, -0.22, 1.28), (-0.2, -0.06, 1.1), (-0.72, 0.18, 0.98)], mat_cyan, 0.01, True),
    ):
        key_visibility(obj, int(END_FRAME * 0.34))

    head = cube("sleek print head", (-1.2, -1.2, 2.0), (0.62, 0.42, 0.28), mat_head)
    head.modifiers.new("print head bevel", "BEVEL").width = 0.045
    head.modifiers.new("weighted print head normals", "WEIGHTED_NORMAL")
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=0.085, radius2=0.035, depth=0.34, location=(-1.2, -1.2, 1.68))
    nozzle = bpy.context.object
    nozzle.name = "warm ceramic nozzle"
    nozzle.data.materials.append(mat_hot)
    nozzle.parent = head
    nozzle.location = (0, 0, -0.34)

    head_keys = []
    for i in range(12):
        t = i / 11
        angle = t * math.tau * 2.1
        x = -1.8 + t * 3.6 + math.sin(angle) * 0.35
        y = math.cos(angle) * 1.0
        z = 1.85 - t * 0.86
        head_keys.append((20 + i * 38, (x, y, z)))
    animate_location(head, head_keys)

    scan = cube("transparent cyan scanning sheet", (0, 0, 0.82), (0.018, 4.05, 1.7), mat_cyan)
    animate_location(scan, [(1, (-2.9, 0, 0.82)), (110, (2.9, 0, 0.82)), (240, (-1.4, 0, 0.82)), (END_FRAME, (2.1, 0, 0.82))])

    bpy.ops.object.light_add(type="AREA", location=(-2.7, -3.9, 4.2))
    key = bpy.context.object
    key.name = "large warm softbox"
    key.data.energy = 520
    key.data.size = 5.4

    bpy.ops.object.light_add(type="POINT", location=(2.2, 2.4, 2.0))
    rim = bpy.context.object
    rim.name = "cool cyan rim"
    rim.data.color = (0.3, 0.9, 1.0)
    rim.data.energy = 210

    bpy.ops.object.camera_add(location=(4.15, -4.55, 2.55), rotation=(math.radians(63), 0, math.radians(42)))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    camera.data.lens = 48
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = 5.5
    camera.data.dof.aperture_fstop = 5.0
    animate_location(camera, [(1, (4.25, -4.65, 2.55)), (END_FRAME // 2, (3.85, -4.35, 2.42)), (END_FRAME, (4.25, -4.65, 2.55))])

    scene = bpy.context.scene
    scene.frame_start = 1
    scene.frame_end = END_FRAME
    scene.frame_set(1)
    scene.render.fps = FPS
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_bloom = True
    scene.eevee.bloom_intensity = 0.065
    scene.eevee.bloom_radius = 5.0
    scene.world.color = (0.006, 0.007, 0.009)
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.filepath = str(OUT / "print_loading_loop.mp4")

    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / "print_loading_animation.blend"))


if __name__ == "__main__":
    create_scene()

