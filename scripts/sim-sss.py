import math

def calc_score(volume, dc, ratio, cpc, intent, commercial=False, blueOcean=False, single_generic=False):
    logRatio = math.log1p(min(ratio, 1000))
    if logRatio >= 5.0: sd = 100
    elif logRatio >= 3.0: sd = 80 + (logRatio - 3.0) * 10
    elif logRatio >= 1.8: sd = 55 + (logRatio - 1.8) * 20.8
    elif logRatio >= 1.0: sd = 30 + (logRatio - 1.0) * 31
    elif logRatio >= 0.5: sd = 10 + (logRatio - 0.5) * 40
    else: sd = logRatio * 20
    sd = min(100, sd)
    if volume >= 50000: vol = 100
    elif volume >= 10000: vol = 80 + (volume - 10000) * 0.0005
    elif volume >= 5000: vol = 65 + (volume - 5000) * 0.003
    elif volume >= 1000: vol = 40 + (volume - 1000) * 0.00625
    elif volume >= 300: vol = 15 + (volume - 300) * 0.036
    else: vol = volume * 0.05
    vol = min(100, vol)
    if cpc >= 2000: cpcScore = 100
    elif cpc >= 1000: cpcScore = 70 + (cpc - 1000) * 0.03
    elif cpc >= 500: cpcScore = 40 + (cpc - 500) * 0.06
    elif cpc >= 200: cpcScore = 15 + (cpc - 200) * 0.083
    else: cpcScore = cpc * 0.075
    cpcScore = min(100, cpcScore)
    monetization = cpcScore * 0.5 + intent * 0.5
    if dc > 50000: dp = 30
    elif dc > 20000: dp = 20
    elif dc > 10000: dp = 10
    elif dc > 5000: dp = 5
    else: dp = 0
    comp = max(0, 100 - dp)
    base = sd*0.45 + vol*0.25 + monetization*0.15 + comp*0.15
    mul = 1.0
    if commercial: mul *= 1.15
    if blueOcean: mul *= 1.20
    if cpc >= 2000: mul *= 1.08
    if single_generic: mul *= 0.85
    final = round(min(100, max(0, base*mul)))
    return (round(sd,1), round(vol,1), round(cpcScore,1), round(monetization,1), comp, round(base,2), round(mul,3), final)

cases = [
    ('gangnam-matzip-chuchun',     3000,  8000, 0.375,  500, 8, True),
    ('gongmuwon-sihum-iljung',     5000, 12000, 0.42,   300, 5, False),
    ('chika-implant-gagyek-bigyo', 1500,  4000, 0.375, 8000, 9, True),
    ('gangaji-sayro-chuchun',      8000, 15000, 0.53,  1500, 8, True),
    ('diet-bojojae-hugi',          2500,  6000, 0.42,  2500, 9, True),
]

print('keyword | sd | vol | cpcS | mon | comp | base | mul | final')
for kw, sv, dc, r, cpc, it, com in cases:
    s = calc_score(sv, dc, r, cpc, it, com, False)
    print(f'{kw} | {s[0]} | {s[1]} | {s[2]} | {s[3]} | {s[4]} | {s[5]} | {s[6]} | {s[7]}')

print()
print('=== sd by ratio (Korean range) ===')
for r in [0.3, 0.4, 0.5, 0.7, 1.0, 1.5, 2.0, 3.0, 5.0, 10.0]:
    lr = math.log1p(r)
    if lr >= 1.8: sd = 55 + (lr - 1.8)*20.8
    elif lr >= 1.0: sd = 30 + (lr - 1.0)*31
    elif lr >= 0.5: sd = 10 + (lr - 0.5)*40
    else: sd = lr * 20
    print(f'ratio={r}  logRatio={round(lr,3)}  sd={round(sd,1)}')
