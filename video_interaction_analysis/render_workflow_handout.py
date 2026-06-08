from __future__ import annotations

import math
import textwrap
from dataclasses import dataclass
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parent
USER_VIDEO = Path("C:/Users/Administrator/Documents/xwechat_files/broncin_80df/msg/video/2026-05/52aae05390942367b1285bd8956cd8f1_raw.mp4")
VIDEO = USER_VIDEO if USER_VIDEO.exists() else ROOT / "source.mp4"
OUT = ROOT / "workflow_handout"
FRAMES = OUT / "frames_clean"
OUT.mkdir(parents=True, exist_ok=True)
FRAMES.mkdir(parents=True, exist_ok=True)

LONG_PNG = OUT / "ai_to_tripo_3d_print_workflow_long.png"
LONG_PDF = OUT / "ai_to_tripo_3d_print_workflow_long.pdf"
PAGED_PDF = OUT / "ai_to_tripo_3d_print_workflow_pages.pdf"

FONT_REGULAR = Path("C:/Windows/Fonts/msyh.ttc")
FONT_BOLD = Path("C:/Windows/Fonts/msyhbd.ttc")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size)


@dataclass(frozen=True)
class Step:
    no: str
    time: float
    title: str
    subtitle: str
    body: str
    bullets: tuple[str, ...]
    detail_label: str
    detail_crop: tuple[float, float, float, float]
    full_crop: tuple[float, float, float, float] | None = None


STEPS = [
    Step(
        no="01",
        time=0.0,
        title="从买成品到自己定主题",
        subtitle="学生先选择航模方向、尺寸和风格，把参赛作品从一开始就变成自己的方案。",
        body="过去参赛作品容易停留在成品模型拼装，外观和结构相似度高。现在学生可以先确定船型、比例、颜色和创作描述，让作品从选题阶段就具备个人表达。",
        bullets=("选择航模类型和基础尺寸", "确定颜色、风格和作品方向", "用自然语言写下自己的创作设想"),
        detail_label="自主设定参赛作品",
        detail_crop=(0.12, 0.14, 0.34, 0.96),
        full_crop=(0.0, 0.0, 1.0, 0.86),
    ),
    Step(
        no="02",
        time=18.0,
        title="把想法先变成 2D 方案",
        subtitle="不需要复杂建模基础，学生用文字就能得到一张可讨论、可修改的航模概念图。",
        body="系统根据学生输入的描述生成 2D 概念图，让他们先看到自己的设计方向。相比直接买同款模型，学生能更早参与作品外观、比例和主题表达。",
        bullets=("用文字生成航模概念图", "先看方向是否符合自己的想法", "把 2D 图作为后续 3D 生成依据"),
        detail_label="想法生成概念图",
        detail_crop=(0.12, 0.78, 0.34, 0.92),
        full_crop=(0.0, 0.0, 1.0, 0.86),
    ),
    Step(
        no="03",
        time=26.0,
        title="确认自己的设计方向",
        subtitle="在进入 3D 前先看清主体轮廓和视觉效果，减少试错成本。",
        body="学生可以检查船体轮廓、甲板层级、装饰部件和整体风格是否符合自己的参赛想法。这个环节把“看不见的创意”变成能判断、能交流的图形方案。",
        bullets=("确认整体比例和造型是否清晰", "检查是否有个性化标识或主题元素", "保留适合打印和手工加工的结构"),
        detail_label="确认个性化方案",
        detail_crop=(0.26, 0.08, 0.63, 0.47),
        full_crop=(0.20, 0.02, 0.90, 0.72),
    ),
    Step(
        no="04",
        time=26.0,
        title="用语言继续加入创意",
        subtitle="想加什么、改哪里，都可以用文字表达，系统只围绕局部进行调整。",
        body="学生可以把自己的想象继续写进去，例如增加舰尾装置、调整甲板布局、加入识别编号或改变配色方向。创意不再受成品模型限制，作品差异会更明显。",
        bullets=("描述想增强的局部细节", "保留满意的主体结构", "让每个作品有更明显的个人特征"),
        detail_label="继续表达个人创意",
        detail_crop=(0.26, 0.59, 0.88, 0.72),
        full_crop=(0.20, 0.02, 0.90, 0.74),
    ),
    Step(
        no="05",
        time=36.0,
        title="形成专属参赛方案",
        subtitle="系统把原始图、修改描述和打印参数合并，生成更贴近学生想法的最终方案。",
        body="经过确认和微调后，学生得到一张自己的 2D 建模输入图。它不只是普通参考图，而是后续 3D 打印、手工打磨和网赛展示的作品基础。",
        bullets=("把创意修改合并进最终方案", "保持主体一致，减少重复返工", "为 3D 打印和后续制作做准备"),
        detail_label="生成专属方案",
        detail_crop=(0.26, 0.55, 0.88, 0.76),
        full_crop=(0.20, 0.02, 0.90, 0.78),
    ),
    Step(
        no="06",
        time=50.0,
        title="一键转成可打印模型",
        subtitle="平台把 2D 设计图交给 Tripo 生成 STL，让学生跨过复杂 3D 建模门槛。",
        body="学生不需要先掌握专业 3D 软件，也能把自己的设计转成可打印模型。技术门槛降低后，更多精力可以放在主题构思、结构优化和后续手工制作上。",
        bullets=("提交最终 2D 图和尺寸参数", "自动生成 3D 打印所需 STL", "把创意从图纸推进到实体作品"),
        detail_label="降低 3D 建模门槛",
        detail_crop=(0.28, 0.68, 0.90, 0.82),
        full_crop=(0.20, 0.02, 0.90, 0.78),
    ),
    Step(
        no="07",
        time=62.0,
        title="让生成过程可见可控",
        subtitle="生成、校验和保存都有进度反馈，老师和学生都能理解作品正在经历哪些步骤。",
        body="平台会展示建模和文件处理进度，避免学生只是在空等。对于网赛组织方来说，这也让作品生成过程更透明，更容易形成标准化的参赛支持流程。",
        bullets=("看到生成和校验进度", "降低学生等待时的不确定感", "便于老师或组织方跟进作品状态"),
        detail_label="过程透明可追踪",
        detail_crop=(0.38, 0.50, 0.76, 0.78),
        full_crop=(0.25, 0.05, 0.84, 0.82),
    ),
    Step(
        no="08",
        time=84.0,
        title="打印、拼装并完成展示",
        subtitle="最终得到 STL 文件后，学生还能继续完成打印、拼装、打磨、涂装和展示。",
        body="这一步不是替代动手能力，而是把动手创造力往前延伸。学生从“拼装同款成品”变成“设计自己的模型，再亲手完成实体作品和参赛展示”。",
        bullets=("检查尺寸和模型细节", "下载 STL 进入 3D 打印", "通过拼装、打磨、涂装完成参赛作品"),
        detail_label="从模型到参赛作品",
        detail_crop=(0.58, 0.80, 0.90, 0.90),
        full_crop=(0.22, 0.05, 0.90, 0.86),
    ),
]


def extract_frame(video: Path, seconds: float) -> Image.Image:
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video}")
    cap.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise RuntimeError(f"Cannot read frame at {seconds}s")
    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image = Image.fromarray(frame)
    image.save(FRAMES / f"t_{seconds:06.2f}.jpg", quality=92)
    return image


def crop_ratio(img: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    w, h = img.size
    x1, y1, x2, y2 = box
    return img.crop((round(w * x1), round(h * y1), round(w * x2), round(h * y2)))


def cover_image(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    w, h = img.size
    tw, th = size
    scale = max(tw / w, th / h)
    nw, nh = round(w * scale), round(h * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return resized.crop((left, top, left + tw, top + th))


def contain_image(img: Image.Image, size: tuple[int, int], bg=(245, 247, 240)) -> Image.Image:
    w, h = img.size
    tw, th = size
    scale = min(tw / w, th / h)
    nw, nh = round(w * scale), round(h * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGB", size, bg)
    out.paste(resized, ((tw - nw) // 2, (th - nh) // 2))
    return out


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def paste_round(
    base: Image.Image,
    img: Image.Image,
    xy: tuple[int, int],
    radius: int = 26,
    shadow: bool = True,
    border=(222, 231, 221),
    border_width: int = 2,
) -> None:
    x, y = xy
    if shadow:
        sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sh_draw = ImageDraw.Draw(sh)
        sh_draw.rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius=radius, fill=(16, 40, 33, 74))
        sh = sh.filter(ImageFilter.GaussianBlur(20))
        base.alpha_composite(sh, (x + 8, y + 16))
    mask = rounded_mask(img.size, radius)
    rounded = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rounded.paste(img.convert("RGBA"), (0, 0), mask)
    base.alpha_composite(rounded, xy)
    bd = ImageDraw.Draw(base)
    for i in range(border_width):
        bd.rounded_rectangle(
            (x + i, y + i, x + img.size[0] - 1 - i, y + img.size[1] - 1 - i),
            radius=radius,
            outline=border,
            width=1,
        )


def draw_text_block(
    draw: ImageDraw.ImageDraw,
    text: str,
    xy: tuple[int, int],
    max_width: int,
    font_obj: ImageFont.FreeTypeFont,
    fill,
    line_gap: int = 12,
    max_lines: int | None = None,
) -> int:
    x, y = xy
    lines: list[str] = []
    for para in text.split("\n"):
        current = ""
        for ch in para:
            test = current + ch
            if draw.textlength(test, font=font_obj) <= max_width:
                current = test
            else:
                if ch in "，。；：、！？）」』》”’":
                    current = test
                    continue
                if current:
                    lines.append(current)
                current = ch
        if current:
            lines.append(current)
    if max_lines is not None:
        lines = lines[:max_lines]
    line_h = font_obj.size + line_gap
    for line in lines:
        draw.text((x, y), line, font=font_obj, fill=fill)
        y += line_h
    return y


def draw_pill(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, fill, stroke, text_fill, fnt) -> tuple[int, int]:
    x, y = xy
    pad_x, pad_y = 18, 9
    w = round(draw.textlength(text, font=fnt)) + pad_x * 2
    h = fnt.size + pad_y * 2
    draw.rounded_rectangle((x, y, x + w, y + h), radius=h // 2, fill=fill, outline=stroke, width=1)
    draw.text((x + pad_x, y + pad_y - 1), text, font=fnt, fill=text_fill)
    return w, h


def gradient_background(w: int, h: int) -> Image.Image:
    img = Image.new("RGB", (w, h), "#f4f7ef")
    px = img.load()
    for y in range(h):
        for x in range(w):
            nx = x / w
            ny = y / h
            glow = math.exp(-(((nx - 0.84) / 0.48) ** 2 + ((ny - 0.02) / 0.22) ** 2))
            lower = math.exp(-(((nx - 0.08) / 0.52) ** 2 + ((ny - 0.96) / 0.28) ** 2))
            r = int(244 - 11 * ny + 15 * glow + 4 * lower)
            g = int(247 - 13 * ny + 24 * glow + 10 * lower)
            b = int(239 - 18 * ny + 10 * glow + 5 * lower)
            px[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
    return img


def make_connector(draw: ImageDraw.ImageDraw, x: int, y1: int, y2: int, color=(19, 122, 87)) -> None:
    draw.line((x, y1, x, y2), fill=color + (120,), width=3)
    draw.ellipse((x - 8, y1 - 8, x + 8, y1 + 8), fill=color)
    draw.ellipse((x - 8, y2 - 8, x + 8, y2 + 8), fill=color)


def render() -> Image.Image:
    frames = {step.time: extract_frame(VIDEO, step.time) for step in STEPS}

    width = 1800
    margin = 110
    hero_h = 820
    step_h = 760
    gap = 56
    footer_h = 500
    height = hero_h + len(STEPS) * step_h + (len(STEPS) - 1) * gap + footer_h

    canvas = gradient_background(width, height).convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    green = (0, 125, 91)
    dark = (19, 38, 34)
    muted = (78, 94, 86)
    panel = (255, 255, 250, 236)
    panel_line = (210, 224, 213)
    gold = (190, 147, 63)

    # Hero
    draw.rounded_rectangle((margin, 66, width - margin, hero_h - 70), radius=34, fill=(21, 44, 37, 246))
    draw.rounded_rectangle((margin + 2, 68, width - margin - 2, hero_h - 72), radius=32, outline=(83, 124, 103, 115), width=2)
    draw.text((margin + 70, 96), "lusie.cn", font=font(28, True), fill=(213, 232, 218))
    draw.text((margin + 70, 132), "全国首个青少年 AI 模型创作平台", font=font(52, True), fill=(248, 251, 244))
    draw_text_block(
        draw,
        "全国青少年航模网赛 AI 制作模型升级",
        (margin + 74, 232),
        560,
        font(30, True),
        (211, 224, 214),
        line_gap=14,
    )
    draw_text_block(
        draw,
        "面向对象：全国航模青少年网赛参赛学生、指导老师和赛事组织方。",
        (margin + 74, 336),
        560,
        font(25),
        (235, 242, 235),
        line_gap=12,
    )
    draw_text_block(
        draw,
        "核心变化：降低设计门槛，打破同质化，让每个学生都有机会做出属于自己的航模作品。",
        (margin + 74, 444),
        560,
        font(25),
        (235, 242, 235),
        line_gap=12,
    )

    hero_2d = contain_image(crop_ratio(frames[26.0], (0.26, 0.08, 0.63, 0.47)), (500, 350), bg=(238, 244, 236))
    hero_3d = contain_image(crop_ratio(frames[84.0], (0.20, 0.05, 0.90, 0.86)), (500, 350), bg=(238, 244, 236))
    paste_round(canvas, hero_2d, (width - margin - 870, 310), radius=28, border=(96, 145, 119), shadow=True)
    paste_round(canvas, hero_3d, (width - margin - 520, 210), radius=28, border=(96, 145, 119), shadow=True)
    draw.text((width - margin - 825, 245), "2D", font=font(24, True), fill=(230, 246, 236))
    draw.text((width - margin - 320, 145), "STL", font=font(24, True), fill=(230, 246, 236))
    draw.line((width - margin - 360, 395, width - margin - 500, 480), fill=(219, 184, 101, 190), width=5)
    draw.polygon(
        [(width - margin - 496, 478), (width - margin - 518, 478), (width - margin - 504, 496)],
        fill=(219, 184, 101, 220),
    )

    # Steps
    y = hero_h
    axis_x = margin + 38
    for i, step in enumerate(STEPS):
        card_x = margin + 80
        card_y = y
        card_w = width - margin * 2 - 80
        card_h = step_h
        make_connector(draw, axis_x, y + 72, y + step_h + (gap if i < len(STEPS) - 1 else 0) - 20)
        draw.ellipse((axis_x - 32, y + 58, axis_x + 32, y + 122), fill=green, outline=(208, 231, 218), width=5)
        draw.text((axis_x - 21, y + 72), step.no, font=font(22, True), fill=(255, 255, 250))
        draw.rounded_rectangle((card_x, card_y, card_x + card_w, card_y + card_h), radius=30, fill=panel, outline=panel_line, width=2)

        text_x = card_x + 54
        shot_x = card_x + 675
        top = card_y + 54
        draw.text((text_x, top), step.title, font=font(38, True), fill=dark)
        draw_text_block(draw, step.subtitle, (text_x, top + 58), 520, font(24, True), green, line_gap=10)
        body_y = draw_text_block(draw, step.body, (text_x, top + 130), 520, font(23), muted, line_gap=12)

        bullet_y = body_y + 32
        for b in step.bullets:
            draw.ellipse((text_x, bullet_y + 11, text_x + 10, bullet_y + 21), fill=gold)
            bullet_y = draw_text_block(draw, b, (text_x + 26, bullet_y), 500, font(22), dark, line_gap=8)
            bullet_y += 8

        frame = frames[step.time]
        shot_source = crop_ratio(frame, step.full_crop) if step.full_crop else frame
        screenshot = contain_image(shot_source, (770, 468), bg=(245, 248, 241))
        paste_round(canvas, screenshot, (shot_x, top), radius=24, border=(207, 221, 210), shadow=True)

        detail_box = Image.new("RGBA", (770, 172), (239, 247, 241, 238))
        db = ImageDraw.Draw(detail_box)
        db.rounded_rectangle((0, 0, 769, 171), radius=22, fill=(239, 247, 241, 238), outline=(148, 188, 164), width=2)
        db.rounded_rectangle((18, 18, 246, 60), radius=21, fill=(20, 60, 48, 235))
        db.text((38, 25), step.detail_label, font=font(20, True), fill=(245, 252, 247))
        detail_text = "关键操作：" + "；".join(step.bullets)
        draw_text_block(db, detail_text, (34, 92), 700, font(21), (40, 70, 59), line_gap=7, max_lines=2)
        paste_round(canvas, detail_box, (shot_x, top + 500), radius=22, border=(148, 188, 164), shadow=False)

        y += step_h + gap

    # Footer
    footer_y = y + 18
    draw.rounded_rectangle((margin, footer_y, width - margin, footer_y + 380), radius=34, fill=(246, 250, 244, 242), outline=(205, 219, 207), width=2)
    draw.text((margin + 70, footer_y + 62), "对外展示要点", font=font(38, True), fill=dark)
    summary = [
        ("从同款拼装到个性表达", "学生不再只能购买相似成品，而是可以把自己的主题、配色、编号和结构想法体现在作品里。"),
        ("从专业门槛到人人可做", "自然语言和 2D 确认图降低了 3D 设计门槛，让更多青少年能参与模型设计和参赛创作。"),
        ("从手工拼装到创造展示", "打印后仍保留拼装、打磨、涂装和展示环节，动手能力与想象力都能在作品中体现。"),
    ]
    sx = margin + 70
    card_w = 455
    card_gap = 35
    for title, desc in summary:
        draw.rounded_rectangle((sx, footer_y + 135, sx + card_w, footer_y + 300), radius=22, fill=(255, 255, 251), outline=(213, 225, 215), width=2)
        draw.text((sx + 28, footer_y + 160), title, font=font(25, True), fill=green)
        draw_text_block(draw, desc, (sx + 28, footer_y + 198), card_w - 56, font(19), muted, line_gap=8)
        sx += card_w + card_gap

    draw.text((margin, height - 86), "全国航模青少年网赛 | 个性化设计 -> 3D 打印 -> 手工制作 -> 参赛展示", font=font(18), fill=(110, 125, 118))
    draw.text((width - margin - 230, height - 86), "lusie.cn", font=font(22, True), fill=green)

    return canvas.convert("RGB")


def save_paged_pdf(long_img: Image.Image, target: Path) -> None:
    page_w, page_h = 1240, 1754
    scale = page_w / long_img.width
    scaled_h = round(long_img.height * scale)
    scaled = long_img.resize((page_w, scaled_h), Image.Resampling.LANCZOS)
    pages: list[Image.Image] = []
    y = 0
    while y < scaled_h:
        page = Image.new("RGB", (page_w, page_h), "#f4f7ef")
        crop = scaled.crop((0, y, page_w, min(y + page_h, scaled_h)))
        page.paste(crop, (0, 0))
        pages.append(page)
        y += page_h
    pages[0].save(target, save_all=True, append_images=pages[1:], resolution=150)


def main() -> None:
    long_img = render()
    long_img.save(LONG_PNG, quality=95)
    long_img.save(LONG_PDF, resolution=150)
    save_paged_pdf(long_img, PAGED_PDF)
    print(f"Saved: {LONG_PNG}")
    print(f"Saved: {LONG_PDF}")
    print(f"Saved: {PAGED_PDF}")


if __name__ == "__main__":
    main()
