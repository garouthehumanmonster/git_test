"""
High-Resolution 2D Raster Sprite Generator for Timeline War.
Builds crisp, anti-aliased 2D sprites with rich anatomical detail,
metallic highlights, shaded armor, weapons, and team heraldry.
Outputs to public/atlas/units/ and public/atlas/bases/.
"""
import os
import math
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNITS_DIR = os.path.join(ROOT, "public", "atlas", "units")
BASES_DIR = os.path.join(ROOT, "public", "atlas", "bases")
os.makedirs(UNITS_DIR, exist_ok=True)
os.makedirs(BASES_DIR, exist_ok=True)

# Team heraldry colors
TEAMS = {
    "player": {
        "primary": (83, 182, 255),      # #53b6ff vivid cyan
        "dark": (26, 92, 160),         # deep cyan shadow
        "light": (195, 235, 255),      # bright cyan highlight
        "glow": (83, 182, 255, 180),
    },
    "ai": {
        "primary": (255, 91, 91),       # #ff5b5b vivid crimson
        "dark": (160, 26, 26),         # deep crimson shadow
        "light": (255, 195, 195),      # bright crimson highlight
        "glow": (255, 91, 91, 180),
    }
}

OUTLINE = (26, 21, 40)  # #1a1528 dark ink

def rgba(c, a=255):
    return (c[0], c[1], c[2], a)

# ==============================================================================
# STONE AGE SPRITES
# ==============================================================================

def draw_stone_clubber(side):
    # 160x112 canvas, foot at 104
    im = Image.new("RGBA", (160, 112), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    skin = (217, 162, 94)
    skin_dark = (138, 90, 44)
    fur = (77, 55, 32)
    wood = (110, 75, 40)
    wood_dark = (55, 35, 20)
    stone = (160, 160, 165)
    stone_dark = (90, 90, 95)

    # 1. Left arm holding shield
    d.polygon([(40, 45), (55, 48), (48, 62), (36, 58)], fill=skin_dark, outline=OUTLINE)
    # Shield (round wood with team paint)
    d.ellipse([(20, 40), (52, 78)], fill=wood_dark, outline=OUTLINE, width=2)
    d.ellipse([(24, 44), (48, 74)], fill=team["primary"])
    d.ellipse([(28, 48), (44, 70)], fill=team["dark"])
    d.ellipse([(33, 56), (39, 62)], fill=stone, outline=OUTLINE)

    # 2. Legs & feet (ground at y=104)
    # Back leg
    d.polygon([(65, 75), (76, 75), (78, 104), (66, 104)], fill=skin_dark, outline=OUTLINE)
    d.polygon([(64, 100), (84, 100), (84, 104), (64, 104)], fill=fur, outline=OUTLINE)
    # Front leg
    d.polygon([(82, 75), (96, 75), (98, 104), (84, 104)], fill=skin, outline=OUTLINE)
    d.polygon([(82, 100), (102, 100), (102, 104), (82, 104)], fill=fur, outline=OUTLINE)

    # 3. Loincloth / fur skirt
    d.polygon([(58, 68), (102, 68), (96, 84), (84, 88), (72, 85), (60, 80)], fill=fur, outline=OUTLINE)
    d.polygon([(70, 68), (88, 68), (86, 84), (72, 84)], fill=team["primary"], outline=OUTLINE)

    # 4. Muscular torso
    d.polygon([(62, 40), (98, 40), (96, 72), (64, 72)], fill=skin, outline=OUTLINE)
    # Chest muscle shading
    d.arc([(68, 46), (80, 56)], 0, 180, fill=skin_dark, width=2)
    d.arc([(80, 46), (92, 56)], 0, 180, fill=skin_dark, width=2)
    d.line([(80, 46), (80, 68)], fill=skin_dark, width=2)
    # Bone necklace
    d.arc([(68, 38), (92, 50)], 0, 180, fill=(240, 235, 215), width=3)
    d.polygon([(78, 48), (82, 48), (80, 54)], fill=(255, 255, 240))

    # 5. Head & face
    # Wild hair back
    d.ellipse([(66, 12), (102, 44)], fill=wood_dark, outline=OUTLINE)
    # Head
    d.ellipse([(72, 18), (98, 42)], fill=skin, outline=OUTLINE)
    # Team headband
    d.rectangle([(71, 24), (99, 29)], fill=team["primary"], outline=OUTLINE)
    # Eye & brow
    d.line([(82, 28), (93, 28)], fill=skin_dark, width=2)
    d.rectangle([(88, 30), (92, 33)], fill=OUTLINE)
    d.rectangle([(89, 31), (91, 32)], fill=(255, 255, 255))
    # Nose & bearded jaw
    d.polygon([(94, 30), (98, 34), (94, 35)], fill=skin_dark)
    d.polygon([(74, 34), (96, 34), (92, 44), (76, 42)], fill=wood_dark)

    # 6. Right arm raised with spiked heavy club
    # Arm raised
    d.polygon([(92, 42), (108, 32), (114, 18), (102, 14), (90, 36)], fill=skin, outline=OUTLINE)
    # Spiked heavy wooden club
    d.polygon([(104, 20), (124, 6), (148, 12), (154, 24), (128, 30), (108, 24)], fill=wood, outline=OUTLINE, width=2)
    d.polygon([(122, 10), (146, 15), (150, 22), (126, 26)], fill=wood_dark)
    # Stone spikes/flakes embedded in club
    for (sx, sy, ex, ey) in [(130, 4, 134, 10), (144, 4, 146, 12), (154, 16, 158, 20), (148, 26, 142, 32)]:
        d.polygon([(sx, sy), (ex, ey), (sx+3, sy+3)], fill=stone, outline=OUTLINE)

    return im

def draw_stone_mammoth(side):
    # 192x144 canvas, foot at 136
    im = Image.new("RGBA", (192, 144), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    fur_base = (65, 45, 25)
    fur_mid = (95, 68, 40)
    fur_light = (135, 95, 55)
    ivory = (245, 240, 220)
    ivory_shadow = (195, 185, 160)

    # 1. Back legs
    d.polygon([(36, 90), (56, 90), (54, 136), (32, 136)], fill=fur_base, outline=OUTLINE, width=2)
    d.polygon([(32, 128), (56, 128), (54, 136), (30, 136)], fill=(45, 30, 15), outline=OUTLINE)
    # 2. Front back-leg
    d.polygon([(118, 90), (138, 90), (136, 136), (114, 136)], fill=fur_base, outline=OUTLINE, width=2)

    # 3. Massive main body
    d.ellipse([(20, 52), (148, 120)], fill=fur_mid, outline=OUTLINE, width=2)
    # Muscular hump
    d.ellipse([(60, 36), (120, 84)], fill=fur_light)

    # Shaggy belly fur fringe
    fur_fringe = []
    for x in range(24, 140, 8):
        fur_fringe.extend([(x, 114), (x+4, 124), (x+8, 114)])
    d.polygon(fur_fringe, fill=fur_base)

    # 4. Fore legs
    # Left front leg
    d.polygon([(52, 94), (74, 94), (72, 136), (50, 136)], fill=fur_mid, outline=OUTLINE, width=2)
    d.polygon([(50, 128), (74, 128), (72, 136), (48, 136)], fill=(45, 30, 15), outline=OUTLINE)
    # Right front leg
    d.polygon([(132, 94), (154, 94), (152, 136), (130, 136)], fill=fur_mid, outline=OUTLINE, width=2)
    d.polygon([(130, 128), (154, 128), (152, 136), (128, 136)], fill=(45, 30, 15), outline=OUTLINE)

    # 5. Tail
    d.line([(22, 68), (10, 88), (12, 102)], fill=fur_base, width=4)
    d.ellipse([(8, 98), (16, 110)], fill=fur_base)

    # 6. Team war blanket with fringe
    d.polygon([(56, 58), (122, 58), (116, 86), (50, 86)], fill=team["primary"], outline=OUTLINE, width=2)
    d.polygon([(62, 64), (114, 64), (110, 80), (58, 80)], fill=team["dark"])
    # Gold fringe
    for x in range(50, 116, 6):
        d.line([(x, 86), (x, 92)], fill=(244, 200, 91), width=2)

    # 7. Head, ears & trunk
    # Head dome
    d.ellipse([(124, 38), (170, 92)], fill=fur_mid, outline=OUTLINE, width=2)
    d.ellipse([(130, 42), (164, 78)], fill=fur_light)
    # Ear flap
    d.ellipse([(118, 54), (136, 82)], fill=fur_base, outline=OUTLINE)
    # Eye
    d.ellipse([(150, 56), (156, 62)], fill=OUTLINE)
    d.ellipse([(152, 57), (154, 59)], fill=(255, 255, 255))
    # Curled trunk
    trunk_pts = [(160, 76), (170, 86), (176, 102), (174, 118), (166, 126), (156, 122), (158, 114), (166, 114), (168, 102), (160, 88), (152, 80)]
    d.polygon(trunk_pts, fill=fur_mid, outline=OUTLINE, width=2)

    # 8. Massive ivory tusks
    # Left tusk (foreground)
    tusk_pts = [(152, 84), (168, 92), (184, 88), (190, 72), (184, 56), (180, 58), (182, 70), (172, 82), (156, 86)]
    d.polygon(tusk_pts, fill=ivory, outline=OUTLINE, width=2)
    d.polygon([(156, 86), (172, 82), (182, 70), (180, 74), (170, 86)], fill=ivory_shadow)

    # 9. Chieftain rider
    # Torso
    d.rectangle([(76, 26), (96, 52)], fill=fur_base, outline=OUTLINE)
    d.rectangle([(80, 30), (92, 48)], fill=team["primary"])
    # Head & war band
    d.ellipse([(78, 10), (94, 28)], fill=(217, 162, 94), outline=OUTLINE)
    d.rectangle([(77, 14), (95, 18)], fill=team["primary"])
    # Spear with team pennant
    d.line([(100, 2), (76, 56)], fill=(110, 75, 40), width=3)
    d.polygon([(100, 0), (106, 6), (98, 8)], fill=(200, 200, 205), outline=OUTLINE)
    d.polygon([(96, 6), (120, 10), (96, 18)], fill=team["primary"], outline=OUTLINE)

    return im

def draw_stone_slinger(side):
    # 144x112 canvas, foot at 104
    im = Image.new("RGBA", (144, 112), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    skin = (217, 162, 94)
    skin_dark = (138, 90, 44)
    fur = (77, 55, 32)
    leather = (130, 80, 40)

    # 1. Back leg braced
    d.polygon([(42, 76), (56, 76), (46, 104), (32, 104)], fill=skin_dark, outline=OUTLINE)
    # Front leg
    d.polygon([(68, 74), (82, 74), (86, 104), (72, 104)], fill=skin, outline=OUTLINE)

    # 2. Fur kilt / tunic
    d.polygon([(46, 64), (84, 64), (88, 80), (44, 82)], fill=team["primary"], outline=OUTLINE)
    d.polygon([(52, 66), (78, 66), (82, 78), (50, 78)], fill=team["dark"])
    # Ammo pouch
    d.ellipse([(44, 66), (56, 78)], fill=leather, outline=OUTLINE)

    # 3. Torso leaning back in wind-up
    d.polygon([(48, 38), (82, 42), (78, 68), (46, 66)], fill=skin, outline=OUTLINE)
    # Chest strap with team bead
    d.line([(52, 40), (76, 66)], fill=leather, width=3)
    d.ellipse([(62, 50), (68, 56)], fill=team["primary"], outline=OUTLINE)

    # 4. Head & feathered headband
    d.ellipse([(54, 16), (76, 40)], fill=skin, outline=OUTLINE)
    # Hair
    d.polygon([(50, 18), (62, 10), (74, 14), (76, 26), (52, 28)], fill=fur)
    # Team headband
    d.rectangle([(53, 22), (77, 26)], fill=team["primary"])
    # Feather
    d.polygon([(48, 4), (54, 18), (50, 22)], fill=(255, 255, 255), outline=OUTLINE)
    # Eye aimed forward
    d.rectangle([(68, 26), (72, 29)], fill=OUTLINE)

    # 5. Forward aiming left arm
    d.polygon([(78, 44), (96, 42), (106, 46), (96, 52), (78, 50)], fill=skin, outline=OUTLINE)

    # 6. Sling arm whirled back overhead
    d.polygon([(52, 42), (40, 26), (48, 16), (58, 32)], fill=skin, outline=OUTLINE)
    # Sling cord and bullet whirling forward
    d.line([(48, 18), (88, 8)], fill=(160, 120, 70), width=2)
    d.line([(88, 8), (124, 22)], fill=(160, 120, 70), width=2)
    # Leather pouch with rock projectile
    d.ellipse([(120, 18), (134, 30)], fill=leather, outline=OUTLINE)
    d.ellipse([(123, 21), (131, 27)], fill=(200, 200, 205))
    # Motion trails
    d.arc([(80, 4), (136, 40)], 220, 340, fill=rgba(team["primary"], 160), width=2)

    return im

def draw_stone_base(side):
    # 240x304 canvas, foot at 296
    im = Image.new("RGBA", (240, 304), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    rock = (110, 95, 75)
    rock_dark = (65, 55, 45)
    wood = (125, 85, 45)
    wood_dark = (70, 45, 25)

    # 1. Monolith cliff foundation
    cliff_pts = [
        (20, 296), (220, 296), (216, 210), (196, 170), (180, 130),
        (165, 90), (75, 90), (60, 130), (44, 170), (24, 210)
    ]
    d.polygon(cliff_pts, fill=rock, outline=OUTLINE, width=3)
    # Cliff rock texture cracks & strata
    d.line([(35, 250), (110, 240), (160, 245), (210, 235)], fill=rock_dark, width=3)
    d.line([(40, 190), (95, 185), (145, 180), (190, 185)], fill=rock_dark, width=3)
    d.line([(60, 140), (120, 135), (170, 140)], fill=rock_dark, width=2)

    # Carved tribal face relief on cliff face
    d.ellipse([(95, 145), (145, 195)], fill=rock_dark, outline=OUTLINE, width=2)
    # Eyes
    d.rectangle([(105, 160), (115, 166)], fill=team["primary"], outline=OUTLINE)
    d.rectangle([(125, 160), (135, 166)], fill=team["primary"], outline=OUTLINE)
    # Mouth
    d.polygon([(110, 178), (130, 178), (125, 188), (115, 188)], fill=OUTLINE)

    # 2. Wooden palisade wall & spikes
    for x in range(30, 215, 14):
        d.polygon([(x, 296), (x+10, 296), (x+8, 200), (x+5, 190), (x+2, 200)], fill=wood, outline=OUTLINE, width=2)
        d.line([(x+5, 200), (x+5, 296)], fill=wood_dark, width=1)

    # 3. Fortified gate entrance
    d.rectangle([(90, 220), (150, 296)], fill=(30, 20, 15), outline=OUTLINE, width=3)
    d.line([(90, 220), (150, 296)], fill=wood, width=3)
    d.line([(150, 220), (90, 296)], fill=wood, width=3)

    # 4. Timber watchtower platform
    d.polygon([(50, 90), (190, 90), (180, 50), (60, 50)], fill=wood, outline=OUTLINE, width=3)
    # Railings & poles
    for x in range(54, 188, 18):
        d.line([(x, 90), (x, 46)], fill=wood_dark, width=4)
    d.line([(50, 52), (190, 52)], fill=wood, width=4)

    # 5. Flaming skull braziers on posts
    for bx in [52, 188]:
        d.ellipse([(bx-8, 38), (bx+8, 52)], fill=(40, 40, 45), outline=OUTLINE)
        # Fire
        d.polygon([(bx-6, 42), (bx, 20), (bx+6, 42)], fill=(255, 140, 20))
        d.polygon([(bx-3, 40), (bx, 26), (bx+3, 40)], fill=(255, 230, 80))

    # 6. Center tribal totem mast with massive team banner
    d.rectangle([(114, 10), (126, 60)], fill=wood_dark, outline=OUTLINE, width=2)
    # Banner
    if side == "player":
        d.polygon([(126, 12), (200, 24), (126, 46)], fill=team["primary"], outline=OUTLINE, width=2)
        d.polygon([(132, 18), (180, 26), (132, 38)], fill=team["light"])
    else:
        d.polygon([(114, 12), (40, 24), (114, 46)], fill=team["primary"], outline=OUTLINE, width=2)
        d.polygon([(108, 18), (60, 26), (108, 38)], fill=team["light"])

    return im

# ==============================================================================
# MEDIEVAL AGE SPRITES
# ==============================================================================

def draw_medieval_man_at_arms(side):
    # 160x112 canvas, foot at 104
    im = Image.new("RGBA", (160, 112), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    steel = (195, 205, 220)
    steel_dark = (110, 120, 140)
    steel_bright = (240, 245, 255)
    gold = (244, 200, 91)
    chainmail = (140, 150, 165)

    # 1. Back leg in steel greaves
    d.polygon([(64, 76), (78, 76), (76, 104), (62, 104)], fill=steel_dark, outline=OUTLINE)
    # Front leg
    d.polygon([(82, 74), (98, 74), (100, 104), (84, 104)], fill=steel, outline=OUTLINE)
    d.polygon([(84, 98), (106, 98), (104, 104), (82, 104)], fill=steel_bright, outline=OUTLINE)

    # 2. Heraldic surcoat / tabard
    d.polygon([(60, 44), (104, 44), (106, 84), (58, 84)], fill=team["primary"], outline=OUTLINE, width=2)
    d.polygon([(62, 46), (82, 46), (82, 82), (60, 82)], fill=team["dark"])
    # Gold heraldic crest (lion/cross)
    d.rectangle([(76, 52), (88, 72)], fill=gold)
    d.rectangle([(70, 58), (94, 64)], fill=gold)
    # Leather belt with buckle
    d.rectangle([(60, 66), (105, 70)], fill=(70, 45, 25))
    d.rectangle([(78, 64), (86, 72)], fill=gold, outline=OUTLINE)

    # 3. Arms & Chainmail
    d.polygon([(54, 46), (64, 46), (60, 68), (50, 66)], fill=chainmail, outline=OUTLINE)
    d.polygon([(98, 44), (114, 44), (124, 62), (112, 66)], fill=steel, outline=OUTLINE)

    # 4. Heater Shield (foreground left)
    shield_pts = [(24, 42), (62, 42), (58, 78), (43, 94), (28, 78)]
    d.polygon(shield_pts, fill=steel_bright, outline=OUTLINE, width=2)
    # Inner team field
    d.polygon([(28, 46), (58, 46), (54, 74), (43, 88), (32, 74)], fill=team["primary"])
    # Shield heraldic cross
    d.rectangle([(40, 46), (46, 88)], fill=(255, 255, 255))
    d.rectangle([(30, 56), (56, 62)], fill=(255, 255, 255))

    # 5. Head & Great Helm
    # Steel helmet
    d.polygon([(72, 16), (98, 14), (102, 38), (70, 40)], fill=steel, outline=OUTLINE, width=2)
    d.line([(86, 14), (86, 40)], fill=steel_bright, width=2)
    # Visor breathing cross & slits
    d.rectangle([(78, 26), (98, 29)], fill=OUTLINE)
    d.line([(88, 22), (88, 36)], fill=gold, width=2)
    # Plume / feathers atop helm
    d.polygon([(78, 6), (92, 4), (86, 14), (74, 16)], fill=team["primary"], outline=OUTLINE)

    # 6. Gleaming steel broadsword in right hand
    # Hilt & crossguard
    d.rectangle([(116, 58), (124, 64)], fill=gold, outline=OUTLINE)
    d.rectangle([(110, 62), (130, 65)], fill=gold, outline=OUTLINE)
    # Blade pointing up and forward
    blade_pts = [(118, 12), (123, 12), (124, 62), (117, 62)]
    d.polygon(blade_pts, fill=steel_bright, outline=OUTLINE, width=2)
    d.line([(120, 14), (120, 62)], fill=steel_dark, width=1)

    return im

def draw_medieval_knight(side):
    # 192x144 canvas, foot at 136
    im = Image.new("RGBA", (192, 144), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    steel = (200, 210, 225)
    steel_dark = (115, 125, 145)
    gold = (244, 200, 91)
    horse_color = (60, 45, 35)

    # 1. Armored Warhorse legs
    d.polygon([(36, 92), (54, 92), (50, 136), (32, 136)], fill=steel_dark, outline=OUTLINE, width=2)
    d.polygon([(122, 92), (140, 92), (136, 136), (118, 136)], fill=steel_dark, outline=OUTLINE, width=2)
    # Forelegs
    d.polygon([(52, 96), (72, 96), (68, 136), (48, 136)], fill=steel, outline=OUTLINE, width=2)
    d.polygon([(136, 96), (156, 96), (152, 136), (132, 136)], fill=steel, outline=OUTLINE, width=2)
    # Steel hooves
    for hx in [32, 48, 118, 132]:
        d.rectangle([(hx, 130), (hx+20, 136)], fill=gold, outline=OUTLINE)

    # 2. Full Heraldic Horse Caparison / Barding
    barding_pts = [(28, 64), (152, 64), (156, 112), (136, 118), (92, 116), (48, 120), (24, 110)]
    d.polygon(barding_pts, fill=team["primary"], outline=OUTLINE, width=2)
    d.polygon([(32, 70), (148, 70), (144, 106), (36, 106)], fill=team["dark"])
    # Gold heraldic trim & embroidered lions
    d.line([(24, 110), (156, 112)], fill=gold, width=4)
    d.ellipse([(70, 78), (95, 102)], fill=gold, outline=OUTLINE)

    # 3. Horse head & steel chamfron
    d.polygon([(140, 36), (174, 52), (184, 76), (160, 84), (136, 68)], fill=horse_color, outline=OUTLINE)
    # Steel face plate (chamfron) with spike
    d.polygon([(148, 38), (176, 52), (170, 74), (144, 62)], fill=steel, outline=OUTLINE, width=2)
    d.polygon([(174, 50), (186, 48), (176, 54)], fill=steel_dark, outline=OUTLINE)

    # 4. Mounted Knight
    # Leg armor
    d.polygon([(78, 66), (102, 66), (98, 96), (82, 96)], fill=steel, outline=OUTLINE)
    # Torso & plate cuirass
    d.polygon([(76, 32), (112, 32), (108, 68), (74, 68)], fill=steel, outline=OUTLINE, width=2)
    d.polygon([(82, 36), (106, 36), (102, 62), (80, 62)], fill=(235, 242, 255))
    # Team sash
    d.line([(80, 32), (106, 66)], fill=team["primary"], width=6)

    # 5. Great Helm with flowing plume
    d.polygon([(84, 12), (108, 10), (112, 34), (82, 36)], fill=steel, outline=OUTLINE, width=2)
    d.rectangle([(94, 20), (110, 24)], fill=OUTLINE)
    # Huge flowing team plume
    d.polygon([(78, 4), (104, 2), (96, 14), (66, 18)], fill=team["primary"], outline=OUTLINE)
    d.polygon([(74, 8), (96, 6), (90, 14), (64, 20)], fill=team["light"])

    # 6. Heavy Jousting Lance with pennant
    d.line([(60, 70), (188, 18)], fill=(120, 80, 40), width=4)
    # Lance steel cone tip
    d.polygon([(184, 16), (192, 14), (188, 22)], fill=steel, outline=OUTLINE)
    # Flowing lance pennant
    d.polygon([(160, 28), (182, 20), (174, 38)], fill=team["primary"], outline=OUTLINE)

    return im

def draw_medieval_archer(side):
    # 144x112 canvas, foot at 104
    im = Image.new("RGBA", (144, 112), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    leather = (120, 75, 40)
    leather_dark = (70, 45, 25)
    cloth_green = (45, 75, 50)
    yew = (165, 110, 50)

    # 1. Legs
    d.polygon([(46, 76), (60, 76), (54, 104), (40, 104)], fill=cloth_green, outline=OUTLINE)
    d.polygon([(70, 74), (84, 74), (86, 104), (72, 104)], fill=cloth_green, outline=OUTLINE)
    d.rectangle([(40, 98), (56, 104)], fill=leather_dark, outline=OUTLINE)
    d.rectangle([(72, 98), (88, 104)], fill=leather_dark, outline=OUTLINE)

    # 2. Archer tunic & studded leather brigandine
    d.polygon([(48, 42), (86, 42), (90, 78), (44, 78)], fill=cloth_green, outline=OUTLINE)
    d.polygon([(52, 44), (82, 44), (80, 72), (50, 72)], fill=leather, outline=OUTLINE)
    # Team heraldic sash
    d.polygon([(56, 42), (72, 42), (84, 78), (68, 78)], fill=team["primary"])
    # Rivets/studs
    for ry in [50, 58, 66]:
        for rx in [56, 66, 76]:
            d.ellipse([(rx, ry), (rx+2, ry+2)], fill=(220, 220, 225))

    # 3. Archer Hood & Face
    d.ellipse([(54, 16), (82, 42)], fill=cloth_green, outline=OUTLINE)
    d.ellipse([(62, 22), (78, 38)], fill=(217, 162, 94))
    # Eye aiming forward
    d.rectangle([(70, 26), (74, 29)], fill=OUTLINE)
    # Team feather in cap
    d.polygon([(54, 10), (60, 22), (52, 24)], fill=team["primary"], outline=OUTLINE)

    # 4. Back Quiver with arrows
    d.polygon([(36, 32), (48, 28), (42, 62), (32, 62)], fill=leather_dark, outline=OUTLINE)
    for qx in [38, 42, 46]:
        d.line([(qx, 28), (qx-4, 16)], fill=(210, 180, 140), width=2)
        d.polygon([(qx-6, 14), (qx-2, 14), (qx-4, 18)], fill=(250, 250, 255))

    # 5. Drawn Yew Longbow & Arrow
    # Curved longbow
    d.arc([(80, 6), (134, 98)], 270, 90, fill=yew, width=4)
    # Bowstring drawn back to cheek
    d.line([(106, 8), (76, 32)], fill=(230, 230, 240), width=1)
    d.line([(76, 32), (106, 96)], fill=(230, 230, 240), width=1)
    # Steel-tipped arrow knocked and aimed forward
    d.line([(74, 32), (134, 32)], fill=(180, 140, 80), width=2)
    d.polygon([(130, 29), (138, 32), (130, 35)], fill=(210, 215, 225), outline=OUTLINE)

    return im

def draw_medieval_base(side):
    # 240x304 canvas, foot at 296
    im = Image.new("RGBA", (240, 304), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    stone = (130, 140, 155)
    stone_dark = (75, 85, 100)
    stone_light = (180, 190, 205)
    wood = (80, 50, 25)

    # 1. Heavy Stone Castle Base Keep
    d.polygon([(26, 296), (214, 296), (206, 110), (34, 110)], fill=stone, outline=OUTLINE, width=3)
    # Ashlar brickwork lines
    for y in range(120, 290, 16):
        d.line([(30, y), (210, y)], fill=stone_dark, width=2)
        offset = 12 if (y // 16) % 2 == 0 else 0
        for x in range(36 + offset, 204, 24):
            d.line([(x, y), (x, y+16)], fill=stone_dark, width=2)

    # 2. Buttresses / Flanking Towers
    for tx in [20, 180]:
        d.polygon([(tx, 296), (tx+40, 296), (tx+36, 90), (tx+4, 90)], fill=stone_light, outline=OUTLINE, width=2)
        # Crenelated top on flanking towers
        for cx in range(tx+4, tx+36, 8):
            d.rectangle([(cx, 82), (cx+4, 90)], fill=stone_light, outline=OUTLINE)

    # 3. Grand Arched Portcullis Gate
    d.rectangle([(85, 210), (155, 296)], fill=(25, 25, 30), outline=OUTLINE, width=3)
    d.arc([(85, 175), (155, 245)], 180, 360, fill=(25, 25, 30), width=3)
    # Iron portcullis lattice
    for x in range(95, 150, 10):
        d.line([(x, 190), (x, 296)], fill=(120, 125, 135), width=2)
    for y in range(210, 290, 14):
        d.line([(88, y), (152, y)], fill=(120, 125, 135), width=2)

    # 4. Upper Main Keep & Machicolations
    d.polygon([(50, 110), (190, 110), (194, 60), (46, 60)], fill=stone_light, outline=OUTLINE, width=3)
    # Main Battlements / Crenels
    for cx in range(46, 194, 16):
        d.rectangle([(cx, 48), (cx+8, 60)], fill=stone_light, outline=OUTLINE, width=2)
    # Arrow slits
    for ax in [80, 120, 160]:
        d.rectangle([(ax, 74), (ax+4, 92)], fill=OUTLINE)
        d.line([(ax-4, 82), (ax+8, 82)], fill=OUTLINE, width=2)

    # 5. Central High Tower with Fluttering Banner
    d.polygon([(90, 60), (150, 60), (146, 20), (94, 20)], fill=stone, outline=OUTLINE, width=2)
    d.rectangle([(94, 14), (146, 20)], fill=stone_dark)
    # Flagpole and Team Banner
    d.line([(120, 0), (120, 30)], fill=(200, 200, 210), width=3)
    if side == "player":
        d.polygon([(122, 2), (196, 14), (122, 28)], fill=team["primary"], outline=OUTLINE, width=2)
        d.polygon([(126, 6), (176, 14), (126, 22)], fill=team["light"])
    else:
        d.polygon([(118, 2), (44, 14), (118, 28)], fill=team["primary"], outline=OUTLINE, width=2)
        d.polygon([(114, 6), (64, 14), (114, 22)], fill=team["light"])

    return im

# ==============================================================================
# MODERN AGE SPRITES
# ==============================================================================

def draw_modern_commando(side):
    # 160x112 canvas, foot at 104
    im = Image.new("RGBA", (160, 112), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    camo_dark = (30, 45, 40)
    camo_mid = (55, 75, 65)
    vest_black = (20, 25, 25)
    gun_metal = (50, 55, 60)

    # 1. Tactical combat pants & combat boots
    d.polygon([(56, 74), (72, 74), (70, 104), (54, 104)], fill=camo_mid, outline=OUTLINE)
    d.polygon([(80, 72), (96, 72), (98, 104), (82, 104)], fill=camo_mid, outline=OUTLINE)
    # Knee pads & black boots
    d.rectangle([(54, 82), (70, 90)], fill=vest_black)
    d.rectangle([(82, 82), (98, 90)], fill=vest_black)
    d.rectangle([(52, 98), (72, 104)], fill=vest_black, outline=OUTLINE)
    d.rectangle([(82, 98), (102, 104)], fill=vest_black, outline=OUTLINE)

    # 2. Torso with Kevlar plate carrier & team patch
    d.polygon([(58, 42), (98, 42), (96, 76), (56, 76)], fill=vest_black, outline=OUTLINE, width=2)
    # Molle webbing straps
    for my in [50, 58, 66]:
        d.line([(62, my), (92, my)], fill=camo_mid, width=2)
    # Team heraldic armband / patch
    d.rectangle([(54, 46), (62, 58)], fill=team["primary"], outline=OUTLINE)
    d.rectangle([(74, 50), (84, 58)], fill=team["primary"], outline=OUTLINE)

    # 3. Ballistic Helmet & Tactical Visor
    d.ellipse([(66, 16), (96, 42)], fill=camo_dark, outline=OUTLINE, width=2)
    # Tactical HUD visor / goggles glowing team color
    d.rectangle([(78, 26), (98, 32)], fill=team["primary"], outline=OUTLINE)
    d.rectangle([(80, 27), (96, 30)], fill=team["light"])
    # Comms headset & mic
    d.arc([(68, 20), (84, 38)], 90, 270, fill=gun_metal, width=3)
    d.line([(72, 34), (82, 36)], fill=gun_metal, width=2)

    # 4. Assault Rifle with optic & muzzle
    # Stock and receiver
    d.polygon([(90, 48), (130, 46), (130, 56), (94, 60)], fill=gun_metal, outline=OUTLINE, width=2)
    # Long barrel & suppressor
    d.rectangle([(130, 48), (152, 52)], fill=(35, 35, 40), outline=OUTLINE)
    # Holo optic sight
    d.rectangle([(102, 42), (116, 46)], fill=gun_metal, outline=OUTLINE)
    d.ellipse([(108, 43), (110, 45)], fill=team["primary"])
    # Magazine
    d.polygon([(104, 56), (112, 56), (108, 68), (100, 68)], fill=vest_black, outline=OUTLINE)

    return im

def draw_modern_tank(side):
    # 192x144 canvas, foot at 136
    im = Image.new("RGBA", (192, 144), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    armor_base = (65, 80, 75)
    armor_dark = (35, 45, 40)
    armor_light = (95, 115, 105)
    tread_metal = (35, 35, 40)

    # 1. Track Assembly / Continuous Treads
    # Track perimeter
    d.polygon([(18, 112), (174, 112), (164, 136), (28, 136)], fill=tread_metal, outline=OUTLINE, width=2)
    # Road wheels (6 heavy steel wheels)
    for wx in range(36, 160, 24):
        d.ellipse([(wx-9, 116), (wx+9, 134)], fill=(80, 85, 90), outline=OUTLINE, width=2)
        d.ellipse([(wx-4, 121), (wx+4, 129)], fill=tread_metal)

    # 2. Heavy Hull Chassis with side skirts
    d.polygon([(20, 82), (170, 82), (178, 114), (16, 114)], fill=armor_base, outline=OUTLINE, width=2)
    # Reactive armor side panels
    for sx in range(26, 166, 22):
        d.rectangle([(sx, 88), (sx+18, 108)], fill=armor_dark, outline=OUTLINE)
    # Team identification stripe along hull
    d.rectangle([(24, 84), (168, 88)], fill=team["primary"])

    # 3. Low-Profile Angular Turret
    turret_pts = [(48, 52), (130, 48), (142, 80), (38, 80)]
    d.polygon(turret_pts, fill=armor_light, outline=OUTLINE, width=2)
    # Team identification chevron on turret cheek
    d.polygon([(64, 56), (82, 56), (92, 74), (74, 74)], fill=team["primary"], outline=OUTLINE)
    d.polygon([(70, 60), (80, 60), (86, 70), (76, 70)], fill=team["light"])

    # 4. Long High-Velocity Main Battle Cannon
    # Mantlet
    d.rectangle([(132, 58), (146, 72)], fill=armor_dark, outline=OUTLINE, width=2)
    # Long barrel
    d.rectangle([(146, 62), (188, 68)], fill=armor_dark, outline=OUTLINE, width=2)
    # Bore evacuator
    d.rectangle([(160, 60), (174, 70)], fill=armor_light, outline=OUTLINE)
    # Muzzle brake
    d.rectangle([(186, 59), (190, 71)], fill=(30, 30, 35), outline=OUTLINE)

    # 5. Commander cupola & antenna
    d.rectangle([(62, 44), (80, 52)], fill=armor_dark, outline=OUTLINE)
    d.line([(58, 48), (44, 20)], fill=(120, 130, 135), width=2)
    d.ellipse([(42, 18), (46, 22)], fill=team["primary"])

    return im

def draw_modern_sniper(side):
    # 144x112 canvas, foot at 104
    im = Image.new("RGBA", (144, 112), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    camo_dark = (35, 45, 35)
    camo_mid = (65, 80, 60)
    gun_metal = (35, 40, 45)

    # 1. Prone / braced sniper legs
    d.polygon([(24, 94), (66, 92), (64, 104), (20, 104)], fill=camo_dark, outline=OUTLINE)
    d.rectangle([(18, 98), (28, 104)], fill=(20, 20, 25))

    # 2. Ghillie Mantle / Textured Camouflage Cape
    ghillie_pts = [(40, 60), (92, 58), (96, 96), (36, 98)]
    d.polygon(ghillie_pts, fill=camo_mid, outline=OUTLINE, width=2)
    # Shaggy ghillie strips
    for gx in range(40, 92, 6):
        d.line([(gx, 70), (gx-4, 86)], fill=camo_dark, width=3)
        d.line([(gx+2, 76), (gx+6, 92)], fill=(90, 115, 80), width=2)

    # 3. Head with tactical ghillie hood & beret
    d.ellipse([(58, 38), (86, 64)], fill=camo_dark, outline=OUTLINE)
    # Team beret / optical eye lens
    d.rectangle([(62, 40), (84, 46)], fill=team["primary"], outline=OUTLINE)
    d.ellipse([(76, 48), (82, 54)], fill=team["light"], outline=OUTLINE)

    # 4. Anti-Material Heavy Sniper Rifle
    # Receiver and stock resting against shoulder
    d.polygon([(78, 62), (134, 60), (134, 72), (80, 74)], fill=gun_metal, outline=OUTLINE, width=2)
    # Bipod legs grounded on lane (y=104)
    d.line([(118, 70), (110, 104)], fill=gun_metal, width=2)
    d.line([(118, 70), (126, 104)], fill=gun_metal, width=2)
    # Massive heavy barrel and muzzle suppressor
    d.rectangle([(134, 63), (142, 67)], fill=gun_metal, outline=OUTLINE)
    # High-magnification optical scope with team glint
    d.rectangle([(88, 54), (116, 60)], fill=gun_metal, outline=OUTLINE)
    d.ellipse([(112, 55), (116, 59)], fill=team["primary"])

    return im

def draw_modern_base(side):
    # 240x304 canvas, foot at 296
    im = Image.new("RGBA", (240, 304), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    team = TEAMS[side]

    concrete = (90, 105, 115)
    concrete_dark = (55, 65, 75)
    concrete_light = (135, 155, 170)
    steel = (40, 45, 55)

    # 1. Reinforced Concrete Command Bunker
    bunker_pts = [(24, 296), (216, 296), (200, 120), (40, 120)]
    d.polygon(bunker_pts, fill=concrete, outline=OUTLINE, width=3)
    # Heavy armor plating lines
    d.line([(36, 170), (204, 170)], fill=concrete_dark, width=3)
    d.line([(32, 230), (208, 230)], fill=concrete_dark, width=3)

    # 2. Hardened Blast Doors (Entrance)
    d.rectangle([(85, 205), (155, 296)], fill=steel, outline=OUTLINE, width=3)
    # Hazard stripes
    for hy in range(215, 290, 16):
        d.line([(88, hy), (105, hy+12)], fill=(244, 200, 50), width=4)
        d.line([(135, hy), (152, hy+12)], fill=(244, 200, 50), width=4)
    # Hydraulic locking wheel
    d.ellipse([(110, 240), (130, 260)], fill=(120, 130, 140), outline=OUTLINE, width=2)

    # 3. Observation Slits with bulletproof polarized glass (glowing team color)
    for ox in [54, 100, 146]:
        d.rectangle([(ox, 140), (ox+38, 150)], fill=team["primary"], outline=OUTLINE, width=2)
        d.line([(ox+2, 142), (ox+36, 142)], fill=team["light"], width=2)

    # 4. Upper Helipad / Observation Deck
    d.polygon([(46, 120), (194, 120), (184, 80), (56, 80)], fill=concrete_light, outline=OUTLINE, width=3)
    # Team identification insignia on roof facade
    d.rectangle([(80, 88), (160, 112)], fill=team["primary"], outline=OUTLINE, width=2)
    d.rectangle([(84, 92), (156, 108)], fill=team["dark"])

    # 5. Communications Mast & Spinning Radar Dome
    # Rotating radar dome
    d.ellipse([(60, 50), (110, 80)], fill=(220, 225, 235), outline=OUTLINE, width=2)
    d.ellipse([(70, 58), (100, 72)], fill=team["primary"], outline=OUTLINE)
    # Tall communications antenna array
    d.line([(150, 80), (150, 10)], fill=(180, 185, 195), width=3)
    for ay in [25, 45, 65]:
        d.line([(136, ay), (164, ay)], fill=(180, 185, 195), width=2)
    # Flashing beacon light on tip
    d.ellipse([(146, 6), (154, 14)], fill=(255, 60, 60), outline=OUTLINE)

    return im

# ==============================================================================
# MAIN BUILD DISPATCHER
# ==============================================================================

SPRITE_BUILDERS = {
    ("stone", "swarm"): draw_stone_clubber,
    ("stone", "tank"): draw_stone_mammoth,
    ("stone", "ranged"): draw_stone_slinger,
    ("medieval", "swarm"): draw_medieval_man_at_arms,
    ("medieval", "tank"): draw_medieval_knight,
    ("medieval", "ranged"): draw_medieval_archer,
    ("modern", "swarm"): draw_modern_commando,
    ("modern", "tank"): draw_modern_tank,
    ("modern", "ranged"): draw_modern_sniper,
}

BASE_BUILDERS = {
    "stone": draw_stone_base,
    "medieval": draw_medieval_base,
    "modern": draw_modern_base,
}

def main():
    print("Building high-resolution 2D raster sprites...")
    # 1. Units (18 sprites)
    for (age, role), builder in SPRITE_BUILDERS.items():
        for side in ["player", "ai"]:
            im = builder(side)
            fn = f"unit_{age}_{role}_{side}.png"
            p = os.path.join(UNITS_DIR, fn)
            im.save(p, "PNG")
            print(f"  {fn:30s} {im.size[0]}x{im.size[1]}")

    # 2. Bases (6 sprites)
    for age, builder in BASE_BUILDERS.items():
        for side in ["player", "ai"]:
            im = builder(side)
            fn = f"base_{age}_{side}.png"
            p = os.path.join(BASES_DIR, fn)
            im.save(p, "PNG")
            print(f"  {fn:30s} {im.size[0]}x{im.size[1]}")

    print("Sprite generation complete!")

if __name__ == "__main__":
    main()
